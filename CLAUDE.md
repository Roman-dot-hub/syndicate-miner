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
