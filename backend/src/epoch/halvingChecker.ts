// ─────────────────────────────────────────────
// halvingChecker.ts
// Следит за totalPaidOut и переключает фазы халвинга.
// Утверждены пороги: 2k → 8k → 30k TON (Вариант А, Фаза 0).
// ─────────────────────────────────────────────

import { HALVING_PHASES } from './constants';
import { PoolStats } from './types';

export interface HalvingCheckResult {
  triggered:    boolean;
  previousPhase: number;
  newPhase:     number;
  newDripRate:  number;
  message:      string | null;
}

/**
 * Возвращает активную фазу по текущему totalPaidOut.
 * Используется при каждом старте сервера для восстановления состояния.
 */
export function getActivePhase(totalPaidOut: number): typeof HALVING_PHASES[number] {
  for (const phase of HALVING_PHASES) {
    if (totalPaidOut < phase.maxPaidOut) return phase;
  }
  return HALVING_PHASES[HALVING_PHASES.length - 1];
}

/**
 * Проверяет, нужен ли халвинг после выплаты эпохи.
 * Вызывается в конце каждой эпохи ПОСЛЕ обновления totalPaidOut.
 *
 * @param stats — текущее состояние пула (уже с обновлённым totalPaidOut)
 * @returns результат с флагом triggered и новыми параметрами
 */
export function checkHalving(stats: PoolStats): HalvingCheckResult {
  const currentPhase = HALVING_PHASES.find(p => p.phase === stats.currentPhase)!;
  const nextPhase    = getActivePhase(stats.totalPaidOut);

  // Халвинг не нужен
  if (nextPhase.phase === stats.currentPhase) {
    return {
      triggered:     false,
      previousPhase: stats.currentPhase,
      newPhase:      stats.currentPhase,
      newDripRate:   stats.dripRate,
      message:       null,
    };
  }

  // Халвинг сработал
  const message = buildHalvingMessage(currentPhase.phase, nextPhase.phase, nextPhase.dripRate);

  return {
    triggered:     true,
    previousPhase: currentPhase.phase,
    newPhase:      nextPhase.phase,
    newDripRate:   nextPhase.dripRate,
    message,
  };
}

/**
 * Формирует текст уведомления для рассылки в Telegram.
 */
function buildHalvingMessage(from: number, to: number, newRate: number): string {
  const pct = (newRate * 100).toFixed(1);
  return (
    `⚡ Халвинг сети!\n` +
    `Фаза ${from} → Фаза ${to}\n` +
    `Новая ставка наград: ${pct}% от пула в день.\n` +
    `Энергоэффективное оборудование теперь ценнее — обновите ферму!`
  );
}

/**
 * Проверяет, доступна ли покупка оборудования указанного тира в текущей фазе.
 * tier 6 (Квантовый X1) — только с Фазы 2.
 */
export function isEquipmentAvailable(modelTier: number, currentPhase: number): boolean {
  const { GPU_SPECS } = require('./constants');
  const spec = GPU_SPECS[modelTier];
  if (!spec) return false;
  return currentPhase >= spec.availablePhase;
}
