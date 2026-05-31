import React, { useState, useEffect, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import type { SyncData } from '../types';
import { useAction } from '../hooks/useAction';
import { useLang } from '../LangContext';
import { fmt } from '../i18n';

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

export function Market({ data, onUpdate }: Props) {
  const { t } = useLang();
  const { action } = useAction();

  const rawUser      = data.user as any;
  const tonBalance   = parseFloat(rawUser.tonBalance ?? rawUser.ton_balance ?? '0');
  const igcBalance   = parseFloat(rawUser.igcBalance ?? rawUser.igc_balance ?? '0');
  const supply       = data.igcSupply;

  const ratioRaw     = supply?.ratio       ?? 1;
  const priceRaw     = supply?.pricePerIgc ?? 0.0001;

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

  function ratioLabel(r: number): string {
    if (r >= 2.0) return t.mkt_crit_surplus;
    if (r >= 1.2) return t.mkt_mild_surplus;
    if (r <= 0.5) return t.mkt_crit_deficit;
    if (r <= 0.8) return t.mkt_mild_deficit;
    return t.mkt_healthy;
  }

  const doSell = async () => {
    if (busySell) return;
    if (sellIgc < 100) { WebApp.showAlert('Минимум 100 IGC'); return; }
    if (sellIgc > igcBalance) { WebApp.showAlert('Недостаточно IGC'); return; }
    setBusySell(true); // блокируем кнопку сразу, до диалога
    WebApp.showConfirm(
      `Продать ${sellIgc.toFixed(0)} IGC за ${sellTon.toFixed(4)} TON?\n\nЦена: ${pricePerIgc.toFixed(6)} TON/IGC`,
      async (ok) => {
        if (!ok) { setBusySell(false); return; }
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
    if (busyBuy) return;
    if (buyTon < 0.001) { WebApp.showAlert('Минимум 0.001 TON'); return; }
    if (buyTon > tonBalance) { WebApp.showAlert('Недостаточно TON'); return; }
    setBuyBusy(true); // блокируем кнопку сразу, до диалога
    WebApp.showConfirm(
      `Купить ~${fmtNum(buyIgc, 0)} IGC за ${buyTon.toFixed(4)} TON?\n\nЦена: ${pricePerIgc.toFixed(6)} TON/IGC`,
      async (ok) => {
        if (!ok) { setBuyBusy(false); return; }
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
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{t.mkt_title}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{t.mkt_sub}</div>
      </div>

      {/* Индекс рынка */}
      <div style={panel}>
        <div style={secLabel}>{t.mkt_index}</div>

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
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{t.mkt_ton_per_igc}</div>
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
          <span>{t.mkt_deficit_up}</span>
          <span>{t.mkt_norm}</span>
          <span>{t.mkt_surplus_dn}</span>
        </div>
      </div>

      {/* Балансы */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={balChip}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{t.mkt_my_ton}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0098EA' }}>{tonBalance.toFixed(3)}</div>
        </div>
        <div style={balChip}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{t.mkt_my_igc}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#9B59B6' }}>{fmtNum(igcBalance, 0)}</div>
        </div>
      </div>

      {/* Продать IGC */}
      <div style={panel}>
        <div style={secLabel}>{t.mkt_sell_title}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            type="number"
            value={sellAmt}
            onChange={e => setSellAmt(e.target.value)}
            placeholder={t.mkt_sell_ph}
            style={inputStyle}
          />
          <button onClick={() => setSellAmt(String(Math.floor(igcBalance)))} style={maxBtn}>MAX</button>
        </div>
        {sellIgc >= 100 && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            {t.mkt_receive} <span style={{ color: '#0098EA', fontWeight: 700 }}>{sellTon.toFixed(4)} TON</span>
          </div>
        )}
        <button
          onClick={doSell}
          disabled={busySell || sellIgc < 100 || sellIgc > igcBalance}
          style={{ ...actionBtn('#9B59B6', busySell || sellIgc < 100 || sellIgc > igcBalance), marginTop: 10 }}
        >
          {busySell ? t.mkt_sell_busy : t.mkt_sell_btn}
        </button>
      </div>

      {/* Купить IGC */}
      <div style={panel}>
        <div style={secLabel}>{t.mkt_buy_title}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            type="number"
            value={buyAmt}
            onChange={e => setBuyAmt(e.target.value)}
            placeholder={t.mkt_buy_ph}
            style={inputStyle}
          />
          <button onClick={() => setBuyAmt(tonBalance.toFixed(3))} style={maxBtn}>MAX</button>
        </div>
        {buyTon >= 0.001 && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            {t.mkt_receive} <span style={{ color: '#9B59B6', fontWeight: 700 }}>~{fmtNum(buyIgc, 0)} IGC</span>
          </div>
        )}
        <button
          onClick={doBuy}
          disabled={busyBuy || buyTon < 0.001 || buyTon > tonBalance}
          style={{ ...actionBtn('#0098EA', busyBuy || buyTon < 0.001 || buyTon > tonBalance), marginTop: 10 }}
        >
          {busyBuy ? t.mkt_buy_busy : t.mkt_buy_btn}
        </button>
      </div>

      {/* Как формируется цена */}
      <div style={{ ...panel, background: 'rgba(255,255,255,0.03)' }}>
        <div style={secLabel}>{t.mkt_how_title}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, marginTop: 6 }}>
          {t.mkt_how_formula} <b style={{ color: '#F39C12' }}>0.0001 TON ÷ ratio</b><br />
          {t.mkt_how_deficit}<br />
          {t.mkt_how_surplus}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 8 }}>
          {[
            { label: t.mkt_ex_deficit, price: '0.000200', color: '#2ECC71' },
            { label: t.mkt_norm,       price: '0.000100', color: '#F39C12' },
            { label: t.mkt_ex_surplus, price: '0.000050', color: '#E74C3C' },
          ].map(ex => (
            <div key={ex.label} style={{ textAlign: 'center', padding: '6px 4px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>{ex.label}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: ex.color }}>{ex.price}</div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)' }}>TON/IGC</div>
            </div>
          ))}
        </div>
      </div>

      {/* Стейкинг TON */}
      <StakingSection data={data} onUpdate={onUpdate} pricePerIgc={pricePerIgc} />

      <div style={{ height: 8 }} />
    </div>
  );
}

