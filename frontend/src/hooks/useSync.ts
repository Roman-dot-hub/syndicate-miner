import { useState, useEffect, useCallback, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import type { SyncData } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const SYNC_INTERVAL = 2000;

export function useSync() {
  const [data, setData]       = useState<SyncData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const initData              = useRef(WebApp.initData);

  const sync = useCallback(async () => {
    try {
      // В dev-режиме (вне Telegram) initData пустой — посылаем dev-заголовок
      const headers: Record<string, string> = {};
      if (initData.current) {
        headers['X-TG-Init-Data'] = initData.current;
      } else {
        headers['X-Dev-User-Id'] = '1';
      }

      const res = await fetch(`${API_URL}/api/sync`, { headers });
      if (!res.ok) throw new Error(`sync ${res.status}`);

      const json = await res.json() as { ok: boolean; data: SyncData };
      setData(json.data);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    sync();
    const id = setInterval(sync, SYNC_INTERVAL);
    return () => clearInterval(id);
  }, [sync]);

  return { data, loading, error, sync };
}
