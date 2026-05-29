import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import type { GPU, TapBoost } from '../types';
import { GPU_SPECS, calcGpuTemp, calcEffectiveUptime, tempInfo, PASTE_LEVELS, FAN_LEVELS, LIQUID_COOLING_LEVELS } from '../types';

function fmtH(h: number): string {
  if (h >= 1000) return `${(h / 1000).toFixed(2)} TH/s`;
  if (h >= 1)    return `${h.toFixed(2)} GH/s`;
  return `${(h * 1000).toFixed(0)} MH/s`;
}
import { useAction } from '../hooks/useAction';

// Зеркало backend wearEngine.ts — формула должна совпадать
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

  // Оптимистичный стейт — применяется немедленно при нажатии, до ответа сервера
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

  // Когда сервер подтверждает изменения (gpu props обновились) — сбрасываем оптимистичный стейт
  useEffect(() => {
    setOpt({});
  }, [gpu.overclocked, gpu.undervolted, gpu.health, gpu.status,
      gpu.pasteLevel, gpu.fanLevel, gpu.coolingLevel]);

  // Отображаемые данные = серверные + оптимистичные перезаписи
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

  // Температура и uptime (display — Sprint 2)
  const gpuTemp       = calcGpuTemp(tier, g.coolingLevel ?? 1, g.overclocked, g.undervolted, g.pasteLevel ?? 1, farmServerRoom);
  const tempMeta      = tempInfo(gpuTemp);
  const effectiveUptime = calcEffectiveUptime(tier, farmUps, farmProvider, g.fanLevel ?? 1);

  const isBroken  = g.status === 'broken';
  const isOffline = g.status === 'offline';
  const isStored  = g.status === 'stored';
  const isActive  = !isBroken && !isOffline && !isStored;
  const isNano    = tier === 0;

  const healthColor = g.health > 60 ? '#2ECC71' : g.health > 30 ? '#F39C12' : '#E74C3C';

  const statusLabel = isBroken ? '💥 СЛОМАН' : isOffline ? '🔌 OFFLINE' : isStored ? '📦 СКЛАД' : '✅ АКТИВЕН';
  const statusColor = isBroken ? '#E74C3C'   : isOffline ? '#aaa'       : isStored ? '#F39C12' : '#2ECC71';

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

  // Динамические IGC-цены с учётом рыночного индекса
  const adjIgc = (base: number) => Math.ceil(base * igcRatio);
  const ratioLabel = (base: number): string => {
    if (Math.abs(igcRatio - 1) < 0.02) return '';
    const adj = adjIgc(base);
    const sign = igcRatio > 1 ? '+' : '−';
    const diff = Math.abs(adj - base);
    return ` (${sign}${diff} рынок)`;
  };

  const do_ = async (type: string) => {
    if (busy) return;
    setBusy(true);

    // Оптимистичное обновление — мгновенная реакция UI
    if (type === 'toggle_overclock')      setOpt(o => ({ ...o, overclocked: !(o.overclocked ?? gpu.overclocked) }));
    if (type === 'toggle_undervolting')   setOpt(o => ({ ...o, undervolted: !(o.undervolted ?? gpu.undervolted) }));
    if (type === 'restart_gpu')           setOpt(o => ({ ...o, status: 'active' }));
    if (type === 'move_to_storage')       setOpt(o => ({ ...o, status: 'stored' }));
    if (type === 'move_from_storage')     setOpt(o => ({ ...o, status: 'active' }));
    if (type === 'refurbish')             setOpt(o => ({ ...o, health: 100, status: 'active' }));
    if (type === 'upgrade_paste')         setOpt(o => ({ ...o, pasteLevel:   (o.pasteLevel   ?? gpu.pasteLevel   ?? 1) + 1 }));
    if (type === 'upgrade_fan')           setOpt(o => ({ ...o, fanLevel:     (o.fanLevel     ?? gpu.fanLevel     ?? 1) + 1 }));
    if (type === 'upgrade_liquid_cooling') setOpt(o => ({ ...o, coolingLevel: (o.coolingLevel ?? gpu.coolingLevel ?? 1) + 1 }));

    try {
      await action(type, { gpu_id: gpu.id });
      WebApp.HapticFeedback.notificationOccurred('success');
      // Синк уходит в фон — не блокируем кнопки
      // opt сбросится сам через useEffect когда придут свежие данные
      onUpdate();
    } catch (e) {
      setOpt({});       // откат при ошибке
      WebApp.showAlert(String(e));
    } finally {
      setBusy(false);   // кнопки становятся активны сразу после действия
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
      }} />

      {/* Bottom sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
        background: '#1a2840',
        borderRadius: '18px 18px 0 0',
        maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
        animation: 'slideUp 0.22s cubic-bezier(0.32,0.72,0,1)',
        boxShadow: '0 -6px 32px rgba(0,0,0,0.5)',
      }}>

        {/* Drag handle */}
        <div style={{ padding: '10px 0 2px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 32, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
        </div>

        {/* Header — fixed, not scrollable */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 40 }}>{spec.emoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{spec.name}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, color: statusColor,
                background: `${statusColor}22`, border: `1px solid ${statusColor}44`,
                borderRadius: 5, padding: '1px 7px',
              }}>{statusLabel}</span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>
              Tier {tier} · {spec.watt}W{gpu.isRefurbished ? ' · ♻️' : ''}
              {tapBoost?.active && isActive ? ` · ⚡ +10% буст` : ''}
              {!isStored && (
                <span style={{ color: tempMeta.color, marginLeft: 4 }}>
                  · 🌡️ {gpuTemp}°C
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%',
            width: 28, height: 28, color: 'rgba(255,255,255,0.5)', fontSize: 14,
            cursor: 'pointer', flexShrink: 0,
          }}>✕</button>
        </div>

        {/* Scrollable content */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Health bar */}
          {!isStored && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Состояние</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: healthColor }}>
                  {isBroken ? '💥 СЛОМАН' : `${Math.round(g.health)}%`}
                </span>
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${g.health}%`, borderRadius: 3,
                  background: `linear-gradient(90deg, ${healthColor}99, ${healthColor})`,
                  transition: 'width 0.4s',
                }} />
              </div>
            </div>
          )}

          {/* Stats */}
          <div style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 11,
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {[
              { label: 'Хешрейт',     value: effectiveHash,                                                                    color: '#F39C12' },
              { label: 'Доход/день',  value: `+${spec.igcPerDay.toFixed(1)} IGC`,                                              color: '#9B59B6' },
              { label: 'Расход/день', value: `${effectiveCost} IGC`,                                                           color: 'rgba(255,100,100,0.85)' },
              { label: 'Баланс фермы',value: `${Math.floor(farmIgc)} IGC (~${daysLeft}д.)`,                                    color: farmIgc < rawDayCost * 2 ? '#F39C12' : 'rgba(255,255,255,0.6)' },
              { label: 'Охлаждение',  value: `Жидк. Lv${g.coolingLevel ?? 1}`,                                               color: 'rgba(255,255,255,0.55)' },
              { label: 'Температура', value: isStored ? '—' : `${gpuTemp}°C · ${tempMeta.label}`,                              color: isStored ? 'rgba(255,255,255,0.3)' : tempMeta.color },
              { label: 'Стабильность',value: `${effectiveUptime}%`,                                                            color: effectiveUptime >= 88 ? '#2ECC71' : effectiveUptime >= 84 ? '#F39C12' : '#E74C3C' },
            ].map((row, i, arr) => (
              <div key={row.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px' }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)' }}>{row.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: row.color }}>{row.value}</span>
                </div>
                {i < arr.length - 1 && <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />}
              </div>
            ))}
          </div>

          {/* Nano restriction notice */}
          {isNano && !isStored && (
            <div style={{
              background: 'rgba(243,156,18,0.08)',
              border: '1px solid rgba(243,156,18,0.25)',
              borderRadius: 10, padding: '9px 12px',
              fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5,
            }}>
              🔌 <b style={{ color: 'rgba(255,255,255,0.7)' }}>USB Nano</b> — стартовый майнер.
              Разгон и андервольтинг недоступны. Купи GPU в магазине для полного контроля.
            </div>
          )}

          {/* Performance toggles — недоступны для USB Nano */}
          {!isStored && !isNano && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Производительность
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Overclock */}
                <ToggleBtn
                  emoji="⚡"
                  label="Разгон"
                  hint="+20% мощь, −HP"
                  active={g.overclocked}
                  disabled={isBroken || isOffline || g.undervolted || g.health < 30}
                  disabledReason={g.undervolted ? 'Отключи Undervolt' : g.health < 30 ? 'HP < 30%' : undefined}
                  busy={busy}
                  onPress={() => do_('toggle_overclock')}
                />
                {/* Undervolt */}
                <ToggleBtn
                  emoji="🔋"
                  label="Undervolt"
                  hint="−15% мощь, −30% износ"
                  active={g.undervolted}
                  disabled={isBroken || isOffline || g.overclocked}
                  disabledReason={g.overclocked ? 'Отключи Разгон' : undefined}
                  busy={busy}
                  onPress={() => do_('toggle_undervolting')}
                />
              </div>
            </div>
          )}

          {/* Per-GPU upgrades: paste + fan */}
          {!isStored && !isNano && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Апгрейды GPU
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Жидкостное охлаждение */}
                {(() => {
                  const nextCool = LIQUID_COOLING_LEVELS[g.coolingLevel ?? 1];
                  const baseC = nextCool?.costIgc ?? 0;
                  return (
                    <GpuUpgradeRow
                      emoji="💧"
                      label="Жидкостное охлаждение"
                      currentLevel={g.coolingLevel ?? 1}
                      maxLevel={LIQUID_COOLING_LEVELS.length}
                      currentEffect={`−${LIQUID_COOLING_LEVELS[(g.coolingLevel ?? 1) - 1]?.tempReduction ?? 0}°C`}
                      nextEffect={nextCool ? `→ −${nextCool.tempReduction}°C` : null}
                      cost={nextCool ? `${adjIgc(baseC)} IGC${ratioLabel(baseC)}` : null}
                      canAfford={adjIgc(baseC) <= farmIgc}
                      busy={busy}
                      onPress={() => do_('upgrade_liquid_cooling')}
                    />
                  );
                })()}
                {/* Термопаста */}
                {(() => {
                  const nextPaste = PASTE_LEVELS[g.pasteLevel ?? 1];
                  const baseP = nextPaste?.costIgc ?? 0;
                  return (
                    <GpuUpgradeRow
                      emoji="🧴"
                      label="Термопаста"
                      currentLevel={g.pasteLevel ?? 1}
                      maxLevel={PASTE_LEVELS.length}
                      currentEffect={`−${PASTE_LEVELS[(g.pasteLevel ?? 1) - 1]?.tempReduction ?? 0}°C`}
                      nextEffect={nextPaste ? `→ −${nextPaste.tempReduction}°C` : null}
                      cost={nextPaste ? `${adjIgc(baseP)} IGC${ratioLabel(baseP)}` : null}
                      canAfford={adjIgc(baseP) <= farmIgc}
                      busy={busy}
                      onPress={() => do_('upgrade_paste')}
                    />
                  );
                })()}
                {/* Вентилятор */}
                {(() => {
                  const nextFan = FAN_LEVELS[g.fanLevel ?? 1];
                  const baseF = nextFan?.costIgc ?? 0;
                  return (
                    <GpuUpgradeRow
                      emoji="🌀"
                      label="Вентилятор"
                      currentLevel={g.fanLevel ?? 1}
                      maxLevel={FAN_LEVELS.length}
                      currentEffect={`${FAN_LEVELS[(g.fanLevel ?? 1) - 1]?.uptimeBonus ?? 0}% uptime`}
                      nextEffect={nextFan ? `→ +${nextFan.uptimeBonus}%` : null}
                      cost={nextFan ? `${adjIgc(baseF)} IGC${ratioLabel(baseF)}` : null}
                      canAfford={adjIgc(baseF) <= farmIgc}
                      busy={busy}
                      onPress={() => do_('upgrade_fan')}
                    />
                  );
                })()}
              </div>
            </div>
          )}

          {/* Actions */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Действия
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

              {/* Electricity info */}
              {!isStored && (
                <ActionBtn
                  emoji="💡"
                  label="Оплатить электричество"
                  sub={`${effectiveCost} IGC/день · баланс ${Math.floor(farmIgc)} IGC · хватит ~${daysLeft}д.`}
                  color={farmIgc < rawDayCost * 2 ? '#F39C12' : '#fff'}
                  busy={false}
                  onPress={() => {
                    WebApp.showAlert(
                      `💡 Электричество — ${spec.name}\n\n` +
                      `Расход: ${effectiveCost} IGC/день\n` +
                      `Баланс фермы: ${Math.floor(farmIgc)} IGC\n` +
                      `Хватит на: ~${daysLeft} дн.\n\n` +
                      `IGC начисляется автоматически каждую эпоху (5 мин). Чем больше майнеров — тем быстрее пополняется баланс.`
                    );
                  }}
                />
              )}

              {/* Restart offline GPU */}
              {isOffline && (
                <ActionBtn
                  emoji="🔌"
                  label="Перезапустить"
                  sub="Карта отключена из-за нехватки IGC · пополни баланс и запусти снова"
                  color="#0098EA"
                  busy={busy}
                  onPress={() => {
                    WebApp.showConfirm(
                      `🔌 Перезапустить ${spec.name}?\n\nКарта была отключена из-за нехватки IGC.\nУбедись что на балансе достаточно IGC для оплаты электричества.`,
                      (ok) => { if (ok) do_('restart_gpu'); }
                    );
                  }}
                />
              )}

              {/* Repair — always visible for non-stored */}
              {!isStored && tier !== 0 && (() => {
                const adjRepair = adjIgc(repairCost);
                const repairLabel = ratioLabel(repairCost);
                return (
                <ActionBtn
                  emoji="🔧"
                  label={repairBlocked
                    ? `Ремонт (нужен Верстак Lv${needWorkbench})`
                    : g.health >= 100
                      ? 'Ремонт — не нужен'
                      : `Ремонт — ${adjRepair} IGC${repairLabel}`}
                  sub={repairBlocked
                    ? `Верстак Lv${needWorkbench} откроет ремонт этой карты`
                    : g.health >= 100
                      ? 'Карта в отличном состоянии'
                      : isBroken
                        ? `Карта сломана · восстановить до 100% · стоит ${adjRepair} IGC`
                        : `${Math.round(g.health)}% → 100% · стоит ${adjRepair} IGC · на балансе ${Math.floor(farmIgc)} IGC`}
                  color={repairBlocked || g.health >= 100
                    ? 'rgba(255,255,255,0.3)'
                    : isBroken ? '#E74C3C' : farmIgc < adjRepair ? '#F39C12' : '#F39C12'}
                  busy={busy}
                  onPress={() => {
                    if (repairBlocked) {
                      WebApp.showAlert(`🔧 Для ремонта ${spec.name} нужен Верстак Lv${needWorkbench}.\n\nКупи его на экране Фермы → Ферма & Верстак.`);
                      return;
                    }
                    if (g.health >= 100) {
                      WebApp.showAlert('Карта в отличном состоянии — ремонт не нужен.');
                      return;
                    }
                    if (farmIgc < adjRepair) {
                      WebApp.showAlert(`Недостаточно IGC.\nНужно: ${adjRepair} IGC\nНа балансе: ${Math.floor(farmIgc)} IGC`);
                      return;
                    }
                    WebApp.showConfirm(
                      `🔧 Ремонт ${spec.name}\n\n` +
                      `Здоровье: ${Math.round(g.health)}% → 100%\n` +
                      `Стоимость: ${adjRepair} IGC${repairLabel}\n` +
                      `На балансе: ${Math.floor(farmIgc)} IGC\n\n` +
                      `Подтвердить ремонт?`,
                      (ok) => { if (ok) do_('refurbish'); }
                    );
                  }}
                />
                );
              })()}

              {/* To storage */}
              {!isStored && (
                <ActionBtn
                  emoji="📦"
                  label="На склад"
                  sub="Снять с фермы и освободить слот"
                  busy={busy}
                  onPress={() => {
                    WebApp.showConfirm(
                      `Снять ${spec.name} на склад?\nGPU перестанет майнить, слот освободится.`,
                      (ok) => { if (ok) do_('move_to_storage'); }
                    );
                  }}
                />
              )}

              {/* From storage to slot */}
              {isStored && (
                <ActionBtn
                  emoji="🏭"
                  label="Поставить в слот"
                  sub="Активировать майнинг"
                  color="#2ECC71"
                  busy={busy}
                  onPress={() => do_('move_from_storage')}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

function ToggleBtn({ emoji, label, hint, active, disabled, disabledReason, busy, onPress }: {
  emoji: string; label: string; hint: string;
  active: boolean; disabled: boolean; disabledReason?: string; busy: boolean; onPress: () => void;
}) {
  return (
    <button
      onClick={() => {
        if (disabledReason) { WebApp.showAlert(disabledReason); return; }
        onPress();
      }}
      disabled={busy}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        padding: '9px 4px', borderRadius: 11, border: 'none', cursor: 'pointer',
        background: active ? 'rgba(0,152,234,0.15)' : 'rgba(255,255,255,0.05)',
        outline: active ? '1px solid rgba(0,152,234,0.45)' : '1px solid rgba(255,255,255,0.07)',
        opacity: (disabled && !disabledReason) ? 0.35 : busy ? 0.6 : 1,
        transition: 'all 0.15s',
      }}
    >
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <span style={{ fontSize: 10, fontWeight: 700, color: active ? '#0098EA' : 'rgba(255,255,255,0.5)' }}>
        {label}
      </span>
      <span style={{ fontSize: 9, color: active ? '#2ECC71' : 'rgba(255,255,255,0.25)', fontWeight: 600 }}>
        {hint}
      </span>
    </button>
  );
}

function GpuUpgradeRow({ emoji, label, currentLevel, maxLevel, currentEffect, nextEffect, cost, canAfford, busy, onPress }: {
  emoji: string; label: string;
  currentLevel: number; maxLevel: number;
  currentEffect: string; nextEffect: string | null; cost: string | null;
  canAfford: boolean; busy: boolean; onPress: () => void;
}) {
  const isMax = currentLevel >= maxLevel;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 12px', borderRadius: 11,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{label}</span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>
            Lv{currentLevel}/{maxLevel}
          </span>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          {currentEffect}{nextEffect && <span style={{ color: '#9B59B6' }}> {nextEffect}</span>}
        </div>
      </div>
      {isMax ? (
        <span style={{ fontSize: 10, color: '#2ECC71', fontWeight: 700, flexShrink: 0 }}>МАКС</span>
      ) : (
        <button
          onClick={onPress}
          disabled={busy || !canAfford}
          style={{
            padding: '5px 10px', borderRadius: 8, border: 'none', cursor: canAfford ? 'pointer' : 'not-allowed',
            background: canAfford ? 'linear-gradient(135deg, #9B59B6, #6C3483)' : 'rgba(255,255,255,0.08)',
            color: canAfford ? '#fff' : 'rgba(255,255,255,0.3)',
            fontSize: 10, fontWeight: 700, flexShrink: 0,
            opacity: busy ? 0.5 : 1,
            boxShadow: canAfford ? '0 2px 8px rgba(155,89,182,0.35)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          {cost}
        </button>
      )}
    </div>
  );
}

function ActionBtn({ emoji, label, sub, color, busy, onPress }: {
  emoji: string; label: string; sub?: string; color?: string; busy: boolean; onPress: () => void;
}) {
  return (
    <button
      onClick={onPress}
      disabled={busy}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', borderRadius: 11, border: 'none', cursor: 'pointer',
        background: 'rgba(255,255,255,0.05)', width: '100%', textAlign: 'left',
        opacity: busy ? 0.5 : 1, transition: 'opacity 0.15s',
      }}
    >
      <span style={{ fontSize: 18, flexShrink: 0 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: color ?? '#fff' }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.33)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.18)', flexShrink: 0 }}>›</span>
    </button>
  );
}
