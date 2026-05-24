import { useState } from 'react';
import WebApp from '@twa-dev/sdk';
import type { GPU, TapBoost } from '../types';
import { GPU_SPECS } from '../types';

function fmtH(h: number): string {
  if (h >= 1000) return `${(h / 1000).toFixed(2)} TH/s`;
  if (h >= 1)    return `${h.toFixed(2)} GH/s`;
  return `${(h * 1000).toFixed(0)} MH/s`;
}
import { useAction } from '../hooks/useAction';

interface Props {
  gpu:         GPU;
  farmIgc:     number;
  farmCooling: number;
  tapBoost?:   TapBoost;
  onClose:     () => void;
  onUpdate:    () => void;
  onGoToShop:  () => void;
}

export function GpuDetailModal({ gpu, farmIgc, farmCooling, tapBoost, onClose, onUpdate, onGoToShop }: Props) {
  const { action } = useAction();
  const [busy, setBusy] = useState(false);

  const tier = gpu.modelTier ?? (gpu as any).model_tier ?? 0;
  const spec = GPU_SPECS[tier] ?? GPU_SPECS[0];

  const isBroken  = gpu.status === 'broken';
  const isOffline = gpu.status === 'offline';
  const isStored  = gpu.status === 'stored';
  const isActive  = !isBroken && !isOffline && !isStored;
  const isNano    = tier === 0;

  const healthColor = gpu.health > 60 ? '#2ECC71' : gpu.health > 30 ? '#F39C12' : '#E74C3C';

  const statusLabel = isBroken ? '💥 СЛОМАН' : isOffline ? '🔌 OFFLINE' : isStored ? '📦 СКЛАД' : '✅ АКТИВЕН';
  const statusColor = isBroken ? '#E74C3C'   : isOffline ? '#aaa'       : isStored ? '#F39C12' : '#2ECC71';

  const overcMult     = gpu.overclocked ? 1.20 : 1.0;
  const undervoltMult = gpu.undervolted  ? 0.85 : 1.0;
  const effectiveHash = fmtH(spec.hashrate * overcMult * undervoltMult);
  const extraWattCost = gpu.overclocked ? spec.wattBackend * 0.40 * 0.001 * 288 : 0;
  const rawDayCost    = spec.igcCostPerDay + extraWattCost;
  const effectiveCost = (rawDayCost * (gpu.undervolted ? 0.75 : 1.0)).toFixed(1);
  const daysLeft      = rawDayCost > 0 ? (farmIgc / rawDayCost).toFixed(1) : '∞';

  const do_ = async (type: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action(type, { gpu_id: gpu.id });
      onUpdate();
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch (e) {
      WebApp.showAlert(String(e));
    } finally {
      setBusy(false);
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
                  {isBroken ? '💥 СЛОМАН' : `${Math.round(gpu.health)}%`}
                </span>
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${gpu.health}%`, borderRadius: 3,
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
              { label: 'Хешрейт', value: effectiveHash, color: '#F39C12' },
              { label: 'Доход/день', value: `+${spec.igcPerDay.toFixed(1)} IGC`, color: '#9B59B6' },
              { label: 'Расход/день', value: `${effectiveCost} IGC`, color: 'rgba(255,100,100,0.85)' },
              { label: 'Баланс фермы', value: `${Math.floor(farmIgc)} IGC (~${daysLeft}д.)`, color: farmIgc < rawDayCost * 2 ? '#F39C12' : 'rgba(255,255,255,0.6)' },
              { label: 'Охлаждение', value: `Lv ${farmCooling}`, color: 'rgba(255,255,255,0.55)' },
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
                  active={gpu.overclocked}
                  disabled={isBroken || isOffline || gpu.undervolted || gpu.health < 30}
                  disabledReason={gpu.undervolted ? 'Отключи Undervolt' : gpu.health < 30 ? 'HP < 30%' : undefined}
                  busy={busy}
                  onPress={() => do_('toggle_overclock')}
                />
                {/* Undervolt */}
                <ToggleBtn
                  emoji="🔋"
                  label="Undervolt"
                  hint="−15% мощь, −25% свет"
                  active={gpu.undervolted}
                  disabled={isBroken || isOffline || gpu.overclocked}
                  disabledReason={gpu.overclocked ? 'Отключи Разгон' : undefined}
                  busy={busy}
                  onPress={() => do_('toggle_undervolting')}
                />
                {/* Cooler */}
                <ToggleBtn
                  emoji="🌬️"
                  label="Кулер"
                  hint={farmCooling > 0 ? `Lv ${farmCooling}` : 'Нет'}
                  active={farmCooling > 0}
                  disabled={false}
                  busy={false}
                  onPress={() => {
                    if (farmCooling === 0) {
                      onGoToShop();
                    } else {
                      WebApp.showAlert(`Охлаждение Lv${farmCooling} установлено.\nУлучши в Магазине → Инфраструктура.`);
                    }
                  }}
                />
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

              {/* Repair — always visible for non-stored */}
              {!isStored && (
                <ActionBtn
                  emoji="🔧"
                  label="Ремонт"
                  sub={isBroken ? 'Карта сломана — нужен ремонт' : `Здоровье ${Math.round(gpu.health)}% · восстановить до 100%`}
                  color={isBroken ? '#E74C3C' : '#F39C12'}
                  busy={busy}
                  onPress={() => {
                    WebApp.showConfirm(
                      `Отремонтировать ${spec.name}?\nСтоимость зависит от уровня верстака и износа.`,
                      (ok) => { if (ok) do_('refurbish'); }
                    );
                  }}
                />
              )}

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
