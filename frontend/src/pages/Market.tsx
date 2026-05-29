import { useState, useEffect, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import type { SyncData } from '../types';
import { useAction } from '../hooks/useAction';

/** Плавно анимирует число от предыдущего значения к новому при каждом изменении target */
function useAnimatedNumber(target: number, duration = 1500): number {
  const [displayed, setDisplayed] = useState(target);
  const rafRef   = useRef<number>();
  const fromRef  = useRef(target);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    fromRef.current  = displayed;
    startRef.current = null;

    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const t = Math.min((ts - startRef.current) / duration, 1);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      setDisplayed(fromRef.current + (target - fromRef.current) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return displayed;
}

interface Props { data: SyncData; onUpdate: () => void }

function fmtNum(n: number, dec = 0): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(dec);
}

function ratioColor(ratio: number): string {
  if (ratio >= 2.0) return '#E74C3C';
  if (ratio >= 1.2) return '#F39C12';
  if (ratio <= 0.5) return '#2ECC71';
  if (ratio <= 0.8) return '#0098EA';
  return '#2ECC71';
}

function ratioLabel(ratio: number): string {
  if (ratio >= 2.0) return 'Критический профицит';
  if (ratio >= 1.2) return 'Лёгкий профицит';
  if (ratio <= 0.5) return 'Критический дефицит';
  if (ratio <= 0.8) return 'Лёгкий дефицит';
  return 'Здоровый рынок';
}

export function Market({ data, onUpdate }: Props) {
  const { action } = useAction();

  const rawUser      = data.user as any;
  const tonBalance   = parseFloat(rawUser.tonBalance ?? rawUser.ton_balance ?? '0');
  const igcBalance   = parseFloat(rawUser.igcBalance ?? rawUser.igc_balance ?? '0');
  const supply       = data.igcSupply;

  const ratioRaw     = supply?.ratio       ?? 1;
  const priceRaw     = supply?.pricePerIgc ?? 0.0001;

  // Плавная анимация: число едет от старого к новому при каждом sync-апдейте
  const ratio       = useAnimatedNumber(ratioRaw, 1800);
  const pricePerIgc = useAnimatedNumber(priceRaw, 1800);

  const [sellAmt, setSellAmt]   = useState('');
  const [busySell, setBusySell] = useState(false);
  const [buyAmt,  setBuyAmt]    = useState('');
  const [busyBuy, setBuyBusy]   = useState(false);

  const sellIgc = parseFloat(sellAmt) || 0;
  const sellTon = sellIgc * pricePerIgc;
  const buyTon  = parseFloat(buyAmt) || 0;
  const buyIgc  = buyTon / pricePerIgc;

  const doSell = async () => {
    if (sellIgc < 100) { WebApp.showAlert('Минимум 100 IGC'); return; }
    if (sellIgc > igcBalance) { WebApp.showAlert('Недостаточно IGC'); return; }
    WebApp.showConfirm(
      `Продать ${sellIgc.toFixed(0)} IGC за ${sellTon.toFixed(4)} TON?\n\nЦена: ${pricePerIgc.toFixed(6)} TON/IGC`,
      async (ok) => {
        if (!ok) return;
        setBusySell(true);
        try {
          await action('sell_igc', { amount_igc: sellIgc });
          onUpdate();
          setSellAmt('');
          WebApp.HapticFeedback.notificationOccurred('success');
        } catch (e) { WebApp.showAlert(String(e)); }
        finally { setBusySell(false); }
      },
    );
  };

  const doBuy = async () => {
    if (buyTon < 0.001) { WebApp.showAlert('Минимум 0.001 TON'); return; }
    if (buyTon > tonBalance) { WebApp.showAlert('Недостаточно TON'); return; }
    WebApp.showConfirm(
      `Купить ~${fmtNum(buyIgc, 0)} IGC за ${buyTon.toFixed(4)} TON?\n\nЦена: ${pricePerIgc.toFixed(6)} TON/IGC`,
      async (ok) => {
        if (!ok) return;
        setBuyBusy(true);
        try {
          await action('buy_igc', { amount_ton: buyTon });
          onUpdate();
          setBuyAmt('');
          WebApp.HapticFeedback.notificationOccurred('success');
        } catch (e) { WebApp.showAlert(String(e)); }
        finally { setBuyBusy(false); }
      },
    );
  };

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Заголовок */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(155,89,182,0.15), rgba(0,152,234,0.12))',
        borderRadius: 16, padding: '14px 16px',
        border: '1px solid rgba(155,89,182,0.2)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 2 }}>🔄 IGC Маркет</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
          Обмен между IGC и TON по рыночному курсу
        </div>
      </div>

      {/* Индекс рынка */}
      <div style={panel}>
        <div style={secLabel}>Индекс рынка IGC</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '10px 0' }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: ratioColor(ratio) }}>
              {ratio.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: ratioColor(ratio), fontWeight: 600 }}>
              {ratioLabel(ratio)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#F39C12' }}>
              {pricePerIgc.toFixed(6)}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>TON за 1 IGC</div>
          </div>
        </div>

        {/* Ratio progress bar */}
        <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 3,
            width: `${Math.min(100, (ratio / 2.5) * 100)}%`,
            background: `linear-gradient(90deg, #2ECC71, ${ratioColor(ratio)})`,
            transition: 'width 0.4s',
          }} />
          <div style={{ position: 'absolute', left: '20%', top: 0, height: '100%', width: 1, background: 'rgba(255,255,255,0.25)' }} />
          <div style={{ position: 'absolute', left: '40%', top: 0, height: '100%', width: 1, background: 'rgba(255,255,255,0.25)' }} />
          <div style={{ position: 'absolute', left: '80%', top: 0, height: '100%', width: 1, background: 'rgba(255,255,255,0.25)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>
          <span>↑ цена (дефицит)</span>
          <span>1.0 норма</span>
          <span>(профицит) ↓ цена</span>
        </div>
      </div>

      {/* Балансы */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={balChip}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Мой TON</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0098EA' }}>{tonBalance.toFixed(3)}</div>
        </div>
        <div style={balChip}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Мой IGC</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#9B59B6' }}>{fmtNum(igcBalance, 0)}</div>
        </div>
      </div>

      {/* Продать IGC */}
      <div style={panel}>
        <div style={secLabel}>📤 Продать IGC → TON</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            type="number"
            value={sellAmt}
            onChange={e => setSellAmt(e.target.value)}
            placeholder="Кол-во IGC (мин. 100)"
            style={inputStyle}
          />
          <button onClick={() => setSellAmt(String(Math.floor(igcBalance)))} style={maxBtn}>MAX</button>
        </div>
        {sellIgc >= 100 && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            Получишь: <span style={{ color: '#0098EA', fontWeight: 700 }}>{sellTon.toFixed(4)} TON</span>
          </div>
        )}
        <button
          onClick={doSell}
          disabled={busySell || sellIgc < 100 || sellIgc > igcBalance}
          style={{ ...actionBtn('#9B59B6', busySell || sellIgc < 100 || sellIgc > igcBalance), marginTop: 10 }}
        >
          {busySell ? '⏳ Продажа...' : '📤 Продать IGC'}
        </button>
      </div>

      {/* Купить IGC */}
      <div style={panel}>
        <div style={secLabel}>📥 Купить IGC за TON</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            type="number"
            value={buyAmt}
            onChange={e => setBuyAmt(e.target.value)}
            placeholder="Кол-во TON (мин. 0.001)"
            style={inputStyle}
          />
          <button onClick={() => setBuyAmt(tonBalance.toFixed(3))} style={maxBtn}>MAX</button>
        </div>
        {buyTon >= 0.001 && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            Получишь: <span style={{ color: '#9B59B6', fontWeight: 700 }}>~{fmtNum(buyIgc, 0)} IGC</span>
          </div>
        )}
        <button
          onClick={doBuy}
          disabled={busyBuy || buyTon < 0.001 || buyTon > tonBalance}
          style={{ ...actionBtn('#0098EA', busyBuy || buyTon < 0.001 || buyTon > tonBalance), marginTop: 10 }}
        >
          {busyBuy ? '⏳ Покупка...' : '📥 Купить IGC'}
        </button>
      </div>

      {/* Как формируется цена */}
      <div style={{ ...panel, background: 'rgba(255,255,255,0.03)' }}>
        <div style={secLabel}>📖 Как работает цена</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, marginTop: 6 }}>
          Цена IGC = <b style={{ color: '#F39C12' }}>0.0001 TON ÷ ratio</b><br />
          При дефиците (мало IGC в сети) — цена растёт, продавать выгоднее.<br />
          При профиците (много IGC) — цена падает, покупать дешевле.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 8 }}>
          {[
            { label: 'Дефицит 0.5', price: '0.000200', color: '#2ECC71' },
            { label: 'Норма 1.0',   price: '0.000100', color: '#F39C12' },
            { label: 'Профицит 2.0',price: '0.000050', color: '#E74C3C' },
          ].map(ex => (
            <div key={ex.label} style={{ textAlign: 'center', padding: '6px 4px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>{ex.label}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: ex.color }}>{ex.price}</div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)' }}>TON/IGC</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 8 }} />
    </div>
  );
}


const balChip: React.CSSProperties = {
  flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 12,
  padding: '10px 14px', border: '1px solid rgba(255,255,255,0.08)',
};
const panel: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '12px 14px',
  border: '1px solid rgba(255,255,255,0.08)',
};
const secLabel: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)',
};
const inputStyle: React.CSSProperties = {
  flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10, padding: '9px 12px', color: '#fff', fontSize: 13, outline: 'none',
};
const maxBtn: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)',
  fontSize: 11, fontWeight: 700,
};
function actionBtn(color: string, disabled: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '11px 0', borderRadius: 11, border: 'none',
    background: disabled ? 'rgba(255,255,255,0.07)' : color,
    color: disabled ? 'rgba(255,255,255,0.3)' : '#fff',
    fontSize: 13, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
  };
}
