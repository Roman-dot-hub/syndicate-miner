// ─────────────────────────────────────────────────────────────────────
// economyAudit.ts  —  Standalone economic simulation
//
// Запуск: npx tsx src/tools/economyAudit.ts
//
// Симулирует N дней игры без БД/Redis.
// Проверяет: IGC supply/demand, TON ROI, electricity break-even,
// wear/refurbish balance, solo vs pool EV.
// ─────────────────────────────────────────────────────────────────────

import {
  GPU_SPECS,
  EPOCHS_PER_DAY,
  HALVING_PHASES,
  IGC_PER_WATT_PER_EPOCH,
  OVERCLOCK_WEAR_PENALTY,
  OVERCLOCK_HASHRATE_BONUS,
  OVERCLOCK_COST_MULT,
  COOLING_KTEMP,
  POOL_COMMISSION,
  REFERRAL_L1_HASHRATE_BONUS,
} from '../epoch/constants';

// ── Типы симуляции ────────────────────────────────────────────────────

interface SimGpu {
  tier:        number;
  health:      number;
  overclocked: boolean;
  cooling:     number;   // coolingLevel фермы
}

interface SimPlayer {
  id:           string;
  mode:         'pool' | 'solo';
  gpus:         SimGpu[];
  tonBalance:   number;
  igcBalance:   number;
  totalSpent:   number;   // суммарно потрачено TON
  tonEarned:    number;   // суммарно заработано TON
  igcEarned:    number;   // суммарно заработано IGC (gross)
  igcSpent:     number;   // суммарно потрачено IGC (электричество)
  epochsActive: number;
  gpusBroken:   number;
  refurbCost:   number;   // IGC потрачено на ремонт
  daysAlive:    number;
}

interface SimState {
  poolTon:    number;
  totalPaid:  number;
  dripRate:   number;
  phase:      number;
  cycleDay:   number;
  epoch:      number;
}

// ── Константы симуляции ──────────────────────────────────────────────

const SIM_DAYS           = 60;   // длительность
const EPOCHS             = SIM_DAYS * EPOCHS_PER_DAY;
const IGC_PER_GH_EPOCH   = 0.05;
// ── ПОСЛЕ ПАТЧА ──
const BASE_REFURBISH     = 3;    // было 10 → снижено для T1 окупаемости
const BREAKAGE_FACTOR    = 864;  // P_fail / 864 — нормировка поломок
const TIER_REFURB_MULT: Record<number, number> = {
  0: 0, 1: 1.0, 2: 1.8, 3: 3.5, 4: 7.0, 5: 20.0, 6: 50.0,
};
const GPU_PRICES: Record<number, number> = {
  0: 0, 1: 1, 2: 2.5, 3: 8, 4: 25, 5: 70, 6: 200,
};

// ── Эффективный хешрейт ──────────────────────────────────────────────
function effectiveH(gpu: SimGpu): number {
  const spec = GPU_SPECS[gpu.tier];
  const oc   = gpu.overclocked ? (1 + OVERCLOCK_HASHRATE_BONUS) : 1;
  const hpen = Math.floor((100 - gpu.health) / 5) * 0.02;
  return spec.hashrate * oc * Math.max(0, 1 - hpen);
}

// ── IGC стоимость одного GPU за эпоху (электричество + обслуживание) ──
function gpuCostPerEpoch(gpu: SimGpu, seasonMult: number): number {
  const spec  = GPU_SPECS[gpu.tier];
  const watts = spec.watt * (gpu.overclocked ? OVERCLOCK_COST_MULT : 1);
  const elec  = watts * IGC_PER_WATT_PER_EPOCH * seasonMult;
  const maint = (spec as any).igcMaintenancePerEpoch ?? 0;
  return elec + maint;
}

