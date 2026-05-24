import { useState } from 'react';
import WebApp from '@twa-dev/sdk';
import type { SyncData } from '../types';
import { GPU_SPECS } from '../types';
import { useAction } from '../hooks/useAction';

function fmtH(h: number): string {
  if (h >= 1000) return `${(h / 1000).toFixed(2)} TH/s`;
  if (h >= 1)    return `${h.toFixed(2)} GH/s`;
  return `${(h * 1000).toFixed(0)} MH/s`;
}

interface Props { data: SyncData; onUpdate: () => void }

// ── Статические описания инфраструктуры ─────────────────────────────────────

const FARM_LEVELS = [
  {
    type: 'farm_level_2',
    level: 2,
    emoji: '📦',
    name: 'Кладовка',
    slots: 10,
    cost: '300 IGC',
    costIgc: 300, costTon: 0,
    perks: ['10 слотов для GPU', 'Достаточно для старта'],
    availablePhase: 1,
  },
  {
    type: 'farm_level_3',
    level: 3,
    emoji: '🚗',
    name: 'Гараж',
    slots: 20,
    cost: '12 TON',
    costIgc: 0, costTon: 12,
    perks: ['20 слотов для GPU', 'Пространство для ASIC-риг'],
    availablePhase: 1,
  },
  {
    type: 'farm_level_4',
    level: 4,
    emoji: '🏭',
    name: 'Ангар',
    slots: 50,
    cost: '50 TON',
    costIgc: 0, costTon: 50,
    perks: ['50 слотов для GPU', 'Только Фаза 2+'],
    availablePhase: 2,
  },
];

const COOLING_LEVELS = [
  {
    type: 'cooling_1',
    level: 1,
    emoji: '🌀',
    name: 'Кулер Lv1',
    cost: '100 IGC',
    costIgc: 100, costTon: 0,
    kTemp: 1.3,
    perks: ['Износ ×1.3 (было ×1.8)', 'Снижает перегрев', 'Меньше поломок'],
    availablePhase: 1,
  },
  {
    type: 'cooling_2',
    level: 2,
    emoji: '❄️',
    name: 'Кулер Lv2',
    cost: '3 TON',
    costIgc: 0, costTon: 3,
    kTemp: 1.0,
    perks: ['Износ ×1.0 (норма)', 'Базовый срок жизни GPU', 'Рекомендуется для RTX'],
    availablePhase: 1,
  },
  {
    type: 'cooling_3',
    level: 3,
    emoji: '🧊',
    name: 'Кулер Lv3',
    cost: '15 TON',
    costIgc: 0, costTon: 15,
    kTemp: 0.85,
    perks: ['Износ ×0.85 (−15%)', 'GPU живут дольше нормы', 'Обязателен для ASIC'],
    availablePhase: 1,
  },
];

const WORKBENCH_LEVELS = [
  {
    type: 'workbench_1',
    level: 1,
    emoji: '🔧',
    name: 'Верстак Lv1',
    cost: '500 IGC',
    costIgc: 500, costTon: 0,
    perks: ['Ремонт T1 (RX 580)', 'Ремонт T2 (GTX 1660 S)', 'Восстанавливает здоровье до 100%'],
    availablePhase: 1,
  },
  {
    type: 'workbench_2',
    level: 2,
    emoji: '⚙️',
    name: 'Верстак Lv2',
    cost: '5 TON',
    costIgc: 0, costTon: 5,
    perks: ['Всё из Lv1', 'Ремонт T3 (RTX 3070)', 'Ремонт T4 (RTX 4090)'],
    availablePhase: 1,
  },
  {
    type: 'workbench_3',
    level: 3,
    emoji: '🏗️',
    name: 'Верстак Lv3',
    cost: '25 TON',
    costIgc: 0, costTon: 25,
    perks: ['Всё из Lv2', 'Ремонт T5 (ASIC S19)', 'Ремонт T6 (Квантовый X1)'],
    availablePhase: 1,
  },
];

// ─────────────────────────────────────────────────────────────────────────────

