// ─────────────────────────────────────────────
// electricityBill.ts
// Списывает IGC за потребление электричества за эпоху.
// Если IGC не хватает — ферма останавливается.
// ─────────────────────────────────────────────

import {
  GPU_SPECS, IGC_PER_WATT_PER_EPOCH,
  OVERCLOCK_COST_MULT, UNDERVOLT_WATT_MULT,
} from './constants';

// Плата за эксплуатацию GPU — сколько IGC берётся с фермы за эпоху.
// OC: все затраты (электро + мейнтейнс) ×1.20 — усиливает существующую динамику.
// UV: только электричество ×0.90 (мейнтейнс не меняется).
// OC и UV взаимно исключают друг друга.
export function gpuIgcCostPerEpoch(
  gpu:              { modelTier: number; overclocked: boolean; undervolted?: boolean },
  seasonMultiplier: number,
): number {
  const spec   = GPU_SPECS[gpu.modelTier];
  const elec   = spec.watt * IGC_PER_WATT_PER_EPOCH * seasonMultiplier;
  const maint  = spec.igcMaintenancePerEpoch ?? 0;
  const base   = elec + maint;
  // UV: −10% от ВСЕГО расхода (электро + обслуживание)
  const uvMult = gpu.undervolted ? UNDERVOLT_WATT_MULT : 1.0;
  // OC: ×1.20 ко всему (применяется после UV, взаимоисключающие)
  const ocMult = gpu.overclocked ? OVERCLOCK_COST_MULT : 1.0;
  return parseFloat((base * uvMult * ocMult).toFixed(6));
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
    const wattMult = gpu.undervolted ? UNDERVOLT_WATT_MULT : 1.0;
    return sum + spec.watt * wattMult * (gpu.overclocked ? OVERCLOCK_COST_MULT : 1.0);
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
    const wattMult = g.undervolted ? UNDERVOLT_WATT_MULT : 1.0;
    return s + GPU_SPECS[g.modelTier].watt * wattMult * (g.overclocked ? OVERCLOCK_COST_MULT : 1.0);
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
  const finalWatt  = remainingGpus.reduce((s, g) => {
    const wattMult = g.undervolted ? UNDERVOLT_WATT_MULT : 1.0;
    return s + GPU_SPECS[g.modelTier].watt * wattMult * (g.overclocked ? OVERCLOCK_COST_MULT : 1.0);
  }, 0);

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
