# CLAUDE.md — GameFi TON Mining Simulator

Этот файл содержит всё необходимое для работы с проектом. Читай его целиком перед любым изменением кода.

---

## Что это за проект

Telegram Mini App (TMA) — симулятор виртуального майнинга криптовалюты с реальными выплатами в TON.

Игрок строит ферму из GPU и ASIC, управляет износом оборудования, торгует на P2P-маркетплейсе и получает долю от глобального пула наград пропорционально своей вычислительной мощности.

**Ключевая особенность:** Весь расчёт экономики происходит исключительно на сервере. Клиент (TMA) — тонкий: только отрисовка и передача действий.

---

## Монорепозиторий

```
/
├── frontend/      # React TMA (Telegram Mini App)
├── backend/       # Node.js API + Cron-движок
└── contracts/     # TON Smart Contracts (FunC / Tact)
```

---

## Frontend (`/frontend`)

**Стек:** React 18 · TypeScript · Vite · Telegram Web App SDK
> ✅ **Утверждено (Фаза 0).** Стек зафиксирован. Не менять без пересогласования.

### Правила

- Импортируй SDK: `import WebApp from '@twa-dev/sdk'`
- При старте всегда вызывай `WebApp.ready()` и `WebApp.expand()`
- Haptic Feedback при каждом значимом действии: `WebApp.HapticFeedback.impactOccurred('medium')`
- **Клиент не считает никакой экономики.** Баланс, хешрейт, износ — всё приходит с `/api/sync`
- Синхронизация с backend: `useEffect` + `setInterval(sync, 2000)` — каждые 2 секунды
- Для вывода TON использовать `TON Connect 2.0` (`@tonconnect/ui-react`)
- Стили: CSS Variables с `var(--tg-theme-*)` для автоадаптации под тему Telegram

### Структура

```
frontend/src/
├── pages/
│   ├── Farm.tsx          # Ферма: слоты, карточки GPU, склад, статистика, разгон
│   ├── Shop.tsx          # Магазин: покупка оборудования (USB Nano скрыт)
│   ├── Dashboard.tsx     # Статистика: баланс, хешрейт, сеть
│   ├── Market.tsx        # Барахолка: P2P order book, листинг, Refurbish
│   ├── Leaderboard.tsx   # 🏆 Топ-100 игроков по суммарному хешрейту
│   └── Company.tsx       # Управляющая компания: дерево рефералов, доходы
├── components/
│   ├── GpuCard.tsx       # Компактная кликабельная карточка GPU (без кнопок)
│   ├── GpuDetailModal.tsx # Слайд-ап модал: статистика, тогглы OC/UV, действия
│   ├── TapToCool.tsx     # Кликер для буста хешрейта
│   ├── BalanceBar.tsx    # TON + IGC отображение
│   └── FearGreedIndex.tsx # Индикатор рынка
└── hooks/
    ├── useSync.ts        # Синхронизация с backend каждые 2 сек
    ├── useAction.ts      # POST /api/action обёртка
    └── useTonConnect.ts  # TON Connect + вывод
```

### Не делай

- Не считай баланс или хешрейт на клиенте
- Не храни чувствительные данные в localStorage
- Не делай прямых запросов к смарт-контракту из клиента — только через backend API
- Не показывай Квантовый X1 (tier 6) в магазине пока `pool_stats.current_phase < 2` — скрывай на уровне UI

---

## Backend (`/backend`)

**Стек:** Node.js 20 · TypeScript · Fastify · PostgreSQL · Redis · node-cron

### Первые шаги в новом окружении

```bash
cd backend
cp .env.example .env      # заполни DB_URL, REDIS_URL, TON_WALLET_SECRET
npm install
npm run migrate           # применить PostgreSQL миграции
npm run dev               # запуск с hot-reload
```

### Архитектура

```
backend/src/
├── epoch/
│   ├── epochRunner.ts    # Cron каждые 5 мин: главная точка входа
│   ├── poolDistributor.ts # Раздача наград Pool-майнерам
│   ├── soloLottery.ts    # Розыгрыш Solo-блока (лотерея)
│   ├── wearEngine.ts     # Расчёт износа, P_fail, авто-стоп карт
│   ├── electricityBill.ts # Списание IGC за потребление (Watt)
│   └── halvingChecker.ts # Проверка TotalPaidOut, смена ставки
├── market/
│   ├── listings.ts       # CRUD лотов, ценовой коридор ±20%
│   ├── escrow.ts         # Заморозка TON при открытии лота
│   └── refurbish.ts      # Расчёт Cost_refurbish, смена Health до 100%
├── referral/
│   └── company.ts        # Расчёт H_total_user с L1/L2 бонусами, начисление IGC
├── auth/
│   └── telegramAuth.ts   # Валидация initData подписи (HMAC-SHA256)
├── routes/
│   ├── sync.ts           # GET /api/sync — текущее состояние фермы
│   ├── action.ts         # POST /api/action — покупка, разгон, ремонт
│   ├── market.ts         # GET/POST /api/market — маркетплейс
│   └── withdraw.ts       # POST /api/withdraw — запрос вывода TON
└── db/
    ├── schema.sql        # Эталонная схема (не редактировать вручную)
    └── migrations/       # Пронумерованные миграции
```

### Критические правила

**Аутентификация.** Каждый запрос к API обязан проходить через `telegramAuth.ts`. Проверяй HMAC-SHA256 подпись `initData` от Telegram. Никогда не доверяй `userId` из тела запроса — только из валидированного `initData`.

```typescript
// Пример middleware
import { validateInitData } from './auth/telegramAuth';

fastify.addHook('preHandler', async (req, reply) => {
  const initData = req.headers['x-tg-init-data'] as string;
  const user = validateInitData(initData, process.env.BOT_TOKEN!);
  if (!user) return reply.code(401).send({ error: 'Unauthorized' });
  req.tgUser = user;
});
```

**Эпоха (Cron).** Расчёт запускается строго через `epochRunner.ts`, не дублировать логику в других местах.

```typescript
// cron: каждые 5 минут
cron.schedule('*/5 * * * *', () => epochRunner.run());
```

**Халвинг.** После каждой выплаты обновляй `pool_stats.total_paid_out`. Проверяй пороги в `halvingChecker.ts`.

> ⚠️ **Утверждено (Фаза 0).** Пороги привязаны к суммарным выплатам из пула (Вариант А), а не ко времени. Не менять без пересчёта экономики.

```
Фаза 1: ставка 4% / день  → активна при total_paid_out < 2 000 TON
Фаза 2: ставка 2% / день  → активна при total_paid_out < 8 000 TON
Фаза 3: ставка 1% / день  → активна при total_paid_out < 30 000 TON
Фаза 4: ставка 0.5% / день → финальная, бессрочная
```

