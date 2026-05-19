// ═══════════════════════════════════════════════════════════════════════
// Pool.tact — Mining Pool Contract
// Syndicate Miner · Фаза 2
//
// Хранит резервный пул TON для выплат майнерам.
//
// Жизненный цикл:
//   1. Deploy: owner деплоит контракт, передавая начальный TON в пул.
//   2. Deposit: любой может пополнить пул — 10% уходит owner (admin fee),
//      90% остаётся в контракте как награды для майнеров.
//   3. Payout: backend-кошелёк отправляет Payout{seqno, recipient, amount}
//      → контракт проверяет seqno и переводит TON игроку.
//   4. ChangeBackend: owner может сменить backend-кошелёк.
//   5. EmergencyWithdraw: owner забирает TON в экстренном случае.
//
// Безопасность:
//   • Только адрес backend авторизован для выплат (проверка sender()).
//   • seqno предотвращает replay-атаки и двойные выплаты.
//   • MIN_RESERVE = 0.3 TON — контракт не может опустеть полностью.
// ═══════════════════════════════════════════════════════════════════════

import "@stdlib/deploy";

// ── Входящие сообщения (opcodes явные → удобны для враппера) ────────────

/// Backend отправляет это при обработке каждой записи withdrawal_queue.
/// gasValue отправляется вместе (≈0.05 TON) — покрывает gas.
message(0x0101) Payout {
    seqno:      Int as uint32;   // порядковый номер (последний + 1)
    recipient:  Address;         // TON-адрес кошелька игрока
    amountNano: Int as coins;    // сумма выплаты в нано-TON
    paymentId:  Int as uint64;   // ID из withdrawal_queue (для off-chain аудита)
}

/// Смена backend-кошелька (только owner).
message(0x0102) ChangeBackend {
    newBackend: Address;
}

/// Экстренный вывод средств (только owner, форс-мажор).
message(0x0103) EmergencyWithdraw {
    amountNano: Int as coins;
}

// ── Структура для геттера config ────────────────────────────────────────
struct PoolConfig {
    owner:           Address;
    backend:         Address;
    adminFeePercent: Int as uint8;
    seqno:           Int as uint32;
}

// ── Контракт ────────────────────────────────────────────────────────────

contract Pool with Deployable {

    // Состояние
    owner:           Address;       // admin-кошелёк (10% депозитов + экстренный вывод)
    backend:         Address;       // backend-кошелёк (единственный авторизован для Payout)
    seqno:           Int as uint32; // последний обработанный seqno выплаты
    adminFeePercent: Int as uint8;  // % admin-комиссии (10 = 10%)

    init(owner: Address, backend: Address) {
        self.owner           = owner;
        self.backend         = backend;
        self.seqno           = 0;
        self.adminFeePercent = 10;
    }

    // ── Получение депозитов (любой отправитель) ─────────────────────────
    // Принимает TON от любого: игрок, admin, партнёр, топ-ап.
    // Авто-сплит: adminFeePercent% → owner, остаток остаётся в пуле.
    receive() {
        let incoming: Int = context().value;

        // Игнорируем пыль (< 0.05 TON) — не тратим gas на сплит
        if (incoming < ton("0.05")) { return; }

        let adminShare: Int = incoming * self.adminFeePercent / 100;

        send(SendParameters {
            to:    self.owner,
            value: adminShare,
            mode:  SendIgnoreErrors,
            body:  "Pool: admin fee".asComment(),
        });
        // Оставшиеся 90% остаются в myBalance() как pool reserve
    }

    // ── Выплата игроку (только backend) ────────────────────────────────
    // backend отправляет это сообщение с ≈0.05 TON на gas.
    // Контракт переводит amountNano из своего резерва на адрес игрока.
    receive(msg: Payout) {
        // 1. Авторизация: только backend-кошелёк
        require(sender() == self.backend, "Pool: unauthorized — backend only");

        // 2. Защита от replay: seqno должен быть ровно +1
        require(msg.seqno == self.seqno + 1, "Pool: invalid seqno");

        // 3. Проверка резерва.
        //    myBalance() включает TON, присланный с этим сообщением (на gas).
        //    Вычитаем context().value, чтобы не считать gas как часть резерва.
        let poolReserve: Int = myBalance() - context().value;
        require(
            poolReserve - msg.amountNano >= ton("0.3"),
            "Pool: insufficient reserve (min 0.3 TON)"
        );

        // 4. Обновляем seqno ДО send — защита от reentrancy
        self.seqno = msg.seqno;

        // 5. Переводим TON игроку
        send(SendParameters {
            to:    msg.recipient,
            value: msg.amountNano,
            mode:  SendIgnoreErrors,
            body:  "Mining reward".asComment(),
        });
    }

    // ── Смена backend-адреса ────────────────────────────────────────────
    receive(msg: ChangeBackend) {
        require(sender() == self.owner, "Pool: owner only");
        self.backend = msg.newBackend;
    }

    // ── Экстренный вывод (только owner) ────────────────────────────────
    receive(msg: EmergencyWithdraw) {
        require(sender() == self.owner, "Pool: owner only");
        require(msg.amountNano > 0, "Pool: zero amount");

        // Оставляем 0.05 TON на storage
        let available: Int = myBalance() - context().value - ton("0.05");
        require(available >= msg.amountNano, "Pool: amount exceeds available balance");

        send(SendParameters {
            to:    self.owner,
            value: msg.amountNano,
            mode:  SendIgnoreErrors,
            body:  "Pool: emergency withdraw".asComment(),
        });
    }

    // ── Геттеры (off-chain чтение без gas) ─────────────────────────────

    /// Текущий баланс контракта (= pool reserve + хранение)
    get fun balance(): Int {
        return myBalance();
    }

    /// Следующий ожидаемый seqno (для backend перед отправкой Payout)
    get fun nextSeqno(): Int {
        return self.seqno + 1;
    }

    /// Полная конфигурация контракта
    get fun config(): PoolConfig {
        return PoolConfig {
            owner:           self.owner,
            backend:         self.backend,
            adminFeePercent: self.adminFeePercent,
            seqno:           self.seqno,
        };
    }
}
