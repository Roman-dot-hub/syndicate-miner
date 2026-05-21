import { useState, useEffect, useCallback, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import type { SyncData } from '../types';

const API_URL       = import.meta.env.VITE_API_URL ?? '';
const SYNC_INTERVAL = 2000;
const MAX_RETRIES   = 4;
const RETRY_DELAY   = 4000; // ms between retries

async function fetchSync(initDataStr: string): Promise<SyncData> {
  const res = await fetch(`${API_URL}/api/sync`, {
    headers: { 'X-TG-Init-Data': initDataStr },
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

  const sync = useCallback(async () => {
    if (!initData.current) { setLoading(false); return; }

    try {
      const snapshot = await fetchSync(initData.current);
      setData(snapshot);
      setError(null);
      retryCount.current = 0;
      setRetrying(false);
    } catch (e) {
      // Если данные уже есть — не показываем ошибку (временный сбой)
      if (data) return;

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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Пингуем /health сразу — Render начинает просыпаться пока грузится страница
    fetch(`${API_URL}/health`).catch(() => {});
    sync();
    const id = setInterval(sync, SYNC_INTERVAL);
    return () => clearInterval(id);
  }, [sync]);

  return { data, loading, error, retrying, sync };
}
