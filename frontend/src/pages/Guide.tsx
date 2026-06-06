import { useState } from 'react';
import { useLang } from '../LangContext';

// ── Палитра ───────────────────────────────────────────────
const CY  = '#00D4FF';
const OR  = '#FF6B35';
const GR  = '#00FF88';
const PU  = '#BD00FF';
const YL  = '#FFD700';
const RE  = '#FF3355';
const DIM = 'rgba(255,255,255,0.4)';

// ── Типы ──────────────────────────────────────────────────
interface Level {
  label:  string;
  effect: string;
  cost?:  string;
  phase?: number;
  note?:  string;
}

interface UpgradeCard {
  emoji:    string;
  title:    string;
  subtitle: string;
  color:    string;
  scope:    'farm' | 'gpu';
  levels:   Level[];
}

// ── Карточки апгрейдов ────────────────────────────────────
function useCards(): UpgradeCard[] {
  const { lang } = useLang();
  const ru = lang === 'ru';

  return [
    {
      emoji: '🏠', color: CY, scope: 'farm',
      title:    ru ? 'Помещение' : 'Room',
      subtitle: ru ? 'Больше слотов = больше GPU на ферме' : 'More slots = more GPUs on the farm',
      levels: [
        { label: ru ? 'Балкон'   : 'Balcony', effect: ru ? '5 слотов'  : '5 slots',  cost: ru ? 'стартовое' : 'free start' },
        { label: ru ? 'Кладовка' : 'Storage', effect: ru ? '10 слотов' : '10 slots', cost: '300 IGC' },
        { label: ru ? 'Гараж'    : 'Garage',  effect: ru ? '20 слотов' : '20 slots', cost: '12 TON', phase: 2 },
        { label: ru ? 'Ангар'    : 'Hangar',  effect: ru ? '50 слотов' : '50 slots', cost: '50 TON', phase: 2 },
      ],
    },
    {
      emoji: '🌡️', color: CY, scope: 'farm',
      title:    ru ? 'Жидкостное охлаждение фермы' : 'Farm Liquid Cooling',
      subtitle: ru ? 'Снижает скорость износа всех GPU на ферме' : 'Reduces wear rate of all GPUs on the farm',
      levels: [
        { label: ru ? 'Нет'  : 'None', effect: ru ? '×1.8 к износу' : '×1.8 wear',  cost: ru ? 'стартовое' : 'default', note: '⚠️' },
        { label: 'Lv 1',              effect: ru ? '×1.3 к износу' : '×1.3 wear',  cost: '100 IGC' },
        { label: 'Lv 2',              effect: ru ? '×1.0 нормальный' : '×1.0 normal', cost: '3 TON' },
        { label: 'Lv 3',              effect: ru ? '×0.85 пониженный' : '×0.85 low', cost: '15 TON' },
      ],
    },
    {
      emoji: '🔧', color: OR, scope: 'farm',
      title:    ru ? 'Верстак' : 'Workbench',
      subtitle: ru ? 'Открывает ремонт GPU (без верстака чинить нельзя)' : 'Unlocks GPU repair (repair requires a workbench)',
      levels: [
        { label: ru ? 'Нет'   : 'None', effect: ru ? 'ремонт недоступен' : 'repair unavailable' },
        { label: 'Lv 1', effect: ru ? 'чинит T1–T2 (RX 580, GTX 1660 S)' : 'repairs T1–T2 (RX 580, GTX 1660 S)', cost: '500 IGC' },
        { label: 'Lv 2', effect: ru ? 'чинит T3–T4 (RTX 3070, RTX 4090)' : 'repairs T3–T4 (RTX 3070, RTX 4090)', cost: '5 TON' },
        { label: 'Lv 3', effect: ru ? 'чинит T5–T6 (ASIC S19, Quantum X1)' : 'repairs T5–T6 (ASIC S19, Quantum X1)', cost: '25 TON' },
      ],
    },
    {
      emoji: '❄️', color: CY, scope: 'farm',
      title:    ru ? 'Серверная' : 'Server Room',
      subtitle: ru ? 'Профессиональные стойки и кабель-менеджмент — бонус хешрейта всех GPU фермы' : 'Pro racks and cable management — hashrate bonus for all farm GPUs',
      levels: [
        { label: 'Lv 1', effect: '+3% hashrate',  cost: '0.5 TON' },
        { label: 'Lv 2', effect: '+7% hashrate',  cost: '1.5 TON' },
        { label: 'Lv 3', effect: '+12% hashrate', cost: '4 TON'   },
      ],
    },
    {
      emoji: '🔋', color: GR, scope: 'farm',
      title:    ru ? 'ИБП (источник бесперебойного питания)' : 'UPS (Uninterruptible Power Supply)',
      subtitle: ru ? 'Повышает uptime GPU → больше часов в работе → больше TON' : 'Boosts GPU uptime → more hours mining → more TON',
      levels: [
        { label: 'Lv 1', effect: '+5% uptime',  cost: '0.4 TON' },
        { label: 'Lv 2', effect: '+12% uptime', cost: '1 TON'   },
        { label: 'Lv 3', effect: '+20% uptime', cost: '3 TON'   },
      ],
    },
    {
      emoji: '📡', color: PU, scope: 'farm',
      title:    ru ? 'Провайдер' : 'ISP Contract',
      subtitle: ru ? 'Снижает стоимость электричества в IGC + uptime бонус' : 'Cuts electricity cost in IGC + uptime bonus',
      levels: [
        { label: 'Lv 1', effect: ru ? '−15% IGC · +2% uptime' : '−15% IGC · +2% uptime', cost: '0.2 TON' },
        { label: 'Lv 2', effect: ru ? '−30% IGC · +4% uptime' : '−30% IGC · +4% uptime', cost: '0.6 TON' },
        { label: 'Lv 3', effect: ru ? '−45% IGC · +6% uptime' : '−45% IGC · +6% uptime', cost: '1.5 TON' },
        { label: 'Lv 4', effect: ru ? '−60% IGC · +8% uptime' : '−60% IGC · +8% uptime', cost: '4 TON'   },
      ],
    },
    {
      emoji: '💧', color: CY, scope: 'gpu',
      title:    ru ? 'Жидкостное охлаждение' : 'Liquid Cooling',
      subtitle: ru ? 'Снижает износ конкретного GPU — реже ремонт, дольше жизнь карты' : 'Reduces wear on one GPU — less repairs, longer lifespan',
      levels: [
        { label: 'Lv 1', effect: ru ? '−20% износ, −10°C' : '−20% wear, −10°C', cost: '600 IGC'  },
        { label: 'Lv 2', effect: ru ? '−35% износ, −20°C' : '−35% wear, −20°C', cost: '2000 IGC' },
        { label: ru ? 'Lv 3 Иммерсия' : 'Lv 3 Immersion', effect: ru ? '−55% износ, −35°C' : '−55% wear, −35°C', cost: '6000 IGC' },
      ],
    },
    {
      emoji: '🧴', color: OR, scope: 'gpu',
      title:    ru ? 'Термопаста' : 'Thermal Paste',
      subtitle: ru ? 'Снижает износ GPU. Разовая замена, действует постоянно' : 'Reduces GPU wear. One-time upgrade, permanent effect',
      levels: [
        { label: 'Lv 1', effect: ru ? '−15% износ' : '−15% wear', cost: '150 IGC'  },
        { label: 'Lv 2', effect: ru ? '−25% износ' : '−25% wear', cost: '500 IGC'  },
        { label: 'Lv 3', effect: ru ? '−35% износ' : '−35% wear', cost: '1200 IGC' },
      ],
    },
    {
      emoji: '🌀', color: GR, scope: 'gpu',
      title:    ru ? 'Вентилятор' : 'Fan',
      subtitle: ru ? 'Повышает uptime одного GPU — больше времени в работе' : 'Boosts uptime of one GPU — more time mining',
      levels: [
        { label: 'Lv 1', effect: '+4% uptime',  cost: '100 IGC'  },
        { label: 'Lv 2', effect: '+8% uptime',  cost: '750 IGC'  },
        { label: 'Lv 3', effect: '+12% uptime', cost: '1900 IGC' },
        { label: 'Lv 4', effect: '+16% uptime', cost: '4800 IGC' },
      ],
    },
  ];
}

