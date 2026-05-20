import { useRef } from 'react';
import WebApp from '@twa-dev/sdk';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export function useAction() {
  const initData = useRef(WebApp.initData);

  const action = async (type: string, payload?: Record<string, unknown>) => {
    WebApp.HapticFeedback.impactOccurred('medium');

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (initData.current) {
      headers['X-TG-Init-Data'] = initData.current;
    } else {
      headers['X-Dev-User-Id'] = '1';
    }

    const res = await fetch(`${API_URL}/api/action`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({ type, ...payload }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `action ${res.status}`);
    return json;
  };

  return { action };
}
