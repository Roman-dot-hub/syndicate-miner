export type MiningMode = 'pool' | 'solo';
export type GpuStatus  = 'active' | 'broken' | 'offline' | 'stored';
export type Season     = 'spring' | 'summer' | 'autumn' | 'winter';

export interface GPU {
  id:            string;
  modelTier:     number;
  health:        number;
  status:        GpuStatus;
  overclocked:   boolean;
  undervolted:   boolean;
  coolingLevel:  number;
  isRefurbished: boolean;
  pasteLevel:    number;  // 1–4 (термопаста)
  fanLevel:      number;  // 1–5 (вентилятор)
}

export interface Farm {
  id:              string;
  level:           number;
  coolingLevel:    number;
  workbenchLevel:  number;
  maxSlots:        number;
  igcBalance:      number;
  serverRoomLevel: number;  // 1–4
  upsLevel:        number;  // 1–4
  providerLevel:   number;  // 1–5
}

export interface UserData {
  id:          string;
  tgUserId:    string;
  tonBalance:  number;
  igcBalance:  number;
  miningMode:  MiningMode;
}

export interface SeasonData {
  day:       number;
  name:      Season;
  dripRate:  number;
  phase:     1 | 2 | 3 | 4;
  poolTon:   number;
  totalPaid: number;
}

export interface IgcStatus {
  ratio:  number;
  status: 'healthy' | 'mild_surplus' | 'mild_deficit' | 'critical_surplus' | 'critical_deficit';
}

export interface TapBoost {
  active:             boolean;
  secondsLeft:        number;
  adViewsInCycle:     number;   // просмотров в текущем цикле (0–10)
  adViewsPerCycle:    number;   // просмотров до паузы = 10
  adCooldownSeconds:  number;   // секунд до следующего цикла
}

export interface NetworkStats {
  totalUsers:     number;
  activeMiners:   number;
  globalHashrate: number;
}

export interface IgcSupply {
  totalMinted: number;
  totalBurned: number;
  remaining:   number;
  ratio:       number;
  pricePerIgc: number;
}

export interface PlayerEarnings {
  yesterdayTon: number;
  yesterdayIgc: number;
  weekTon:      number;
  weekIgc:      number;
}

export interface SyndicateMemberInfo {
  userId:   string;
  username: string | null;
  role:     'leader' | 'member';
}

export interface SyndicateBonusInfo {
  type:      string;
  expiresAt: string;
}

export interface SyndicateData {
  id:              string;
  name:            string;
  level:           number;
  xp:              number;
  xpToNext:        number;
  xpProgress:      number;
  treasuryIgc:     number;
  memberCount:     number;
  maxMembers:      number;
  role:            'leader' | 'member';
  hashrateBonus:   number;
  wearReduction:   number;
  activeBonuses:   SyndicateBonusInfo[];
  members:         SyndicateMemberInfo[];
  // Stats
  totalBlocksWon:  number;
  totalTonEarned:  number;
  totalIgcEarned:  number;
  activeGpuCount:  number;
  foundedAt:       string | null;
}

export interface SyncData {
  user:       UserData;
  farm:       Farm;
  gpus:       GPU[];
  storedGpus: GPU[];
  season:     SeasonData;
  igc:        IgcStatus;
  igcSupply?: IgcSupply;
  tapBoost?:  TapBoost;
  network?:   NetworkStats;
  earnings?:  PlayerEarnings;
  events:     Record<string, unknown>;
  syndicate?: SyndicateData | null;
}

// GPU specs (mirrors backend constants)
// igcPerDay  = backendHashrateGH * 0.05 * 288
// igcCostPerDay = wattBackend * 0.001 * 288 + maintPerEpoch * 288
// wattBackend — реальные ватты из бэкенда (для расчёта оверклока +40%)
// tempLoad    — тепловыделение чипа в °C (Спринт 1, только display)
// baseUptime  — базовая стабильность в % (Спринт 1, только display; Спринт 2 — в экономику)
export const GPU_SPECS: Record<number, {
  name: string; emoji: string; hashrate: number; watt: number;
  priceTon: number; availablePhase: number;
  igcPerDay: number; igcCostPerDay: number; wattBackend: number;
  tempLoad: number; baseUptime: number;
}> = {
  0: { name: 'USB Nano',    emoji: '🔌', hashrate: 0.1,  watt: 5,    priceTon: 0,   availablePhase: 1, igcPerDay: 1.44,   igcCostPerDay: 0,      wattBackend: 0,    tempLoad: 15, baseUptime: 95 },
  1: { name: 'RX 580',      emoji: '🖥️', hashrate: 3,    watt: 150,  priceTon: 1.5, availablePhase: 1, igcPerDay: 43.2,   igcCostPerDay: 14.4,   wattBackend: 50,   tempLoad: 30, baseUptime: 90 },
  2: { name: 'GTX 1660 S',  emoji: '💻', hashrate: 6,    watt: 125,  priceTon: 2.5, availablePhase: 1, igcPerDay: 86.4,   igcCostPerDay: 43.2,   wattBackend: 100,  tempLoad: 35, baseUptime: 88 },
  3: { name: 'RTX 3070',    emoji: '🖥️', hashrate: 15,   watt: 220,  priceTon: 8,   availablePhase: 1, igcPerDay: 216.0,  igcCostPerDay: 216.0,  wattBackend: 200,  tempLoad: 42, baseUptime: 86 },
  4: { name: 'RTX 4090',    emoji: '🚀', hashrate: 45,   watt: 450,  priceTon: 25,  availablePhase: 1, igcPerDay: 648.0,  igcCostPerDay: 676.8,  wattBackend: 350,  tempLoad: 55, baseUptime: 84 },
  5: { name: 'ASIC S19',    emoji: '⚡', hashrate: 110,  watt: 3250, priceTon: 55,  availablePhase: 1, igcPerDay: 1584.0, igcCostPerDay: 1785.6, wattBackend: 1200, tempLoad: 65, baseUptime: 82 },
  6: { name: 'Квантовый X1',emoji: '🔮', hashrate: 250,  watt: 6000, priceTon: 140, availablePhase: 2, igcPerDay: 3600.0, igcCostPerDay: 3600.0, wattBackend: 500,  tempLoad: 75, baseUptime: 80 },
};

