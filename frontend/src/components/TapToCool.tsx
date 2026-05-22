import { useState, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import { useAction } from '../hooks/useAction';

export function TapToCool({ onUpdate }: { onUpdate: () => void }) {
  const { action } = useAction();
  const [taps, setTaps] = useState(() => {
    return parseInt(sessionStorage.getItem('tapToCool_taps') ?? '0', 10);
  });
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const lastTap = useRef(0);
  let rippleId  = useRef(0);

  const handleTap = async (e: React.MouseEvent) => {
    const now = Date.now();
    if (now - lastTap.current < 100) return; // дебаунс
    lastTap.current = now;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const id = ++rippleId.current;
    setRipples(r => [...r, { id, x, y }]);
    setTimeout(() => setRipples(r => r.filter(rp => rp.id !== id)), 600);

    setTaps(t => {
      const next = t + 1;
      sessionStorage.setItem('tapToCool_taps', String(next));
      return next;
    });
    WebApp.HapticFeedback.impactOccurred('light');

    try {
      await action('tap_cool');
      if (taps % 10 === 9) onUpdate();
    } catch {
      // rate limit — молча игнорируем
    }
  };

  return (
    <div
      onClick={handleTap}
      style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #0F2027, #203A43, #2C5364)',
        borderRadius: 20, padding: 24, textAlign: 'center',
        cursor: 'pointer', userSelect: 'none',
        border: '1px solid rgba(0,152,234,0.3)',
      }}
    >
      <div style={{ fontSize: 52, marginBottom: 8, pointerEvents: 'none' }}>❄️</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', pointerEvents: 'none' }}>
        Tap to Cool
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', pointerEvents: 'none' }}>
        Нажимай чтобы охладить фермы и получить буст хешрейта
      </div>
      <div style={{ fontSize: 13, color: '#0098EA', marginTop: 6, pointerEvents: 'none' }}>
        {taps} тапов этой сессии
      </div>

      {ripples.map(r => (
        <span key={r.id} style={{
          position: 'absolute', left: r.x - 20, top: r.y - 20,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(0,152,234,0.4)',
          animation: 'ripple 0.6s ease-out forwards',
          pointerEvents: 'none',
        }} />
      ))}

      <style>{`@keyframes ripple { to { transform: scale(3); opacity: 0; } }`}</style>
    </div>
  );
}