// ── Расчёт износа ────────────────────────────────────────────────────
function applyWear(gpu: SimGpu): { broken: boolean } {
  const spec   = GPU_SPECS[gpu.tier];
  const kTemp  = COOLING_KTEMP[gpu.cooling] ?? COOLING_KTEMP[0];
  const kLoad  = gpu.overclocked ? OVERCLOCK_WEAR_PENALTY : 1.0;
  const wear   = spec.baseWearPerEpoch * kTemp * kLoad;
  gpu.health   = Math.max(0, gpu.health - wear);
  // ПАТЧ: делитель 864 нормирует вероятность поломки
  const pFail  = Math.pow((100 - gpu.health) / 100, 3) / BREAKAGE_FACTOR;
  const broken = Math.random() < pFail;
  if (broken) gpu.health = 0;
  return { broken };
}

// ── Стоимость ремонта ────────────────────────────────────────────────
function refurbCost(gpu: SimGpu): number {
  return Math.ceil((100 - gpu.health) * BASE_REFURBISH * (TIER_REFURB_MULT[gpu.tier] ?? 1));
}

// ── Создание игроков ─────────────────────────────────────────────────
function makePlayer(id: string, tiers: number[], mode: 'pool' | 'solo', cooling = 2): SimPlayer {
  const gpus: SimGpu[] = tiers.map(t => ({ tier: t, health: 100, overclocked: false, cooling }));
  const totalSpent = tiers.reduce((s, t) => s + GPU_PRICES[t], 0);
  return {
    id, mode, gpus,
    tonBalance: 50, igcBalance: 200,
    totalSpent, tonEarned: 0, igcEarned: 0,
    igcSpent: 0, epochsActive: 0, gpusBroken: 0,
    refurbCost: 0, daysAlive: 0,
  };
}

// ── 20 тестовых игроков ──────────────────────────────────────────────
function buildPlayers(): SimPlayer[] {
  return [
    // Новички (T1)
    makePlayer('p01_newbie_t1',      [1],          'pool', 0),  // нет охлаждения
    makePlayer('p02_newbie_t1_fan',  [1],          'pool', 1),  // вентилятор
    makePlayer('p03_starter_t2',     [2],          'pool', 1),
    makePlayer('p04_starter_t1t2',   [1, 2],       'pool', 1),

    // Середнячки (T3-T4)
    makePlayer('p05_mid_t3',         [3],          'pool', 2),
    makePlayer('p06_mid_t3x2',       [3, 3],       'pool', 2),
    makePlayer('p07_mid_t4',         [4],          'pool', 2),
    makePlayer('p08_mid_t3t4',       [3, 4],       'pool', 2),

    // Опытные (T4-T5)
    makePlayer('p09_adv_t4x2',       [4, 4],       'pool', 2),
    makePlayer('p10_adv_t5',         [5],          'pool', 2),
    makePlayer('p11_adv_t5_oc',      [5],          'pool', 3),  // ASIC + пром.охл
    makePlayer('p12_adv_t4t5',       [4, 5],       'pool', 3),

    // Киты (Solo-режим)
    makePlayer('p13_whale_t5x2',     [5, 5],       'solo', 3),
    makePlayer('p14_whale_t4x3',     [4, 4, 4],    'solo', 2),

    // Разные конфиги
    makePlayer('p15_diversified',    [1, 2, 3, 4], 'pool', 2),
    makePlayer('p16_overclocker',    [3, 3],       'pool', 3),  // будем разгонять
    makePlayer('p17_mid_t3_nocool',  [3, 3],       'pool', 0),  // плохое охлаждение
    makePlayer('p18_poor_t1x3',      [1, 1, 1],    'pool', 0),  // 3 слабых, нет охл.
    makePlayer('p19_efficient_t2x3', [2, 2, 2],    'pool', 2),
    makePlayer('p20_allrounder',     [2, 3, 4, 5], 'pool', 3),
  ];
}

