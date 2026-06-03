import React, { useState, useEffect } from 'react';
import { InfoSheet, InfoBtn } from './InfoSheet';
import type { UpgradeInfo } from './InfoSheet';
import WebApp from '@twa-dev/sdk';
import type { GPU, TapBoost } from '../types';
import { GPU_SPECS, calcGpuTemp, calcEffectiveUptime, tempInfo, PASTE_LEVELS, FAN_LEVELS, LIQUID_COOLING_LEVELS } from '../types';
import { useAction } from '../hooks/useAction';
import { useLang } from '../LangContext';
import { fmt } from '../i18n';
import { GpuIcon } from './GpuIcon';

// ── Палитра ───────────────────────────────────────────────
const CY  = '#00D4FF';
const CYB = 'rgba(0,212,255,0.08)';
const CYE = 'rgba(0,212,255,0.22)';
const OR  = '#FF6B35';
const GR  = '#00FF88';
const PU  = '#BD00FF';
const DIM = 'rgba(140,210,255,0.45)';

function fmtH(h: number): string {
  if (h >= 1000) return `${(h / 1000).toFixed(2)} TH/s`;
  if (h >= 1)    return `${h.toFixed(2)} GH/s`;
  return `${(h * 1000).toFixed(0)} MH/s`;
}

const BASE_REFURBISH_COST = 3;
const TIER_REFURBISH_MULT: Record<number, number> = {
  0: 0, 1: 1.0, 2: 1.8, 3: 3.5, 4: 7.0, 5: 20.0, 6: 50.0,
};
function calcRepairCost(tier: number, health: number): number {
  if (tier === 0) return 0;
  const missing = 100 - health;
  const mult = TIER_REFURBISH_MULT[tier] ?? 1;
  return Math.ceil(missing * BASE_REFURBISH_COST * mult);
}
function requiredWorkbench(tier: number): number {
  if (tier <= 2) return 1;
  if (tier <= 4) return 2;
  return 3;
}

// Температура → ширина полоски (0–100°C → 0–100%)
function tempBarPct(t: number): number { return Math.min(100, Math.max(0, (t / 100) * 100)); }

interface Props {
  gpu:             GPU;
  farmIgc:         number;
  farmWorkbench:   number;
  farmServerRoom:  number;
  farmUps:         number;
  farmProvider:    number;
  igcRatio:        number;
  electricityMult: number;
  tapBoost?:       TapBoost;
  onClose:         () => void;
  onUpdate:        () => void;
}