**Логика переключения (halvingChecker.ts):**
```typescript
const HALVING_THRESHOLDS = [
  { phase: 1, rate: 0.04, maxPaid: 2_000  },
  { phase: 2, rate: 0.02, maxPaid: 8_000  },
  { phase: 3, rate: 0.01, maxPaid: 30_000 },
  { phase: 4, rate: 0.005, maxPaid: Infinity },
];

function getActivePhase(totalPaidOut: number) {
  return HALVING_THRESHOLDS.find(t => totalPaidOut < t.maxPaid)!;
}
```

**Анти-кит лимиты (Подход 3 — Комбо). Активны ТОЛЬКО в Фазе 1 (total_paid_out < 2 000 TON):**
```
- Макс. покупок в сутки: 30 TON на аккаунт
- ASIC: не более 2 штук на аккаунт, только через whitelist
- Помещение "Ангар" (50 слотов): недоступно до Фазы 2
- С Фазы 2: все временные лимиты сняты, работают только инфраструктурные барьеры
```

**Формулы (не менять без согласования):**

```typescript
// Доход игрока за эпоху
const P = (H_user / H_total) * R_epoch;

// Награда за эпоху (Drip Economy)
const R_day = pool_balance * drip_rate;
const R_epoch = R_day / 288; // 288 эпох в сутках

// Хешрейт с реферальной сетью
const H_total_user = H_base
  + referrals_l1.reduce((s, r) => s + r.hashrate * 0.05, 0)
  + referrals_l2.reduce((s, r) => s + r.hashrate * 0.02, 0);

// Износ за эпоху
const W = W_base * K_temp * K_load;

// Шанс критической поломки
const P_fail = Math.pow((100 - health) / 100, 3);

// Стоимость Refurbish
const Cost_refurbish = (100 - health) * BASE_COST * TIER_MULTIPLIER[gpu.tier];
```

**Anti-Fraud правила:**
- Лимит вывода: не более 1% пула в сутки (проверяй в `withdraw.ts` И в смарт-контракте)
- Hold для новых аккаунтов: первый вывод только через 48ч после регистрации
- Маркетплейс: цена лота в коридоре ±20% от `getMarketPrice(gpu_model, health)`, иначе 400
- Rate limit на `/api/action` типа `tap_cool`: максимум 10 запросов в секунду на пользователя (Redis counter)
- Покупка tier 6 (Квантовый X1) в Фазе 1: возвращать `403 Forbidden` — проверять `pool_stats.current_phase >= 2`

---

## Smart Contracts (`/contracts`)

**Язык:** Tact (предпочтительно) или FunC  
**Окружение:** TON Blueprint (`npm create ton@latest`)

```bash
cd contracts
npm install
npx blueprint test    # тесты на Sandbox
npx blueprint build   # компиляция
npx blueprint run     # деплой (настрой .env с MNEMONIC)
```

### Контракты

**`pool.fc` — основной контракт пула:**
- Принимает TON депозиты
- Авто-сплит: 90% удерживает, 10% отправляет на `ADMIN_WALLET`
- Вывод только при наличии подписи от backend-кошелька
- Встроенный лимит: суточный вывод ≤ 1% от баланса контракта

**`escrow.fc` — маркетплейс:**
- Продавец деплоит escrow-контракт, депозит = цена продажи
- Покупатель отправляет TON → контракт атомарно передаёт средства продавцу (минус 5% комиссии платформе)
- Таймаут: если покупки не было 72ч → возврат продавцу

**Тестирование:** Все контракты тестировать на `testnet.toncenter.com` перед mainnet.

---

## База данных

### Ключевые таблицы

```sql
users         -- id, tg_user_id, ton_balance, igc_balance, inviter_id, created_at
gpus          -- id, user_id, model, health, hashrate, watt, slot_id, overclocked
farms         -- id, user_id, level (0-4), cooling_level, workbench_level
pool_stats    -- id, reserve_pool, drip_rate, current_phase, total_paid_out
transactions  -- id, user_id, type, amount_ton, amount_igc, epoch_id, created_at
referrals     -- id, inviter_id, invitee_id, level (1 or 2)
marketplace   -- id, seller_id, gpu_id, price_ton, health_at_listing, status
epoch_log     -- id, epoch_at, global_hashrate, reward_distributed, pool_after
```

### Миграции

Всегда создавай новый файл в `backend/src/db/migrations/` с префиксом номера: `001_initial.sql`, `002_add_workbench.sql`. Никогда не редактируй `schema.sql` напрямую в prod.

| Файл | Что добавляет |
|---|---|
| `001_initial.sql` | Базовая схема: users, gpus, farms, pool_stats, marketplace, epoch_log, transactions |
| `002_monitoring.sql` | system_events таблица для IGC-мониторинга |
| `003_withdrawal_queue.sql` | withdrawal_queue таблица для очереди выплат |
| `004_gpu_enhancements.sql` | `undervolted BOOLEAN DEFAULT FALSE` в таблице gpus |
| `005_gpu_stored_status.sql` | Добавляет `'stored'` в CHECK-constraint `gpus.status` |

> ⚠️ В `001_initial.sql` `gpus.status` изначально `CHECK (status IN ('active','broken','offline'))`. Миграция 005 расширяет до `('active','broken','offline','stored')`. При откате 005 нужно убрать все записи со статусом `'stored'` прежде чем менять constraint.

---

## Рыночный цикл и IGC-экономика

### Синусоидальный сезонный цикл (28 дней)

Накладывается поверх халвинга как модификатор. Не заменяет халвинг.

```typescript
// Формула дневной ставки с учётом сезона
function getDripRate(halvingPhaseRate: number, cycleDay: number): number {
  // cycleDay: 1..28, обнуляется каждые 28 дней
  return halvingPhaseRate * (1 + 0.25 * Math.sin(2 * Math.PI * cycleDay / 28));
}

// Пример для Фазы 2 (halvingPhaseRate = 0.02):
// День 1  (Весна-старт):  ~1.5%
// День 7  (Весна-конец):  ~2.0%
// День 14 (Лето-пик):     ~2.5%
// День 21 (Осень-конец):  ~2.0%
// День 28 (Зима-дно):     ~1.5%
```

**4 сезона (каждый 7 дней):**
- 🌸 Весна (1–7): ставка растёт 1.5% → 2.0%. Киты скупают IGC для будущего разгона.
- ☀️ Лето (8–14): пик 2.5%. Эйфория. Открывается «Сезонный разгон» (сжигает IGC).
- 🍂 Осень (15–21): спад 2.5% → 2.0%. Умные продают карты на пике цен.
- ❄️ Зима (22–28): дно 1.5%. Часть ферм выключается.

