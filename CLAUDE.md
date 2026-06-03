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
- Синхронизация с backend: `useEffect` + `setInterval(sync, 6000)` — каждые 6 секунд
- Для вывода TON использовать `TON Connect 2.0` (`@tonconnect/ui-react`)
- Стили: CSS Variables с `var(--tg-theme-*)` для автоадаптации под тему Telegram

### Структура

```
frontend/src/
├── pages/
│   ├── Farm.tsx          # Ферма: слоты, карточки GPU, склад, статистика, разгон
│   ├── Shop.tsx          # Магазин: покупка оборудования (USB Nano скрыт)
│   ├── Dashboard.tsx     # Статистика: баланс, хешрейт, сеть
│   ├── Market.tsx        # IGC Маркет: продажа IGC→TON и покупка TON→IGC по динамической цене
│   ├── Syndicate.tsx     # ⚔️ Синдикаты: вступление, казна, бонусы, участники, голосования
│   ├── Leaderboard.tsx   # 🏆 Топ-100 игроков по суммарному хешрейту
│   └── Company.tsx       # Управляющая компания: дерево рефералов, доходы
├── components/
│   ├── GpuCard.tsx       # Компактная кликабельная карточка GPU (без кнопок)
│   ├── GpuDetailModal.tsx # Слайд-ап модал: статистика, тогглы OC/UV, действия (optimistic UI)
│   ├── GpuIcon.tsx       # SVG-иконка GPU по тиру (заменяет эмодзи везде)
│   ├── InfoSheet.tsx     # Универсальный bottom-sheet с описанием апгрейда + кнопка InfoBtn (ℹ️)
│   ├── AdBoost.tsx       # Просмотр рекламы для буста хешрейта (Adsgram)
│   ├── BalanceBar.tsx    # TON + IGC отображение + кнопка 🌐 смены языка
│   └── FearGreedIndex.tsx # Индикатор рынка
└── hooks/
    ├── useSync.ts        # Синхронизация с backend каждые 6 сек (concurrent-safe)
    ├── useAction.ts      # POST /api/action обёртка
    └── useTonConnect.ts  # TON Connect + вывод
```

### Не делай

- Не считай баланс или хешрейт на клиенте
- Не храни чувствительные данные в localStorage
- Не делай прямых запросов к смарт-контракту из клиента — только через backend API
- Не показывай Квантовый X1 (tier 6) в магазине пока `pool_stats.current_phase < 2` — скрывай на уровне UI

---

## Интернационализация (i18n) — RU/EN билингвальность

**Статус:** ✅ Полностью реализована. Все страницы и компоненты переведены.

### Архитектура

| Файл | Роль |
|---|---|
| `frontend/src/i18n.ts` | Словарь переводов + `fmt()` helper + тип `Translations` |
| `frontend/src/LangContext.tsx` | `LangProvider`, `useLang()` хук |

**`i18n.ts` структура:**
```typescript
// ru — объект БЕЗ as const (обязательно! см. ниже)
const ru = { key: 'Значение', ... };

// en — точная копия структуры ru
const en: typeof ru = { key: 'Value', ... };

// Словарь по языку
const T: Record<Lang, typeof ru> = { ru, en };

// Публичный тип
export type Translations = typeof ru;
export type Lang = 'ru' | 'en';
export { T };
```

> ⚠️ **НЕ добавляй `as const`** к объекту `ru`. С `as const` все строки становятся литеральными типами (e.g. `'Стата'`), и `en: typeof ru` не позволяет присвоить английские строки. Без `as const` TypeScript выводит все значения как `string` — `en: typeof ru` работает.

**`fmt()` helper — подстановка переменных:**
```typescript
// Шаблон: "Осталось {n} просмотров"
fmt(t.ad_views_left, { n: 3 }) // → "Осталось 3 просмотров"

// Шаблон: "Стоимость: {cost} IGC · Баланс: {bal}"
fmt(t.confirm_cost, { cost: '500', bal: '1200' })
```

**`useLang()` хук:**
```typescript
const { t, lang, setLang } = useLang();
// t — объект переводов текущего языка
// lang — 'ru' | 'en'
// setLang — переключатель
```

### Переключение языка

Кнопка 🌐 находится в `BalanceBar.tsx` (верхняя полоса), **не** в нижней навигации. При нажатии переключает `ru ↔ en`. Язык по умолчанию — `'ru'`.

### Правила добавления новых строк

1. Добавь ключ в `ru` объект в `i18n.ts`
2. Добавь тот же ключ в `en` объект (TypeScript ошибкой сообщит если пропустишь — `en: typeof ru`)
3. Используй в компоненте: `const { t } = useLang()` → `{t.my_new_key}`
4. Для строк с переменными: `{n}` в шаблоне → `fmt(t.my_key, { n: value })`

### Модульные константы с переводами

Если строки нужны в **модульном контексте** (вне компонента), нельзя использовать хуки. Решения:

**Вариант 1 — принять `t` параметром:**
```typescript
// farm.tsx
function farmLvName(lv: number, t: Translations): string {
  return ({ 1: t.farm_lv1, 2: t.farm_lv2, 3: t.farm_lv3, 4: t.farm_lv4 })[lv] ?? t.farm_lv1;
}
// Внутри компонента: farmLvName(farm.level, t)
```

**Вариант 2 — строить массив/объект внутри компонента:**
```typescript
// Syndicate.tsx
const bonusLabels: Record<string, string> = {
  boost_x1: t.bonus_boost_x1,
  boost_x2: t.bonus_boost_x2,
  ...
};
```

**Вариант 3 — функциональная обёртка для class-компонента:**
```typescript
// App.tsx — ErrorBoundary — class component, не может использовать хуки
function ErrorDisplay({ error }: { error: string }) {
  const { t } = useLang(); // ✅ хук в функциональном компоненте
  return <div>{t.render_error}</div>;
}
class ErrorBoundary extends React.Component {
  render() {
    if (this.state.hasError) return <ErrorDisplay error={this.state.error} />;
    return this.props.children;
  }
}
```

### Покрытие переводов

| Страница / Компонент | Статус |
|---|---|
| `Dashboard.tsx` | ✅ |
| `Farm.tsx` (ServerRoom, MixedUpgradeRow, InfraUpgradeRow, FarmUpgradesSection) | ✅ |
| `Shop.tsx` | ✅ |
| `Syndicate.tsx` (все 7 видов) | ✅ |
| `Market.tsx` (включая блок "Как работает цена") | ✅ |
| `Leaderboard.tsx` | ✅ |
| `Company.tsx` | ✅ |
| `GpuDetailModal.tsx` (температура, ratio, апгрейды) | ✅ |
| `GpuCard.tsx` | ✅ |
| `GpuShopModal.tsx` | ✅ |
| `FearGreedIndex.tsx` | ✅ |
| `AdBoost.tsx` | ✅ |
| `BalanceBar.tsx` | ✅ |
| `App.tsx` (LoadingSplash, ErrorBoundary, loading steps) | ✅ |

### Нестандартные решения (зафиксированы)

- **Температурные метки** (`temp_normal/warm/hot/crit`): `tempInfo()` в `types.ts` — модульная функция, хуки не работают. Решение: `getTempLabel(celsius)` определён внутри `GpuDetailModal`, использует `t`. Цвет берётся из `tempInfo().color`.
- **Имена уровней фермы** (`farm_lv1–4`): `FARM_LEVELS` в `types.ts` удалён из импорта `Farm.tsx`. Функция `farmLvName(lv, t)` определена в `Farm.tsx` вне компонента, принимает `t` как параметр.
- **Ratio метка на кнопках Market/GpuDetailModal**: ключ `ratio_market` → `'рынок'/'market'`.
- **Статусы рынка FearGreedIndex**: `STATUS_CONFIG` перенесён внутрь компонента, строится из `t.fgi_*`.

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
│   ├── sync.ts           # GET /api/sync — текущее состояние фермы (включая syndicate)
│   ├── action.ts         # POST /api/action — покупка, разгон, ремонт, синдикаты
│   ├── syndicates.ts     # GET /api/syndicates — публичный список синдикатов с местами
│   ├── market.ts         # GET/POST /api/market — маркетплейс
│   ├── withdraw.ts       # POST /api/withdraw — запрос вывода TON
│   └── adsgramReward.ts  # GET /api/adsgram-reward — server-side callback от Adsgram
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

> ⚠️ **Утверждено.** Пороги привязаны к суммарным выплатам на кошельки игроков (`total_paid_out`), а не ко времени. Не менять без пересчёта экономики.

```
Фаза 1: ставка 4% / день  → активна при total_paid_out < 1 000 TON
Фаза 2: ставка 2% / день  → активна при total_paid_out < 10 000 TON
Фаза 3: ставка 1% / день  → активна при total_paid_out < 100 000 TON
Фаза 4: ставка 0.5% / день → финальная, бессрочная
```

**Логика переключения (`backend/src/epoch/constants.ts`):**
```typescript
export const HALVING_PHASES = [
  { phase: 1 as const, dripRate: 0.04,  maxPaidOut: 1_000 },
  { phase: 2 as const, dripRate: 0.02,  maxPaidOut: 10_000 },
  { phase: 3 as const, dripRate: 0.01,  maxPaidOut: 100_000 },
  { phase: 4 as const, dripRate: 0.005, maxPaidOut: Infinity },
];
```

**Frontend `PHASE_THRESHOLD` (Dashboard.tsx) должен совпадать:**
```typescript
const PHASE_THRESHOLD: Record<number, number | null> = { 1: 1_000, 2: 10_000, 3: 100_000, 4: null };
```

