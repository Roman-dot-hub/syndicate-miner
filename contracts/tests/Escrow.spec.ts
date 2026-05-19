// ─────────────────────────────────────────────────────────────────────────
// tests/Escrow.spec.ts — Sandbox-тесты для контракта Escrow
// ─────────────────────────────────────────────────────────────────────────

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano }                                   from '@ton/core';
import { Escrow, DealStatus }                             from '../wrappers/Escrow';
import '@ton/test-utils';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const compiled = require('../build/Escrow.compiled.json');

describe('Escrow', () => {
    let code:      Cell;
    let chain:     Blockchain;
    let owner:     SandboxContract<TreasuryContract>;
    let feeWallet: SandboxContract<TreasuryContract>;
    let seller:    SandboxContract<TreasuryContract>;
    let buyer:     SandboxContract<TreasuryContract>;
    let escrow:    SandboxContract<Escrow>;

    const DEAL_ID    = 1001n;
    const DEAL_PRICE = toNano('5');  // 5 TON

    beforeAll(() => {
        code = Cell.fromHex(compiled.hex);
    });

    beforeEach(async () => {
        chain     = await Blockchain.create();
        owner     = await chain.treasury('owner');
        feeWallet = await chain.treasury('feeWallet');
        seller    = await chain.treasury('seller');
        buyer     = await chain.treasury('buyer');

        escrow = chain.openContract(
            Escrow.createFromConfig(
                { owner: owner.address, feeWallet: feeWallet.address },
                code,
            ),
        );

        // Деплой
        const result = await escrow.sendDeploy(owner.getSender());
        expect(result.transactions).toHaveTransaction({
            to:      escrow.address,
            deploy:  true,
            success: true,
        });
    });

    // ═════════════════════════════════════════════════════════════════════
    // 1. ДЕПЛОЙ
    // ═════════════════════════════════════════════════════════════════════

    it('deploys with correct config', async () => {
        const cfg = await escrow.getConfig();
        expect(cfg.owner.toString()).toBe(owner.address.toString());
        expect(cfg.feeWallet.toString()).toBe(feeWallet.address.toString());
        expect(cfg.feeNum).toBe(5);
        expect(cfg.feeDenom).toBe(100);
        expect(cfg.dealCount).toBe(0);
    });

    // ═════════════════════════════════════════════════════════════════════
    // 2. CREATE DEAL
    // ═════════════════════════════════════════════════════════════════════

    it('owner creates a deal', async () => {
        await escrow.sendCreateDeal(owner.getSender(), {
            dealId:     DEAL_ID,
            seller:     seller.address,
            buyer:      buyer.address,
            amountNano: DEAL_PRICE,
        });

        const deal = await escrow.getDeal(DEAL_ID);
        expect(deal).not.toBeNull();
        expect(deal!.status).toBe(DealStatus.OPEN);
        expect(deal!.amountNano).toBe(DEAL_PRICE);

        const count = await escrow.getDealCount();
        expect(count).toBe(1);
    });

    it('rejects CreateDeal from non-owner', async () => {
        const result = await escrow.sendCreateDeal(seller.getSender(), {
            dealId:     DEAL_ID,
            seller:     seller.address,
            buyer:      buyer.address,
            amountNano: DEAL_PRICE,
        });

        expect(result.transactions).toHaveTransaction({
            from:    seller.address,
            to:      escrow.address,
            success: false,
        });
    });

    it('rejects duplicate dealId', async () => {
        await escrow.sendCreateDeal(owner.getSender(), {
            dealId: DEAL_ID, seller: seller.address, buyer: buyer.address, amountNano: DEAL_PRICE,
        });

        const result = await escrow.sendCreateDeal(owner.getSender(), {
            dealId: DEAL_ID, seller: seller.address, buyer: buyer.address, amountNano: DEAL_PRICE,
        });

        expect(result.transactions).toHaveTransaction({
            from:    owner.address,
            to:      escrow.address,
            success: false,
        });
    });

    // ═════════════════════════════════════════════════════════════════════
    // 3. LOCK DEAL
    // ═════════════════════════════════════════════════════════════════════

    async function createDeal() {
        await escrow.sendCreateDeal(owner.getSender(), {
            dealId: DEAL_ID, seller: seller.address, buyer: buyer.address, amountNano: DEAL_PRICE,
        });
    }

    it('buyer locks the deal with correct amount', async () => {
        await createDeal();

        const result = await escrow.sendLockDeal(
            buyer.getSender(), DEAL_ID, DEAL_PRICE,
        );

        expect(result.transactions).toHaveTransaction({
            from:    buyer.address,
            to:      escrow.address,
            success: true,
        });

        const deal = await escrow.getDeal(DEAL_ID);
        expect(deal!.status).toBe(DealStatus.LOCKED);
    });

    it('rejects lock from wrong buyer', async () => {
        await createDeal();

        const result = await escrow.sendLockDeal(
            seller.getSender(), DEAL_ID, DEAL_PRICE,  // seller ≠ buyer
        );

        expect(result.transactions).toHaveTransaction({
            from:    seller.address,
            to:      escrow.address,
            success: false,
        });
    });

    it('rejects lock with wrong amount', async () => {
        await createDeal();

        // Слишком мало
        const result = await escrow.sendLockDeal(
            buyer.getSender(), DEAL_ID, toNano('2'),  // 2 ≠ 5
        );

        expect(result.transactions).toHaveTransaction({
            from:    buyer.address,
            to:      escrow.address,
            success: false,
        });
    });

    // ═════════════════════════════════════════════════════════════════════
    // 4. RELEASE DEAL — счастливый путь
    // ═════════════════════════════════════════════════════════════════════

    async function createAndLock() {
        await createDeal();
        await escrow.sendLockDeal(buyer.getSender(), DEAL_ID, DEAL_PRICE);
    }

    it('releases deal: 95% to seller, 5% to feeWallet', async () => {
        await createAndLock();

        const result = await escrow.sendReleaseDeal(owner.getSender(), DEAL_ID);

        // 95% идёт продавцу
        const expectedSeller = DEAL_PRICE * 95n / 100n;
        expect(result.transactions).toHaveTransaction({
            from:  escrow.address,
            to:    seller.address,
            value: (v) => v !== undefined && v >= expectedSeller - toNano('0.01'),
        });

        // 5% идёт feeWallet
        const expectedFee = DEAL_PRICE * 5n / 100n;
        expect(result.transactions).toHaveTransaction({
            from:  escrow.address,
            to:    feeWallet.address,
            value: (v) => v !== undefined && v >= expectedFee - toNano('0.01'),
        });

        // Статус сделки = completed
        const deal = await escrow.getDeal(DEAL_ID);
        expect(deal!.status).toBe(DealStatus.COMPLETED);
    });

    it('rejects release from non-owner', async () => {
        await createAndLock();

        const result = await escrow.sendReleaseDeal(seller.getSender(), DEAL_ID);
        expect(result.transactions).toHaveTransaction({
            from:    seller.address,
            to:      escrow.address,
            success: false,
        });
    });

    it('rejects release of non-locked deal', async () => {
        await createDeal();  // статус open, не locked

        const result = await escrow.sendReleaseDeal(owner.getSender(), DEAL_ID);
        expect(result.transactions).toHaveTransaction({
            from:    owner.address,
            to:      escrow.address,
            success: false,
        });
    });

    // ═════════════════════════════════════════════════════════════════════
    // 5. CANCEL DEAL
    // ═════════════════════════════════════════════════════════════════════

    it('owner can cancel an open deal (no refund needed)', async () => {
        await createDeal();

        const result = await escrow.sendCancelDeal(owner.getSender(), DEAL_ID);
        expect(result.transactions).toHaveTransaction({
            from:    owner.address,
            to:      escrow.address,
            success: true,
        });

        const deal = await escrow.getDeal(DEAL_ID);
        expect(deal!.status).toBe(DealStatus.CANCELLED);
    });

    it('owner can cancel a locked deal — refunds buyer', async () => {
        await createAndLock();

        const result = await escrow.sendCancelDeal(owner.getSender(), DEAL_ID);

        // Возврат покупателю (sandbox вычитает форвард-комиссию)
        expect(result.transactions).toHaveTransaction({
            from:    escrow.address,
            to:      buyer.address,
            value:   (v) => v !== undefined && v >= DEAL_PRICE - toNano('0.01'),
            success: true,
        });

        const deal = await escrow.getDeal(DEAL_ID);
        expect(deal!.status).toBe(DealStatus.CANCELLED);
    });

    it('buyer can cancel an open deal before paying', async () => {
        await createDeal();

        const result = await escrow.sendCancelDeal(buyer.getSender(), DEAL_ID);
        expect(result.transactions).toHaveTransaction({
            from:    buyer.address,
            to:      escrow.address,
            success: true,
        });
    });

    it('buyer cannot cancel a locked deal (only owner can)', async () => {
        await createAndLock();

        const result = await escrow.sendCancelDeal(buyer.getSender(), DEAL_ID);
        expect(result.transactions).toHaveTransaction({
            from:    buyer.address,
            to:      escrow.address,
            success: false,
        });
    });

    it('cannot cancel a completed deal', async () => {
        await createAndLock();
        await escrow.sendReleaseDeal(owner.getSender(), DEAL_ID);

        const result = await escrow.sendCancelDeal(owner.getSender(), DEAL_ID);
        expect(result.transactions).toHaveTransaction({
            from:    owner.address,
            to:      escrow.address,
            success: false,
        });
    });

    // ═════════════════════════════════════════════════════════════════════
    // 6. ИНТЕГРАЦИОННЫЙ — полный happy path
    // ═════════════════════════════════════════════════════════════════════

    it('full happy path: create → lock → release', async () => {
        // Создаём
        await escrow.sendCreateDeal(owner.getSender(), {
            dealId: 999n, seller: seller.address, buyer: buyer.address, amountNano: toNano('2'),
        });

        // Блокируем
        await escrow.sendLockDeal(buyer.getSender(), 999n, toNano('2'));

        // Релизим
        const result = await escrow.sendReleaseDeal(owner.getSender(), 999n);

        const deal = await escrow.getDeal(999n);
        expect(deal!.status).toBe(DealStatus.COMPLETED);

        // Продавец получил ≥ 1.89 TON (95% от 2 минус форвард-комиссии)
        expect(result.transactions).toHaveTransaction({
            from:  escrow.address,
            to:    seller.address,
            value: (v) => v !== undefined && v >= toNano('1.89'),
        });
    });
});