**Обратный цикл электричества (противофаза):**
```typescript
function getElectricityCostMultiplier(dripRate: number, baseDripRate: number): number {
  // Когда ставка на дне (1.5%) → электричество 1.2x
  // Когда ставка на пике (2.5%) → электричество 1.0x
  const ratio = dripRate / baseDripRate; // 0.75..1.25
  return 2.2 - ratio; // дно=1.45, норма=1.2, пик=0.95 → скорректировать под баланс
}
```

### Экономика по тирам оборудования

Базовые цифры при средней конкуренции в сети (не гарантированы — зависят от H_total):

| Модель | Роль | TON/день* | IGC добыча | IGC расход | Чистый IGC |
|---|---|---|---|---|---|
| USB Nano | Фарм IGC | 0.0001 | 5.0 | 0.5 | **+4.5** |
| RX 580 | Фарм IGC | 0.015 | 40.0 | 15.0 | **+25.0** |
| GTX 1660 S | Баланс | 0.030 | 70.0 | 45.0 | **+25.0** |
| RTX 3070 | Золотая середина | 0.120 | 150.0 | 145.0 | **+5.0** |
| RTX 4090 | Фарм TON | 0.350 | 250.0 | 380.0 | **-130 ❗** |
| ASIC S19 | Фарм TON | 0.850 | 400.0 | 1100.0 | **-700 ❗** |
| Квант X1 | Сверх-TON | 2.000 | 800.0 | 3500.0 | **-2700 ❗** |

*TON/день — при средней доле сети. При росте H_total пропорционально падает.

> ⚠️ Показывать игроку при покупке RTX4090+: «Расчётная окупаемость при текущем H_total: X дней»

### Механизм IGC-стабилизации (Buyback + Burn)

**Критично для предотвращения IGC-гиперинфляции:**

```typescript
// Buyback: платформа выкупает IGC по полу из admin_earned_ton
const IGC_FLOOR_PRICE_TON = 0.0001; // 1 IGC = 0.0001 TON (минимум)
const BUYBACK_SHARE = 0.15;          // 15% от admin_earned_ton идёт на buyback

// Burn: сезонный апгрейд «Сезонный разгон» (доступен только в Лето)
const SUMMER_BOOST_IGC_COST   = 500;  // сжигает 500 IGC
const SUMMER_BOOST_HASHRATE   = 0.10; // +10% хешрейта
const SUMMER_BOOST_DURATION_D = 7;    // 7 дней
```

**Правило баланса IGC:** мониторить отношение `supply/demand` каждые 24 часа.
- Если за сутки произведено IGC > потреблено × 1.5 → активировать экстренный burn-event.
- Если произведено < потреблено × 0.5 → снизить стоимость Refurbish на 20%.

## Переменные окружения

```env
# backend/.env
BOT_TOKEN=              # Telegram Bot Token (для валидации initData)
DATABASE_URL=           # PostgreSQL connection string
REDIS_URL=              # Redis connection string
ADMIN_WALLET=           # TON-адрес кошелька разработчика (получает 10%)
BACKEND_WALLET_MNEMONIC= # 24 слова кошелька backend'а (подписывает выплаты)
TON_ENDPOINT=           # https://toncenter.com/api/v2/ (mainnet) или testnet

# frontend/.env
VITE_API_URL=           # URL backend API
VITE_TON_MANIFEST_URL=  # URL tonconnect-manifest.json
```

---

## Тестирование экономики

Перед переключением на реальный TON запускай стресс-тест с ботами:

```bash
cd backend
npm run stress-test -- --players=100   # 100 игроков
npm run stress-test -- --players=500   # 500 игроков + киты
npm run stress-test -- --winter        # имитация крипто-зимы
```

**Критерии прохождения:**
- ROI игрока в Фазе 1 ≤ 45 дней
- Пул держится > 6 месяцев без новых вливаний
- Кит (ASIC × 10) не выводит > 30% суточных наград

---

## Команды разработки

```bash
# Запуск всего локально
docker-compose up -d          # PostgreSQL + Redis
cd backend && npm run dev     # Backend на :3000
cd frontend && npm run dev    # TMA на :5173 (Vite)

# Тесты
cd backend && npm test        # Unit + интеграционные тесты
cd contracts && npx blueprint test  # Тесты контрактов

# Линтинг
npm run lint                  # ESLint + Prettier (во всех пакетах)
```

---

## Частые ошибки

**`initData` не валидируется** → любой может подделать `userId`. Всегда проверяй HMAC.

**Расчёт на клиенте** → игроки смогут накрутить баланс через DevTools. Только backend.

**Забыл Redis lock на эпохе** → параллельные cron-задачи могут начислить награды дважды. Используй `SET epoch_lock NX EX 300` перед запуском.

**Прямой вывод без hold** → добавляй проверку `created_at + 48h` для новых аккаунтов.

**Цена Refurbish без tier_multiplier** → ASIC можно восстановить по цене RX 580. Всегда умножай на `TIER_MULTIPLIER`.

---

## Контекст проекта

Проект спроектирован как долгосрочная экономическая игра, а не Ponzi-схема. Механика халвинга по объёму выплат (а не по времени) защищает пул от быстрого истощения. Если сомневаешься в экономическом решении — сверяйся с `PLAN.md`.

---

## Фаза 2 — Смарт-контракты (ЗАВЕРШЕНО, деплой заблокирован балансом)

### Статус

- ✅ Контракты написаны на **Tact**: `contracts/contracts/Pool.tact`, `contracts/contracts/Escrow.tact`
- ✅ Враппер TypeScript: `contracts/wrappers/Pool.ts`, `contracts/wrappers/Escrow.ts`
- ✅ Blueprint compile-файлы: `contracts/wrappers/Pool.compile.ts`, `contracts/wrappers/Escrow.compile.ts`
- ✅ Sandbox-тесты: **28/28 проходят** (`contracts/tests/Pool.spec.ts` — 11 тестов, `contracts/tests/Escrow.spec.ts` — 17 тестов)
- ✅ Deploy-скрипты неинтерактивны: читают `MNEMONIC` и `ADMIN_WALLET` из `contracts/.env`
- ⏳ **ДЕПЛОЙ ЗАБЛОКИРОВАН**: кошелёк деплоера не пополнен тестовым TON

### Кошелёк деплоера (testnet)

