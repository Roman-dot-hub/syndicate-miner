// ─────────────────────────────────────────────────────────────────────────
// workers/payoutWorker.ts — обрабатывает очередь выплат через Pool контракт
//
// Запускается из dailyCron.ts каждые 2 минуты.
//
// Алгоритм:
//   1. Читает pending-записи из withdrawal_queue (FIFO, по одной).
//   2. Получает nextSeqno с контракта (через TON HTTP API).
//   3. Отправляет Payout-сообщение в Pool контракт.
//   4. Ждёт подтверждения транзакции (до 60 сек).
//   5. Обновляет статус записи: done/failed + сохраняет tx_hash.
//
// Требования в backend/.env:
//   BACKEND_WALLET_MNEMONIC  — 24 слова кошелька backend
//   POOL_CONTRACT_ADDRESS    — адрес задеплоенного Pool контракта
//   TON_ENDPOINT             — https://testnet.toncenter.com/api/v2/
// ─────────────────────────────────────────────────────────────────────────

import { Pool as PgPool } from 'pg';
import { pgPoolConfig }   from '../db/client';

import { TonClient, WalletContractV4, internal, SendMode } from '@ton/ton';
import { mnemonicToPrivateKey }                             from '@ton/crypto';
import { Address, toNano, beginCell }                       from '@ton/core';

// ── Конфиг ────────────────────────────────────────────────────────────────

const TON_ENDPOINT         = process.env.TON_ENDPOINT         ?? 'https://testnet.toncenter.com/api/v2/';
const POOL_CONTRACT_ADDRESS = process.env.POOL_CONTRACT_ADDRESS ?? '';
const BACKEND_MNEMONIC      = process.env.BACKEND_WALLET_MNEMONIC ?? '';
const MAX_BATCH             = 5;    // максимум выплат за один проход
const CONFIRM_TIMEOUT_MS    = 60_000;  // 60 сек на подтверждение транзакции
const GAS_PER_PAYOUT        = toNano('0.05');  // газ на обработку Payout

// Opcodes из Pool.tact (явные message(0x0101))
const PAYOUT_OPCODE = 0x0101;

// ── DB ────────────────────────────────────────────────────────────────────

const db = new PgPool(pgPoolConfig);

interface WithdrawalRecord {
    id:             bigint;
    user_id:        string;
    net_amount_ton: string;  // decimal строка
    wallet_address: string;
    status:         string;
}

async function fetchPendingWithdrawals(limit: number): Promise<WithdrawalRecord[]> {
    const { rows } = await db.query<WithdrawalRecord>(`
        SELECT id, user_id, net_amount_ton, wallet_address, status
        FROM   withdrawal_queue
        WHERE  status = 'pending'
        ORDER  BY created_at ASC
        LIMIT  $1
        FOR    UPDATE SKIP LOCKED
    `, [limit]);
    return rows;
}

async function markProcessing(ids: bigint[]): Promise<void> {
    await db.query(
        `UPDATE withdrawal_queue SET status = 'processing' WHERE id = ANY($1)`,
        [ids.map(String)],
    );
}

async function markDone(id: bigint, txHash: string): Promise<void> {
    await db.query(`
        UPDATE withdrawal_queue
        SET    status = 'done', tx_hash = $1, processed_at = NOW()
        WHERE  id = $2
    `, [txHash, String(id)]);
}

async function markFailed(id: bigint, reason: string): Promise<void> {
    // Возвращаем pending для ретрая (или ставим failed окончательно)
    await db.query(`
        UPDATE withdrawal_queue
        SET    status = 'failed', tx_hash = $1, processed_at = NOW()
        WHERE  id = $2
    `, [`ERR: ${reason}`, String(id)]);

    // Возвращаем TON на баланс пользователя (компенсация)
    const { rows: [wq] } = await db.query(
        `SELECT user_id, amount_ton FROM withdrawal_queue WHERE id = $1`, [String(id)],
    );
    if (wq) {
        await db.query(
            `UPDATE users SET ton_balance = ton_balance + $1 WHERE id = $2`,
            [wq.amount_ton, wq.user_id],
        );
        console.warn(`[PayoutWorker] Возврат ${wq.amount_ton} TON пользователю ${wq.user_id} (id=${id})`);
    }
}

// ── TON-клиент ────────────────────────────────────────────────────────────

async function buildTonClient() {
    if (!BACKEND_MNEMONIC) throw new Error('BACKEND_WALLET_MNEMONIC не задан в .env');
    if (!POOL_CONTRACT_ADDRESS) throw new Error('POOL_CONTRACT_ADDRESS не задан в .env');

    const client  = new TonClient({ endpoint: TON_ENDPOINT });
    const words   = BACKEND_MNEMONIC.trim().split(/\s+/);
    const keyPair = await mnemonicToPrivateKey(words);

    const wallet   = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const contract = client.open(wallet);

    return { client, wallet, contract, keyPair };
}

// Читает nextSeqno с Pool контракта через get-метод
async function getPoolNextSeqno(client: TonClient, poolAddress: Address): Promise<number> {
    const result = await client.runMethod(poolAddress, 'nextSeqno');
    return result.stack.readNumber();
}

