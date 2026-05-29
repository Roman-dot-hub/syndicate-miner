import { useState } from 'react';
import WebApp from '@twa-dev/sdk';
import type { SyncData } from '../types';
import { GPU_SPECS } from '../types';
import { useAction } from '../hooks/useAction';

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
  const { action }                  = useAction();
  const [busyGpu, setBusyGpu]       = useState<number | null>(null);
  const [expanded, setExpanded]     = useState<number | null>(null);

  const phase      = data.season.phase;
  const rawUser    = data.user as any;
  const tonBalance = parseFloat(rawUser.tonBalance ?? rawUser.ton_balance ?? '0');
  const igcBalance = parseFloat(rawUser.igcBalance ?? rawUser.igc_balance ?? '0');

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
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1a2332',
          borderRadius: '20px 20px 0 0',
          maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Handle */}
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.18)',
          margin: '10px auto 0', flexShrink: 0,
        }} />

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px 6px', flexShrink: 0,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>⛏️ Купить GPU</div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8,
            width: 28, height: 28, cursor: 'pointer', color: 'rgba(255,255,255,0.6)',
            fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Balances */}
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 10px', flexShrink: 0 }}>
          <Chip label={`${tonBalance.toFixed(3)}`} unit="TON" color="#0098EA" />
          <Chip label={`${Math.floor(igcBalance)}`} unit="IGC" color="#9B59B6" />
          <Chip label={`Фаза ${phase}`} unit="" color="rgba(255,255,255,0.4)" />
        </div>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />

        {/* GPU list */}
        <div style={{ overflowY: 'auto', padding: '12px 16px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(GPU_SPECS)
            .filter(([t]) => Number(t) !== 0)
            .map(([tierStr, spec]) => {
              const tier      = Number(tierStr);
              const locked    = phase < spec.availablePhase;
              const canAfford = tonBalance >= spec.priceTon;
              const isBusy    = busyGpu === tier;
              const isOpen    = expanded === tier;
              const netIgc    = spec.igcPerDay - spec.igcCostPerDay;

              return (
                <div key={tier} style={{
                  background: locked ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)',
                  border: `1px solid ${canAfford && !locked ? 'rgba(0,152,234,0.25)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 14, padding: '12px 14px',
                  opacity: locked ? 0.5 : 1,
                  transition: 'border-color 0.2s',
                }}>
                  {/* Row */}
                  <div
                    onClick={() => !locked && setExpanded(e => e === tier ? null : tier)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: locked ? 'default' : 'pointer' }}
                  >
                    <span style={{ fontSize: 26, flexShrink: 0 }}>{spec.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: locked ? 'rgba(255,255,255,0.35)' : '#fff' }}>
                        {spec.name}
                        {locked && <span style={{ fontSize: 10, color: '#E74C3C', marginLeft: 6 }}>🔒 Фаза {spec.availablePhase}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                        {fmtH(spec.hashrate)} · {spec.watt}W
                        <span style={{ color: netIgc >= 0 ? '#2ECC71' : '#E74C3C', marginLeft: 4 }}>
                          {netIgc >= 0 ? '+' : ''}{netIgc.toFixed(0)} IGC/д
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); buyGpu(tier); }}
                      disabled={locked || isBusy || !canAfford}
                      style={{
                        padding: '7px 13px', borderRadius: 9, border: 'none', flexShrink: 0,
                        cursor: (locked || !canAfford || isBusy) ? 'default' : 'pointer',
                        background: (locked || !canAfford) ? 'rgba(255,255,255,0.08)' : '#0098EA',
                        color: (locked || !canAfford) ? 'rgba(255,255,255,0.3)' : '#fff',
                        fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                        boxShadow: (!locked && canAfford) ? '0 2px 10px rgba(0,152,234,0.4)' : 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      {isBusy ? '...' : `${spec.priceTon} TON`}
                    </button>
                  </div>

                  {/* Expanded stats */}
                  {isOpen && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                      <StatRow label="Хешрейт"        value={fmtH(spec.hashrate)}           color="#0098EA" />
                      <StatRow label="Мощность"       value={`${spec.watt}W`} />
                      <StatRow label="IGC доход/день" value={`+${spec.igcPerDay.toFixed(1)}`} color="#9B59B6" />
                      <StatRow label="IGC расход/день" value={`−${spec.igcCostPerDay.toFixed(1)}`} color="#E74C3C" />
                      <StatRow
                        label="Баланс IGC/день"
                        value={`${netIgc >= 0 ? '+' : ''}${netIgc.toFixed(1)}`}
                        color={netIgc >= 0 ? '#2ECC71' : '#E74C3C'}
                      />
                      {tier >= 4 && (
                        <div style={{ marginTop: 6, fontSize: 10, color: '#F39C12', background: 'rgba(243,156,18,0.1)', padding: '5px 8px', borderRadius: 6 }}>
                          ⚠️ IGC-расход превышает добычу. Окупаемость зависит от доли сети.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
          })}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, unit, color }: { label: string; unit: string; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '4px 10px', fontSize: 12,
    }}>
      <span style={{ color, fontWeight: 700 }}>{label}</span>
      {unit && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{unit}</span>}
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: color ?? 'rgba(255,255,255,0.7)' }}>{value}</span>
    </div>
  );
}
