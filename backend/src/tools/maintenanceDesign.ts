// ─────────────────────────────────────────────────────────────────────
// maintenanceDesign.ts — расчёт платы за обслуживание оборудования
//
// Цель: T1-T2 = IGC-производители (новички продают IGC на маркете)
//       T3     = точка безубыточности
//       T4-T5  = IGC-потребители (киты покупают IGC у новичков)
//
// Это создаёт двухсторонний рынок и реальную ценность IGC.
// ─────────────────────────────────────────────────────────────────────

import { GPU_SPECS, IGC_PER_WATT_PER_EPOCH, EPOCHS_PER_DAY } from '../epoch/constants';

const IGC_PER_GH_EPOCH = 0.05;

console.log('\n📐 РАСЧЁТ ОБСЛУЖИВАНИЯ: IGC БАЛАНС ПО ТИРАМ');
console.log('═'.repeat(72));
console.log('Цель: T1-T2 = +IGC (производители), T3 = ~0, T4-T5 = -IGC (потребители)');
console.log('─'.repeat(72));

// ── Текущее состояние (только электричество) ──────────────────────────
console.log('\n[Текущее состояние — только электричество:]');
console.log('Тир  Earn/д    Elec/д   Net/д     Роль');
console.log('─'.repeat(52));
for (let tier = 0; tier <= 5; tier++) {
  const spec  = GPU_SPECS[tier];
  const earn  = spec.hashrate * IGC_PER_GH_EPOCH * EPOCHS_PER_DAY;
  const elec  = spec.watt     * IGC_PER_WATT_PER_EPOCH * EPOCHS_PER_DAY;
  const net   = earn - elec;
  const role  = net > 50 ? '📈 крупный профицит' : net > 5 ? '✅ производитель' : net > -5 ? '⚖️  безубыток' : '📉 потребитель';
  console.log(`T${tier}   ${earn.toFixed(1).padEnd(10)}${elec.toFixed(1).padEnd(9)}${net.toFixed(1).padEnd(10)}${role}`);
}

// ── Задача: найти обслуживание, при котором T3 = break-even ───────────
console.log('\n[Целевые значения платы за обслуживание (IGC/эпоху на GPU):]');

// T3 break-even: earn - elec - maintenance = 0
// maintenance = earn - elec (per epoch)
const t3Earn  = GPU_SPECS[3].hashrate * IGC_PER_GH_EPOCH;
const t3Elec  = GPU_SPECS[3].watt * IGC_PER_WATT_PER_EPOCH;
const t3Maint = t3Earn - t3Elec; // IGC/эпоху для T3 break-even

// Масштабируем обслуживание пропорционально хешрейту × watt (ASIC сложнее обслуживать)
const MAINT_SCALE: Record<number, number> = {
  0: 0,
  1: 0,
  2: 0.05,
  3: t3Maint,  // точная точка безубыточности для T3
  4: 2.0,      // T4: умеренный дефицит
  5: 5.0,      // T5 ASIC: значительный дефицит
  6: 12.0,     // T6 X1: огромный дефицит (только Фаза 2+)
};

console.log('Тир  Обслуж/эп  Обслуж/д  Earn/д    Total Cost/д  Net/д     Роль');
console.log('─'.repeat(76));

let totalSupplyDay   = 0;
let totalDemandDay   = 0;
let totalMaintDay    = 0;

// Приблизительное распределение GPU по 20 игрокам (из симуляции)
const GPU_COUNT_APPROX: Record<number, number> = { 0:1, 1:7, 2:8, 3:10, 4:8, 5:5, 6:0 };

for (let tier = 0; tier <= 5; tier++) {
  const spec    = GPU_SPECS[tier];
  const earn    = spec.hashrate * IGC_PER_GH_EPOCH * EPOCHS_PER_DAY;
  const elec    = spec.watt     * IGC_PER_WATT_PER_EPOCH * EPOCHS_PER_DAY;
  const maintD  = MAINT_SCALE[tier] * EPOCHS_PER_DAY;
  const totalCostD = elec + maintD;
  const net     = earn - totalCostD;
  const role    = net > 20 ? '📈 производитель' : net > 0 ? '✅ слабый+ ' : Math.abs(net) < 5 ? '⚖️  безубыток' : '🔴 потребитель';
  const maintStr = MAINT_SCALE[tier].toFixed(3);

  console.log(
    `T${tier}   ${maintStr.padEnd(10)}${maintD.toFixed(1).padEnd(10)}` +
    `${earn.toFixed(1).padEnd(10)}${totalCostD.toFixed(1).padEnd(14)}` +
    `${net.toFixed(1).padEnd(10)}${role}`,
  );

  // Для 20-игрового пула
  const n = GPU_COUNT_APPROX[tier] ?? 0;
  totalSupplyDay  += n * earn;
  totalDemandDay  += n * elec;
  totalMaintDay   += n * maintD;
}

const totalDemandAll = totalDemandDay + totalMaintDay;
const ratio = totalDemandAll > 0 ? totalSupplyDay / totalDemandAll : 99;

console.log('\n─'.repeat(76));
console.log(`\n📊 Суммарно (20 игроков, ~40 GPU):`);
console.log(`  Supply/день:   ${totalSupplyDay.toFixed(0)} IGC`);
console.log(`  Elec/день:     ${totalDemandDay.toFixed(0)} IGC`);
console.log(`  Maint/день:    ${totalMaintDay.toFixed(0)} IGC`);
console.log(`  Total cost/д:  ${totalDemandAll.toFixed(0)} IGC`);
console.log(`  Supply/Demand: ${ratio.toFixed(2)}  ${ratio < 0.8 ? '🔴 дефицит' : ratio > 1.5 ? '🟡 профицит' : '✅ НОРМА'}`);

console.log('\n📐 Итог по дизайну:');
console.log(`  T3 точка безубыточности при обслуживании = ${t3Maint.toFixed(4)} IGC/эпоху`);
console.log(`  = ${(t3Maint * EPOCHS_PER_DAY).toFixed(1)} IGC/день`);
console.log('\n  Рекомендуемые константы:');
for (const [tier, maint] of Object.entries(MAINT_SCALE)) {
  if (parseFloat(tier) > 5) continue;
  console.log(`  T${tier}: igcMaintenancePerEpoch = ${maint.toFixed(4)}`);
}

console.log('\n💡 Нарратив для игрока:');
console.log('  T0-T1: "Базовое майнинг-оборудование — не требует обслуживания"');
console.log('  T2:    "Офисный ПК — минимальные затраты на охлаждение"');
console.log('  T3:    "Игровой ПК — самоокупается по IGC, прибыль только в TON"');
console.log('  T4:    "Майнинг-rig — высокие операционные расходы, нужен IGC"');
console.log('  T5:    "ASIC шахтёр — промышленное оборудование, требует IGC-закупок"');
console.log('  T6:    "Квантовый X1 — элитное оборудование, огромные расходы IGC"\n');
