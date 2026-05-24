import { useState, useEffect, Component } from 'react';
import type { ReactNode } from 'react';
import WebApp from '@twa-dev/sdk';
import { useSync } from './hooks/useSync';

// ── Error Boundary — catches React render crashes ──
class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(e: unknown) {
    return { error: String(e) };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#17212b', color: '#fff', gap: 12, padding: 24,
        }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Ошибка рендера</div>
          <div style={{
            fontSize: 11, color: 'rgba(255,255,255,0.5)', wordBreak: 'break-all',
            background: 'rgba(255,0,0,0.1)', padding: 12, borderRadius: 8,
            maxWidth: 320, textAlign: 'center',
          }}>
            {this.state.error}
          </div>
          <button onClick={() => window.location.reload()} style={{
            marginTop: 8, padding: '8px 24px', borderRadius: 8, border: 'none',
            background: '#0098EA', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            Перезагрузить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { BalanceBar } from './components/BalanceBar';
import { Farm }      from './pages/Farm';
import { Shop }      from './pages/Shop';
import { Dashboard } from './pages/Dashboard';
import { Market }      from './pages/Market';
import { Company }     from './pages/Company';
import { Leaderboard } from './pages/Leaderboard';

type Tab = 'farm' | 'shop' | 'dashboard' | 'market' | 'company' | 'leaderboard';

const TABS: { id: Tab; emoji: string; label: string }[] = [
  { id: 'dashboard',   emoji: '📊', label: 'Стата'   },
  { id: 'farm',        emoji: '🏭', label: 'Ферма'   },
  { id: 'shop',        emoji: '🛒', label: 'Магазин' },
  { id: 'market',      emoji: '🔄', label: 'Маркет'  },
  { id: 'leaderboard', emoji: '🏆', label: 'Топ'     },
  { id: 'company',     emoji: '🏢', label: 'Компания'},
];

export default function App() {
  const [tab, setTab] = useState<Tab>('farm');
  const isInTelegram  = Boolean(WebApp.initData);
  const { data, loading, error, retrying, sync } = useSync();

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
  }, []);

  const switchTab = (id: Tab) => {
    WebApp.HapticFeedback.selectionChanged();
    setTab(id);
  };

  if (!isInTelegram) return (
    <Splash
      text="Открой через Telegram"
      sub={'Найди бота @Syndicate_miner_bot и нажми «Играть»'}
    />
  );

  if (loading || retrying) return (
    <Splash
      text={retrying ? 'Подключаемся к серверу...' : 'Загружаем ферму...'}
      sub={retrying ? 'Сервер просыпается, подождите ~30 сек' : undefined}
    />
  );
  if (error || !data) return (
    <Splash
      text="Нет соединения с сервером"
      sub={error ?? ''}
      retry={sync}
    />
  );

  if (!data.user || !data.farm) return (
    <Splash
      text="Данные не загружены"
      sub={`user=${JSON.stringify(data.user)?.slice(0,60)}`}
      retry={sync}
    />
  );

  return (
  <ErrorBoundary>
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: '#17212b', color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* Balance header */}
      <BalanceBar user={data.user} />

      {/* Page content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 70 }}>
        {tab === 'dashboard' && <Dashboard data={data} onUpdate={sync} />}
        {tab === 'farm'      && <Farm      data={data} onUpdate={sync} onSwitchTab={(t) => switchTab(t as any)} />}
        {tab === 'shop'      && <Shop      data={data} onUpdate={sync} />}
        {tab === 'market'      && <Market      data={data} onUpdate={sync} />}
        {tab === 'leaderboard' && <Leaderboard />}
        {tab === 'company'     && <Company     data={data} />}
      </div>

      {/* Bottom nav */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        display: 'flex',
        background: 'rgba(15,25,35,0.97)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            style={{
              flex: 1, padding: '8px 0 6px', border: 'none',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              color: tab === t.id ? '#0098EA' : 'rgba(255,255,255,0.35)',
              transition: 'color 0.15s',
            }}
          >
            <span style={{ fontSize: 20 }}>{t.emoji}</span>
            <span style={{ fontSize: 10, fontWeight: tab === t.id ? 600 : 400 }}>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  </ErrorBoundary>
  );
}

function Splash({ text, sub, retry }: { text: string; sub?: string; retry?: () => void }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#17212b', color: '#fff', gap: 12,
    }}>
      <div style={{ fontSize: 40 }}>⛏️</div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{text}</div>
      {sub && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', maxWidth: 260, padding: '0 20px' }}>{sub}</div>}
      {retry && (
        <button onClick={retry} style={{
          marginTop: 8, padding: '8px 24px', borderRadius: 8, border: 'none',
          background: '#0098EA', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
          Повторить
        </button>
      )}
    </div>
  );
}