// ── Главная симуляция ─────────────────────────────────────────────────
function simulate() {
  const players = buildPlayers();
  // Разгоняем p16
  players.find(p => p.id === 'p16_overclocker')!.gpus.forEach(g => g.overclocked = true);

  const state: SimState = {
    poolTon:   500,  // реалистичный стартовый пул
    totalPaid: 0,
    dripRate:  HALVING_PHASES[0].dripRate,
    phase:     1,
    cycleDay:  1,
    epoch:     0,
  };

  // Статистика по дням
  const dailyStats: Array<{
    day:         number;
    poolTon:     number;
    dripRate:    number;
    epochReward: number;
    totalH:      number;
    igcSupply:   number;
    igcDemand:   number;
    activePlayers: number;
    phase:       number;
  }> = [];

  // Накопители за сутки
  let dayIgcSupply = 0;
  let dayIgcDemand = 0;

  for (let ep = 0; ep < EPOCHS; ep++) {
    const day = Math.floor(ep / EPOCHS_PER_DAY) + 1;
    state.epoch = ep;

    // Цикл сезона (28 дней)
    state.cycleDay = ((day - 1) % 28) + 1;
    const seasonMod      = 1 + 0.25 * Math.sin(2 * Math.PI * state.cycleDay / 28);
    const elecMultiplier = 2.2 - seasonMod;   // 0.95 (лето) – 1.45 (зима)
    const epochReward    = state.poolTon * state.dripRate * seasonMod / EPOCHS_PER_DAY;

    let totalH = 0;

    // ── Электричество + Износ ──────────────────────────────────────
    for (const player of players) {
      const activeGpus = player.gpus.filter(g => g.health > 0);
      if (activeGpus.length === 0) continue;

      // Суммарный IGC-долг: электричество + обслуживание
      const igcDue = activeGpus.reduce((s, g) => s + gpuCostPerEpoch(g, elecMultiplier), 0);

      if (player.igcBalance < igcDue) {
        // Ферма стоит — нет IGC (теперь включает обслуживание)
        continue;
      }

      player.igcBalance -= igcDue;
      player.igcSpent   += igcDue;
      dayIgcDemand      += igcDue;

      // Износ каждой карты
      let farmH = 0;
      for (const gpu of activeGpus) {
        const { broken } = applyWear(gpu);
        if (broken) {
          player.gpusBroken++;
          // Авторемонт если хватает IGC (стратегия: ремонтируем при 60% износа)
          const cost = refurbCost({ ...gpu, health: 0 });
          if (player.igcBalance >= cost) {
            player.igcBalance -= cost;
            player.refurbCost += cost;
            gpu.health         = 100;
          }
          continue;
        }
        // Авторемонт при health < 40%
        if (gpu.health < 40) {
          const cost = refurbCost(gpu);
          if (player.igcBalance >= cost) {
            player.igcBalance -= cost;
            player.refurbCost += cost;
            gpu.health         = 100;
          }
        }
        farmH += effectiveH(gpu);
      }

      if (farmH === 0) continue;

      // IGC-майнинг
      const igcEp = farmH * IGC_PER_GH_EPOCH;
      player.igcBalance += igcEp;
      player.igcEarned  += igcEp;
      dayIgcSupply      += igcEp;

      totalH            += farmH;
      player.epochsActive++;
    }

    // ── Распределение TON ────────────────────────────────────────────
    if (totalH > 0 && epochReward > 0) {
      // Solo lottery
      let soloH    = 0;
      const soloPl = players.filter(p => p.mode === 'solo' && p.gpus.some(g => g.health > 0));
      const poolPl = players.filter(p => p.mode === 'pool' && p.gpus.some(g => g.health > 0));
      const poolH  = poolPl.reduce((s, p) => s + p.gpus.filter(g => g.health > 0).reduce((a, g) => a + effectiveH(g), 0), 0);
      soloPl.forEach(p => soloH += p.gpus.filter(g => g.health > 0).reduce((a, g) => a + effectiveH(g), 0));

      const ticket = Math.random() * (poolH + soloH);
      if (ticket < poolH) {
        // Pool wins
        for (const p of poolPl) {
          const ph = p.gpus.filter(g => g.health > 0).reduce((a, g) => a + effectiveH(g), 0);
          if (ph === 0) continue;
          const earn = ph / poolH * epochReward * (1 - POOL_COMMISSION);
          p.tonBalance += earn;
          p.tonEarned  += earn;
        }
      } else {
        // Solo wins
        let cum = poolH;
        for (const p of soloPl) {
          const ph = p.gpus.filter(g => g.health > 0).reduce((a, g) => a + effectiveH(g), 0);
          cum += ph;
          if (ticket < cum) {
            p.tonBalance += epochReward;
            p.tonEarned  += epochReward;
            break;
          }
        }
      }

      state.poolTon   -= epochReward;
      state.totalPaid += epochReward;
    }

    // ── Суточная статистика ───────────────────────────────────────────
    if ((ep + 1) % EPOCHS_PER_DAY === 0) {
      dailyStats.push({
        day,
        poolTon:      state.poolTon,
        dripRate:     state.dripRate,
        epochReward:  epochReward,
        totalH,
        igcSupply:    dayIgcSupply,
        igcDemand:    dayIgcDemand,
        activePlayers: players.filter(p => p.gpus.some(g => g.health > 0) && p.igcBalance > 0).length,
        phase:        state.phase,
      });

      players.forEach(p => p.daysAlive++);
      dayIgcSupply = 0;
      dayIgcDemand = 0;

      // Халвинг
      for (const ph of HALVING_PHASES) {
        if (state.totalPaid < ph.maxPaidOut) {
          if (state.phase !== ph.phase) {
            console.log(`  ⚡ ХАЛВИНГ: Фаза ${state.phase} → ${ph.phase} (paid: ${state.totalPaid.toFixed(0)} TON)`);
          }
          state.dripRate = ph.dripRate;
          state.phase    = ph.phase;
          break;
        }
      }
    }
  }

  return { players, dailyStats, state };
}