```
Адрес: kQCXYPVOvG6SySkl1SVjAIrn1_QhvjSpYPU5_pdmr9fpuUuH
```

Получить тестовый TON: `@testgiver_ton_bot` в Telegram. Нужно ~1 TON (0.5 на Pool + 0.1 на Escrow + газ).

### Команды деплоя (запускать после пополнения)

```bash
cd contracts
npx blueprint run deployPool --testnet
# → запишет POOL_CONTRACT_ADDRESS в вывод

npx blueprint run deployEscrow --testnet
# → запишет ESCROW_CONTRACT_ADDRESS в вывод
```

После деплоя заполнить `backend/.env`:
```env
POOL_CONTRACT_ADDRESS=<адрес из deployPool>
ESCROW_CONTRACT_ADDRESS=<адрес из deployEscrow>
BACKEND_WALLET_MNEMONIC=bomb fold pistol cry display total human bind debate urge inch sing hammer rookie lady amateur indoor start casino record liar dentist sail bus
```

### Opcodes контрактов (нужны для backend при отправке сообщений)

| Контракт | Сообщение | Opcode (hex) | Opcode (dec) |
|---|---|---|---|
| Pool | Payout | 0x0101 | 257 |
| Pool | ChangeBackend | 0x0102 | 258 |
| Pool | EmergencyWithdraw | 0x0103 | 259 |
| Pool/Escrow | Deploy | 0x94485177 | 2490013878 |
| Escrow | CreateDeal | 0x0201 | 513 |
| Escrow | LockDeal | 0x0202 | 514 |
| Escrow | ReleaseDeal | 0x0203 | 515 |
| Escrow | CancelDeal | 0x0204 | 516 |

### Архитектура init data (критично для враппера)

Tact использует **lazy-init формат**: `1-bit(0) prefix + только аргументы конструктора`.
НЕ включай все поля контракта — только то, что передаётся в `init()`.

```typescript
// Pool init data — owner + backend
function buildPoolInitData(cfg: PoolInit): Cell {
    return beginCell()
        .storeUint(0, 1)          // lazy-init prefix
        .storeAddress(cfg.owner)
        .storeAddress(cfg.backend)
        .endCell();
}

// Escrow init data — owner + feeWallet
function buildEscrowInitData(cfg: EscrowInit): Cell {
    return beginCell()
        .storeUint(0, 1)
        .storeAddress(cfg.owner)
        .storeAddress(cfg.feeWallet)
        .endCell();
}
```

### Escrow.sendDeploy — обязательно с опкодом Deploy

Escrow НЕ имеет пустого `receive()`. При деплое нужен Deploy opcode:

```typescript
async sendDeploy(provider: ContractProvider, via: Sender, value = toNano('0.1')) {
    const body = beginCell()
        .storeUint(2490013878, 32)  // Deploy opcode
        .storeUint(0, 64)           // queryId
        .endCell();
    await provider.internal(via, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body });
}
```

### Blueprint compile файлы (обязательны для `npx blueprint build`)

Blueprint ищет `*.compile.ts` в `wrappers/`, а не в `contracts/`:

```typescript
// contracts/wrappers/Pool.compile.ts
import { CompilerConfig } from '@ton/blueprint';
export const compile: CompilerConfig = {
    lang: 'tact',
    target: 'contracts/Pool.tact',
    options: { debug: false },
};
```

### Jest конфиг для контрактов (`contracts/package.json`)

```json
"jest": {
  "preset": "ts-jest",
  "testEnvironment": "node",
  "testMatch": ["**/tests/**/*.spec.ts"]
}
```

НЕ используй `globalSetup: "@ton/test-utils/jest-global-setup"` — модуль не существует.
НЕ используй `testPathPattern` — правильный ключ `testMatch`.

### Запуск тестов контрактов

```bash
cd contracts
npx jest --forceExit        # правильно
# НЕ npx blueprint test     # вызывает рекурсию npm test → blueprint test → npm test
```

Тесты используют `Cell.fromHex(compiled.hex)` из `build/Pool.compiled.json` (не перекомпилируют при каждом запуске):
```typescript
const compiled = require('../build/Pool.compiled.json');
beforeAll(() => { code = Cell.fromHex(compiled.hex); });
```

### Sandbox — проверка значений (range, не exact)

Sandbox удерживает ~0.0005 TON на forward fees. Всегда используй диапазон:
```typescript
// ❌ Неверно
expect(msg.value).toBe(toNano('1'));

// ✅ Верно
expect(msg.value).toBeGreaterThanOrEqual(toNano('0.99'));
```

### SandboxContract — getters без provider

```typescript
// ❌ Неверно
const cfg = await pool.getConfig(provider);

// ✅ Верно
const cfg = await pool.getConfig();   // SandboxContract инжектирует provider автоматически
```

---

## Backend — payoutWorker (добавлен в Фазе 2)

### Файлы

- `backend/src/workers/payoutWorker.ts` — основной воркер
- `backend/src/monitoring/dailyCron.ts` — добавлен запуск воркера каждые 2 минуты:

```typescript
cron.schedule('*/2 * * * *', async () => {
    try { await processWithdrawals(); }
    catch (err) { console.error('[PayoutWorker Cron] Ошибка:', err); }
}, { timezone: 'UTC' });
```

### Логика payoutWorker

1. `SELECT ... FROM withdrawal_queue WHERE status='pending' FOR UPDATE SKIP LOCKED LIMIT 10`
2. Для каждой записи: отправляет `Payout` на Pool-контракт (opcode 257) через `WalletContractV4`
3. Последовательный seqno (не параллельный — только один воркер за раз)
4. Polling подтверждения: проверяет транзакцию на toncenter до 60 секунд
5. При успехе: `status = 'completed'`, `completed_at = NOW()`
6. При ошибке: `status = 'failed'`, делает refund на баланс пользователя в БД

### Нужные env переменные

```env
POOL_CONTRACT_ADDRESS=     # заполнить после деплоя
ESCROW_CONTRACT_ADDRESS=   # заполнить после деплоя
BACKEND_WALLET_MNEMONIC=   # 24 слова кошелька деплоера
TON_ENDPOINT=https://testnet.toncenter.com/api/v2/
```

---

## Фаза 3 — Telegram Bot (ЗАВЕРШЕНО)

### Статус