// ── Переиспользуемые блоки ────────────────────────────────
function SectionLabel({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: `${color}80`, marginTop: 4 }}>
      — {text} —
    </div>
  );
}

function InfoBlock({ emoji, title, subtitle, color, children }: {
  emoji: string; title: string; subtitle?: string; color: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '14px',
      border: `1px solid ${color}33`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>{emoji}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: DIM, marginTop: 1 }}>{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function QA({ q, a, color = CY }: { q: string; a: string; color?: string }) {
  return (
    <div style={{ padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 3 }}>{q}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{a}</div>
    </div>
  );
}


function Tip({ emoji, text, color }: { emoji: string; text: string; color: string }) {
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      padding: '10px 12px', borderRadius: 10,
      background: `${color}0D`, border: `1px solid ${color}33`,
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{emoji}</span>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>{text}</span>
    </div>
  );
}

// ── Карточка апгрейда ──────────────────────────────────────
function Card({ card }: { card: UpgradeCard }) {
  const [open, setOpen] = useState(false);
  const { lang } = useLang();
  const ru = lang === 'ru';

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14, overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 14px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 24, flexShrink: 0 }}>{card.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: card.color }}>{card.title}</div>
          <div style={{ fontSize: 10, color: DIM, marginTop: 1, lineHeight: 1.4 }}>{card.subtitle}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          <span style={{
            fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
            color: card.scope === 'farm' ? CY : PU,
            background: card.scope === 'farm' ? 'rgba(0,212,255,0.1)' : 'rgba(189,0,255,0.1)',
            border: `1px solid ${card.scope === 'farm' ? 'rgba(0,212,255,0.25)' : 'rgba(189,0,255,0.25)'}`,
            borderRadius: 4, padding: '2px 5px',
          }}>
            {card.scope === 'farm' ? (ru ? 'ФЕРМА' : 'FARM') : 'GPU'}
          </span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 14px 12px' }}>
          {card.levels.map((lv, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 0',
              borderBottom: i < card.levels.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: i === 0 ? 'rgba(255,255,255,0.2)' : card.color,
                  boxShadow: i > 0 ? `0 0 6px ${card.color}88` : 'none',
                }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: i === 0 ? 'rgba(255,255,255,0.5)' : '#E0F0FF' }}>
                    {lv.label}
                    {lv.note && <span style={{ marginLeft: 4 }}>{lv.note}</span>}
                    {lv.phase && (
                      <span style={{
                        marginLeft: 5, fontSize: 9, fontWeight: 700,
                        color: RE, background: 'rgba(231,76,60,0.12)',
                        border: '1px solid rgba(231,76,60,0.3)',
                        borderRadius: 3, padding: '1px 4px',
                      }}>
                        🔒 {ru ? 'Фаза' : 'Phase'} {lv.phase}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: card.color, fontWeight: 600 }}>{lv.effect}</div>
                </div>
              </div>
              {lv.cost && (
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  color: lv.cost === (ru ? 'стартовое' : 'free start') || lv.cost === (ru ? 'включено' : 'included')
                    ? 'rgba(255,255,255,0.3)'
                    : lv.cost.includes('IGC') ? PU : YL,
                }}>
                  {lv.cost}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Путь новичка ──────────────────────────────────────────
