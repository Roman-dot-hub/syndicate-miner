// ─────────────────────────────────────────────
// constants.ts — все игровые константы
// Утверждены в Фазе 0. Не менять без пересчёта экономики.
// ─────────────────────────────────────────────

// ── ЭПОХА ──────────────────────────────────────────────
export const EPOCH_INTERVAL_MS  = 5 * 60 * 1000; // 5 минут
export const EPOCHS_PER_DAY     = 288;            // 24 * 60 / 5

// ── ХАЛВИНГ (Вариант А — по суммарным выплатам) ────────
export const HALVING_PHASES = [
  { phase: 1 as const, dripRate: 0.04,  maxPaidOut: 1_000 },
  { phase: 2 as const, dripRate: 0.02,  maxPaidOut: 10_000 },
  { phase: 3 as const, dripRate: 0.01,  maxPaidOut: 100_000 },
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
  1: { hashrate: 3,    watt: 50,   baseWearPerEpoch: 0.0052, igcMaintenancePerEpoch: 0,    isAsic: false, availablePhase: 1 }, // RX 580 — ~33д до 50%
  2: { hashrate: 6,    watt: 100,  baseWearPerEpoch: 0.0058, igcMaintenancePerEpoch: 0.05, isAsic: false, availablePhase: 1 }, // GTX 1660S — ~30д до 50%
  3: { hashrate: 15,   watt: 200,  baseWearPerEpoch: 0.0058, igcMaintenancePerEpoch: 0.55, isAsic: false, availablePhase: 1 }, // RTX 3070 — ~30д до 50%
  4: { hashrate: 45,   watt: 350,  baseWearPerEpoch: 0.0056, igcMaintenancePerEpoch: 2.0,  isAsic: false, availablePhase: 1 }, // RTX 4090 — ~31д до 50%
  5: { hashrate: 110,  watt: 1200, baseWearPerEpoch: 0.0058, igcMaintenancePerEpoch: 5.0,  isAsic: true,  availablePhase: 1 }, // ASIC S19 — ~30д до 50%
  6: { hashrate: 250,  watt: 500,  baseWearPerEpoch: 0.0040, igcMaintenancePerEpoch: 12.0, isAsic: true,  availablePhase: 2 }, // X1 — ~43д до 50%
};

// ── РАЗГОН ───────────────────────────────────────────────
export const OVERCLOCK_HASHRATE_BONUS = 0.20; // +20% хешрейта
export const OVERCLOCK_WEAR_PENALTY   = 2.5;  // ×2.5 к износу
export const OVERCLOCK_COST_MULT      = 1.20; // ×1.20 ко ВСЕМ IGC-затратам (электро + мейнтейнс)

// ── АНДЕРВОЛЬТ ────────────────────────────────────────────
export const UNDERVOLT_HASHRATE_MULT  = 0.85; // −15% хешрейта
export const UNDERVOLT_WATT_MULT      = 0.90; // −10% расход электричества
export const UNDERVOLT_WEAR_MULT      = 0.70; // −30% износ

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

// ── TAP-TO-COOL (оставлено для обратной совместимости Redis-ключей) ──────
export const TAP_BOOST_PER_TAP_SEC  = 1;
export const TAP_BOOST_MAX_SEC      = 3600;
export const TAP_SESSION_LIMIT      = 3600;
export const TAP_COOLDOWN_SEC       = 21600;
export const TAP_JITTER_MIN_MS      = 15;
export const TAP_JITTER_SAMPLE      = 5;

// ── AD BOOST ─────────────────────────────────────────────
export const AD_BOOST_SEC           = 300;     // +5 минут буста за просмотр
export const AD_VIEWS_PER_CYCLE     = 10;      // просмотров до обязательной паузы
export const AD_COOLDOWN_SEC        = 14400;   // пауза после цикла: 4 часа
export const REDIS_AD_COUNT_PREFIX    = 'ad:count:';    // счётчик просмотров в цикле
export const REDIS_AD_COOLDOWN_PREFIX = 'ad:cooldown:'; // флаг паузы

// ── UPTIME (базовый % по тиру GPU) ──────────────────────
export const GPU_BASE_UPTIME: Record<number, number> = {
  0: 95, 1: 90, 2: 88, 3: 86, 4: 84, 5: 82, 6: 80,
};

// ── АПГРЕЙДЫ СЕРВЕРНОЙ (глобальные, за TON) ──────────────
// server_room_level: снижает T_ambient для всей фермы
export const SERVER_ROOM_LEVELS: Array<{ level: number; tempReduction: number; costTon: number }> = [
  { level: 1, tempReduction: 0,  costTon: 0   },
  { level: 2, tempReduction: 5,  costTon: 0.5 },
  { level: 3, tempReduction: 12, costTon: 1.5 },
  { level: 4, tempReduction: 22, costTon: 4.0 },
];

// ups_level: глобальный бонус к uptime всех GPU фермы (%)
export const UPS_LEVELS: Array<{ level: number; uptimeBonus: number; costTon: number }> = [
  { level: 1, uptimeBonus: 0,  costTon: 0   },
  { level: 2, uptimeBonus: 5,  costTon: 0.4 },
  { level: 3, uptimeBonus: 12, costTon: 1.0 },
  { level: 4, uptimeBonus: 20, costTon: 3.0 },
];

