import { useState } from 'react';
import WebApp from '@twa-dev/sdk';
import type { SyncData, TapBoost, GPU } from '../types';
import { FARM_LEVELS, GPU_SPECS, SERVER_ROOM_LEVELS, UPS_LEVELS, PROVIDER_LEVELS } from '../types';
import { useAction } from '../hooks/useAction';
import { GpuCard }       from '../components/GpuCard';
import { GpuDetailModal } from '../components/GpuDetailModal';
import { GpuShopModal }  from '../components/GpuShopModal';
import { AdBoost }       from '../components/AdBoost';

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

    if (gpu.overclocked) {
      igcCostDay += spec.igcCostPerDay * 1.20;
    } else if (gpu.undervolted) {
      const elecPerDay = spec.wattBackend * 0.001 * 288;
      igcCostDay += spec.igcCostPerDay - elecPerDay * 0.10;
    } else {
      igcCostDay += spec.igcCostPerDay;
    }
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
  onSwitchTab?: (tab: string) => void;
}

export function Farm({ data, onUpdate }: Props) {
  const [boostEndTime, setBoostEndTime] = useState(() => {
    const stored = localStorage.getItem('adBoost_endTime');
    return stored ? parseInt(stored, 10) : 0;
  });
  const [selectedGpu, setSelectedGpu]   = useState<GPU | null>(null);
  const [showStorage,  setShowStorage]  = useState(false);
  const [showGpuShop,  setShowGpuShop]  = useState(false);

  const serverBoost = data.tapBoost;
  const mergedBoost: TapBoost = {
    active:            boostEndTime > Date.now() || (serverBoost?.active ?? false),
    secondsLeft:       Math.max(
      Math.round((boostEndTime - Date.now()) / 1000),
      serverBoost?.secondsLeft ?? 0,
    ),
    adViewsInCycle:    serverBoost?.adViewsInCycle    ?? 0,
    adViewsPerCycle:   serverBoost?.adViewsPerCycle   ?? 10,
    adCooldownSeconds: serverBoost?.adCooldownSeconds ?? 0,
  };

  const handleBoostActivate = (boostSeconds: number) => {
    setBoostEndTime(prev => {
      const base = Math.max(prev, Date.now());
      const next = base + boostSeconds * 1000;
      localStorage.setItem('adBoost_endTime', String(next));
      return next;
    });
  };

  const rawFarm = data.farm as any;
  const farm = {
    ...data.farm,
    maxSlots:        rawFarm.maxSlots        ?? rawFarm.max_slots        ?? 5,
    coolingLevel:    rawFarm.coolingLevel    ?? rawFarm.cooling_level    ?? 0,
    igcBalance:      rawFarm.igcBalance      ?? rawFarm.igc_balance      ?? 0,
    serverRoomLevel: rawFarm.serverRoomLevel ?? rawFarm.server_room_level ?? 1,
    upsLevel:        rawFarm.upsLevel        ?? rawFarm.ups_level         ?? 1,
    providerLevel:   rawFarm.providerLevel   ?? rawFarm.provider_level   ?? 1,
    workbenchLevel:  rawFarm.workbenchLevel  ?? rawFarm.workbench_level  ?? 0,
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
            {activeGpus.length} / {farm.maxSlots} слотов
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

      {/* Ферма & Верстак */}
      <FarmUpgradesSection
        farm={farm}
        userTon={data.user.tonBalance}
        userIgc={farm.igcBalance}
        igcRatio={data.igcSupply?.ratio ?? data.igc?.ratio ?? 1}
        onUpdate={onUpdate}
      />

      {/* Server Room */}
      <ServerRoom
        farm={farm}
        userTon={data.user.tonBalance}
        onUpdate={onUpdate}
      />

      {/* Ad Boost */}
      <AdBoost
        tapBoost={mergedBoost}
        onUpdate={onUpdate}
        boostEndTime={boostEndTime}
        onBoostActivate={handleBoostActivate}
      />

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
          <button
            onClick={() => setShowGpuShop(true)}
            style={{
              width: '100%', textAlign: 'center', color: 'rgba(255,255,255,0.3)',
              padding: '24px 16px', fontSize: 13,
              background: 'rgba(255,255,255,0.03)', borderRadius: 12,
              border: '1px dashed rgba(0,152,234,0.2)',
              cursor: 'pointer',
            }}
          >
            Нет активных майнеров.<br />
            <span style={{ color: '#0098EA', fontSize: 11 }}>Нажми чтобы купить GPU →</span>
          </button>
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

        {/* Empty slots — кликабельны, открывают магазин */}
        {freeSlots > 0 && activeGpus.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {Array.from({ length: freeSlots }).map((_, i) => (
              <button
                key={i}
                onClick={() => setShowGpuShop(true)}
                style={{
                  borderRadius: 12, padding: '12px 16px', textAlign: 'center',
                  border: '1px dashed rgba(0,152,234,0.18)',
                  background: 'rgba(0,152,234,0.03)',
                  color: 'rgba(0,152,234,0.45)', fontSize: 12, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                + Купить GPU
              </button>
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
          farmWorkbench={farm.workbenchLevel}
          farmServerRoom={farm.serverRoomLevel}
          farmUps={farm.upsLevel}
          farmProvider={farm.providerLevel}
          igcRatio={data.igcSupply?.ratio ?? data.igc?.ratio ?? 1}
          tapBoost={mergedBoost}
          onClose={() => setSelectedGpu(null)}
          onUpdate={() => { onUpdate(); }}
        />
      )}

      {/* GPU shop modal (пустой слот) */}
      {showGpuShop && (
        <GpuShopModal
          data={data}
          onClose={() => setShowGpuShop(false)}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
}

// ── Ферма & Верстак ───────────────────────────────────────────────────────────

const FARM_UPGRADE_DATA = [
  { type: 'farm_level_2', level: 2, emoji: '📦', name: 'Кладовка',  slots: 10, costIgc: 300, costTon: 0  },
  { type: 'farm_level_3', level: 3, emoji: '🚗', name: 'Гараж',     slots: 20, costIgc: 0,   costTon: 12 },
  { type: 'farm_level_4', level: 4, emoji: '🏭', name: 'Ангар',     slots: 50, costIgc: 0,   costTon: 50 },
];

const WORKBENCH_UPGRADE_DATA = [
  { type: 'workbench_1', level: 1, emoji: '🔧', name: 'Верстак Lv1', costIgc: 500, costTon: 0  },
  { type: 'workbench_2', level: 2, emoji: '⚙️', name: 'Верстак Lv2', costIgc: 0,   costTon: 5  },
  { type: 'workbench_3', level: 3, emoji: '🏗️', name: 'Верстак Lv3', costIgc: 0,   costTon: 25 },
];

const FARM_SLOT_LABELS: Record<number, number> = { 1: 5, 2: 10, 3: 20, 4: 50 };

interface FarmUpgradesProps {
  farm:     { level: number; workbenchLevel: number };
  userTon:  number;
  userIgc:  number;
  igcRatio: number;
  onUpdate: () => void;
}

function FarmUpgradesSection({ farm, userTon, userIgc, igcRatio, onUpdate }: FarmUpgradesProps) {
  const { action }       = useAction();
  const [busy, setBusy]  = useState<string | null>(null);
  const [open, setOpen]  = useState(false);

  const farmLevel = farm.level;
  const wbLevel   = farm.workbenchLevel;

  const nextFarm = FARM_UPGRADE_DATA.find(f => f.level === farmLevel + 1);
  const nextWb   = WORKBENCH_UPGRADE_DATA.find(w => w.level === wbLevel + 1);

  // Скорректированная IGC-цена с учётом рыночного индекса
  const adjIgc = (base: number) => base > 0 ? Math.ceil(base * igcRatio) : 0;
  const ratioSuffix = Math.abs(igcRatio - 1) >= 0.02
    ? ` ×${igcRatio.toFixed(2)}`
    : '';

  const do_ = async (type: string, baseIgc: number, costTon: number, label: string) => {
    if (busy) return;
    const finalIgc = adjIgc(baseIgc);
    const balStr = costTon > 0
      ? `${userTon.toFixed(3)} TON`
      : `${Math.floor(userIgc)} IGC`;
    const costStr = costTon > 0
      ? `${costTon} TON`
      : `${finalIgc} IGC${ratioSuffix}`;
    const ok = await new Promise<boolean>(res =>
      WebApp.showConfirm(`${label}\n\nСтоимость: ${costStr}\nБаланс: ${balStr}\n\nПодтвердить?`, res),
    );
    if (!ok) return;
    setBusy(type);
    try {
      await action(type, {});
      WebApp.HapticFeedback.notificationOccurred('success');
      onUpdate();
    } catch (e) {
      WebApp.showAlert(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', borderRadius: 14,
      border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🏠</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Ферма & Верстак</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
              {FARM_LEVELS[farmLevel] ?? 'Балкон'} · {FARM_SLOT_LABELS[farmLevel] ?? 5} слотов
              {wbLevel > 0 ? ` · Верстак Lv${wbLevel}` : ' · Верстак не установлен'}
            </div>
          </div>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          padding: '4px 12px 12px',
          display: 'flex', flexDirection: 'column', gap: 6,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          {/* Farm level */}
          <MixedUpgradeRow
            emoji={nextFarm?.emoji ?? '🏠'}
            label="Уровень фермы"
            currentInfo={`${FARM_LEVELS[farmLevel] ?? 'Балкон'} · ${FARM_SLOT_LABELS[farmLevel] ?? 5} слотов`}
            nextInfo={nextFarm ? `→ ${nextFarm.name} · ${nextFarm.slots} слотов` : null}
            costIgc={nextFarm?.costIgc ? adjIgc(nextFarm.costIgc) : null}
            costTon={nextFarm?.costTon ?? null}
            canAfford={nextFarm
              ? (nextFarm.costTon > 0 ? userTon >= nextFarm.costTon : userIgc >= adjIgc(nextFarm.costIgc))
              : false}
            ratioSuffix={nextFarm?.costIgc && nextFarm.costIgc > 0 ? ratioSuffix : ''}
            busy={busy === nextFarm?.type}
            isMax={!nextFarm}
            onPress={() => nextFarm && do_(nextFarm.type, nextFarm.costIgc, nextFarm.costTon, `${nextFarm.emoji} ${nextFarm.name}`)}
          />
          {/* Workbench */}
          <MixedUpgradeRow
            emoji={nextWb?.emoji ?? '🔧'}
            label="Верстак (ремонт GPU)"
            currentInfo={wbLevel === 0 ? 'Не установлен · ремонт недоступен' : `Lv${wbLevel} · ремонт до T${wbLevel * 2}`}
            nextInfo={nextWb ? `→ ${nextWb.name}` : null}
            costIgc={nextWb?.costIgc ? adjIgc(nextWb.costIgc) : null}
            costTon={nextWb?.costTon ?? null}
            canAfford={nextWb
              ? (nextWb.costTon > 0 ? userTon >= nextWb.costTon : userIgc >= adjIgc(nextWb.costIgc))
              : false}
            ratioSuffix={nextWb?.costIgc && nextWb.costIgc > 0 ? ratioSuffix : ''}
            busy={busy === nextWb?.type}
            isMax={!nextWb}
            onPress={() => nextWb && do_(nextWb.type, nextWb.costIgc, nextWb.costTon, `${nextWb.emoji} ${nextWb.name}`)}
          />
        </div>
      )}
    </div>
  );
}

function MixedUpgradeRow({ emoji, label, currentInfo, nextInfo, costIgc, costTon, canAfford, busy, isMax, ratioSuffix, onPress }: {
  emoji: string; label: string; currentInfo: string; nextInfo: string | null;
  costIgc: number | null; costTon: number | null;
  canAfford: boolean; busy: boolean; isMax: boolean; ratioSuffix?: string; onPress: () => void;
}) {
  const costLabel = costTon ? `${costTon} TON` : costIgc ? `${costIgc} IGC${ratioSuffix ?? ''}` : null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 10px', borderRadius: 11,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          {currentInfo}
          {nextInfo && <span style={{ color: '#0098EA' }}> {nextInfo}</span>}
        </div>
      </div>
      {isMax ? (
        <span style={{ fontSize: 10, color: '#2ECC71', fontWeight: 700, flexShrink: 0 }}>МАКС</span>
      ) : (
        <button
          onClick={onPress}
          disabled={busy || !canAfford}
          style={{
            padding: '5px 10px', borderRadius: 8, border: 'none',
            cursor: canAfford && !busy ? 'pointer' : 'not-allowed',
            background: canAfford
              ? costTon ? 'linear-gradient(135deg,#0098EA,#005FA3)' : 'linear-gradient(135deg,#9B59B6,#6C3483)'
              : 'rgba(255,255,255,0.08)',
            color: canAfford ? '#fff' : 'rgba(255,255,255,0.3)',
            fontSize: 10, fontWeight: 700, flexShrink: 0,
            opacity: busy ? 0.5 : 1,
            boxShadow: canAfford ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
            transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}
        >
          {costLabel}
        </button>
      )}
    </div>
  );
}

// ── Серверная — глобальные апгрейды, влияющие на все GPU ─────────────────────

interface ServerRoomProps {
  farm:     { serverRoomLevel: number; upsLevel: number; providerLevel: number };
  userTon:  number;
  onUpdate: () => void;
}

function ServerRoom({ farm, userTon, onUpdate }: ServerRoomProps) {
  const { action }        = useAction();
  const [busy, setBusy]   = useState<string | null>(null);
  const [open, setOpen]   = useState(false);

  const do_ = async (type: string, costTon: number, confirmLabel: string) => {
    if (busy) return;
    const ok = await new Promise<boolean>(res =>
      WebApp.showConfirm(
        `${confirmLabel}\n\nСтоимость: ${costTon} TON\nБаланс: ${userTon.toFixed(3)} TON\n\nПодтвердить?`,
        res,
      ),
    );
    if (!ok) return;
    setBusy(type);
    try {
      await action(type, {});
      WebApp.HapticFeedback.notificationOccurred('success');
      onUpdate();
    } catch (e) {
      WebApp.showAlert(String(e));
    } finally {
      setBusy(null);
    }
  };

  const srLevel   = farm.serverRoomLevel;
  const upsLevel  = farm.upsLevel;
  const provLevel = farm.providerLevel;

  const srCur   = SERVER_ROOM_LEVELS.find(l => l.level === srLevel)!;
  const srNext  = SERVER_ROOM_LEVELS.find(l => l.level === srLevel + 1);
  const upsCur  = UPS_LEVELS.find(l => l.level === upsLevel)!;
  const upsNext = UPS_LEVELS.find(l => l.level === upsLevel + 1);
  const provCur  = PROVIDER_LEVELS.find(l => l.level === provLevel)!;
  const provNext = PROVIDER_LEVELS.find(l => l.level === provLevel + 1);

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', borderRadius: 14,
      border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden',
    }}>
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🏢</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Серверная</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
              Инфраструктура · влияет на все GPU
            </div>
          </div>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Collapsible upgrade rows */}
      {open && (
        <div style={{
          padding: '4px 12px 12px',
          display: 'flex', flexDirection: 'column', gap: 6,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <InfraUpgradeRow
            emoji="❄️"
            label="Серверная комната"
            levelInfo={`Lv${srLevel}/${SERVER_ROOM_LEVELS.length}`}
            currentEffect={srCur.tempReduction > 0 ? `−${srCur.tempReduction}°C температура` : 'Без бонуса'}
            nextEffect={srNext ? `→ −${srNext.tempReduction}°C` : null}
            costTon={srNext?.costTon ?? null}
            canAfford={srNext ? userTon >= srNext.costTon : false}
            busy={busy === 'upgrade_server_room'}
            isMax={!srNext}
            onPress={() => do_('upgrade_server_room', srNext!.costTon, `❄️ Серверная Lv${srLevel} → Lv${srLevel + 1}`)}
          />
          <InfraUpgradeRow
            emoji="🔋"
            label="ИБП (UPS)"
            levelInfo={`Lv${upsLevel}/${UPS_LEVELS.length}`}
            currentEffect={upsCur.uptimeBonus > 0 ? `+${upsCur.uptimeBonus}% стабильность` : 'Без бонуса'}
            nextEffect={upsNext ? `→ +${upsNext.uptimeBonus}%` : null}
            costTon={upsNext?.costTon ?? null}
            canAfford={upsNext ? userTon >= upsNext.costTon : false}
            busy={busy === 'upgrade_ups'}
            isMax={!upsNext}
            onPress={() => do_('upgrade_ups', upsNext!.costTon, `🔋 ИБП Lv${upsLevel} → Lv${upsLevel + 1}`)}
          />
          <InfraUpgradeRow
            emoji="📡"
            label="Провайдер"
            levelInfo={`Lv${provLevel}/${PROVIDER_LEVELS.length}`}
            currentEffect={
              provCur.igcDiscountPct > 0
                ? `−${provCur.igcDiscountPct}% IGC · +${provCur.uptimeBonus}% стаб.`
                : 'Без бонуса'
            }
            nextEffect={provNext ? `→ −${provNext.igcDiscountPct}% IGC` : null}
            costTon={provNext?.costTon ?? null}
            canAfford={provNext ? userTon >= provNext.costTon : false}
            busy={busy === 'upgrade_provider'}
            isMax={!provNext}
            onPress={() => do_('upgrade_provider', provNext!.costTon, `📡 Провайдер Lv${provLevel} → Lv${provLevel + 1}`)}
          />
        </div>
      )}
    </div>
  );
}

function InfraUpgradeRow({ emoji, label, levelInfo, currentEffect, nextEffect, costTon, canAfford, busy, isMax, onPress }: {
  emoji: string; label: string; levelInfo: string;
  currentEffect: string; nextEffect: string | null;
  costTon: number | null; canAfford: boolean; busy: boolean; isMax: boolean;
  onPress: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 10px', borderRadius: 11,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{label}</span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>{levelInfo}</span>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          {currentEffect}
          {nextEffect && <span style={{ color: '#0098EA' }}> {nextEffect}</span>}
        </div>
      </div>
      {isMax ? (
        <span style={{ fontSize: 10, color: '#2ECC71', fontWeight: 700, flexShrink: 0 }}>МАКС</span>
      ) : (
        <button
          onClick={onPress}
          disabled={busy || !canAfford}
          style={{
            padding: '5px 10px', borderRadius: 8, border: 'none',
            cursor: canAfford && !busy ? 'pointer' : 'not-allowed',
            background: canAfford
              ? 'linear-gradient(135deg, #0098EA, #005FA3)'
              : 'rgba(255,255,255,0.08)',
            color: canAfford ? '#fff' : 'rgba(255,255,255,0.3)',
            fontSize: 10, fontWeight: 700, flexShrink: 0,
            opacity: busy ? 0.5 : 1,
            boxShadow: canAfford ? '0 2px 8px rgba(0,152,234,0.35)' : 'none',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
          }}
        >
          {costTon} TON
        </button>
      )}
    </div>
  );
}