- ✅ `bot/` создана полностью: `package.json`, `tsconfig.json`, `.env.example`
- ✅ Стек: **grammY** + TypeScript, long polling (dev), без webhooks
- ✅ Команды: `/start` (Mini App кнопка + deep link ref_<id>), `/stats` (admin), `/broadcast` (admin)
- ✅ Middleware: `adminCheck.ts` — проверка `ADMIN_IDS` из env
- ✅ Шаблоны уведомлений: `epochReward.ts`, `seasonal.ts`, `referral.ts`
- ✅ `backend/src/notifications/sendTgNotification.ts` — HTTP-отправка через Bot API (без бот-процесса)
- ✅ `epochRunner.ts` интегрирован: solo-победитель получает личное уведомление, халвинг — broadcast всем
- ✅ `dailyCron.ts` интегрирован: при смене сезона — broadcast всем (раз в 7 дней)
- ✅ `sync.ts` интегрирован: при регистрации реферала — уведомление L1 и L2 инвайтеров
- ✅ Бот запущен: `@Syndicate_miner_bot` — ссылка: `https://t.me/Syndicate_miner_bot`
- ⏳ Запуск бота-процесса: требует `npm install` в `bot/` и запуска отдельно (не на Render)

### Структура

```
bot/
├── src/
│   ├── index.ts                  # Инициализация бота, long polling
│   ├── commands/
│   │   ├── start.ts              # /start → WebApp кнопка + реферальный deep link
│   │   ├── stats.ts              # /stats (admin) — пул, фаза, сезон, кол-во игроков
│   │   └── broadcast.ts          # /broadcast <text> (admin) — рассылка всем
│   ├── notifications/
│   │   ├── epochReward.ts        # buildEpochRewardMessage(), NOTIFY_MIN_TON
│   │   ├── seasonal.ts           # buildSeasonMessage(), buildHalvingMessage()
│   │   └── referral.ts           # buildReferralMessage()
│   └── middleware/
│       └── adminCheck.ts         # isAdmin(), adminOnly middleware
├── package.json                  # grammy, @grammyjs/menu, @grammyjs/runner, pg
├── tsconfig.json
└── .env.example                  # BOT_TOKEN, ADMIN_IDS, MINI_APP_URL, DATABASE_URL
```

### Env переменные (bot/.env)

```env
BOT_TOKEN=          # Токен бота от @BotFather (тот же, что в backend)
MINI_APP_URL=       # https://t.me/YourBot/game
ADMIN_IDS=          # Telegram user_id через запятую: 123456,789012
DATABASE_URL=       # Тот же PostgreSQL, что у backend
```

### Запуск бота

```bash
cd bot
npm install
cp .env.example .env   # заполни BOT_TOKEN, ADMIN_IDS, MINI_APP_URL, DATABASE_URL
npm run dev            # long polling (dev)
npm run build && npm start  # production
```

### Архитектура уведомлений

Backend отправляет уведомления **напрямую** в Telegram Bot API через `fetch`, без бот-процесса:
- Личные: `sendTgMessage(tgUserId, text)`
- Широковещательные: `sendTgBroadcast(tgUserIds[], text)` — батчи по 30, 1.1с между батчами
- Уведомления не бросают исключений — только логируют ошибку, чтобы не ронять бизнес-логику

### Admin-команды

- `/stats` — запрашивает `pool_stats` + `epoch_log` + `users` из БД, форматирует HTML
- `/broadcast Текст` — читает все `tg_user_id` из БД, рассылает батчами, отчёт в чат

---

## Фаза 4 — Frontend Mini App (ЗАВЕРШЕНО)

### Статус

- ✅ React 18 + Vite + TypeScript — `frontend/src/`
- ✅ 5 вкладок: Dashboard, Farm, Shop, Market, Company
- ✅ `useSync.ts` — синхронизация каждые 2 сек через `/api/sync`
- ✅ TON Connect 2.0 интегрирован (`@tonconnect/ui-react`) — кнопка вывода на Dashboard
- ✅ `@twa-dev/sdk` — `WebApp.ready()` + `WebApp.expand()` при маунте
- ✅ Деплой на **Vercel**: `https://frontend-nine-lyart-335p3mweew.vercel.app`
- ✅ `VITE_API_URL` настроен на Render backend (продакшн)
- ✅ `tonconnect-manifest.json` размещён на Vercel

### Команды

```bash
cd frontend
npm run dev         # локально на :5173
npm run build       # production build
vercel deploy --prod --yes   # деплой на Vercel (авто-деплой с GitHub НЕ работает)
```

---

## Деплой (текущее состояние)

> ⚠️ **Render.com удалил аккаунт** (май 2026). Backend перенесён на **Railway**.
> Слово "mining" убрано из всех названий файлов и сервисов (Railway запрещает крипто-майнеры).

### Backend — Railway

| Параметр | Значение |
|---|---|
| URL | `https://syndicate-backend-production-c797.up.railway.app` |
| Healthcheck | `GET /health` → `{"ok":true,"ts":...,"redis":true/false}` |
| Сервис | `syndicate-backend` |
| Проект Railway | `syndicate-server` (ID: `0371efbc-d413-41d3-93d9-8338ee1d5400`) |
| Регион | San Francisco (sfo) |
| Builder | NIXPACKS |
| Start command | `node dist/main.js` |
| Config | `railway.json` в корне backend/ |

### Redis — Railway (managed)

| Параметр | Значение |
|---|---|
| Сервис | `Redis` (в том же Railway-проекте) |
| Приватный домен | `redis.railway.internal` |
| Публичный TCP прокси | `kodama.proxy.rlwy.net:53274` |
| Порт Redis | 6379 |

> ⚠️ **Railway private networking (`redis.railway.internal`) НЕ работает** — возвращает HTTP-ответ вместо Redis-протокола (ошибка `Protocol error, got "H" as reply type byte`). Используется **публичный TCP прокси**: `kodama.proxy.rlwy.net:53274`.

> ⚠️ **Redis fallback:** Если Redis недоступен, `tap_cool` возвращает `{ ok: true, boostSeconds: 1 }` вместо `0` — буст отображается даже без Redis (накапливается пока тапаешь).

### Актуальные env переменные на Railway (2026-05-23)

```env
BOT_TOKEN=8818633899:AAHeXesqzZL9Pzo4uUJd8XN_YY_fiMW6AWY
DATABASE_URL=postgresql://postgres.xzyhrfvrywkctgcsxuvm:QW2XpNnk7IdlP40g@aws-1-eu-central-1.pooler.supabase.com:6543/postgres
REDIS_URL=redis://default:PBnfqCMNLlWBiFaDvCiXhnSpEbgvuPbD@kodama.proxy.rlwy.net:53274
NODE_ENV=production
NODE_TLS_REJECT_UNAUTHORIZED=0
NODE_OPTIONS=--dns-result-order=ipv4first
```

### Frontend — Vercel

