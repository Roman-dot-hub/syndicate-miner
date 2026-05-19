// ═══════════════════════════════════════════════════════════════════════
// Escrow.tact — Marketplace P2P Escrow Contract
// Syndicate Miner · Фаза 2
//
// Обеспечивает безопасные P2P сделки с GPU на маркетплейсе.
//
// Жизненный цикл сделки:
//   1. CreateDeal (owner/backend) → регистрирует сделку со статусом open.
//   2. LockDeal   (buyer)        → покупатель отправляет точную сумму TON.
//   3. ReleaseDeal (owner)       → контракт переводит 95% продавцу + 5% fee.
//   4. CancelDeal  (owner или buyer до lock) → возврат TON покупателю.
//
// Статусы сделки:
//   0 = open      : зарегистрирована, ожидаем оплату покупателя
//   1 = locked    : TON заблокирован в контракте
//   2 = completed : сделка завершена, TON переведён продавцу
//   3 = cancelled : сделка отменена, TON (если был) возвращён покупателю
//
// Безопасность:
//   • Только owner (backend) может создавать сделки и подтверждать выдачу.
//   • Покупатель может отменить только до блокировки (статус open).
//   • Статус обновляется ДО send (защита от reentrancy).
//   • Допуск на gas при LockDeal: ≤ 0.1 TON сверх цены.
// ═══════════════════════════════════════════════════════════════════════

import "@stdlib/deploy";

// ── Статус сделки ────────────────────────────────────────────────────────
const DEAL_OPEN:      Int = 0;
const DEAL_LOCKED:    Int = 1;
const DEAL_COMPLETED: Int = 2;
const DEAL_CANCELLED: Int = 3;

// ── Структура сделки (хранится в map) ───────────────────────────────────
struct Deal {
    seller:     Address;
    buyer:      Address;
    amountNano: Int as coins;  // цена сделки в нано-TON (без газа)
    status:     Int as uint8;  // 0..3
}

// ── Входящие сообщения ───────────────────────────────────────────────────

/// Backend регистрирует новую сделку (до получения оплаты от покупателя).
message(0x0201) CreateDeal {
    dealId:     Int as uint64;  // ID из таблицы marketplace в PostgreSQL
    seller:     Address;        // TON-адрес продавца (получатель 95%)
    buyer:      Address;        // TON-адрес покупателя (плательщик)
    amountNano: Int as coins;   // цена сделки в нано-TON
}

/// Покупатель блокирует TON. Отправляет amountNano + ≤0.1 TON на gas.
message(0x0202) LockDeal {
    dealId: Int as uint64;
}

/// Backend подтверждает получение GPU покупателем → деньги продавцу.
message(0x0203) ReleaseDeal {
    dealId: Int as uint64;
}

/// Отмена сделки (owner на любом этапе; buyer только до lock).
message(0x0204) CancelDeal {
    dealId: Int as uint64;
}

// ── Структура для геттера ────────────────────────────────────────────────
struct EscrowConfig {
    owner:     Address;
    feeWallet: Address;
    feeNum:    Int as uint8;
    feeDenom:  Int as uint8;
    dealCount: Int as uint32;
}

// ── Контракт ─────────────────────────────────────────────────────────────