function BeginnerPath({ ru }: { ru: boolean }) {
  const steps = ru ? [
    {
      stage: 'Этап 1', budget: '0 TON', color: GR, emoji: '🌱',
      goal: 'Защити стартовую ферму',
      actions: [
        'Купи Охлаждение Lv1 (100 IGC) — без него карты изнашиваются в 1.8× быстрее',
        'Купи Верстак Lv1 (500 IGC) — без него нельзя чинить поломанные GPU',
        'USB Nano уже работает бесплатно — не трогай его',
      ],
      tip: 'IGC зарабатывается автоматически от майнинга. Следи за балансом.',
    },
    {
      stage: 'Этап 2', budget: '1.5–5 TON', color: CY, emoji: '⚡',
      goal: 'Первые реальные карты',
      actions: [
        'RX 580 (1.5 TON) — даёт +25 IGC/день чистыми, первая серьёзная карта',
        'GTX 1660 S (2.5 TON) — хороший баланс IGC/TON',
        'Купи Охлаждение Lv2 (3 TON) — снизит износ до нормы (×1.0)',
      ],
      tip: 'Сначала охлаждение, потом карты. Карта без охлаждения ломается в 1.8× быстрее.',
    },
    {
      stage: 'Этап 3', budget: '10–20 TON', color: PU, emoji: '🚀',
      goal: 'Масштабирование + синдикат',
      actions: [
        'Кладовка (300 IGC) → 10 слотов для GPU',
        '2–3 GTX 1660 S или 1 RTX 3070 (8 TON)',
        'Вступи в синдикат → включи Pool-режим → стабильный TON каждые 5 минут',
        'Провайдер Lv1 (0.2 TON) — сразу −20% к счёту за электричество',
      ],
      tip: 'Pool даёт стабильный доход. Solo — лотерея, подходит для опытных.',
    },
    {
      stage: 'Этап 4', budget: '30–60 TON', color: OR, emoji: '🏭',
      goal: 'Серьёзная ферма',
      actions: [
        'Верстак Lv2 (5 TON) → открывает ремонт RTX 3070 и RTX 4090',
        'RTX 4090 (25 TON) — высокий хешрейт, но IGC уходит в минус',
        'Охлаждение Lv3 (15 TON) + Серверная — снизит износ ниже нормы',
        'ИБП Lv2 (1 TON) — +12% uptime → больше часов в работе',
      ],
      tip: 'RTX 4090 окупается только если держать хорошую долю в пуле. Следи за курсом IGC.',
    },
    {
      stage: 'Этап 5', budget: '55+ TON', color: YL, emoji: '💎',
      goal: 'Элита (Фаза 2)',
      actions: [
        'ASIC S19 (55 TON) и Quantum X1 (140 TON) — открываются в Фазе 2',
        'Гараж (12 TON) → 20 слотов',
        'Верстак Lv3 (25 TON) → ремонт ASIC и Quantum',
        'Провайдер Lv4 (4 TON) — −80% IGC расхода',
      ],
      tip: 'На этом уровне IGC-расход огромный. Нужна стратегия: стейкинг, рефералы, синдикат.',
    },
  ] : [
    {
      stage: 'Stage 1', budget: '0 TON', color: GR, emoji: '🌱',
      goal: 'Protect your starter farm',
      actions: [
        'Buy Cooling Lv1 (100 IGC) — without it GPUs wear 1.8× faster',
        'Buy Workbench Lv1 (500 IGC) — required to repair broken GPUs',
        'USB Nano is already working for free — leave it alone',
      ],
      tip: 'IGC is earned automatically from mining. Keep an eye on your balance.',
    },
    {
      stage: 'Stage 2', budget: '1.5–5 TON', color: CY, emoji: '⚡',
      goal: 'First real cards',
      actions: [
        'RX 580 (1.5 TON) — gives +25 IGC/day net, first solid card',
        'GTX 1660 S (2.5 TON) — good IGC/TON balance',
        'Upgrade to Cooling Lv2 (3 TON) — brings wear down to normal (×1.0)',
      ],
      tip: 'Cooling first, then GPUs. A card without cooling breaks 1.8× faster.',
    },
    {
      stage: 'Stage 3', budget: '10–20 TON', color: PU, emoji: '🚀',
      goal: 'Scale up + join syndicate',
      actions: [
        'Storage room (300 IGC) → 10 GPU slots',
        '2–3 GTX 1660 S or 1 RTX 3070 (8 TON)',
        'Join a syndicate → enable Pool mode → steady TON every 5 minutes',
        'ISP Lv1 (0.2 TON) — instant −20% electricity bill',
      ],
      tip: 'Pool gives stable income. Solo is a lottery — better for experienced players.',
    },
    {
      stage: 'Stage 4', budget: '30–60 TON', color: OR, emoji: '🏭',
      goal: 'Serious farm',
      actions: [
        'Workbench Lv2 (5 TON) → unlocks RTX 3070 and RTX 4090 repair',
        'RTX 4090 (25 TON) — high hashrate but IGC goes negative',
        'Cooling Lv3 (15 TON) + Server Room — wear below normal',
        'UPS Lv2 (1 TON) — +12% uptime → more mining hours',
      ],
      tip: 'RTX 4090 only pays off with a good pool share. Watch the IGC rate.',
    },
    {
      stage: 'Stage 5', budget: '55+ TON', color: YL, emoji: '💎',
      goal: 'Elite tier (Phase 2)',
      actions: [
        'ASIC S19 (55 TON) and Quantum X1 (140 TON) — unlock in Phase 2',
        'Garage (12 TON) → 20 slots',
        'Workbench Lv3 (25 TON) → repair ASIC and Quantum',
        'ISP Lv4 (4 TON) — −80% IGC electricity cost',
      ],
      tip: 'At this level IGC costs are huge. You need a strategy: staking, referrals, syndicate.',
    },
  ];

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: '14px',
      border: `1px solid ${GR}33`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>🚀</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: GR }}>
            {ru ? 'Путь новичка' : 'Beginner Roadmap'}
          </div>
          <div style={{ fontSize: 10, color: DIM, marginTop: 1 }}>
            {ru ? 'С чего начать и в каком порядке развивать ферму' : 'Where to start and how to develop your farm'}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((s, i) => {
          const [open, setOpen] = useState(false);
          return (
            <div key={i} style={{
              background: `${s.color}08`, borderRadius: 10, border: `1px solid ${s.color}25`, overflow: 'hidden',
            }}>
              <button onClick={() => setOpen(o => !o)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{s.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: s.color }}>{s.stage}</span>
                    <span style={{
                      fontSize: 9, padding: '1px 6px', borderRadius: 4,
                      background: `${s.color}18`, border: `1px solid ${s.color}40`, color: s.color,
                    }}>{s.budget}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#E0F0FF', fontWeight: 600, marginTop: 2 }}>{s.goal}</div>
                </div>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
              </button>
              {open && (
                <div style={{ borderTop: `1px solid ${s.color}20`, padding: '10px 12px' }}>
                  {s.actions.map((a, j) => (
                    <div key={j} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                      <span style={{ color: s.color, flexShrink: 0, fontWeight: 700 }}>→</span>
                      <span>{a}</span>
                    </div>
                  ))}
                  <div style={{
                    marginTop: 8, fontSize: 10, color: s.color, lineHeight: 1.5,
                    background: `${s.color}0D`, border: `1px solid ${s.color}25`,
                    borderRadius: 7, padding: '6px 8px',
                  }}>
                    💡 {s.tip}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Как прокачивать ферму ─────────────────────────────────
function FarmPrioritySection({ ru }: { ru: boolean }) {
  const items = ru ? [
    { n: 1, emoji: '🌡️', title: 'Сначала Охлаждение Lv2', color: CY,
      desc: 'Без него все GPU изнашиваются в 1.8× быстрее нормы. Это прямые потери на ремонт. Охлаждение Lv2 (3 TON) — первоочередная покупка.' },
    { n: 2, emoji: '🔧', title: 'Потом Верстак (по тиру)', color: OR,
      desc: 'Сломанный GPU без верстака — мёртвый GPU. Lv1 за 500 IGC чинит RX 580 и GTX 1660 S. Как только купишь RTX 3070 — сразу Верстак Lv2.' },
    { n: 3, emoji: '📡', title: 'Провайдер как можно раньше', color: PU,
      desc: 'Lv1 всего 0.2 TON, но даёт −15% к IGC-расходу и +2% uptime. На 5 картах это 30+ IGC в день — окупается за несколько дней.' },
    { n: 4, emoji: '❄️', title: 'Серверная — бонус хешрейта фермы', color: CY,
      desc: 'Lv1 (+3%) стоит 0.5 TON. Lv3 (+12%) увеличивает доход всех карт фермы. Хорошо сочетается с разгоном — больше хешрейта без покупки новых GPU.' },
    { n: 5, emoji: '🔋', title: 'ИБП когда ферма растёт', color: GR,
      desc: 'Каждый +1% uptime увеличивает доход. При 10+ картах ИБП Lv2 (+12%) ощутимо влияет на итоговый TON/день.' },
    { n: 6, emoji: '🏠', title: 'Расширение помещения по необходимости', color: CY,
      desc: 'Кладовку (300 IGC) бери когда займёшь 4–5 слотов. Гараж и Ангар — только в Фазе 2, когда реально нужно больше 10 слотов.' },
  ] : [
    { n: 1, emoji: '🌡️', title: 'Cooling Lv2 first', color: CY,
      desc: 'Without it all GPUs wear 1.8× faster than normal. Direct repair cost losses. Cooling Lv2 (3 TON) is the top priority purchase.' },
    { n: 2, emoji: '🔧', title: 'Workbench (matching your GPU tier)', color: OR,
      desc: 'A broken GPU without a workbench is a dead GPU. Lv1 (500 IGC) repairs RX 580 and GTX 1660 S. As soon as you buy RTX 3070 — get Workbench Lv2.' },
    { n: 3, emoji: '📡', title: 'ISP Contract early', color: PU,
      desc: 'Just 0.2 TON for Lv1, but gives −15% IGC cost and +2% uptime. With 5 GPUs that\'s 30+ IGC saved per day — pays off within days.' },
    { n: 4, emoji: '❄️', title: 'Server Room — farm hashrate bonus', color: CY,
      desc: 'Lv1 (+3%) costs only 0.5 TON. Lv3 (+12%) boosts all GPUs\' income without buying new cards. Great combo with overclocking.' },
    { n: 5, emoji: '🔋', title: 'UPS as the farm grows', color: GR,
      desc: 'Each +1% uptime increases income. With 10+ GPUs, UPS Lv2 (+12%) has a noticeable impact on daily TON earnings.' },
    { n: 6, emoji: '🏠', title: 'Expand room as needed', color: CY,
      desc: 'Get Storage (300 IGC) when you fill 4–5 slots. Garage and Hangar only in Phase 2, when you actually need more than 10 slots.' },
  ];

  return (
    <InfoBlock emoji="🏗️" title={ru ? 'Как прокачивать ферму' : 'Farm Upgrade Priority'} color={CY}
      subtitle={ru ? 'Правильный порядок — экономит TON и IGC' : 'Right order saves TON and IGC'}>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex', gap: 10, padding: '8px 0',
          borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            background: `${item.color}20`, border: `1px solid ${item.color}50`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800, color: item.color,
          }}>{item.n}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: item.color, marginBottom: 2 }}>
              {item.emoji} {item.title}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{item.desc}</div>
          </div>
        </div>
      ))}
    </InfoBlock>
  );
}

// ── Износ и ремонт ────────────────────────────────────────
function WearSection({ ru }: { ru: boolean }) {
  return (
    <InfoBlock emoji="💔" title={ru ? 'Износ и ремонт GPU' : 'GPU Wear & Repair'} color={OR}
      subtitle={ru ? 'Каждый GPU теряет здоровье со временем' : 'Every GPU loses health over time'}>
      <QA color={OR}
        q={ru ? 'Как снижается здоровье?' : 'How does health decrease?'}
        a={ru
          ? 'Каждые 5 минут (эпоха) GPU теряет здоровье. Скорость зависит от тира GPU, температуры (охлаждение фермы + жидкостное охлаждение) и режима работы (OC ускоряет износ в 2.5×, UV — замедляет в 0.7×).'
          : 'Every 5 minutes (epoch) the GPU loses health. Rate depends on GPU tier, temperature (farm cooling + liquid cooling), and mode (OC speeds wear 2.5×, UV slows it to 0.7×).'}
      />
      <QA color={OR}
        q={ru ? 'Что происходит при низком здоровье?' : 'What happens at low health?'}
        a={ru
          ? 'Чем ниже здоровье — тем выше шанс поломки (P_fail = ((100 − health) / 100)³). При 50% здоровья шанс поломки за эпоху ~0.1%. GPU со статусом broken не майнит до ремонта.'
          : 'Lower health = higher chance of breaking (P_fail = ((100−health)/100)³). At 50% health the per-epoch break chance is ~0.1%. A broken GPU stops mining until repaired.'}
      />
      <QA color={OR}
        q={ru ? 'Сколько стоит ремонт?' : 'How much does repair cost?'}
        a={ru
          ? 'Стоимость: (100 − health) × 3 × TIER_MULT IGC. Множитель по тирам: T1=1×, T2=1.8×, T3=3.5×, T4=7×, T5=20×, T6=50×. Верстак Lv3 даёт скидку −80%.'
          : 'Cost: (100−health) × 3 × TIER_MULT IGC. Multipliers: T1=1×, T2=1.8×, T3=3.5×, T4=7×, T5=20×, T6=50×. Workbench Lv3 gives −80% discount.'}
      />
      <div style={{
        marginTop: 8, padding: '8px 10px', borderRadius: 8,
        background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.25)',
        fontSize: 10, color: OR, lineHeight: 1.5,
      }}>
        {ru
          ? '💡 Чини при 60–70% здоровья. При 50% стоимость ремонта T3 = 525 IGC, T4 = 1050 IGC. С разгоном (OC) до 50% — за ~12 дней.'
          : '💡 Repair at 60–70% health. At 50% repair costs: T3=525 IGC, T4=1050 IGC. With OC you hit 50% in ~12 days.'}
      </div>
    </InfoBlock>
  );
}

