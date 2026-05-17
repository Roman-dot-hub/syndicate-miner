// ─────────────────────────────────────────────
// types.ts — общие типы игрового цикла
// ─────────────────────────────────────────────

export type MiningMode = 'pool' | 'solo';
export type GpuStatus  = 'active' | 'broken' | 'offline';

export interface GPU {
  id:            string;
  farmId:        string;
  userId:        string;
  modelTier:     number;   // 0–6
  health:        number;   // 0–100
  overclocked:   boolean;
  coolingLevel:  number;   // 0–3 (уровень кулера в помещении)
  status:        GpuStatus;
  isRefurbished: boolean;
}

export interface Farm {
  id:           string;
  userId:       string;
  miningMode:   MiningMode;
  level:        number;   // 0–4 (Стол→Ангар)
  coolingLevel: number;
  igcBalance:   number;   // баланс IGC для оплаты расходов
}

export interface User {
  id:            string;
  tgUserId:      string;
  tonBalance:    number;
  igcBalance:    number;
  referrals_l1:  string[]; // id прямых рефералов
  referrals_l2:  string[]; // id рефералов второго уровня
  miningMode:    MiningMode;
  inviter_id?:   string;   // id пригласившего (для реферальных выплат)
  baseHashrate?: number;   // хешрейт без реф.бонуса (заполняется в epochRunner)
}

export interface PoolStats {
  reservePoolTon: number;
  dripRate:       number;   // текущая ставка: 0.04 / 0.02 / 0.01 / 0.005
  currentPhase:   1 | 2 | 3 | 4;
  totalPaidOut:   number;
  adminEarnedTon: number;
  cycle_day?:     number;   // день 28-дневного цикла (1–28)
  season?:        string;   // spring | summer | autumn | winter
}

// Результат одной эпохи — для логирования
export interface EpochResult {
  epochAt:          Date;
  globalHashrate:   number;
  rewardPool:       number;   // сколько TON разыгрывалось
  distributed:      number;   // сколько фактически раздали
  poolAfter:        number;   // остаток пула
  phase:            number;
  activeMinerCount: number;
  soloWinner:       string | null;
  halvingTriggered: boolean;
  errors:           string[];
}

// Данные одного майнера для эпохи
export interface MinerSnapshot {
  userId:    string;
  farmId:    string;
  hashrate:  number;  // итоговый хешрейт с реферальным бонусом
  baseH:     number;  // собственный хешрейт
  mode:      MiningMode;
  igcBal:    number;
}
