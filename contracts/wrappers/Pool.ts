// ─────────────────────────────────────────────────────────────────────────
// wrappers/Pool.ts — TypeScript-обёртка для контракта Pool
//
// Opcodes соответствуют явным значениям в Pool.tact (message(0x0101) и т.д.).
// После `npm run build` Blueprint сгенерирует полную обёртку — этот файл
// можно заменить на build/Pool_Pool.ts, либо использовать напрямую.
// ─────────────────────────────────────────────────────────────────────────

import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    toNano,
    TupleBuilder,
} from '@ton/core';

// ── Opcodes (из Pool.tact message(0x01xx)) ────────────────────────────────
export const PoolOpcodes = {
    Payout:           0x0101,
    ChangeBackend:    0x0102,
    EmergencyWithdraw: 0x0103,
} as const;

// ── Типы параметров ───────────────────────────────────────────────────────

export type PoolInit = {
    owner:   Address;
    backend: Address;
};

export type PayoutParams = {
    seqno:      number;     // текущий nextSeqno из геттера
    recipient:  Address;    // кошелёк игрока
    amountNano: bigint;     // сумма в нано-TON
    paymentId:  bigint;     // ID из withdrawal_queue
};

export type ChangeBackendParams = {
    newBackend: Address;
};

export type EmergencyWithdrawParams = {
    amountNano: bigint;
};

export type PoolConfigResult = {
    owner:           Address;
    backend:         Address;
    adminFeePercent: number;
    seqno:           number;
};

// ── Сериализация состояния контракта (init data) ──────────────────────────
//
// Порядок полей в init() из Pool.tact:
//   owner           → address
//   backend         → address
//   seqno           → uint32
//   adminFeePercent → uint8
//
// Tact хранит поля в порядке объявления; используем TLB-формат TON.
function buildPoolInitData(cfg: PoolInit): Cell {
    // Tact lazy-init format: 1-bit prefix (0) + constructor args only.
    // The contract's init() function sets seqno=0 and adminFeePercent=10 automatically.
    return beginCell()
        .storeUint(0, 1)        // Tact lazy-init flag
        .storeAddress(cfg.owner)
        .storeAddress(cfg.backend)
        .endCell();
}

// ── Основной класс враппера ───────────────────────────────────────────────

export class Pool implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    // Создать из адреса (для взаимодействия с уже задеплоенным контрактом)
    static createFromAddress(address: Address): Pool {
        return new Pool(address);
    }

    // Создать с начальным состоянием (для деплоя)
    static createFromConfig(config: PoolInit, code: Cell, workchain = 0): Pool {
        const data    = buildPoolInitData(config);
        const init    = { code, data };
        const address = contractAddress(workchain, init);
        return new Pool(address, init);
    }

    // ── Deploy ────────────────────────────────────────────────────────────
    async sendDeploy(
        provider: ContractProvider,
        via:      Sender,
        value:    bigint,
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body:     beginCell().endCell(),
        });
    }

    // ── Deposit: пополнение пула ──────────────────────────────────────────
    // Отправляет plain TON — контракт авто-сплитит 10/90.
    async sendDeposit(
        provider: ContractProvider,
        via:      Sender,
        value:    bigint,
    ): Promise<void> {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body:     beginCell().endCell(),
        });
    }

    // ── Payout: выплата игроку ────────────────────────────────────────────
    // gasValue ≈ 0.05 TON покрывает обработку + исходящие транзакции.
    async sendPayout(
        provider: ContractProvider,
        via:      Sender,
        params:   PayoutParams,
        gasValue: bigint = toNano('0.05'),
    ): Promise<void> {
        const body = beginCell()
            .storeUint(PoolOpcodes.Payout, 32)
            .storeUint(params.seqno, 32)
            .storeAddress(params.recipient)
            .storeCoins(params.amountNano)
            .storeUint(params.paymentId, 64)
            .endCell();

        await provider.internal(via, {
            value:    gasValue,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    // ── ChangeBackend ─────────────────────────────────────────────────────
    async sendChangeBackend(
        provider: ContractProvider,
        via:      Sender,
        params:   ChangeBackendParams,
        gasValue: bigint = toNano('0.05'),
    ): Promise<void> {
        const body = beginCell()
            .storeUint(PoolOpcodes.ChangeBackend, 32)
            .storeAddress(params.newBackend)
            .endCell();

        await provider.internal(via, {
            value:    gasValue,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    // ── EmergencyWithdraw ─────────────────────────────────────────────────
    async sendEmergencyWithdraw(
        provider: ContractProvider,
        via:      Sender,
        params:   EmergencyWithdrawParams,
        gasValue: bigint = toNano('0.05'),
    ): Promise<void> {
        const body = beginCell()
            .storeUint(PoolOpcodes.EmergencyWithdraw, 32)
            .storeCoins(params.amountNano)
            .endCell();

        await provider.internal(via, {
            value:    gasValue,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    // ── Геттеры ───────────────────────────────────────────────────────────

    async getBalance(provider: ContractProvider): Promise<bigint> {
        const state = await provider.getState();
        return state.balance;
    }

    async getNextSeqno(provider: ContractProvider): Promise<number> {
        const result = await provider.get('nextSeqno', []);
        return result.stack.readNumber();
    }

    async getConfig(provider: ContractProvider): Promise<PoolConfigResult> {
        const result = await provider.get('config', []);
        const stack  = result.stack;
        return {
            owner:           stack.readAddress(),
            backend:         stack.readAddress(),
            adminFeePercent: stack.readNumber(),
            seqno:           stack.readNumber(),
        };
    }
}
