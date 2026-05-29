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
    <>
      {/* ── Глобальные CSS анимации ── */}
      <style>{`
        @keyframes hero-glow {
          0%,100% { box-shadow: 0 0 20px rgba(0,212,255,0.10), inset 0 1px 0 rgba(0,212,255,0.12); }
          50%      { box-shadow: 0 0 40px rgba(0,212,255,0.25), inset 0 1px 0 rgba(0,212,255,0.25); }
        }
        @keyframes pulse-dot {
          0%,100% { transform: scale(1);   opacity: 1; }
          50%      { transform: scale(1.4); opacity: 0.7; }
        }
        @keyframes scan-bar {
          0%   { transform: translateX(-100%); opacity: 0.6; }
          100% { transform: translateX(500%);  opacity: 0; }
        }
        @keyframes cyber-load {
          0%   { box-shadow: 0 0 8px rgba(0,212,255,0.3); }
          50%  { box-shadow: 0 0 20px rgba(0,212,255,0.7); }
          100% { box-shadow: 0 0 8px rgba(0,212,255,0.3); }
        }
        @keyframes tab-glow {
          0%,100% { text-shadow: 0 0 6px rgba(0,212,255,0.4); }
          50%      { text-shadow: 0 0 12px rgba(0,212,255,0.9); }
        }
        @keyframes page-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes gpu-active {
          0%,100% { box-shadow: 0 0 0px rgba(0,212,255,0);    border-color: rgba(0,212,255,0.25); }
          50%      { box-shadow: 0 0 12px rgba(0,212,255,0.2); border-color: rgba(0,212,255,0.5); }
        }
        @keyframes gpu-broken {
          0%,100% { box-shadow: 0 0 0px rgba(255,51,85,0);    border-color: rgba(255,51,85,0.5); }
          50%      { box-shadow: 0 0 14px rgba(255,51,85,0.35); border-color: rgba(255,51,85,0.9); }
        }
        @keyframes gpu-broken-icon {
          0%,100% { transform: scale(1)   rotate(0deg); }
          25%      { transform: scale(1.2) rotate(-8deg); }
          75%      { transform: scale(1.2) rotate(8deg); }
        }
        @keyframes gpu-sweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes oc-pulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.5; }
        }
        * { box-sizing: border-box; }
        body { background: #060D1A !important; }
      `}</style>

      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        background: '#060D1A', color: '#E0F0FF',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        {/* Balance header */}
        <BalanceBar user={data.user} />

        {/* Page content — анимация при смене вкладки */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 70 }}>
          <div key={tab} style={{ animation: 'page-in 0.22s ease-out' }}>
            {tab === 'dashboard' && <Dashboard data={data} onUpdate={sync} />}
            {tab === 'farm'      && <Farm      data={data} onUpdate={sync} />}
            {tab === 'market'      && <Market      data={data} onUpdate={sync} />}
            {tab === 'syndicate'   && <Syndicate   data={data} onUpdate={sync} />}
            {tab === 'leaderboard' && <Leaderboard />}
            {tab === 'company'     && <Company     data={data} />}
          </div>
        </div>

        {/* Bottom nav — cyberpunk */}
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          display: 'flex',
          background: 'rgba(4,9,20,0.97)',
          borderTop: '1px solid rgba(0,212,255,0.15)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          backdropFilter: 'blur(12px)',
        }}>
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => switchTab(t.id)}
                style={{
                  flex: 1, padding: '8px 0 6px', border: 'none',
                  background: 'transparent', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  color: active ? '#00D4FF' : 'rgba(140,210,255,0.35)',
                  transition: 'color 0.15s',
                  position: 'relative',
                }}
              >
                {active && (
                  <div style={{
                    position: 'absolute', top: 0, left: '20%', right: '20%', height: 2,
                    background: '#00D4FF',
                    boxShadow: '0 0 8px #00D4FF, 0 0 16px rgba(0,212,255,0.5)',
                    borderRadius: '0 0 2px 2px',
                  }} />
                )}
                <span style={{ fontSize: 20 }}>{t.emoji}</span>
                <span style={{
                  fontSize: 10,
                  fontWeight: active ? 700 : 400,
                  letterSpacing: active ? 0.5 : 0,
                  animation: active ? 'tab-glow 2.5s ease-in-out infinite' : 'none',
                }}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </>
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
      background: '#060D1A', color: '#E0F0FF', padding: '0 32px',
    }}>
      {/* Иконка с cyber-glow */}
      <div style={{
        fontSize: 60, marginBottom: 8,
        filter: 'drop-shadow(0 0 20px rgba(0,212,255,0.8))',
        animation: 'cyber-load 2s ease-in-out infinite',
      }}>
        🖥️
      </div>

      {/* Заголовок */}
      <div style={{
        fontSize: 22, fontWeight: 900, letterSpacing: 3,
        color: '#00D4FF',
        textShadow: '0 0 20px rgba(0,212,255,0.8)',
        marginBottom: 4,
      }}>
        SYNDICATE
      </div>
      <div style={{
        fontSize: 13, fontWeight: 400, letterSpacing: 6,
        color: 'rgba(0,212,255,0.5)', marginBottom: 32,
      }}>
        MINER
      </div>

      {/* Шаг загрузки */}
      <div style={{ fontSize: 11, color: 'rgba(140,210,255,0.5)', marginBottom: 14, letterSpacing: 1, minHeight: 16 }}>
        {stepLabel}{dots}
      </div>

      {/* Прогресс-бар */}
      <div style={{ width: '100%', maxWidth: 260 }}>
        <div style={{
          height: 3, background: 'rgba(0,212,255,0.08)',
          borderRadius: 2, overflow: 'hidden',
          border: '1px solid rgba(0,212,255,0.15)',
        }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${pct}%`,
            background: 'linear-gradient(90deg, rgba(0,212,255,0.4), #00D4FF)',
            transition: 'width 0.3s ease',
            boxShadow: '0 0 10px rgba(0,212,255,0.8)',
          }} />
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: 6, fontSize: 9, letterSpacing: 1.5,
          color: 'rgba(0,212,255,0.3)',
        }}>
          <span>SYN-MINER v1.0</span>
          <span>{pct}%</span>
        </div>
      </div>

      {retrying && (
        <div style={{
          marginTop: 28, fontSize: 10, letterSpacing: 1,
          color: 'rgba(140,210,255,0.35)', textAlign: 'center', lineHeight: 1.8,
        }}>
          СЕРВЕР ЗАПУСКАЕТСЯ<br />
          <span style={{ color: 'rgba(140,210,255,0.55)' }}>обычно ~30 секунд</span>
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
      background: '#060D1A', color: '#E0F0FF', gap: 12, padding: '0 24px',
    }}>
      <div style={{ fontSize: 40, filter: 'drop-shadow(0 0 12px rgba(0,212,255,0.5))' }}>🖥️</div>
      <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1, color: '#00D4FF', textAlign: 'center' }}>{text}</div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(140,210,255,0.4)', textAlign: 'center', maxWidth: 260, lineHeight: 1.6 }}>{sub}</div>}
      {retry && (
        <button onClick={retry} style={{
          marginTop: 8, padding: '10px 28px', borderRadius: 8,
          border: '1px solid rgba(0,212,255,0.4)',
          background: 'rgba(0,212,255,0.1)',
          color: '#00D4FF', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: 1,
        }}>
          ПОВТОРИТЬ
        </button>
      )}
    </div>
  );
}
