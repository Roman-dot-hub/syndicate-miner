// ─────────────────────────────────────────────
// wearEngine.ts
// Рассчитывает износ и случайные поломки GPU за эпоху.
// Формулы утверждены в Фазе 0.
// ─────────────────────────────────────────────

import {
  GPU_SPECS,
  OVERCLOCK_WEAR_PENALTY,
  COOLING_KTEMP,
  BREAKAGE_PROBABILITY_FACTOR,
} from './constants';
import { GPU } from './types';

export interface WearResult {
  gpuId:         string;
  newHealth:     number;
  wearApplied:   number;   // сколько % здоровья снято
  broken:        boolean;  // критическая поломка в эту эпоху
  kTemp:         number;
  kLoad:         number;
}

/**
 * Рассчитывает износ одной видеокарты за одну эпоху.
 *
 * W = W_base × K_temp × K_load
 * P_fail = ((100 - health) / 100)³
 */
export function calculateWear(gpu: GPU, farmCoolingLevel: number): WearResult {
  const spec = GPU_SPECS[gpu.modelTier];

  // K_temp — штраф за охлаждение помещения
  const kTemp = COOLING_KTEMP[farmCoolingLevel] ?? COOLING_KTEMP[0];

  // K_load — штраф за разгон
  const kLoad = gpu.overclocked ? OVERCLOCK_WEAR_PENALTY : 1.0;

  // Фактический износ за эпоху (%)
  const wearApplied = spec.baseWearPerEpoch * kTemp * kLoad;

  // Новое здоровье
  const newHealth = Math.max(0, gpu.health - wearApplied);

  // Шанс критической поломки: P_fail = ((100 - health) / 100)³ / BREAKAGE_PROBABILITY_FACTOR
  // Делитель 864 (= 288 эпох × 3) нормирует вероятность:
  // при health=50% ожидаемая поломка раз в ~8 дней вместо каждых 40 минут.
  const pFail  = Math.pow((100 - newHealth) / 100, 3) / BREAKAGE_PROBABILITY_FACTOR;
  const broken = Math.random() < pFail;

  return {
    gpuId:       gpu.id,
    newHealth:   broken ? 0 : newHealth,
    wearApplied: parseFloat(wearApplied.toFixed(4)),
    broken,
    kTemp,
    kLoad,
  };
}

/**
 * Рассчитывает эффективный хешрейт карты с учётом здоровья.
 *
 * Каждые 5% потери здоровья снижают хешрейт на 2%.
 * Карта с health < 1 не майнит.
 */
export function effectiveHashrate(gpu: GPU): number {
  if (gpu.status !== 'active' || gpu.health <= 0) return 0;

  const spec      = GPU_SPECS[gpu.modelTier];
  const baseH     = spec.hashrate;

  // Разгон: +20% хешрейта (но wear уже учтён в calculateWear)
  const overclock = gpu.overclocked ? (1 + 0.20) : 1.0;

  // Деградация по здоровью: -2% за каждые 5% потери
  const healthPenalty = Math.floor((100 - gpu.health) / 5) * 0.02;
  const healthFactor  = Math.max(0, 1 - healthPenalty);

  return baseH * overclock * healthFactor;
}

/**
 * Рассчитывает стоимость восстановления (Refurbish) в IGC.
 *
 * Cost_refurbish = (100 - health) × BASE_COST × tier_multiplier
 */
const BASE_REFURBISH_COST = 3; // IGC за 1% восстановления для T1 (10→3: чтобы T1 окупал ремонт за ~35 дней)
const TIER_MULTIPLIER: Record<number, number> = {
  0: 0,    // USB — не ремонтируется
  1: 1.0,
  2: 1.8,
  3: 3.5,
  4: 7.0,
  5: 20.0, // ASIC — дорого
  6: 50.0, // X1 — очень дорого
};

export function refurbishCost(gpu: GPU): number {
  if (gpu.modelTier === 0) return 0;
  const missing     = 100 - gpu.health;
  const multiplier  = TIER_MULTIPLIER[gpu.modelTier] ?? 1;
  return Math.ceil(missing * BASE_REFURBISH_COST * multiplier);
}
