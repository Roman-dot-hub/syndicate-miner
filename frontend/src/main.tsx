import React from 'react';
import ReactDOM from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { LangProvider } from './LangContext';
import App from './App';

// Global error display — shown even if React fails to mount
function showFatalError(msg: string) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;flex-direction:column;
        align-items:center;justify-content:center;background:#17212b;
        color:#fff;gap:12px;padding:24px;font-family:sans-serif">
        <div style="font-size:32px">💥</div>
        <div style="font-size:15px;font-weight:600">Критическая ошибка</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.5);word-break:break-all;
          background:rgba(255,0,0,0.15);padding:12px;border-radius:8px;
          max-width:320px;text-align:center">${msg}</div>
        <button onclick="location.reload()"
          style="margin-top:8px;padding:8px 24px;border-radius:8px;border:none;
          background:#0098EA;color:#fff;font-size:14px;font-weight:600;cursor:pointer">
          Перезагрузить
        </button>
      </div>`;
  }
}

window.addEventListener('error', (e) => showFatalError(e.message ?? String(e)));
window.addEventListener('unhandledrejection', (e) => showFatalError(String(e.reason)));

try {
  const manifestUrl = import.meta.env.VITE_TON_MANIFEST_URL
    ?? `${window.location.origin}/tonconnect-manifest.json`;

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <LangProvider>
        <TonConnectUIProvider manifestUrl={manifestUrl}>
          <App />
        </TonConnectUIProvider>
      </LangProvider>
    </React.StrictMode>,
  );
} catch (e: unknown) {
  showFatalError(String(e));
}
