import { useState } from 'react';
import WebApp from '@twa-dev/sdk';
import type { SyncData } from '../types';
import { GPU_SPECS } from '../types';
import { useAction } from '../hooks/useAction';
import { useLang } from '../LangContext';
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

interface Props {
  data:     SyncData;
  onClose:  () => void;
  onUpdate: () => void;
}

export function GpuShopModal({ data, onClose, onUpdate }: Props) {
  const { t } = useLang();
  const { action }              = useAction();
  const [busyGpu, setBusyGpu]   = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const phase      = data.season.phase;
  const rawUser    = data.user as any;
  const rawFarm    = data.farm as any;
  const tonBalance = parseFloat(rawUser.tonBalance ?? rawUser.ton_balance ?? '0');
  const igcBalance = parseFloat(rawUser.igcBalance ?? rawUser.igc_balance ?? '0');
  const wbLevel    = rawFarm.workbenchLevel ?? rawFarm.workbench_level ?? 0;

  const buyGpu = async (tier: number) => {
    if (busyGpu !== null) return;
    const spec = GPU_SPECS[tier];
    const ok = await new Promise<boolean>(res =>
      WebApp.showConfirm(
        `Купить ${spec.name} за ${spec.priceTon} TON?\n\nБаланс: ${tonBalance.toFixed(3)} TON`,
        res,
      ),
    );
    if (!ok) return;
    setBusyGpu(tier);
    try {
      await action('buy_gpu', { model_tier: tier });
      WebApp.HapticFeedback.notificationOccurred('success');
      onUpdate();
      onClose();
    } catch (e) {
      WebApp.showAlert(String(e));
    } finally {
      setBusyGpu(null);
    }
  };

  return (
    <>
      <style>{`
        @keyframes shop-up {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes shop-glow {
          0%,100% { box-shadow: 0 -4px 30px rgba(0,212,255,0.1), 0 -20px 60px rgba(0,0,0,0.7); }
          50%      { box-shadow: 0 -4px 50px rgba(0,212,255,0.22), 0 -20px 60px rgba(0,0,0,0.7); }
        }
        @keyframes shop-card-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,5,15,0.82)', backdropFilter: 'blur(4px)',
      }} />

      {/* Sheet */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
          background: 'linear-gradient(180deg, #0D1E35 0%, #060D1A 100%)',
          borderRadius: '20px 20px 0 0',
          borderTop: `1px solid ${CYE}`,
          maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          animation: 'shop-up 0.25s cubic-bezier(0.32,0.72,0,1), shop-glow 3s ease-in-out 0.25s infinite',
        }}
      >
        {/* Drag handle */}
        <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{
            width: 36, height: 4, borderRadius: 2,
            background: `linear-gradient(90deg, transparent, ${CY}, transparent)`,
            boxShadow: `0 0 8px ${CY}`,
          }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0 16px 12px', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#E0F0FF', letterSpacing: 0.3 }}>
              {t.shop_title}
            </div>
            <div style={{ fontSize: 9, letterSpacing: 2, color: DIM, marginTop: 2 }}>
              {t.shop_phase} {phase} · {t.shop_subtitle}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8,
            background: CYB, border: `1px solid ${CYE}`,
            color: DIM, fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Балансы */}
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px', flexShrink: 0 }}>
          <BalanceChip value={tonBalance.toFixed(3)} unit="TON" color={OR} />
          <BalanceChip value={Math.floor(igcBalance).toString()} unit="IGC" color={PU} />
        </div>

        <div style={{ height: 1, background: CYE, flexShrink: 0 }} />

        {/* GPU список */}
        <div style={{
          overflowY: 'scroll',
          WebkitOverflowScrolling: 'touch' as any,
          flex: 1,
          padding: '12px 14px 36px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {Object.entries(GPU_SPECS)
            .filter(([t]) => Number(t) !== 0)
            .map(([tierStr, spec], idx) => {
              const tier      = Number(tierStr);
              const locked    = phase < spec.availablePhase;
              const canAfford = tonBalance >= spec.priceTon;
              const isBusy    = busyGpu === tier;
              const isOpen    = expanded === tier;
              const netIgc    = spec.igcPerDay - spec.igcCostPerDay;
              const netColor  = netIgc >= 0 ? GR : '#FF3355';

              // Цвет рамки карточки
              const cardBorder = locked
                ? 'rgba(255,255,255,0.07)'
                : canAfford
                  ? CYE
                  : 'rgba(255,255,255,0.1)';
              const cardBg = locked
                ? 'rgba(255,255,255,0.02)'
                : canAfford
                  ? 'rgba(0,212,255,0.05)'
                  : 'rgba(255,255,255,0.04)';

              return (
                <div
                  key={tier}
                  style={{
                    background: cardBg,
                    border: `1px solid ${cardBorder}`,
                    borderRadius: 14,
                    opacity: locked ? 0.45 : 1,
                    animation: `shop-card-in 0.2s ease-out ${idx * 0.04}s both`,
                    boxShadow: canAfford && !locked ? `0 0 12px rgba(0,212,255,0.08)` : 'none',
                  }}
                >
                  {/* Строка GPU */}
                  <div
                    onClick={() => !locked && setExpanded(e => e === tier ? null : tier)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 14px',
                      cursor: locked ? 'default' : 'pointer',
                    }}
                  >
                    {/* Иконка */}
                    <div style={{
                      width: 44, height: 44, borderRadius: 11, flexShrink: 0,
                      background: locked ? 'rgba(255,255,255,0.05)' : CYB,
                      border: `1px solid ${locked ? 'rgba(255,255,255,0.08)' : CYE}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <GpuIcon tier={tier} size={34} />
                    </div>

                    {/* Инфо */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: locked ? DIM : '#E0F0FF' }}>
                          {spec.name}
                        </span>
                        {locked && (
                          <span style={{
                            fontSize: 8, fontWeight: 700, color: '#FF3355',
                            background: 'rgba(255,51,85,0.12)', border: '1px solid rgba(255,51,85,0.3)',
                            borderRadius: 4, padding: '1px 5px',
                          }}>
                            🔒 {t.shop_phase} {spec.availablePhase}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, fontSize: 10, color: DIM }}>
                        <span style={{ color: CY, fontWeight: 700 }}>{fmtH(spec.hashrate)}</span>
                        <span>·</span>
                        <span>{spec.watt}W</span>
                        <span>·</span>
                        <span style={{ color: netColor, fontWeight: 700 }}>
                          {netIgc >= 0 ? '+' : ''}{netIgc.toFixed(0)} IGC/д
                        </span>
                      </div>
                    </div>

                    {/* Кнопка купить */}
                    <button
                      onClick={e => { e.stopPropagation(); if (!locked && canAfford) buyGpu(tier); }}
                      disabled={locked || isBusy || !canAfford}
                      style={{
                        padding: '8px 12px', borderRadius: 9, flexShrink: 0,
                        cursor: (!locked && canAfford && !isBusy) ? 'pointer' : 'not-allowed',
                        background: locked || !canAfford
                          ? 'rgba(255,255,255,0.07)'
                          : `linear-gradient(135deg, ${OR}, #CC4400)`,
                        border: `1px solid ${locked || !canAfford ? 'rgba(255,255,255,0.1)' : OR + '66'}`,
                        color: locked || !canAfford ? 'rgba(255,255,255,0.25)' : '#fff',
                        fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
                        boxShadow: (!locked && canAfford) ? `0 0 12px rgba(255,107,53,0.4)` : 'none',
                        transition: 'all 0.15s',
                        opacity: isBusy ? 0.6 : 1,
                      }}
                    >
                      {isBusy ? '...' : `${spec.priceTon} TON`}
                    </button>
                  </div>

                  {/* Раскрытые детали */}
                  {isOpen && (
                    <div style={{
                      borderTop: `1px solid ${CYE}`,
                      padding: '10px 14px 12px',
                      background: 'rgba(0,0,0,0.2)',
                    }}>
                      {/* Строка быстрых статов */}
                      <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                        gap: 6, marginBottom: 10,
                      }}>
                        {[
                          { label: t.hashrate_label, value: fmtH(spec.hashrate),              color: CY  },
                          { label: t.income_day,     value: `+${spec.igcPerDay.toFixed(1)}`,  color: PU  },
                          { label: t.expense_day,    value: `−${spec.igcCostPerDay.toFixed(1)}`, color: '#FF3355' },
                        ].map((s, i) => (
                          <div key={i} style={{
                            background: CYB, borderRadius: 8, border: `1px solid ${CYE}`,
                            padding: '7px 6px', textAlign: 'center',
                          }}>
                            <div style={{ fontSize: 7, letterSpacing: 1.5, color: DIM, marginBottom: 3 }}>{s.label}</div>
                            <div style={{ fontSize: 11, fontWeight: 800, color: s.color, textShadow: `0 0 6px ${s.color}66` }}>{s.value}</div>
                          </div>
                        ))}
                      </div>

                      {/* Доп. строки */}
                      {[
                        { label: t.shop_power,     value: `${spec.watt}W`,                                    color: DIM      },
                        { label: t.shop_igc_bal,   value: `${netIgc >= 0 ? '+' : ''}${netIgc.toFixed(1)} IGC`, color: netColor },
                        { label: t.shop_stability, value: `${spec.baseUptime}%`,                              color: spec.baseUptime >= 88 ? GR : OR },
                      ].map(row => (
                        <div key={row.label} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '5px 0',
                          borderBottom: '1px solid rgba(0,212,255,0.08)',
                        }}>
                          <span style={{ fontSize: 10, color: DIM }}>{row.label}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: row.color }}>{row.value}</span>
                        </div>
                      ))}

                      {tier >= 4 && (
                        <div style={{
                          marginTop: 8, fontSize: 10, color: OR, lineHeight: 1.5,
                          background: 'rgba(255,107,53,0.08)',
                          border: '1px solid rgba(255,107,53,0.25)',
                          borderRadius: 8, padding: '7px 10px',
                        }}>
                          ⚠️ {t.shop_warning}
                        </div>
                      )}

                      {/* ── Ограничения ─────────────────────────── */}
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ fontSize: 8, letterSpacing: 1.5, color: DIM, marginBottom: 2 }}>
                          {t.shop_constraints ?? 'ТРЕБОВАНИЯ'}
                        </div>
                        {/* Ремонт */}
                        {(() => {
                          const need = tier <= 2 ? 1 : tier <= 4 ? 2 : 3;
                          const met  = wbLevel >= need;
                          const hint = tier <= 2 ? '🔧 Lv1 · 500 IGC' : tier <= 4 ? '⚙️ Lv2 · 5 TON' : '🏗️ Lv3 · 25 TON';
                          return (
                            <ShopConstraint
                              icon="🔧"
                              label={`Ремонт: верстак Lv${need}`}
                              met={met}
                              hint={met ? undefined : hint}
                            />
                          );
                        })()}
                        {/* Фаза */}
                        {spec.availablePhase > 1 && (
                          <ShopConstraint
                            icon="🔒"
                            label={`Доступна с Фазы ${spec.availablePhase}`}
                            met={phase >= spec.availablePhase}
                            hint={phase < spec.availablePhase ? `Сейчас Фаза ${phase}` : undefined}
                          />
                        )}
                        {/* OC/UV */}
                        {tier === 0
                          ? <ShopConstraint icon="⚡" label="OC и Undervolt недоступны" met={false} hint="USB Nano — базовый майнер" />
                          : <ShopConstraint icon="⚡" label="Поддерживает OC (+20%) и Undervolt (−15% хеш, −30% износ)" met={true} />
                        }
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}

