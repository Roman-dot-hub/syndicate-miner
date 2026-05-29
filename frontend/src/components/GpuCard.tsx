import type { GPU, TapBoost } from '../types';
import { GPU_SPECS } from '../types';

function fmtH(h: number): string {
  if (h >= 1000) return `${(h / 1000).toFixed(2)} TH/s`;
  if (h >= 1)    return `${h.toFixed(2)} GH/s`;
  return `${(h * 1000).toFixed(0)} MH/s`;
}

interface Props {
  gpu:       GPU;
  onClick:   () => void;
  tapBoost?: TapBoost;
}

export function GpuCard({ gpu, onClick, tapBoost }: Props) {
  const tier = gpu.modelTier ?? (gpu as any).model_tier ?? 0;
  const spec = GPU_SPECS[tier] ?? GPU_SPECS[0];

  const isBroken  = gpu.status === 'broken';
  const isOffline = gpu.status === 'offline';
  const isStored  = gpu.status === 'stored';
  const isActive  = !isBroken && !isOffline && !isStored;

  const health = Math.round(gpu.health);
  const healthColor = health > 60 ? '#00FF88'
                    : health > 30 ? '#FF6B35'
                    : '#FF3355';
  const healthGlow  = health > 60 ? 'rgba(0,255,136,0.4)'
                    : health > 30 ? 'rgba(255,107,53,0.4)'
                    : 'rgba(255,51,85,0.4)';

  // ── Стили по статусу ──
  const border = isBroken  ? '1px solid rgba(255,51,85,0.5)'
               : isStored  ? '1px solid rgba(255,107,53,0.3)'
               : isOffline ? '1px solid rgba(255,255,255,0.06)'
                           : '1px solid rgba(0,212,255,0.25)';

  const bg     = isBroken  ? 'rgba(255,51,85,0.07)'
               : isStored  ? 'rgba(255,107,53,0.06)'
               : isOffline ? 'rgba(255,255,255,0.02)'
                           : 'rgba(0,212,255,0.05)';

  const glowAnim = isBroken  ? 'gpu-broken 1.4s ease-in-out infinite'
                 : isActive  ? 'gpu-active 2.5s ease-in-out infinite'
                             : 'none';

  const boostActive = isActive && tapBoost?.active;

  return (
    <div
      onClick={onClick}
      role="button"
      style={{
        background: bg,
        border,
        borderRadius: 14, padding: '11px 14px',
        opacity: isOffline ? 0.5 : 1,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 12,
        transition: 'opacity 0.15s',
        WebkitTapHighlightColor: 'transparent',
        animation: glowAnim,
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Sweep shimmer на active GPU */}
      {isActive && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(105deg, transparent 40%, rgba(0,212,255,0.04) 50%, transparent 60%)',
          animation: 'gpu-sweep 3.5s linear infinite',
        }} />
      )}

      {/* Emoji + status dot */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <span style={{ fontSize: 28 }}>{spec.emoji}</span>
        {isActive && !boostActive && (
          <span style={{
            position: 'absolute', top: 1, right: -3,
            width: 8, height: 8, borderRadius: '50%',
            background: '#00FF88',
            boxShadow: '0 0 6px #00FF88, 0 0 12px rgba(0,255,136,0.4)',
            animation: 'pulse-dot 1.8s ease-in-out infinite',
            display: 'block',
          }} />
        )}
        {boostActive && (
          <span style={{
            position: 'absolute', top: 1, right: -3,
            width: 8, height: 8, borderRadius: '50%',
            background: '#00D4FF',
            boxShadow: '0 0 8px #00D4FF, 0 0 16px rgba(0,212,255,0.6)',
            animation: 'pulse-dot 0.8s ease-in-out infinite',
            display: 'block',
          }} />
        )}
        {isBroken && (
          <span style={{
            position: 'absolute', top: -4, right: -6, fontSize: 13,
            animation: 'gpu-broken-icon 0.6s ease-in-out infinite',
          }}>💥</span>
        )}
        {isStored && (
          <span style={{ position: 'absolute', top: -4, right: -6, fontSize: 12 }}>📦</span>
        )}
      </div>

      {/* Name + stats + health bar */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: isBroken ? '#FF3355' : isOffline ? 'rgba(255,255,255,0.4)' : '#E0F0FF',
          }}>
            {spec.name}
          </span>
          {gpu.overclocked && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#00D4FF',
              background: 'rgba(0,212,255,0.15)', borderRadius: 4, padding: '1px 5px',
              boxShadow: '0 0 6px rgba(0,212,255,0.3)',
              animation: 'oc-pulse 2s ease-in-out infinite',
            }}>
              ⚡ OC
            </span>
          )}
          {gpu.undervolted && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#00FF88',
              background: 'rgba(0,255,136,0.12)', borderRadius: 4, padding: '1px 5px',
            }}>
              🔋 UV
            </span>
          )}
        </div>

        <div style={{ fontSize: 10, color: 'rgba(140,210,255,0.45)', marginBottom: 6 }}>
          {isStored  ? '📦 НА СКЛАДЕ'
           : isBroken ? '⚠️ ТРЕБУЕТ РЕМОНТА'
           : isOffline ? 'ОФЛАЙН'
           : `${fmtH(spec.hashrate)} · ${spec.watt}W`}
        </div>

        {/* Health bar */}
        {!isStored && (
          <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${health}%`,
              background: healthColor,
              borderRadius: 2,
              boxShadow: `0 0 6px ${healthGlow}`,
              transition: 'width 0.8s ease',
            }} />
          </div>
        )}

        {boostActive && (
          <div style={{
            fontSize: 9, letterSpacing: 1,
            color: '#00D4FF', marginTop: 4, fontWeight: 700,
            textShadow: '0 0 8px rgba(0,212,255,0.8)',
            animation: 'oc-pulse 1s ease-in-out infinite',
          }}>
            ⚡ BOOST ACTIVE · {tapBoost!.secondsLeft}s
          </div>
        )}
      </div>

      {/* Health % badge */}
      <div style={{
        fontSize: 11, fontWeight: 800,
        color: healthColor,
        background: `${healthGlow.replace('0.4', '0.12')}`,
        border: `1px solid ${healthGlow.replace('0.4', '0.3')}`,
        padding: '3px 8px', borderRadius: 6,
        minWidth: 46, textAlign: 'center',
        flexShrink: 0,
        boxShadow: health < 30 ? `0 0 8px ${healthGlow}` : 'none',
        animation: health < 30 && !isStored ? 'gpu-broken 1.4s ease-in-out infinite' : 'none',
      }}>
        {isStored ? '💤' : `${health}%`}
      </div>

      <span style={{ fontSize: 14, color: 'rgba(140,210,255,0.2)', flexShrink: 0 }}>›</span>
    </div>
  );
}