**Анти-кит лимиты (Подход 3 — Комбо). Активны ТОЛЬКО в Фазе 1 (total_paid_out < 1 000 TON):**
```
- Макс. покупок в сутки: 30 TON на аккаунт
- ASIC S19: недоступен до Фазы 2 (availablePhase: 2)
- Гараж (20 слотов): недоступен до Фазы 2 (availablePhase: 2)
- Ангар (50 слотов): недоступен до Фазы 2 (availablePhase: 2)
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
- Rate limit на `/api/action`: максимум 10 запросов в секунду на пользователя (Redis counter)
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
users              -- id, tg_user_id, ton_balance, igc_balance, inviter_id, mining_mode('solo'), created_at
gpus               -- id, user_id, model, health, hashrate, watt, slot_id, overclocked, undervolted
farms              -- id, user_id, level (0-4), cooling_level, workbench_level
pool_stats         -- id, reserve_pool, drip_rate, current_phase, total_paid_out
transactions       -- id, user_id, type, amount_ton, amount_igc, epoch_id, created_at
referrals          -- id, inviter_id, invitee_id, level (1 or 2)
marketplace        -- id, seller_id, gpu_id, price_ton, health_at_listing, status
epoch_log          -- id, epoch_at, global_hashrate, reward_distributed, pool_after
syndicates         -- id, name, leader_id, level, xp, treasury_igc, created_at
syndicate_members  -- syndicate_id, user_id, role, joined_at [UNIQUE(user_id)]
syndicate_bonuses  -- id, syndicate_id, type, expires_at, created_at
syndicate_votes    -- syndicate_id, candidate_id, voter_id, created_at [PK(syndicate_id, voter_id)]
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
| `006_igc_supply_tracking.sql` | `total_igc_minted NUMERIC DEFAULT 0`, `total_igc_burned NUMERIC DEFAULT 0` в pool_stats |
| `007_backfill_igc_supply.sql` | Добавляет `igc_ratio_smoothed NUMERIC DEFAULT 1.0` в pool_stats; бэкфиллит `total_igc_minted` из суммы `igc_balance` всех пользователей |
| `008_syndicates.sql` | Таблицы `syndicates`, `syndicate_members`, `syndicate_bonuses`, `syndicate_votes`; дефолт `mining_mode = 'solo'` для новых игроков |

> ⚠️ В `001_initial.sql` `gpus.status` изначально `CHECK (status IN ('active','broken','offline'))`. Миграция 005 расширяет до `('active','broken','offline','stored')`. При откате 005 нужно убрать все записи со статусом `'stored'` прежде чем менять constraint.

**pool_stats — актуальные поля (после 007):**
```sql
reserve_pool_ton     NUMERIC   -- TON резерв пула
drip_rate            NUMERIC   -- текущая ставка дрипа
current_phase        INT       -- 1-4
total_paid_out       NUMERIC   -- суммарно выплачено на кошельки игроков (основа для халвинга)
admin_earned_ton     NUMERIC   -- комиссия платформы
total_igc_minted     NUMERIC   -- всего IGC добыто (майнинг + buy_igc); лимит 10 000 000 000
total_igc_burned     NUMERIC   -- всего IGC сожжено (электро + ремонт + infra — НЕ sell_igc!)
igc_ratio_smoothed   NUMERIC   -- EMA сглаженное ratio (α=0.1, обновляется каждую эпоху)
```

**Правило IGC burn/return (зафиксировано):**
- `sell_igc` (продажа IGC → TON): `total_igc_minted -= amount` — IGC возвращается в нечеканеный пул
- In-game расходы (электричество, ремонт, инфра, казна синдиката): `total_igc_burned += amount` — IGC сжигается навсегда

**IGC лимит изменён на 10 000 000 000** (было 1 000 000 000). Обновлено в: `backend/src/routes/action.ts` (`IGC_MAX_SUPPLY`), `backend/src/routes/sync.ts` (`remaining: 10_000_000_000 - ...`), `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Market.tsx`.

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

**Индексированный тариф электричества (сезон + IGC-рынок):**

Итоговый множитель: `elecMult = сезонMult × ratioMult`

```typescript
// Сезонная составляющая — симметричная противофаза к наградам
// Нейтраль = 1.0, диапазон ±25%
const seasonMod  = 1 + 0.25 * Math.sin(2 * Math.PI * cycleDay / 28);
const seasonMult = 2.0 - seasonMod; // Лето=0.75 · Норма=1.0 · Зима=1.25

// Рыночная составляющая — индексация по IGC-ratio
// Дефицит (ratio<1) → дешевле → стимулирует майнинг
// Профицит (ratio>1) → дороже → сдерживает производство IGC
const ratioMult = Math.max(0.85, Math.min(1.20, 1.0 + (igcRatio - 1.0) * 0.20));

const elecMultiplier = seasonMult * ratioMult;
```

| Сезон / Рынок | ratio=0.5 (дефицит) | ratio=1.0 (норма) | ratio=2.0 (профицит) |
|---|---|---|---|
| Лето (×0.75) | **×0.675** | ×0.75 | ×0.90 |
| Норма (×1.00) | ×0.90 | **×1.00** | ×1.20 |
| Зима (×1.25) | ×1.125 | ×1.25 | **×1.50** |

**Redis-ключ:** `epoch:elec_mult` — обновляется каждую эпоху в `epochRunner.ts`, читается в `sync.ts` и отдаётся клиенту как `igcSupply.electricityMult`.

**Фронтенд:** бейдж `+12%` / `−8%` показывается рядом со строкой «Расход IGC/д» в стат-панели фермы и в `GpuDetailModal → Электричество`. Не показывается если отклонение < 2%.

**Константы (`backend/src/epoch/constants.ts`):**
```typescript
export const ELEC_RATIO_MULT_MIN    = 0.85;
export const ELEC_RATIO_MULT_MAX    = 1.20;
export const ELEC_RATIO_SENSITIVITY = 0.20;
export const REDIS_ELEC_MULT        = 'epoch:elec_mult';
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
ADSGRAM_SECRET=         # Секрет для проверки reward-callback от Adsgram (опционально)

# frontend/.env
VITE_API_URL=           # URL backend API
VITE_TON_MANIFEST_URL=  # URL tonconnect-manifest.json
VITE_ADSGRAM_BLOCK_ID=  # Block ID из кабинета Adsgram (сейчас: 33253 — тестовый блок)
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

## Ключевые поведения (зафиксированные решения)

### Аутентификация
- `initData` считается валидной до **7 дней** (auth_date + 604 800 000 мс). Файл: `backend/src/auth/telegramAuth.ts`.
- В dev-режиме: bypass через `X-Dev-User-Id` заголовок (без проверки подписи).

### optimisticMode — мгновенное переключение режима майнинга

`optimisticMode` живёт в `App.tsx` и передаётся в `BalanceBar`, `Dashboard`, `Syndicate`.

**Архитектура:**
```typescript
// App.tsx
const [optimisticMode, setOptimisticMode] = useState<'pool'|'solo'|null>(null);
const optimisticSetAt = useRef(0);

const setOptMode = useCallback((m: 'pool'|'solo'|null) => {
  if (m !== null) optimisticSetAt.current = Date.now();
  setOptimisticMode(m);
}, []);

// Сброс: при каждом свежем sync через ≥2с после установки
useEffect(() => {
  if (!optimisticMode || !data) return;
  if (Date.now() - optimisticSetAt.current >= 2000) setOptimisticMode(null);
}, [data, optimisticMode]);
```

**Где устанавливается:**
- `Dashboard.tsx` — кнопка toggle_mode: `setOptMode(nextMode)`
- `Syndicate.tsx` — join/create → `setOptMode('pool')`, leave → `setOptMode('solo')`

**Почему timestamp, а не "совпадение с сервером":** схема `serverMode === optimisticMode → reset` ломается когда action упал с ошибкой (сервер не обновился, а optimisticMode застрял навсегда). С timestamp — гарантированный сброс через ≤8 секунд (sync каждые 6с + 2с задержка).

### Бета-режим (временные фичи — убрать перед продакшном)

- **20 TON при регистрации**: в `registerNewPlayer()` в `sync.ts` — константа `BETA_START_TON = 20`. Помечена комментарием `⚠️ БЕТА`.
- **Экран загрузки**: бейдж `BETA` между `MINER` и прогресс-баром в `App.tsx → LoadingSplash`.

### Ad Boost (Adsgram)
- Компонент: `frontend/src/components/AdBoost.tsx`
- Интеграция: **нативный Adsgram SDK** (`window.Adsgram`) через `<script src="https://sad.adsgram.ai/js/sad.min.js">` в `index.html`. **НЕ** `@adsgram/react` — он вызывал критические React-краши.
- Буст хешрейта: **1 просмотр = +5 минут** (+300 секунд), максимум **10 просмотров на цикл = 50 минут** буста. Потом обязательный **cooldown 4 часа**. Новый цикл после cooldown.
- Эффект: **+10% к хешрейту** (применяется в `epochRunner.ts` из Redis).
- Буст выдаётся **server-side**: Adsgram вызывает `/api/adsgram-reward?user_id=[userId]` после досмотра. Клиент вызывает `onUpdate()` для обновления UI.
- `boostEndTime` накапливается в Redis (`tap:boost:end:{userId}`), локально в `localStorage('adBoost_endTime')` — переживает переход вкладок.
- Состояния UI: inactive (показать кнопку) → boost active (таймер синим) → cooldown (таймер красным, кнопка скрыта).
- `WebApp.expand()` вызывается до и после показа рекламы — восстанавливает состояние TMA после оверлея.
- Вся работа с Adsgram обёрнута в try/catch — ошибки SDK не роняют приложение.

**Redis ключи Ad Boost:**
- `tap:boost:end:{userId}` — timestamp окончания буста (Unix seconds)
- `ad:count:{userId}` — счётчик просмотров в текущем цикле (TTL авто)
- `ad:cooldown:{userId}` — флаг cooldown (TTL = AD_COOLDOWN_SEC = 14400)

**Константы (`backend/src/epoch/constants.ts`):**
```typescript
export const AD_BOOST_SEC           = 300;     // +5 минут за просмотр
export const AD_VIEWS_PER_CYCLE     = 10;      // просмотров до паузы
export const AD_COOLDOWN_SEC        = 14400;   // 4 часа cooldown
export const REDIS_AD_COUNT_PREFIX    = 'ad:count:';
export const REDIS_AD_COOLDOWN_PREFIX = 'ad:cooldown:';
```

**Reward endpoint (`backend/src/routes/adsgramReward.ts`):**
- `GET /api/adsgram-reward?user_id=[userId]&token=SECRET`
- Adsgram вызывает server-to-server когда пользователь досмотрел рекламу
- Проверяет `ADSGRAM_SECRET` env var (если задан)
- Добавляет +300 сек к бусту, инкрементирует счётчик, при 10 просмотрах ставит 4h cooldown
- URL в кабинете Adsgram: `https://syndicate-backend-production-c797.up.railway.app/api/adsgram-reward?user_id=[userId]`

**Глушение ошибок SDK (`frontend/src/App.tsx`):**
```typescript
window.addEventListener('unhandledrejection', e => {
  if (msg.includes('dgram') || msg.includes('adsgram') || msg.includes('ad')) {
    e.preventDefault(); // не крашим React ErrorBoundary
  }
});
```

