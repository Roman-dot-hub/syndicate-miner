import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { useSync } from './hooks/useSync';
import { BalanceBar } from './components/BalanceBar';
import { Farm }      from './pages/Farm';
import { Shop }      from './pages/Shop';
import { Dashboard } from './pages/Dashboard';
import { Market }    from './pages/Market';
import { Company }   from './pages/Company';

type Tab = 'farm' | 'shop' | 'dashboard' | 'market' | 'company';

const TABS: { id: Tab; emoji: string; label: string }[] = [
  { id: 'dashboard', emoji: '📊', label: 'Стата'    },
  { id: 'farm',      emoji: '🏭', label: 'Ферма'    },
  { id: 'shop',      emoji: '🛒', label: 'Магазин'  },
  { id: 'market',    emoji: '🔄', label: 'Маркет'   },
  { id: 'company',   emoji: '🏢', label: 'Компания' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('farm');
  const { data, loading, error, sync } = useSync();

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
  }, []);

  const switchTab = (id: Tab) => {
    WebApp.HapticFeedback.selectionChanged();
    setTab(id);
  };

  if (loading) return <Splash text="Загружаем ферму..." />;
  if (error || !data) return <Splash text="Нет соединения с сервером" sub={error ?? ''} />;

  return (
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
        {tab === 'farm'      && <Farm      data={data} onUpdate={sync} />}
        {tab === 'shop'      && <Shop      data={data} onUpdate={sync} />}
        {tab === 'market'    && <Market    data={data} onUpdate={sync} />}
        {tab === 'company'   && <Company   data={data} />}
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
  );
}

function Splash({ text, sub }: { text: string; sub?: string }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#17212b', color: '#fff', gap: 12,
    }}>
      <div style={{ fontSize: 40 }}>⛏️</div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{text}</div>
      {sub && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{sub}</div>}
    </div>
  );
}
