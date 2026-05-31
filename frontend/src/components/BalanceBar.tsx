import { useEffect, useRef, useState } from 'react';
import type { UserData } from '../types';
import { useLang } from '../LangContext';

// Анимированное число — плавный count-up при изменении
function useAnimatedValue(target: number, decimals: number): string {
  const [val, setVal]   = useState(target);
  const rafRef          = useRef<number>();
  const fromRef         = useRef(target);
  const startRef        = useRef<number | null>(null);

  useEffect(() => {
    fromRef.current  = val;
    startRef.current = null;
    const dur = 600;
    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const t = Math.min((ts - startRef.current) / dur, 1);
      const e = 1 - Math.pow(1 - t, 3); // ease-out-cubic
      setVal(fromRef.current + (target - fromRef.current) * e);
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return val.toFixed(decimals);
}

interface Props { user: UserData; optimisticMode?: 'pool' | 'solo' | null }

export function BalanceBar({ user, optimisticMode }: Props) {
  const { t, lang, setLang } = useLang();
  const u   = user as any;
  const ton = parseFloat(u.tonBalance ?? u.ton_balance ?? 0);
  const igc = parseFloat(u.igcBalance ?? u.igc_balance ?? 0);
  const mode = optimisticMode ?? u.miningMode ?? u.mining_mode ?? 'pool';

  const tonStr = useAnimatedValue(ton, 4);
  const igcStr = useAnimatedValue(Math.floor(igc), 0);

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '9px 14px',
      background: 'rgba(0,10,24,0.95)',
      borderBottom: '1px solid rgba(0,212,255,0.15)',
      backdropFilter: 'blur(10px)',
      position: 'relative',
    }}>
      {/* Декор: тонкая светящаяся полоска снизу */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.4), transparent)',
      }} />

      <div style={{ display: 'flex', gap: 16 }}>
        <CyberCoin label="TON" value={tonStr} color="#FF6B35" glow="rgba(255,107,53,0.5)" />
        <CyberCoin label="IGC" value={igcStr} color="#BD00FF" glow="rgba(189,0,255,0.4)" />
      </div>

      {/* Right side: mode badge + lang toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
          color: mode === 'pool' ? '#00D4FF' : '#FF6B35',
          background: mode === 'pool' ? 'rgba(0,212,255,0.1)' : 'rgba(255,107,53,0.1)',
          border: `1px solid ${mode === 'pool' ? 'rgba(0,212,255,0.25)' : 'rgba(255,107,53,0.25)'}`,
          padding: '3px 9px', borderRadius: 6,
          boxShadow: mode === 'pool'
            ? '0 0 8px rgba(0,212,255,0.2)'
            : '0 0 8px rgba(255,107,53,0.2)',
        }}>
          {mode === 'pool' ? t.mode_pool : t.mode_solo}
        </div>

        {/* Language toggle */}
        <button
          onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
            background: 'rgba(0,212,255,0.07)',
            border: '1px solid rgba(0,212,255,0.2)',
            borderRadius: 6, padding: '3px 7px',
            cursor: 'pointer', color: 'rgba(0,212,255,0.65)',
            lineHeight: 1,
          }}
        >
          <span style={{ fontSize: 13 }}>🌐</span>
          <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.5 }}>
            {lang === 'ru' ? 'EN' : 'RU'}
          </span>
        </button>
      </div>
    </div>
  );
}

function CyberCoin({ label, value, color, glow }: {
  label: string; value: string; color: string; glow: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      {/* Hexagon-ish coin icon */}
      <div style={{
        width: 22, height: 22, borderRadius: 6,
        background: `${color}22`,
        border: `1px solid ${color}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 900, color,
        boxShadow: `0 0 8px ${glow}`,
        flexShrink: 0,
      }}>
        {label[0]}
      </div>
      <div>
        <div style={{
          fontSize: 14, fontWeight: 800, color,
          lineHeight: 1,
          textShadow: `0 0 10px ${glow}`,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {value}
        </div>
        <div style={{ fontSize: 9, letterSpacing: 1, color: `${color}88`, lineHeight: 1, marginTop: 1 }}>
          {label}
        </div>
      </div>
    </div>
  );
}