### IGC Emission визуализация (Dashboard + Market)
- Бары нормализованы к `totalMinted` (не к 10B cap) — "Добыто" всегда = 100%, остальные пропорционально.
- "Всего" строка = 10B (константа IGC_MAX), цвет rgba(255,255,255,0.15).
- Процентные подписи: ≥1% → 1 знак, ≥0.01% → 3 знака, иначе "<0.01%".

### Синдикаты
- Создание: 2000 IGC, вычитается из баланса, добавляется в казну.
- XP: 1 IGC взноса в казну = 1 XP; +50 XP лидеру при выигрыше solo-блока.
- Уровни 1–50, XP нужны: лвл 1–10 по 1000/лвл, 11–20 по 2000, 21–30 по 4000, 31–40 по 7000, 41–50 по 11000.
- Milestones (пассивные бонусы на всех членов): лвл 10/20/30/40/50.
- Pool-майнинг требует членства в синдикате (проверка в `action.ts:set_mode`).
- API список синдикатов: `GET /api/syndicates` — только с местами (member_count < max_members).

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
- ✅ 7 вкладок: Dashboard, Farm, Shop, Клан (Syndicate), Market, Leaderboard, Company
- ✅ `useSync.ts` — синхронизация каждые 6 сек через `/api/sync` (защита от конкурентных запросов через `syncing = useRef(false)`)
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

> ⚠️ **Redis публичный прокси нестабилен** (июнь 2026) — прокси принимает TCP-соединение, но не отвечает на Redis-команды. `GET /health` возвращает `"redis":false`. **TODO: поменять Redis-инстанс или URL.**

> ⚠️ **Redis fallback:** Если Redis недоступен, все Redis-вызовы падают через `catch` в течение ≤1.5с (настроены `commandTimeout: 1500`, `connectTimeout: 1500`, `enableOfflineQueue: false`). Игра работает без Redis, но без: буста рекламы, кэша хешрейта, стейкинг-истории.

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
| `VITE_ADSGRAM_BLOCK_ID` | `33253` (тестовый блок Adsgram) |

### База данных

- **Supabase** проект: `xzyhrfvrywkctgcsxuvm`
- Все 6 миграций применены: `001_initial.sql`, `002_monitoring.sql`, `003_withdrawal_queue.sql`, `004_gpu_enhancements.sql`, `005_gpu_stored_status.sql`, `006_igc_supply_tracking.sql`
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

## Новые механики — Roadmap (из TFT FARM spec)

### Что берём и в каком порядке

**✅ Спринт 1 (в работе):**
- **Температура** — видимый показатель в GpuDetailModal. `T = T_ambient + T_load + T_oc - T_cooling`. Только UI, бэкенд не меняется. Цвет: ≤60°C зелёный, 61–75°C жёлтый, 76–85°C оранжевый, >85°C красный.
- **Uptime** — константа в `GPU_SPECS` (базовый % стабильности по тиру). Только отображение. Экономика не меняется.

**🟡 Спринт 2 (после стабилизации Спринта 1):**
- Uptime в формуле `epochRunner.ts` (`Доход = R_epoch × H × Uptime / H_global`)
- Новые инфраструктурные апгрейды: **Серверная** (снижает T_ambient), **UPS** (+Uptime глобально), **Розетка** (скидка на IGC/электричество)
- Мастерская расширяется до Lv5 (−80% ремонт)

**🟡 Спринт 3 (только если Спринт 2 стабилен):**
- Поузловые апгрейды майнера за IGC: chip (+% хешрейт), paste (−T°), fan (+Uptime)
- Таймеры апгрейдов (с возможностью пропустить за IGC)

**🔴 Не берём:**
- Крио-стейкинг TON (смарт-контракты, сложность несоразмерна)
- TFT / STON.fi (юридические риски)
- Gacha за TON (азартные игры в большинстве юрисдикций)
- Глобальный сброс (Фаза 4) — убивает retention
- Замена GPU на ZV-серию (SM уже имеет хорошую прогрессию)

### Формула температуры (Спринт 1 — только display)

```typescript
// frontend: только визуал, бэкенд не меняется
const T_AMBIENT = 35; // до добавления Серверной в Спринте 2

// T_load по тирам GPU (добавляется в GPU_SPECS)
// T0 USB Nano: +15°C, T1 RX580: +30°C, T2 GTX1660S: +35°C,
// T3 RTX3070: +42°C, T4 RTX4090: +55°C, T5 ASIC S19: +65°C, T6 Quant X1: +75°C

// Cooling reduction (из существующих cooling_level):
// Lv0: 0°C, Lv1: -8°C, Lv2: -20°C, Lv3: -30°C

// Режимы работы:
// OC (+overclock): +15°C
// UV (undervolt):  -5°C

function calcTemp(tier, coolingLevel, overclocked, undervolted) {
  const T_COOLING = [0, 8, 20, 30][coolingLevel] ?? 0;
  return T_AMBIENT + GPU_SPECS[tier].tempLoad
    + (overclocked ? 15 : 0)
    - (undervolted ? 5 : 0)
    - T_COOLING;
}
```

### Uptime по тирам (Спринт 1 — только display)

| Тир | Модель | Base Uptime |
|---|---|---|
| 0 | USB Nano | 95% |
| 1 | RX 580 | 90% |
| 2 | GTX 1660 S | 88% |
| 3 | RTX 3070 | 86% |
| 4 | RTX 4090 | 84% |
| 5 | ASIC S19 | 82% |
| 6 | Квантовый X1 | 80% |

---

## Что осталось сделать

1. **Деплой контрактов** (Фаза 2): пополнить кошелёк `kQCXYPVOvG6SySkl1SVjAIrn1_QhvjSpYPU5_pdmr9fpuUuH` тестовым TON через `@testgiver_ton_bot` → запустить `npx blueprint run deployPool --testnet`
2. **Бот-процесс**: запустить `bot/` на отдельном хостинге (Railway или VPS)
3. **Починить Railway private networking**: `redis.railway.internal` возвращает HTTP. Пока используется публичный прокси `kodama.proxy.rlwy.net:53274`.
4. **Stress-test экономики**: `npm run stress-test -- --players=100` перед открытым бета-запуском
5. **Удалить debug console.log** в `backend/src/routes/sync.ts` после окончания отладки.
6. **P2P-маркетплейс GPU**: вкладка Market сейчас — IGC-обменник. Если нужна P2P-торговля GPU, это отдельная задача (листинг, escrow, Refurbish).
7. **Adsgram блок** — сейчас подключён тестовый блок `33253`. Нужно подать заявку на новый production-блок (предыдущий `int-33237` был отклонён). После одобрения обновить `VITE_ADSGRAM_BLOCK_ID` на Vercel.
8. **⚠️ БЕТА: 20 TON при регистрации** — убрать `BETA_START_TON = 20` из `registerNewPlayer()` в `backend/src/routes/sync.ts` перед запуском смарт-контракта и реальными выплатами.

**Применённые миграции (все в Supabase):**
- `001`–`005` — базовая схема + enhancements
- `006_igc_supply_tracking.sql` — применена вручную через `node -e` с `ssl: { rejectUnauthorized: false }` (прямое подключение без `?sslmode=require`)
- `007_backfill_igc_supply.sql` — добавляет `igc_ratio_smoothed`, бэкфиллит `total_igc_minted` из текущих балансов пользователей
- `008_syndicates.sql` — применена через Supabase MCP 2026-05-25; таблицы syndicates, syndicate_members, syndicate_bonuses, syndicate_votes; дефолт solo для новых игроков
- **Inline SQL (2026-05-30):** сдвиг уровней апгрейдов на −1 и обновление defaults:
  ```sql
  -- gpus: paste_level и fan_level: DEFAULT 1→0, данные: level-1
  UPDATE gpus SET paste_level=GREATEST(0,paste_level-1), fan_level=GREATEST(0,fan_level-1);
  ALTER TABLE gpus ALTER COLUMN paste_level SET DEFAULT 0, ALTER COLUMN fan_level SET DEFAULT 0;
  -- farms: server_room_level, ups_level, provider_level: DEFAULT 1→0, данные: level-1
  UPDATE farms SET server_room_level=GREATEST(0,server_room_level-1), ups_level=GREATEST(0,ups_level-1), provider_level=GREATEST(0,provider_level-1);
  ALTER TABLE farms ALTER COLUMN server_room_level SET DEFAULT 0, ALTER COLUMN ups_level SET DEFAULT 0, ALTER COLUMN provider_level SET DEFAULT 0;
  ```

---

## Изменения (сессия 2026-06-03)

### Жидкостное охлаждение GPU — убрано воздушное (level 1)

**Файлы:** `backend/src/epoch/constants.ts`, `frontend/src/types.ts`, `frontend/src/components/GpuDetailModal.tsx`, `frontend/src/pages/Guide.tsx`

Уровень 1 (воздушное охлаждение, бесплатно) убран из списка апгрейдов. Теперь 3 платных уровня:
- Lv1 → −10°C, 500 IGC (базовое жидкостное)
- Lv2 → −20°C, 1500 IGC (продвинутое жидкостное)
- Lv3 → −35°C, 4500 IGC (иммерсионное охлаждение) ← новый уровень

`cooling_level = 1` в DB — дефолт (без апгрейда), не отображается как уровень для покупки. `LIQUID_COOLING_LEVELS` начинается с `level: 2`. Текущее состояние без охлаждения показывается как "Нет охлаждения" (не "Воздух").

### Провайдер — скидка теперь применяется в UI

**Файл:** `frontend/src/components/GpuDetailModal.tsx`, `frontend/src/pages/Farm.tsx`

**Баг:** `farmProvider` проп принимался в GpuDetailModal, но не применялся к расчёту `rawDayCost`. `calcFarmStats` в Farm.tsx тоже не знал о провайдере. Бэкенд честно списывал меньше, но UI показывал полную цену.

**Исправление:**
- `GpuDetailModal`: `rawDayCost = baseIgcCost × electricityMult × (1 − igcDiscountPct/100)`
- `Farm.tsx calcFarmStats`: добавлен параметр `providerLevel`, скидка применяется per-GPU
- `PROVIDER_LEVELS` импортирован в `GpuDetailModal.tsx`

Скидки: Lv1 −20%, Lv2 −40%, Lv3 −60%, Lv4 −80% от стоимости электричества.

### Расход/день — добавлен амортизированный ремонт

**Файлы:** `frontend/src/types.ts`, `frontend/src/components/GpuDetailModal.tsx`, `frontend/src/pages/Farm.tsx`