// Ждёт, пока транзакция появится в блокчейне (polling)
async function waitForTx(
    client:   TonClient,
    address:  Address,
    prevLt:   string,
    timeoutMs = CONFIRM_TIMEOUT_MS,
): Promise<string | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        await sleep(3000);
        const txs = await client.getTransactions(address, { limit: 3 });
        if (txs.length > 0 && txs[0].lt.toString() !== prevLt) {
            return txs[0].hash().toString('hex');
        }
    }
    return null;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Сборка тела сообщения Payout ─────────────────────────────────────────

function buildPayoutBody(
    seqno:      number,
    recipient:  Address,
    amountNano: bigint,
    paymentId:  bigint,
) {
    return beginCell()
        .storeUint(PAYOUT_OPCODE, 32)
        .storeUint(seqno, 32)
        .storeAddress(recipient)
        .storeCoins(amountNano)
        .storeUint(paymentId, 64)
        .endCell();
}

// ── Основная функция воркера ──────────────────────────────────────────────

export async function processWithdrawals(): Promise<void> {
    if (!POOL_CONTRACT_ADDRESS) {
        console.log('[PayoutWorker] POOL_CONTRACT_ADDRESS не задан — пропускаем');
        return;
    }

    const client = await db.connect();
    let pendings: WithdrawalRecord[] = [];

    try {
        await client.query('BEGIN');
        pendings = await (async () => {
            const { rows } = await client.query<WithdrawalRecord>(`
                SELECT id, user_id, net_amount_ton, wallet_address
                FROM   withdrawal_queue
                WHERE  status = 'pending'
                ORDER  BY created_at ASC
                LIMIT  $1
                FOR    UPDATE SKIP LOCKED
            `, [MAX_BATCH]);
            return rows;
        })();

        if (pendings.length === 0) {
            await client.query('COMMIT');
            return;
        }

        // Помечаем как processing
        await client.query(
            `UPDATE withdrawal_queue SET status = 'processing' WHERE id = ANY($1)`,
            [pendings.map(p => p.id.toString())],
        );
        await client.query('COMMIT');

    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    console.log(`[PayoutWorker] Обрабатываем ${pendings.length} выплат...`);

    // ── TON-соединение ────────────────────────────────────────────────────
    let tonClient: TonClient;
    let walletContract: ReturnType<typeof WalletContractV4.create>;
    let openedWallet:   Awaited<ReturnType<typeof buildTonClient>>['contract'];
    let keyPair:        Awaited<ReturnType<typeof mnemonicToPrivateKey>>;

    try {
        const built = await buildTonClient();
        tonClient      = built.client;
        walletContract = built.wallet;
        openedWallet   = built.contract;
        keyPair        = built.keyPair;
    } catch (err) {
        console.error('[PayoutWorker] Не удалось инициализировать TON-кошелёк:', err);
        // Возвращаем все записи в pending
        await db.query(
            `UPDATE withdrawal_queue SET status = 'pending' WHERE id = ANY($1)`,
            [pendings.map(p => p.id.toString())],
        );
        return;
    }

    const poolAddress = Address.parse(POOL_CONTRACT_ADDRESS);

    // ── Обрабатываем по одной (seqno строго последовательный) ─────────────
    for (const wq of pendings) {
        try {
            const amountNano = BigInt(Math.round(parseFloat(wq.net_amount_ton) * 1_000_000_000));
            const recipient  = Address.parse(wq.wallet_address);

            // Читаем nextSeqno с контракта
            const seqno = await getPoolNextSeqno(tonClient, poolAddress);

            // Последний lt кошелька (для отслеживания подтверждения)
            const walletTxs = await tonClient.getTransactions(openedWallet.address, { limit: 1 });
            const prevLt    = walletTxs[0]?.lt.toString() ?? '0';

            // Получаем seqno кошелька backend
            const walletSeqno = await openedWallet.getSeqno();

            // Строим и отправляем транзакцию
            await openedWallet.sendTransfer({
                secretKey: keyPair.secretKey,
                seqno:     walletSeqno,
                sendMode:  SendMode.PAY_GAS_SEPARATELY,
                messages:  [
                    internal({
                        to:    poolAddress,
                        value: GAS_PER_PAYOUT,
                        body:  buildPayoutBody(seqno, recipient, amountNano, BigInt(wq.id)),
                    }),
                ],
            });

            console.log(
                `[PayoutWorker] Отправлен Payout id=${wq.id} ` +
                `${wq.net_amount_ton} TON → ${wq.wallet_address} (seqno=${seqno})`,
            );

            // Ждём подтверждения
            const txHash = await waitForTx(tonClient, openedWallet.address, prevLt);

            if (txHash) {
                await markDone(BigInt(wq.id), txHash);
                console.log(`[PayoutWorker] ✅ Выплата id=${wq.id} подтверждена: ${txHash}`);
            } else {
                // Timeout — пометим как failed для ручной проверки
                await markFailed(BigInt(wq.id), 'timeout waiting for confirmation');
                console.error(`[PayoutWorker] ⏰ Timeout для id=${wq.id}`);
            }

            // Пауза между транзакциями (seqno должен обновиться)
            await sleep(5000);

        } catch (err) {
            console.error(`[PayoutWorker] ❌ Ошибка при выплате id=${wq.id}:`, err);
            await markFailed(BigInt(wq.id), String(err));
        }
    }
}