// ── Форматирование и вывод ────────────────────────────────────────────

function fmt(n: number, d = 4) { return n.toFixed(d); }
function pct(n: number)         { return (n * 100).toFixed(1) + '%'; }
function bar(ratio: number, w = 20): string {
  const filled = Math.min(w, Math.round(ratio * w));
  return '█'.repeat(filled) + '░'.repeat(w - filled);
}

function printSection(title: string) {
  console.log('\n' + '═'.repeat(72));
  console.log(`  ${title}`);
  console.log('═'.repeat(72));
}

// ─────────────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────────────
console.log('\n🔬 SYNDICATE MINER — АУДИТ ЭКОНОМИКИ');
console.log(`   Симуляция: ${SIM_DAYS} дней × 288 эпох = ${EPOCHS} эпох`);
console.log(`   Игроков: 20  |  Стартовый пул: 500 TON\n`);

const { players, dailyStats, state: finalState } = simulate();

// ── 1. Обзор игроков ─────────────────────────────────────────────────
printSection('1. РЕЗУЛЬТАТЫ ИГРОКОВ (60 дней)');
console.log(
  'ID'.padEnd(26) +
  'Тиры'.padEnd(14) +
  'Режим'.padEnd(7) +
  'Потр.TON'.padEnd(10) +
  'Зараб.TON'.padEnd(11) +
  'ROI%'.padEnd(8) +
  'Net IGC'.padEnd(10) +
  'Сломок'.padEnd(8) +
  'Реф.IGC'
);
console.log('─'.repeat(94));

for (const p of players) {
  const tiers = p.gpus.map(g => `T${g.tier}`).join('+');
  const roi   = p.totalSpent > 0 ? (p.tonEarned / p.totalSpent * 100) : 0;
  const netIgc = p.igcEarned - p.igcSpent - p.refurbCost;
  const roiStr = roi.toFixed(1) + '%';
  console.log(
    p.id.padEnd(26) +
    tiers.padEnd(14) +
    p.mode.padEnd(7) +
    fmt(p.totalSpent, 1).padEnd(10) +
    fmt(p.tonEarned, 4).padEnd(11) +
    roiStr.padEnd(8) +
    fmt(netIgc, 1).padEnd(10) +
    String(p.gpusBroken).padEnd(8) +
    fmt(p.refurbCost, 0)
  );
}

// ── 2. IGC Экономика ─────────────────────────────────────────────────
printSection('2. IGC ECONOMY — СУТОЧНЫЙ БАЛАНС');
console.log('День   Пул TON     Supply    Demand   Ratio  Статус');
console.log('─'.repeat(60));