// ── Строка ограничения ────────────────────────────────────
function ShopConstraint({ icon, label, met, hint }: { icon: string; label: string; met: boolean; hint?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 8px', borderRadius: 7,
      background: met ? 'rgba(0,255,136,0.06)' : 'rgba(255,51,85,0.07)',
      border: `1px solid ${met ? 'rgba(0,255,136,0.2)' : 'rgba(255,51,85,0.2)'}`,
    }}>
      <span style={{ fontSize: 13, lineHeight: '16px', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: met ? '#00FF88' : '#FF3355' }}>{label}</span>
        {hint && (
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginLeft: 5 }}>({hint})</span>
        )}
      </div>
      <span style={{ fontSize: 11, color: met ? '#00FF88' : '#FF3355', flexShrink: 0 }}>
        {met ? '✓' : '✗'}
      </span>
    </div>
  );
}

// ── Чип баланса ───────────────────────────────────────────
function BalanceChip({ value, unit, color }: { value: string; unit: string; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      background: `${color}12`, border: `1px solid ${color}40`,
      borderRadius: 8, padding: '5px 12px',
      boxShadow: `0 0 8px ${color}20`,
    }}>
      <span style={{ fontSize: 14, fontWeight: 800, color, textShadow: `0 0 8px ${color}88` }}>{value}</span>
      <span style={{ fontSize: 9, letterSpacing: 1.5, color: `${color}99`, fontWeight: 700 }}>{unit}</span>
    </div>
  );
}