export function Shop({ data, onUpdate }: Props) {
  const { action } = useAction();
  const [busyGpu, setBusyGpu] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const phase        = data.season.phase;
  const rawUser      = data.user as any;
  const rawFarm      = data.farm as any;
  const tonBalance   = parseFloat(rawUser.tonBalance   ?? rawUser.ton_balance   ?? '0');
  const igcBalance   = parseFloat(rawUser.igcBalance   ?? rawUser.igc_balance   ?? '0');
  const farmLevel    = rawFarm.level        ?? 1;
  const coolingLevel = rawFarm.coolingLevel ?? rawFarm.cooling_level  ?? 0;
  const wbLevel      = rawFarm.workbenchLevel ?? rawFarm.workbench_level ?? 0;

  const toggle = (key: string) => setExpanded(e => e === key ? null : key);

  const buyGpu = async (tier: number) => {
    if (busyGpu !== null) return;
    const spec = GPU_SPECS[tier];
    WebApp.showConfirm(`Купить ${spec.name} за ${spec.priceTon} TON?`, async (ok) => {
      if (!ok) return;
      setBusyGpu(tier);
      try {
        await action('buy_gpu', { model_tier: tier });
        onUpdate();
        WebApp.HapticFeedback.notificationOccurred('success');
      } catch (e) { WebApp.showAlert(String(e)); }
      finally { setBusyGpu(null); }
    });
  };

  const buyInfra = async (type: string, label: string, cost: string, _costIgc: number, costTon: number) => {
    const balance = costTon > 0 ? `${tonBalance.toFixed(3)} TON` : `${Math.floor(igcBalance)} IGC`;
    WebApp.showConfirm(
      `${label}\nСтоимость: ${cost}\nТвой баланс: ${balance}`,
      async (ok) => {
        if (!ok) return;
        try {
          await action(type);
          onUpdate();
          WebApp.HapticFeedback.notificationOccurred('success');
          setExpanded(null);
        } catch (e) { WebApp.showAlert(String(e)); }
      }
    );
  };

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Балансы */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 4,
      }}>
        <div style={balanceChip}>
          <span style={{ color: '#0098EA', fontWeight: 700 }}>{tonBalance.toFixed(3)}</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>TON</span>
        </div>
        <div style={balanceChip}>
          <span style={{ color: '#9B59B6', fontWeight: 700 }}>{Math.floor(igcBalance)}</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>IGC</span>
        </div>
        <div style={{ ...balanceChip, marginLeft: 'auto' }}>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>Фаза {phase}</span>
        </div>
      </div>

      {/* ── GPU ─────────────────────────────── */}
      <SectionHeader title="⛏️ Видеокарты" />

      {Object.entries(GPU_SPECS).filter(([t]) => Number(t) !== 0).map(([tierStr, spec]) => {
        const tier      = Number(tierStr);
        const locked    = phase < spec.availablePhase;
        const canAfford = tonBalance >= spec.priceTon;
        const isBusy    = busyGpu === tier;
        const key       = `gpu_${tier}`;
        const open      = expanded === key;

        return (
          <div key={tier} style={card(locked)}>
            {/* Header row */}
            <div
              onClick={() => toggle(key)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            >
              <span style={{ fontSize: 26, flexShrink: 0 }}>{spec.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: locked ? 'rgba(255,255,255,0.35)' : '#fff' }}>
                  {spec.name}
                  {locked && <span style={{ fontSize: 10, color: '#E74C3C', marginLeft: 6 }}>🔒 Фаза {spec.availablePhase}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  {fmtH(spec.hashrate)} · {spec.watt}W · +{spec.igcPerDay.toFixed(0)} IGC/д
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <button
                  onClick={e => { e.stopPropagation(); buyGpu(tier); }}
                  disabled={locked || isBusy || !canAfford}
                  style={buyBtn(locked || !canAfford)}
                >
                  {isBusy ? '...' : `${spec.priceTon} TON`}
                </button>
              </div>
            </div>

            {/* Expanded details */}
            {open && (
              <div style={expandedBox}>
                <Row label="Хешрейт" value={fmtH(spec.hashrate)} color="#0098EA" />
                <Row label="Мощность" value={`${spec.watt}W`} />
                <Row label="IGC доход/день" value={`+${spec.igcPerDay.toFixed(1)}`} color="#9B59B6" />
                <Row label="IGC расход/день" value={`−${spec.igcCostPerDay.toFixed(1)}`} color="#E74C3C" />
                <Row label="Баланс IGC/день" value={`${(spec.igcPerDay - spec.igcCostPerDay) >= 0 ? '+' : ''}${(spec.igcPerDay - spec.igcCostPerDay).toFixed(1)}`}
                  color={(spec.igcPerDay - spec.igcCostPerDay) >= 0 ? '#2ECC71' : '#E74C3C'} />
                {tier >= 4 && (
                  <div style={{ marginTop: 6, fontSize: 10, color: '#F39C12', background: 'rgba(243,156,18,0.1)', padding: '5px 8px', borderRadius: 6 }}>
                    ⚠️ Потребление IGC превышает добычу. Окупаемость зависит от доли сети.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Ферма ────────────────────────────── */}
      <SectionHeader title="🏠 Уровень фермы" subtitle={`Сейчас: ${FARM_LABELS[farmLevel] ?? 'Балкон'} · ${data.farm.maxSlots} слотов`} />

      {/* Текущий уровень — только для понимания */}
      <div style={{ ...card(false), opacity: 0.5, cursor: 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 26 }}>🏠</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Балкон — стартовый</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>5 слотов · бесплатно</div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <span style={currentBadge}>Текущий</span>
          </div>
        </div>
      </div>

      {FARM_LEVELS.map(f => {
        const owned   = farmLevel >= f.level;
        const locked  = phase < f.availablePhase;
        const canAfford = f.costTon > 0 ? tonBalance >= f.costTon : igcBalance >= f.costIgc;
        const key     = f.type;
        const open    = expanded === key;

        return (
          <div key={f.type} style={card(locked || owned)}>
            <div onClick={() => toggle(key)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <span style={{ fontSize: 26, flexShrink: 0 }}>{f.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: owned ? 'rgba(255,255,255,0.4)' : '#fff' }}>
                  {f.name}
                  {locked && <span style={{ fontSize: 10, color: '#E74C3C', marginLeft: 6 }}>🔒 Фаза {f.availablePhase}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{f.slots} слотов · {f.cost}</div>
              </div>
              {owned
                ? <span style={currentBadge}>Есть</span>
                : <button
                    onClick={e => { e.stopPropagation(); buyInfra(f.type, f.name, f.cost, f.costIgc, f.costTon); }}
                    disabled={locked || !canAfford}
                    style={buyBtnPurple(locked || !canAfford)}
                  >{f.cost}</button>
              }
            </div>

            {open && (
              <div style={expandedBox}>
                <Row label="Слотов" value={`${f.slots}`} color="#0098EA" />
                {f.perks.map(p => (
                  <div key={p} style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', paddingLeft: 4, marginTop: 2 }}>✓ {p}</div>
                ))}
                {farmLevel < f.level - 1 && (
                  <div style={{ marginTop: 6, fontSize: 10, color: '#F39C12', background: 'rgba(243,156,18,0.1)', padding: '5px 8px', borderRadius: 6 }}>
                    ⚠️ Сначала нужно купить предыдущий уровень
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Кулеры ───────────────────────────── */}
      <SectionHeader
        title="❄️ Охлаждение"
        subtitle={coolingLevel === 0 ? 'Нет кулера · Износ ×1.8 (перегрев!)' : `Кулер Lv${coolingLevel} установлен`}
      />

      {/* Без кулера — предупреждение */}
      {coolingLevel === 0 && (
        <div style={{
          background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.25)',
          borderRadius: 12, padding: '10px 12px', fontSize: 11, color: '#E74C3C',
        }}>
          🔥 Без охлаждения износ GPU ×1.8 — карты деградируют очень быстро и часто ломаются!
        </div>
      )}

      {COOLING_LEVELS.map(c => {
        const owned     = coolingLevel >= c.level;
        const canAfford = c.costTon > 0 ? tonBalance >= c.costTon : igcBalance >= c.costIgc;
        const key       = c.type;
        const open      = expanded === key;

        return (
          <div key={c.type} style={card(owned)}>
            <div onClick={() => toggle(key)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <span style={{ fontSize: 26, flexShrink: 0 }}>{c.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: owned ? 'rgba(255,255,255,0.4)' : '#fff' }}>
                  {c.name}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  Износ ×{c.kTemp} · {c.cost}
                </div>
              </div>
              {owned
                ? <span style={currentBadge}>Есть</span>
                : <button
                    onClick={e => { e.stopPropagation(); buyInfra(c.type, c.name, c.cost, c.costIgc, c.costTon); }}
                    disabled={!canAfford}
                    style={buyBtnBlue(!canAfford)}
                  >{c.cost}</button>
              }
            </div>

            {open && (
              <div style={expandedBox}>
                <Row label="Коэфф. износа" value={`×${c.kTemp}`} color={c.kTemp < 1 ? '#2ECC71' : c.kTemp === 1 ? '#F39C12' : '#E74C3C'} />
                <Row label="Без кулера" value="×1.8 износа" color="#E74C3C" />
                {c.perks.map(p => (
                  <div key={p} style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', paddingLeft: 4, marginTop: 2 }}>✓ {p}</div>
                ))}
                <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                  * Разгон (OC) дополнительно умножает износ ×2.5 поверх кулера
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Верстак ──────────────────────────── */}
      <SectionHeader
        title="🔧 Верстак"
        subtitle={wbLevel === 0 ? 'Не установлен · ремонт недоступен' : `Верстак Lv${wbLevel} установлен`}
      />

      {wbLevel === 0 && (
        <div style={{
          background: 'rgba(155,89,182,0.1)', border: '1px solid rgba(155,89,182,0.25)',
          borderRadius: 12, padding: '10px 12px', fontSize: 11, color: 'rgba(155,89,182,0.9)',
        }}>
          🔧 Без верстака ремонт сломанных GPU невозможен. Придётся покупать новые карты.
        </div>
      )}

      {WORKBENCH_LEVELS.map(w => {
        const owned     = wbLevel >= w.level;
        const canAfford = w.costTon > 0 ? tonBalance >= w.costTon : igcBalance >= w.costIgc;
        const key       = w.type;
        const open      = expanded === key;

        return (
          <div key={w.type} style={card(owned)}>
            <div onClick={() => toggle(key)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <span style={{ fontSize: 26, flexShrink: 0 }}>{w.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: owned ? 'rgba(255,255,255,0.4)' : '#fff' }}>
                  {w.name}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{w.cost}</div>
              </div>
              {owned
                ? <span style={currentBadge}>Есть</span>
                : <button
                    onClick={e => { e.stopPropagation(); buyInfra(w.type, w.name, w.cost, w.costIgc, w.costTon); }}
                    disabled={!canAfford || wbLevel < w.level - 1}
                    style={buyBtnPurple(!canAfford || wbLevel < w.level - 1)}
                  >{w.cost}</button>
              }
            </div>

            {open && (
              <div style={expandedBox}>
                {w.perks.map(p => (
                  <div key={p} style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', paddingLeft: 4, marginTop: 2 }}>✓ {p}</div>
                ))}
                <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                  * Стоимость ремонта: базовая IGC × тир × (100 − здоровье)
                </div>
                {wbLevel < w.level - 1 && (
                  <div style={{ marginTop: 6, fontSize: 10, color: '#F39C12', background: 'rgba(243,156,18,0.1)', padding: '5px 8px', borderRadius: 6 }}>
                    ⚠️ Сначала купи Верстак Lv{w.level - 1}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ height: 16 }} />
    </div>
  );
}

// ── Вспомогательные компоненты ───────────────────────────────────────────────

const FARM_LABELS: Record<number, string> = { 1: 'Балкон', 2: 'Кладовка', 3: 'Гараж', 4: 'Ангар' };

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{subtitle}</div>}
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: color ?? 'rgba(255,255,255,0.7)' }}>{value}</span>
    </div>
  );
}

// ── Стили ────────────────────────────────────────────────────────────────────

const balanceChip: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  background: 'rgba(255,255,255,0.06)', borderRadius: 8,
  padding: '4px 10px', fontSize: 12,
};

const currentBadge: React.CSSProperties = {
  fontSize: 10, fontWeight: 700,
  color: '#2ECC71', background: 'rgba(46,204,113,0.15)',
  border: '1px solid rgba(46,204,113,0.3)',
  borderRadius: 6, padding: '2px 8px',
};

const expandedBox: React.CSSProperties = {
  marginTop: 10, paddingTop: 10,
  borderTop: '1px solid rgba(255,255,255,0.07)',
};

function card(dimmed: boolean): React.CSSProperties {
  return {
    background: dimmed ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14, padding: '12px 14px',
    opacity: dimmed ? 0.6 : 1,
    transition: 'opacity 0.15s',
  };
}

function buyBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '7px 13px', borderRadius: 9, border: 'none', cursor: disabled ? 'default' : 'pointer',
    background: disabled ? 'rgba(255,255,255,0.08)' : '#0098EA',
    color: disabled ? 'rgba(255,255,255,0.3)' : '#fff',
    fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
  };
}

function buyBtnPurple(disabled: boolean): React.CSSProperties {
  return {
    ...buyBtn(disabled),
    background: disabled ? 'rgba(255,255,255,0.08)' : '#9B59B6',
  };
}

function buyBtnBlue(disabled: boolean): React.CSSProperties {
  return {
    ...buyBtn(disabled),
    background: disabled ? 'rgba(255,255,255,0.08)' : '#0098EA',
  };
}