export function GpuDetailModal({ gpu, farmIgc, farmWorkbench, farmServerRoom, farmUps, farmProvider, igcRatio, electricityMult, tapBoost, onClose, onUpdate }: Props) {
  const { t, lang } = useLang();
  const { action } = useAction();
  const [busy, setBusy] = useState(false);

  type Opt = {
    overclocked?:  boolean;
    undervolted?:  boolean;
    health?:       number;
    status?:       string;
    pasteLevel?:   number;
    fanLevel?:     number;
    coolingLevel?: number;
  };
  const [opt, setOpt] = useState<Opt>({});

  useEffect(() => {
    setOpt({});
  }, [gpu.overclocked, gpu.undervolted, gpu.health, gpu.status,
      gpu.pasteLevel, gpu.fanLevel, gpu.coolingLevel]);

  const g = {
    ...gpu,
    overclocked:  opt.overclocked  ?? gpu.overclocked,
    undervolted:  opt.undervolted  ?? gpu.undervolted,
    health:       opt.health       ?? gpu.health,
    status:       opt.status       ?? gpu.status,
    pasteLevel:   opt.pasteLevel   ?? gpu.pasteLevel   ?? 1,
    fanLevel:     opt.fanLevel     ?? gpu.fanLevel     ?? 1,
    coolingLevel: opt.coolingLevel ?? gpu.coolingLevel ?? 1,
  };

  const tier = gpu.modelTier ?? (gpu as any).model_tier ?? 0;
  const spec = GPU_SPECS[tier] ?? GPU_SPECS[0];

  const gpuTemp         = calcGpuTemp(tier, g.coolingLevel ?? 1, g.overclocked, g.undervolted, g.pasteLevel ?? 1, farmServerRoom);
  const tempMeta        = tempInfo(gpuTemp);
  const effectiveUptime = calcEffectiveUptime(tier, farmUps, farmProvider, g.fanLevel ?? 1);

  const isBroken  = g.status === 'broken';
  const isOffline = g.status === 'offline';
  const isStored  = g.status === 'stored';
  const isActive  = !isBroken && !isOffline && !isStored;
  const isNano    = tier === 0;

  const health = Math.round(g.health);
  const healthColor = health > 60 ? GR : health > 30 ? OR : '#FF3355';
  const healthGlow  = health > 60 ? 'rgba(0,255,136,0.5)'
                    : health > 30 ? 'rgba(255,107,53,0.5)'
                    : 'rgba(255,51,85,0.5)';

  const statusLabel = isBroken ? t.status_broken : isOffline ? t.status_offline : isStored ? t.status_stored : t.status_active;
  const statusColor = isBroken ? '#FF3355' : isOffline ? 'rgba(255,255,255,0.4)' : isStored ? OR : GR;

  const overcMult     = g.overclocked ? 1.20 : 1.0;
  const undervoltMult = g.undervolted  ? 0.85 : 1.0;
  const effectiveHash = fmtH(spec.hashrate * overcMult * undervoltMult);
  const baseIgcCost = g.overclocked
    ? spec.igcCostPerDay * 1.20          // OC: +20% ко всему
    : g.undervolted
      ? spec.igcCostPerDay * 0.90        // UV: −10% от всего расхода
      : spec.igcCostPerDay;
  // Применяем тарифный множитель (сезон × ratio-индексация)
  const rawDayCost    = baseIgcCost * electricityMult;
  const effectiveCost = rawDayCost.toFixed(1);
  const daysLeft      = rawDayCost > 0 ? (farmIgc / rawDayCost).toFixed(1) : '∞';

  // Метка тарифа для отображения
  const multPct   = Math.round((electricityMult - 1) * 100);
  const multLabel = Math.abs(multPct) < 2 ? '' : multPct > 0 ? `+${multPct}%` : `${multPct}%`;
  const multColor = multPct > 5 ? '#FF6B35' : multPct < -5 ? '#00FF88' : 'rgba(140,210,255,0.4)';
  const igcIncomeDay  = (spec.igcPerDay * overcMult * undervoltMult).toFixed(1);

  const repairCost    = calcRepairCost(tier, g.health);
  const needWorkbench = requiredWorkbench(tier);
  const canRepair     = tier === 0 ? false : farmWorkbench >= needWorkbench;
  const repairBlocked = !canRepair && g.health < 100;

  const adjIgc = (base: number) => Math.ceil(base * igcRatio);
  const ratioLabel = (base: number): string => {
    if (Math.abs(igcRatio - 1) < 0.02) return '';
    const adj = adjIgc(base);
    const sign = igcRatio > 1 ? '+' : '−';
    return ` (${sign}${Math.abs(adj - base)} ${t.ratio_market})`;
  };
  const getTempLabel = (celsius: number): string => {
    if (celsius <= 60) return t.temp_normal;
    if (celsius <= 75) return t.temp_warm;
    if (celsius <= 85) return t.temp_hot;
    return t.temp_crit;
  };

  // confirmMsg — если передан, сначала показывает диалог подтверждения.
  // Кнопка блокируется СРАЗУ при нажатии (до диалога) — игрок видит реакцию.
  const do_ = async (type: string, confirmMsg?: string) => {
    if (busy) return;
    setBusy(true); // блокируем мгновенно

    if (confirmMsg) {
      const ok = await new Promise<boolean>(res => WebApp.showConfirm(confirmMsg, res));
      if (!ok) { setBusy(false); return; } // отменил — разблокируем
    }

    // Оптимистичные обновления — применяем сразу, до ответа сервера
    if (type === 'toggle_overclock')       setOpt(o => ({ ...o, overclocked: !(o.overclocked ?? gpu.overclocked) }));
    if (type === 'toggle_undervolting')    setOpt(o => ({ ...o, undervolted: !(o.undervolted ?? gpu.undervolted) }));
    if (type === 'restart_gpu')            setOpt(o => ({ ...o, status: 'active' }));
    if (type === 'move_to_storage')        setOpt(o => ({ ...o, status: 'stored' }));
    if (type === 'move_from_storage')      setOpt(o => ({ ...o, status: 'active' }));
    if (type === 'refurbish')              setOpt(o => ({ ...o, health: 100, status: 'active' }));
    if (type === 'upgrade_paste')          setOpt(o => ({ ...o, pasteLevel:   (o.pasteLevel   ?? gpu.pasteLevel   ?? 0) + 1 }));
    if (type === 'upgrade_fan')            setOpt(o => ({ ...o, fanLevel:     (o.fanLevel     ?? gpu.fanLevel     ?? 0) + 1 }));
    if (type === 'upgrade_liquid_cooling') setOpt(o => ({ ...o, coolingLevel: (o.coolingLevel ?? gpu.coolingLevel ?? 1) + 1 }));
    try {
      await action(type, { gpu_id: gpu.id });
      WebApp.HapticFeedback.notificationOccurred('success');
      onUpdate();
    } catch (e) {
      setOpt({});
      WebApp.showAlert(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes modal-up {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes modal-glow {
          0%,100% { box-shadow: 0 -4px 30px rgba(0,212,255,0.12), 0 -20px 60px rgba(0,0,0,0.8); }
          50%      { box-shadow: 0 -4px 50px rgba(0,212,255,0.28), 0 -20px 60px rgba(0,0,0,0.8); }
        }
      `}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,5,15,0.8)', backdropFilter: 'blur(4px)',
      }} />

      {/* Bottom sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
        background: 'linear-gradient(180deg, #0D1E35 0%, #060D1A 100%)',
        borderRadius: '20px 20px 0 0',
        borderTop: `1px solid ${CYE}`,
        maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        animation: 'modal-up 0.25s cubic-bezier(0.32,0.72,0,1), modal-glow 3s ease-in-out 0.25s infinite',
      }}>

        {/* Drag handle */}
        <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{
            width: 36, height: 4, borderRadius: 2,
            background: `linear-gradient(90deg, transparent, ${CY}, transparent)`,
            boxShadow: `0 0 8px ${CY}`,
          }} />
        </div>

        {/* ── ШАПКА: emoji + имя + бейдж + кнопка закрытия ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 14px 0',
          flexShrink: 0,
        }}>
          {/* Иконка GPU */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 13,
              background: CYB, border: `1px solid ${CYE}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isActive ? `0 0 16px rgba(0,212,255,0.2)` : 'none',
            }}>
              <GpuIcon tier={tier} size={40} />
            </div>
            <div style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 11, height: 11, borderRadius: '50%',
              background: statusColor,
              boxShadow: `0 0 8px ${statusColor}`,
              border: '2px solid #0D1E35',
              animation: isActive ? 'pulse-dot 2s ease-in-out infinite' : 'none',
            }} />
          </div>

          {/* Название + бейдж */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#E0F0FF', letterSpacing: 0.2 }}>
                {spec.name}
              </span>
              <span style={{
                fontSize: 8, fontWeight: 800, letterSpacing: 1.5,
                color: statusColor,
                background: `${statusColor}18`,
                border: `1px solid ${statusColor}55`,
                borderRadius: 4, padding: '2px 6px',
              }}>
                {statusLabel}
              </span>
              {g.overclocked && (
                <span style={{ fontSize: 8, fontWeight: 800, color: CY,
                  background: `${CY}18`, border: `1px solid ${CY}55`,
                  borderRadius: 4, padding: '2px 6px', animation: 'oc-pulse 2s ease-in-out infinite' }}>
                  ⚡ OC
                </span>
              )}
              {g.undervolted && (
                <span style={{ fontSize: 8, fontWeight: 800, color: GR,
                  background: `${GR}18`, border: `1px solid ${GR}55`,
                  borderRadius: 4, padding: '2px 6px' }}>
                  🔋 UV
                </span>
              )}
            </div>
            <div style={{ fontSize: 9, color: DIM, marginTop: 2, display: 'flex', gap: 6 }}>
              <span>T{tier}</span><span>·</span><span>{spec.watt}W</span>
              {gpu.isRefurbished && <><span>·</span><span style={{ color: GR }}>♻️ REFURB</span></>}
            {tapBoost?.active && isActive && <><span>·</span><span style={{ color: CY, animation: 'oc-pulse 1s infinite' }}>⚡ BOOST</span></>}
            </div>
          </div>

          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 7,
            background: CYB, border: `1px solid ${CYE}`,
            color: DIM, fontSize: 13, cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* ── СТРОКА СТАТОВ: хешрейт · доход · расход ── */}
        <div style={{
          display: 'flex', gap: 0, flexShrink: 0,
          margin: '10px 14px 0',
          borderRadius: 11, overflow: 'hidden',
          border: `1px solid ${CYE}`,
        }}>
          {[
            { label: t.hashrate_label, value: effectiveHash,           color: CY,       flex: 1.2 },
            { label: t.income_day,     value: `+${igcIncomeDay} IGC`,  color: PU,       flex: 1   },
            { label: t.expense_day,    value: `−${effectiveCost} IGC`, color: '#FF3355',flex: 1   },
          ].map((s, i, arr) => (
            <div key={i} style={{
              flex: s.flex, padding: '8px 0', textAlign: 'center',
              background: 'rgba(0,0,0,0.35)',
              borderRight: i < arr.length - 1 ? `1px solid ${CYE}` : 'none',
            }}>
              <div style={{ fontSize: 7, letterSpacing: 1.5, color: DIM, marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: s.color, textShadow: `0 0 8px ${s.color}66` }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── ДВЕ ПОЛОСКИ: Состояние GPU + Температура ── */}
        {!isStored && (
          <div style={{ margin: '8px 14px 0', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            {/* Полоска: Состояние GPU */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 8, letterSpacing: 1.5, color: DIM }}>{t.gpu_health}</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: healthColor,
                  textShadow: `0 0 6px ${healthGlow}` }}>
                  {isBroken ? t.broken_hp : `${health}%`}
                </span>
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${health}%`, borderRadius: 3,
                  background: `linear-gradient(90deg, ${healthColor}88, ${healthColor})`,
                  boxShadow: `0 0 8px ${healthGlow}`,
                  transition: 'width 0.7s ease',
                }} />
              </div>
            </div>

            {/* Полоска: Температура */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 8, letterSpacing: 1.5, color: DIM }}>{t.temperature}</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: tempMeta.color,
                  textShadow: `0 0 6px ${tempMeta.color}88` }}>
                  {gpuTemp}°C · {getTempLabel(gpuTemp)}
                </span>
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${tempBarPct(gpuTemp)}%`, borderRadius: 3,
                  background: `linear-gradient(90deg, #2ECC7188, ${tempMeta.color})`,
                  boxShadow: `0 0 8px ${tempMeta.color}88`,
                  transition: 'width 0.7s ease',
                }} />
              </div>
            </div>
          </div>
        )}

        <div style={{ height: 1, background: CYE, margin: '10px 0 0', flexShrink: 0 }} />

        {/* ── СКРОЛЛИРУЕМЫЙ КОНТЕНТ ── */}
        <div style={{
          overflowY: 'scroll',
          WebkitOverflowScrolling: 'touch' as any,
          flex: 1,
          padding: '12px 14px 32px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>

          {/* Доп. статы */}
          <div style={{ background: CYB, borderRadius: 12, border: `1px solid ${CYE}`, overflow: 'hidden' }}>
            {[
              { label: t.farm_balance,   value: fmt(t.farm_bal_fmt, { igc: Math.floor(farmIgc), days: daysLeft }), color: farmIgc < rawDayCost * 2 ? OR : DIM },
              { label: t.cooling_label,  value: fmt(t.cooling_lv, { n: g.coolingLevel ?? 1 }), color: DIM },
              { label: t.stability_label,value: `${effectiveUptime}%`, color: effectiveUptime >= 88 ? GR : effectiveUptime >= 84 ? OR : '#FF3355' },
            ].map((row, i, arr) => (
              <div key={row.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 13px' }}>
                  <span style={{ fontSize: 9, letterSpacing: 1.5, color: DIM }}>{row.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: row.color,
                    textShadow: row.color !== DIM ? `0 0 8px ${row.color}44` : 'none' }}>
                    {row.value}
                  </span>
                </div>
                {i < arr.length - 1 && (
                  <div style={{ height: 1, background: 'rgba(0,212,255,0.08)', margin: '0 13px' }} />
                )}
              </div>
            ))}
          </div>

          {/* Nano notice */}
          {isNano && !isStored && (
            <div style={{
              background: 'rgba(255,107,53,0.08)',
              border: `1px solid rgba(255,107,53,0.25)`,
              borderRadius: 10, padding: '10px 12px',
              fontSize: 11, color: DIM, lineHeight: 1.6,
            }}>
              🔌 <b style={{ color: OR }}>USB NANO</b> — {t.nano_notice}
            </div>
          )}

          {/* Performance toggles */}
          {!isStored && !isNano && (
            <Section label={t.perf_section}>
              <div style={{ display: 'flex', gap: 8 }}>
                <CyberToggle
                  emoji="⚡" label={t.oc_label} hint={t.oc_hint}
                  active={g.overclocked} activeColor={CY}
                  disabled={isBroken || isOffline || g.undervolted || g.health < 30}
                  disabledReason={g.undervolted ? t.dis_uv : g.health < 30 ? t.hp_low : undefined}
                  busy={busy} onPress={() => do_('toggle_overclock')}
                />
                <CyberToggle
                  emoji="🔋" label={t.uv_label} hint={t.uv_hint}
                  active={g.undervolted} activeColor={GR}
                  disabled={isBroken || isOffline || g.overclocked}
                  disabledReason={g.overclocked ? t.dis_oc : undefined}
                  busy={busy} onPress={() => do_('toggle_undervolting')}
                />
              </div>
            </Section>
          )}

          {/* GPU upgrades */}
          {!isStored && !isNano && (
            <Section label={t.upgrades_section}>
              {(() => {
                // cl=1 = воздух (дефолт), 2-4 = платные уровни
                const cl = g.coolingLevel ?? 1;
                // Индекс в массиве: cl=1→нет, cl=2→idx0, cl=3→idx1, cl=4→idx2
                const nextCool = cl >= 1 && cl <= 3 ? LIQUID_COOLING_LEVELS[cl - 1] : null;
                const baseC = nextCool?.costIgc ?? 0;
                const currentLvDisplay = cl <= 1
                  ? (lang === 'ru' ? 'Нет охлаждения' : 'No cooling')
                  : `Lv${cl - 1} (−${LIQUID_COOLING_LEVELS[cl - 2]?.tempReduction ?? 0}°C)`;
                const infoLiquid: UpgradeInfo = {
                  emoji: '💧', title: t.upg_liquid, costUnit: 'IGC',
                  description: lang === 'ru'
                    ? 'Снижает температуру этого GPU. Чем ниже температура — тем медленнее износ.'
                    : 'Lowers this GPU\'s temperature. Lower temp = slower wear.',
                  levels: [
                    { label: 'Lv 1', effect: '−10°C', cost: '500 IGC',  current: cl === 2 },
                    { label: 'Lv 2', effect: '−20°C', cost: '1500 IGC', current: cl === 3 },
                    { label: lang === 'ru' ? 'Lv 3 Иммерсия' : 'Lv 3 Immersion', effect: '−35°C', cost: '4500 IGC', current: cl === 4 },
                  ],
                };
                return (
                  <UpgradeRow
                    emoji="💧" label={t.upg_liquid}
                    currentLevel={Math.max(0, cl - 1)} maxLevel={LIQUID_COOLING_LEVELS.length}
                    currentEffect={currentLvDisplay}
                    nextEffect={nextCool ? `→ −${nextCool.tempReduction}°C` : null}
                    cost={nextCool ? `${adjIgc(baseC)} IGC${ratioLabel(baseC)}` : null}
                    canAfford={adjIgc(baseC) <= farmIgc}
                    busy={busy} onPress={() => do_('upgrade_liquid_cooling')}
                    info={infoLiquid}
                  />
                );
              })()}
              {(() => {
                const pl = g.pasteLevel ?? 0;
                const nextPaste = PASTE_LEVELS[pl];
                const baseP = nextPaste?.costIgc ?? 0;
                const infoPaste: UpgradeInfo = {
                  emoji: '🧴', title: t.upg_paste, costUnit: 'IGC',
                  description: lang === 'ru'
                    ? 'Снижает температуру GPU. Разовая замена, действует постоянно.'
                    : 'Lowers GPU temperature. One-time upgrade, permanent effect.',
                  levels: PASTE_LEVELS.map((lv, i) => ({
                    label: `Lv ${lv.level}`, effect: `−${lv.tempReduction}°C`,
                    cost: `${lv.costIgc} IGC`, current: pl === i + 1,
                  })),
                };
                return (
                  <UpgradeRow
                    emoji="🧴" label={t.upg_paste}
                    currentLevel={pl} maxLevel={PASTE_LEVELS.length}
                    currentEffect={`−${PASTE_LEVELS[pl - 1]?.tempReduction ?? 0}°C`}
                    nextEffect={nextPaste ? `→ −${nextPaste.tempReduction}°C` : null}
                    cost={nextPaste ? `${adjIgc(baseP)} IGC${ratioLabel(baseP)}` : null}
                    canAfford={adjIgc(baseP) <= farmIgc}
                    busy={busy} onPress={() => do_('upgrade_paste')}
                    info={infoPaste}
                  />
                );
              })()}
              {(() => {
                const fl = g.fanLevel ?? 0;
                const nextFan = FAN_LEVELS[fl];
                const baseF = nextFan?.costIgc ?? 0;
                const infoFan: UpgradeInfo = {
                  emoji: '🌀', title: t.upg_fan, costUnit: 'IGC',
                  description: lang === 'ru'
                    ? 'Повышает uptime этого GPU — больше часов в работе, больше TON.'
                    : 'Boosts this GPU\'s uptime — more hours mining, more TON.',
                  levels: FAN_LEVELS.map((lv, i) => ({
                    label: `Lv ${lv.level}`, effect: `+${lv.uptimeBonus}% uptime`,
                    cost: `${lv.costIgc} IGC`, current: fl === i + 1,
                  })),
                };
                return (
                  <UpgradeRow
                    emoji="🌀" label={t.upg_fan}
                    currentLevel={fl} maxLevel={FAN_LEVELS.length}
                    currentEffect={`${FAN_LEVELS[fl - 1]?.uptimeBonus ?? 0}% uptime`}
                    nextEffect={nextFan ? `→ +${nextFan.uptimeBonus}%` : null}
                    cost={nextFan ? `${adjIgc(baseF)} IGC${ratioLabel(baseF)}` : null}
                    canAfford={adjIgc(baseF) <= farmIgc}
                    busy={busy} onPress={() => do_('upgrade_fan')}
                    info={infoFan}
                  />
                );
              })()}
            </Section>
          )}

          {/* Actions */}
          <Section label={t.actions_section}>
            {!isStored && (
              <ActionRow
                emoji="💡" label={
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {t.act_electricity}
                    {multLabel && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
                        color: multColor,
                        background: `${multColor}18`,
                        border: `1px solid ${multColor}55`,
                        borderRadius: 4, padding: '1px 5px',
                      }}>
                        {multLabel}
                      </span>
                    )}
                  </span>
                }
                sub={fmt(t.act_elec_sub, { cost: effectiveCost, days: daysLeft })}
                color={farmIgc < rawDayCost * 2 ? OR : DIM}
                busy={false}
                onPress={() => WebApp.showAlert(
                  fmt(t.elec_alert, { name: spec.name, cost: effectiveCost, igc: Math.floor(farmIgc), days: daysLeft })
                )}
              />
            )}

            {isOffline && (
              <ActionRow
                emoji="🔌" label={t.act_restart}
                sub={t.act_restart_sub}
                color={CY} busy={busy}
                onPress={() => do_('restart_gpu', fmt(t.restart_confirm, { name: spec.name }))}
              />
            )}

            {!isStored && tier !== 0 && (() => {
              const adjRepair = adjIgc(repairCost);
              const repairRatio = ratioLabel(repairCost);
              return (
                <ActionRow
                  emoji="🔧" label={
                    repairBlocked ? fmt(t.repair_blocked, { n: needWorkbench })
                    : g.health >= 100 ? t.repair_ok
                    : fmt(t.repair_cost_lbl, { cost: adjRepair, ratio: repairRatio })
                  }
                  sub={
                    repairBlocked ? fmt(t.repair_blk_sub, { n: needWorkbench })
                    : g.health >= 100 ? t.repair_ok_sub
                    : fmt(t.repair_hp_sub, { hp: health })
                  }
                  color={repairBlocked || g.health >= 100 ? 'rgba(255,255,255,0.2)' : isBroken ? '#FF3355' : OR}
                  busy={busy}
                  onPress={() => {
                    if (repairBlocked) { WebApp.showAlert(fmt(t.need_wb, { n: needWorkbench })); return; }
                    if (g.health >= 100) { WebApp.showAlert(t.no_repair); return; }
                    if (farmIgc < adjRepair) { WebApp.showAlert(fmt(t.not_enough_igc, { need: adjRepair, have: Math.floor(farmIgc) })); return; }
                    do_('refurbish', fmt(t.repair_confirm, { name: spec.name, hp: health, cost: adjRepair, ratio: repairRatio }));
                  }}
                />
              );
            })()}

            {!isStored && (
              <ActionRow
                emoji="📦" label={t.act_storage} sub={t.act_storage_sub}
                busy={busy}
                onPress={() => do_('move_to_storage', fmt(t.storage_confirm, { name: spec.name }))}
              />
            )}

            {isStored && (
              <ActionRow
                emoji="🏭" label={t.act_install} sub={t.act_install_sub}
                color={GR} busy={busy}
                onPress={() => do_('move_from_storage')}
              />
            )}
          </Section>

        </div>
      </div>
    </>
  );
}