// ── Solo vs Pool ──────────────────────────────────────────
function MiningModeSection({ ru }: { ru: boolean }) {
  return (
    <InfoBlock emoji="⚙️" title={ru ? 'Solo vs Pool майнинг' : 'Solo vs Pool Mining'} color={CY}
      subtitle={ru ? 'Два разных способа получать TON' : 'Two different ways to earn TON'}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        {[
          {
            mode: 'SOLO', color: OR, emoji: '🎲',
            pros: ru ? ['Выиграл блок = весь TON тебе', 'Не нужен синдикат'] : ['Win block = all TON to you', 'No syndicate needed'],
            cons: ru ? ['Редко, непредсказуемо', 'Зависит от удачи'] : ['Rare and unpredictable', 'Luck-dependent'],
          },
          {
            mode: 'POOL', color: GR, emoji: '🤝',
            pros: ru ? ['Стабильный TON каждые 5 мин', 'Пропорционально хешрейту'] : ['Steady TON every 5 min', 'Proportional to hashrate'],
            cons: ru ? ['Нужен синдикат', 'Маленькие выплаты'] : ['Requires syndicate', 'Small individual payouts'],
          },
        ].map(m => (
          <div key={m.mode} style={{
            background: `${m.color}08`, borderRadius: 10, border: `1px solid ${m.color}30`, padding: '10px',
          }}>
            <div style={{ fontSize: 16, marginBottom: 4 }}>{m.emoji}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: m.color, marginBottom: 6 }}>{m.mode}</div>
            {m.pros.map((p, i) => (
              <div key={i} style={{ fontSize: 9, color: m.color, marginBottom: 2 }}>✓ {p}</div>
            ))}
            {m.cons.map((c, i) => (
              <div key={i} style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>✗ {c}</div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: DIM, lineHeight: 1.6 }}>
        {ru
          ? '🏆 Рекомендуется: Pool для стабильного дохода. Solo — если хочешь рискнуть на большой куш. Pool требует состоять в синдикате — вступи или создай (2000 IGC).'
          : '🏆 Recommended: Pool for stable income. Solo if you want to gamble for a big payout. Pool requires being in a syndicate — join or create one (2000 IGC).'}
      </div>
    </InfoBlock>
  );
}

// ── Пул наград и Халвинг ──────────────────────────────────
function PoolAndHalvingSection({ ru }: { ru: boolean }) {
  const phases = ru ? [
    { phase: 1, rate: '4%/день', threshold: '< 1 000 TON выплачено', color: GR },
    { phase: 2, rate: '2%/день', threshold: '1 000–10 000 TON',       color: CY },
    { phase: 3, rate: '1%/день', threshold: '10 000–100 000 TON',     color: YL },
    { phase: 4, rate: '0.5%/день', threshold: '> 100 000 TON (навсегда)', color: OR },
  ] : [
    { phase: 1, rate: '4%/day', threshold: '< 1,000 TON paid out', color: GR },
    { phase: 2, rate: '2%/day', threshold: '1,000–10,000 TON',     color: CY },
    { phase: 3, rate: '1%/day', threshold: '10,000–100,000 TON',   color: YL },
    { phase: 4, rate: '0.5%/day', threshold: '> 100,000 TON (permanent)', color: OR },
  ];

  return (
    <InfoBlock emoji="💰" title={ru ? 'Пул наград и Халвинг' : 'Reward Pool & Halving'} color={YL}
      subtitle={ru ? 'Как рассчитываются выплаты и как меняется ставка' : 'How payouts are calculated and how the rate changes'}>
      <QA color={YL}
        q={ru ? 'Как рассчитывается твоя награда?' : 'How is your reward calculated?'}
        a={ru
          ? 'Каждые 5 минут (эпоха): R_эпохи = Пул × ставка_дня / 288. Твоя доля: (твой_хешрейт / глобальный_хешрейт) × R_эпохи. Больше хешрейт = больше TON.'
          : 'Every 5 minutes (epoch): R_epoch = Pool × daily_rate / 288. Your share: (your_hashrate / global_hashrate) × R_epoch. More hashrate = more TON.'}
      />
      <div style={{ fontSize: 10, fontWeight: 700, color: YL, marginTop: 8, marginBottom: 6 }}>
        {ru ? '⚡ Фазы халвинга (по объёму выплат):' : '⚡ Halving phases (by total paid out):'}
      </div>
      {phases.map((p, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none',
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
            background: `${p.color}20`, border: `1px solid ${p.color}50`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 800, color: p.color,
          }}>{p.phase}</div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: p.color }}>{p.rate}</span>
            <span style={{ fontSize: 9, color: DIM, marginLeft: 6 }}>{p.threshold}</span>
          </div>
        </div>
      ))}
      <div style={{ marginTop: 8, fontSize: 10, color: DIM, lineHeight: 1.5 }}>
        {ru
          ? '💡 В Фазе 1 ставка максимальная — самое выгодное время играть. Халвинг происходит по объёму выплат, не по времени. В Фазе 2 открываются ASIC S19, Гараж, Ангар.'
          : '💡 Phase 1 has the highest rate — best time to play. Halving is triggered by total payouts, not time. Phase 2 unlocks ASIC S19, Garage, Hangar.'}
      </div>
    </InfoBlock>
  );
}

// ── IGC-рынок ─────────────────────────────────────────────
function IgcMarketSection({ ru }: { ru: boolean }) {
  return (
    <InfoBlock emoji="💎" title={ru ? 'IGC-рынок' : 'IGC Market'} color={PU}
      subtitle={ru ? 'Динамическая цена, обменник IGC ↔ TON' : 'Dynamic price, IGC ↔ TON exchange'}>
      <QA color={PU}
        q={ru ? 'Как формируется цена IGC?' : 'How is IGC price determined?'}
        a={ru
          ? 'Цена = 0.0001 TON / max(0.5, ratio). Ratio = сглаженное отношение добытых IGC к сожжённым. Дефицит (ratio < 1) → цена растёт. Профицит (ratio > 1) → цена падает.'
          : 'Price = 0.0001 TON / max(0.5, ratio). Ratio = smoothed ratio of minted IGC to burned IGC. Deficit (ratio < 1) → price rises. Surplus (ratio > 1) → price falls.'}
      />
      <QA color={PU}
        q={ru ? 'Когда выгодно продавать IGC?' : 'When is it good to sell IGC?'}
        a={ru
          ? 'В дефиците (ratio < 1, Fear & Greed зелёный) — цена высокая, продавай. Летом — электричество дешевле, значит больше чистого IGC. Осенью цена ещё держится, но скоро упадёт.'
          : 'During deficit (ratio < 1, Fear & Greed green) — price is high, sell. In summer — electricity is cheaper so more net IGC. In autumn price still holds but will drop soon.'}
      />
      <QA color={PU}
        q={ru ? 'Что такое комиссия?' : 'What is the fee?'}
        a={ru ? 'Оба направления (sell и buy) берут 3% комиссию платформы. Сумма "Получишь" уже показывается с учётом комиссии.' : 'Both directions (sell and buy) charge a 3% platform fee. The "You\'ll get" amount is already shown net of fees.'}
      />
      <div style={{
        marginTop: 8, padding: '8px 10px', borderRadius: 8,
        background: 'rgba(189,0,255,0.08)', border: '1px solid rgba(189,0,255,0.25)',
        fontSize: 10, color: PU, lineHeight: 1.5,
      }}>
        {ru
          ? '💡 IGC сжигается через: электричество фермы, ремонт GPU, апгрейды за IGC, взносы в казну синдиката. Это снижает ratio → повышает цену IGC.'
          : '💡 IGC is burned via: farm electricity, GPU repairs, IGC-priced upgrades, syndicate treasury contributions. This lowers ratio → raises IGC price.'}
      </div>
    </InfoBlock>
  );
}