РАСХОД/ДЕНЬ теперь = электричество + техобслуживание + **амортизированный ремонт**.

**Формула ремонта/день:**
```
wearPerDay = baseWearPerEpoch × kTemp × kLoad × kUndervolt × 288
repairPerDay = wearPerDay × BASE_REFURBISH_COST(3) × TIER_MULT[tier]
```

Где:
- `kTemp = WEAR_COOLING_KTEMP[farmCoolingLevel]` — `{0:1.8, 1:1.3, 2:1.0, 3:0.85}`
- `kLoad = 2.5` при OC, иначе 1.0
- `kUndervolt = 0.70` при UV, иначе 1.0

**Добавлено в types.ts:** `baseWearPerEpoch` в `GPU_SPECS`, константы `WEAR_COOLING_KTEMP / WEAR_OVERCLOCK_MULT / WEAR_UNDERVOLT_MULT`.

**GpuDetailModal:** новый проп `farmCooling: number` (передаётся из `farm.coolingLevel`).

**calcFarmStats (Farm.tsx):** новый параметр `coolingLevel`, суммирует `repairPerDay` для каждой активной карты.

Пример RTX 3070 при lv2 охлаждения фермы: ~216 (elec+maint) + ~17.6 (ремонт) = ~233.6 IGC/день.

### Farm Cooling — добавлена кнопка покупки в UI

**Файлы:** `frontend/src/pages/Farm.tsx`, `frontend/src/i18n.ts`

`cooling_level` фермы существовал в DB и влиял на износ (COOLING_KTEMP), но кнопки покупки в UI не было. Добавлена строка `InfraUpgradeRow` для Farm Cooling (🌡️) первым в секции инфраструктуры:
- Lv1: 100 IGC (IGC-цена), Lv2: 3 TON, Lv3: 15 TON
- Показывает предупреждение `⚠️ ×1.8 износ — ПЕРЕГРЕВ` при level=0
- `ServerRoom` компонент получил проп `userIgc` для IGC-покупок
- `InfraUpgradeRow` расширен пропом `costIgc`

i18n ключи: `infra_cooling`, `infra_cooling_fx`, `infra_cooling_confirm` (ru + en).

---

## Изменения (сессия 2026-06-02)

### Антимонопольное законодательство

**Файлы:** `backend/src/epoch/constants.ts`, `backend/src/epoch/epochRunner.ts`, `frontend/src/pages/Guide.tsx`

**Константы:**
```typescript
// constants.ts
ANTITRUST_PLAYER_CAPS    = { 1: 0.15, 2: 0.10, 3: 0.05, 4: 0.05 }  // макс % глобального хешрейта
ANTITRUST_SYNDICATE_CAPS = { 1: 0.25, 2: 0.20, 3: 0.15, 4: 0.15 }  // макс % от пула pool-майнеров
ANTITRUST_MIN_GLOBAL_HASHRATE = 200  // GH/s, порог активации
```

**Логика (epochRunner.ts — после расчёта globalHashrate, до distributePoolReward):**
1. **Индивидуальный кап:** `if (snap.hashrate > globalHashrate × playerCap) snap.hashrate = cap`
2. **Синдикатный кап:** считается суммарный H каждого синдиката среди pool-майнеров. При превышении — все участники синдиката масштабируются: `snap.hashrate *= (maxAllowedH / syndicateH)`

Закон не активен пока глобальный хешрейт < 200 GH/s. Карты продолжают работать и добывать IGC — ограничивается только TON-доля.

| Фаза | Игрок макс. | Синдикат макс. |
|------|------------|----------------|
| 1 | 15% | 25% |
| 2 | 10% | 20% |
| 3+ | 5% | 15% |

### UV — скидка 10% на весь IGC-расход (не только электричество)

**Было:** UV снижал только электрическую часть (`watt × 0.001 × 288 × 0.10`). Для RTX 3070 экономия была 5.76 IGC/день (2.7% от 216) — незаметно, т.к. техобслуживание составляет 73% расхода.

**Стало:** UV снижает весь расход: `igcCostPerDay × 0.90`. RTX 3070: −21.6 IGC/день (10%).

**Формула `gpuIgcCostPerEpoch` (electricityBill.ts):**
```typescript
const base = elec + maint;
return base * uvMult * ocMult;  // uvMult = 0.90 при UV
```

**Frontend:** GpuDetailModal.tsx и Farm.tsx теперь используют `spec.igcCostPerDay * 0.90`.

Понятие **"техобслуживание"** (`igcMaintenancePerEpoch`) не показывается игроку отдельно — только общий расход IGC/день.

### Глобальный хешрейт на Дашборде

В карточке "В сети" добавлено:
- 🌐 `460 GH/s глобальный хешрейт` (когда Redis доступен)
- `(11.76%)` — доля хешрейта игрока от глобального

Если Redis недоступен — строка скрыта. Файл: `frontend/src/pages/Dashboard.tsx`, i18n ключ `stat_global_hash`.

### Переименования

- Вкладка **"Стата"** → **"Дашборд"** / "Stats" → "Dashboard"
- Вкладка **"Клан"** → уже было "Синдикат" (ранее)

### Гайд — дополнения

- **OC/UV** — развёрнутые описания с советами "когда использовать"
- **AntitrustSection** — раздел ⚖️ с таблицей лимитов по фазам

### Прочие фиксы

- **Анти-кит лимит (Фаза 1):** лимит 30 TON/сутки на покупку GPU. @Rusnak_Andrei исчерпал лимит — сбрасывается в полночь UTC.
- **Компенсация @Rodion055:** +50 TON вручную (тест/поддержка)
- **Компенсация @Rusnak_Andrei:** +30 TON вручную

---

## Изменения (сессия 2026-06-01)

### Redis — фикс задержки 30+ секунд

**Симптом:** загрузка игры и нажатие кнопок занимали 30+ секунд.

**Причина:** Redis-прокси (`kodama.proxy.rlwy.net`) принимал TCP-соединение но не отвечал на Redis-команды. ioredis с `enableOfflineQueue: true` ставил команды в очередь и ждал по 6-10 секунд каждую. В `/api/sync` — 5-6 Redis-вызовов = 30-60 секунд суммарно.

**Фикс в `backend/src/redis/client.ts`:**
```typescript
{
  maxRetriesPerRequest: 0,
  connectTimeout:       1500,  // 1.5с на TCP handshake
  commandTimeout:       1500,  // 1.5с на ответ команды
  enableOfflineQueue:   false, // мгновенный reject → catch срабатывает сразу
}
```
Теперь при недоступном Redis каждый вызов падает через ≤1.5с в `catch`, игра продолжает работать без кэша.

**Также убраны** debug `console.log` из `backend/src/routes/sync.ts` (строки `[sync] request received`, `[sync] tgUser:` и т.д.).

### Ручная компенсация IGC (@zaeeetc)

Игрок потерял 2000 IGC из-за race condition (до фикса от 1 июня). Компенсация:
```sql
UPDATE users SET igc_balance = igc_balance + 2000 WHERE tg_username = 'zaeeetc';
```

### Транзакции — фиксы типов и знаков

**DB migration 014** (`backend/src/db/migrations/014_transactions_expand_types.sql`):
- Расширен CHECK constraint: добавлены типы `buy_gpu`, `buy_igc`, `referral_bonus`
- Мигрированы старые записи: `type='purchase' AND amount_igc > 0` → `type='buy_igc'`

**action.ts:**
- `buy_gpu` теперь пишет `INSERT INTO transactions type='buy_gpu'` (раньше не писал вообще)
- `buy_igc` теперь пишет `type='buy_igc'` (было `'purchase'`)

**TxLogBlock (Dashboard.tsx):**
- `tonSign`/`igcSign` (-1/0/+1) на каждый тип — знаки теперь корректны:
  - `buy_gpu`: −TON; `buy_igc`: −TON +IGC; `sell_igc`/`marketplace_sale`: +TON −IGC
  - `stake_ton`: −TON; `unstake_ton`: +TON; `refurbish`: −IGC; `referral_bonus`: +IGC

### Реферальный запрос — фикс падения

SQL с вложенным `VALUES` в коррелированном подзапросе падал в PostgreSQL (тихий catch → пустой список рефералов). Переписан как `CASE WHEN` по тиру.

### UV — скидка 10% на весь IGC-расход (не только электричество)

**Было:** UV снижал только электрическую часть (`watt × 0.001 × 288 × 0.10`). Для RTX 3070 экономия была 5.76 IGC/день (2.7% от 216) — незаметно, т.к. техобслуживание составляет 73% расхода.

**Стало:** UV снижает весь расход: `igcCostPerDay × 0.90`. RTX 3070: −21.6 IGC/день (10%).

**Формула `gpuIgcCostPerEpoch` (electricityBill.ts):**
```typescript
const elec  = spec.watt * IGC_PER_WATT_PER_EPOCH * seasonMultiplier;
const maint = spec.igcMaintenancePerEpoch ?? 0;
const base  = elec + maint;
return base * uvMult * ocMult;  // uvMult = 0.90 при UV
```

**Frontend:** GpuDetailModal.tsx и Farm.tsx теперь используют `spec.igcCostPerDay * 0.90` вместо вычитания только электрической части.

Понятие **"техобслуживание"** (`igcMaintenancePerEpoch`) не показывается игроку отдельно — только общий расход IGC/день. Избегаем путаницы с "ремонтом" GPU.

### Гайд — полная переработка

`frontend/src/pages/Guide.tsx` переписан с нуля. Добавлены разделы:
- 🚀 Путь новичка (5 этапов по бюджету, с конкретными действиями)
- 🏗️ Как прокачивать ферму (приоритеты 1–6)
- ⚙️ Solo vs Pool, 💔 Износ и ремонт, 💰 Пул наград + Халвинг
- 💎 IGC-рынок, ⚔️ Синдикаты, 👥 Рефералы
- 📺 AdBoost, 💸 Вывод TON, 😱 Fear & Greed, 🏆 Leaderboard
- Переименование фермового охлаждения: `"Охлаждение"` → `"Жидкостное охлаждение фермы"`

---

## Изменения (сессия 2026-05-31)

### Market — комиссии IGC

Обе операции (buy_igc и sell_igc) облагаются **3% комиссией** платформы.

- **sell_igc:** `grossPayout = amount × price`, `commission = gross × 0.03`, `netPayout = gross − commission`
- **buy_igc:** `buyCommission = actualTonCost × 0.03`, идёт в `admin_earned_ton`

