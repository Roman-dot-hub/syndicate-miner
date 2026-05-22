import { useState } from 'react';
import WebApp from '@twa-dev/sdk';
import type { GPU } from '../types';
import { GPU_SPECS } from '../types';
import { useAction } from '../hooks/useAction';

interface Props {
  gpu:      GPU;
  onUpdate: () => void;
}

export function GpuCard({ gpu, onUpdate }: Props) {
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
              <div style={{ fontSize: 11, color: '#9B59B6', marginTop: 2 }}>
                +{spec.igcPerDay.toFixed(1)} IGC/день
                {spec.igcMaintPerDay > 0 && (
                  <span style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {' '}(−{spec.igcMaintPerDay.toFixed(1)} свет)
                  </span>
                )}
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
      <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 10 }}>
        <div style={{
          height: '100%', borderRadius: 2, width: `${gpu.health}%`,
          background: healthColor, transition: 'width 0.3s',
        }} />
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
      <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.3)} }`}</style>
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