| Параметр | Значение |
|---|---|
| URL (alias) | `https://frontend-nine-lyart-335p3mweew.vercel.app` |
| Проект | `roman-dot-hubs-projects/frontend` |
| Framework | Vite |
| `VITE_API_URL` | `https://syndicate-backend-production-c797.up.railway.app` |
| `VITE_TON_MANIFEST_URL` | `https://frontend-nine-lyart-335p3mweew.vercel.app/tonconnect-manifest.json` |

### База данных

- **Supabase** проект: `xzyhrfvrywkctgcsxuvm`
- Все 5 миграций применены: `001_initial.sql`, `002_monitoring.sql`, `003_withdrawal_queue.sql`, `004_gpu_enhancements.sql`, `005_gpu_stored_status.sql`
- **КРИТИЧНО**: Direct URL (`db.xzyhrfvrywkctgcsxuvm.supabase.co`) — только IPv6, всегда использовать **pooler**: `aws-1-eu-central-1.pooler.supabase.com:6543`

### Telegram Bot

| Параметр | Значение |
|---|---|
| Бот | `@Syndicate_miner_bot` |
| Bot Token | `8818633899:AAHeXesqzZL9Pzo4uUJd8XN_YY_fiMW6AWY` |
| Admin user ID | `1730291634` |
| Mini App URL | `https://t.me/Syndicate_miner_bot/app` |

### Деплой вручную

**Backend (Railway CLI):**
```bash
cd "C:\Claude\Syndicate Miner\backend"
npm run build          # tsc → dist/
railway up --detach    # деплой на Railway
railway logs           # просмотр логов
railway variables      # проверка env переменных
```

**Frontend (Vercel CLI):**
```bash
cd "C:\Claude\Syndicate Miner\frontend"
npm run build          # vite build → dist/
vercel --prod --yes    # деплой на Vercel
```

URL после деплоя не меняется: alias `frontend-nine-lyart-335p3mweew.vercel.app` всегда актуален.

---

## Что осталось сделать

1. **Деплой контрактов** (Фаза 2): пополнить кошелёк `kQCXYPVOvG6SySkl1SVjAIrn1_QhvjSpYPU5_pdmr9fpuUuH` тестовым TON через `@testgiver_ton_bot` → запустить `npx blueprint run deployPool --testnet`
2. **Бот-процесс**: запустить `bot/` на отдельном хостинге (Railway или VPS)
3. **Починить Railway private networking**: `redis.railway.internal` возвращает HTTP. Пока используется публичный прокси `kodama.proxy.rlwy.net:53274`.
4. **Stress-test экономики**: `npm run stress-test -- --players=100` перед открытым бета-запуском
5. **Удалить debug console.log** в `backend/src/routes/sync.ts` после окончания отладки.

---

## Критические баги — решённые (для справки)

### IPv6 ENETUNREACH (Render Oregon → Supabase)

Render Oregon не имеет IPv6-маршрутизации. Supabase direct connection (`db.PROJECT_REF.supabase.co`) резолвится только в AAAA (IPv6) записи → `connect ENETUNREACH`.

**Решение:**
1. `dns.setDefaultResultOrder('ipv4first')` в самом начале `main.ts` (до всех импортов) — заставляет Node.js предпочитать IPv4
2. `DATABASE_URL` указывает на **пулер**: `aws-1-eu-central-1.pooler.supabase.com:6543` — у него есть A-запись (IPv4)

> ⚠️ `family: 4` в pgPoolConfig **не работает** — библиотека `pg` игнорирует этот параметр. Единственный надёжный способ — пулер + `setDefaultResultOrder`.

### Redis "Client IP address is not in the allowlist"

Внешний Redis URL (`rediss://...@oregon-keyvalue.render.com:6379`) требует статического IP в allowlist. IP Render-инстансов динамические → периодические сбои.

**Решение:** Использовать **внутренний** URL `redis://red-XXXXX:6379` (без пароля, без TLS) — работает внутри Render-сети без ограничений по IP.



### snake_case vs camelCase (PostgreSQL → TypeScript)

PostgreSQL возвращает колонки в snake_case (`ton_balance`, `model_tier`, `cooling_level`). TypeScript-типы фронтенда ожидают camelCase (`tonBalance`, `modelTier`, `coolingLevel`).

**Решение:** mapper в `backend/src/routes/sync.ts` перед `reply.send()`, плюс fallback-чтение в каждом компоненте:

```typescript
// В компоненте — всегда используй fallback:
const u = data.user as any;
const ton = parseFloat(u.tonBalance ?? u.ton_balance ?? '0');
const tier = gpu.modelTier ?? (gpu as any).model_tier ?? 0;
```

### PostgreSQL NUMERIC → JS string

`node-postgres` возвращает колонки типа `NUMERIC`/`DECIMAL` как **строки** (`"0.0000"` вместо `0`). Вызов `.toFixed()` на строке — TypeError.

**Правило:** всегда оборачивай в `parseFloat()` перед любой арифметикой или `.toFixed()`.

```typescript
// ❌ Падает если значение — строка
user.tonBalance.toFixed(4)

// ✅ Всегда безопасно
parseFloat(String(user.tonBalance ?? 0)).toFixed(4)
```

### Новые action-типы (добавлены после Фазы 4)

| type | Что делает | Параметры |
|---|---|---|
| `toggle_overclock` | Переключает разгон; при включении сбрасывает undervolt | `gpu_id` |
| `toggle_undervolting` | Переключает undervolt; при включении сбрасывает overclock | `gpu_id` |
| `move_to_storage` | Переводит GPU в статус `'stored'`, освобождает слот | `gpu_id` |
| `move_from_storage` | Возвращает GPU в `'active'`, проверяет свободный слот | `gpu_id` |

`move_from_storage` возвращает `400` если нет свободных слотов (`NOT IN ('broken','stored')`).

### Маппинг action-типов (frontend → backend)

Frontend и backend использовали разные имена для одного действия. Решение — case alias в `action.ts`:

| Frontend отправляет | Backend обрабатывает | Примечание |
|---|---|---|
| `set_mode` | `set_mode` / `set_mining_mode` | Оба варианта через `case` fallthrough |
| `overclock` | `overclock` / `toggle_overclock` | Аналогично |
| `refurbish` | `refurbish` / `repair_gpu` | Аналогично |
| `farm_level_2` | `default:` + `INFRA_COSTS` lookup | Прямое имя типа |
| `cooling_1` | `default:` + `INFRA_COSTS` lookup | Прямое имя типа |
| `workbench_1` | `default:` + `INFRA_COSTS` lookup | Прямое имя типа |

### SQL-баг в set_mining_mode