// ── Синдикаты ─────────────────────────────────────────────
function SyndicateSection({ ru }: { ru: boolean }) {
  const bonuses = ru ? [
    { lv: 10, h: '+3%',  w: '—',   m: 10 },
    { lv: 20, h: '+8%',  w: '−10%', m: 10 },
    { lv: 30, h: '+15%', w: '−10%', m: 12 },
    { lv: 40, h: '+24%', w: '−20%', m: 14 },
    { lv: 50, h: '+35%', w: '−30%', m: 16 },
  ] : [
    { lv: 10, h: '+3%',  w: '—',    m: 10 },
    { lv: 20, h: '+8%',  w: '−10%', m: 10 },
    { lv: 30, h: '+15%', w: '−10%', m: 12 },
    { lv: 40, h: '+24%', w: '−20%', m: 14 },
    { lv: 50, h: '+35%', w: '−30%', m: 16 },
  ];

  return (
    <InfoBlock emoji="⚔️" title={ru ? 'Синдикаты' : 'Syndicates'} color={GR}
      subtitle={ru ? 'Объединяйся с другими майнерами для бонусов и Pool-режима' : 'Team up with other miners for bonuses and Pool mode'}>
      <QA color={GR}
        q={ru ? 'Зачем синдикат?' : 'Why join a syndicate?'}
        a={ru
          ? 'Pool-майнинг (стабильный TON) доступен только членам синдиката. Плюс пассивные бонусы: +хешрейт и −износ для всех участников, которые растут с уровнем синдиката.'
          : 'Pool mining (stable TON) is only available to syndicate members. Plus passive bonuses: +hashrate and −wear for all members, growing with syndicate level.'}
      />
      <QA color={GR}
        q={ru ? 'Как создать или вступить?' : 'How to create or join?'}
        a={ru
          ? 'Создать синдикат: 2000 IGC (ты становишься лидером). Вступить бесплатно — найди синдикат с местами в разделе Синдикат. Один игрок — один синдикат.'
          : 'Create a syndicate: 2000 IGC (you become leader). Join for free — find a syndicate with open slots. One player — one syndicate.'}
      />
      <QA color={GR}
        q={ru ? 'Как работает XP и уровни?' : 'How do XP and levels work?'}
        a={ru
          ? '1 IGC в казну = 1 XP. +50 XP при победе в Solo-блоке. Уровни 1–50. Уровни 10, 20, 30, 40, 50 дают milestone-бонусы для всех участников.'
          : '1 IGC to treasury = 1 XP. +50 XP when a member wins a solo block. Levels 1–50. Levels 10, 20, 30, 40, 50 give milestone bonuses to all members.'}
      />
      <div style={{ fontSize: 10, fontWeight: 700, color: GR, marginTop: 8, marginBottom: 4 }}>
        {ru ? 'Milestone-бонусы по уровням:' : 'Milestone bonuses by level:'}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {bonuses.map((b, i) => (
          <div key={i} style={{
            background: 'rgba(0,255,136,0.07)', border: '1px solid rgba(0,255,136,0.2)',
            borderRadius: 7, padding: '4px 8px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: GR }}>Lv{b.lv}</div>
            <div style={{ fontSize: 8, color: CY }}>{b.h} {ru ? 'хеш' : 'hash'}</div>
            {b.w !== '—' && <div style={{ fontSize: 8, color: YL }}>{b.w} {ru ? 'износ' : 'wear'}</div>}
            <div style={{ fontSize: 8, color: DIM }}>{b.m} {ru ? 'мест' : 'slots'}</div>
          </div>
        ))}
      </div>
    </InfoBlock>
  );
}

// ── Антимонопольное законодательство ─────────────────────
function AntitrustSection({ ru }: { ru: boolean }) {
  const phases = [
    { phase: 1, player: '15%', syndicate: '25%', color: GR },
    { phase: 2, player: '10%', syndicate: '20%', color: CY },
    { phase: 3, player: '5%',  syndicate: '15%', color: YL },
  ];

  return (
    <InfoBlock emoji="⚖️"
      title={ru ? 'Антимонопольное законодательство' : 'Antitrust Law'}
      color={YL}
      subtitle={ru
        ? 'Ограничивает монополию на пул наград — никто не может захватить слишком много'
        : 'Prevents reward pool monopoly — no one can capture too large a share'}>

      <div style={{ fontSize: 10, color: DIM, lineHeight: 1.6, marginBottom: 10 }}>
        {ru
          ? 'Вступает в силу когда глобальный хешрейт сети превысит 200 GH/s. При превышении лимитов хешрейт игрока или синдиката автоматически урезается до максимально допустимого — карты продолжают работать, IGC добывается, но доля в TON-пуле ограничена.'
          : 'Activates when global network hashrate exceeds 200 GH/s. When limits are exceeded, the player\'s or syndicate\'s hashrate is automatically capped — GPUs keep working, IGC is earned, but the TON pool share is limited.'}
      </div>

      {/* Таблица по фазам */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: DIM, padding: '4px 0' }}>{ru ? 'Фаза' : 'Phase'}</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: DIM, padding: '4px 0' }}>{ru ? 'Игрок макс.' : 'Player max'}</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: DIM, padding: '4px 0' }}>{ru ? 'Синдикат макс.' : 'Syndicate max'}</div>
        {phases.map(p => (
          <>
            <div key={`p${p.phase}`} style={{ fontSize: 11, fontWeight: 700, color: p.color, padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              {ru ? `Фаза ${p.phase}` : `Phase ${p.phase}`}
            </div>
            <div key={`pl${p.phase}`} style={{ fontSize: 11, fontWeight: 700, color: p.color, padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              {p.player}
            </div>
            <div key={`s${p.phase}`} style={{ fontSize: 11, fontWeight: 700, color: p.color, padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              {p.syndicate}
            </div>
          </>
        ))}
      </div>

      <div style={{ fontSize: 10, color: YL, background: 'rgba(255,215,0,0.07)', border: '1px solid rgba(255,215,0,0.2)', borderRadius: 8, padding: '7px 10px', lineHeight: 1.6 }}>
        {ru
          ? '💡 Закон стимулирует игроков распределяться по разным синдикатам. Если твой синдикат слишком мощный — выгоднее перейти в меньший и получать полный хешрейт без ограничений.'
          : '💡 The law encourages players to spread across different syndicates. If your syndicate is too powerful — it\'s more profitable to join a smaller one and earn full hashrate without limits.'}
      </div>
    </InfoBlock>
  );
}

// ── Рефералы ─────────────────────────────────────────────
function ReferralSection({ ru }: { ru: boolean }) {
  return (
    <InfoBlock emoji="👥" title={ru ? 'Реферальная программа' : 'Referral Program'} color={OR}
      subtitle={ru ? 'Приглашай друзей — получай бонус к хешрейту и IGC' : 'Invite friends — earn hashrate and IGC bonuses'}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        {[
          { level: 'L1', bonus: ru ? '+5% хешрейт' : '+5% hashrate', igc: ru ? '10% IGC за эпоху' : '10% IGC/epoch', color: GR,
            desc: ru ? 'Прямой реферал' : 'Direct referral' },
          { level: 'L2', bonus: ru ? '+2% хешрейт' : '+2% hashrate', igc: ru ? '3% IGC за эпоху' : '3% IGC/epoch', color: YL,
            desc: ru ? 'Реферал реферала' : 'Referral of referral' },
        ].map(r => (
          <div key={r.level} style={{
            background: `${r.color}08`, borderRadius: 10, border: `1px solid ${r.color}30`, padding: '10px',
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: r.color, marginBottom: 4 }}>{r.level}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 5 }}>{r.desc}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: r.color }}>{r.bonus}</div>
            <div style={{ fontSize: 10, color: GR, fontWeight: 600, marginTop: 2 }}>{r.igc}</div>
          </div>
        ))}
      </div>
      <QA color={OR}
        q={ru ? 'Как работает бонус хешрейта?' : 'How does the hashrate bonus work?'}
        a={ru
          ? 'Хешрейт твоего реферала добавляется к твоему расчётному. Если у реферала 30 GH/s — ты получаешь +1.5 GH/s (5%) к своей доле в пуле. Работает независимо от твоего режима (Solo или Pool).'
          : 'Your referral\'s hashrate is added to your effective hashrate. If they have 30 GH/s — you get +1.5 GH/s (5%) to your pool share. Works regardless of your mode (Solo or Pool).'}
      />
      <QA color={OR}
        q={ru ? 'Как работает IGC-бонус?' : 'How does the IGC bonus work?'}
        a={ru
          ? 'Каждые 5 минут ты получаешь 10% от IGC, заработанного L1-рефералом, и 3% от L2. Это пассивный доход сверх твоего майнинга — автоматически.'
          : 'Every 5 minutes you receive 10% of IGC earned by your L1 referral, and 3% from L2. This is passive income on top of your mining — automatic.'}
      />
      <div style={{ marginTop: 6, fontSize: 10, color: DIM, lineHeight: 1.5 }}>
        {ru
          ? '🔗 Реф-ссылка в разделе Компания. Поделись с друзьями — чем активнее реферал, тем больше твой бонус.'
          : '🔗 Referral link is in the Company section. The more active your referral, the bigger your bonus.'}
      </div>
    </InfoBlock>
  );
}

