export type MiningMode = 'pool' | 'solo';
export type GpuStatus  = 'active' | 'broken' | 'offline';
export type Season     = 'spring' | 'summer' | 'autumn' | 'winter';

export interface GPU {
  id:            string;
  modelTier:     number;
  health:        number;
  status:        GpuStatus;
  overclocked:   boolean;
  coolingLevel:  number;
  isRefurbished: boolean;
}

export interface Farm {
  id:           string;
  level:        number;
  coolingLevel: number;
  maxSlots:     number;
  igcBalance:   number;
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

export interface SyncData {
  user:   UserData;
  farm:   Farm;
  gpus:   GPU[];
  season: SeasonData;
  igc:    IgcStatus;
  events: Record<string, unknown>;
}

// GPU specs (mirrors backend constants)
export const GPU_SPECS: Record<number, { name: string; emoji: string; hashrate: number; watt: number; priceTon: number; availablePhase: number }> = {
  0: { name: 'USB Nano',    emoji: '🔌', hashrate: 1,    watt: 5,    priceTon: 0,   availablePhase: 1 },
  1: { name: 'RX 580',      emoji: '🖥️', hashrate: 10,   watt: 150,  priceTon: 1,   availablePhase: 1 },
  2: { name: 'GTX 1660 S',  emoji: '💻', hashrate: 20,   watt: 125,  priceTon: 2.5, availablePhase: 1 },
  3: { name: 'RTX 3070',    emoji: '🖥️', hashrate: 60,   watt: 220,  priceTon: 8,   availablePhase: 1 },
  4: { name: 'RTX 4090',    emoji: '🚀', hashrate: 150,  watt: 450,  priceTon: 25,  availablePhase: 1 },
  5: { name: 'ASIC S19',    emoji: '⚡', hashrate: 500,  watt: 3250, priceTon: 70,  availablePhase: 1 },
  6: { name: 'Квантовый X1',emoji: '🔮', hashrate: 2000, watt: 6000, priceTon: 200, availablePhase: 2 },
};

export const SEASON_EMOJI: Record<Season, string> = {
  spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️',
};

export const FARM_LEVELS: Record<number, string> = {
  1: 'Балкон', 2: 'Кладовка', 3: 'Гараж', 4: 'Ангар',
};
