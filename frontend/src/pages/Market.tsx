import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import type { SyncData } from '../types';
import { GPU_SPECS } from '../types';
import { useAction } from '../hooks/useAction';

interface Listing {
  id:              string;
  seller_id:       string;
  gpu_model_tier:  number;
  health_at_listing: number;
  price_ton:       number;
  status:          string;
}

const API_URL = import.meta.env.VITE_API_URL ?? '';

interface Props { data: SyncData; onUpdate: () => void }

export function Market({ data, onUpdate }: Props) {
  const { action } = useAction();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState<string | null>(null);

  const fetchListings = async () => {
    try {
      const headers: Record<string, string> = {};
      const initData = window.Telegram?.WebApp?.initData;
      if (initData) headers['X-TG-Init-Data'] = initData;
      else headers['X-Dev-User-Id'] = '1';

      const res = await fetch(`${API_URL}/api/market`, { headers });
      const json = await res.json();
      setListings(json.data ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchListings(); }, []);

  const buy = async (listing: Listing) => {
    if (busy) return;
    WebApp.showConfirm(
      `Купить ${GPU_SPECS[listing.gpu_model_tier]?.name} (${Math.round(listing.health_at_listing)}% health) за ${listing.price_ton} TON?`,
      async (ok) => {
        if (!ok) return;
        setBusy(listing.id);
        try {
          await action('buy_listing', { listing_id: listing.id });
          onUpdate();
          fetchListings();
          WebApp.HapticFeedback.notificationOccurred('success');
        } catch (e) {
          WebApp.showAlert(String(e));
        } finally {
          setBusy(null);
        }
      },
    );
  };

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
        Загружаем лоты...
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
        P2P маркетплейс · {listings.length} лотов
      </div>

      {/* Мои GPU на продажу */}
      {data.gpus.length > 0 && (
        <div style={{
          background: 'rgba(155,89,182,0.1)', borderRadius: 12, padding: '10px 14px',
          border: '1px solid rgba(155,89,182,0.2)', fontSize: 12, color: 'rgba(255,255,255,0.6)',
        }}>
          💡 Чтобы выставить GPU на продажу — нажми «Ремонт» на карточке и выбери «Продать»
        </div>
      )}

      {listings.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: 48, fontSize: 13 }}>
          Лотов пока нет. Стань первым продавцом!
        </div>
      ) : (
        listings.map(listing => {
          const spec = GPU_SPECS[listing.gpu_model_tier];
          if (!spec) return null;
          const healthColor = listing.health_at_listing > 60 ? '#2ECC71'
                            : listing.health_at_listing > 30 ? '#F39C12' : '#E74C3C';
          const isOwn = listing.seller_id === data.user.id;

          return (
            <div key={listing.id} style={{
              background: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: '14px 16px',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 26 }}>{spec.emoji}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{spec.name}</div>
                    <div style={{ fontSize: 11, color: healthColor }}>
                      Health {Math.round(listing.health_at_listing)}%
                    </div>
                  </div>
                </div>
                {isOwn ? (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Мой лот</div>
                ) : (
                  <button
                    onClick={() => buy(listing)}
                    disabled={!!busy || data.user.tonBalance < listing.price_ton}
                    style={{
                      padding: '8px 14px', borderRadius: 10, border: 'none',
                      background: data.user.tonBalance >= listing.price_ton ? '#0098EA' : 'rgba(255,255,255,0.1)',
                      color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {busy === listing.id ? '...' : `${listing.price_ton} TON`}
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