Изначальный код делал `UPDATE farms SET mining_mode = $1` — но поле `mining_mode` находится в таблице `users`, не `farms`. Исправлено на `UPDATE users SET mining_mode = $1 WHERE id = $2`.

### Railway private networking возвращает HTTP вместо Redis

`redis.railway.internal:6379` при подключении через ioredis возвращает `Protocol error, got "H" as reply type byte` — то есть HTTP-ответ вместо Redis-протокола. Это происходит и с приватным URL, и на Railway внутренней сети.

**Решение:** Использовать **публичный TCP прокси** `kodama.proxy.rlwy.net:53274` — он проксирует чистый TCP к Redis-контейнеру без HTTP-обёртки.

**Fallback в коде:** Если Redis недоступен, `tap_cool` в catch блоке возвращает `{ ok: true, boostSeconds: 1 }` — буст показывается даже без Redis.

### users таблица — поля имён

В таблице `users` нет колонок `username` и `first_name`. Есть только `tg_username` (сохраняется при регистрации из `tgUser.username`). При SQL-запросах для отображения имён использовать:

```sql
COALESCE(NULLIF(u.tg_username, ''), 'Игрок #' || u.tg_user_id::text) AS display_name
```

GROUP BY также должен использовать `u.tg_username`, не `u.username` или `u.first_name`.

### Tap to Cool буст не накапливается (Farm.tsx)

`handleBoostTap` использовал `setBoostEndTime(prev => Math.max(prev, now + boostSeconds * 1000))` — каждый тап устанавливал конец буста в `now + 1сек`, не накапливая. Исправлено на:

```typescript
const handleBoostTap = (boostSeconds: number) => {
  setBoostEndTime(prev => {
    const base = Math.max(prev, Date.now()); // от текущего конца или от сейчас
    return base + boostSeconds * 1000;       // прибавляем, не заменяем
  });
};
```

Теперь 60 тапов = 60 секунд буста.

---

## Деплой вручную (обязательно после каждого изменения)

Auto-deploy не настроен ни для Railway, ни для Vercel.

### Railway (backend)

```bash
cd "C:\Claude\Syndicate Miner\backend"
npm run build            # tsc → dist/
railway up --detach      # деплой (~2-3 минуты)
railway logs --lines 30  # проверка логов
curl https://syndicate-backend-production-c797.up.railway.app/health
```

### Vercel (frontend)

```bash
cd "C:\Claude\Syndicate Miner\frontend"
npm run build            # vite build → dist/
vercel --prod --yes      # деплой (~1-2 минуты)
```

После деплоя URL не меняется: `https://frontend-nine-lyart-335p3mweew.vercel.app`

---

## Состояние тестового пользователя

| Поле | Значение |
|---|---|
| `tg_user_id` | `1730291634` |
| `ton_balance` | `10.0000` TON (добавлено вручную через Supabase) |
| Режим | Pool (solo режим на USB Nano почти ничего не даёт) |

---

## GPU-экономика (актуальные константы)

Фронтенд отображает эти значения. Backend рассчитывает их независимо. Константы зафиксированы в `frontend/src/types.ts` → `GPU_SPECS`.

```
igcPerDay      = hashrate_GH * 0.05 * 288
igcCostPerDay  = wattBackend * 0.001 * 288 + maintPerEpoch * 288
```

При **разгоне (+20% хешрейта)**: дополнительная стоимость электричества `+wattBackend * 0.40 * 0.001 * 288 IGC/день`.

При **undervolt (−15% хешрейта)**: расход электричества `×0.75` (−25%). OC и UV взаимно исключают друг друга — включение одного сбрасывает другой.

| Тир | Модель | priceTon | igcPerDay | igcCostPerDay | wattBackend |
|---|---|---|---|---|---|
| 0 | USB Nano | 0 | 1.44 | 0 | 0 |
| 1 | RX 580 | 1 | 43.2 | 14.4 | 50 |
| 2 | GTX 1660 S | 2.5 | 86.4 | 43.2 | 100 |
| 3 | RTX 3070 | 8 | 216.0 | 216.0 | 200 |
| 4 | RTX 4090 | 25 | 648.0 | 676.8 | 350 |
| 5 | ASIC S19 | 70 | 1584.0 | 1785.6 | 1200 |
| 6 | Квантовый X1 | 200 | 3600.0 | 3600.0 | 500 |

Тир 4+ — расход IGC на свет превышает добычу. Предупреждение показывается в Shop.

---

## UI компоненты — особенности реализации

### Dashboard.tsx

- Показывает **👥 В сети** (totalUsers) и **🖥️ Майнеров** (activeMiners) — данные приходят из `/api/sync` в поле `network`
- Поле `network` добавлено в `SyncData` (`types.ts`) и в ответ `sync.ts` (SQL-запрос одним `SELECT COUNT(*)`)

### GpuCard.tsx

Компактная кликабельная карточка — кнопок нет, всё действия через GpuDetailModal:
- Пульсирующий зелёный `●` над emoji — только при статусе `active`
- Теги-бейджи `⚡OC` (синий) и `🔋UV` (зелёный) когда включены
- Иконка `💥` при broken, `📦` при stored
- Бейдж здоровья справа: `XX%` / `💥` / `💤` (stored)
- `spec = GPU_SPECS[tier] ?? GPU_SPECS[0]` — всегда fallback на tier 0
- Prop `onClick` — открывает GpuDetailModal в Farm.tsx

### TapToCool.tsx

- Счётчик тапов хранится в **`localStorage`** под ключом `tapCool_count` — сохраняется между перезапусками приложения
- Механика: **1 тап = +1 секунда буста**, максимум 3600 тапов (= 1 час буста), после чего обязательный cooldown **6 часов**
- Буст даёт **+10% хешрейта** на весь период (применяется в `epochRunner.ts`)
- Redis хранит timestamp окончания (`tap:boost:end:{userId}`), а не TTL — это исключает race condition при быстрых тапах
- Anti-autoclicker: jitter-детекция на бэкенде (5 последних интервалов, если max-min < 15ms — тап игнорируется); rate limit 10 тапов/сек через Redis
- Буст-состояние поднято в `Farm.tsx` (локальный `boostEndTime` state + countdown timer) — не зависит от Redis при отображении на GPU-карточках
- `onUpdate()` вызывается каждые 10 тапов (не каждый тап) для экономии запросов

### Shop.tsx — раздел "Верстак"

Верстак открывает возможность ремонта GPU:

| Уровень | Метка | Стоимость | Чинит тиры |
|---|---|---|---|
| 1 | 🔧 Верстак Lv1 | 500 IGC | T1–T2 |
| 2 | 🔧 Верстак Lv2 | 5 TON | T3–T4 |
| 3 | 🔧 Верстак Lv3 | 25 TON | T5–T6 |