// ── Секция с заголовком ────────────────────────────────────
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 9, letterSpacing: 2.5, color: 'rgba(0,212,255,0.4)',
        marginBottom: 8, paddingLeft: 2,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(0,212,255,0.15)' }} />
        {label}
        <div style={{ flex: 1, height: 1, background: 'rgba(0,212,255,0.15)' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

// ── Кнопка переключения (OC / UV) ─────────────────────────
function CyberToggle({ emoji, label, hint, active, activeColor, disabled, disabledReason, busy, onPress }: {
  emoji: string; label: string; hint: string;
  active: boolean; activeColor: string;
  disabled: boolean; disabledReason?: string; busy: boolean; onPress: () => void;
}) {
  return (
    <button
      onClick={() => { if (disabledReason) { WebApp.showAlert(disabledReason); return; } onPress(); }}
      disabled={busy}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: '11px 6px', borderRadius: 12, cursor: 'pointer',
        background: active ? `${activeColor}15` : 'rgba(0,212,255,0.04)',
        border: `1px solid ${active ? activeColor + '55' : 'rgba(0,212,255,0.15)'}`,
        boxShadow: active ? `0 0 16px ${activeColor}25, inset 0 0 12px ${activeColor}08` : 'none',
        opacity: (disabled && !disabledReason) ? 0.3 : busy ? 0.6 : 1,
        transition: 'all 0.2s',
      }}
    >
      <span style={{ fontSize: 22 }}>{emoji}</span>
      <span style={{
        fontSize: 10, fontWeight: 800, letterSpacing: 1.5,
        color: active ? activeColor : DIM,
        textShadow: active ? `0 0 8px ${activeColor}` : 'none',
      }}>
        {label}
      </span>
      <span style={{ fontSize: 9, color: active ? `${activeColor}bb` : 'rgba(255,255,255,0.2)' }}>
        {hint}
      </span>
    </button>
  );
}

