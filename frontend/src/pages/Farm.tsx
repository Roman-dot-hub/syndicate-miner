import { useState, useEffect } from 'react';
import type { SyncData, TapBoost, GPU } from '../types';
import { FARM_LEVELS, GPU_SPECS } from '../types';
import { GpuCard }       from '../components/GpuCard';
import { GpuDetailModal } from '../components/GpuDetailModal';
import { TapToCool }     from '../components/TapToCool';

function fmtH(h: number): string {
  if (h >= 1000) return `${(h / 1000).toFixed(2)} TH/s`;
  if (h >= 1)    return `${h.toFixed(2)} GH/s`;
  return `${(h * 1000).toFixed(0)} MH/s`;
}

function calcFarmStats(gpus: GPU[], poolTon: number, dripRate: number, globalH: number) {
  let totalHashrate = 0;
  let igcEarnDay    = 0;
  let igcCostDay    = 0;

  for (const gpu of gpus) {
    if (gpu.status !== 'active') continue;
    const spec = GPU_SPECS[gpu.modelTier] ?? GPU_SPECS[0];
    const overcMult = gpu.overclocked ? 1.20 : 1.0;
    const uvMult    = gpu.undervolted  ? 0.85 : 1.0;

    totalHashrate += spec.hashrate * overcMult * uvMult;
    igcEarnDay    += spec.igcPerDay * overcMult * uvMult;

    const extraWatt = gpu.overclocked ? spec.wattBackend * 0.40 * 0.001 * 288 : 0;
    igcCostDay += (spec.igcCostPerDay + extraWatt) * (gpu.undervolted ? 0.75 : 1.0);
  }

  const dailyPoolTon = poolTon * dripRate;
  // Если глобальный хешрейт известен — считаем долю точно.
  // Если нет (Redis и epoch_log пусты) — показываем как % от пула,
  // предполагая что ферма = весь пул (пессимистично-оптимистичный worst case).
  const shareRatio      = globalH > 0 ? totalHashrate / globalH : 1;
  const estimatedTonDay = dailyPoolTon * shareRatio;
  const isExact         = globalH > 0;

  return { totalHashrate, igcEarnDay, igcCostDay, netIgcDay: igcEarnDay - igcCostDay, estimatedTonDay, isExact };
}

interface Props {
  data:        SyncData;
  onUpdate:    () => void;
  onSwitchTab: (tab: string) => void;
}

