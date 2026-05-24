import { useState } from 'react';
import WebApp from '@twa-dev/sdk';
import type { SyncData } from '../types';
import { SEASON_EMOJI, GPU_SPECS } from '../types';

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
import { FearGreedIndex } from '../components/FearGreedIndex';
import { useAction } from '../hooks/useAction';
import { useTonConnect } from '../hooks/useTonConnect';

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
  const { action } = useAction();
  const { connected, connect } = useTonConnect();
  const [busy, setBusy] = useState(false);

  const totalHashrate = data.gpus
    .filter(g => g.status === 'active')
    .reduce((s, g) => {
      const spec = GPU_SPECS[g.modelTier] ?? GPU_SPECS[0];
      const mult = (g.overclocked ? 1.20 : 1.0) * (g.undervolted ? 0.85 : 1.0);
      return s + spec.hashrate * mult;
    }, 0);

  const toggleMode = async () => {
    if (busy) return;
    setBusy(true);
    WebApp.HapticFeedback.impactOccurred('medium');
    try {
      const newMode = user.miningMode === 'pool' ? 'solo' : 'pool';
      await action('set_mode', { mode: newMode });
      onUpdate();
    } catch (e) {
      WebApp.showAlert(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async () => {
    if (!connected) { connect(); return; }
    if (user.tonBalance < 0.1) {
      WebApp.showAlert('Минимальная сумма вывода: 0.1 TON');
      return;
    }
    WebApp.showConfirm(
      `Вывести ${user.tonBalance.toFixed(4)} TON?`,
      async (ok) => {
        if (!ok) return;
        setBusy(true);
        try {
          await action('withdraw', { amount_ton: user.tonBalance });
          onUpdate();
          WebApp.showAlert('Заявка на вывод принята. Придёт в течение 2 минут.');
        } catch (e) {
          WebApp.showAlert(String(e));
        } finally {
          setBusy(false);
        }
      },
    );
  };

  const dripPct  = (season.dripRate * 100).toFixed(2);
  const poolPct  = (season.poolTon / Math.max(season.poolTon + season.totalPaid, 1) * 100).toFixed(1);

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Баланс */}
      <div style={card}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Баланс TON</div>
        <div style={{ fontSize: 32, fontWeight: 700, color: '#0098EA' }}>
          {user.tonBalance.toFixed(4)}
          <span style={{ fontSize: 14, marginLeft: 4 }}>TON</span>
        </div>
        <div style={{ fontSize: 13, color: '#9B59B6', marginBottom: 12 }}>
          {Math.floor(user.igcBalance)} IGC
        </div>
        <button onClick={handleWithdraw} disabled={busy} style={{
          width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
          background: connected ? '#0098EA' : 'rgba(0,152,234,0.2)',
          color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
          {connected ? '💸 Вывести TON' : '🔗 Подключить кошелёк'}
        </button>
      </div>

      {/* Режим майнинга */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Режим майнинга</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            {user.miningMode === 'pool'
              ? 'Pool — стабильный доход'
              : 'Solo — всё или ничего'}
          </div>
        </div>
        <button onClick={toggleMode} disabled={busy} style={{
          padding: '8px 14px', borderRadius: 10, border: 'none',
          background: user.miningMode === 'pool' ? 'rgba(46,204,113,0.2)' : 'rgba(155,89,182,0.2)',
          color: user.miningMode === 'pool' ? '#2ECC71' : '#9B59B6',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>
          {user.miningMode === 'pool' ? '⛏️ Pool' : '🎰 Solo'}
        </button>
      </div>

      {/* Статы */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <StatCard label="Хешрейт" value={fmtH(totalHashrate)} icon="⚡" />
        <StatCard label="Ставка" value={`${dripPct}%/день`} icon="📈" />
        <StatCard
          label={`${SEASON_EMOJI[season.name]} Сезон`}
          value={`День ${season.day}/28`}
          icon=""
        />
        <StatCard label="Фаза пула" value={`Фаза ${season.phase}`} icon="🔄" />
        <StatCard label="В сети" value={`${data.network?.totalUsers ?? '—'} чел.`} icon="👥" />
        <StatCard label="Майнеров" value={`${data.network?.activeMiners ?? '—'} GPU`} icon="🖥️" />
      </div>

      {/* Пул */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Резерв пула</span>
          <span style={{ fontSize: 12, color: '#0098EA', fontWeight: 600 }}>
            {season.poolTon.toFixed(1)} TON
          </span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
          <div style={{
            height: '100%', borderRadius: 3, width: `${poolPct}%`,
            background: 'linear-gradient(90deg, #0098EA, #9B59B6)',
          }} />
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
          Выплачено: {season.totalPaid.toFixed(1)} TON
        </div>
      </div>

      {/* IGC эмиссия */}
      {data.igcSupply && (() => {
        const s = data.igcSupply!;
        const IGC_MAX = 1_000_000_000;
        const circulating = s.totalMinted - s.totalBurned;
        const rows = [
          { label: '🟣 Добыто всего', value: fmtBig(s.totalMinted),   pct: s.totalMinted / IGC_MAX,  color: '#9B59B6' },
          { label: '🔥 Сожжено',      value: fmtBig(s.totalBurned),   pct: s.totalBurned  / IGC_MAX,  color: '#E74C3C' },
          { label: '🔄 В обращении',  value: fmtBig(circulating),      pct: circulating    / IGC_MAX,  color: '#F39C12' },
          { label: '⬜ Не добыто',    value: fmtBig(s.remaining),      pct: s.remaining    / IGC_MAX,  color: 'rgba(255,255,255,0.2)' },
        ];
        return (
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 10 }}>
              💎 Эмиссия IGC — 1 000 000 000 max
            </div>
            {rows.map(r => (
              <div key={r.label} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{r.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: r.color }}>{r.value}</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${Math.min(100, r.pct * 100)}%`, background: r.color, borderRadius: 2, opacity: 0.75 }} />
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Fear & Greed */}
      <FearGreedIndex igc={igc} />
    </div>
  );
}

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '14px 16px',
  border: '1px solid rgba(255,255,255,0.08)',
};

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div style={{ ...card, textAlign: 'center' }}>
      <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{label}</div>
    </div>
  );
}
