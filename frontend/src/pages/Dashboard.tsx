import { useState, useEffect, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import type { SyncData } from '../types';
import { SEASON_EMOJI, GPU_SPECS } from '../types';
import { FearGreedIndex } from '../components/FearGreedIndex';
import { useAction } from '../hooks/useAction';
import { useTonConnect } from '../hooks/useTonConnect';

// ── Палитра ────────────────────────────────────────────────
const CY  = '#00D4FF';
const CYB = 'rgba(0,212,255,0.08)';
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

  const globalH    = data.network?.globalHashrate ?? 0;
  const shareRatio = globalH > 0 ? totalHashrate / globalH : 0;
  const sharePct   = shareRatio > 0 ? (shareRatio * 100).toFixed(3) : null;
  const estTonDay  = shareRatio > 0
    ? (season.poolTon * season.dripRate * shareRatio).toFixed(4)
    : null;

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

  const seasonMod = 1 + 0.25 * Math.sin(2 * Math.PI * season.day / 28);
  const modPct    = Math.round((seasonMod - 1) * 100);
  const modStr    = modPct > 0 ? `+${modPct}%` : modPct < 0 ? `${modPct}%` : '±0%';
  const modColor  = modPct > 0 ? GR : modPct < 0 ? '#FF3355' : DIM;

  const SEASON_ENDS: Record<string, number> = { spring: 7, summer: 14, autumn: 21, winter: 28 };
  const SEASON_NEXT: Record<string, string> = { spring: '☀️ Лето', summer: '🍂 Осень', autumn: '❄️ Зима', winter: '🌸 Весна' };
  const daysLeft = SEASON_ENDS[season.name] - season.day;

  const PHASE_BASE:      Record<number, number>         = { 1: 4, 2: 2, 3: 1, 4: 0.5 };
  const PHASE_THRESHOLD: Record<number, number | null>  = { 1: 1_000, 2: 10_000, 3: 100_000, 4: null };
  const phaseBase      = PHASE_BASE[season.phase] ?? 4;
  const phaseThreshold = PHASE_THRESHOLD[season.phase];
  const phaseProgress  = phaseThreshold
    ? Math.min(100, (season.totalPaid / phaseThreshold) * 100)
    : 100;

  const animMinted = useAnimatedNumber(data.igcSupply?.totalMinted ?? 0, 1200);
  const animBurned = useAnimatedNumber(data.igcSupply?.totalBurned ?? 0, 1200);

  const isActive  = activeGpus.length > 0;
  const totalGpus = data.gpus.filter(g => g.status !== 'stored').length;
  const avgHealth = activeGpus.length > 0
    ? Math.round(activeGpus.reduce((s, g) => s + g.health, 0) / activeGpus.length)
    : 0;
  const topGpu = activeGpus.reduce((best, g) =>
    (GPU_SPECS[g.modelTier]?.hashrate ?? 0) > (GPU_SPECS[best?.modelTier ?? -1]?.hashrate ?? 0) ? g : best,
  activeGpus[0]);

  return (
    <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── HERO CARD ────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0,212,255,0.07) 0%, rgba(0,0,30,0.8) 60%, rgba(0,212,255,0.04) 100%)',
        borderRadius: 18,
        border: `1px solid ${CYE}`,
        padding: '16px 16px 14px',
        boxShadow: `0 0 40px rgba(0,212,255,0.1), inset 0 1px 0 rgba(0,212,255,0.15)`,
        animation: 'hero-glow 3s ease-in-out infinite',
        position: 'relative', overflow: 'hidden',
      }}>

        {/* Фоновая сетка точек */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.15,
          backgroundImage: `radial-gradient(circle, ${CY} 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }} />

        {/* Угловые скобки */}
        {[
          { top: 8, right: 8, borderTop: true, borderRight: true },
          { top: 8, left: 8,  borderTop: true, borderLeft: true },
          { bottom: 8, right: 8, borderBottom: true, borderRight: true },
          { bottom: 8, left: 8,  borderBottom: true, borderLeft: true },
        ].map((corner, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: 18, height: 18,
            ...corner,
            borderTop:    corner.borderTop    ? `2px solid ${CY}` : 'none',
            borderRight:  corner.borderRight  ? `2px solid ${CY}` : 'none',
            borderBottom: corner.borderBottom ? `2px solid ${CY}` : 'none',
            borderLeft:   corner.borderLeft   ? `2px solid ${CY}` : 'none',
            opacity: 0.6,
          }} />
        ))}

        {/* Статус + режим */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Radar-ping вокруг dot */}
            <div style={{ position: 'relative', width: 10, height: 10 }}>
              <div style={{
                position: 'absolute', inset: -6,
                borderRadius: '50%',
                border: `1px solid ${isActive ? GR : '#FF3355'}`,
                animation: isActive ? 'radar-ping 2s ease-out infinite' : 'none',
                opacity: 0,
              }} />
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: isActive ? GR : '#FF3355',
                boxShadow: isActive ? `0 0 10px ${GR}, 0 0 20px rgba(0,255,136,0.4)` : '0 0 10px #FF3355',
                animation: 'pulse-dot 1.8s ease-in-out infinite',
              }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2.5, color: isActive ? GR : '#FF3355',
              textShadow: isActive ? `0 0 8px ${GR}` : '0 0 8px #FF3355' }}>
              {isActive ? 'MINING ACTIVE' : 'NO MINERS'}
            </span>
          </div>
          <button onClick={toggleMode} disabled={busy} style={{
            padding: '5px 13px', borderRadius: 6,
            border: `1px solid ${user.miningMode === 'pool' ? CYE : 'rgba(255,107,53,0.4)'}`,
            background: user.miningMode === 'pool' ? 'rgba(0,212,255,0.12)' : 'rgba(255,107,53,0.12)',
            color: user.miningMode === 'pool' ? CY : OR,
            fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: 1.5,
            boxShadow: user.miningMode === 'pool' ? '0 0 10px rgba(0,212,255,0.2)' : '0 0 10px rgba(255,107,53,0.2)',
          }}>
            {user.miningMode === 'pool' ? '⛏ POOL' : '🎰 SOLO'}
          </button>
        </div>

        {/* GPU label + мини-статистика */}
        <div style={{ marginBottom: 8, position: 'relative' }}>
          {topGpu && (
            <div style={{ textAlign: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 9, letterSpacing: 2, color: DIM }}>
                {GPU_SPECS[topGpu.modelTier]?.emoji} {GPU_SPECS[topGpu.modelTier]?.name?.toUpperCase()}
                {activeGpus.length > 1 ? ` +${activeGpus.length - 1}` : ''}
              </span>
            </div>
          )}
          {/* Строка быстрых статов */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14 }}>
            <MiniStat label="GPU" value={`${activeGpus.length}/${totalGpus}`} color={isActive ? GR : 'rgba(255,255,255,0.2)'} />
            <div style={{ width: 1, background: 'rgba(0,212,255,0.15)' }} />
            <MiniStat
              label="HP ср."
              value={isActive ? `${avgHealth}%` : '—'}
              color={avgHealth > 60 ? GR : avgHealth > 30 ? OR : '#FF3355'}
            />
            <div style={{ width: 1, background: 'rgba(0,212,255,0.15)' }} />
            <MiniStat
              label="РЕЖИМ"
              value={user.miningMode === 'pool' ? 'POOL' : 'SOLO'}
              color={user.miningMode === 'pool' ? CY : OR}
            />
          </div>
        </div>

        {/* Большой хешрейт */}
        <div style={{ textAlign: 'center', marginBottom: 6, position: 'relative' }}>
          <div style={{ fontSize: 9, letterSpacing: 3, color: DIM, marginBottom: 6 }}>TOTAL HASHRATE</div>
          <div style={{
            fontSize: 44, fontWeight: 900, color: CY, lineHeight: 1,
            textShadow: `0 0 20px ${CY}, 0 0 50px rgba(0,212,255,0.5)`,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: -1,
          }}>
            {fmtH(totalHashrate)}
          </div>
        </div>

        {/* Двойной scanline */}
        <div style={{ position: 'relative', height: 5, background: 'rgba(0,212,255,0.08)', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
          {/* Заполненная полоса */}
          <div style={{
            position: 'absolute', height: '100%',
            width: isActive ? '80%' : '0%',
            background: `linear-gradient(90deg, rgba(0,212,255,0.3), ${CY})`,
            borderRadius: 3,
            boxShadow: `0 0 10px ${CY}`,
            transition: 'width 1.2s ease',
          }} />
          {/* Первый бегущий блик */}
          {isActive && <div style={{
            position: 'absolute', height: '100%', width: '30%',
            background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)`,
            animation: 'scan-bar 2.2s linear infinite',
          }} />}
          {/* Второй блик (с задержкой) */}
          {isActive && <div style={{
            position: 'absolute', height: '100%', width: '15%',
            background: `linear-gradient(90deg, transparent, rgba(0,212,255,0.8), transparent)`,
            animation: 'scan-bar 2.2s linear infinite 1.1s',
          }} />}
        </div>

        {/* Нижняя строка: доля + est. доход */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 10, color: DIM }}>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>SHARE  </span>
            <span style={{ color: sharePct ? CY : 'rgba(255,255,255,0.2)', fontWeight: 700 }}>
              {sharePct ? `${sharePct}%` : '—'}
            </span>
          </div>
          <div style={{ fontSize: 10, color: DIM }}>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>~EST/ДЕНЬ  </span>
            <span style={{ color: estTonDay ? OR : 'rgba(255,255,255,0.2)', fontWeight: 700 }}>
              {estTonDay ? `${estTonDay} TON` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* ── 4 СТАТ-КАРТОЧКИ (2×2) ────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>

        {/* Ставка */}
        <StatCard
          label="СТАВКА"
          icon="📈"
          main={`${dripPct}%`}
          sub="в день"
          extra={<span style={{ color: modColor, fontSize: 10, fontWeight: 700 }}>{modStr} сезон</span>}
        />

        {/* Сезон */}
        <StatCard
          label="СЕЗОН"
          icon={SEASON_EMOJI[season.name]}
          main={`День ${season.day}/28`}
          sub={daysLeft > 0 ? `→ ${SEASON_NEXT[season.name]} через ${daysLeft}д` : 'Смена сезона!'}
          subColor={daysLeft === 0 ? OR : undefined}
          bar={<SeasonBar day={season.day} />}
        />

        {/* Фаза халвинга */}
        <StatCard
          label="ФАЗА ХАЛВИНГА"
          icon="🔄"
          main={`Фаза ${season.phase}`}
          sub={phaseThreshold
            ? `${season.totalPaid.toFixed(0)} / ${phaseThreshold} TON`
            : 'Финальная фаза'}
          extra={<span style={{ color: DIM, fontSize: 10 }}>{phaseBase}%/день</span>}
          bar={phaseThreshold ? (
            <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
              <div style={{
                height: '100%', width: `${phaseProgress}%`,
                background: 'linear-gradient(90deg, #9B59B6, #FF3355)',
                borderRadius: 2, transition: 'width 1s ease',
                boxShadow: '0 0 6px rgba(155,89,182,0.6)',
              }} />
            </div>
          ) : undefined}
        />

        {/* В сети */}
        <StatCard
          label="В СЕТИ"
          icon="👥"
          main={`${data.network?.activeMiners ?? '—'}`}
          sub="активных GPU"
          extra={<span style={{ color: DIM, fontSize: 10 }}>{data.network?.totalUsers ?? '—'} игроков</span>}
        />
      </div>

      {/* ── БАЛАНС ───────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(255,107,53,0.08), rgba(0,0,30,0.7))',
        borderRadius: 16, border: '1px solid rgba(255,107,53,0.25)',
        padding: '14px 16px',
        boxShadow: '0 0 20px rgba(255,107,53,0.08)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 2.5, color: 'rgba(255,180,130,0.6)', marginBottom: 4 }}>TON BALANCE</div>
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
            background: connected ? 'rgba(255,107,53,0.18)' : 'rgba(255,255,255,0.04)',
            color: connected ? OR : 'rgba(255,255,255,0.35)',
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
            { label: 'ВЧЕРА',  ton: data.earnings.yesterdayTon, igc: data.earnings.yesterdayIgc },
            { label: '7 ДНЕЙ', ton: data.earnings.weekTon,      igc: data.earnings.weekIgc },
          ].map(({ label, ton, igc: igcVal }) => (
            <div key={label} style={{
              background: CYB, borderRadius: 12, border: `1px solid ${CYE}`,
              padding: '12px 12px',
            }}>
              <div style={{ fontSize: 8, letterSpacing: 2, color: DIM, marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: ton > 0 ? CY : 'rgba(255,255,255,0.18)' }}>
                {ton > 0 ? ton.toFixed(4) : '—'}
                {ton > 0 && <span style={{ fontSize: 9, marginLeft: 4, fontWeight: 400, color: DIM }}>TON</span>}
              </div>
              <div style={{ fontSize: 11, color: igcVal > 0 ? 'rgba(155,89,182,0.9)' : 'rgba(255,255,255,0.18)', marginTop: 4, fontWeight: 600 }}>
                {igcVal > 0 ? `+${Math.round(igcVal)} IGC` : '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── POOL RESERVE ─────────────────────────────────── */}
      <div style={{ background: CYB, borderRadius: 14, border: `1px solid ${CYE}`, padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 9, letterSpacing: 2, color: DIM }}>POOL RESERVE</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: CY,
            textShadow: `0 0 8px ${CY}` }}>{season.poolTon.toFixed(1)} TON</span>
        </div>
        <div style={{ height: 6, background: 'rgba(0,212,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${poolFill}%`, borderRadius: 3,
            background: `linear-gradient(90deg, rgba(0,212,255,0.5), ${CY})`,
            boxShadow: `0 0 10px ${CY}`,
            transition: 'width 1s ease',
          }} />
        </div>
        <div style={{ fontSize: 9, color: 'rgba(140,210,255,0.3)', marginTop: 6, letterSpacing: 1 }}>
          ВЫПЛАЧЕНО: {season.totalPaid.toFixed(1)} TON
        </div>
      </div>

      {/* ── IGC ЭМИССИЯ ──────────────────────────────────── */}
      {data.igcSupply && (() => {
        const IGC_MAX     = 10_000_000_000;
        const circulating = animMinted - animBurned;
        const barBase     = Math.max(animMinted, 1);
        const fmtPct = (n: number) => {
          const p = (n / IGC_MAX) * 100;
          if (p >= 1) return `${p.toFixed(1)}%`;
          if (p >= 0.01) return `${p.toFixed(3)}%`;
          return '<0.01%';
        };
        const rows = [
          { label: 'ДОБЫТО',      value: animMinted,           bar: 1,                          color: 'rgba(155,89,182,0.9)' },
          { label: 'СОЖЖЕНО',     value: animBurned,           bar: animBurned / barBase,        color: '#FF3355' },
          { label: 'В ОБРАЩЕНИИ', value: circulating,          bar: circulating / barBase,       color: OR },
          { label: 'ОСТАЛОСЬ',    value: IGC_MAX - animMinted, bar: (IGC_MAX - animMinted) / IGC_MAX, color: 'rgba(255,255,255,0.18)' },
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
                  <span style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: r.color }}>{fmtBig(r.value)}</span>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)' }}>{fmtPct(r.value)}</span>
                  </span>
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
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

// ── Компонент стат-карточки ────────────────────────────────
function StatCard({ label, icon, main, sub, subColor, extra, bar }: {
  label: string; icon: string; main: string; sub: string;
  subColor?: string; extra?: React.ReactNode; bar?: React.ReactNode;
}) {
  return (
    <div style={{
      background: CYB, borderRadius: 13, border: `1px solid ${CYE}`,
      padding: '11px 12px',
    }}>
      <div style={{ fontSize: 8, letterSpacing: 2, color: DIM, marginBottom: 7, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span>{icon}</span><span>{label}</span>
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: '#E0F0FF', lineHeight: 1, marginBottom: 3 }}>
        {main}
      </div>
      <div style={{ fontSize: 10, color: subColor ?? DIM }}>{sub}</div>
      {extra && <div style={{ marginTop: 4 }}>{extra}</div>}
      {bar}
    </div>
  );
}

// Мини-стат в hero-карточке
function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 8, letterSpacing: 1.5, color: 'rgba(140,210,255,0.35)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color, textShadow: `0 0 8px ${color}66`, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

// Полоска сезона: 28 делений, текущий день подсвечен
function SeasonBar({ day }: { day: number }) {
  return (
    <div style={{ display: 'flex', gap: 2, marginTop: 7 }}>
      {Array.from({ length: 28 }, (_, i) => {
        const d = i + 1;
        const active = d <= day;
        const current = d === day;
        return (
          <div key={d} style={{
            flex: 1, height: 4, borderRadius: 1,
            background: current ? CY : active ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.07)',
            boxShadow: current ? `0 0 6px ${CY}` : 'none',
            transition: 'background 0.3s',
          }} />
        );
      })}
    </div>
  );
}