// provider_level: глобальный uptime + скидка на электричество IGC (%)
export const PROVIDER_LEVELS: Array<{ level: number; uptimeBonus: number; igcDiscountPct: number; costTon: number }> = [
  { level: 1, uptimeBonus: 0, igcDiscountPct: 0,  costTon: 0   },
  { level: 2, uptimeBonus: 2, igcDiscountPct: 20, costTon: 0.2 },
  { level: 3, uptimeBonus: 4, igcDiscountPct: 40, costTon: 0.6 },
  { level: 4, uptimeBonus: 6, igcDiscountPct: 60, costTon: 1.5 },
  { level: 5, uptimeBonus: 8, igcDiscountPct: 80, costTon: 4.0 },
];

// ── ПОУЗЛОВЫЕ АПГРЕЙДЫ GPU (за IGC) ─────────────────────
// paste_level: снижает нагрев конкретного GPU (°C)
export const PASTE_LEVELS: Array<{ level: number; tempReduction: number; costIgc: number }> = [
  { level: 1, tempReduction: 0,  costIgc: 0    },
  { level: 2, tempReduction: 5,  costIgc: 200  },
  { level: 3, tempReduction: 10, costIgc: 600  },
  { level: 4, tempReduction: 15, costIgc: 1500 },
];

// fan_level: бонус к uptime конкретного GPU (%)
export const FAN_LEVELS: Array<{ level: number; uptimeBonus: number; costIgc: number }> = [
  { level: 1, uptimeBonus: 0,  costIgc: 0    },
  { level: 2, uptimeBonus: 4,  costIgc: 250  },
  { level: 3, uptimeBonus: 8,  costIgc: 750  },
  { level: 4, uptimeBonus: 12, costIgc: 1900 },
  { level: 5, uptimeBonus: 16, costIgc: 4800 },
];

// cooling_level (жидкостное охлаждение): снижает температуру конкретного GPU (°C)
export const LIQUID_COOLING_LEVELS: Array<{ level: number; tempReduction: number; costIgc: number }> = [
  { level: 1, tempReduction: 0,  costIgc: 0    }, // воздушное (стандарт)
  { level: 2, tempReduction: 10, costIgc: 500  }, // жидкостное базовое
  { level: 3, tempReduction: 20, costIgc: 1500 }, // жидкостное продвинутое
];

// ── СИНДИКАТЫ ───────────────────────────────────────────
export const SYNDICATE_CREATION_COST_IGC = 2_000;
export const SYNDICATE_XP_PER_BLOCK_WIN  = 50;
export const SYNDICATE_BASE_MAX_MEMBERS  = 10;

// Стоимость перехода на каждый уровень (XP); индекс = level-1 (переход 1→2 стоит [0])
export const SYNDICATE_LEVEL_XP_COSTS: number[] = [
  ...Array(10).fill(1_000),   // 1→10  : 1 000 XP/ур
  ...Array(10).fill(2_000),   // 11→20 : 2 000 XP/ур
  ...Array(10).fill(4_000),   // 21→30 : 4 000 XP/ур
  ...Array(10).fill(7_000),   // 31→40 : 7 000 XP/ур
  ...Array(10).fill(11_000),  // 41→50 : 11 000 XP/ур
];

// Пассивные бонусы на контрольных уровнях (применяются к наивысшему достигнутому)
export const SYNDICATE_LEVEL_MILESTONES: Record<number, {
  hashrateBonus: number;   // +N% хешрейт всем участникам
  wearReduction: number;   // −N% износ (0.10 = −10%)
  maxMembers:    number;
}> = {
  10: { hashrateBonus: 0.03, wearReduction: 0,    maxMembers: 10 },
  20: { hashrateBonus: 0.08, wearReduction: 0.10, maxMembers: 10 },
  30: { hashrateBonus: 0.15, wearReduction: 0.10, maxMembers: 12 },
  40: { hashrateBonus: 0.24, wearReduction: 0.20, maxMembers: 14 },
  50: { hashrateBonus: 0.35, wearReduction: 0.30, maxMembers: 16 },
};

// Покупаемые временные бонусы синдиката (из казны)
export const SYNDICATE_BONUS_DEFS: Record<string, {
  igcCost:       number;
  requiredLevel: number;
  durationSec:   number;
}> = {
  boost_x1:      { igcCost: 200,   requiredLevel: 1,  durationSec: 7_200   }, // +10% hash 2ч    (mutex с boost_x2)
  boost_x2:      { igcCost: 500,   requiredLevel: 10, durationSec: 14_400  }, // +20% hash 4ч    (mutex с boost_x1)
  shield_break:  { igcCost: 800,   requiredLevel: 20, durationSec: 86_400  }, // защита от поломок 24ч
  season_shield: { igcCost: 2_000, requiredLevel: 30, durationSec: 172_800 }, // иммунитет к зиме 48ч (было: 600 IGC, 7д)
  double_reward: { igcCost: 1_500, requiredLevel: 40, durationSec: 3_600   }, // ×2 награда соло 1ч
  domination:    { igcCost: 3_000, requiredLevel: 50, durationSec: 3_600   }, // +50% hash всем 1ч
};
