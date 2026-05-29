import { useState, useEffect, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import type { SyncData } from '../types';
import { SEASON_EMOJI, GPU_SPECS } from '../types';
import { FearGreedIndex } from '../components/FearGreedIndex';
import { useAction } from '../hooks/useAction';
import { useTonConnect } from '../hooks/useTonConnect';

// ── Палитра ────────────────────────────────────────────────
const CY  = '#00D4FF';
const CYB = 'rgba(0,212,255,0.10)';
const CYE = 'rgba(0,212,255,0.22)';
const OR  = '#FF6B35';
const GR  = '#00FF88';
const DIM = 'rgba(140,210,255,0.45)';

// ── Анимированное число ────────────────────────────────────
function useAnimatedNumber(target: number, duration = 1200): number {
  const [displayed, setDisplayed] = useState(target);
  const rafRef   = useRef<number>();
  const fromRef  = useRef(target);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    fromRef.current  = displayed;
    startRef.current = null;
    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const t = Math.min((ts - startRef.current) / duration, 1);
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      setDisplayed(fromRef.current + (target - fromRef.current) * e);
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return displayed;
}

function fmtH(h: number): string {
  if (h >= 1000) return `${(h / 1000).toFixed(2)} TH/s`;
  if (h >= 1)    return `${h.toFixed(2)} GH/s`;
  return `${(h * 1000).toFixed(0)} MH/s`;
}
function fmtBig(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

interface Props { data: SyncData; onUpdate: () => void }

export function Dashboard({ data, onUpdate }: Props) {
  const raw  = data.user as any;
  const user = {
    ...data.user,
    tonBalance: parseFloat(raw.tonBalance ?? raw.ton_balance ?? '0'),
    igcBalance: parseFloat(raw.igcBalance ?? raw.igc_balance ?? '0'),
    miningMode: (raw.miningMode ?? raw.mining_mode ?? 'pool') as 'pool' | 'solo',
  };
  const { season, igc } = data;
  const { action }      = useAction();
  const { connected, connect } = useTonConnect();
  const [busy, setBusy] = useState(false);

  const activeGpus = data.gpus.filter(g => g.status === 'active');
  const totalHashrate = activeGpus.reduce((s, g) => {
    const spec = GPU_SPECS[g.modelTier] ?? GPU_SPECS[0];
    const mult = (g.overclocked ? 1.20 : 1.0) * (g.undervolted ? 0.85 : 1.0);
    return s + spec.hashrate * mult;
  }, 0);

  const toggleMode = async () => {
    if (busy) return;
    setBusy(true);
    WebApp.HapticFeedback.impactOccurred('medium');
    try {
      await action('set_mode', { mode: user.miningMode === 'pool' ? 'solo' : 'pool' });
      onUpdate();
    } catch (e) { WebApp.showAlert(String(e)); }
    finally     { setBusy(false); }
  };

  const handleWithdraw = async () => {
    if (!connected) { connect(); return; }
    if (user.tonBalance < 0.1) { WebApp.showAlert('Минимальная сумма вывода: 0.1 TON'); return; }
    WebApp.showConfirm(`Вывести ${user.tonBalance.toFixed(4)} TON?`, async (ok) => {
      if (!ok) return;
      setBusy(true);
      try {
        await action('withdraw', { amount_ton: user.tonBalance });
        onUpdate();
        WebApp.showAlert('Заявка принята. Придёт в течение 2 минут.');
      } catch (e) { WebApp.showAlert(String(e)); }
      finally     { setBusy(false); }
    });
  };

  const dripPct  = (season.dripRate * 100).toFixed(2);
  const poolFill = Math.min(100, (season.poolTon / Math.max(season.poolTon + season.totalPaid, 1)) * 100);

  const seasonMod  = 1 + 0.25 * Math.sin(2 * Math.PI * season.day / 28);
  const modPct     = Math.round((seasonMod - 1) * 100);
  const modStr     = modPct > 0 ? `+${modPct}%` : modPct < 0 ? `${modPct}%` : '±0%';
  const modColor   = modPct > 0 ? GR : modPct < 0 ? '#FF3355' : DIM;

  const SEASON_ENDS: Record<string, number>  = { spring: 7, summer: 14, autumn: 21, winter: 28 };
  const SEASON_NEXT: Record<string, string>  = { spring: '☀️ Лето', summer: '🍂 Осень', autumn: '❄️ Зима', winter: '🌸 Весна' };
  const daysLeft = SEASON_ENDS[season.name] - season.day;

  const PHASE_BASE: Record<number, number> = { 1: 4, 2: 2, 3: 1, 4: 0.5 };
  const phaseBase  = PHASE_BASE[season.phase] ?? 4;

  const animMinted = useAnimatedNumber(data.igcSupply?.totalMinted ?? 0, 1200);
  const animBurned = useAnimatedNumber(data.igcSupply?.totalBurned ?? 0, 1200);

  const isActive = activeGpus.length > 0;

  return (
    <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── HERO: Статус майнинга ─────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0,212,255,0.07) 0%, rgba(0,0,20,0.6) 100%)',
        borderRadius: 16,
        border: `1px solid ${CYE}`,
        padding: '16px 16px 14px',
        boxShadow: `0 0 30px rgba(0,212,255,0.12), inset 0 1px 0 rgba(0,212,255,0.15)`,
        animation: 'hero-glow 3s ease-in-out infinite',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Декор — угловые линии */}
        <div style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24,
          borderTop: `1px solid ${CY}`, borderRight: `1px solid ${CY}`, opacity: 0.5 }} />
        <div style={{ position: 'absolute', bottom: 8, left: 8, width: 24, height: 24,
          borderBottom: `1px solid ${CY}`, borderLeft: `1px solid ${CY}`, opacity: 0.5 }} />

        {/* Статус + переключатель */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isActive ? GR : '#FF3355',
              boxShadow: isActive ? `0 0 8px ${GR}` : '0 0 8px #FF3355',
              animation: 'pulse-dot 1.8s ease-in-out infinite',
              display: 'inline-block',
            }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: isActive ? GR : '#FF3355' }}>
              {isActive ? 'MINING ACTIVE' : 'NO MINERS'}
            </span>
          </div>
          <button onClick={toggleMode} disabled={busy} style={{
            padding: '5px 12px', borderRadius: 6,
            border: `1px solid ${user.miningMode === 'pool' ? CYE : 'rgba(255,107,53,0.35)'}`,
            background: user.miningMode === 'pool' ? CYB : 'rgba(255,107,53,0.1)',
            color: user.miningMode === 'pool' ? CY : OR,
            fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 1,
          }}>
            {user.miningMode === 'pool' ? '⛏ POOL' : '🎰 SOLO'}
          </button>
        </div>

        {/* Хешрейт */}
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: 2.5, color: DIM, marginBottom: 4 }}>TOTAL HASHRATE</div>
          <div style={{
            fontSize: 38, fontWeight: 900, color: CY, lineHeight: 1,
            textShadow: `0 0 20px ${CY}, 0 0 40px rgba(0,212,255,0.4)`,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {fmtH(totalHashrate)}
          </div>
          <div style={{ fontSize: 10, color: DIM, marginTop: 4 }}>
            {activeGpus.length} активных GPU
          </div>
        </div>

        {/* Полоса активности */}
        <div style={{ position: 'relative', height: 4, background: 'rgba(0,212,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', height: '100%',
            width: isActive ? '100%' : '0%',
            background: `linear-gradient(90deg, transparent, ${CY}, transparent)`,
            animation: isActive ? 'scan-bar 2s linear infinite' : 'none',
          }} />
          <div style={{
            height: '100%', width: isActive ? '85%' : '10%',
            background: `linear-gradient(90deg, ${CY}, rgba(0,212,255,0.3))`,
            borderRadius: 2,
            boxShadow: `0 0 8px ${CY}`,
            transition: 'width 1s ease',
          }} />
        </div>
      </div>

      {/* ── СТАТ-СТРОКА: 3 блока ─────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[
          { label: 'СТАВКА', value: `${dripPct}%`, sub: 'в день' },
          { label: 'СЕЗОН', value: `${SEASON_EMOJI[season.name]} Д${season.day}`, sub: `${daysLeft}д → ${SEASON_NEXT[season.name].split(' ')[0]}` },
          { label: 'В СЕТИ', value: `${data.network?.activeMiners ?? '—'}`, sub: 'майнеров' },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{
            background: CYB, borderRadius: 12,
            border: `1px solid ${CYE}`,
            padding: '10px 8px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 8, letterSpacing: 2, color: DIM, marginBottom: 5 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{value}</div>
            <div style={{ fontSize: 9, color: DIM, marginTop: 3 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── БАЛАНС ───────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(255,107,53,0.08), rgba(0,0,20,0.5))',
        borderRadius: 16, border: '1px solid rgba(255,107,53,0.25)',
        padding: '14px 16px',
        boxShadow: '0 0 20px rgba(255,107,53,0.08)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 2, color: 'rgba(255,180,130,0.6)', marginBottom: 4 }}>TON BALANCE</div>
            <div style={{
              fontSize: 30, fontWeight: 900, color: OR, lineHeight: 1,
              textShadow: `0 0 16px ${OR}`,
            }}>
              {user.tonBalance.toFixed(4)}
              <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 6, color: 'rgba(255,180,130,0.7)' }}>TON</span>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(155,89,182,0.9)', marginTop: 5, fontWeight: 600 }}>
              {Math.floor(user.igcBalance).toLocaleString()} IGC
            </div>
          </div>
          <button onClick={handleWithdraw} disabled={busy} style={{
            padding: '10px 14px', borderRadius: 10,
            border: `1px solid ${connected ? 'rgba(255,107,53,0.5)' : 'rgba(255,255,255,0.1)'}`,
            background: connected ? 'rgba(255,107,53,0.2)' : 'rgba(255,255,255,0.05)',
            color: connected ? OR : 'rgba(255,255,255,0.4)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
          }}>
            {connected ? '💸 ВЫВОД' : '🔗 КОШЕЛЁК'}
          </button>
        </div>
      </div>

      {/* ── ИСТОРИЯ ЗАРАБОТКА ────────────────────────────── */}
      {data.earnings && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'ВЧЕРА', ton: data.earnings.yesterdayTon, igc: data.earnings.yesterdayIgc },
            { label: '7 ДНЕЙ', ton: data.earnings.weekTon,     igc: data.earnings.weekIgc },
          ].map(({ label, ton, igc: igcVal }) => (
            <div key={label} style={{
              background: CYB, borderRadius: 12, border: `1px solid ${CYE}`,
              padding: '12px 12px',
            }}>
              <div style={{ fontSize: 8, letterSpacing: 2, color: DIM, marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: ton > 0 ? CY : 'rgba(255,255,255,0.2)' }}>
                {ton > 0 ? ton.toFixed(4) : '—'}
                {ton > 0 && <span style={{ fontSize: 9, marginLeft: 4, fontWeight: 400, color: DIM }}>TON</span>}
              </div>
              <div style={{ fontSize: 11, color: igcVal > 0 ? 'rgba(155,89,182,0.9)' : 'rgba(255,255,255,0.2)', marginTop: 4, fontWeight: 600 }}>
                {igcVal > 0 ? `+${Math.round(igcVal)} IGC` : '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── ПУЛ + СЕЗОН ──────────────────────────────────── */}
      <div style={{ background: CYB, borderRadius: 14, border: `1px solid ${CYE}`, padding: '12px 14px' }}>
        {/* Pool bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 9, letterSpacing: 2, color: DIM }}>POOL RESERVE</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: CY }}>{season.poolTon.toFixed(1)} TON</span>
        </div>
        <div style={{ height: 5, background: 'rgba(0,212,255,0.08)', borderRadius: 3, marginBottom: 10, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${poolFill}%`, borderRadius: 3,
            background: `linear-gradient(90deg, ${CY}, rgba(0,212,255,0.5))`,
            boxShadow: `0 0 8px ${CY}`,
            transition: 'width 1s ease',
          }} />
        </div>

        {/* Season + Phase */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 1.5, color: DIM, marginBottom: 3 }}>СЕЗОН</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
              {SEASON_EMOJI[season.name]} День {season.day}/28
            </div>
            <div style={{ fontSize: 10, color: modColor, marginTop: 2 }}>
              {modStr} к ставке
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 1.5, color: DIM, marginBottom: 3 }}>ФАЗА ХАЛВИНГА</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Фаза {season.phase}</div>
            <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>{phaseBase}%/день база</div>
          </div>
        </div>
      </div>

      {/* ── IGC ЭМИССИЯ ──────────────────────────────────── */}
      {data.igcSupply && (() => {
        const IGC_MAX     = 10_000_000_000;
        const circulating = animMinted - animBurned;
        const barBase     = Math.max(animMinted, 1);
        const fmtPct      = (n: number) => {
          const p = (n / IGC_MAX) * 100;
          if (p >= 1) return `${p.toFixed(1)}%`;
          if (p >= 0.01) return `${p.toFixed(3)}%`;
          return '<0.01%';
        };
        const rows = [
          { label: 'ДОБЫТО',      value: animMinted,              bar: 1,                              color: 'rgba(155,89,182,0.9)' },
          { label: 'СОЖЖЕНО',     value: animBurned,              bar: animBurned / barBase,            color: '#FF3355' },
          { label: 'В ОБРАЩЕНИИ', value: circulating,             bar: circulating / barBase,           color: OR },
          { label: 'ОСТАЛОСЬ',    value: IGC_MAX - animMinted,    bar: (IGC_MAX - animMinted) / IGC_MAX, color: 'rgba(255,255,255,0.18)' },
        ];
        return (
          <div style={{ background: CYB, borderRadius: 14, border: `1px solid ${CYE}`, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: DIM, marginBottom: 12 }}>
              IGC EMISSION — 10,000,000,000 MAX
            </div>
            {rows.map(r => (
              <div key={r.label} style={{ marginBottom: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 9, letterSpacing: 1.5, color: DIM }}>{r.label}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: r.color }}>{fmtBig(r.value)}</span>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{fmtPct(r.value)}</span>
                  </span>
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${Math.min(100, r.bar * 100)}%`,
                    background: r.color,
                    transition: 'width 0.8s ease',
                    boxShadow: r.bar > 0.02 ? `0 0 6px ${r.color}` : 'none',
                  }} />
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── FEAR & GREED ─────────────────────────────────── */}
      <FearGreedIndex igc={igc} />
    </div>
  );
}
