import { useState } from 'react';
import WebApp from '@twa-dev/sdk';
import type { SyncData } from '../types';
import { SEASON_EMOJI } from '../types';
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
      // Только отображение — расчёт на backend
      return s + (g.overclocked ? 1.1 : 1);
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
        <StatCard label="Хешрейт" value={`~${totalHashrate.toFixed(0)} H/s`} icon="⚡" />
        <StatCard label="Ставка" value={`${dripPct}%/день`} icon="📈" />
        <StatCard
          label={`${SEASON_EMOJI[season.name]} Сезон`}
          value={`День ${season.day}/28`}
          icon=""
        />
        <StatCard label="Фаза пула" value={`Фаза ${season.phase}`} icon="🔄" />
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
