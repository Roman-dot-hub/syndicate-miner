import { useState } from 'react';
import WebApp from '@twa-dev/sdk';
import type { GPU, TapBoost } from '../types';
import { GPU_SPECS } from '../types';
import { useAction } from '../hooks/useAction';

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}ч ${m.toString().padStart(2, '0')}м ${s.toString().padStart(2, '0')}с`;
  if (m > 0) return `${m}м ${s.toString().padStart(2, '0')}с`;
  return `${s}с`;
}

interface Props {
  gpu:      GPU;
  onUpdate: () => void;
  tapBoost?: TapBoost;
}

export function GpuCard({ gpu, onUpdate, tapBoost }: Props) {
  const { action } = useAction();
  const tier = gpu.modelTier ?? (gpu as any).model_tier ?? 0;
  const spec = GPU_SPECS[tier] ?? GPU_SPECS[0];
  const [busy, setBusy] = useState(false);

  const healthColor = gpu.health > 60 ? '#2ECC71' : gpu.health > 30 ? '#F39C12' : '#E74C3C';

  const handleRepair = async () => {
    if (busy) return;
    WebApp.HapticFeedback.impactOccurred('heavy');
    setBusy(true);
    try {
      await action('refurbish', { gpu_id: gpu.id });
      onUpdate();
    } catch (e) {
      WebApp.showAlert(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleOverclock = async () => {
    if (busy || gpu.overclocked) return;
    setBusy(true);
    try {
      await action('overclock', { gpu_id: gpu.id });
      onUpdate();
    } catch (e) {
      WebApp.showAlert(String(e));
    } finally {
      setBusy(false);
    }
  };

  const isBroken  = gpu.status === 'broken';
  const isOffline = gpu.status === 'offline';

  return (
    <div style={{
      background: isBroken  ? 'rgba(231,76,60,0.12)'  :
                  isOffline ? 'rgba(255,255,255,0.04)' :
                              'rgba(255,255,255,0.07)',
      border: `1px solid ${isBroken ? 'rgba(231,76,60,0.3)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 12, padding: '12px 14px',
      opacity: isOffline ? 0.5 : 1,
    }}>
      {/* Шапка */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <span style={{ fontSize: 22 }}>{spec.emoji}</span>
            {!isBroken && !isOffline && (
              <span style={{
                position: 'absolute', top: 0, right: -2,
                width: 8, height: 8, borderRadius: '50%',
                background: '#2ECC71',
                boxShadow: '0 0 6px #2ECC71',
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            )}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{spec.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
              {spec.hashrate} H/s · {spec.watt}W
              {gpu.isRefurbished && ' · ♻️'}
              {gpu.overclocked && ' · ⚡+20%'}
            </div>
            {!isBroken && !isOffline && (
              <div style={{ fontSize: 11, marginTop: 2 }}>
                <span style={{ color: '#9B59B6' }}>+{spec.igcPerDay.toFixed(1)} IGC/день</span>
                {(() => {
                  const extraWatt = gpu.overclocked ? spec.wattBackend * 0.40 * 0.001 * 288 : 0;
                  const cost = spec.igcCostPerDay + extraWatt;
                  return cost > 0 ? (
                    <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {' '}−{cost.toFixed(1)} свет{gpu.overclocked ? ' (+40%)' : ''}
                    </span>
                  ) : null;
                })()}
              </div>
            )}
            {!isBroken && !isOffline && tapBoost?.active && (
              <div style={{
                marginTop: 3, fontSize: 10, fontWeight: 600,
                color: '#0098EA',
                animation: 'boostPulse 1.5s ease-in-out infinite',
              }}>
                ⚡ +10% буст · {fmtTime(tapBoost.secondsLeft)}
              </div>
            )}
          </div>
        </div>
        <div style={{
          fontSize: 11, fontWeight: 700, color: healthColor,
          background: `${healthColor}22`, padding: '3px 8px', borderRadius: 6,
        }}>
          {isBroken ? '💥 BROKEN' : isOffline ? '🔌 OFFLINE' : `${Math.round(gpu.health)}%`}
        </div>
      </div>

      {/* Health bar */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Здоровье</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: healthColor }}>
            {isBroken ? '💥 СЛОМАН' : `${Math.round(gpu.health)}%`}
          </span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
          <div style={{
            height: '100%', borderRadius: 2, width: `${gpu.health}%`,
            background: healthColor, transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {/* Кнопки */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(isBroken || gpu.health < 80) && (
          <button onClick={handleRepair} disabled={busy} style={btnStyle('#9B59B6')}>
            🔧 Ремонт
          </button>
        )}
        {!gpu.overclocked && !isBroken && !isOffline && (
          <button onClick={handleOverclock} disabled={busy} style={btnStyle('#0098EA')}>
            ⚡ Разгон
          </button>
        )}
      </div>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.3)} }
        @keyframes boostPulse { 0%,100%{opacity:1} 50%{opacity:0.55} }
      `}</style>
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    flex: 1, padding: '6px 0', borderRadius: 8, border: 'none',
    background: `${color}33`, color, fontSize: 12, fontWeight: 600,
    cursor: 'pointer',
  };
}