Action-тип передаётся как `workbench_1`, `workbench_2`, `workbench_3` → обрабатывается в `default:` блоке `action.ts` через `INFRA_COSTS`.

### Leaderboard.tsx

- Вкладка **🏆 Топ** — 6-я вкладка в нижней навигации
- Эндпоинт: `GET /api/leaderboard` (требует Telegram auth)
- Показывает топ-100 игроков по суммарному хешрейту активных GPU (с учётом оверклока ×1.2)
- Медали 🥇🥈🥉 для мест 1-3, `#N` для остальных
- Текущий игрок подсвечивается синим (`#0098EA`)
- Если игрок вне топ-100 — показывается его строчка отдельно внизу через `· · ·`
- Хешрейт форматируется: `< 1 GH/s` → MH/s, `>= 1000 GH/s` → TH/s
- Имя: `tg_username` или `Игрок #<tg_user_id>` если username не задан

### Farm.tsx — интерактивные карточки GPU

**GpuCard.tsx** — компактная кликабельная карточка, кнопок не содержит. При нажатии открывает `GpuDetailModal`. Показывает:
- Emoji, имя, статусные теги `⚡OC` / `🔋UV`
- Бейдж здоровья (цвет: зелёный/жёлтый/красный)
- Специальные иконки: 💥 (broken), 📦 (stored), ● (active, пульсирует)

**GpuDetailModal.tsx** — слайд-ап bottom sheet с разделами:
- Здоровье (прогресс-бар, цветовой код)
- Статистика (хешрейт, IGC/день, расход/день, баланс фермы, охлаждение)
- **Производительность** — тогглы: ⚡ Разгон / 🔋 Undervolt / 🌬️ Кулер
- **Действия**: 💡 Электричество (алерт с деталями), 🔧 Ремонт, 📦 На склад / 🏭 В слот
- Анимация `slideUp` при открытии, закрытие по тапу на backdrop или кнопку ✕

**Склад (stored GPUs)**:
- Кнопка `📦 Склад (N)` появляется в шапке блока GPU когда есть хотя бы одна карта на складе
- Разворачивает секцию с хранящимися GPU внизу страницы
- GPU со статусом `stored` не занимают слоты фермы (исключены из COUNT в `buy_gpu`)

**Карточка статистики фермы** (над TapToCool, если есть активные GPU):
- Суммарный хешрейт (с учётом OC/UV)
- IGC доход/день, IGC расход/день, IGC баланс/день (сумма − расход)
- ≈ TON/день = `(farmHashrate / globalHashrate) * poolTon * dripRate`
  - `globalHashrate` читается из Redis → fallback на `epoch_log ORDER BY epoch_at DESC LIMIT 1`
  - Если глобальный хешрейт неизвестен — показывает максимум (100% пула) с пометкой `макс`

### OC и Undervolt — взаимная исключительность

Разгон (overclock) и снижение напряжения (undervolt) **не могут быть включены одновременно**:

- **Frontend**: кнопка UV заблокирована при активном OC (и наоборот), при нажатии — алерт "Отключи Разгон"
- **Backend** (`action.ts`): при включении OC сбрасывает `undervolted = false`, при включении UV сбрасывает `overclocked = false`

```typescript
// toggle_overclock: при включении принудительно снимает undervolt
UPDATE gpus SET overclocked = $1,
  undervolted = CASE WHEN $1 THEN FALSE ELSE undervolted END
WHERE id = $2
```

Undervolt-эффект (только для отображения на фронтенде):
- Хешрейт: ×0.85 (−15%)
- IGC-расход: ×0.75 (−25%)

### Уведомления Telegram — IGC / остановка майнеров

Логика в `epochRunner.ts`, после обработки электричества каждой фермы:

| Событие | Триггер | Redis-ключ | Дедупликация |
|---|---|---|---|
| ⚠️ Мало IGC | остаток < 1 дня расхода | `igc_warn:{tgUserId}` | TTL **22 часа** |
| 🔴 Майнеры остановлены | `offlineGpuIds.length > 0` или `farmShutdown` | `igc_offline:{tgUserId}` | TTL **4 часа** |

Отправка — fire-and-forget через `sendTgMessage()`, обёрнута в `try/catch`. Не роняет эпоху.

### USB Nano (tier 0) — только при регистрации

- **Не показывается** в магазине (`Shop.tsx` фильтрует `.filter(([t]) => Number(t) !== 0)`)
- **Нельзя купить** через API (`action.ts` возвращает 400 для `buy_gpu` с tier 0)
- **Нельзя продать** (`market.ts` проверяет `gpu.model_tier === 0` → 400)
- **Выдаётся бесплатно** при первом входе в `sync.ts` → `registerNewPlayer()` → INSERT в gpus с tier 0

### Dashboard.tsx

- Показывает **👥 В сети** (totalUsers) и **🖥️ Майнеров** (activeMiners) — данные приходят из `/api/sync` в поле `network`
- Поле `network` добавлено в `SyncData` (`types.ts`) и в ответ `sync.ts` (SQL-запрос одним `SELECT COUNT(*)`)

### SyncData — актуальные поля (types.ts)

```typescript
interface GPU {
  id, modelTier, health, status: 'active'|'broken'|'offline'|'stored',
  overclocked, undervolted,   // ← undervolted добавлен в 004_gpu_enhancements.sql
  coolingLevel, isRefurbished
}

interface SyncData {
  user, farm, gpus,
  storedGpus: GPU[],          // ← новое поле: GPU со статусом 'stored'
  season, igc, tapBoost, events,
  network: {
    totalUsers, activeMiners,
    globalHashrate: number,   // ← из Redis или epoch_log (fallback)
  }
}
```

`sync.ts` разделяет `rawGpus` на `mappedGpus` (status ≠ 'stored') и `mappedStoredGpus` (status = 'stored') — клиент получает их отдельно.

`globalHashrate` — сначала читается из Redis (`epoch:global_hashrate`), при недоступности Redis — из `SELECT global_hashrate FROM epoch_log ORDER BY epoch_at DESC LIMIT 1`.

### ErrorBoundary + global error handler

В `frontend/src/App.tsx` — React class ErrorBoundary обёртывает всё приложение. Показывает текст ошибки вместо чёрного экрана при ошибке рендера.

В `frontend/src/main.tsx` — `window.addEventListener('error', ...)` и `window.addEventListener('unhandledrejection', ...)` — ловят краши до монтирования React. Показывают fallback в `#root` div.

---