// ── Таблицы апгрейдов (зеркало backend constants.ts) ─────

export const SERVER_ROOM_LEVELS = [
  { level: 1, tempReduction: 0,  costTon: 0   },
  { level: 2, tempReduction: 5,  costTon: 0.5 },
  { level: 3, tempReduction: 12, costTon: 1.5 },
  { level: 4, tempReduction: 22, costTon: 4.0 },
] as const;

export const UPS_LEVELS = [
  { level: 1, uptimeBonus: 0,  costTon: 0   },
  { level: 2, uptimeBonus: 5,  costTon: 0.4 },
  { level: 3, uptimeBonus: 12, costTon: 1.0 },
  { level: 4, uptimeBonus: 20, costTon: 3.0 },
] as const;

export const PROVIDER_LEVELS = [
  { level: 1, uptimeBonus: 0, igcDiscountPct: 0,  costTon: 0   },
  { level: 2, uptimeBonus: 2, igcDiscountPct: 20, costTon: 0.2 },
  { level: 3, uptimeBonus: 4, igcDiscountPct: 40, costTon: 0.6 },
  { level: 4, uptimeBonus: 6, igcDiscountPct: 60, costTon: 1.5 },
  { level: 5, uptimeBonus: 8, igcDiscountPct: 80, costTon: 4.0 },
] as const;

export const PASTE_LEVELS = [
  { level: 1, tempReduction: 0,  costIgc: 0    },
  { level: 2, tempReduction: 5,  costIgc: 200  },
  { level: 3, tempReduction: 10, costIgc: 600  },
  { level: 4, tempReduction: 15, costIgc: 1500 },
] as const;

export const FAN_LEVELS = [
  { level: 1, uptimeBonus: 0,  costIgc: 0    },
  { level: 2, uptimeBonus: 4,  costIgc: 250  },
  { level: 3, uptimeBonus: 8,  costIgc: 750  },
  { level: 4, uptimeBonus: 12, costIgc: 1900 },
  { level: 5, uptimeBonus: 16, costIgc: 4800 },
] as const;

// Жидкостное охлаждение GPU (per-GPU апгрейд, 3 уровня, за IGC)
export const LIQUID_COOLING_LEVELS = [
  { level: 1, tempReduction: 0,  costIgc: 0    }, // воздушное (стандарт)
  { level: 2, tempReduction: 10, costIgc: 500  }, // жидкостное базовое
  { level: 3, tempReduction: 20, costIgc: 1500 }, // жидкостное продвинутое
] as const;

// Расчёт температуры чипа (display)
// T = 35 - serverRoom + tempLoad + OC_bonus - UV_bonus - liquidCooling - paste
export function calcGpuTemp(
  tier: number,
  gpuCoolingLevel: number,   // GPU cooling_level (жидкостное охлаждение, 1–3)
  overclocked: boolean,
  undervolted: boolean,
  pasteLevel      = 1,
  serverRoomLevel = 1,
): number {
  const T_BASE    = 35;
  const spec      = GPU_SPECS[tier] ?? GPU_SPECS[0];
  const T_COOLING = LIQUID_COOLING_LEVELS.find(l => l.level === gpuCoolingLevel)?.tempReduction ?? 0;
  const T_ROOM    = SERVER_ROOM_LEVELS.find(l => l.level === serverRoomLevel)?.tempReduction ?? 0;
  const T_PASTE   = PASTE_LEVELS.find(l => l.level === pasteLevel)?.tempReduction ?? 0;
  return T_BASE - T_ROOM + spec.tempLoad
    + (overclocked ? 15 : 0)
    - (undervolted ? 5  : 0)
    - T_COOLING
    - T_PASTE;
}

// Расчёт эффективного uptime (display, %)
export function calcEffectiveUptime(
  tier: number,
  upsLevel     = 1,
  providerLevel = 1,
  fanLevel     = 1,
): number {
  const base        = GPU_SPECS[tier]?.baseUptime ?? 85;
  const upsBonus    = UPS_LEVELS.find(l => l.level === upsLevel)?.uptimeBonus ?? 0;
  const provBonus   = PROVIDER_LEVELS.find(l => l.level === providerLevel)?.uptimeBonus ?? 0;
  const fanBonus    = FAN_LEVELS.find(l => l.level === fanLevel)?.uptimeBonus ?? 0;
  return Math.min(99, base + upsBonus + provBonus + fanBonus);
}

// Цвет и метка для температуры
export function tempInfo(celsius: number): { color: string; label: string } {
  if (celsius <= 60) return { color: '#2ECC71', label: 'Норма' };
  if (celsius <= 75) return { color: '#F39C12', label: 'Тепло' };
  if (celsius <= 85) return { color: '#E67E22', label: 'Горячо' };
  return { color: '#E74C3C', label: 'Критично' };
}

export const SEASON_EMOJI: Record<Season, string> = {
  spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️',
};

export const FARM_LEVELS: Record<number, string> = {
  1: 'Балкон', 2: 'Кладовка', 3: 'Гараж', 4: 'Ангар',
};
