import React from 'react';
import WebApp from '@twa-dev/sdk';
import type { SyncData, ReferralEntry } from '../types';
import { useLang } from '../LangContext';

interface Props { data: SyncData }

export function Company({ data }: Props) {
  const { t } = useLang();
  const { user } = data;
  const referrals: ReferralEntry[] = data.referrals ?? [];

  const l1 = referrals.filter(r => r.level === 1);
  const l2 = referrals.filter(r => r.level === 2);

  const refLink = `https://t.me/Syndicate_miner_bot/app?startapp=ref_${user.tgUserId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(refLink).then(() => {
      WebApp.HapticFeedback.notificationOccurred('success');
      WebApp.showAlert(t.cmp_copied);
    });
  };

  const shareLink = () => {
    WebApp.HapticFeedback.impactOccurred('medium');
    const text = encodeURIComponent(`${t.cmp_share_text}\n${refLink}`);
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
          {t.cmp_title}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 16 }}>
          {t.cmp_sub}
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
            {t.cmp_copy}
          </button>
          <button onClick={shareLink} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
            background: '#0098EA', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            {t.cmp_share}
          </button>
        </div>
      </div>

      {/* Бонусная структура */}
      <div style={{
        background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '14px 16px',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 12 }}>
          {t.cmp_bonuses}
        </div>
        <BonusRow level={t.cmp_l1_label} pct="5%" desc={t.cmp_l1_desc} color="#2ECC71" />
        <BonusRow level={t.cmp_l2_label} pct="2%" desc={t.cmp_l2_desc} color="#F39C12" />
      </div>

      {/* Как это работает */}
      <div style={{
        background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '14px 16px',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 10 }}>
          {t.cmp_how}
        </div>
        {(t.cmp_how_steps as string[]).map((text, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
            <span style={{ color: '#0098EA', fontWeight: 700, minWidth: 16 }}>{idx + 1}.</span>
            <span>{text}</span>
          </div>
        ))}
      </div>

      {/* Список рефералов */}
      <div style={{
        background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '14px 16px',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
            {t.cmp_network}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={countChip('#2ECC71')}>L1: {l1.length}</span>
            <span style={countChip('#F39C12')}>L2: {l2.length}</span>
          </div>
        </div>

        {referrals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
            {t.cmp_no_refs}
          </div>
        ) : (
          <>
            {l1.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#2ECC71', letterSpacing: 1, marginBottom: 6 }}>
                  {t.cmp_l1_group} ({l1.length})
                </div>
                {l1.map(r => <ReferralRow key={r.tgUserId} r={r} color="#2ECC71" />)}
              </>
            )}
            {l2.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#F39C12', letterSpacing: 1, marginTop: l1.length > 0 ? 10 : 0, marginBottom: 6 }}>
                  {t.cmp_l2_group} ({l2.length})
                </div>
                {l2.map(r => <ReferralRow key={r.tgUserId} r={r} color="#F39C12" />)}
              </>
            )}
          </>
        )}
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

function ReferralRow({ r, color }: { r: ReferralEntry; color: string }) {
  const name = r.username ? `@${r.username}` : `#${r.tgUserId.slice(-5)}`;
  const date = new Date(r.joinedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: `${color}22`, border: `1px solid ${color}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, color,
        }}>
          {r.username ? r.username[0].toUpperCase() : '?'}
        </div>
        <span style={{ fontSize: 13, color: '#fff' }}>{name}</span>
      </div>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{date}</span>
    </div>
  );
}

function countChip(color: string): React.CSSProperties {
  return {
    fontSize: 11, fontWeight: 700, color,
    background: `${color}18`,
    border: `1px solid ${color}44`,
    borderRadius: 8, padding: '2px 8px',
  };
}
