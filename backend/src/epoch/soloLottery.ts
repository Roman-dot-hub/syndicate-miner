// ─────────────────────────────────────────────
// soloLottery.ts
// Розыгрыш блока между Pool и Solo-майнерами.
//
// P_win(solo) = H_solo / H_total
// Pool выступает как один большой «игрок».
// ─────────────────────────────────────────────

import { MinerSnapshot } from './types';

export interface LotteryParticipant {
  id:        string;       // userId или 'POOL'
  hashrate:  number;
  isPool:    boolean;
}

export interface LotteryResult {
  winner:         LotteryParticipant;
  soloWinnerId:   string | null;   // userId если соло, иначе null
  poolWon:        boolean;
  totalHashrate:  number;
  winProbability: number;          // шанс победителя (для логов)
}

/**
 * Проводит розыгрыш одного блока за эпоху.
 *
 * Алгоритм:
 * 1. Собираем пул-участников (один агрегированный лот «POOL»)
 *    и соло-участников (каждый отдельно).
 * 2. Генерируем случайное число [0, totalHashrate).
 * 3. Проходим по участникам, накапливая хешрейт — кто «закрыл» число, тот победил.
 */
export function runBlockLottery(
  miners:       MinerSnapshot[],
): LotteryResult {
  const participants: LotteryParticipant[] = [];
  let poolHashrate = 0;

  for (const m of miners) {
    if (m.mode === 'pool') {
      poolHashrate += m.hashrate;
    } else {
      participants.push({ id: m.userId, hashrate: m.hashrate, isPool: false });
    }
  }

  // Добавляем агрегированный пул как одного участника
  if (poolHashrate > 0) {
    participants.push({ id: 'POOL', hashrate: poolHashrate, isPool: true });
  }

  const totalHashrate = participants.reduce((s, p) => s + p.hashrate, 0);

  if (totalHashrate === 0 || participants.length === 0) {
    // Никто не майнит — блок не разыгрывается
    return {
      winner:         { id: 'NOBODY', hashrate: 0, isPool: false },
      soloWinnerId:   null,
      poolWon:        false,
      totalHashrate:  0,
      winProbability: 0,
    };
  }

  // Лотерейный тикет
  const ticket     = Math.random() * totalHashrate;
  let cumulative   = 0;
  let winner: LotteryParticipant = participants[participants.length - 1]; // fallback

  for (const p of participants) {
    cumulative += p.hashrate;
    if (ticket < cumulative) {
      winner = p;
      break;
    }
  }

  return {
    winner,
    soloWinnerId:   winner.isPool ? null : winner.id,
    poolWon:        winner.isPool,
    totalHashrate,
    winProbability: parseFloat((winner.hashrate / totalHashrate).toFixed(4)),
  };
}