// ── Секция стейкинга ─────────────────────────────────────
function StakingSection({ data, onUpdate, pricePerIgc }: { data: SyncData; onUpdate: () => void; pricePerIgc: number }) {
  const { t } = useLang();
  const { action } = useAction();
  const [stakeAmt,   setStakeAmt]   = useState('');
  const [unstakeAmt, setUnstakeAmt] = useState('');
  const [busyStake,   setBusyStake]   = useState(false);
  const [busyUnstake, setBusyUnstake] = useState(false);

  const staking     = data.staking;
  const rawUser     = data.user as any;
  const tonBalance  = parseFloat(rawUser.tonBalance ?? rawUser.ton_balance ?? '0');

  const stakedTon      = staking?.stakedTon       ?? 0;
  const dailyYieldIgc  = staking?.dailyYieldIgc   ?? 0;
  const limitRem       = staking?.unstakeRemainingTon ?? 0;
  const limitTotal     = staking?.unstakeLimitTon  ?? 0;

  // APY считается от реального dailyYieldIgc (уже учитывает ratio-корректировку)
  const stakedTonForApy = stakedTon > 0 ? stakedTon : 1;
  const igcPerTonPerDay = stakedTon > 0 ? dailyYieldIgc / stakedTonForApy : dailyYieldIgc || 5;
  const apyPct = (igcPerTonPerDay * 365 * pricePerIgc * 100).toFixed(2);

  const stakeVal  = parseFloat(stakeAmt)   || 0;
  const unstakeVal = parseFloat(unstakeAmt) || 0;

  const doStake = async () => {
    if (stakeVal < 1) { WebApp.showAlert('Минимум 1 TON'); return; }
    if (stakeVal > tonBalance) { WebApp.showAlert('Недостаточно TON'); return; }
    WebApp.showConfirm(fmt(t.stk_warning, { amt: stakeVal.toFixed(3) }), async (ok) => {
      if (!ok) return;
      setBusyStake(true);
      try {
        await action('stake_ton', { amount_ton: stakeVal });
        onUpdate();
        setStakeAmt('');
        WebApp.HapticFeedback.notificationOccurred('success');
      } catch (e) { WebApp.showAlert(String(e)); }
      finally { setBusyStake(false); }
    });
  };

  const doUnstake = async () => {
    if (unstakeVal < 1) { WebApp.showAlert('Минимум 1 TON'); return; }
    if (unstakeVal > stakedTon) { WebApp.showAlert(`Застейкано только ${stakedTon.toFixed(3)} TON`); return; }
    if (unstakeVal > limitRem) { WebApp.showAlert(fmt(t.stk_remaining, { rem: limitRem.toFixed(3) })); return; }
    WebApp.showConfirm(fmt(t.stk_warn_unstake, { amt: unstakeVal.toFixed(3) }), async (ok) => {
      if (!ok) return;
      setBusyUnstake(true);
      try {
        await action('unstake_ton', { amount_ton: unstakeVal });
        onUpdate();
        setUnstakeAmt('');
        WebApp.HapticFeedback.notificationOccurred('success');
      } catch (e) { WebApp.showAlert(String(e)); }
      finally { setBusyUnstake(false); }
    });
  };

  return (
    <div style={panel}>
      {/* Заголовок */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 24 }}>🏦</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{t.stk_title}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{t.stk_sub}</div>
        </div>
        {/* APY бейдж */}
        <div style={{
          fontSize: 11, fontWeight: 800, color: '#00FF88',
          background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)',
          borderRadius: 8, padding: '4px 8px', textAlign: 'center',
        }}>
          <div>{fmt(t.stk_apy, { pct: apyPct })}</div>
          <div style={{ fontSize: 8, color: 'rgba(0,255,136,0.6)', fontWeight: 400 }}>{t.stk_apy_hint}</div>
        </div>
      </div>

      {/* Текущий стейк */}
      {stakedTon > 0 ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 6,
            padding: '10px', background: 'rgba(0,212,255,0.06)',
            border: '1px solid rgba(0,212,255,0.2)', borderRadius: 10,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>{t.stk_staked_label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0098EA' }}>{stakedTon.toFixed(3)}</div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)' }}>TON</div>
            </div>
            <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.07)', borderRight: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>{t.stk_yield_label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#9B59B6' }}>+{dailyYieldIgc.toFixed(1)}</div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)' }}>IGC/{t.stk_per_day}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>{t.stk_limit_label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: limitRem > 0 ? '#00FF88' : '#E74C3C' }}>{limitRem.toFixed(2)}</div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)' }}>/ {limitTotal.toFixed(2)} TON</div>
            </div>
          </div>
          {/* Заработано сегодня */}
          {(staking?.stakingEarnedToday ?? 0) > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 10px', background: 'rgba(155,89,182,0.08)',
              border: '1px solid rgba(155,89,182,0.2)', borderRadius: 8,
            }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>💰 {t.stk_earned_today}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#9B59B6' }}>+{(staking?.stakingEarnedToday ?? 0).toFixed(2)} IGC</span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 12, textAlign: 'center' }}>
          {t.stk_none}
        </div>
      )}

      {/* Форма стейкинга */}
      <div style={secLabel}>{t.stk_stake_title}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input type="number" value={stakeAmt} onChange={e => setStakeAmt(e.target.value)}
          placeholder={t.stk_stake_ph} style={inputStyle} />
        <button onClick={() => setStakeAmt(tonBalance.toFixed(3))} style={maxBtn}>MAX</button>
      </div>
      {stakeVal >= 1 && (
        <div style={{ marginTop: 5, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          Доход: <span style={{ color: '#9B59B6', fontWeight: 700 }}>+{(stakeVal * 5).toFixed(1)} IGC/день</span>
        </div>
      )}
      <button onClick={doStake} disabled={busyStake || stakeVal < 1 || stakeVal > tonBalance}
        style={{ ...actionBtn('#0098EA', busyStake || stakeVal < 1 || stakeVal > tonBalance), marginTop: 10 }}>
        {busyStake ? t.stk_stake_busy : t.stk_stake_btn}
      </button>

      {/* Форма анстейкинга */}
      {stakedTon > 0 && (
        <>
          <div style={{ ...secLabel, marginTop: 14 }}>{t.stk_unstake_title}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input type="number" value={unstakeAmt} onChange={e => setUnstakeAmt(e.target.value)}
              placeholder={t.stk_unstake_ph} style={inputStyle} />
            <button onClick={() => setUnstakeAmt(Math.min(stakedTon, limitRem).toFixed(3))} style={maxBtn}>MAX</button>
          </div>
          {limitRem < stakedTon && (
            <div style={{ marginTop: 5, fontSize: 10, color: '#FF6B35' }}>
              {fmt(t.stk_remaining, { rem: limitRem.toFixed(3) })}
            </div>
          )}
          <button onClick={doUnstake}
            disabled={busyUnstake || unstakeVal < 1 || unstakeVal > stakedTon || unstakeVal > limitRem}
            style={{ ...actionBtn('#9B59B6', busyUnstake || unstakeVal < 1 || unstakeVal > stakedTon || unstakeVal > limitRem), marginTop: 10 }}>
            {busyUnstake ? t.stk_unstake_busy : t.stk_unstake_btn}
          </button>
        </>
      )}
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