let igcWarnings = 0;
const snapDays  = [1, 7, 14, 21, 28, 35, 42, 49, 56, 60];
for (const s of dailyStats.filter(d => snapDays.includes(d.day))) {
  const ratio = s.igcDemand > 0 ? s.igcSupply / s.igcDemand : 1;
  const icon  = ratio < 0.8 ? '🔴' : ratio > 1.5 ? '🟡' : '✅';
  if (ratio < 0.8 || ratio > 2.0) igcWarnings++;
  console.log(
    `День ${String(s.day).padEnd(3)} ` +
    `${fmt(s.poolTon, 2).padEnd(11)} ` +
    `${fmt(s.igcSupply, 1).padEnd(10)}` +
    `${fmt(s.igcDemand, 1).padEnd(10)}` +
    `${ratio.toFixed(3).padEnd(7)}` +
    icon
  );
}

// ── 3. Анализ IGC-расходов по тирам (электр. + обслуживание) ─────────
printSection('3. ПОЛНЫЙ IGC БАЛАНС: ЭЛЕКТРИЧЕСТВО + ОБСЛУЖИВАНИЕ');
console.log('Тир  Earn/д    Elec/д  Maint/д  Total/д  Net(норм)  Net(зима)  Роль');
console.log('─'.repeat(82));

for (let tier = 0; tier <= 5; tier++) {
  const spec    = GPU_SPECS[tier];
  const earnD   = spec.hashrate * IGC_PER_GH_EPOCH * EPOCHS_PER_DAY;
  const elecN   = spec.watt * IGC_PER_WATT_PER_EPOCH * EPOCHS_PER_DAY * 1.0;
  const elecW   = spec.watt * IGC_PER_WATT_PER_EPOCH * EPOCHS_PER_DAY * 1.45;
  const maintD  = ((spec as any).igcMaintenancePerEpoch ?? 0) * EPOCHS_PER_DAY;
  const totalN  = elecN + maintD;
  const totalW  = elecW + maintD;
  const netN    = earnD - totalN;
  const netW    = earnD - totalW;
  const role    = netW > 20 ? '📈 производитель' : netN > 0 ? '✅ слабый+' : Math.abs(netN) < 5 ? '⚖️  безубыток' : '🔴 потребитель';
  console.log(
    `T${tier}   ` +
    `${fmt(earnD, 1).padEnd(10)}` +
    `${fmt(elecN, 1).padEnd(8)}` +
    `${fmt(maintD, 1).padEnd(9)}` +
    `${fmt(totalN, 1).padEnd(9)}` +
    `${fmt(netN, 1).padEnd(11)}` +
    `${fmt(netW, 1).padEnd(11)}` +
    role
  );
}

// ── 4. Анализ ремонта ─────────────────────────────────────────────────
printSection('4. WEAR & REFURBISH: ОКУПАЕМОСТЬ РЕМОНТА');
console.log('Тир  Износ%/д  Ресурс(дн)  NetIGC/д  FullRefurb(IGC)  Дней_на_ремонт  Status');
console.log('─'.repeat(85));

for (let tier = 1; tier <= 5; tier++) {
  const spec    = GPU_SPECS[tier];
  const wearD   = spec.baseWearPerEpoch * EPOCHS_PER_DAY * COOLING_KTEMP[2];
  const lifeD   = wearD > 0 ? (100 / wearD) : Infinity;
  const earnD   = spec.hashrate * IGC_PER_GH_EPOCH * EPOCHS_PER_DAY;
  const elecD   = spec.watt * IGC_PER_WATT_PER_EPOCH * EPOCHS_PER_DAY;
  const netIgcD = earnD - elecD;
  const fullR   = 100 * BASE_REFURBISH * (TIER_REFURB_MULT[tier] ?? 1);
  const daysR   = netIgcD > 0 ? (fullR / netIgcD) : Infinity;
  const ok      = daysR < 20 ? '✅ быстро' : daysR < 50 ? '⚠️  долго' : '❌ нет смысла';
  console.log(
    `T${tier}   ` +
    `${fmt(wearD, 3).padEnd(11)}` +
    `${fmt(lifeD, 1).padEnd(12)}` +
    `${fmt(netIgcD, 1).padEnd(10)}` +
    `${String(fullR).padEnd(17)}` +
    `${daysR === Infinity ? '∞    '.padEnd(16) : fmt(daysR, 1).padEnd(16)}` +
    ok
  );
}