**Frontend:** под полем ввода показывается "Получишь: X TON/IGC" (уже net) и строка "Комиссия платформы: −X (3%)". Подтверждение тоже включает комиссию. `COMMISSION = 0.03` — константа в `Market.tsx`.

### Реферальная система — полный фикс

**Был баг:** IGC-бонусы шли только pool-майнерам (через `distributePoolReward`). Solo-майнеры не генерировали бонусы для инвайтеров.

**Исправлено в `epochRunner.ts`:**
- Отдельный цикл solo-майнеров добавляет L1 (10%) и L2 (3%) бонусы в `refBonusMap`
- Все бонусы из `refBonusMap` начисляются через `creditUser` + `upsertDailyEarnings` + INSERT transactions `type='referral_bonus'`
- Теперь реферальные бонусы видны в лоrе транзакций и истории заработка

**sync.ts — хешрейт реферала:**
```sql
-- Добавлено в запрос рефералов:
COALESCE(SUM(hashrate × oc_mult × uv_mult WHERE status='active'), 0) AS hashrate_gh
```
Маппинг: `hashrateGh: parseFloat(r.hashrate_gh ?? '0')`

**Company.tsx — новый UI:**
- Карточка "Как работает" — блок 💎 с описанием IGC-бонуса (10% L1, 3% L2)
- Карточка "Моя сеть" — под именем реферала: `54.10 GH/s → +2.71 GH/s` (5% для L1, 2% для L2)

### GpuShopModal — блок ТРЕБОВАНИЯ + фикс overlap

**Фикс overlap карточек:** убран `overflow: 'hidden'` с wrapper'а карточки — он зажимал высоту при раскрытии.

**Блок ТРЕБОВАНИЯ** (в expanded секции каждой GPU):

| Строка | Условие | Цвет |
|--------|---------|------|
| 🔧 Ремонт: верстак LvN | `wbLevel >= N` | ✓ зелёный / ✗ красный + подсказка |
| 🔒 Доступна с Фазы N | `phase >= availablePhase` | только для tier 5/6 |
| ⚡ OC/UV | всегда доступно | ✗ только для USB Nano (tier 0) |

`wbLevel` читается из `data.farm` в `GpuShopModal` (раньше не читался).

Компонент `ShopConstraint({ icon, label, met, hint })` — в конце `GpuShopModal.tsx`.

### Прочие изменения

- **Вкладка "Клан" → "Синдикат"** (ru) / "Syndicate" (en) — `i18n.ts`
- **Market.tsx APY** теперь считается от реального `dailyYieldIgc` (не хардкод 5), корректно отражает динамическую ставку стейкинга
- **TX_META** в Dashboard: добавлены `referral_bonus` (👥), `marketplace_sale` (🤝), `marketplace_buy` (🛍️)

---

## Критические баги — решённые (для справки)

### GPU cooling_level перезаписывался cooling_level фермы

В `backend/src/db/queries.ts` запрос GPU:
```sql
SELECT g.*, f.cooling_level   -- ← НЕПРАВИЛЬНО
FROM gpus g JOIN farms f ON f.id = g.farm_id
```
PostgreSQL возвращал два поля с одинаковым именем `cooling_level`. `node-postgres` брал последнее — `f.cooling_level` (охлаждение фермы, 0–3), перезаписывая `g.cooling_level` (жидкостное охлаждение GPU, 1–3). Все GPU показывали уровень жидкостного охлаждения равным уровню охлаждения фермы.

**Решение:** переименовать алиас: `f.cooling_level AS farm_cooling_level` (не используется на фронте — нужен только `g.cooling_level`).

### Бесплатный level 1 в массивах апгрейдов

Массивы PASTE_LEVELS, FAN_LEVELS, SERVER_ROOM_LEVELS, UPS_LEVELS, PROVIDER_LEVELS содержали первый элемент с `cost: 0` и `effect: 0`, который отображался как "куплен" (заполненная точка). Игрок видел "Lv1/4" при старте хотя ничего не покупал.

**Решение:** убрать бесплатный level 1 из всех массивов; level 0 в DB = не куплено. DB-миграция: сдвиг всех значений на −1.

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
| `sell_igc` | Сжигает IGC пользователя, зачисляет TON из резерва пула. Цена = `0.0001 / max(0.5, ratio)`. Минимум 100 IGC | `amount_igc` |
| `buy_igc` | Списывает TON, чеканит IGC из нераспределённого 1B запаса, добавляет TON в пул. Та же формула цены. Минимум 0.001 TON | `amount_ton` |
| `create_syndicate` | Создаёт синдикат (2000 IGC), добавляет создателя лидером, переводит в Pool-режим | `name` |
| `join_syndicate` | Вступает в синдикат по ID (нужно место), переводит в Pool-режим | `syndicateId` |
| `leave_syndicate` | Покидает синдикат (не лидер), переводит в Solo | — |
| `contribute_igc` | Вносит IGC в казну, начисляет 1 XP за 1 IGC, пересчитывает уровень | `amount` |
| `buy_syndicate_bonus` | Покупает временный бонус из казны (только лидер) | `bonusType` |
| `vote_leader` | Голосует за нового лидера; смена при >50% голосов | `candidateId` |
| `kick_member` | Кикает участника (только лидер) | `targetUserId` |
| `dissolve_syndicate` | Растворяет синдикат (только лидер): казна сжигается, все → Solo | — |
| `watch_ad_boost` | (резерв) Прямой клиентский вызов; в продакшне буст выдаётся через `/api/adsgram-reward` | — |

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

### 2× расхождение цены IGC (Market.tsx)

`sync.ts` возвращал ratio из `igc_ratio_smoothed` (≈1.0), а `action.ts` читал из `igc_monitor_log.daily_ratio` (≈0.5). Sell показывал 0.01 TON, а зачислял 0.02 TON. Buy давал вдвое меньше IGC чем ожидалось.

**Решение:** Оба файла теперь читают `igc_ratio_smoothed` из `pool_stats` — единый источник истины. Отдельный запрос к `igc_monitor_log` в sync.ts удалён.

### totalIgcProduced всегда 0 в epochRunner.ts

`totalIgcProduced` объявлялся в 0 снаружи цикла, но внутри цикла после `igcPerEpoch.set(user.id, igcEarned)` не прибавлялся. `epoch_log` записывал `epoch_supply = 0`.

**Решение:** добавлена строка `totalIgcProduced += igcEarned` внутри цикла после set.

### IGC burn не отражался в total_igc_burned (множество мест)

Только `sell_igc` в `action.ts` обновлял `total_igc_burned`. Всё остальное — нет.

**Все потоки, теперь отражённые:**
| Поток | Файл | Как исправлено |
|---|---|---|
| Электричество (эпоха) | `epochRunner.ts` | `totalIgcBurned += totalIgcConsumed` в UPDATE pool_stats |
| Инфраструктура (action) | `action.ts` | `UPDATE pool_stats SET total_igc_burned = total_igc_burned + cost.igc` для покупок с IGC-ценой |
| Ремонт GPU | `db/queries.ts → restoreGpu()` | `UPDATE pool_stats SET total_igc_burned = total_igc_burned + costIgc` внутри транзакции |
| Продажа IGC | `action.ts` | уже работало |

### Двойной запуск эпохи (cron.ts + dailyCron.ts)

Оба файла регистрировали `*/5 * * * *`. В `epoch_log` появлялись дублирующиеся записи с одинаковым timestamp.

**Решение:** `dailyCron.ts` — расписание `syncPoolBalance` изменено с `*/5` на `*/7 * * * *`.

### Redis блокировал pool_stats update (igcMonitor.ts)

`Promise.all([redis.set(), redis.set(), pool.query()])` — если Redis недоступен, весь Promise.all падал и `pool_stats.igc_ratio_smoothed` не обновлялся.

**Решение:** `pool.query()` вызывается первым (всегда), Redis-записи в отдельном `try/catch`:
```typescript
await pool.query(`UPDATE pool_stats SET igc_ratio_smoothed = $1 WHERE id = 1`, [ratio]);
try {
  await redis.set(R_RATIO, ratio.toFixed(6));
} catch { /* Redis недоступен */ }
```

### useSync — конкурентные запросы и stale closure

`setInterval` запускал `sync()` каждые 2с, но если запрос занимал >2с — запросы накапливались параллельно (race condition). Первый ответ мог перезаписать более свежий второй.

**Решение:**
```typescript
const syncing = useRef(false);  // guard от параллельных вызовов
const hasData = useRef(false);  // stale closure fix (заменяет if(data) return)

const sync = useCallback(async () => {
  if (syncing.current) return;
  syncing.current = true;
  try {
    const snapshot = await fetchSync(...);
    hasData.current = true;
    setData(snapshot);
  } catch (e) {
    if (hasData.current) return; // после первого успеха — тихий фейл
    setError(...);
  } finally {
    syncing.current = false;
  }
}, []);
```

Интервал увеличен с 2000 до 6000 мс — достаточно для игры, меньше нагрузки.

### @adsgram/react крашит React ErrorBoundary

`@adsgram/react` хук бросал непойманные исключения при ошибках показа рекламы (нет инвентаря, сессия истекла и т.д.). Эти исключения попадали в React ErrorBoundary и крашили всё приложение.

**Решение:** Полностью удалён `@adsgram/react`. Используется нативный `window.Adsgram` SDK (подключен как `<script>` в `index.html`). Вся работа обёрнута в try/catch:
```typescript
const adController = await window.Adsgram!.init({ blockId: ADSGRAM_BLOCK_ID });
try {
  result = await adController.show();
} finally {
  try { adController.destroy(); } catch {}
}
```
Дополнительно в `App.tsx` — глушение `unhandledrejection` для ошибок ad-SDK.

### EMA smoothing для IGC ratio

Формула: `ratio = 0.1 × rawRatio + 0.9 × prevSmoothed` (α=0.1, half-life ≈33 мин при эпохе 5 мин).
- Предыдущее значение читается из `pool_stats.igc_ratio_smoothed` (не Redis)
- Записывается в `pool_stats.igc_ratio_smoothed` (primary) и Redis (cache/fallback)
- Реализовано в `backend/src/monitoring/igcMonitor.ts`

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

**OC (разгон, +20% хешрейта):** все IGC-затраты ×1.20 (`OVERCLOCK_COST_MULT`). Расчёт в `calcFarmStats` / `gpuIgcCostPerEpoch`:
```typescript
igcCostDay += spec.igcCostPerDay * 1.20;
```

