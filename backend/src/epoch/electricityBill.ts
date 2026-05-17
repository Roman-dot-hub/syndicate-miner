// ─────────────────────────────────────────────
// electricityBill.ts
// Списывает IGC за потребление электричества за эпоху.
// Если IGC не хватает — ферма останавливается.
// ─────────────────────────────────────────────

import { GPU_SPECS, IGC_PER_WATT_PER_EPOCH, OVERCLOCK_WATT_PENALTY } from './constants';

// Плата за эксплуатацию GPU — сколько IGC берётся с фермы за эпоху.
// Включает: электричество (по ваттам) + обслуживание (фиксированное по тиру).
export function gpuIgcCostPerEpoch(
  gpu:              { modelTier: number; overclocked: boolean },
  seasonMultiplier: number,
): number {
  const spec    = GPU_SPECS[gpu.modelTier];
  const watts   = spec.watt * (gpu.overclocked ? OVERCLOCK_WATT_PENALTY : 1);
  const elec    = watts * IGC_PER_WATT_PER_EPOCH * seasonMultiplier;
  const maint   = spec.igcMaintenancePerEpoch ?? 0;
  return parseFloat((elec + maint).toFixed(6));
}
import { GPU, Farm } from './types';

export interface ElectricityResult {
  farmId:        string;
  userId:        string;
  totalWatt:     number;   // суммарное потребление за эпоху
  igcCharged:    number;   // сколько IGC списано
  igcRemaining:  number;   // остаток IGC
  farmShutdown:  boolean;  // ферма остановлена из-за нехватки IGC
  offlineGpuIds: string[]; // карты, отключённые из-за нехватки средств
}

/**
 * Суммарный IGC-расход всех активных GPU фермы за эпоху.
 * Включает электричество (по ваттам × сезон) + обслуживание (фиксированное).
 */
export function totalFarmIgcCost(gpus: GPU[], seasonMultiplier: number): number {
  return gpus.reduce((sum, gpu) => {
    if (gpu.status !== 'active') return sum;
    return sum + gpuIgcCostPerEpoch(gpu, seasonMultiplier);
  }, 0);
}

/** @deprecated Используй totalFarmIgcCost */
export function totalFarmWatt(gpus: GPU[]): number {
  return gpus.reduce((sum, gpu) => {
    if (gpu.status !== 'active') return sum;
    const spec = GPU_SPECS[gpu.modelTier];
    return sum + spec.watt * (gpu.overclocked ? OVERCLOCK_WATT_PENALTY : 1);
  }, 0);
}

/**
 * Рассчитывает и списывает IGC за эксплуатацию фермы за одну эпоху.
 *
 * Логика:
 * 1. Считаем суммарный IGC-долг (электричество + обслуживание каждого GPU).
 * 2. Если хватает — списываем.
 * 3. Если нет — отключаем самые дорогие GPU по одному пока не хватит.
 * 4. Если отключили всё — farmShutdown = true.
 */
export function processElectricityBill(
  farm:             Farm,
  activeGpus:       GPU[],
  seasonMultiplier: number = 1.0,
): ElectricityResult {
  const totalIgcDue = parseFloat(totalFarmIgcCost(activeGpus, seasonMultiplier).toFixed(6));
  const canAfford   = farm.igcBalance >= totalIgcDue;

  // Для совместимости с полем totalWatt в ElectricityResult
  const totalWatt = activeGpus.reduce((s, g) => {
    if (g.status !== 'active') return s;
    return s + GPU_SPECS[g.modelTier].watt * (g.overclocked ? OVERCLOCK_WATT_PENALTY : 1);
  }, 0);

  if (canAfford) {
    return {
      farmId:        farm.id,
      userId:        farm.userId,
      totalWatt,
      igcCharged:    totalIgcDue,
      igcRemaining:  parseFloat((farm.igcBalance - totalIgcDue).toFixed(6)),
      farmShutdown:  false,
      offlineGpuIds: [],
    };
  }

  // Не хватает IGC — отключаем самые дорогие GPU по одной
  const sortedByCost = [...activeGpus].sort((a, b) => {
    return gpuIgcCostPerEpoch(b, seasonMultiplier) - gpuIgcCostPerEpoch(a, seasonMultiplier);
  });

  const offlineGpuIds: string[] = [];
  let remainingGpus  = [...activeGpus];
  let remainingBal   = farm.igcBalance;

  for (const gpu of sortedByCost) {
    remainingGpus = remainingGpus.filter(g => g.id !== gpu.id);
    offlineGpuIds.push(gpu.id);

    const newDue = totalFarmIgcCost(remainingGpus, seasonMultiplier);
    if (remainingBal >= newDue) break;
  }

  const finalDue   = parseFloat(totalFarmIgcCost(remainingGpus, seasonMultiplier).toFixed(6));
  const finalWatt  = remainingGpus.reduce((s, g) =>
    s + GPU_SPECS[g.modelTier].watt * (g.overclocked ? OVERCLOCK_WATT_PENALTY : 1), 0);

  return {
    farmId:        farm.id,
    userId:        farm.userId,
    totalWatt:     finalWatt,
    igcCharged:    finalDue,
    igcRemaining:  parseFloat((farm.igcBalance - finalDue).toFixed(6)),
    farmShutdown:  offlineGpuIds.length === activeGpus.length,
    offlineGpuIds,
  };
}