// ── 5. ROI анализ ─────────────────────────────────────────────────────
printSection('5. TON ROI АНАЛИЗ (пул 500 TON, 20 игроков)');

// Считаем среднесуточный доход
const activeDays = dailyStats.filter(d => d.totalH > 0);
const avgH       = activeDays.reduce((s, d) => s + d.totalH, 0) / activeDays.length;

for (let tier = 1; tier <= 5; tier++) {
  const price = GPU_PRICES[tier];
  const spec  = GPU_SPECS[tier];
  if (price === 0) continue;

  // Средний заработок за эпоху при средних условиях пула
  const avgPool    = dailyStats.reduce((s, d) => s + d.poolTon, 0) / dailyStats.length;
  const avgReward  = avgPool * HALVING_PHASES[0].dripRate / EPOCHS_PER_DAY;
  const shareRatio = avgH > 0 ? spec.hashrate / (avgH + spec.hashrate) : 0;
  const tonPerDay  = avgReward * EPOCHS_PER_DAY * shareRatio * (1 - POOL_COMMISSION);
  const roiDays    = tonPerDay > 0 ? price / tonPerDay : Infinity;
  const ok         = roiDays < 30 ? '✅' : roiDays < 90 ? '⚠️' : '❌';

  console.log(
    `T${tier} (${price} TON): ` +
    `~${fmt(tonPerDay, 5)} TON/день → ROI за ${fmt(roiDays, 0)} дней ${ok}`
  );
}

// ── 6. Pool longevity ─────────────────────────────────────────────────
printSection('6. LONGEVITY ПУЛА');
const startPool = 500;
const endPool   = finalState.poolTon;
const pctDrain  = (startPool - endPool) / startPool * 100;
console.log(`Стартовый пул:  ${startPool.toFixed(2)} TON`);
console.log(`Остаток:        ${endPool.toFixed(2)} TON`);
console.log(`Дренаж за 60д:  ${pctDrain.toFixed(1)}%  (${(startPool - endPool).toFixed(2)} TON)`);
console.log(`Средний дренаж: ${((startPool - endPool) / SIM_DAYS).toFixed(3)} TON/день`);
console.log(`При 0 новых игроков пул закончится через: ~${(endPool / ((startPool - endPool) / SIM_DAYS)).toFixed(0)} дней`);

// ── 7. IGC ratio по сезону ────────────────────────────────────────────
printSection('7. IGC RATIO ПО СЕЗОННОМУ ЦИКЛУ (день 1..28)');
console.log('Анализируем первые 28 дней...');
for (let d = 1; d <= 28; d++) {
  if (d % 4 !== 0 && d !== 1 && d !== 28) continue;
  const stat  = dailyStats.find(s => s.day === d);
  if (!stat) continue;
  const ratio = stat.igcDemand > 0 ? stat.igcSupply / stat.igcDemand : 1;
  const sm    = 1 + 0.25 * Math.sin(2 * Math.PI * d / 28);
  const em    = 2.2 - sm;
  const icon  = ratio < 0.8 ? '🔴' : ratio > 2.0 ? '🔴' : ratio > 1.2 ? '🟡' : '✅';
  console.log(`  День ${String(d).padEnd(3)} сезон=${sm.toFixed(3)} elec×${em.toFixed(3)} | ratio=${ratio.toFixed(3)} ${icon}`);
}

// ── 8. Итоговые выводы ────────────────────────────────────────────────
printSection('8. ВЫЯВЛЕННЫЕ ПРОБЛЕМЫ И РЕКОМЕНДАЦИИ');

// Проблема 1: T1 зима
const t1  = GPU_SPECS[1];
const t1W = t1.watt * IGC_PER_WATT_PER_EPOCH * EPOCHS_PER_DAY * 1.45;
const t1E = t1.hashrate * IGC_PER_GH_EPOCH * EPOCHS_PER_DAY;
if (t1E < t1W) {
  console.log('❌ КРИТ: T1 GPU уходит в минус зимой!');
  console.log(`   Зарабатывает: ${t1E.toFixed(1)} IGC/день`);
  console.log(`   Тратит (зима): ${t1W.toFixed(1)} IGC/день`);
  console.log(`   Дефицит: ${(t1W - t1E).toFixed(1)} IGC/день`);
  console.log(`   → Снизить watt T1 до 75 или поднять IGC_PER_GH до 0.07`);
}

