import { useState, useEffect, useCallback, useRef, Component } from 'react';
import type { ReactNode } from 'react';
import WebApp from '@twa-dev/sdk';
import { useSync } from './hooks/useSync';
import { useLang } from './LangContext';

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
      return <ErrorDisplay error={this.state.error} />;
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
import { Guide }       from './pages/Guide';

type Tab = 'farm' | 'dashboard' | 'market' | 'company' | 'leaderboard' | 'syndicate' | 'guide';

// TABS defined inside App to pick up translations

export default function App() {
  const [tab, setTab] = useState<Tab>('farm');
  const isInTelegram  = Boolean(WebApp.initData);
  const { data, loading, error, retrying, sync } = useSync();
  const { t } = useLang();
  // displayMode: мгновенно меняется при действии, сбрасывается при следующем sync с сервера
  const [optimisticMode, setOptimisticMode] = useState<'pool' | 'solo' | null>(null);
  const optimisticSetAt = useRef(0);

  const setOptMode = useCallback((m: 'pool' | 'solo' | null) => {
    if (m !== null) optimisticSetAt.current = Date.now();
    setOptimisticMode(m);
  }, []);

  // Сбрасываем оптимистик при каждом свежем ответе сервера (≥2с после установки)
  useEffect(() => {
    if (!optimisticMode || !data) return;
    if (Date.now() - optimisticSetAt.current >= 2000) setOptimisticMode(null);
  }, [data, optimisticMode]);

  const TABS: { id: Tab; emoji: string; label: string }[] = [
    { id: 'dashboard',   emoji: '📊', label: t.tab_dashboard   },
    { id: 'farm',        emoji: '🏭', label: t.tab_farm        },
    { id: 'syndicate',   emoji: '⚔️', label: t.tab_syndicate   },
    { id: 'market',      emoji: '🔄', label: t.tab_market      },
    { id: 'leaderboard', emoji: '🏆', label: t.tab_leaderboard },
    { id: 'company',     emoji: '🏢', label: t.tab_company     },
    { id: 'guide',       emoji: '📖', label: t.tab_guide       },
  ];

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
    <Splash text={t.open_telegram} sub={t.open_telegram_sub} />
  );

  if (loading || retrying) return (
    <LoadingSplash retrying={retrying} />
  );
  if (error || !data) return (
    <Splash text={t.no_connection} sub={error ?? ''} retry={sync} retryLabel={t.retry} />
  );

  if (!data.user || !data.farm) return (
    <Splash
      text={t.data_not_loaded}
      sub={`user=${JSON.stringify(data.user)?.slice(0,60)}`}
      retry={sync} retryLabel={t.retry}
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
        @keyframes radar-ping {
          0%   { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(3.5); opacity: 0; }
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
        <BalanceBar user={data.user} optimisticMode={optimisticMode} />

        {/* Page content — анимация при смене вкладки */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 70 }}>
          <div key={tab} style={{ animation: 'page-in 0.22s ease-out' }}>
            {tab === 'dashboard' && <Dashboard data={data} onUpdate={sync} optimisticMode={optimisticMode} setOptimisticMode={setOptMode} />}
            {tab === 'farm'      && <Farm      data={data} onUpdate={sync} />}
            {tab === 'market'      && <Market      data={data} onUpdate={sync} />}
            {tab === 'syndicate'   && <Syndicate   data={data} onUpdate={sync} setOptimisticMode={setOptMode} />}
            {tab === 'leaderboard' && <Leaderboard />}
            {tab === 'company'     && <Company     data={data} />}
            {tab === 'guide'       && <Guide />}
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
          {TABS.map(tb => {
            const active = tab === tb.id;
            return (
              <button
                key={tb.id}
                onClick={() => switchTab(tb.id)}
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
                <span style={{ fontSize: 20 }}>{tb.emoji}</span>
                <span style={{
                  fontSize: 10,
                  fontWeight: active ? 700 : 400,
                  letterSpacing: active ? 0.5 : 0,
                  animation: active ? 'tab-glow 2.5s ease-in-out infinite' : 'none',
                }}>
                  {tb.label}
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

// ── ErrorBoundary fallback (functional, can use hooks) ────
function ErrorDisplay({ error }: { error: string }) {
  const { t } = useLang();
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#17212b', color: '#fff', gap: 12, padding: 24,
    }}>
      <div style={{ fontSize: 32 }}>⚠️</div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{t.render_error}</div>
      <div style={{
        fontSize: 11, color: 'rgba(255,255,255,0.5)', wordBreak: 'break-all',
        background: 'rgba(255,0,0,0.1)', padding: 12, borderRadius: 8,
        maxWidth: 320, textAlign: 'center',
      }}>
        {error}
      </div>
      <button onClick={() => window.location.reload()} style={{
        marginTop: 8, padding: '8px 24px', borderRadius: 8, border: 'none',
        background: '#0098EA', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
      }}>
        {t.reload}
      </button>
    </div>
  );
}

// ── Экран загрузки с прогресс-баром ─────────────────────
function LoadingSplash({ retrying }: { retrying: boolean }) {
  const { t } = useLang();
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
    const loadSteps = [
      { pct: 20, label: t.load_connecting },
      { pct: 45, label: t.load_farm       },
      { pct: 70, label: t.load_gpu        },
      { pct: 88, label: t.load_almost     },
    ];
    const retrySteps = [
      { pct: 10, label: t.load_server_waking },
      { pct: 40, label: t.load_waiting       },
      { pct: 75, label: t.load_ready         },
    ];
    const steps = retrying ? retrySteps : loadSteps;
    let idx = 0;
    for (let i = 0; i < steps.length; i++) { if (pct >= steps[i].pct) idx = i; }
    setStepIdx(idx);
  }, [pct, retrying, t]);

  // Мигающие точки
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(id);
  }, []);

  const loadSteps = [
    { pct: 20, label: t.load_connecting },
    { pct: 45, label: t.load_farm       },
    { pct: 70, label: t.load_gpu        },
    { pct: 88, label: t.load_almost     },
  ];
  const retrySteps = [
    { pct: 10, label: t.load_server_waking },
    { pct: 40, label: t.load_waiting       },
    { pct: 75, label: t.load_ready         },
  ];
  const steps = retrying ? retrySteps : loadSteps;
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
        color: 'rgba(0,212,255,0.5)', marginBottom: 14,
      }}>
        MINER
      </div>

      {/* Бета-бейдж */}
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: 2,
        color: '#FF6B35',
        background: 'rgba(255,107,53,0.1)',
        border: '1px solid rgba(255,107,53,0.35)',
        borderRadius: 6, padding: '3px 10px',
        marginBottom: 28,
      }}>
        BETA
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
          {t.server_starting}<br />
          <span style={{ color: 'rgba(140,210,255,0.55)' }}>{t.server_starting_sub}</span>
        </div>
      )}
    </div>
  );
}

function Splash({ text, sub, retry, retryLabel }: { text: string; sub?: string; retry?: () => void; retryLabel?: string }) {
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
          {retryLabel ?? 'RETRY'}
        </button>
      )}
    </div>
  );
}
