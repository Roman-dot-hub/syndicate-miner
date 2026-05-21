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
│   ├── Farm.tsx          # Ферма: слоты, карточки GPU, разгон, охлаждение
│   ├── Shop.tsx          # Магазин: динамические цены, покупка оборудования
│   ├── Dashboard.tsx     # Статистика: баланс, хешрейт, пул, Solo/Pool переключение
│   ├── Market.tsx        # Барахолка: P2P order book, листинг, Refurbish
│   └── Company.tsx       # Управляющая компания: дерево рефералов, доходы
├── components/
│   ├── GpuCard.tsx       # Карточка GPU с health-баром и кнопками
│   ├── TapToCool.tsx     # Кликер для буста хешрейта
│   ├── BalanceBar.tsx    # TON + IGC отображение
│   └── FearGreedIndex.tsx # Индикатор рынка
└── hooks/
    ├── useSync.ts        # Синхронизация с backend каждые 2 сек
    ├── useEpoch.ts       # Подписка на события эпохи
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
npx vercel --prod   # деплой на Vercel
```

---

## Деплой (текущее состояние)

### Backend — Render.com

| Параметр | Значение |
|---|---|
| URL | `https://syndicate-miner-backend.onrender.com` |
| Healthcheck | `GET /health` → `{"ok":true}` |
| Сервис ID | `srv-d87l6h6l51nc7392shr0` |
| Регион | Oregon (free plan) |
| Runtime | Node.js (native), Node 20.11.0 |
| Build command | `npm install --legacy-peer-deps` |
| Start command | `npx tsx src/main.ts` (не compiled JS — см. заметку) |
| Redis | `red-d86m5hugvqtc73drj2dg` (Render Redis, frankfurt) |
| DB | Supabase PostgreSQL (Frankfurt) |

> ⚠️ **Заметка о tsx:** Backend запускается через `tsx` (esbuild), а не через скомпилированный `dist/`. Причина: `tsc` стабильно падал на Render с exit code 2 (точная причина не установлена без доступа к build-логам в дашборде). Если нужно вернуть компиляцию — открой Render Dashboard → вкладка Logs → найди ошибку → исправь → смени startCommand обратно на `node dist/main.js`.

### Frontend — Vercel

| Параметр | Значение |
|---|---|
| URL (alias) | `https://frontend-nine-lyart-335p3mweew.vercel.app` |
| Проект | `roman-dot-hubs-projects/frontend` |
| Framework | Vite |
| `VITE_API_URL` | `https://syndicate-miner-backend.onrender.com` |
| `VITE_TON_MANIFEST_URL` | `https://frontend-nine-lyart-335p3mweew.vercel.app/tonconnect-manifest.json` |

### GitHub

| Репозиторий | `https://github.com/Roman-dot-hub/syndicate-miner` |
|---|---|
| Видимость | **Public** (Render требует публичный repo или установку GitHub App) |
| Ветка | `main` |
| Auto-deploy Render | ✅ по push в main |

### Credentials (Render API)

```
Render API Key: rnd_15RECAKZ4L8Pe9OumX62yDKBYKFc
Owner ID:       tea-d86m45ek1jcs739e1j0g
```

### База данных

- Supabase проект: `xzyhrfvrywkctgcsxuvm`
- Все 3 миграции применены: `001_initial.sql`, `002_monitoring.sql`, `003_withdrawal_queue.sql`
- `_migrations` таблица: записи добавлены вручную (schema уже существовала до миграций)

### Telegram Bot

| Параметр | Значение |
|---|---|
| Бот | `@Syndicate_miner_bot` |
| Bot Token | `8818633899:AAHeXesqzZL9Pzo4uUJd8XN_YY_fiMW6AWY` |
| Admin user ID | `1730291634` |
| Mini App URL | `https://t.me/Syndicate_miner_bot/app` |

> ⚠️ **Бот-процесс не запущен на сервере.** Команды `/start`, `/stats`, `/broadcast` — код готов в `bot/`, но процесс нужно запустить вручную или на отдельном хостинге. Backend отправляет уведомления напрямую через Bot API (без бот-процесса) — это работает.

---

## Что осталось сделать

1. **Деплой контрактов** (Фаза 2): пополнить кошелёк `kQCXYPVOvG6SySkl1SVjAIrn1_QhvjSpYPU5_pdmr9fpuUuH` тестовым TON через `@testgiver_ton_bot` → запустить `npx blueprint run deployPool --testnet`
2. **Бот-процесс**: запустить `bot/` на отдельном хостинге (не Render — там нет long polling из-за free plan sleep)
3. **Тест через реальный Telegram**: открыть Mini App через `@Syndicate_miner_bot` и проверить синхронизацию с backend
4. **Stress-test экономики**: `npm run stress-test -- --players=100` перед открытым бета-запуском
