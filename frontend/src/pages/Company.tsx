import WebApp from '@twa-dev/sdk';
import type { SyncData } from '../types';

interface Props { data: SyncData }

export function Company({ data }: Props) {
  const { user } = data;

  const refLink = `https://t.me/Syndicate_miner_bot?start=ref_${user.tgUserId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(refLink).then(() => {
      WebApp.HapticFeedback.notificationOccurred('success');
      WebApp.showAlert('Ссылка скопирована!');
    });
  };

  const shareLink = () => {
    WebApp.HapticFeedback.impactOccurred('medium');
    const text = encodeURIComponent(`⛏️ Syndicate Miner — строй крипто-ферму и зарабатывай TON!\n${refLink}`);
    window.open(`https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${text}`);
  };

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Реферальная ссылка */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(155,89,182,0.15), rgba(0,152,234,0.15))',
        borderRadius: 16, padding: '18px 16px',
        border: '1px solid rgba(155,89,182,0.25)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
          🏢 Управляющая компания
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 16 }}>
          Приглашай игроков и получай % от их хешрейта
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.06)', borderRadius: 10,
          padding: '10px 12px', fontSize: 11,
          color: 'rgba(255,255,255,0.6)', wordBreak: 'break-all', marginBottom: 12,
        }}>
          {refLink}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={copyLink} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
            background: 'rgba(155,89,182,0.3)', color: '#9B59B6',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            📋 Копировать
          </button>
          <button onClick={shareLink} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
            background: '#0098EA', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            📤 Поделиться
          </button>
        </div>
      </div>

      {/* Бонусная структура */}
      <div style={{
        background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '14px 16px',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 12 }}>
          💼 Структура бонусов
        </div>
        <BonusRow level="L1 (прямые)" pct="5%" desc="от хешрейта приглашённых" color="#2ECC71" />
        <BonusRow level="L2 (рефералы рефералов)" pct="2%" desc="от их хешрейта" color="#F39C12" />
      </div>

      {/* Как это работает */}
      <div style={{
        background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '14px 16px',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 10 }}>
          📖 Как работает
        </div>
        {[
          ['1.', 'Отправь реф-ссылку другу'],
          ['2.', 'Он открывает игру и строит ферму'],
          ['3.', 'Его хешрейт прибавляется к твоему (L1: +5%)'],
          ['4.', 'Если он кого-то пригласит — ты получишь ещё +2% от их хешрейта (L2)'],
          ['5.', 'Больше суммарный хешрейт → больше доля от пула → больше TON'],
        ].map(([n, text]) => (
          <div key={n} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
            <span style={{ color: '#0098EA', fontWeight: 700, minWidth: 16 }}>{n}</span>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BonusRow({ level, pct, desc, color }: { level: string; pct: string; desc: string; color: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div>
        <div style={{ fontSize: 12, color: '#fff' }}>{level}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{desc}</div>
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{pct}</div>
    </div>
  );
}
