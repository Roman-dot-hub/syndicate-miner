// ─────────────────────────────────────────────
// electricityBill.ts
// Списывает IGC за потребление электричества за эпоху.
// Если IGC не хватает — ферма останавливается.
// ─────────────────────────────────────────────

import { GPU_SPECS, IGC_PER_WATT_PER_EPOCH, OVERCLOCK_WATT_PENALTY } from './constants';
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
 * Рассчитывает суммарное потребление Ватт для набора GPU.
 */
export function totalFarmWatt(gpus: GPU[]): number {
  return gpus.reduce((sum, gpu) => {
    if (gpu.status !== 'active') return sum;
    const spec = GPU_SPECS[gpu.modelTier];
    const watts = gpu.overclocked
      ? spec.watt * OVERCLOCK_WATT_PENALTY
      : spec.watt;
    return sum + watts;
  }, 0);
}

/**
 * Рассчитывает и списывает IGC за электричество за одну эпоху.
 *
 * Логика:
 * 1. Считаем суммарный расход в Ваттах.
 * 2. Переводим в IGC: igcDue = totalWatt × IGC_PER_WATT_PER_EPOCH.
 * 3. Если IGC хватает — списываем.
 * 4. Если не хватает — ферма останавливается (farmShutdown = true).
 */
export function processElectricityBill(
  farm:            Farm,
  activeGpus:      GPU[],
  seasonMultiplier: number = 1.0, // из epochRunner: 0.95 (лето) – 1.45 (зима)
): ElectricityResult {
  const totalWatt  = totalFarmWatt(activeGpus);
  const igcDue     = parseFloat((totalWatt * IGC_PER_WATT_PER_EPOCH * seasonMultiplier).toFixed(6));
  const canAfford  = farm.igcBalance >= igcDue;

  if (canAfford) {
    return {
      farmId:       farm.id,
      userId:       farm.userId,
      totalWatt,
      igcCharged:   igcDue,
      igcRemaining: parseFloat((farm.igcBalance - igcDue).toFixed(6)),
      farmShutdown: false,
      offlineGpuIds: [],
    };
  }

  // Не хватает IGC — отключаем самые прожорливые карты по одной
  // пока баланс не покроет оставшиеся расходы
  const sortedByWatt = [...activeGpus].sort((a, b) => {
    const wA = GPU_SPECS[a.modelTier].watt * (a.overclocked ? OVERCLOCK_WATT_PENALTY : 1);
    const wB = GPU_SPECS[b.modelTier].watt * (b.overclocked ? OVERCLOCK_WATT_PENALTY : 1);
    return wB - wA; // от самых прожорливых
  });

  const offlineGpuIds: string[] = [];
  let remainingWatt  = totalWatt;
  let remainingBal   = farm.igcBalance;

  for (const gpu of sortedByWatt) {
    const gpuWatt = GPU_SPECS[gpu.modelTier].watt * (gpu.overclocked ? OVERCLOCK_WATT_PENALTY : 1);
    const gpuCost = gpuWatt * IGC_PER_WATT_PER_EPOCH;

    remainingWatt -= gpuWatt;
    offlineGpuIds.push(gpu.id);

    const newDue = remainingWatt * IGC_PER_WATT_PER_EPOCH;
    if (remainingBal >= newDue) break; // теперь хватает
  }

  const finalDue = parseFloat((remainingWatt * IGC_PER_WATT_PER_EPOCH).toFixed(6));

  return {
    farmId:        farm.id,
    userId:        farm.userId,
    totalWatt:     remainingWatt,
    igcCharged:    finalDue,
    igcRemaining:  parseFloat((farm.igcBalance - finalDue).toFixed(6)),
    farmShutdown:  offlineGpuIds.length === activeGpus.length,
    offlineGpuIds,
  };
}