// ── Строка апгрейда ────────────────────────────────────────
function UpgradeRow({ emoji, label, currentLevel, maxLevel, currentEffect, nextEffect, cost, canAfford, busy, onPress, info }: {
  emoji: string; label: string;
  currentLevel: number; maxLevel: number;
  currentEffect: string; nextEffect: string | null; cost: string | null;
  canAfford: boolean; busy: boolean; onPress: () => void;
  info?: UpgradeInfo;
}) {
  const { t } = useLang();
  const [sheetOpen, setSheetOpen] = useState(false);
  const isMax = currentLevel >= maxLevel;
  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', borderRadius: 11,
        background: 'rgba(0,212,255,0.04)',
        border: `1px solid ${CYE}`,
      }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>{emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#E0F0FF' }}>{label}</span>
            <div style={{ display: 'flex', gap: 2 }}>
              {Array.from({ length: maxLevel }, (_, i) => (
                <div key={i} style={{
                  width: 5, height: 5, borderRadius: 1,
                  background: i < currentLevel ? CY : 'rgba(255,255,255,0.1)',
                  boxShadow: i < currentLevel ? `0 0 4px ${CY}` : 'none',
                }} />
              ))}
            </div>
            {info && <InfoBtn onClick={() => setSheetOpen(true)} />}
          </div>
          <div style={{ fontSize: 10, color: DIM }}>
            {currentEffect}
            {nextEffect && <span style={{ color: PU }}> {nextEffect}</span>}
          </div>
        </div>
        {isMax ? (
          <span style={{ fontSize: 9, fontWeight: 800, color: GR, letterSpacing: 1, flexShrink: 0 }}>{t.upg_max}</span>
        ) : (
          <button onClick={onPress} disabled={busy || !canAfford} style={{
            padding: '6px 10px', borderRadius: 8, cursor: canAfford ? 'pointer' : 'not-allowed',
            background: canAfford ? `linear-gradient(135deg, ${PU}, #8800CC)` : 'rgba(255,255,255,0.06)',
            border: `1px solid ${canAfford ? PU + '66' : 'rgba(255,255,255,0.08)'}`,
            color: canAfford ? '#fff' : 'rgba(255,255,255,0.25)',
            fontSize: 10, fontWeight: 700, flexShrink: 0,
            boxShadow: canAfford ? `0 0 12px ${PU}44` : 'none',
            opacity: busy ? 0.5 : 1, transition: 'all 0.15s',
          }}>
            {cost}
          </button>
        )}
      </div>
      {sheetOpen && info && <InfoSheet info={info} onClose={() => setSheetOpen(false)} />}
    </>
  );
}

// ── Кнопка действия ───────────────────────────────────────
function ActionRow({ emoji, label, sub, color, busy, onPress }: {
  emoji: string; label: string | React.ReactNode; sub?: string; color?: string; busy: boolean; onPress: () => void;
}) {
  return (
    <button onClick={onPress} disabled={busy} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '11px 12px', borderRadius: 11, cursor: 'pointer',
      background: 'rgba(0,212,255,0.04)',
      border: `1px solid ${CYE}`,
      width: '100%', textAlign: 'left',
      opacity: busy ? 0.5 : 1, transition: 'opacity 0.15s',
    }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: color ?? '#E0F0FF' }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: DIM, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      <span style={{ fontSize: 14, color: 'rgba(0,212,255,0.3)', flexShrink: 0 }}>›</span>
    </button>
  );
}