// Проблема 2: T1 ремонт
const t1Refurb  = 100 * BASE_REFURBISH * 1.0;
const t1NetDay  = t1E - t1.watt * IGC_PER_WATT_PER_EPOCH * EPOCHS_PER_DAY;
const t1RefDays = t1NetDay > 0 ? t1Refurb / t1NetDay : Infinity;
if (t1RefDays > 60) {
  console.log(`\n❌ КРИТ: T1 ремонт (${t1Refurb} IGC) окупается за ${t1RefDays.toFixed(0)} дней!`);
  console.log(`   Это дольше срока службы GPU. Игроки не могут позволить ремонт.`);
  console.log(`   → Снизить BASE_REFURBISH_COST с 10 до 4 IGC/1%`);
}

// Проблема 3: новые пользователи
const t0EpochIgc = GPU_SPECS[0].hashrate * IGC_PER_GH_EPOCH;
const t0DayIgc   = t0EpochIgc * EPOCHS_PER_DAY;
const t1DayElec  = t1.watt * IGC_PER_WATT_PER_EPOCH * EPOCHS_PER_DAY;
const daysToAffordT1 = t1DayElec / t0DayIgc; // дней до буфера на 1 день T1
console.log(`\n⚠️  ОНБОРДИНГ: С USB Nano зарабатывается ${t0DayIgc.toFixed(2)} IGC/день`);
console.log(`   T1 потребляет ${t1DayElec.toFixed(1)} IGC/день в электричество.`);
console.log(`   → Новые игроки нуждаются в стартовом IGC-бонусе (рекомендуется: 50 IGC)`);

// Проблема 4: Solo EV
const soloPlayers  = players.filter(p => p.mode === 'solo');
const soloTonTotal = soloPlayers.reduce((s, p) => s + p.tonEarned, 0);
const poolTonTotal = players.filter(p => p.mode === 'pool').reduce((s, p) => s + p.tonEarned, 0);
const soloShare    = soloPlayers.reduce((s, p) => s + p.gpus.reduce((a, g) => a + GPU_SPECS[g.tier].hashrate, 0), 0);
const totalGpuH    = players.reduce((s, p) => s + p.gpus.reduce((a, g) => a + GPU_SPECS[g.tier].hashrate, 0), 0);
console.log(`\n📊 SOLO vs POOL (фактические итоги 60 дней):`);
console.log(`   Solo игроки (${soloPlayers.length} чел, ${pct(soloShare/totalGpuH)} хешрейта): ${soloTonTotal.toFixed(4)} TON`);
console.log(`   Pool игроки (${players.filter(p=>p.mode==='pool').length} чел): ${poolTonTotal.toFixed(4)} TON`);

// Breakdown vs breakeven
const avgNetIgcPerPlayer = players.reduce((s, p) => s + (p.igcEarned - p.igcSpent - p.refurbCost), 0) / players.length;
console.log(`\n📊 Средний Net IGC за 60 дней на игрока: ${avgNetIgcPerPlayer.toFixed(1)}`);

const totalBroken = players.reduce((s, p) => s + p.gpusBroken, 0);
console.log(`📊 Всего поломок GPU: ${totalBroken} из ${players.reduce((s, p) => s + p.gpus.length, 0)}`);
console.log(`📊 Финальный пул: ${finalState.poolTon.toFixed(2)} TON | Paid out: ${finalState.totalPaid.toFixed(2)} TON`);

// IGC warnings
if (igcWarnings === 0) console.log('\n✅ IGC economy: соотношение supply/demand в норме весь период');
else console.log(`\n⚠️  IGC economy: ${igcWarnings} дней с ratio вне диапазона 0.8-2.0`);

console.log('\n' + '═'.repeat(72));
console.log('Аудит завершён.');
console.log('═'.repeat(72) + '\n');