// ── AdBoost ───────────────────────────────────────────────
function AdBoostSection({ ru }: { ru: boolean }) {
  return (
    <InfoBlock emoji="📺" title={ru ? 'Реклама-буст' : 'Ad Boost'} color={CY}
      subtitle={ru ? 'Смотри рекламу — получай временный бонус к хешрейту' : 'Watch ads — get a temporary hashrate boost'}>
      {[
        { q: ru ? 'Что даёт?' : 'What does it give?', a: ru ? '+10% к хешрейту фермы на время действия буста. Применяется при каждом расчёте эпохи.' : '+10% to farm hashrate for the boost duration. Applied each epoch calculation.' },
        { q: ru ? 'Сколько длится?' : 'How long does it last?', a: ru ? '1 просмотр = +5 минут буста. Максимум 10 просмотров подряд = 50 минут. После 10 просмотров — cooldown 4 часа.' : '1 view = +5 minutes of boost. Max 10 views in a row = 50 minutes. After 10 views — 4 hour cooldown.' },
        { q: ru ? 'Где найти?' : 'Where to find it?', a: ru ? 'На вкладке Ферма, кнопка AdBoost внизу страницы. Таймер показывает оставшееся время буста (синий) или cooldown (красный).' : 'On the Farm tab, AdBoost button at the bottom. Timer shows remaining boost time (blue) or cooldown (red).' },
      ].map((item, i) => <QA key={i} color={CY} q={item.q} a={item.a} />)}
    </InfoBlock>
  );
}

// ── Вывод TON ─────────────────────────────────────────────
function WithdrawSection({ ru }: { ru: boolean }) {
  return (
    <InfoBlock emoji="💸" title={ru ? 'Вывод TON' : 'TON Withdrawal'} color={YL}
      subtitle={ru ? 'Как вывести заработанный TON на кошелёк' : 'How to withdraw earned TON to your wallet'}>
      {[
        { q: ru ? 'Как вывести?' : 'How to withdraw?', a: ru ? 'Подключи TON-кошелёк через TON Connect (кнопка на Дашборде). Укажи сумму. Запрос попадёт в очередь и обработается в течение нескольких минут.' : 'Connect a TON wallet via TON Connect (button on Dashboard). Enter amount. Request enters a queue and is processed within minutes.' },
        { q: ru ? 'Есть ли ограничения?' : 'Are there limits?', a: ru ? 'Суточный лимит вывода — 1% от резервного пула (суммарно по всем игрокам). Для новых аккаунтов — выдержка 48 часов с момента регистрации.' : 'Daily withdrawal limit — 1% of the reserve pool (across all players). New accounts must wait 48 hours after registration.' },
        { q: ru ? 'Почему задержка?' : 'Why the delay?', a: ru ? 'Лимит защищает пул от быстрого истощения. Если лимит исчерпан — запрос встанет в очередь на следующий день.' : 'The limit protects the pool from rapid depletion. If the limit is exhausted — your request queues for the next day.' },
      ].map((item, i) => <QA key={i} color={YL} q={item.q} a={item.a} />)}
    </InfoBlock>
  );
}

// ── Fear & Greed + Leaderboard ────────────────────────────
function ExtrasSection({ ru }: { ru: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <InfoBlock emoji="😱" title={ru ? 'Fear & Greed Index' : 'Fear & Greed Index'} color={RE}
        subtitle={ru ? 'Индикатор состояния IGC-рынка' : 'IGC market condition indicator'}>
        <div style={{ fontSize: 10, color: DIM, lineHeight: 1.6 }}>
          {ru
            ? 'Показывает текущий ratio IGC (добыто / сожжено). Зелёный (дефицит, ratio < 1) — IGC в дефиците, цена высокая, хорошее время продать. Красный (профицит, ratio > 1) — много IGC, цена низкая, хорошее время купить. Используй как подсказку для торговли на рынке.'
            : 'Shows current IGC ratio (minted / burned). Green (deficit, ratio < 1) — IGC is scarce, price high, good time to sell. Red (surplus, ratio > 1) — lots of IGC, price low, good time to buy. Use as a signal for market trading.'}
        </div>
      </InfoBlock>
      <InfoBlock emoji="🏆" title={ru ? 'Рейтинг (Leaderboard)' : 'Leaderboard'} color={YL}
        subtitle={ru ? 'Топ-100 игроков по хешрейту' : 'Top-100 players by hashrate'}>
        <div style={{ fontSize: 10, color: DIM, lineHeight: 1.6 }}>
          {ru
            ? 'Рейтинг считается по суммарному хешрейту активных GPU с учётом OC (+20%) и UV (−15%). Чем выше в рейтинге — тем больше твоя доля в пуле и тем больше TON ты получаешь. Медали 🥇🥈🥉 — для топ-3.'
            : 'Rating is calculated from total hashrate of active GPUs including OC (+20%) and UV (−15%). Higher rank = bigger pool share = more TON per epoch. Medals 🥇🥈🥉 for top 3.'}
        </div>
      </InfoBlock>
    </div>
  );
}

