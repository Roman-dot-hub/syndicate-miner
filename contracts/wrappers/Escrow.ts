// ─────────────────────────────────────────────────────────────────────────
// wrappers/Escrow.ts — TypeScript-обёртка для контракта Escrow
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

// ── Opcodes (из Escrow.tact message(0x02xx)) ──────────────────────────────
export const EscrowOpcodes = {
    CreateDeal:  0x0201,
    LockDeal:    0x0202,
    ReleaseDeal: 0x0203,
    CancelDeal:  0x0204,
} as const;

// ── Статусы сделки ────────────────────────────────────────────────────────
export const DealStatus = {
    OPEN:      0,
    LOCKED:    1,
    COMPLETED: 2,
    CANCELLED: 3,
} as const;

// ── Типы ──────────────────────────────────────────────────────────────────

export type EscrowInit = {
    owner:     Address;  // backend-кошелёк
    feeWallet: Address;  // получатель 5% комиссии
};

export type CreateDealParams = {
    dealId:     bigint;   // ID из marketplace таблицы PostgreSQL
    seller:     Address;
    buyer:      Address;
    amountNano: bigint;   // цена в нано-TON
};

export type DealResult = {
    seller:     Address;
    buyer:      Address;
    amountNano: bigint;
    status:     number;   // 0=open, 1=locked, 2=completed, 3=cancelled
} | null;

export type EscrowConfigResult = {
    owner:     Address;
    feeWallet: Address;
    feeNum:    number;
    feeDenom:  number;
    dealCount: number;
};

// ── Init data ─────────────────────────────────────────────────────────────
function buildEscrowInitData(cfg: EscrowInit): Cell {
    // Tact lazy-init format: 1-bit prefix (0) + constructor args only.
    // The contract's init() sets feeNum=5, feeDenom=100, deals=empty, dealCount=0.
    return beginCell()
        .storeUint(0, 1)           // Tact lazy-init flag
        .storeAddress(cfg.owner)
        .storeAddress(cfg.feeWallet)
        .endCell();
}

// ── Враппер ───────────────────────────────────────────────────────────────

export class Escrow implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address): Escrow {
        return new Escrow(address);
    }

    static createFromConfig(config: EscrowInit, code: Cell, workchain = 0): Escrow {
        const data    = buildEscrowInitData(config);
        const init    = { code, data };
        const address = contractAddress(workchain, init);
        return new Escrow(address, init);
    }

    // ── Deploy ────────────────────────────────────────────────────────────
    // Escrow has no empty receiver — must use the typed Deploy message.
    async sendDeploy(
        provider: ContractProvider,
        via:      Sender,
        value:    bigint = toNano('0.1'),
    ): Promise<void> {
        // Deploy opcode = 2490013878 (0x946A98B6), queryId = 0
        const body = beginCell()
            .storeUint(2490013878, 32)
            .storeUint(0, 64)
            .endCell();
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    // ── CreateDeal ────────────────────────────────────────────────────────
    async sendCreateDeal(
        provider: ContractProvider,
        via:      Sender,
        params:   CreateDealParams,
        gasValue: bigint = toNano('0.05'),
    ): Promise<void> {
        const body = beginCell()
            .storeUint(EscrowOpcodes.CreateDeal, 32)
            .storeUint(params.dealId, 64)
            .storeAddress(params.seller)
            .storeAddress(params.buyer)
            .storeCoins(params.amountNano)
            .endCell();

        await provider.internal(via, {
            value:    gasValue,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    // ── LockDeal (buyer отправляет TON) ───────────────────────────────────
    async sendLockDeal(
        provider: ContractProvider,
        via:      Sender,
        dealId:   bigint,
        dealAmountNano: bigint,   // точная сумма сделки
        gasExtra: bigint = toNano('0.05'),  // добавляется на газ
    ): Promise<void> {
        const body = beginCell()
            .storeUint(EscrowOpcodes.LockDeal, 32)
            .storeUint(dealId, 64)
            .endCell();

        await provider.internal(via, {
            value:    dealAmountNano + gasExtra,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    // ── ReleaseDeal ───────────────────────────────────────────────────────
    async sendReleaseDeal(
        provider: ContractProvider,
        via:      Sender,
        dealId:   bigint,
        gasValue: bigint = toNano('0.08'),  // две исходящие транзакции
    ): Promise<void> {
        const body = beginCell()
            .storeUint(EscrowOpcodes.ReleaseDeal, 32)
            .storeUint(dealId, 64)
            .endCell();

        await provider.internal(via, {
            value:    gasValue,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    // ── CancelDeal ────────────────────────────────────────────────────────
    async sendCancelDeal(
        provider: ContractProvider,
        via:      Sender,
        dealId:   bigint,
        gasValue: bigint = toNano('0.06'),
    ): Promise<void> {
        const body = beginCell()
            .storeUint(EscrowOpcodes.CancelDeal, 32)
            .storeUint(dealId, 64)
            .endCell();

        await provider.internal(via, {
            value:    gasValue,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    // ── Геттеры ───────────────────────────────────────────────────────────

    async getDeal(provider: ContractProvider, dealId: bigint): Promise<DealResult> {
        const tb = new TupleBuilder();
        tb.writeNumber(dealId);

        const result = await provider.get('deal', tb.build());
        const item   = result.stack.readTupleOpt();
        if (!item) return null;

        return {
            seller:     item.readAddress(),
            buyer:      item.readAddress(),
            amountNano: item.readBigNumber(),
            status:     item.readNumber(),
        };
    }

    async getDealCount(provider: ContractProvider): Promise<number> {
        const result = await provider.get('dealCount', []);
        return result.stack.readNumber();
    }

    async getBalance(provider: ContractProvider): Promise<bigint> {
        const state = await provider.getState();
        return state.balance;
    }

    async getConfig(provider: ContractProvider): Promise<EscrowConfigResult> {
        const result = await provider.get('config', []);
        const stack  = result.stack;
        return {
            owner:     stack.readAddress(),
            feeWallet: stack.readAddress(),
            feeNum:    stack.readNumber(),
            feeDenom:  stack.readNumber(),
            dealCount: stack.readNumber(),
        };
    }
}
