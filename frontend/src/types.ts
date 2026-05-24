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
}

export interface Farm {
  id:             string;
  level:          number;
  coolingLevel:   number;
  workbenchLevel: number;
  maxSlots:       number;
  igcBalance:     number;
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
  active:          boolean;
  secondsLeft:     number;
  cooldownSeconds: number;
  tapsUsed:        number;
  tapsRemaining:   number;
}

export interface NetworkStats {
  totalUsers:     number;
  activeMiners:   number;
  globalHashrate: number;
}

export interface SyncData {
  user:       UserData;
  farm:       Farm;
  gpus:       GPU[];
  storedGpus: GPU[];
  season:     SeasonData;
  igc:        IgcStatus;
  tapBoost?:  TapBoost;
  network?:   NetworkStats;
  events:     Record<string, unknown>;
}

// GPU specs (mirrors backend constants)
// igcPerDay  = backendHashrateGH * 0.05 * 288
// igcCostPerDay = wattBackend * 0.001 * 288 + maintPerEpoch * 288
// wattBackend — реальные ватты из бэкенда (для расчёта оверклока +40%)
export const GPU_SPECS: Record<number, {
  name: string; emoji: string; hashrate: number; watt: number;
  priceTon: number; availablePhase: number;
  igcPerDay: number; igcCostPerDay: number; wattBackend: number;
}> = {
  0: { name: 'USB Nano',    emoji: '🔌', hashrate: 0.1,  watt: 5,    priceTon: 0,   availablePhase: 1, igcPerDay: 1.44,   igcCostPerDay: 0,      wattBackend: 0    },
  1: { name: 'RX 580',      emoji: '🖥️', hashrate: 3,    watt: 150,  priceTon: 1,   availablePhase: 1, igcPerDay: 43.2,   igcCostPerDay: 14.4,   wattBackend: 50   },
  2: { name: 'GTX 1660 S',  emoji: '💻', hashrate: 6,    watt: 125,  priceTon: 2.5, availablePhase: 1, igcPerDay: 86.4,   igcCostPerDay: 43.2,   wattBackend: 100  },
  3: { name: 'RTX 3070',    emoji: '🖥️', hashrate: 15,   watt: 220,  priceTon: 8,   availablePhase: 1, igcPerDay: 216.0,  igcCostPerDay: 216.0,  wattBackend: 200  },
  4: { name: 'RTX 4090',    emoji: '🚀', hashrate: 45,   watt: 450,  priceTon: 25,  availablePhase: 1, igcPerDay: 648.0,  igcCostPerDay: 676.8,  wattBackend: 350  },
  5: { name: 'ASIC S19',    emoji: '⚡', hashrate: 110,  watt: 3250, priceTon: 70,  availablePhase: 1, igcPerDay: 1584.0, igcCostPerDay: 1785.6, wattBackend: 1200 },
  6: { name: 'Квантовый X1',emoji: '🔮', hashrate: 250,  watt: 6000, priceTon: 200, availablePhase: 2, igcPerDay: 3600.0, igcCostPerDay: 3600.0, wattBackend: 500  },
};

export const SEASON_EMOJI: Record<Season, string> = {
  spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️',
};

export const FARM_LEVELS: Record<number, string> = {
  1: 'Балкон', 2: 'Кладовка', 3: 'Гараж', 4: 'Ангар',
};
