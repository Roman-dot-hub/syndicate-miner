import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import type { GPU, TapBoost } from '../types';
import { GPU_SPECS, calcGpuTemp, calcEffectiveUptime, tempInfo, PASTE_LEVELS, FAN_LEVELS, LIQUID_COOLING_LEVELS } from '../types';
import { useAction } from '../hooks/useAction';

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

interface Props {
  gpu:            GPU;
  farmIgc:        number;
  farmWorkbench:  number;
  farmServerRoom: number;
  farmUps:        number;
  farmProvider:   number;
  igcRatio:       number;
  tapBoost?:      TapBoost;
  onClose:        () => void;
  onUpdate:       () => void;
}

export function GpuDetailModal({ gpu, farmIgc, farmWorkbench, farmServerRoom, farmUps, farmProvider, igcRatio, tapBoost, onClose, onUpdate }: Props) {
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

  const statusLabel = isBroken ? 'BROKEN' : isOffline ? 'OFFLINE' : isStored ? 'STORED' : 'ACTIVE';
  const statusColor = isBroken ? '#FF3355' : isOffline ? 'rgba(255,255,255,0.4)' : isStored ? OR : GR;

  const overcMult     = g.overclocked ? 1.20 : 1.0;
  const undervoltMult = g.undervolted  ? 0.85 : 1.0;
  const effectiveHash = fmtH(spec.hashrate * overcMult * undervoltMult);
  const rawDayCost = g.overclocked
    ? spec.igcCostPerDay * 1.20
    : g.undervolted
      ? spec.igcCostPerDay - spec.wattBackend * 0.001 * 288 * 0.10
      : spec.igcCostPerDay;
  const effectiveCost = rawDayCost.toFixed(1);
  const daysLeft      = rawDayCost > 0 ? (farmIgc / rawDayCost).toFixed(1) : '∞';

  const repairCost    = calcRepairCost(tier, g.health);
  const needWorkbench = requiredWorkbench(tier);
  const canRepair     = tier === 0 ? false : farmWorkbench >= needWorkbench;
  const repairBlocked = !canRepair && g.health < 100;

  const adjIgc = (base: number) => Math.ceil(base * igcRatio);
  const ratioLabel = (base: number): string => {
    if (Math.abs(igcRatio - 1) < 0.02) return '';
    const adj = adjIgc(base);
    const sign = igcRatio > 1 ? '+' : '−';
    return ` (${sign}${Math.abs(adj - base)} рынок)`;
  };

  const do_ = async (type: string) => {
    if (busy) return;
    setBusy(true);
    if (type === 'toggle_overclock')       setOpt(o => ({ ...o, overclocked: !(o.overclocked ?? gpu.overclocked) }));
    if (type === 'toggle_undervolting')    setOpt(o => ({ ...o, undervolted: !(o.undervolted ?? gpu.undervolted) }));
    if (type === 'restart_gpu')            setOpt(o => ({ ...o, status: 'active' }));
    if (type === 'move_to_storage')        setOpt(o => ({ ...o, status: 'stored' }));
    if (type === 'move_from_storage')      setOpt(o => ({ ...o, status: 'active' }));
    if (type === 'refurbish')              setOpt(o => ({ ...o, health: 100, status: 'active' }));
    if (type === 'upgrade_paste')          setOpt(o => ({ ...o, pasteLevel:   (o.pasteLevel   ?? gpu.pasteLevel   ?? 1) + 1 }));
    if (type === 'upgrade_fan')            setOpt(o => ({ ...o, fanLevel:     (o.fanLevel     ?? gpu.fanLevel     ?? 1) + 1 }));
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
          0%,100% { box-shadow: 0 -4px 30px rgba(0,212,255,0.15), 0 -20px 60px rgba(0,0,0,0.8); }
          50%      { box-shadow: 0 -4px 50px rgba(0,212,255,0.3),  0 -20px 60px rgba(0,0,0,0.8); }
        }
      `}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,5,15,0.75)', backdropFilter: 'blur(4px)',
      }} />

      {/* Bottom sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
        background: 'linear-gradient(180deg, #0D1E35 0%, #080F1E 100%)',
        borderRadius: '20px 20px 0 0',
        borderTop: `1px solid ${CYE}`,
        maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        animation: 'modal-up 0.25s cubic-bezier(0.32,0.72,0,1), modal-glow 3s ease-in-out 0.25s infinite',
      }}>

        {/* Drag handle */}
        <div style={{ padding: '10px 0 4px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{
            width: 36, height: 4, borderRadius: 2,
            background: `linear-gradient(90deg, transparent, ${CY}, transparent)`,
            boxShadow: `0 0 8px ${CY}`,
          }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '8px 16px 14px',
          borderBottom: `1px solid ${CYE}`,
          flexShrink: 0, position: 'relative',
        }}>
          {/* Emoji с кольцом */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: CYB,
              border: `1px solid ${CYE}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32,
              boxShadow: isActive ? `0 0 16px rgba(0,212,255,0.2)` : 'none',
            }}>
              {spec.emoji}
            </div>
            {/* Статус-точка */}
            <div style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 12, height: 12, borderRadius: '50%',
              background: statusColor,
              boxShadow: `0 0 8px ${statusColor}`,
              border: '2px solid #0D1E35',
              animation: isActive ? 'pulse-dot 2s ease-in-out infinite' : 'none',
            }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
              <span style={{ fontSize: 17, fontWeight: 900, color: '#E0F0FF', letterSpacing: 0.3 }}>
                {spec.name}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: 1.5,
                color: statusColor,
                background: `${statusColor}18`,
                border: `1px solid ${statusColor}55`,
                borderRadius: 5, padding: '2px 7px',
                boxShadow: `0 0 8px ${statusColor}44`,
              }}>
                {statusLabel}
              </span>
            </div>
            <div style={{ fontSize: 10, color: DIM, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span>T{tier}</span>
              <span>·</span>
              <span>{spec.watt}W</span>
              {gpu.isRefurbished && <><span>·</span><span style={{ color: GR }}>♻️ REFURB</span></>}
              {tapBoost?.active && isActive && <><span>·</span><span style={{ color: CY, animation: 'oc-pulse 1s infinite' }}>⚡ BOOST</span></>}
              {!isStored && (
                <><span>·</span>
                <span style={{ color: tempMeta.color }}>🌡 {gpuTemp}°C</span></>
              )}
            </div>
          </div>

          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8,
            background: CYB, border: `1px solid ${CYE}`,
            color: DIM, fontSize: 14, cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Scrollable content */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '14px 14px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Health bar */}
          {!isStored && (
            <div style={{ background: CYB, borderRadius: 12, border: `1px solid ${CYE}`, padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 9, letterSpacing: 2, color: DIM }}>СОСТОЯНИЕ</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: healthColor,
                  textShadow: `0 0 8px ${healthGlow}` }}>
                  {isBroken ? '💥 BROKEN' : `${health}%`}
                </span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${health}%`, borderRadius: 3,
                  background: `linear-gradient(90deg, ${healthColor}88, ${healthColor})`,
                  boxShadow: `0 0 10px ${healthGlow}`,
                  transition: 'width 0.6s ease',
                }} />
              </div>
            </div>
          )}

          {/* Stats grid */}
          <div style={{ background: CYB, borderRadius: 12, border: `1px solid ${CYE}`, overflow: 'hidden' }}>
            {[
              { label: 'HASHRATE',     value: effectiveHash,                                   color: CY  },
              { label: 'ДОХОД/ДЕНЬ',   value: `+${spec.igcPerDay.toFixed(1)} IGC`,             color: PU  },
              { label: 'РАСХОД/ДЕНЬ',  value: `${effectiveCost} IGC`,                          color: '#FF3355' },
              { label: 'БАЛАНС ФЕРМЫ', value: `${Math.floor(farmIgc)} IGC  (~${daysLeft}д)`,   color: farmIgc < rawDayCost * 2 ? OR : DIM },
              { label: 'ОХЛАЖДЕНИЕ',   value: `Жидк. Lv${g.coolingLevel ?? 1}`,               color: DIM },
              { label: 'ТЕМПЕРАТУРА',  value: isStored ? '—' : `${gpuTemp}°C · ${tempMeta.label}`, color: isStored ? 'rgba(255,255,255,0.2)' : tempMeta.color },
              { label: 'СТАБИЛЬНОСТЬ', value: `${effectiveUptime}%`,                           color: effectiveUptime >= 88 ? GR : effectiveUptime >= 84 ? OR : '#FF3355' },
            ].map((row, i, arr) => (
              <div key={row.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 13px' }}>
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
              🔌 <b style={{ color: OR }}>USB NANO</b> — стартовый майнер.
              Разгон и андервольтинг недоступны. Купи GPU для полного контроля.
            </div>
          )}

          {/* Performance toggles */}
          {!isStored && !isNano && (
            <Section label="ПРОИЗВОДИТЕЛЬНОСТЬ">
              <div style={{ display: 'flex', gap: 8 }}>
                <CyberToggle
                  emoji="⚡" label="РАЗГОН" hint="+20% мощь · −HP быстрее"
                  active={g.overclocked}
                  activeColor={CY}
                  disabled={isBroken || isOffline || g.undervolted || g.health < 30}
                  disabledReason={g.undervolted ? 'Отключи Undervolt' : g.health < 30 ? 'HP < 30%' : undefined}
                  busy={busy}
                  onPress={() => do_('toggle_overclock')}
                />
                <CyberToggle
                  emoji="🔋" label="UNDERVOLT" hint="−15% мощь · −30% износ"
                  active={g.undervolted}
                  activeColor={GR}
                  disabled={isBroken || isOffline || g.overclocked}
                  disabledReason={g.overclocked ? 'Отключи Разгон' : undefined}
                  busy={busy}
                  onPress={() => do_('toggle_undervolting')}
                />
              </div>
            </Section>
          )}

          {/* GPU upgrades */}
          {!isStored && !isNano && (
            <Section label="АПГРЕЙДЫ GPU">
              {(() => {
                const nextCool = LIQUID_COOLING_LEVELS[g.coolingLevel ?? 1];
                const baseC = nextCool?.costIgc ?? 0;
                return (
                  <UpgradeRow
                    emoji="💧" label="Жидкостное охлаждение"
                    currentLevel={g.coolingLevel ?? 1} maxLevel={LIQUID_COOLING_LEVELS.length}
                    currentEffect={`−${LIQUID_COOLING_LEVELS[(g.coolingLevel ?? 1) - 1]?.tempReduction ?? 0}°C`}
                    nextEffect={nextCool ? `→ −${nextCool.tempReduction}°C` : null}
                    cost={nextCool ? `${adjIgc(baseC)} IGC${ratioLabel(baseC)}` : null}
                    canAfford={adjIgc(baseC) <= farmIgc}
                    busy={busy} onPress={() => do_('upgrade_liquid_cooling')}
                  />
                );
              })()}
              {(() => {
                const nextPaste = PASTE_LEVELS[g.pasteLevel ?? 1];
                const baseP = nextPaste?.costIgc ?? 0;
                return (
                  <UpgradeRow
                    emoji="🧴" label="Термопаста"
                    currentLevel={g.pasteLevel ?? 1} maxLevel={PASTE_LEVELS.length}
                    currentEffect={`−${PASTE_LEVELS[(g.pasteLevel ?? 1) - 1]?.tempReduction ?? 0}°C`}
                    nextEffect={nextPaste ? `→ −${nextPaste.tempReduction}°C` : null}
                    cost={nextPaste ? `${adjIgc(baseP)} IGC${ratioLabel(baseP)}` : null}
                    canAfford={adjIgc(baseP) <= farmIgc}
                    busy={busy} onPress={() => do_('upgrade_paste')}
                  />
                );
              })()}
              {(() => {
                const nextFan = FAN_LEVELS[g.fanLevel ?? 1];
                const baseF = nextFan?.costIgc ?? 0;
                return (
                  <UpgradeRow
                    emoji="🌀" label="Вентилятор"
                    currentLevel={g.fanLevel ?? 1} maxLevel={FAN_LEVELS.length}
                    currentEffect={`${FAN_LEVELS[(g.fanLevel ?? 1) - 1]?.uptimeBonus ?? 0}% uptime`}
                    nextEffect={nextFan ? `→ +${nextFan.uptimeBonus}%` : null}
                    cost={nextFan ? `${adjIgc(baseF)} IGC${ratioLabel(baseF)}` : null}
                    canAfford={adjIgc(baseF) <= farmIgc}
                    busy={busy} onPress={() => do_('upgrade_fan')}
                  />
                );
              })()}
            </Section>
          )}

          {/* Actions */}
          <Section label="ДЕЙСТВИЯ">
            {!isStored && (
              <ActionRow
                emoji="💡" label="Электричество"
                sub={`${effectiveCost} IGC/день · хватит ~${daysLeft}д.`}
                color={farmIgc < rawDayCost * 2 ? OR : DIM}
                busy={false}
                onPress={() => WebApp.showAlert(
                  `💡 Электричество — ${spec.name}\n\n` +
                  `Расход: ${effectiveCost} IGC/день\n` +
                  `Баланс фермы: ${Math.floor(farmIgc)} IGC\n` +
                  `Хватит на: ~${daysLeft} дн.\n\nIGC начисляется каждую эпоху (5 мин).`
                )}
              />
            )}

            {isOffline && (
              <ActionRow
                emoji="🔌" label="Перезапустить"
                sub="Карта отключена из-за нехватки IGC"
                color={CY} busy={busy}
                onPress={() => WebApp.showConfirm(
                  `🔌 Перезапустить ${spec.name}?`,
                  (ok) => { if (ok) do_('restart_gpu'); }
                )}
              />
            )}

            {!isStored && tier !== 0 && (() => {
              const adjRepair = adjIgc(repairCost);
              const repairRatio = ratioLabel(repairCost);
              return (
                <ActionRow
                  emoji="🔧" label={
                    repairBlocked ? `Ремонт (нужен Верстак Lv${needWorkbench})`
                    : g.health >= 100 ? 'Ремонт — не нужен'
                    : `Ремонт — ${adjRepair} IGC${repairRatio}`
                  }
                  sub={
                    repairBlocked ? `Верстак Lv${needWorkbench} откроет ремонт`
                    : g.health >= 100 ? 'Карта в отличном состоянии'
                    : `${health}% → 100%`
                  }
                  color={repairBlocked || g.health >= 100 ? 'rgba(255,255,255,0.2)' : isBroken ? '#FF3355' : OR}
                  busy={busy}
                  onPress={() => {
                    if (repairBlocked) { WebApp.showAlert(`Нужен Верстак Lv${needWorkbench}`); return; }
                    if (g.health >= 100) { WebApp.showAlert('Ремонт не нужен.'); return; }
                    if (farmIgc < adjRepair) { WebApp.showAlert(`Недостаточно IGC.\nНужно: ${adjRepair}\nЕсть: ${Math.floor(farmIgc)}`); return; }
                    WebApp.showConfirm(
                      `🔧 Ремонт ${spec.name}\n${health}% → 100%\nСтоимость: ${adjRepair} IGC${repairRatio}`,
                      (ok) => { if (ok) do_('refurbish'); }
                    );
                  }}
                />
              );
            })()}

            {!isStored && (
              <ActionRow
                emoji="📦" label="На склад" sub="Освободить слот фермы"
                busy={busy}
                onPress={() => WebApp.showConfirm(
                  `Снять ${spec.name} на склад?`,
                  (ok) => { if (ok) do_('move_to_storage'); }
                )}
              />
            )}

            {isStored && (
              <ActionRow
                emoji="🏭" label="Поставить в слот" sub="Активировать майнинг"
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
function UpgradeRow({ emoji, label, currentLevel, maxLevel, currentEffect, nextEffect, cost, canAfford, busy, onPress }: {
  emoji: string; label: string;
  currentLevel: number; maxLevel: number;
  currentEffect: string; nextEffect: string | null; cost: string | null;
  canAfford: boolean; busy: boolean; onPress: () => void;
}) {
  const isMax = currentLevel >= maxLevel;
  return (
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
          {/* Level pips */}
          <div style={{ display: 'flex', gap: 2, marginLeft: 2 }}>
            {Array.from({ length: maxLevel }, (_, i) => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: 1,
                background: i < currentLevel ? CY : 'rgba(255,255,255,0.1)',
                boxShadow: i < currentLevel ? `0 0 4px ${CY}` : 'none',
              }} />
            ))}
          </div>
        </div>
        <div style={{ fontSize: 10, color: DIM }}>
          {currentEffect}
          {nextEffect && <span style={{ color: PU }}> {nextEffect}</span>}
        </div>
      </div>
      {isMax ? (
        <span style={{ fontSize: 9, fontWeight: 800, color: GR, letterSpacing: 1, flexShrink: 0 }}>MAX</span>
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
  );
}

// ── Кнопка действия ───────────────────────────────────────
function ActionRow({ emoji, label, sub, color, busy, onPress }: {
  emoji: string; label: string; sub?: string; color?: string; busy: boolean; onPress: () => void;
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