// ── Сезонность ────────────────────────────────────────────
function SeasonSection({ ru }: { ru: boolean }) {
  const seasons = [
    { emoji: '🌸', name: ru ? 'Весна' : 'Spring', days: ru ? 'Дни 1–7' : 'Days 1–7', reward: '+0% → +25%', elec: ru ? 'Норма → −12%' : 'Normal → −12%', color: '#FF9EBC', tip: ru ? 'Награды начинают расти. Хорошее время купить GPU и запастись IGC.' : 'Rewards start growing. Good time to buy GPUs and stock up on IGC.' },
    { emoji: '☀️', name: ru ? 'Лето' : 'Summer', days: ru ? 'Дни 8–14' : 'Days 8–14', reward: '+25%', elec: ru ? '−25% дешевле' : '−25% cheaper', color: '#FFD700', tip: ru ? 'Пик наград и самое дешёвое электричество. Включай разгон — сейчас он окупается лучше всего.' : 'Peak rewards and cheapest electricity. Enable overclock — it pays off best now.' },
    { emoji: '🍂', name: ru ? 'Осень' : 'Autumn', days: ru ? 'Дни 15–21' : 'Days 15–21', reward: '+25% → 0%', elec: ru ? 'Норма → +12%' : 'Normal → +12%', color: '#FF8C42', tip: ru ? 'Награды падают, электричество дорожает. Умные продают IGC пока цена ещё высокая.' : 'Rewards decline, electricity gets pricier. Smart players sell IGC while the price is still high.' },
    { emoji: '❄️', name: ru ? 'Зима' : 'Winter', days: ru ? 'Дни 22–28' : 'Days 22–28', reward: '−25%', elec: ru ? '+25% дороже' : '+25% more expensive', color: '#00D4FF', tip: ru ? 'Минимум наград, максимум расходов на свет. Выключай разгон и экономь IGC.' : 'Lowest rewards, highest electricity. Disable overclock and conserve IGC.' },
  ];

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>🗓️</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{ru ? 'Сезонный цикл (28 дней)' : 'Season Cycle (28 days)'}</div>
          <div style={{ fontSize: 10, color: DIM, marginTop: 1 }}>{ru ? 'Каждые 28 дней меняется доходность майнинга и стоимость электричества' : 'Every 28 days mining rewards and electricity costs shift'}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
        {seasons.map(s => (
          <div key={s.name} style={{ background: `${s.color}10`, border: `1px solid ${s.color}33`, borderRadius: 10, padding: '10px' }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{s.emoji}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: s.color }}>{s.name}</div>
            <div style={{ fontSize: 9, color: DIM, marginBottom: 5 }}>{s.days}</div>
            <div style={{ fontSize: 9, lineHeight: 1.7 }}>
              <div><span style={{ color: DIM }}>{ru ? 'Награды: ' : 'Rewards: '}</span><span style={{ color: s.color, fontWeight: 700 }}>{s.reward}</span></div>
              <div><span style={{ color: DIM }}>{ru ? 'Свет: ' : 'Elec: '}</span><span style={{ color: s.color, fontWeight: 700 }}>{s.elec}</span></div>
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 5, lineHeight: 1.5 }}>{s.tip}</div>
          </div>
        ))}
      </div>
      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>📊 {ru ? 'Пример: RTX 3070 за 28 дней' : 'Example: RTX 3070 over 28 days'}</div>
        {[
          { season: `🌸 ${ru ? 'Весна' : 'Spring'}`, ton: ru ? '~0.09 TON/день → растёт до 0.12' : '~0.09 TON/day → grows to 0.12', igc: ru ? 'свет ~216 IGC/день' : 'elec ~216 IGC/day', color: '#FF9EBC' },
          { season: `☀️ ${ru ? 'Лето' : 'Summer'}`, ton: ru ? '~0.12 TON/день (пик)' : '~0.12 TON/day (peak)', igc: ru ? 'свет ~162 IGC/день (−25%)' : 'elec ~162 IGC/day (−25%)', color: '#FFD700' },
          { season: `🍂 ${ru ? 'Осень' : 'Autumn'}`, ton: ru ? '~0.12 → 0.09 TON/день' : '~0.12 → 0.09 TON/day', igc: ru ? 'свет растёт до 243 IGC/день' : 'elec rises to 243 IGC/day', color: '#FF8C42' },
          { season: `❄️ ${ru ? 'Зима' : 'Winter'}`, ton: ru ? '~0.09 TON/день (дно)' : '~0.09 TON/day (bottom)', igc: ru ? 'свет ~270 IGC/день (+25%)' : 'elec ~270 IGC/day (+25%)', color: '#00D4FF' },
        ].map((row, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: row.color, minWidth: 70 }}>{row.season}</div>
            <div style={{ flex: 1, paddingLeft: 8 }}>
              <div style={{ fontSize: 9, color: '#FFD700' }}>💰 {row.ton}</div>
              <div style={{ fontSize: 9, color: DIM }}>⚡ {row.igc}</div>
            </div>
          </div>
        ))}
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 8, lineHeight: 1.5 }}>
          {ru ? '* Цифры приблизительные. Реальный доход зависит от общего хешрейта сети.' : '* Numbers are approximate. Actual income depends on total network hashrate.'}
        </div>
      </div>
    </div>
  );
}

