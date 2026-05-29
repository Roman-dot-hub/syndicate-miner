import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import type { TapBoost } from '../types';

const ADSGRAM_BLOCK_ID = import.meta.env.VITE_ADSGRAM_BLOCK_ID ?? '';
const VIEWS_PER_CYCLE  = 10;

// Нативный Adsgram SDK (загружен через <script> в index.html)
declare global {
  interface Window {
    Adsgram?: {
      init(opts: { blockId: string }): Promise<{
        show(): Promise<{ done: boolean }>;
        destroy(): void;
      }>;
    };
  }
}

interface Props {
  tapBoost?:       TapBoost;
  onUpdate:        () => void;
  boostEndTime:    number;
  onBoostActivate: (boostSeconds: number) => void;
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}ч ${m.toString().padStart(2, '0')}м ${s.toString().padStart(2, '0')}с`;
  if (m > 0) return `${m}м ${s.toString().padStart(2, '0')}с`;
  return `${s}с`;
}

const AD_BOOST_SEC = 300; // 5 минут на просмотр (зеркало бэкенда)

export function AdBoost({ tapBoost, onUpdate, boostEndTime, onBoostActivate }: Props) {
  const [busy, setBusy]                   = useState(false);
  const [, setTick]                       = useState(0);
  const [optimisticViews, setOptViews]    = useState(0);  // оптимистичный +1 при досмотре
  const [toast, setToast]                 = useState<string | null>(null);

  useEffect(() => {
    if (boostEndTime <= Date.now()) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [boostEndTime]);

  useEffect(() => {
    if ((tapBoost?.adCooldownSeconds ?? 0) <= 0) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [tapBoost?.adCooldownSeconds]);

  // Сброс оптимистичного счётчика когда сервер подтвердил новые данные
  useEffect(() => {
    setOptViews(0);
  }, [tapBoost?.adViewsInCycle]);

  const localSecondsLeft = Math.max(0, Math.round((boostEndTime - Date.now()) / 1000));
  const boostActive      = localSecondsLeft > 0 || (tapBoost?.active ?? false);
  const secondsLeft      = localSecondsLeft > 0 ? localSecondsLeft : (tapBoost?.secondsLeft ?? 0);

  const serverViews   = tapBoost?.adViewsInCycle    ?? 0;
  const viewsInCycle  = Math.min(serverViews + optimisticViews, tapBoost?.adViewsPerCycle ?? VIEWS_PER_CYCLE);
  const viewsPerCycle = tapBoost?.adViewsPerCycle   ?? VIEWS_PER_CYCLE;
  const cooldownSeconds = tapBoost?.adCooldownSeconds ?? 0;
  const inCooldown      = cooldownSeconds > 0;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleWatch = async () => {
    if (busy || inCooldown) return;
    setBusy(true);

    // Dev mode: нет Block ID → просто сообщаем что реклама не настроена
    if (!ADSGRAM_BLOCK_ID || !window.Adsgram) {
      WebApp.showAlert('Реклама не настроена (dev mode). Block ID: ' + (ADSGRAM_BLOCK_ID || 'не задан'));
      setBusy(false);
      return;
    }

    try {
      WebApp.expand();
    } catch { /* ignore */ }

    // Инициализируем и показываем рекламу через нативный SDK
    // Всё в try/catch — ошибки Adsgram не должны крашить приложение
    try {
      const adController = await window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
      let result: { done: boolean } | null = null;

      try {
        result = await adController.show();
      } finally {
        try { adController.destroy(); } catch { /* ignore */ }
      }

      if (result?.done) {
        // Оптимистичное обновление — мгновенная реакция до ответа сервера
        setOptViews(v => v + 1);
        onBoostActivate(AD_BOOST_SEC);         // сразу продлеваем таймер
        showToast('✅ +5 мин буста засчитано!');

        try { WebApp.expand(); } catch { /* ignore */ }
        try { WebApp.HapticFeedback.notificationOccurred('success'); } catch { /* ignore */ }

        // Синк в фон — обновит данные когда придёт ответ сервера
        onUpdate();
      }

    } catch (err: unknown) {
      // Ошибка Adsgram (нет рекламы, сессия истекла и т.д.) — просто логируем
      console.warn('[AdBoost] Adsgram error:', err);
      try { WebApp.expand(); } catch { /* ignore */ }
    } finally {
      setBusy(false);
    }
  };

  const borderColor = inCooldown
    ? 'rgba(231,76,60,0.35)'
    : boostActive
      ? 'rgba(0,152,234,0.5)'
      : 'rgba(155,89,182,0.4)';

  const bg = inCooldown
    ? 'linear-gradient(135deg, #1a0a0a, #2a1010)'
    : boostActive
      ? 'linear-gradient(135deg, #0a1a2e, #0d2240)'
      : 'linear-gradient(135deg, #1a1030, #251545)';

  return (
    <div style={{
      background: bg, borderRadius: 20, padding: 20,
      border: `1px solid ${borderColor}`,
      transition: 'all 0.3s',
    }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 32 }}>
          {inCooldown ? '🔥' : boostActive ? '⚡' : '📺'}
        </span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
            {inCooldown ? 'Перегрев! Ждём перезарядку' : 'Буст хешрейта'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
            {inCooldown
              ? 'Посмотрел все 10 — отдых 4 часа'
              : '+10% к хешрейту · 1 просмотр = +5 мин'}
          </div>
        </div>
      </div>

      {inCooldown ? (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 12,
          background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.3)',
        }}>
          <div style={{ fontSize: 10, color: '#E74C3C', marginBottom: 3, fontWeight: 600 }}>
            ⏳ Следующий цикл через
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#E74C3C', fontVariantNumeric: 'tabular-nums' }}>
            {fmtTime(cooldownSeconds)}
          </div>
          {boostActive && (
            <div style={{ fontSize: 11, color: '#0098EA', marginTop: 4 }}>
              ⚡ Буст ещё активен: {fmtTime(secondsLeft)}
            </div>
          )}
        </div>
      ) : boostActive ? (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 12,
          background: 'rgba(0,152,234,0.12)', border: '1px solid rgba(0,152,234,0.35)',
          animation: 'boostPulse 1.5s ease-in-out infinite',
        }}>
          <div style={{ fontSize: 10, color: '#0098EA', marginBottom: 3, fontWeight: 600, letterSpacing: 0.5 }}>
            ⚡ BOOST ACTIVE · +10% HASHRATE
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#0098EA', fontVariantNumeric: 'tabular-nums' }}>
            {fmtTime(secondsLeft)}
          </div>
        </div>
      ) : null}

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
          <span>Просмотров в цикле</span>
          <span style={{ color: inCooldown ? '#E74C3C' : viewsInCycle > 0 ? '#9B59B6' : 'rgba(255,255,255,0.4)' }}>
            {viewsInCycle} / {viewsPerCycle}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {Array.from({ length: viewsPerCycle }).map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 5, borderRadius: 3,
              background: i < viewsInCycle
                ? inCooldown
                  ? 'rgba(231,76,60,0.6)'
                  : 'linear-gradient(90deg, #9B59B6, #0098EA)'
                : 'rgba(255,255,255,0.07)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>
        {!inCooldown && (
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 4, textAlign: 'right' }}>
            {viewsPerCycle - viewsInCycle} просмотров до паузы · потом 4ч ожидание
          </div>
        )}
      </div>

      {/* Toast — мгновенная обратная связь после досмотра */}
      {toast && (
        <div style={{
          marginBottom: 10, padding: '8px 14px', borderRadius: 10,
          background: 'rgba(46,204,113,0.15)', border: '1px solid rgba(46,204,113,0.4)',
          fontSize: 13, fontWeight: 700, color: '#2ECC71', textAlign: 'center',
          animation: 'fadeInOut 0.3s ease',
        }}>
          {toast}
        </div>
      )}

      {!inCooldown && (
        <button
          onClick={handleWatch}
          disabled={busy}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
            cursor: busy ? 'wait' : 'pointer',
            fontSize: 14, fontWeight: 700,
            background: busy
              ? 'rgba(155,89,182,0.3)'
              : 'linear-gradient(135deg, #9B59B6, #6C3483)',
            color: '#fff',
            opacity: busy ? 0.7 : 1,
            transition: 'all 0.2s',
            boxShadow: busy ? 'none' : '0 3px 14px rgba(155,89,182,0.4)',
          }}
        >
          {busy
            ? '⏳ Загружаем рекламу...'
            : viewsInCycle === 0
              ? '▶ Смотреть рекламу (+5 мин буста)'
              : `▶ Смотреть рекламу · ещё ${viewsPerCycle - viewsInCycle} в цикле`}
        </button>
      )}

      <style>{`
        @keyframes boostPulse { 0%,100%{opacity:1} 50%{opacity:0.65} }
        @keyframes fadeInOut  { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}
