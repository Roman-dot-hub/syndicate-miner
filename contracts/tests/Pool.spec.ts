// ─────────────────────────────────────────────────────────────────────────
// tests/Pool.spec.ts — Sandbox-тесты для контракта Pool
// Запуск: npx jest --forceExit
// ─────────────────────────────────────────────────────────────────────────

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano }                                   from '@ton/core';
import { Pool }                                           from '../wrappers/Pool';
import '@ton/test-utils';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const compiled = require('../build/Pool.compiled.json');

describe('Pool', () => {
    let code:    Cell;
    let chain:   Blockchain;
    let owner:   SandboxContract<TreasuryContract>;
    let backend: SandboxContract<TreasuryContract>;
    let player:  SandboxContract<TreasuryContract>;
    let pool:    SandboxContract<Pool>;

    // ── Загружаем pre-compiled артефакт (быстро, без повторной компиляции) ──
    beforeAll(() => {
        code = Cell.fromHex(compiled.hex);
    });

    // ── Новый экземпляр перед каждым тестом ──────────────────────────────
    beforeEach(async () => {
        chain   = await Blockchain.create();
        owner   = await chain.treasury('owner');
        backend = await chain.treasury('backend');
        player  = await chain.treasury('player');

        pool = chain.openContract(
            Pool.createFromConfig(
                { owner: owner.address, backend: backend.address },
                code,
            ),
        );

        // Деплой с начальным депозитом 10 TON
        const deployResult = await pool.sendDeploy(owner.getSender(), toNano('10'));
        expect(deployResult.transactions).toHaveTransaction({
            from:    owner.address,
            to:      pool.address,
            deploy:  true,
            success: true,
        });
    });

    // ═════════════════════════════════════════════════════════════════════
    // 1. ДЕПЛОЙ
    // ═════════════════════════════════════════════════════════════════════

    it('deploys and initialises state', async () => {
        const cfg = await pool.getConfig();
        expect(cfg.owner.toString()).toBe(owner.address.toString());
        expect(cfg.backend.toString()).toBe(backend.address.toString());
        expect(cfg.adminFeePercent).toBe(10);
        expect(cfg.seqno).toBe(0);
    });

    // ═════════════════════════════════════════════════════════════════════
    // 2. DEPOSIT — авто-сплит 10/90
    // ═════════════════════════════════════════════════════════════════════

    it('splits deposit: 10% to owner, 90% stays in pool', async () => {
        const poolBefore = await pool.getBalance();
        const deposit    = toNano('1');

        const result = await pool.sendDeposit(player.getSender(), deposit);

        expect(result.transactions).toHaveTransaction({
            from:    player.address,
            to:      pool.address,
            success: true,
        });

        // 10% отправлено owner
        expect(result.transactions).toHaveTransaction({
            from:  pool.address,
            to:    owner.address,
            value: (v) => v !== undefined && v >= toNano('0.09') && v <= toNano('0.11'),
        });

        // Контракт вырос примерно на 90%
        const poolAfter = await pool.getBalance();
        expect(poolAfter).toBeGreaterThan(poolBefore + toNano('0.85'));
    });

    it('ignores dust deposits (< 0.05 TON)', async () => {
        const poolBefore = await pool.getBalance();
        await pool.sendDeposit(player.getSender(), toNano('0.02'));
        const poolAfter = await pool.getBalance();
        // Никакого сплита — изменение только на gas
        expect(poolAfter - poolBefore).toBeLessThan(toNano('0.02'));
    });

    // ═════════════════════════════════════════════════════════════════════
    // 3. PAYOUT — выплата игроку через backend
    // ═════════════════════════════════════════════════════════════════════

    it('backend sends payout to player', async () => {
        const seqno = await pool.getNextSeqno();

        const result = await pool.sendPayout(
            backend.getSender(),
            {
                seqno,
                recipient:  player.address,
                amountNano: toNano('1'),
                paymentId:  42n,
            },
        );

        // Exact match would fail — sandbox deducts forward fees from outgoing value
        expect(result.transactions).toHaveTransaction({
            from:    pool.address,
            to:      player.address,
            value:   (v) => v !== undefined && v >= toNano('0.99'),
            success: true,
        });

        // seqno увеличился
        const seqnoAfter = await pool.getNextSeqno();
        expect(seqnoAfter).toBe(seqno + 1);
    });

    it('rejects payout from non-backend address', async () => {
        const seqno  = await pool.getNextSeqno();
        const result = await pool.sendPayout(
            owner.getSender(),  // owner ≠ backend
            { seqno, recipient: player.address, amountNano: toNano('1'), paymentId: 1n },
        );

        expect(result.transactions).toHaveTransaction({
            from:    owner.address,
            to:      pool.address,
            success: false,
        });
    });

    it('rejects payout with wrong seqno', async () => {
        const seqno  = await pool.getNextSeqno();
        const result = await pool.sendPayout(
            backend.getSender(),
            { seqno: seqno + 1, recipient: player.address, amountNano: toNano('1'), paymentId: 1n },
        );

        expect(result.transactions).toHaveTransaction({
            from:    backend.address,
            to:      pool.address,
            success: false,
        });
    });

    it('rejects payout that would drain pool below MIN_RESERVE (0.3 TON)', async () => {
        const balance = await pool.getBalance();
        const seqno   = await pool.getNextSeqno();

        // Пытаемся вывести весь баланс
        const result = await pool.sendPayout(
            backend.getSender(),
            { seqno, recipient: player.address, amountNano: balance, paymentId: 1n },
        );

        expect(result.transactions).toHaveTransaction({
            from:    backend.address,
            to:      pool.address,
            success: false,
        });
    });

    it('prevents replay: same seqno rejected after success', async () => {
        const seqno = await pool.getNextSeqno();

        // Первая выплата — успех
        await pool.sendPayout(
            backend.getSender(),
            { seqno, recipient: player.address, amountNano: toNano('0.5'), paymentId: 1n },
        );

        // Повторная с тем же seqno — отказ
        const replay = await pool.sendPayout(
            backend.getSender(),
            { seqno, recipient: player.address, amountNano: toNano('0.5'), paymentId: 1n },
        );

        expect(replay.transactions).toHaveTransaction({
            from:    backend.address,
            to:      pool.address,
            success: false,
        });
    });

    // ═════════════════════════════════════════════════════════════════════
    // 4. CHANGE BACKEND
    // ═════════════════════════════════════════════════════════════════════

    it('owner can change backend address', async () => {
        const newBackend = await chain.treasury('newBackend');

        await pool.sendChangeBackend(
            owner.getSender(),
            { newBackend: newBackend.address },
        );

        const cfg = await pool.getConfig();
        expect(cfg.backend.toString()).toBe(newBackend.address.toString());
    });

    it('non-owner cannot change backend', async () => {
        const result = await pool.sendChangeBackend(
            player.getSender(),
            { newBackend: player.address },
        );

        expect(result.transactions).toHaveTransaction({
            from:    player.address,
            to:      pool.address,
            success: false,
        });
    });

    // ═════════════════════════════════════════════════════════════════════
    // 5. EMERGENCY WITHDRAW
    // ═════════════════════════════════════════════════════════════════════

    it('owner can emergency withdraw', async () => {
        const result = await pool.sendEmergencyWithdraw(
            owner.getSender(),
            { amountNano: toNano('5') },
        );

        expect(result.transactions).toHaveTransaction({
            from:    pool.address,
            to:      owner.address,
            value:   (v) => v !== undefined && v >= toNano('4.99'),
            success: true,
        });
    });

    it('non-owner cannot emergency withdraw', async () => {
        const result = await pool.sendEmergencyWithdraw(
            player.getSender(),
            { amountNano: toNano('1') },
        );

        expect(result.transactions).toHaveTransaction({
            from:    player.address,
            to:      pool.address,
            success: false,
        });
    });
});
