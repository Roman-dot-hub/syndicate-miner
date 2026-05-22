import { useState, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import { useAction } from '../hooks/useAction';
import type { TapBoost } from '../types';

interface Props {
  onUpdate: () => void;
  tapBoost?: TapBoost;
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}ч ${m.toString().padStart(2, '0')}м ${s.toString().padStart(2, '0')}с`;
  if (m > 0) return `${m}м ${s.toString().padStart(2, '0')}с`;
  return `${s}с`;
}

export function TapToCool({ onUpdate, tapBoost }: Props) {
  const { action } = useAction();
  const [localTaps, setLocalTaps] = useState(0);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const lastTap  = useRef(0);
  const rippleId = useRef(0);

  const inCooldown = (tapBoost?.cooldownSeconds ?? 0) > 0;
  const boostActive = tapBoost?.active ?? false;

  const handleTap = async (e: React.MouseEvent) => {
    if (inCooldown) return;

    const now = Date.now();
    if (now - lastTap.current < 100) return;
    lastTap.current = now;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = ++rippleId.current;
    setRipples(r => [...r, { id, x, y }]);
    setTimeout(() => setRipples(r => r.filter(rp => rp.id !== id)), 600);

    setLocalTaps(t => t + 1);
    WebApp.HapticFeedback.impactOccurred('light');

    try {
      await action('tap_cool');
      if (localTaps % 10 === 9) onUpdate();
    } catch {
      // rate limit или кулдаун — молча, sync обновит состояние
    }
  };

  const borderColor = inCooldown
    ? 'rgba(231,76,60,0.4)'
    : boostActive
      ? 'rgba(0,152,234,0.5)'
      : 'rgba(0,152,234,0.2)';

  const bg = inCooldown
    ? 'linear-gradient(135deg, #1a0a0a, #2a1010, #1a0808)'
    : 'linear-gradient(135deg, #0F2027, #203A43, #2C5364)';

  return (
    <div
      onClick={handleTap}
      style={{
        position: 'relative', overflow: 'hidden',
        background: bg,
        borderRadius: 20, padding: 24, textAlign: 'center',
        cursor: inCooldown ? 'not-allowed' : 'pointer',
        userSelect: 'none',
        border: `1px solid ${borderColor}`,
        transition: 'border-color 0.3s',
      }}
    >
      {/* Иконка */}
      <div style={{ fontSize: 52, marginBottom: 8, pointerEvents: 'none' }}>
        {inCooldown ? '🔥' : '❄️'}
      </div>

      {/* Заголовок */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', pointerEvents: 'none' }}>
        {inCooldown ? 'Перегрев! Отдых обязателен' : 'Tap to Cool'}
      </div>

      {/* Описание */}
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2, pointerEvents: 'none' }}>
        {inCooldown
          ? 'Нельзя тапать во время паузы'
          : '1 тап = +1 сек буста · макс 1 час · потом 1 час паузы'}
      </div>

      {/* Основной таймер */}
      {inCooldown ? (
        <div style={{
          marginTop: 12, padding: '8px 16px', borderRadius: 10,
          background: 'rgba(231,76,60,0.15)', border: '1px solid rgba(231,76,60,0.3)',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 11, color: '#E74C3C', marginBottom: 2 }}>⏳ Перезарядка через</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#E74C3C', fontVariantNumeric: 'tabular-nums' }}>
            {fmtTime(tapBoost?.cooldownSeconds ?? 0)}
          </div>
          {boostActive && (
            <div style={{ fontSize: 11, color: '#0098EA', marginTop: 4 }}>
              ⚡ Буст ещё активен: {fmtTime(tapBoost?.secondsLeft ?? 0)}
            </div>
          )}
        </div>
      ) : boostActive ? (
        <div style={{
          marginTop: 12, padding: '8px 16px', borderRadius: 10,
          background: 'rgba(0,152,234,0.15)', border: '1px solid rgba(0,152,234,0.35)',
          pointerEvents: 'none',
          animation: 'boostPulse 1.5s ease-in-out infinite',
        }}>
          <div style={{ fontSize: 11, color: '#0098EA', marginBottom: 2 }}>⚡ BOOST ACTIVE · +10% хешрейт</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#0098EA', fontVariantNumeric: 'tabular-nums' }}>
            {fmtTime(tapBoost?.secondsLeft ?? 0)}
          </div>
        </div>
      ) : (
        <div style={{
          marginTop: 12, fontSize: 13, color: 'rgba(255,255,255,0.3)', pointerEvents: 'none',
        }}>
          Буст не активен · тапай для запуска
        </div>
      )}

      {/* Прогресс-бар тапов сессии */}
      {!inCooldown && (
        <div style={{ marginTop: 12, pointerEvents: 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
            <span>Тапов в сессии</span>
            <span>{tapBoost?.tapsUsed ?? 0} / 3600</span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: `${((tapBoost?.tapsUsed ?? 0) / 3600) * 100}%`,
              background: (tapBoost?.tapsUsed ?? 0) > 3000 ? '#E74C3C' : '#0098EA',
              transition: 'width 0.3s',
            }} />
          </div>
          {(tapBoost?.tapsRemaining ?? 3600) < 200 && (
            <div style={{ fontSize: 10, color: '#E74C3C', marginTop: 3 }}>
              ⚠️ Осталось {tapBoost?.tapsRemaining} тапов до паузы
            </div>
          )}
        </div>
      )}

      {/* Рипплы */}
      {!inCooldown && ripples.map(r => (
        <span key={r.id} style={{
          position: 'absolute', left: r.x - 20, top: r.y - 20,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(0,152,234,0.4)',
          animation: 'ripple 0.6s ease-out forwards',
          pointerEvents: 'none',
        }} />
      ))}

      <style>{`
        @keyframes ripple    { to { transform: scale(3); opacity: 0; } }
        @keyframes boostPulse { 0%,100%{opacity:1} 50%{opacity:0.65} }
      `}</style>
    </div>
  );
}