**UV (андервольт, −15% хешрейта):** только электричество −10%, износ −30%:
```typescript
igcCostDay += spec.igcCostPerDay - spec.wattBackend * 0.001 * 288 * 0.10;
```

OC и UV взаимно исключают друг друга — включение одного сбрасывает другой.

**Ремонт (IGC-синк):** базовый износ настроен на ~30 дней до 50% здоровья (T2–T5), T6 — ~43 дня. При 50% health ремонт стоит: T3 — 525 IGC, T4 — 1050 IGC, T5 — 3000 IGC, T6 — 7500 IGC. T3 и T6 уходят в IGC-минус с учётом ремонта (двигают спрос на рынке). С разгоном (OC ×2.5 к износу) — 50% достигается за ~12 дней.

| Тир | Модель | hashrate (GH/s) | priceTon | igcPerDay | igcCostPerDay | wattBackend | baseWearPerEpoch | Дней до 50% |
|---|---|---|---|---|---|---|---|---|
| 0 | USB Nano | 0.1 | 0 | 1.44 | 0 | 0 | 0 | ∞ |
| 1 | RX 580 | 3 | 1.5 | 43.2 | 14.4 | 50 | 0.0052 | ~33 |
| 2 | GTX 1660 S | 6 | 2.5 | 86.4 | 43.2 | 100 | 0.0058 | ~30 |
| 3 | RTX 3070 | 15 | 8 | 216.0 | 216.0 | 200 | 0.0058 | ~30 |
| 4 | RTX 4090 | 45 | 25 | 648.0 | 676.8 | 350 | 0.0056 | ~31 |
| 5 | ASIC S19 | 110 | 55 | 1584.0 | 1785.6 | 1200 | 0.0058 | ~30 |
| 6 | Quantum X1 | 250 | 140 | 3600.0 | 3600.0 | 500 | 0.0040 | ~43 |

"Дней до 50%" — при охлаждении Lv2, без разгона. С OC (×2.5 к износу) — в ~2.5 раза быстрее (~12 дней для T2–T5).

Хешрейт отображается через `fmtH(h)`: `h >= 1000` → TH/s, `h >= 1` → GH/s, иначе → MH/s. Значения выше — в GH/s (как в backend). Используется везде: GpuCard, GpuDetailModal, Farm stats, Leaderboard.

Тир 4+ — расход IGC на свет превышает добычу. Предупреждение показывается в Shop.

---

## UI компоненты — особенности реализации

### История заработка (Redis earn:d)

**Архитектура:** заработок кэшируется в Redis в `epochRunner.ts` после каждой раздачи наград, `sync.ts` читает из Redis — без SQL-запросов.

**Redis-ключи:** `earn:d:{userId}:{YYYY-MM-DD}` → hash `{ ton, igc }`, TTL 9 дней. Запись через `HINCRBYFLOAT` (атомарное накопление за несколько эпох в сутки). Чтение — pipeline из 8 hgetall (сегодня + 7 дней = один round-trip ~1мс).

Если Redis недоступен — `earnings` возвращает нули, фронтенд показывает `—`. Ошибка не бросается.

**Фронтенд:** карточка «📊 История заработка» в `Dashboard.tsx` — два блока (Вчера / 7 дней) с TON и IGC. Нулевые значения отображаются как `—`.

### Система синдикатов (Фаза 5)

**Концепция:** Каждый новый игрок стартует в Solo-режиме. Pool-майнинг (стабильный доход) требует синдиката. Синдикат — это группа игроков с общей казной, XP и уровнями.

#### Механика

- Создание синдиката: **2 000 IGC** (сжигается). Создатель становится лидером.
- Максимум участников: 10 (база), растёт с уровнями синдиката (до 16 на Lv50)
- Один игрок — один синдикат
- Вступление переводит в Pool-режим, выход/кик → Solo

#### XP и уровни

**Источники XP:**
- 1 IGC взноса в казну = 1 XP
- +50 XP синдикату при победе участника в Solo-блоке

**Стоимость уровней (SYNDICATE_LEVEL_XP_COSTS):**

| Уровни | XP за уровень | Накопленный XP до Lv N |
|---|---|---|
| 1→10 | 1 000 XP/ур | 10 000 XP до Lv10 |
| 11→20 | 2 000 XP/ур | 30 000 XP до Lv20 |
| 21→30 | 4 000 XP/ур | 70 000 XP до Lv30 |
| 31→40 | 7 000 XP/ур | 140 000 XP до Lv40 |
| 41→50 | 11 000 XP/ур | 250 000 XP до Lv50 |

#### Пассивные бонусы (SYNDICATE_LEVEL_MILESTONES)

Применяются ко всем участникам автоматически в `epochRunner.ts`:

| Уровень | +% хешрейта | −% износа | Макс участников |
|---|---|---|---|
| <10 | — | — | 10 |
| 10 | +3% | — | 10 |
| 20 | +8% | −10% | 10 |
| 30 | +15% | −10% | 12 |
| 40 | +24% | −20% | 14 |
| 50 | +35% | −30% | 16 |

#### Покупаемые бонусы из казны (SYNDICATE_BONUS_DEFS)

Покупает только лидер, действуют на весь синдикат:

| type | Эффект | IGC | Требуется Lv | Длительность |
|---|---|---|---|---|
| `boost_x1` | +10% хешрейт | 200 | 1 | 2 часа |
| `boost_x2` | +20% хешрейт | 500 | 10 | 4 часа |
| `shield_break` | карты не ломаются | 800 | 20 | 24 часа |
| `season_shield` | иммунитет к зиме | 600 | 30 | 7 дней |
| `double_reward` | ×2 соло-награда | 1 500 | 40 | 1 час |
| `domination` | +50% хешрейт | 3 000 | 50 | 1 час |

#### Голосование за лидера

- Любой участник может выдвинуть кандидата (`vote_leader`)
- При превышении 50% голосов — автоматическая смена лидера
- После смены — все голоса сбрасываются

#### База данных

```sql
syndicates        -- id, name, leader_id, level, xp, treasury_igc, created_at
syndicate_members -- syndicate_id, user_id, role('leader'|'member'), joined_at
                  -- UNIQUE INDEX на user_id (один синдикат на игрока)
syndicate_bonuses -- id, syndicate_id, type, expires_at, created_at
syndicate_votes   -- syndicate_id, candidate_id, voter_id, created_at
                  -- PRIMARY KEY (syndicate_id, voter_id) = один голос на участника
```

#### Применение в epochRunner

В каждой эпохе:
1. Загружаются все `syndicate_members` + `syndicate_bonuses` (WHERE expires_at > NOW())
2. Для каждого пользователя → определяется `hashrateBonus` (пассивный milestone + временные boost_x1/x2/domination)
3. `totalUserH *= (1 + hashrateBonus)` — после реферального бонуса
4. Износ: `reducedWear = wearApplied × (1 - wearReduction)` — для участников синдиката
5. `shield_break` актив → `finalBroken = false` (GPU не ломается)
6. При Solo-победе участника: `xp += SYNDICATE_XP_PER_BLOCK_WIN (50)`, пересчёт уровня

#### SyncData — поле `syndicate`

```typescript
interface SyndicateData {
  id: string; name: string; level: number; xp: number;
  xpToNext: number; xpProgress: number; treasuryIgc: number;
  memberCount: number; maxMembers: number; role: 'leader'|'member';
  hashrateBonus: number; wearReduction: number;
  activeBonuses: { type: string; expiresAt: string }[];
  members: { userId: string; username: string|null; role: string }[];
}
// null если игрок не в синдикате
```

### Dashboard.tsx

- Показывает **👥 В сети** (totalUsers) и **🖥️ Майнеров** (activeMiners) — данные приходят из `/api/sync` в поле `network`
- Показывает блок **💎 Эмиссия IGC — 10 000 000 000 max** если `data.igcSupply` есть:
  - 🟣 Добыто всего, 🔥 Сожжено, 🔄 В обращении, ⬜ Не добыто — каждая строка с прогресс-баром
  - Значения **анимируются** через `useAnimatedNumber(target, 1200)` — плавный переход при каждом sync-обновлении
  - `fmtBig(n)`: форматирование числа с суффиксом M/K
- Хешрейт фермы рассчитывается из `GPU_SPECS[g.modelTier].hashrate` (в GH/s) + OC ×1.20 + UV ×0.85, форматируется через `fmtH()`
- **Карточка "День/Сезон"** (StatCard с sub):
  - `modStr`: `+X% к ставке` / `-X% к ставке` / `базовая ставка` (из синусоидального сезонного множителя)
  - `daySub`: `${modStr} · до ${SEASON_NEXT[name]} ${daysLeft}д.` или `смена сезона!` если 0 дней
  - Цвет sub: зелёный (модификатор > 0), красный (< 0), серый (= 0)
  - `SEASON_ENDS = { spring:7, summer:14, autumn:21, winter:28 }`
  - `SEASON_NEXT = { spring:'☀️ Лето', summer:'🍂 Осень', autumn:'❄️ Зима', winter:'🌸 Весна' }`
- **Карточка "Фаза"** (StatCard с sub):
  - `phaseSub`: `база ${rate}%/д · ${totalPaid.toFixed(0)}/${threshold} TON` (прогресс к халвингу)
  - Для финальной фазы 4: `база 0.5%/д · финальная фаза`
  - `PHASE_BASE = { 1:4, 2:2, 3:1, 4:0.5 }`, `PHASE_THRESHOLD = { 1:1_000, 2:10_000, 3:100_000, 4:null }`

### GpuIcon.tsx

SVG-компонент иконки видеокарты. Заменяет эмодзи во всех местах где отображается GPU. Файл: `frontend/src/components/GpuIcon.tsx`. Props: `tier: number`, `size?: number` (default 36).

| Тир | Модель | Дизайн | Цвет |
|---|---|---|---|
| 0 | USB Nano | USB-флешка с LED | Синий |
| 1 | RX 580 | 1 вентилятор + рёбра радиатора | Красный (AMD) |
| 2 | GTX 1660 S | 1 вентилятор + рёбра | Зелёный (Nvidia) |
| 3 | RTX 3070 | 2 вентилятора | Голубой |
| 4 | RTX 4090 | 2 вентилятора | Оранжевый |
| 5 | ASIC S19 | Вентиляционная решётка | Золотой |
| 6 | Quantum X1 | Промышленный blower, 8-pin разъём, предупр. полоса, метка `QNT-X1` | Фиолетовый |

Используется в: `GpuCard`, `GpuDetailModal`, `GpuShopModal`, `Shop`, `Dashboard`.

