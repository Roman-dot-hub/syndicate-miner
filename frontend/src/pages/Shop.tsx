import { useState } from 'react';
import WebApp from '@twa-dev/sdk';
import type { SyncData } from '../types';
import { GPU_SPECS } from '../types';
import { useAction } from '../hooks/useAction';

interface Props { data: SyncData; onUpdate: () => void }

export function Shop({ data, onUpdate }: Props) {
  const { action } = useAction();
  const [busy, setBusy] = useState<number | null>(null);
  const phase = data.season.phase;
  const rawUser   = data.user as any;
  const tonBalance = parseFloat(rawUser.tonBalance ?? rawUser.ton_balance ?? '0');

  const buy = async (tier: number) => {
    if (busy !== null) return;
    const spec = GPU_SPECS[tier];
    WebApp.showConfirm(
      `Купить ${spec.name} за ${spec.priceTon} TON?`,
      async (ok) => {
        if (!ok) return;
        setBusy(tier);
        try {
          await action('buy_gpu', { model_tier: tier });
          onUpdate();
          WebApp.HapticFeedback.notificationOccurred('success');
        } catch (e) {
          WebApp.showAlert(String(e));
        } finally {
          setBusy(null);
        }
      },
    );
  };

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
        Доступно в Фазе {phase} · Баланс: {tonBalance.toFixed(3)} TON
      </div>

      {Object.entries(GPU_SPECS).map(([tierStr, spec]) => {
        const tier      = Number(tierStr);
        const locked    = phase < spec.availablePhase;
        const canAfford = tonBalance >= spec.priceTon;
        const isBusy    = busy === tier;

        return (
          <div key={tier} style={{
            background: locked ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14, padding: '14px 16px',
            opacity: locked ? 0.5 : 1,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 28 }}>{spec.emoji}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{spec.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                    {spec.hashrate} H/s · {spec.watt}W
                  </div>
                  {locked && (
                    <div style={{ fontSize: 11, color: '#E74C3C', marginTop: 2 }}>
                      🔒 Открывается в Фазе {spec.availablePhase}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => buy(tier)}
                disabled={locked || isBusy || !canAfford}
                style={{
                  padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: locked || !canAfford ? 'rgba(255,255,255,0.08)' : '#0098EA',
                  color: locked || !canAfford ? 'rgba(255,255,255,0.3)' : '#fff',
                  fontSize: 13, fontWeight: 700, minWidth: 80,
                }}
              >
                {isBusy ? '...' : spec.priceTon === 0 ? 'Free' : `${spec.priceTon} TON`}
              </button>
            </div>

            {/* Расчётная окупаемость для топ-тиров */}
            {tier >= 4 && !locked && (
              <div style={{
                marginTop: 8, padding: '6px 10px', borderRadius: 8,
                background: 'rgba(231,76,60,0.1)',
                fontSize: 11, color: '#E74C3C',
              }}>
                ⚠️ Потребление IGC превышает добычу. Окупаемость зависит от H_total сети.
              </div>
            )}
          </div>
        );
      })}

      {/* Инфраструктура */}
      <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>
        Инфраструктура
      </div>
      <InfraButton label="🏠 Кладовка (до 10 слотов)" cost="300 IGC" type="farm_level_2" action={action} onUpdate={onUpdate} />
      <InfraButton label="🚗 Гараж (до 20 слотов)"   cost="12 TON"  type="farm_level_3" action={action} onUpdate={onUpdate} />
      {phase >= 2 && (
        <InfraButton label="🏭 Ангар (до 50 слотов)" cost="50 TON"  type="farm_level_4" action={action} onUpdate={onUpdate} />
      )}
      <InfraButton label="❄️ Кулер Lv1"  cost="100 IGC" type="cooling_1" action={action} onUpdate={onUpdate} />
      <InfraButton label="❄️ Кулер Lv2"  cost="3 TON"   type="cooling_2" action={action} onUpdate={onUpdate} />
      <InfraButton label="❄️ Кулер Lv3"  cost="15 TON"  type="cooling_3" action={action} onUpdate={onUpdate} />
    </div>
  );
}

function InfraButton({
  label, cost, type, action, onUpdate,
}: {
  label: string; cost: string; type: string;
  action: (t: string) => Promise<unknown>; onUpdate: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const buy = () => {
    WebApp.showConfirm(`${label}\nСтоимость: ${cost}`, async (ok) => {
      if (!ok) return;
      setBusy(true);
      try {
        await action(type);
        onUpdate();
        WebApp.HapticFeedback.notificationOccurred('success');
      } catch (e) {
        WebApp.showAlert(String(e));
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '12px 14px',
      border: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <span style={{ fontSize: 13, color: '#fff' }}>{label}</span>
      <button onClick={buy} disabled={busy} style={{
        padding: '6px 12px', borderRadius: 8, border: 'none',
        background: '#9B59B6', color: '#fff',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
      }}>
        {busy ? '...' : cost}
      </button>
    </div>
  );
}