export function Farm({ data, onUpdate, onSwitchTab }: Props) {
  const [boostEndTime, setBoostEndTime] = useState(0);
  const [, setTick] = useState(0);
  const [selectedGpu, setSelectedGpu] = useState<GPU | null>(null);
  const [showStorage,  setShowStorage]  = useState(false);

  // Tick every second while boost is active
  useEffect(() => {
    if (boostEndTime <= Date.now()) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [boostEndTime]);

  const localSecondsLeft = Math.max(0, Math.round((boostEndTime - Date.now()) / 1000));
  const serverBoost = data.tapBoost;
  const mergedBoost: TapBoost = {
    active:          localSecondsLeft > 0 || (serverBoost?.active ?? false),
    secondsLeft:     Math.max(localSecondsLeft, serverBoost?.secondsLeft ?? 0),
    cooldownSeconds: serverBoost?.cooldownSeconds ?? 0,
    tapsUsed:        serverBoost?.tapsUsed ?? 0,
    tapsRemaining:   serverBoost?.tapsRemaining ?? 3600,
  };

  const handleBoostTap = (boostSeconds: number) => {
    setBoostEndTime(prev => {
      const base = Math.max(prev, Date.now());
      return base + boostSeconds * 1000;
    });
  };

  const rawFarm = data.farm as any;
  const farm = {
    ...data.farm,
    maxSlots:     rawFarm.maxSlots     ?? rawFarm.max_slots     ?? 5,
    coolingLevel: rawFarm.coolingLevel ?? rawFarm.cooling_level ?? 0,
    igcBalance:   rawFarm.igcBalance   ?? rawFarm.igc_balance   ?? 0,
  };

  const activeGpus = data.gpus.filter(g => g.status !== 'stored');
  const storedGpus = data.storedGpus ?? data.gpus.filter(g => g.status === 'stored');
  const freeSlots  = Math.max(0, farm.maxSlots - activeGpus.length);

  const globalH   = data.network?.globalHashrate ?? 0;
  const poolTon   = data.season.poolTon;
  const dripRate  = data.season.dripRate;
  const stats     = calcFarmStats(activeGpus, poolTon, dripRate, globalH);

  // Refresh modal GPU state when data updates
  const refreshedSelected = selectedGpu
    ? ([...activeGpus, ...storedGpus].find(g => g.id === selectedGpu.id) ?? null)
    : null;

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Farm header */}
      <div style={{
        background: 'rgba(255,255,255,0.05)', borderRadius: 14,
        padding: '12px 16px',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
            🏭 {FARM_LEVELS[farm.level] ?? 'Ферма'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
            {activeGpus.length} / {farm.maxSlots} слотов · Охлаждение Lv{farm.coolingLevel}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: '#9B59B6', fontWeight: 600 }}>
            {Math.floor(farm.igcBalance)} IGC
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>на электричество</div>
        </div>
      </div>

      {/* Farm stats summary */}
      {activeGpus.length > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 14, overflow: 'hidden',
        }}>
          {/* Hashrate row */}
          <div style={{
            background: 'rgba(0,152,234,0.08)',
            padding: '8px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>⛏️ Суммарный хешрейт</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0098EA' }}>{fmtH(stats.totalHashrate)}</span>
          </div>
          {/* Income / Expense grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            {/* IGC income */}
            <div style={{ padding: '10px 16px', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 3 }}>IGC доход/день</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#9B59B6' }}>+{stats.igcEarnDay.toFixed(1)}</div>
            </div>
            {/* IGC expense */}
            <div style={{ padding: '10px 16px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 3 }}>IGC расход/день</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,100,100,0.85)' }}>−{stats.igcCostDay.toFixed(1)}</div>
            </div>
          </div>
          {/* Net IGC + TON row */}
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0,
          }}>
            <div style={{ padding: '8px 16px', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>IGC баланс/день</div>
              <div style={{
                fontSize: 13, fontWeight: 700,
                color: stats.netIgcDay >= 0 ? '#2ECC71' : '#E74C3C',
              }}>
                {stats.netIgcDay >= 0 ? '+' : ''}{stats.netIgcDay.toFixed(1)}
              </div>
            </div>
            <div style={{ padding: '8px 16px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>≈ TON/день</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F39C12' }}>
                ~{stats.estimatedTonDay.toFixed(4)}
                {!stats.isExact && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginLeft: 3 }}>макс</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tap to Cool */}
      <TapToCool onUpdate={onUpdate} tapBoost={mergedBoost} onBoostTap={handleBoostTap} />

      {/* Active GPUs */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Активные майнеры
          </div>
          {storedGpus.length > 0 && (
            <button
              onClick={() => setShowStorage(s => !s)}
              style={{
                background: showStorage ? 'rgba(243,156,18,0.2)' : 'rgba(255,255,255,0.07)',
                border: `1px solid ${showStorage ? 'rgba(243,156,18,0.4)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
                fontSize: 11, fontWeight: 600,
                color: showStorage ? '#F39C12' : 'rgba(255,255,255,0.55)',
              }}
            >
              📦 Склад ({storedGpus.length})
            </button>
          )}
        </div>

        {activeGpus.length === 0 ? (
          <div style={{
            textAlign: 'center', color: 'rgba(255,255,255,0.3)',
            padding: '24px 16px', fontSize: 13,
            background: 'rgba(255,255,255,0.03)', borderRadius: 12,
            border: '1px dashed rgba(255,255,255,0.08)',
          }}>
            Нет активных майнеров.<br />
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>Купи GPU в магазине →</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeGpus.map(gpu => (
              <GpuCard
                key={gpu.id}
                gpu={gpu}
                tapBoost={mergedBoost}
                onClick={() => setSelectedGpu(gpu)}
              />
            ))}
          </div>
        )}

        {/* Empty slots */}
        {freeSlots > 0 && activeGpus.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {Array.from({ length: freeSlots }).map((_, i) => (
              <div key={i} style={{
                borderRadius: 12, padding: '12px 16px', textAlign: 'center',
                border: '1px dashed rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.18)', fontSize: 12,
              }}>
                + Пустой слот
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Storage section */}
      {showStorage && storedGpus.length > 0 && (
        <div>
          <div style={{
            fontSize: 12, fontWeight: 600, color: '#F39C12',
            textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8,
          }}>
            📦 Склад — неустановленное оборудование
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {storedGpus.map(gpu => (
              <GpuCard
                key={gpu.id}
                gpu={gpu}
                onClick={() => setSelectedGpu(gpu)}
              />
            ))}
          </div>
        </div>
      )}

      {/* GPU detail modal */}
      {selectedGpu && (
        <GpuDetailModal
          gpu={refreshedSelected ?? selectedGpu}
          farmIgc={farm.igcBalance}
          farmCooling={farm.coolingLevel}
          tapBoost={mergedBoost}
          onClose={() => setSelectedGpu(null)}
          onUpdate={() => { onUpdate(); }}
          onGoToShop={() => { setSelectedGpu(null); onSwitchTab('shop'); }}
        />
      )}
    </div>
  );
}