### GpuCard.tsx

Компактная кликабельная карточка — кнопок нет, всё действия через GpuDetailModal:
- `<GpuIcon tier={tier} size={38} />` вместо эмодзи
- Теги-бейджи `⚡OC` (синий) и `🔋UV` (зелёный) когда включены
- Иконка `💥` при broken, `📦` при stored
- Бейдж здоровья справа: `XX%` / `💥` / `💤` (stored)
- `spec = GPU_SPECS[tier] ?? GPU_SPECS[0]` — всегда fallback на tier 0
- Prop `onClick` — открывает GpuDetailModal в Farm.tsx

### AdBoost.tsx (заменил TapToCool.tsx)

- **Файл:** `frontend/src/components/AdBoost.tsx`
- **Механика:** просмотр рекламы через Adsgram вместо тапов. 1 просмотр = +5 минут буста. 10 просмотров = цикл закончен → 4 часа cooldown → новый цикл.
- Буст даёт **+10% хешрейта** (применяется в `epochRunner.ts` через Redis-ключ `tap:boost:end:{userId}`)
- Буст-состояние поднято в `Farm.tsx`: локальный `boostEndTime` state, localStorage ключ `adBoost_endTime`
- **Интеграция Adsgram:** нативный `window.Adsgram` SDK (script в `index.html`). НЕ npm-пакет `@adsgram/react` — он крашит React
- При досмотре: Adsgram вызывает server-side reward URL, клиент вызывает `onUpdate()` для обновления TapBoost из `/api/sync`
- UI: прогресс-бар 10 сегментов, таймер буста (синий) или cooldown (красный), кнопка скрыта в cooldown

### Shop.tsx — инфраструктура (интерактивные карточки)

Все карточки инфраструктуры кликабельны — разворачиваются аккордеоном (один expanded за раз). Показывают подробные параметры, перки и сравнительную таблицу (для кулеров — 4 колонки: Нет / Lv1 / Lv2 / Lv3).

**Помещения (farm_level_N):**

| action | Помещение | Слоты | Стоимость | Фаза |
|---|---|---|---|---|
| `farm_level_2` | 📦 Кладовка | 10 | 300 IGC | 1 |
| `farm_level_3` | 🚗 Гараж | 20 | 12 TON | **2+** |
| `farm_level_4` | 🏭 Ангар | 50 | 50 TON | **2+** |

**Охлаждение (cooling_N) — COOLING_KTEMP:**

| action | Кулер | Множитель износа (K_temp) | Лейбл | Стоимость |
|---|---|---|---|---|
| без кулера | — | ×1.8 | Перегрев | — |
| `cooling_1` | 🌀 Lv1 | ×1.3 | −28% износа vs без кулера | 100 IGC |
| `cooling_2` | ❄️ Lv2 | ×1.0 | Нормальный износ (базовая норма) | 3 TON |
| `cooling_3` | 🧊 Lv3 | ×0.85 | −15% даже ниже нормы | 15 TON |

**Верстак (workbench_N):**

| action | Верстак | Стоимость | Чинит тиры |
|---|---|---|---|
| `workbench_1` | 🔧 Lv1 | 500 IGC | T1–T2 |
| `workbench_2` | ⚙️ Lv2 | 5 TON | T3–T4 |
| `workbench_3` | 🏗️ Lv3 | 25 TON | T5–T6 |

Action-типы обрабатываются в `default:` блоке `action.ts` через `INFRA_COSTS`. Купленные уровни показываются с зелёным бейджем "Есть" и приглушены (opacity 0.6).

Текущие уровни читаются из `data.farm` с camelCase/snake_case fallback:
```typescript
const farmLevel   = (data.farm as any).level          ?? 1;
const coolingLevel= (data.farm as any).coolingLevel   ?? (data.farm as any).cooling_level   ?? 0;
const wbLevel     = (data.farm as any).workbenchLevel ?? (data.farm as any).workbench_level ?? 0;
```

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
- `<GpuIcon tier={tier} />`, имя, статусные теги `⚡OC` / `🔋UV`
- Бейдж здоровья (цвет: зелёный/жёлтый/красный)
- Специальные иконки: 💥 (broken), 📦 (stored), ● (active, пульсирует)

**GpuDetailModal.tsx** — слайд-ап bottom sheet с разделами:
- Здоровье (прогресс-бар, цветовой код)
- Статистика (хешрейт, IGC/день, расход/день, баланс фермы, охлаждение)
- **Производительность** — тогглы: ⚡ Разгон / 🔋 Undervolt / 🌬️ Кулер
- **Апгрейды GPU**: 💧 Жидкостное охлаждение, 🧴 Термопаста, 🌀 Вентилятор — каждый со своей кнопкой ℹ️
- **Действия**: 💡 Электричество (алерт с деталями), 🔧 Ремонт, 📦 На склад / 🏭 В слот
- Анимация `slideUp` при открытии, закрытие по тапу на backdrop или кнопку ✕
- **Optimistic UI**: действия (`toggle_overclock`, `toggle_undervolting`, `move_to_storage`, `move_from_storage`, `refurbish`) применяются локально мгновенно через `opt` state. `setBusy(false)` сразу после действия, `onUpdate()` вызывается в фоне без await. `useEffect` авто-очищает `opt` когда сервер возвращает новые props GPU.
- **Ремонт** — стоимость показывается до подтверждения. Формула совпадает с backend `wearEngine.ts`:
  ```typescript
  const BASE_REFURBISH_COST = 3;
  const TIER_REFURBISH_MULT = { 0:0, 1:1.0, 2:1.8, 3:3.5, 4:7.0, 5:20.0, 6:50.0 };
  function calcRepairCost(tier, health) { return Math.ceil((100-health)*3*TIER_REFURBISH_MULT[tier]); }
  ```
  Требуемый Верстак по тиру: `tier≤2→Lv1`, `tier≤4→Lv2`, `tier≥5→Lv3`. Если верстака нет — кнопка показывает "нужен Верстак LvN". USB Nano (tier 0) исключён из ремонта полностью.
  Prop `farmWorkbench` передаётся из Farm.tsx: `farmWorkbench={(farm as any).workbenchLevel ?? (farm as any).workbench_level ?? 0}`

**Склад (stored GPUs)**:
- Кнопка `📦 Склад (N)` появляется в шапке блока GPU когда есть хотя бы одна карта на складе
- Разворачивает секцию с хранящимися GPU внизу страницы
- GPU со статусом `stored` не занимают слоты фермы (исключены из COUNT в `buy_gpu`)

**Карточка статистики фермы** (над AdBoost, если есть активные GPU):
- Суммарный хешрейт (с учётом OC/UV)
- IGC доход/день, IGC расход/день, IGC баланс/день (сумма − расход)
- ≈ TON/день = `(farmHashrate / globalHashrate) * poolTon * dripRate`
  - `globalHashrate` читается из Redis → fallback на `epoch_log ORDER BY epoch_at DESC LIMIT 1`
  - Если глобальный хешрейт неизвестен — показывает максимум (100% пула) с пометкой `макс`

### InfoSheet.tsx — кнопки ℹ️ на апгрейдах

Переиспользуемый компонент для отображения информации об апгрейде. Файл: `frontend/src/components/InfoSheet.tsx`.

**Интерфейс:**
```typescript
interface UpgradeInfo {
  emoji:       string;
  title:       string;
  description: string;        // простое описание для новых игроков
  levels:      InfoLevel[];
  costUnit?:   'IGC' | 'TON';
}
interface InfoLevel {
  label:    string;   // "Lv 1", "Воздух (стандарт)"
  effect:   string;   // "-10°C", "+5% uptime"
  cost?:    string;   // "500 IGC", "—" для бесплатного
  current?: boolean;  // подсветить текущий уровень
}
```

**Компоненты:**
- `InfoBtn` — круглая кнопка ℹ️ (18px), `e.stopPropagation()` чтобы не прожать родительский элемент
- `InfoSheet` — bottom sheet с анимацией `infoSheetIn`, закрытие по тапу на backdrop или ✕

**Где используется:**
- `UpgradeRow` в `GpuDetailModal` — 💧 Жидкостное охлаждение, 🧴 Термопаста, 🌀 Вентилятор
- `InfraUpgradeRow` в `Farm.tsx → ServerRoom` — ❄️ Серверная, 🔋 ИБП, 📡 Провайдер

### Система уровней апгрейдов — соглашение

**Уровень 0 = не куплено (базовое состояние без эффекта).** Первый элемент массива = первый платный апгрейд.

| Апгрейд | Уровни в DB | Массив | Макс DB | Default DB |
|---|---|---|---|---|
| Жидкостное охлаждение GPU | 1–3 | `LIQUID_COOLING_LEVELS` (3 эл.) | 3 | 1 (воздух — реальное состояние) |
| Термопаста GPU | 0–3 | `PASTE_LEVELS` (3 эл.) | 3 | 0 |
| Вентилятор GPU | 0–4 | `FAN_LEVELS` (4 эл.) | 4 | 0 |
| Серверная | 0–3 | `SERVER_ROOM_LEVELS` (3 эл.) | 3 | 0 |
| ИБП | 0–3 | `UPS_LEVELS` (3 эл.) | 3 | 0 |
| Провайдер | 0–4 | `PROVIDER_LEVELS` (4 эл.) | 4 | 0 |

> ⚠️ **Жидкостное охлаждение GPU особое:** level 1 = воздух (реальное базовое состояние с 0 эффектом, не "не куплено"). Уровень хранится в `gpus.cooling_level DEFAULT 1`, а не 0.

**Как рассчитывается следующий апгрейд:**
```typescript
// Frontend (массив 0-indexed по position, level 1-based по значению)
const next = PASTE_LEVELS[currentPasteLevel];   // currentLevel = 0 → PASTE_LEVELS[0] = первый платный
const next = UPS_LEVELS.find(l => l.level === currentLevel + 1); // по level-полю

// Backend (action.ts)
const currentLevel: number = farm[col] ?? 0;
const nextDef = levels.find(l => l.level === currentLevel + 1);
```

> ⚠️ **Критичный баг (исправлен):** в `queries.ts` запрос GPU использовал `SELECT g.*, f.cooling_level` — `f.cooling_level` (охлаждение фермы) перезаписывало `g.cooling_level` (жидкостное охлаждение GPU). Исправлено: `f.cooling_level AS farm_cooling_level`.

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