// ── Главный компонент ──────────────────────────────────────
export function Guide() {
  const { lang } = useLang();
  const ru = lang === 'ru';
  const cards = useCards();
  const farmCards = cards.filter(c => c.scope === 'farm');
  const gpuCards  = cards.filter(c => c.scope === 'gpu');

  return (
    <div style={{ padding: '12px 16px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Заголовок */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0,212,255,0.1), rgba(189,0,255,0.08))',
        borderRadius: 16, padding: '14px 16px', border: '1px solid rgba(0,212,255,0.2)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: CY, letterSpacing: 1 }}>
          {ru ? '📖 Гайд по Syndicate Miner' : '📖 Syndicate Miner Guide'}
        </div>
        <div style={{ fontSize: 11, color: DIM, marginTop: 3 }}>
          {ru ? 'Всё о механиках игры — от старта до топа' : 'Everything about game mechanics — from start to top'}
        </div>
      </div>

      {/* Путь новичка */}
      <BeginnerPath ru={ru} />

      {/* Советы */}
      <Tip emoji="🌡️" color={OR} text={ru ? 'Температура влияет на износ GPU. Выше 75°C — быстро изнашиваются. Выше 85°C — критично. Снижай через охлаждение фермы, жидкостное охлаждение, термопасту.' : 'Temperature affects GPU wear. Above 75°C — wears fast. Above 85°C — critical. Lower via farm cooling, liquid cooling, and thermal paste.'} />
      <Tip emoji="⏱️" color={GR} text={ru ? 'Uptime — сколько часов в сутки GPU реально майнит. Базовый уровень 80–95% в зависимости от GPU. Повышается через ИБП, Провайдера и Вентилятор.' : 'Uptime — how many hours a day the GPU actually mines. Base is 80–95% depending on GPU. Boosted by UPS, Provider and Fan.'} />
      <Tip emoji="⚡" color={PU} text={ru ? 'Электричество списывается каждые 5 минут в IGC. Если IGC на ферме закончились — GPU уходят в офлайн и перестают майнить.' : 'Electricity is charged every 5 minutes in IGC. If IGC runs out — GPUs go offline and stop mining.'} />

      {/* Механики */}
      <SectionLabel text={ru ? 'МЕХАНИКИ МАЙНИНГА' : 'MINING MECHANICS'} color={CY} />
      <MiningModeSection ru={ru} />
      <WearSection ru={ru} />
      <PoolAndHalvingSection ru={ru} />
      <SeasonSection ru={ru} />

      {/* Экономика */}
      <SectionLabel text={ru ? 'ЭКОНОМИКА' : 'ECONOMY'} color={PU} />
      <IgcMarketSection ru={ru} />
      <SyndicateSection ru={ru} />
      <AntitrustSection ru={ru} />
      <ReferralSection ru={ru} />

      {/* Апгрейды фермы */}
      <SectionLabel text={ru ? 'АПГРЕЙДЫ ФЕРМЫ' : 'FARM UPGRADES'} color={CY} />
      {farmCards.map(c => <Card key={c.title} card={c} />)}
      <FarmPrioritySection ru={ru} />

      {/* Апгрейды GPU */}
      <SectionLabel text={ru ? 'АПГРЕЙДЫ GPU (на каждую карточку отдельно)' : 'GPU UPGRADES (per card separately)'} color={PU} />
      {gpuCards.map(c => <Card key={c.title} card={c} />)}

      {/* Режимы GPU */}
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: CY, marginBottom: 10 }}>
          ⚡ {ru ? 'Разгон и Андервольт' : 'Overclock & Undervolt'}
        </div>

        {/* OC */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: CY }}>{ru ? 'Разгон (OC)' : 'Overclock (OC)'}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {[
              { text: ru ? '+20% хешрейт' : '+20% hashrate', color: CY },
              { text: ru ? '+20% IGC-расход' : '+20% IGC cost', color: RE },
              { text: ru ? '+15°C температура' : '+15°C temp', color: RE },
              { text: ru ? '×2.5 износ' : '×2.5 wear', color: RE },
            ].map(b => (
              <span key={b.text} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${b.color}15`, border: `1px solid ${b.color}33`, color: b.color }}>{b.text}</span>
            ))}
          </div>
          <div style={{ fontSize: 10, color: DIM, lineHeight: 1.6 }}>
            {ru
              ? 'Включай разгон только когда это окупается — в Лето (дешёвое электричество, максимум наград) или если у тебя хорошее охлаждение. При разгоне карта изнашивается в 2.5× быстрее — с RX 580 до 50% здоровья за ~12 дней вместо 33. Перед включением убедись: Охлаждение Lv2+, достаточно IGC на ремонт.'
              : 'Enable overclock only when it pays off — in Summer (cheap electricity, peak rewards) or with good cooling. OC speeds wear 2.5× — RX 580 hits 50% health in ~12 days instead of 33. Before enabling: make sure you have Cooling Lv2+, enough IGC for repairs.'}
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: CY, background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 7, padding: '5px 8px' }}>
            {ru
              ? '💡 Лучше всего работает в Лето: электро −25%, награды +25%. Зимой OC убыточен — выключай.'
              : '💡 Best in Summer: −25% electricity, +25% rewards. In Winter OC is unprofitable — disable it.'}
          </div>
        </div>

        {/* UV */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 16 }}>🔋</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: GR }}>{ru ? 'Андервольт (UV)' : 'Undervolt (UV)'}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {[
              { text: ru ? '−15% хешрейт' : '−15% hashrate', color: RE },
              { text: ru ? '−10% IGC-расход' : '−10% IGC cost', color: GR },
              { text: ru ? '−5°C температура' : '−5°C temp', color: GR },
              { text: ru ? '−30% износ' : '−30% wear', color: GR },
            ].map(b => (
              <span key={b.text} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${b.color}15`, border: `1px solid ${b.color}33`, color: b.color }}>{b.text}</span>
            ))}
          </div>
          <div style={{ fontSize: 10, color: DIM, lineHeight: 1.6 }}>
            {ru
              ? 'Андервольт — режим бережной работы. Хешрейт падает на 15%, но GPU живёт на 30% дольше и тратит на 10% меньше IGC. Особенно полезен когда: не хватает IGC, карта сильно изношена, идёт Зима (дорогое электричество), нет денег на апгрейды охлаждения.'
              : 'Undervolt is a gentle mode. Hashrate drops 15%, but GPU lasts 30% longer and uses 10% less IGC. Especially useful when: IGC is low, GPU is worn, it\'s Winter (expensive electricity), or you can\'t afford cooling upgrades.'}
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: GR, background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 7, padding: '5px 8px' }}>
            {ru
              ? '💡 UV — отличный выбор для ASIC S19 и RTX 4090: меньше IGC тратится, карта дольше служит до ремонта. Для дешёвых карт (RX 580) — обычно не нужен, они и без того экономичны.'
              : '💡 UV is a great choice for ASIC S19 and RTX 4090: less IGC spent, longer time before repair. For cheap GPUs (RX 580) — usually not needed, they\'re already efficient.'}
          </div>
        </div>

        <div style={{ marginTop: 10, padding: '6px 10px', borderRadius: 7, background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.2)', fontSize: 10, color: OR }}>
          ⚠️ {ru ? 'Разгон и Андервольт взаимно исключают друг друга — включение одного сбрасывает второй.' : 'Overclock and Undervolt are mutually exclusive — enabling one disables the other.'}
        </div>
      </div>

      {/* Прочее */}
      <SectionLabel text={ru ? 'ДОПОЛНИТЕЛЬНО' : 'ADDITIONAL'} color={YL} />
      {/* Стейкинг */}
      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '14px', border: '1px solid rgba(0,152,234,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 22 }}>🏦</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0098EA' }}>{ru ? 'Стейкинг TON' : 'TON Staking'}</div>
            <div style={{ fontSize: 10, color: DIM, marginTop: 1 }}>{ru ? '≈18.25% годовых в IGC при базовом курсе' : '≈18.25% annual yield in IGC at base price'}</div>
          </div>
        </div>
        {[
          { q: ru ? 'Как работает?' : 'How it works?', a: ru ? 'Застейкай TON → он добавляется в резервный пул (увеличивает награды всем майнерам) → каждые 5 минут тебе начисляется IGC.' : 'Stake TON → it\'s added to the reserve pool (boosts rewards for all miners) → every 5 minutes you earn IGC.' },
          { q: ru ? 'Сколько IGC начисляется?' : 'How much IGC do I earn?', a: ru ? 'Базовая ставка: 5 IGC за 1 TON в сутки (≈18.25% годовых). Ставка динамическая: при дефиците IGC (ratio < 1) растёт до 15 IGC/TON/день; при профиците снижается до 2.5.' : 'Base rate: 5 IGC per TON per day (≈18.25% annual). Rate is dynamic: during IGC deficit (ratio < 1) rises to 15 IGC/TON/day; during surplus drops to 2.5.' },
          { q: ru ? 'Как вывести?' : 'How to unstake?', a: ru ? 'Вывод ограничен 1% от пула в сутки (суммарно по всем игрокам). Минимум 1 TON. Если лимит исчерпан — жди следующего дня.' : 'Withdrawals limited to 1% of pool per day (across all players). Minimum 1 TON. If limit is exhausted — wait until next day.' },
        ].map((item, i) => (
          <div key={i} style={{ padding: '8px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0098EA', marginBottom: 3 }}>{item.q}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{item.a}</div>
          </div>
        ))}
      </div>
      <AdBoostSection ru={ru} />
      <WithdrawSection ru={ru} />
      <ExtrasSection ru={ru} />

      {/* ── УВЕДОМЛЕНИЯ И СОБЫТИЯ ────────────────────────── */}
      <SectionLabel text={ru ? 'УВЕДОМЛЕНИЯ И СОБЫТИЯ' : 'ALERTS & EVENTS'} color={RE} />

      {/* Предупреждения о здоровье */}
      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '14px', border: `1px solid ${RE}33` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 22 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: RE }}>{ru ? 'Здоровье GPU и поломки' : 'GPU Health & Breakdowns'}</div>
            <div style={{ fontSize: 10, color: DIM, marginTop: 1 }}>{ru ? 'Следи за состоянием карт — иначе потеряешь майнинг' : 'Monitor card health — or lose mining time'}</div>
          </div>
        </div>
        {[
          { emoji: '🟢', text: ru ? '60–100% — норма. Карта майнит стабильно.' : '60–100% — normal. Card mines stably.' },
          { emoji: '🟠', text: ru ? '30–60% — нужен ремонт. Карточка на Ферме подсвечена оранжевым. Зайди и почини.' : '30–60% — repair needed. Card highlighted orange in Farm. Go repair it.' },
          { emoji: '🔴', text: ru ? '< 30% — критический износ. Мигает красным, риск поломки сегодня ~31-89%. Бот пришлёт предупреждение.' : '< 30% — critical wear. Red pulse, break risk today 31-89%. Bot sends a warning.' },
          { emoji: '💥', text: ru ? '0% — карта сломана и остановила майнинг. Бот немедленно уведомит. Нужен Верстак для ремонта.' : '0% — card broke and stopped mining. Bot notifies immediately. Workbench required for repair.' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            <span style={{ fontSize: 14 }}>{item.emoji}</span>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>{item.text}</div>
          </div>
        ))}
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,51,85,0.08)', border: '1px solid rgba(255,51,85,0.2)' }}>
          <div style={{ fontSize: 10, color: DIM, lineHeight: 1.6 }}>
            {ru
              ? '🔔 Вкладка "Ферма" показывает красный бейдж с количеством сломанных и критических карт — даже если ты в другом разделе.'
              : '🔔 The "Farm" tab shows a red badge with the count of broken and critical cards — even when you\'re in another section.'}
          </div>
        </div>
      </div>

      {/* Случайные события */}
      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '14px', border: `1px solid ${YL}33` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 22 }}>🎲</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: YL }}>{ru ? 'Случайные события фермы' : 'Random Farm Events'}</div>
            <div style={{ fontSize: 10, color: DIM, marginTop: 1 }}>{ru ? 'Случаются примерно раз в 2 дня, виден баннер на Дашборде' : 'Happen ~once every 2 days, visible as a banner in Dashboard'}</div>
          </div>
        </div>
        {[
          { icon: '⚡', name: ru ? 'Удача майнера' : 'Lucky Miner',     color: YL,      desc: ru ? '+50% IGC на 30 минут для всех игроков. Самое прибыльное событие — заходи и майни!' : '+50% IGC for 30 minutes for all players. Best event — log in and mine!' },
          { icon: '🌡️', name: ru ? 'Волна жары' : 'Heat Wave',          color: OR,      desc: ru ? '+30% к стоимости электричества на 6 часов. Season Shield синдиката защищает от этого.' : '+30% to electricity cost for 6 hours. Syndicate Season Shield protects from this.' },
          { icon: '🔋', name: ru ? 'Скачок напряжения' : 'Power Surge',  color: GR,      desc: ru ? '−25% к электричеству на 2 часа. Выгодно — включай разгон если есть!' : '−25% electricity for 2 hours. Profitable — enable OC if you have it!' },
        ].map((ev, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 18 }}>{ev.icon}</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: ev.color, marginBottom: 2 }}>{ev.name}</div>
              <div style={{ fontSize: 10, color: DIM, lineHeight: 1.6 }}>{ev.desc}</div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
