// ─────────────────────────────────────────────
// poolDistributor.ts
// Распределяет награду блока между Pool-майнерами
// и начисляет реферальные бонусы по IGC.
// ─────────────────────────────────────────────

import {
  POOL_COMMISSION,
  REFERRAL_L1_IGC_SHARE,
  REFERRAL_L2_IGC_SHARE,
} from './constants';
import { MinerSnapshot, User } from './types';

export interface MinerPayout {
  userId:    string;
  tonEarned: number;
  igcEarned: number;
}

export interface ReferralPayout {
  referrerId: string;
  fromUserId: string;
  level:      1 | 2;
  igcBonus:   number;
}

export interface DistributionResult {
  minerPayouts:    MinerPayout[];
  referralPayouts: ReferralPayout[];
  totalDistributed: number;
  commissionTaken:  number;
}

/**
 * Распределяет блок-награду (TON) между Pool-майнерами.
 * Параллельно начисляет IGC-бонусы рефераторам.
 *
 * @param blockReward  — сколько TON разыгрывается в эту эпоху
 * @param poolMiners   — снапшот участников пула
 * @param igcPerEpoch  — IGC, добытые каждым пользователем за эпоху (для реф. бонусов)
 * @param usersMap     — карта пользователей для получения реферальной цепочки
 */
export function distributePoolReward(
  blockReward: number,
  poolMiners:  MinerSnapshot[],
  igcPerEpoch: Map<string, number>,
  usersMap:    Map<string, User>,
): DistributionResult {
  const poolHashrate = poolMiners.reduce((s, m) => s + m.hashrate, 0);

  if (poolHashrate === 0 || blockReward === 0) {
    return { minerPayouts: [], referralPayouts: [], totalDistributed: 0, commissionTaken: 0 };
  }

  // 2% комиссия пула уходит в admin wallet (обрабатывается в epochRunner)
  const afterCommission = blockReward * (1 - POOL_COMMISSION);
  const commission      = blockReward * POOL_COMMISSION;

  const minerPayouts:    MinerPayout[]    = [];
  const referralPayouts: ReferralPayout[] = [];

  for (const miner of poolMiners) {
    // P = H_user / H_pool × R_after_commission
    const share    = miner.hashrate / poolHashrate;
    const tonEarned = parseFloat((share * afterCommission).toFixed(8));

    // IGC за эпоху — пропорционально хешрейту
    const igcEarned = parseFloat(((igcPerEpoch.get(miner.userId) ?? 0)).toFixed(4));

    minerPayouts.push({ userId: miner.userId, tonEarned, igcEarned });

    // ── Реферальные IGC-бонусы ──────────────────────────────────
    const user = usersMap.get(miner.userId);
    if (!user) continue;

    // L1 инвайтер получает 10% от IGC майнера
    const inviterUser = user.inviter_id ? usersMap.get(user.inviter_id) : undefined;
    if (inviterUser && igcEarned > 0) {
      referralPayouts.push({
        referrerId: inviterUser.id,
        fromUserId: miner.userId,
        level:      1,
        igcBonus:   parseFloat((igcEarned * REFERRAL_L1_IGC_SHARE).toFixed(4)),
      });

      // L2 инвайтер (дед) получает 3% IGC
      const grandinviter = inviterUser.inviter_id
        ? usersMap.get(inviterUser.inviter_id)
        : undefined;
      if (grandinviter) {
        referralPayouts.push({
          referrerId: grandinviter.id,
          fromUserId: miner.userId,
          level:      2,
          igcBonus:   parseFloat((igcEarned * REFERRAL_L2_IGC_SHARE).toFixed(4)),
        });
      }
    }
  }

  const totalDistributed = minerPayouts.reduce((s, p) => s + p.tonEarned, 0);

  return {
    minerPayouts,
    referralPayouts,
    totalDistributed: parseFloat(totalDistributed.toFixed(8)),
    commissionTaken:  parseFloat(commission.toFixed(8)),
  };
}

/**
 * Рассчитывает IGC-доход майнера за эпоху (пропорционально хешрейту).
 * IGC добываются быстро — для психологического ощущения прогресса.
 *
 * Базовая ставка: 0.05 IGC за 1 GH/s за эпоху.
 */
export const IGC_PER_GH_PER_EPOCH = 0.05;

export function calculateIgcEarned(hashrate: number): number {
  return parseFloat((hashrate * IGC_PER_GH_PER_EPOCH).toFixed(4));
}