Undervolt-эффект (frontend + backend):
- Хешрейт: ×0.85 (−15%) — `UNDERVOLT_HASHRATE_MULT`
- IGC-расход электричества: −10% (`wattBackend × 0.001 × 288 × 0.10`) — `UNDERVOLT_WATT_MULT = 0.90`
- Износ: ×0.70 (−30%) — `UNDERVOLT_WEAR_MULT`; основная польза UV — продление жизни GPU

### Уведомления Telegram — IGC / остановка майнеров

Логика в `epochRunner.ts`, после обработки электричества каждой фермы:

| Событие | Триггер | Redis-ключ | Дедупликация |
|---|---|---|---|
| ⚠️ Мало IGC | остаток < 1 дня расхода | `igc_warn:{tgUserId}` | TTL **22 часа** |
| 🔴 Майнеры остановлены | `offlineGpuIds.length > 0` или `farmShutdown` | `igc_offline:{tgUserId}` | TTL **4 часа** |

Отправка — fire-and-forget через `sendTgMessage()`, обёрнута в `try/catch`. Не роняет эпоху.

### Market.tsx — IGC Маркет

Вкладка Market заменена с P2P-барахолки (не была реализована) на обменник IGC↔TON:

- **Индекс рынка**: отображает `igcSupply.ratio` с цветовой кодировкой и прогресс-баром
  - ratio ≥ 2.0 → красный "Критический профицит", цена низкая
  - ratio ≥ 1.2 → оранжевый "Лёгкий профицит"
  - ratio ≤ 0.5 → зелёный "Критический дефицит", цена высокая
  - ratio ≤ 0.8 → синий "Лёгкий дефицит"
  - иначе → зелёный "Здоровый рынок"
  - `ratio` и `pricePerIgc` **анимируются** через `useAnimatedNumber(target, 1800)` — плавный переход при sync-обновлении
- **Продать IGC → TON**: `amount_igc` → action `sell_igc`. Минимум 100 IGC. Burns IGC, pays from pool.
- **Купить IGC за TON**: `amount_ton` → action `buy_igc`. Минимум 0.001 TON. Mints IGC, adds TON to pool.
- **Формула цены**: `pricePerIgc = max(0.00005, min(0.0005, 0.0001 / max(0.5, ratio)))`
- Единый источник ratio: **оба** `sync.ts` и `action.ts` читают `igc_ratio_smoothed` из `pool_stats` — не из `igc_monitor_log`. Это критично: разные источники давали 2× расхождение цены (sell показывал 0.01 TON, получал 0.02 TON)
- Показывает балансы пользователя (TON + IGC chips), preview суммы при вводе, кнопку MAX
- Раздел "Как работает цена" с примерами (Дефицит 0.5 / Норма 1.0 / Профицит 2.0)
- Раздел "Эмиссия IGC" с StatRow прогресс-барами (Добыто / Сожжено / В обращении / Не добыто), `max="10B"`

### USB Nano (tier 0) — только при регистрации

- **Не показывается** в магазине (`Shop.tsx` фильтрует `.filter(([t]) => Number(t) !== 0)`)
- **Нельзя купить** через API (`action.ts` возвращает 400 для `buy_gpu` с tier 0)
- **Нельзя продать** (`market.ts` проверяет `gpu.model_tier === 0` → 400)
- **Нельзя разгонять или андервольтить**: frontend скрывает секцию тогглов и показывает notice; backend возвращает 400 для `toggle_overclock` и `toggle_undervolting` если `model_tier = 0`
- **Выдаётся бесплатно** при первом входе в `sync.ts` → `registerNewPlayer()` → INSERT в gpus с tier 0

### Dashboard.tsx

- Показывает **👥 В сети** (totalUsers) и **🖥️ Майнеров** (activeMiners) — данные приходят из `/api/sync` в поле `network`
- Поле `network` добавлено в `SyncData` (`types.ts`) и в ответ `sync.ts` (SQL-запрос одним `SELECT COUNT(*)`)

### SyncData — актуальные поля (types.ts)

```typescript
interface GPU {
  id, modelTier, health, status: 'active'|'broken'|'offline'|'stored',
  overclocked, undervolted,   // ← undervolted: backend types.ts + db/client.ts rowToGpu
  coolingLevel, isRefurbished
}

interface Farm {
  id, level, coolingLevel,
  workbenchLevel: number,     // ← добавлено (из farms.workbench_level)
  maxSlots, igcBalance
}

interface IgcSupply {
  totalMinted:     number; // суммарно добыто (майнинг + buy_igc); лимит 10B
  totalBurned:     number; // суммарно сожжено (электро + ремонт + infra + sell_igc)
  remaining:       number; // 10_000_000_000 - totalMinted
  ratio:           number; // EMA из pool_stats.igc_ratio_smoothed (α=0.1, обновляется каждую эпоху)
  pricePerIgc:     number; // max(0.00005, min(0.0005, 0.0001 / max(0.5, ratio)))
  electricityMult: number; // текущий тариф электричества: сезонMult × ratioMult
                           // читается из Redis 'epoch:elec_mult', fallback — расчёт на лету
}

interface PlayerEarnings {
  yesterdayTon: number;  // TON заработано вчера (UTC-день)
  yesterdayIgc: number;  // IGC заработано вчера
  weekTon:      number;  // TON за последние 7 дней (включая сегодня)
  weekIgc:      number;  // IGC за последние 7 дней
}

interface SyncData {
  user, farm, gpus,
  storedGpus: GPU[],          // ← GPU со статусом 'stored'
  season, igc, tapBoost, events,
  // tapBoost: { active, secondsLeft, adViewsInCycle, adViewsPerCycle, adCooldownSeconds }
  igcSupply?: IgcSupply,      // ← эмиссия IGC (из pool_stats полей 006)
  earnings?: PlayerEarnings,  // ← история заработка из Redis (earn:d:{userId}:{date})
  network: {
    totalUsers, activeMiners,
    globalHashrate: number,   // ← из Redis или epoch_log (fallback)
  }
}
```

`sync.ts` разделяет `rawGpus` на `mappedGpus` (status ≠ 'stored') и `mappedStoredGpus` (status = 'stored') — клиент получает их отдельно.

`globalHashrate` — сначала читается из Redis (`epoch:global_hashrate`), при недоступности Redis — из `SELECT global_hashrate FROM epoch_log ORDER BY epoch_at DESC LIMIT 1`.

### IGC баланс — race condition при покупке (исправлено)

**Симптом:** купленные IGC появлялись на балансе, но пропадали через несколько минут.

**Причина:** `updateFarmIgc` в `backend/src/db/client.ts` делал **абсолютный SET**:
```sql
UPDATE users SET igc_balance = $1  -- $1 = igcRemaining (старый баланс − электричество)
```
Если между загрузкой баланса эпохой и записью результата пользователь купил IGC, покупка затиралась.

**Исправление:** заменить SET на атомарное вычитание:
```sql
UPDATE users SET igc_balance = GREATEST(0, igc_balance - $1)  -- $1 = igcCharged (только расход)
```
В `epochRunner.ts` передаётся `elec.igcCharged` вместо `elec.igcRemaining`.

**Файлы:** `backend/src/db/client.ts` → `updateFarmIgc()`, `backend/src/epoch/epochRunner.ts` → `farmIgcUpdates.push(...)`.

### Стейкинг IGC — начисление и динамическая ставка

**Баг:** `UPDATE farms SET igc_balance` в epochRunner падал каждую эпоху — таблица `farms` не имеет поля `igc_balance`. IGC стейкерам не начислялся вообще.

**Исправление:** `UPDATE users SET igc_balance = igc_balance + $1 WHERE id = $2` — прямо в таблицу `users`.

**Динамическая ставка (Вариант A с зажимом):**
```typescript
// backend/src/epoch/constants.ts
STAKE_IGC_BASE_PER_TON_PER_DAY = 5   // база при ratio=1
STAKE_IGC_MIN_PER_TON_PER_DAY  = 2.5 // мин (ratio≥2)
STAKE_IGC_MAX_PER_TON_PER_DAY  = 15  // макс (ratio≤0.33)

// Формула в epochRunner + sync:
igcPerTonPerDay = clamp(5 / ratio, 2.5, 15)
```

| ratio | IGC/TON/день | APY |
|-------|-------------|-----|
| 0.33 | 15 (макс) | ~54.7% |
| 0.5 | 10 | ~36.5% |
| 1.0 | 5 | ~18.25% |
| 2.0 | 2.5 (мин) | ~9.1% |

**Суточный учёт стейкинга:** Redis ключ `earn:stk:{userId}:{YYYY-MM-DD}` → поле `igc`, TTL 9 дней. Инкрементируется в epochRunner. Читается в `sync.ts` → `staking.stakingEarnedToday`.

**Важно:** вычисление `stakingData` делается ДО `reply.send()` как обычные переменные — не async IIFE внутри объекта. Async IIFE внутри `reply.send({})` вызывал неполный ответ Fastify.

### Лог транзакций (TxLogBlock)

**Dashboard.tsx** — компонент `TxLogBlock` в самом низу страницы (после FearGreedIndex).

- Показывает последние 30 транзакций из таблицы `transactions`
- Показывается только если `data.txLog.length > 0`
- Первые 5 видны сразу, остальные разворачиваются кнопкой "▼ ЕЩЁ N"
- Иконки и цвета по типу: `TX_META` объект в конце Dashboard.tsx

**Типы транзакций:**
| type | иконка | цвет |
|------|--------|------|
| `purchase` | 🛒 | красный |
| `buy_igc` | 💜 | фиолетовый |
| `sell_igc` | 💚 | зелёный |
| `stake_ton` | 🔒 | синий |
| `unstake_ton` | 🔓 | голубой |
| `reward` | ⚡ | жёлтый |
| `solo_reward` | 🎲 | оранжевый |
| `refurbish` | 🔧 | оранжевый |
| `marketplace_sale` | 🤝 | зелёный |

**Backend:** `GET /api/sync` → `txLog: TxLogEntry[]` (поле в SyncData). Запрос в `sync.ts`:
```sql
SELECT type, amount_ton, amount_igc, created_at::text
FROM transactions WHERE user_id = $1
ORDER BY created_at DESC LIMIT 30
```

### ErrorBoundary + global error handler

В `frontend/src/App.tsx` — React class ErrorBoundary обёртывает всё приложение. Показывает текст ошибки вместо чёрного экрана при ошибке рендера.

В `frontend/src/main.tsx` — `window.addEventListener('error', ...)` и `window.addEventListener('unhandledrejection', ...)` — ловят краши до монтирования React. Показывают fallback в `#root` div.

---
