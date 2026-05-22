// ─────────────────────────────────────────────
// constants.ts — все игровые константы
// Утверждены в Фазе 0. Не менять без пересчёта экономики.
// ─────────────────────────────────────────────

// ── ЭПОХА ──────────────────────────────────────────────
export const EPOCH_INTERVAL_MS  = 5 * 60 * 1000; // 5 минут
export const EPOCHS_PER_DAY     = 288;            // 24 * 60 / 5

// ── ХАЛВИНГ (Вариант А — по суммарным выплатам) ────────
export const HALVING_PHASES = [
  { phase: 1 as const, dripRate: 0.04,  maxPaidOut: 2_000 },
  { phase: 2 as const, dripRate: 0.02,  maxPaidOut: 8_000 },
  { phase: 3 as const, dripRate: 0.01,  maxPaidOut: 30_000 },
  { phase: 4 as const, dripRate: 0.005, maxPaidOut: Infinity },
];

// ── РЕФЕРАЛЬНАЯ СИСТЕМА ─────────────────────────────────
export const REFERRAL_L1_HASHRATE_BONUS = 0.05; // +5% от хешрейта L1
export const REFERRAL_L2_HASHRATE_BONUS = 0.02; // +2% от хешрейта L2
export const REFERRAL_L1_IGC_SHARE      = 0.10; // 10% IGC от L1
export const REFERRAL_L2_IGC_SHARE      = 0.03; // 3% IGC от L2

// ── КОМИССИЯ ПУЛА ───────────────────────────────────────
export const POOL_COMMISSION = 0.02; // 2% комиссия Pool-майнинга

// ── ОБОРУДОВАНИЕ ────────────────────────────────────────
// igcMaintenancePerEpoch — фиксированная плата IGC за эксплуатацию,
// не зависит от ватт. Создаёт двухсторонний рынок IGC:
//   T0-T2 = производители IGC (продают на маркете)
//   T3    = точка безубыточности по IGC
//   T4-T5 = потребители IGC (покупают у новичков)
// Supply/demand ratio с обслуживанием ≈ 0.96 (здоровый диапазон 0.8–1.2)
export const GPU_SPECS: Record<number, {
  hashrate:                number;
  watt:                    number;
  baseWearPerEpoch:        number;  // % wear за одну эпоху (5 мин)
  igcMaintenancePerEpoch:  number;  // IGC за обслуживание в эпоху
  isAsic:                  boolean;
  availablePhase:          number;  // минимальная фаза для покупки
}> = {
  // tier  H(GH/s)  W      wear/ep    maint/ep  asic   phase
  0: { hashrate: 0.1,  watt: 0,    baseWearPerEpoch: 0,      igcMaintenancePerEpoch: 0,    isAsic: false, availablePhase: 1 }, // USB Nano
  1: { hashrate: 3,    watt: 50,   baseWearPerEpoch: 0.0052, igcMaintenancePerEpoch: 0,    isAsic: false, availablePhase: 1 }, // Ноутбук — нет обслуж.
  2: { hashrate: 6,    watt: 100,  baseWearPerEpoch: 0.0028, igcMaintenancePerEpoch: 0.05, isAsic: false, availablePhase: 1 }, // Офисный ПК — минимум
  3: { hashrate: 15,   watt: 200,  baseWearPerEpoch: 0.0017, igcMaintenancePerEpoch: 0.55, isAsic: false, availablePhase: 1 }, // Игровой ПК — безубыток
  4: { hashrate: 45,   watt: 350,  baseWearPerEpoch: 0.0007, igcMaintenancePerEpoch: 2.0,  isAsic: false, availablePhase: 1 }, // Майнинг-риг — -29 IGC/д
  5: { hashrate: 110,  watt: 1200, baseWearPerEpoch: 0.0010, igcMaintenancePerEpoch: 5.0,  isAsic: true,  availablePhase: 1 }, // ASIC — -202 IGC/д
  6: { hashrate: 250,  watt: 500,  baseWearPerEpoch: 0.0002, igcMaintenancePerEpoch: 12.0, isAsic: true,  availablePhase: 2 }, // X1 — -2620 IGC/д
};

// ── РАЗГОН ───────────────────────────────────────────────
export const OVERCLOCK_HASHRATE_BONUS = 0.20; // +20% хешрейта
export const OVERCLOCK_WEAR_PENALTY   = 2.5;  // ×2.5 к износу
export const OVERCLOCK_WATT_PENALTY   = 1.40; // +40% потребления

// ── ОХЛАЖДЕНИЕ (K_temp) ──────────────────────────────────
// coolingLevel 0 = нет кулера, 3 = промышленная вытяжка
export const COOLING_KTEMP: Record<number, number> = {
  0: 1.8,  // перегрев — высокий штраф
  1: 1.3,
  2: 1.0,  // норма
  3: 0.85, // бонус за хорошее охлаждение
};

// ── ЭЛЕКТРИЧЕСТВО ────────────────────────────────────────
// Стоимость 1 Ватта в IGC за эпоху
export const IGC_PER_WATT_PER_EPOCH = 0.001;

// ── ПОЛОМКИ ──────────────────────────────────────────────
// P_fail = ((100-health)/100)³ / BREAKAGE_PROBABILITY_FACTOR
// При health=50%: ~1 поломка в 8 дней (vs каждые 40 мин без фактора)
export const BREAKAGE_PROBABILITY_FACTOR = 864; // EPOCHS_PER_DAY × 3

// ── ТАП-ТУ-КУЛ ───────────────────────────────────────────
export const TAP_BOOST_HASHRATE    = 0.15; // +15% хешрейта
export const TAP_BOOST_DURATION_MS = 30_000; // 30 секунд
export const TAP_MAX_RPS           = 10;     // антибот

// ── АНТИКИТ (Фаза 1) ─────────────────────────────────────
export const PHASE1_MAX_DAILY_SPEND_TON = 30;
export const PHASE1_MAX_ASIC_PER_USER   = 2;

// ── REDIS KEYS ───────────────────────────────────────────
export const REDIS_EPOCH_LOCK    = 'epoch:lock';
export const REDIS_GLOBAL_H      = 'epoch:global_hashrate';
export const REDIS_TAP_PREFIX    = 'tap:boost:';
export const REDIS_SPEND_PREFIX  = 'spend:daily:';

// ── TAP-TO-COOL ──────────────────────────────────────────
export const TAP_BOOST_PER_TAP_SEC  = 1;       // +1 сек за тап
export const TAP_BOOST_MAX_SEC      = 3600;    // макс буст 1 час
export const TAP_SESSION_LIMIT      = 3600;    // тапов до обязательной паузы
export const TAP_COOLDOWN_SEC       = 21600;   // длительность паузы (6 часов)
export const TAP_JITTER_MIN_MS      = 15;      // мин. разброс интервалов (бот < этого)
export const TAP_JITTER_SAMPLE      = 5;       // кол-во тапов для проверки интервалов
