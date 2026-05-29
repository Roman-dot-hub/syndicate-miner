import { useState, useEffect, useCallback, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import type { SyncData } from '../types';

const API_URL       = import.meta.env.VITE_API_URL ?? '';
const SYNC_INTERVAL = 6000;  // 6s — достаточно свежо, не перегружает сервер
const MAX_RETRIES   = 4;
const RETRY_DELAY   = 4000; // ms between retries

// Читаем start_param один раз при загрузке модуля.
// Формат: "ref_<tgUserId>" (из t.me deep link) → обрезаем "ref_" → остаётся tg_user_id
const _sp    = WebApp.initDataUnsafe?.start_param ?? '';
const REF_ID = _sp ? (_sp.startsWith('ref_') ? _sp.slice(4) : _sp) : undefined;

async function fetchSync(initDataStr: string, refId?: string): Promise<SyncData> {
  const query = refId ? `?ref=${encodeURIComponent(refId)}` : '';
  const res = await fetch(`${API_URL}/api/sync${query}`, {
    headers: { 'X-TG-Init-Data': initDataStr },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg  = (body as any).detail ?? (body as any).error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const json = await res.json() as { ok: boolean; data: SyncData };
  return json.data;
}

export function useSync() {
  const [data, setData]         = useState<SyncData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const initData                = useRef(WebApp.initData);
  const retryCount              = useRef(0);
  const syncing                 = useRef(false); // защита от параллельных запросов
  const hasData                 = useRef(false); // есть ли хоть один успешный ответ

  const sync = useCallback(async () => {
    if (!initData.current) { setLoading(false); return; }
    if (syncing.current) return; // уже идёт запрос — пропускаем
    syncing.current = true;

    try {
      const snapshot = await fetchSync(initData.current, REF_ID);
      hasData.current = true;
      setData(snapshot);
      setError(null);
      retryCount.current = 0;
      setRetrying(false);
    } catch (e) {
      // Если данные уже есть — тихий сбой, не мешаем UI
      if (hasData.current) return; // finally всё равно сбросит syncing

      if (retryCount.current < MAX_RETRIES) {
        retryCount.current += 1;
        setRetrying(true);
        setTimeout(sync, RETRY_DELAY);
      } else {
        setError(String(e));
        setRetrying(false);
      }
    } finally {
      setLoading(false);
      syncing.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Пингуем /health сразу — Render начинает просыпаться пока грузится страница
    fetch(`${API_URL}/health`).catch(() => {});
    sync();
    const id = setInterval(sync, SYNC_INTERVAL);

    // Принудительный sync когда приложение возвращается из фона
    // (мобильный Telegram приостанавливает JS, setInterval не тикает)
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sync]);

  return { data, loading, error, retrying, sync };
}
