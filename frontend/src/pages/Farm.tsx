import { useState } from 'react';
import { InfoSheet, InfoBtn } from '../components/InfoSheet';
import type { UpgradeInfo } from '../components/InfoSheet';
import WebApp from '@twa-dev/sdk';
import type { SyncData, TapBoost, GPU } from '../types';
import { GPU_SPECS, SERVER_ROOM_LEVELS, UPS_LEVELS, PROVIDER_LEVELS } from '../types';
import { useAction } from '../hooks/useAction';
import { GpuCard }       from '../components/GpuCard';
import { GpuDetailModal } from '../components/GpuDetailModal';
import { GpuShopModal }  from '../components/GpuShopModal';
import { AdBoost }       from '../components/AdBoost';
import { useLang } from '../LangContext';
import { fmt } from '../i18n';

function fmtH(h: number): string {
  if (h >= 1000) return `${(h / 1000).toFixed(2)} TH/s`;
  if (h >= 1)    return `${h.toFixed(2)} GH/s`;
  return `${(h * 1000).toFixed(0)} MH/s`;
}

function calcFarmStats(gpus: GPU[], poolTon: number, dripRate: number, globalH: number, elecMult = 1.0, providerLevel = 0) {
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

    const baseCost = gpu.overclocked
      ? spec.igcCostPerDay * 1.20
      : gpu.undervolted
        ? spec.igcCostPerDay * 0.90
        : spec.igcCostPerDay;
    const providerDiscPct = PROVIDER_LEVELS.find(l => l.level === providerLevel)?.igcDiscountPct ?? 0;
    igcCostDay += baseCost * elecMult * (1 - providerDiscPct / 100);
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
  const { t } = useLang();
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
    serverRoomLevel: rawFarm.serverRoomLevel ?? rawFarm.server_room_level ?? 0,
    upsLevel:        rawFarm.upsLevel        ?? rawFarm.ups_level         ?? 0,
    providerLevel:   rawFarm.providerLevel   ?? rawFarm.provider_level   ?? 0,
    workbenchLevel:  rawFarm.workbenchLevel  ?? rawFarm.workbench_level  ?? 0,
  };

  const activeGpus = data.gpus.filter(g => g.status !== 'stored');
  const storedGpus = data.storedGpus ?? data.gpus.filter(g => g.status === 'stored');
  const freeSlots  = Math.max(0, farm.maxSlots - activeGpus.length);

  const globalH   = data.network?.globalHashrate ?? 0;
  const poolTon   = data.season.poolTon;
  const dripRate  = data.season.dripRate;
  const elecMult  = data.igcSupply?.electricityMult ?? 1;
  const stats     = calcFarmStats(activeGpus, poolTon, dripRate, globalH, elecMult, farm.providerLevel ?? 0);

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
            🏭 {farmLvName(farm.level, t)}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
            {fmt(t.farm_slots, { active: activeGpus.length, max: farm.maxSlots })}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: '#9B59B6', fontWeight: 600 }}>
            {Math.floor(farm.igcBalance)} IGC
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{t.farm_electricity}</div>
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
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{t.farm_hashrate}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0098EA' }}>{fmtH(stats.totalHashrate)}</span>
          </div>
          {/* Income / Expense grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            {/* IGC income */}
            <div style={{ padding: '10px 16px', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 3 }}>{t.farm_igc_income}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#9B59B6' }}>+{stats.igcEarnDay.toFixed(1)}</div>
            </div>
            {/* IGC expense */}
            <div style={{ padding: '10px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{t.farm_igc_expense}</span>
                {Math.abs(elecMult - 1) >= 0.02 && (
                  <span style={{
                    fontSize: 8, fontWeight: 800, letterSpacing: 0.3,
                    color: elecMult > 1 ? '#FF6B35' : '#00FF88',
                    background: elecMult > 1 ? 'rgba(255,107,53,0.12)' : 'rgba(0,255,136,0.1)',
                    border: `1px solid ${elecMult > 1 ? 'rgba(255,107,53,0.35)' : 'rgba(0,255,136,0.3)'}`,
                    borderRadius: 3, padding: '1px 4px',
                  }}>
                    {elecMult > 1 ? '+' : ''}{Math.round((elecMult - 1) * 100)}%
                  </span>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,100,100,0.85)' }}>−{stats.igcCostDay.toFixed(1)}</div>
            </div>
          </div>
          {/* Net IGC + TON row */}
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0,
          }}>
            <div style={{ padding: '8px 16px', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>{t.farm_igc_balance}</div>
              <div style={{
                fontSize: 13, fontWeight: 700,
                color: stats.netIgcDay >= 0 ? '#2ECC71' : '#E74C3C',
              }}>
                {stats.netIgcDay >= 0 ? '+' : ''}{stats.netIgcDay.toFixed(1)}
              </div>
            </div>
            <div style={{ padding: '8px 16px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>{t.farm_ton_day}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F39C12' }}>
                ~{stats.estimatedTonDay.toFixed(4)}
                {!stats.isExact && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginLeft: 3 }}>{t.farm_ton_max}</span>}
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
        userIgc={farm.igcBalance}
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
            {t.farm_active_label}
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
              {fmt(t.farm_storage_btn, { n: storedGpus.length })}
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
            {t.farm_no_miners}<br />
            <span style={{ color: '#0098EA', fontSize: 11 }}>{t.farm_buy_hint}</span>
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
                {t.farm_empty_slot}
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
            {t.farm_storage_title}
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
          electricityMult={data.igcSupply?.electricityMult ?? 1}
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

/** Returns the translated farm level name for a given numeric level */
function farmLvName(lv: number, t: { farm_lv1: string; farm_lv2: string; farm_lv3: string; farm_lv4: string }): string {
  return ({ 1: t.farm_lv1, 2: t.farm_lv2, 3: t.farm_lv3, 4: t.farm_lv4 } as Record<number, string>)[lv] ?? t.farm_lv1;
}

interface FarmUpgradesProps {
  farm:     { level: number; workbenchLevel: number };
  userTon:  number;
  userIgc:  number;
  igcRatio: number;
  onUpdate: () => void;
}

function FarmUpgradesSection({ farm, userTon, userIgc, igcRatio, onUpdate }: FarmUpgradesProps) {
  const { t } = useLang();
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
    setBusy(type); // блокируем сразу — игрок видит реакцию до диалога
    const finalIgc = adjIgc(baseIgc);
    const balStr  = costTon > 0 ? `${userTon.toFixed(3)} TON` : `${Math.floor(userIgc)} IGC`;
    const costStr = costTon > 0 ? `${costTon} TON` : `${finalIgc} IGC${ratioSuffix}`;
    const ok = await new Promise<boolean>(res =>
      WebApp.showConfirm(
        `${label}\n\n${fmt(t.confirm_cost, { cost: costStr })}\n${fmt(t.confirm_balance, { bal: balStr })}\n\n${t.confirm_q}`,
        res,
      ),
    );
    if (!ok) { setBusy(null); return; } // отменил — разблокируем
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
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{t.farm_wb_title}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
              {farmLvName(farmLevel, t)} · {FARM_SLOT_LABELS[farmLevel] ?? 5} · {wbLevel > 0
                ? fmt(t.farm_wb_lv, { n: wbLevel, t: wbLevel * 2 })
                : t.farm_wb_none}
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
            label={t.farm_level_label}
            currentInfo={`${farmLvName(farmLevel, t)} · ${fmt(t.slots_n, { n: FARM_SLOT_LABELS[farmLevel] ?? 5 })}`}
            nextInfo={nextFarm ? `→ ${farmLvName(nextFarm.level, t)} · ${fmt(t.slots_n, { n: nextFarm.slots })}` : null}
            costIgc={nextFarm?.costIgc ? adjIgc(nextFarm.costIgc) : null}
            costTon={nextFarm?.costTon ?? null}
            canAfford={nextFarm
              ? (nextFarm.costTon > 0 ? userTon >= nextFarm.costTon : userIgc >= adjIgc(nextFarm.costIgc))
              : false}
            ratioSuffix={nextFarm?.costIgc && nextFarm.costIgc > 0 ? ratioSuffix : ''}
            busy={busy === nextFarm?.type}
            isMax={!nextFarm}
            onPress={() => nextFarm && do_(nextFarm.type, nextFarm.costIgc, nextFarm.costTon, `${nextFarm.emoji} ${farmLvName(nextFarm.level, t)}`)}
          />
          {/* Workbench */}
          <MixedUpgradeRow
            emoji={nextWb?.emoji ?? '🔧'}
            label={t.farm_wb_label}
            currentInfo={wbLevel === 0 ? t.farm_wb_none : fmt(t.farm_wb_lv, { n: wbLevel, t: wbLevel * 2 })}
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
  const { t } = useLang();
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
        <span style={{ fontSize: 10, color: '#2ECC71', fontWeight: 700, flexShrink: 0 }}>{t.btn_max}</span>
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
  farm:     { coolingLevel: number; serverRoomLevel: number; upsLevel: number; providerLevel: number };
  userTon:  number;
  userIgc?: number;
  onUpdate: () => void;
}

function ServerRoom({ farm, userTon, userIgc = 0, onUpdate }: ServerRoomProps) {
  const { t, lang }       = useLang();
  const { action }        = useAction();
  const [busy, setBusy]   = useState<string | null>(null);
  const [open, setOpen]   = useState(false);

  const do_ = async (type: string, costTon: number, confirmLabel: string, costIgc = 0) => {
    if (busy) return;
    setBusy(type);
    const costStr = costTon > 0 ? `${costTon} TON` : `${costIgc} IGC`;
    const balStr  = costTon > 0 ? `${userTon.toFixed(3)} TON` : `${Math.floor(userIgc)} IGC`;
    const ok = await new Promise<boolean>(res =>
      WebApp.showConfirm(
        `${confirmLabel}\n\n${fmt(t.confirm_cost, { cost: costStr })}\n${fmt(t.confirm_balance, { bal: balStr })}\n\n${t.confirm_q}`,
        res,
      ),
    );
    if (!ok) { setBusy(null); return; }
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

  const coolLevel = farm.coolingLevel;
  const srLevel   = farm.serverRoomLevel;
  const upsLevel  = farm.upsLevel;
  const provLevel = farm.providerLevel;

  // Охлаждение фермы: уровни и стоимости
  const FARM_COOLING_LEVELS = [
    { level: 1, kTemp: 1.3, label: 'Lv1', costIgc: 100, costTon: 0 },
    { level: 2, kTemp: 1.0, label: 'Lv2', costIgc: 0,   costTon: 3  },
    { level: 3, kTemp: 0.85,label: 'Lv3', costIgc: 0,   costTon: 15 },
  ];
  const coolCur  = FARM_COOLING_LEVELS.find(l => l.level === coolLevel) ?? null;
  const coolNext = FARM_COOLING_LEVELS.find(l => l.level === coolLevel + 1);

  // level 0 = не куплено → cur = null (показываем "нет бонуса")
  const srCur   = SERVER_ROOM_LEVELS.find(l => l.level === srLevel)  ?? null;
  const srNext  = SERVER_ROOM_LEVELS.find(l => l.level === srLevel + 1);
  const upsCur  = UPS_LEVELS.find(l => l.level === upsLevel)         ?? null;
  const upsNext = UPS_LEVELS.find(l => l.level === upsLevel + 1);
  const provCur  = PROVIDER_LEVELS.find(l => l.level === provLevel)  ?? null;
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
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{t.infra_title}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
              {t.infra_sub}
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
          {/* Охлаждение фермы — влияет на износ всех GPU */}
          <InfraUpgradeRow
            emoji="🌡️"
            label={t.infra_cooling}
            levelInfo={`Lv${coolLevel}/3`}
            currentEffect={
              coolLevel === 0
                ? (lang === 'ru' ? '⚠️ ×1.8 износ — ПЕРЕГРЕВ' : '⚠️ ×1.8 wear — OVERHEAT')
                : fmt(t.infra_cooling_fx, { n: coolCur?.kTemp ?? 1.0 })
            }
            nextEffect={coolNext ? `→ ×${coolNext.kTemp}` : null}
            costTon={coolNext?.costTon && coolNext.costTon > 0 ? coolNext.costTon : null}
            costIgc={coolNext?.costIgc && coolNext.costIgc > 0 ? coolNext.costIgc : undefined}
            canAfford={coolNext
              ? (coolNext.costTon > 0 ? userTon >= coolNext.costTon : userIgc >= (coolNext.costIgc ?? 0))
              : false}
            busy={busy === `cooling_${coolLevel + 1}`}
            isMax={!coolNext}
            onPress={() => do_(
              `cooling_${coolLevel + 1}`,
              coolNext!.costTon,
              fmt(t.infra_cooling_confirm, { a: coolLevel, b: coolLevel + 1 }),
              coolNext!.costIgc,
            )}
            info={{
              emoji: '🌡️', title: t.infra_cooling, costUnit: coolNext?.costTon ? 'TON' : 'IGC',
              description: lang === 'ru'
                ? 'Снижает скорость износа ВСЕХ GPU фермы через множитель kTemp. БЕЗ охлаждения карты изнашиваются в 1.8× быстрее нормы!'
                : 'Reduces wear rate of ALL farm GPUs via kTemp multiplier. WITHOUT cooling, GPUs wear 1.8× faster than normal!',
              levels: [
                { label: lang === 'ru' ? 'Нет' : 'None', effect: lang === 'ru' ? '×1.8 износ ⚠️' : '×1.8 wear ⚠️', current: coolLevel === 0 },
                { label: 'Lv 1', effect: '×1.3', cost: '100 IGC', current: coolLevel === 1 },
                { label: 'Lv 2', effect: '×1.0 (норма)', cost: '3 TON', current: coolLevel === 2 },
                { label: 'Lv 3', effect: '×0.85 (бонус)', cost: '15 TON', current: coolLevel === 3 },
              ],
            }}
          />
          <InfraUpgradeRow
            emoji="❄️"
            label={t.infra_sr}
            levelInfo={`Lv${srLevel}/${SERVER_ROOM_LEVELS.length}`}
            currentEffect={srCur && srCur.tempReduction > 0 ? fmt(t.infra_temp_fx, { n: srCur.tempReduction }) : t.infra_no_bonus}
            nextEffect={srNext ? `→ −${srNext.tempReduction}°C` : null}
            costTon={srNext?.costTon ?? null}
            canAfford={srNext ? userTon >= srNext.costTon : false}
            busy={busy === 'upgrade_server_room'}
            isMax={!srNext}
            onPress={() => do_('upgrade_server_room', srNext!.costTon, fmt(t.infra_sr_confirm, { a: srLevel, b: srLevel + 1 }))}
            info={{
              emoji: '❄️', title: t.infra_sr, costUnit: 'TON',
              description: lang === 'ru' ? 'Снижает базовую температуру всей фермы. Чем холоднее — тем медленнее изнашиваются все GPU.' : 'Lowers base temperature of the whole farm. Cooler = slower wear on all GPUs.',
              levels: SERVER_ROOM_LEVELS.map((lv, i) => ({ label: `Lv ${lv.level}`, effect: `−${lv.tempReduction}°C`, cost: `${lv.costTon} TON`, current: srLevel === i + 1 })),
            }}
          />
          <InfraUpgradeRow
            emoji="🔋"
            label={t.infra_ups}
            levelInfo={`Lv${upsLevel}/${UPS_LEVELS.length}`}
            currentEffect={upsCur && upsCur.uptimeBonus > 0 ? fmt(t.infra_uptime_fx, { n: upsCur.uptimeBonus }) : t.infra_no_bonus}
            nextEffect={upsNext ? `→ +${upsNext.uptimeBonus}%` : null}
            costTon={upsNext?.costTon ?? null}
            canAfford={upsNext ? userTon >= upsNext.costTon : false}
            busy={busy === 'upgrade_ups'}
            isMax={!upsNext}
            onPress={() => do_('upgrade_ups', upsNext!.costTon, fmt(t.infra_ups_confirm, { a: upsLevel, b: upsLevel + 1 }))}
            info={{
              emoji: '🔋', title: t.infra_ups, costUnit: 'TON',
              description: lang === 'ru' ? 'Повышает uptime всех GPU фермы. Выше uptime = больше часов в работе = больше TON и IGC.' : 'Boosts uptime of all farm GPUs. Higher uptime = more mining hours = more TON and IGC.',
              levels: UPS_LEVELS.map((lv, i) => ({ label: `Lv ${lv.level}`, effect: `+${lv.uptimeBonus}% uptime`, cost: `${lv.costTon} TON`, current: upsLevel === i + 1 })),
            }}
          />
          <InfraUpgradeRow
            emoji="📡"
            label={t.infra_provider}
            levelInfo={`Lv${provLevel}/${PROVIDER_LEVELS.length}`}
            currentEffect={
              provCur && provCur.igcDiscountPct > 0
                ? fmt(t.infra_prov_fx, { igc: provCur.igcDiscountPct, up: provCur.uptimeBonus })
                : t.infra_no_bonus
            }
            nextEffect={provNext ? `→ −${provNext.igcDiscountPct}% IGC` : null}
            costTon={provNext?.costTon ?? null}
            canAfford={provNext ? userTon >= provNext.costTon : false}
            busy={busy === 'upgrade_provider'}
            isMax={!provNext}
            onPress={() => do_('upgrade_provider', provNext!.costTon, fmt(t.infra_prov_confirm, { a: provLevel, b: provLevel + 1 }))}
            info={{
              emoji: '📡', title: t.infra_provider, costUnit: 'TON',
              description: lang === 'ru' ? 'Снижает стоимость электричества в IGC и повышает uptime. Два эффекта сразу.' : 'Cuts IGC electricity cost and boosts uptime. Two effects at once.',
              levels: PROVIDER_LEVELS.map((lv, i) => ({ label: `Lv ${lv.level}`, effect: `−${lv.igcDiscountPct}% IGC · +${lv.uptimeBonus}% uptime`, cost: `${lv.costTon} TON`, current: provLevel === i + 1 })),
            }}
          />
        </div>
      )}
    </div>
  );
}

function InfraUpgradeRow({ emoji, label, levelInfo, currentEffect, nextEffect, costTon, costIgc, canAfford, busy, isMax, onPress, info }: {
  emoji: string; label: string; levelInfo: string;
  currentEffect: string; nextEffect: string | null;
  costTon: number | null; costIgc?: number; canAfford: boolean; busy: boolean; isMax: boolean;
  onPress: () => void;
  info?: UpgradeInfo;
}) {
  const { t } = useLang();
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <>
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
          {info && <InfoBtn onClick={() => setSheetOpen(true)} />}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          {currentEffect}
          {nextEffect && <span style={{ color: '#0098EA' }}> {nextEffect}</span>}
        </div>
      </div>
      {isMax ? (
        <span style={{ fontSize: 10, color: '#2ECC71', fontWeight: 700, flexShrink: 0 }}>{t.btn_max}</span>
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
          {costTon && costTon > 0 ? `${costTon} TON` : `${costIgc} IGC`}
        </button>
      )}
    </div>
    {sheetOpen && info && <InfoSheet info={info} onClose={() => setSheetOpen(false)} />}
    </>
  );
}