contract Escrow with Deployable {

    // Состояние
    owner:      Address;        // backend-кошелёк (создаёт и подтверждает сделки)
    feeWallet:  Address;        // кошелёк для 5% комиссии маркетплейса
    feeNum:     Int as uint8;   // числитель комиссии (5)
    feeDenom:   Int as uint8;   // знаменатель комиссии (100)
    deals:      map<Int, Deal>; // dealId → Deal
    dealCount:  Int as uint32;  // счётчик всех созданных сделок

    init(owner: Address, feeWallet: Address) {
        self.owner      = owner;
        self.feeWallet  = feeWallet;
        self.feeNum     = 5;
        self.feeDenom   = 100;
        self.deals      = emptyMap();
        self.dealCount  = 0;
    }

    // ── Создать сделку (только owner/backend) ──────────────────────────
    receive(msg: CreateDeal) {
        require(sender() == self.owner, "Escrow: owner only");
        require(self.deals.get(msg.dealId) == null, "Escrow: dealId already exists");
        require(msg.amountNano >= ton("0.05"), "Escrow: amount too small");

        self.deals.set(msg.dealId, Deal {
            seller:     msg.seller,
            buyer:      msg.buyer,
            amountNano: msg.amountNano,
            status:     DEAL_OPEN,
        });

        self.dealCount = self.dealCount + 1;
    }

    // ── Покупатель блокирует TON ────────────────────────────────────────
    receive(msg: LockDeal) {
        let deal: Deal? = self.deals.get(msg.dealId);
        require(deal != null,         "Escrow: deal not found");

        let d: Deal = deal!!;
        require(d.status == DEAL_OPEN, "Escrow: deal is not open");
        require(sender() == d.buyer,   "Escrow: wrong buyer address");

        // Покупатель должен прислать точную сумму ± допуск на газ (0.1 TON)
        let incoming: Int = context().value;
        require(
            incoming >= d.amountNano && incoming <= d.amountNano + ton("0.1"),
            "Escrow: wrong amount — send exact deal price (±0.1 TON gas)"
        );

        // Обновляем статус на locked
        self.deals.set(msg.dealId, Deal {
            seller:     d.seller,
            buyer:      d.buyer,
            amountNano: d.amountNano,
            status:     DEAL_LOCKED,
        });
    }

    // ── Backend подтверждает сделку → деньги продавцу ──────────────────
    receive(msg: ReleaseDeal) {
        require(sender() == self.owner, "Escrow: owner only");

        let deal: Deal? = self.deals.get(msg.dealId);
        require(deal != null,           "Escrow: deal not found");

        let d: Deal = deal!!;
        require(d.status == DEAL_LOCKED, "Escrow: deal is not locked");

        // Рассчитываем сплит: 5% → feeWallet, 95% → seller
        let feeAmount:    Int = d.amountNano * self.feeNum / self.feeDenom;
        let sellerAmount: Int = d.amountNano - feeAmount;

        // Обновляем статус ДО отправок — reentrancy protection
        self.deals.set(msg.dealId, Deal {
            seller:     d.seller,
            buyer:      d.buyer,
            amountNano: d.amountNano,
            status:     DEAL_COMPLETED,
        });

        // Выплата продавцу (95%)
        send(SendParameters {
            to:    d.seller,
            value: sellerAmount,
            mode:  SendIgnoreErrors,
            body:  "Marketplace: sale proceeds".asComment(),
        });

        // Комиссия маркетплейса (5%)
        send(SendParameters {
            to:    self.feeWallet,
            value: feeAmount,
            mode:  SendIgnoreErrors,
            body:  "Marketplace: fee".asComment(),
        });
    }

    // ── Отмена сделки → возврат покупателю ─────────────────────────────
    receive(msg: CancelDeal) {
        let deal: Deal? = self.deals.get(msg.dealId);
        require(deal != null, "Escrow: deal not found");

        let d: Deal = deal!!;

        // Уже закрыта
        require(d.status != DEAL_COMPLETED, "Escrow: already completed");
        require(d.status != DEAL_CANCELLED, "Escrow: already cancelled");

        // Права на отмену:
        //   owner — может отменить в любом статусе (open или locked)
        //   buyer — только если сделка ещё open (не заплатил)
        let isOwner: Bool = sender() == self.owner;
        let isBuyer: Bool = sender() == d.buyer && d.status == DEAL_OPEN;
        require(isOwner || isBuyer, "Escrow: not authorized to cancel");

        // Обновляем статус ДО send
        self.deals.set(msg.dealId, Deal {
            seller:     d.seller,
            buyer:      d.buyer,
            amountNano: d.amountNano,
            status:     DEAL_CANCELLED,
        });

        // Возврат покупателю только если он уже заплатил (status был locked)
        if (d.status == DEAL_LOCKED) {
            send(SendParameters {
                to:    d.buyer,
                value: d.amountNano,
                mode:  SendIgnoreErrors,
                body:  "Escrow: refund".asComment(),
            });
        }
    }

    // ── Геттеры ─────────────────────────────────────────────────────────

    /// Данные конкретной сделки (null = не существует)
    get fun deal(dealId: Int): Deal? {
        return self.deals.get(dealId);
    }

    /// Суммарное количество созданных сделок
    get fun dealCount(): Int {
        return self.dealCount;
    }

    /// Баланс контракта (аккумулированные locked TON + газ)
    get fun balance(): Int {
        return myBalance();
    }

    /// Конфигурация контракта
    get fun config(): EscrowConfig {
        return EscrowConfig {
            owner:     self.owner,
            feeWallet: self.feeWallet,
            feeNum:    self.feeNum,
            feeDenom:  self.feeDenom,
            dealCount: self.dealCount,
        };
    }
}
