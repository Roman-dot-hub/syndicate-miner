import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { useLang } from '../LangContext';
import { fmt } from '../i18n';

const API_URL = import.meta.env.VITE_API_URL ?? '';

interface Entry {
  rank:           number;
  tg_user_id:     string | number;
  display_name:   string;
  total_hashrate: number;
  active_gpus:    number;
}

interface Data {
  top:        Entry[];
  myTgId:     number;
  myRank:     number | null;
  myHashrate: number;
  myGpus:     number;
}

function fmtH(h: number): string {
  if (h >= 1000) return `${(h / 1000).toFixed(2)} TH/s`;
  if (h >= 1)    return `${h.toFixed(1)} GH/s`;
  return `${(h * 1000).toFixed(0)} MH/s`;
}

function medal(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

export function Leaderboard() {
  const { t } = useLang();
  const [data,    setData]    = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    const headers: Record<string, string> = {};
    if (WebApp.initData) {
      headers['X-TG-Init-Data'] = WebApp.initData;
    } else {
      headers['X-Dev-User-Id'] = '1';
    }

    fetch(`${API_URL}/api/leaderboard`, { headers })
      .then(async r => {
        const j = await r.json();
        if (j.ok) setData(j);
        else setError(j.detail ?? j.error ?? `HTTP ${r.status}`);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
      {t.lb_loading}
    </div>
  );

  if (error || !data) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
      <div>{t.lb_load_error}</div>
      {error && <div style={{ marginTop: 8, color: 'rgba(255,100,100,0.7)', fontSize: 11, wordBreak: 'break-all', maxWidth: 280, margin: '8px auto 0' }}>{error}</div>}
    </div>
  );

  const myIdStr   = String(data.myTgId);
  const isInTop   = data.top.some(e => String(e.tg_user_id) === myIdStr);

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>

      {/* Заголовок */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 6,
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{t.lb_title}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
            {t.lb_subtitle}
          </div>
        </div>
        {data.myRank && (
          <div style={{
            background: 'rgba(0,152,234,0.15)', border: '1px solid rgba(0,152,234,0.3)',
            borderRadius: 10, padding: '6px 12px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{t.lb_my_place}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0098EA' }}>#{data.myRank}</div>
          </div>
        )}
      </div>

      {/* Список */}
      {data.top.map(entry => {
        const isMe = String(entry.tg_user_id) === myIdStr;
        const m    = medal(entry.rank);

        return (
          <div key={entry.tg_user_id} style={{
            background: isMe ? 'rgba(0,152,234,0.10)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${isMe ? 'rgba(0,152,234,0.35)' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: 12, padding: '9px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {/* Ранг / медаль */}
            <div style={{
              width: 30, flexShrink: 0, textAlign: 'center',
              fontSize: m ? 20 : 12,
              color: m ? undefined : 'rgba(255,255,255,0.35)',
              fontWeight: 600,
            }}>
              {m ?? `#${entry.rank}`}
            </div>

            {/* Имя + GPU */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 600,
                color: isMe ? '#0098EA' : '#fff',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {isMe ? '👤 ' : ''}{entry.display_name}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                {fmt(t.lb_gpu_active, { n: entry.active_gpus })}
              </div>
            </div>

            {/* Хешрейт */}
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F39C12', flexShrink: 0 }}>
              {fmtH(Number(entry.total_hashrate))}
            </div>
          </div>
        );
      })}

      {/* Текущий игрок вне топ-100 */}
      {!isInTop && data.myRank && (
        <>
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.15)', fontSize: 12, padding: '2px 0' }}>
            · · ·
          </div>
          <div style={{
            background: 'rgba(0,152,234,0.10)',
            border: '1px solid rgba(0,152,234,0.35)',
            borderRadius: 12, padding: '9px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ width: 30, flexShrink: 0, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
              #{data.myRank}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0098EA' }}>{t.lb_you}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                {fmt(t.lb_gpu_active, { n: data.myGpus })}
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F39C12' }}>
              {fmtH(data.myHashrate)}
            </div>
          </div>
        </>
      )}

      {data.top.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
          {t.lb_empty}
        </div>
      )}
    </div>
  );
}
