import type { GPU, TapBoost } from '../types';
import { GPU_SPECS } from '../types';

function fmtH(h: number): string {
  if (h >= 1000) return `${(h / 1000).toFixed(2)} TH/s`;
  if (h >= 1)    return `${h.toFixed(2)} GH/s`;
  return `${(h * 1000).toFixed(0)} MH/s`;
}

interface Props {
  gpu:      GPU;
  onClick:  () => void;
  tapBoost?: TapBoost;
}

export function GpuCard({ gpu, onClick, tapBoost }: Props) {
  const tier = gpu.modelTier ?? (gpu as any).model_tier ?? 0;
  const spec = GPU_SPECS[tier] ?? GPU_SPECS[0];

  const isBroken  = gpu.status === 'broken';
  const isOffline = gpu.status === 'offline';
  const isStored  = gpu.status === 'stored';
  const isActive  = !isBroken && !isOffline && !isStored;

  const healthColor = gpu.health > 60 ? '#2ECC71' : gpu.health > 30 ? '#F39C12' : '#E74C3C';

  const borderColor = isBroken  ? 'rgba(231,76,60,0.4)'
                    : isStored  ? 'rgba(243,156,18,0.3)'
                    : isOffline ? 'rgba(255,255,255,0.06)'
                                : 'rgba(255,255,255,0.09)';

  const bg = isBroken  ? 'rgba(231,76,60,0.10)'
           : isStored  ? 'rgba(243,156,18,0.07)'
           : isOffline ? 'rgba(255,255,255,0.03)'
                       : 'rgba(255,255,255,0.06)';

  return (
    <div
      onClick={onClick}
      role="button"
      style={{
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 14, padding: '11px 14px',
        opacity: isOffline ? 0.55 : 1,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 12,
        transition: 'background 0.15s',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Emoji + status dot */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <span style={{ fontSize: 26 }}>{spec.emoji}</span>
        {isActive && (
          <span style={{
            position: 'absolute', top: 0, right: -3,
            width: 8, height: 8, borderRadius: '50%',
            background: '#2ECC71', boxShadow: '0 0 5px #2ECC71',
            animation: 'gpuPulse 1.8s ease-in-out infinite',
          }} />
        )}
        {isBroken && (
          <span style={{ position: 'absolute', top: -4, right: -6, fontSize: 14 }}>💥</span>
        )}
        {isStored && (
          <span style={{ position: 'absolute', top: -4, right: -6, fontSize: 12 }}>📦</span>
        )}
      </div>

      {/* Name + tags */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{spec.name}</span>
          {gpu.overclocked && (
            <span style={{ fontSize: 9, fontWeight: 700, color: '#0098EA', background: 'rgba(0,152,234,0.18)', borderRadius: 4, padding: '1px 5px' }}>
              ⚡OC
            </span>
          )}
          {gpu.undervolted && (
            <span style={{ fontSize: 9, fontWeight: 700, color: '#2ECC71', background: 'rgba(46,204,113,0.18)', borderRadius: 4, padding: '1px 5px' }}>
              🔋UV
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>
          {isStored ? 'Склад · не майнит'
            : isBroken ? 'Требует ремонта'
            : `${fmtH(spec.hashrate)} · ${spec.watt}W`}
        </div>
        {isActive && tapBoost?.active && (
          <div style={{ fontSize: 9, color: '#0098EA', marginTop: 2, fontWeight: 600, animation: 'gpuBoost 1.5s ease-in-out infinite' }}>
            ⚡ +10% буст · {tapBoost.secondsLeft}с
          </div>
        )}
      </div>

      {/* Right: health badge + chevron */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: healthColor,
          background: `${healthColor}20`, padding: '3px 8px', borderRadius: 6,
          minWidth: 50, textAlign: 'center',
        }}>
          {isBroken ? '💥' : isStored ? '💤' : `${Math.round(gpu.health)}%`}
        </div>
        <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)' }}>›</span>
      </div>

      <style>{`
        @keyframes gpuPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.4)} }
        @keyframes gpuBoost { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>
    </div>
  );
}
