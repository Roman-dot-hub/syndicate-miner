import type { UserData } from '../types';

interface Props { user: UserData }

export function BalanceBar({ user }: Props) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 16px',
      background: 'rgba(255,255,255,0.05)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ display: 'flex', gap: 20 }}>
        <Coin label="TON" value={user.tonBalance.toFixed(4)} color="#0098EA" />
        <Coin label="IGC" value={Math.floor(user.igcBalance).toString()} color="#9B59B6" />
      </div>
      <div style={{
        fontSize: 11, color: 'rgba(255,255,255,0.4)',
        background: 'rgba(255,255,255,0.06)',
        padding: '2px 8px', borderRadius: 8,
      }}>
        {user.miningMode === 'pool' ? '⛏️ Pool' : '🎰 Solo'}
      </div>
    </div>
  );
}

function Coin({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%',
        background: color, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff',
      }}>
        {label[0]}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1 }}>{label}</div>
      </div>
    </div>
  );
}
