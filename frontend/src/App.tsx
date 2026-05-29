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
import { Dashboard } from './pages/Dashboard';
import { Market }      from './pages/Market';
import { Company }     from './pages/Company';
import { Leaderboard } from './pages/Leaderboard';
import { Syndicate }   from './pages/Syndicate';

type Tab = 'farm' | 'dashboard' | 'market' | 'company' | 'leaderboard' | 'syndicate';

const TABS: { id: Tab; emoji: string; label: string }[] = [
  { id: 'dashboard',   emoji: '📊', label: 'Стата'    },
  { id: 'farm',        emoji: '🏭', label: 'Ферма'    },
  { id: 'syndicate',   emoji: '⚔️', label: 'Клан'     },
  { id: 'market',      emoji: '🔄', label: 'Маркет'   },
  { id: 'leaderboard', emoji: '🏆', label: 'Топ'      },
  { id: 'company',     emoji: '🏢', label: 'Компания' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('farm');
  const isInTelegram  = Boolean(WebApp.initData);
  const { data, loading, error, retrying, sync } = useSync();

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();

    // Перехватываем необработанные ошибки от внешних SDK (Adsgram и др.)
    // чтобы они не попадали в React ErrorBoundary и не крашили приложение
    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      const msg = String(e.reason?.message ?? e.reason ?? '');
      if (msg.includes('dgram') || msg.includes('adsgram') || msg.includes('block') || msg.includes('ad')) {
        e.preventDefault(); // глушим — не крашим приложение
        console.warn('[App] Suppressed ad SDK rejection:', msg);
      }
    };
    const onError = (e: ErrorEvent) => {
      const msg = String(e.message ?? '');
      if (msg.includes('dgram') || msg.includes('adsgram')) {
        e.preventDefault();
        console.warn('[App] Suppressed ad SDK error:', msg);
      }
    };
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.removeEventListener('error', onError);
    };
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
    <LoadingSplash retrying={retrying} />
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
        {tab === 'farm'      && <Farm      data={data} onUpdate={sync} />}
        {tab === 'market'      && <Market      data={data} onUpdate={sync} />}
        {tab === 'syndicate'   && <Syndicate   data={data} onUpdate={sync} />}
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

// ── Экран загрузки с прогресс-баром ─────────────────────
const LOAD_STEPS = [
  { pct: 20, label: 'Подключение к серверу...' },
  { pct: 45, label: 'Загружаем ферму...'        },
  { pct: 70, label: 'Синхронизируем GPU...'      },
  { pct: 88, label: 'Почти готово...'            },
];

function LoadingSplash({ retrying }: { retrying: boolean }) {
  const [pct,      setPct]      = useState(0);
  const [stepIdx,  setStepIdx]  = useState(0);
  const [dots,     setDots]     = useState('');

  // Анимация прогресс-бара: быстро вначале, замедляется к концу
  useEffect(() => {
    if (retrying) {
      // При ретрае — ползёт медленно от 0 до 95% за ~30с
      const start = Date.now();
      const total = 30_000;
      let raf: number;
      const tick = () => {
        const t = Math.min((Date.now() - start) / total, 1);
        const eased = 1 - Math.pow(1 - t, 2.5); // ease-out
        setPct(Math.round(eased * 95));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    } else {
      // Фаза 1: 0→88% за 10с (ease-out-cubic)
      const start = Date.now();
      const total = 20_000;
      let raf: number;
      let interval: ReturnType<typeof setInterval>;

      const tick = () => {
        const t = Math.min((Date.now() - start) / total, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        setPct(Math.round(eased * 88));
        if (t < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          // Фаза 2: 88→99% по 1% в секунду
          let current = 88;
          interval = setInterval(() => {
            current = Math.min(current + 1, 99);
            setPct(current);
            if (current >= 99) clearInterval(interval);
          }, 1000);
        }
      };
      raf = requestAnimationFrame(tick);
      return () => { cancelAnimationFrame(raf); clearInterval(interval); };
    }
  }, [retrying]);

  // Шаги текста
  useEffect(() => {
    const steps = retrying
      ? [{ pct: 10, label: 'Сервер просыпается...' }, { pct: 40, label: 'Ждём ответа...' }, { pct: 75, label: 'Почти готов...' }]
      : LOAD_STEPS;
    let idx = 0;
    for (let i = 0; i < steps.length; i++) { if (pct >= steps[i].pct) idx = i; }
    setStepIdx(idx);
  }, [pct, retrying]);

  // Мигающие точки
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(id);
  }, []);

  const steps = retrying
    ? [{ pct: 10, label: 'Сервер просыпается...' }, { pct: 40, label: 'Ждём ответа...' }, { pct: 75, label: 'Почти готов...' }]
    : LOAD_STEPS;
  const stepLabel = steps[Math.max(0, stepIdx)]?.label ?? steps[steps.length - 1].label;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#17212b', color: '#fff', padding: '0 32px',
    }}>
      {/* Иконка */}
      <div style={{ fontSize: 52, marginBottom: 24, filter: 'drop-shadow(0 0 16px rgba(155,89,182,0.5))' }}>
        ⛏️
      </div>

      {/* Заголовок */}
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, letterSpacing: 0.3 }}>
        Syndicate Miner
      </div>

      {/* Шаг загрузки */}
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 28, minHeight: 18 }}>
        {stepLabel}{dots}
      </div>

      {/* Прогресс-бар */}
      <div style={{ width: '100%', maxWidth: 280 }}>
        <div style={{
          height: 6, background: 'rgba(255,255,255,0.08)',
          borderRadius: 3, overflow: 'hidden',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)',
        }}>
          <div style={{
            height: '100%', borderRadius: 3,
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #9B59B6, #0098EA)',
            transition: 'width 0.3s ease',
            boxShadow: '0 0 8px rgba(0,152,234,0.6)',
          }} />
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.25)',
        }}>
          <span>v1.0</span>
          <span>{pct}%</span>
        </div>
      </div>

      {retrying && (
        <div style={{
          marginTop: 24, fontSize: 11, color: 'rgba(255,255,255,0.3)',
          textAlign: 'center', lineHeight: 1.6,
        }}>
          Сервер запускается после простоя<br />
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>обычно занимает ~30 секунд</span>
        </div>
      )}
    </div>
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
