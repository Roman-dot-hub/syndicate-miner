import { useState } from 'react';
import { useLang } from '../LangContext';

// ── Палитра ───────────────────────────────────────────────
const CY  = '#00D4FF';
const OR  = '#FF6B35';
const GR  = '#00FF88';
const PU  = '#BD00FF';
const YL  = '#FFD700';

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

// ── Карточки ──────────────────────────────────────────────
function useCards(): UpgradeCard[] {
  const { lang } = useLang();
  const ru = lang === 'ru';

  return [
    /* ── ПОМЕЩЕНИЕ ── */
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

    /* ── ОХЛАЖДЕНИЕ ФЕРМЫ ── */
    {
      emoji: '🌡️', color: CY, scope: 'farm',
      title:    ru ? 'Охлаждение' : 'Cooling',
      subtitle: ru ? 'Снижает скорость износа всех GPU' : 'Reduces wear rate of all GPUs',
      levels: [
        { label: ru ? 'Нет'  : 'None', effect: ru ? '×1.8 к износу' : '×1.8 wear',  cost: ru ? 'стартовое' : 'default', note: '⚠️' },
        { label: 'Lv 1',              effect: ru ? '×1.3 к износу' : '×1.3 wear',  cost: '100 IGC' },
        { label: 'Lv 2',              effect: ru ? '×1.0 нормальный' : '×1.0 normal', cost: '3 TON' },
        { label: 'Lv 3',              effect: ru ? '×0.85 пониженный' : '×0.85 low', cost: '15 TON' },
      ],
    },

    /* ── ВЕРСТАК ── */
    {
      emoji: '🔧', color: OR, scope: 'farm',
      title:    ru ? 'Верстак' : 'Workbench',
      subtitle: ru ? 'Открывает ремонт GPU (без верстака чинить нельзя)' : 'Unlocks GPU repair (repair requires a workbench)',
      levels: [
        { label: ru ? 'Нет'   : 'None',  effect: ru ? 'ремонт недоступен' : 'repair unavailable' },
        { label: 'Lv 1',                 effect: ru ? 'чинит T1–T2 (RX 580, GTX 1660 S)' : 'repairs T1–T2 (RX 580, GTX 1660 S)', cost: '500 IGC' },
        { label: 'Lv 2',                 effect: ru ? 'чинит T3–T4 (RTX 3070, RTX 4090)' : 'repairs T3–T4 (RTX 3070, RTX 4090)', cost: '5 TON' },
        { label: 'Lv 3',                 effect: ru ? 'чинит T5–T6 (ASIC S19, Quantum X1)' : 'repairs T5–T6 (ASIC S19, Quantum X1)', cost: '25 TON' },
      ],
    },

    /* ── СЕРВЕРНАЯ ── */
    {
      emoji: '❄️', color: CY, scope: 'farm',
      title:    ru ? 'Серверная' : 'Server Room',
      subtitle: ru ? 'Снижает базовую температуру всей фермы' : 'Lowers base temperature of the whole farm',
      levels: [
        { label: 'Lv 1', effect: '−5°C',  cost: '0.5 TON' },
        { label: 'Lv 2', effect: '−12°C', cost: '1.5 TON' },
        { label: 'Lv 3', effect: '−22°C', cost: '4 TON'   },
      ],
    },

    /* ── ИБП ── */
    {
      emoji: '🔋', color: GR, scope: 'farm',
      title:    ru ? 'ИБП (источник бесперебойного питания)' : 'UPS (Uninterruptible Power Supply)',
      subtitle: ru ? 'Повышает uptime GPU → больше часов в работе → больше TON' : 'Boosts GPU uptime → more hours mining → more TON',
      levels: [
        { label: 'Lv 1', effect: ru ? '+5% uptime'  : '+5% uptime',  cost: '0.4 TON' },
        { label: 'Lv 2', effect: ru ? '+12% uptime' : '+12% uptime', cost: '1 TON'   },
        { label: 'Lv 3', effect: ru ? '+20% uptime' : '+20% uptime', cost: '3 TON'   },
      ],
    },

    /* ── ПРОВАЙДЕР ── */
    {
      emoji: '📡', color: PU, scope: 'farm',
      title:    ru ? 'Провайдер' : 'ISP Contract',
      subtitle: ru ? 'Снижает стоимость электричества в IGC + uptime бонус' : 'Cuts electricity cost in IGC + uptime bonus',
      levels: [
        { label: 'Lv 1', effect: ru ? '−20% IGC · +2% uptime' : '−20% IGC · +2% uptime', cost: '0.2 TON' },
        { label: 'Lv 2', effect: ru ? '−40% IGC · +4% uptime' : '−40% IGC · +4% uptime', cost: '0.6 TON' },
        { label: 'Lv 3', effect: ru ? '−60% IGC · +6% uptime' : '−60% IGC · +6% uptime', cost: '1.5 TON' },
        { label: 'Lv 4', effect: ru ? '−80% IGC · +8% uptime' : '−80% IGC · +8% uptime', cost: '4 TON'   },
      ],
    },

    /* ── ЖИДКОСТНОЕ ОХЛАЖДЕНИЕ GPU ── */
    {
      emoji: '💧', color: CY, scope: 'gpu',
      title:    ru ? 'Жидкостное охлаждение' : 'Liquid Cooling',
      subtitle: ru ? 'Снижает температуру конкретного GPU. Чем ниже температура — тем медленнее износ' : 'Lowers temperature of one GPU. Lower temp = slower wear',
      levels: [
        { label: ru ? 'Воздух (стандарт)' : 'Air (default)', effect: '0°C',   cost: ru ? 'включено' : 'included' },
        { label: 'Lv 1', effect: '−10°C', cost: '500 IGC'  },
        { label: 'Lv 2', effect: '−20°C', cost: '1500 IGC' },
      ],
    },

    /* ── ТЕРМОПАСТА ── */
    {
      emoji: '🧴', color: OR, scope: 'gpu',
      title:    ru ? 'Термопаста' : 'Thermal Paste',
      subtitle: ru ? 'Снижает температуру GPU. Заменяется раз и навсегда' : 'Lowers GPU temperature. One-time permanent upgrade',
      levels: [
        { label: 'Lv 1', effect: '−5°C',  cost: '200 IGC'  },
        { label: 'Lv 2', effect: '−10°C', cost: '600 IGC'  },
        { label: 'Lv 3', effect: '−15°C', cost: '1500 IGC' },
      ],
    },

    /* ── ВЕНТИЛЯТОР GPU ── */
    {
      emoji: '🌀', color: GR, scope: 'gpu',
      title:    ru ? 'Вентилятор' : 'Fan',
      subtitle: ru ? 'Повышает uptime одного GPU — больше времени в работе' : 'Boosts uptime of one GPU — more time mining',
      levels: [
        { label: 'Lv 1', effect: '+4% uptime',  cost: '250 IGC'  },
        { label: 'Lv 2', effect: '+8% uptime',  cost: '750 IGC'  },
        { label: 'Lv 3', effect: '+12% uptime', cost: '1900 IGC' },
        { label: 'Lv 4', effect: '+16% uptime', cost: '4800 IGC' },
      ],
    },
  ];
}

// ── Карточка апгрейда ──────────────────────────────────────
function Card({ card }: { card: UpgradeCard }) {
  const [open, setOpen] = useState(false);
  const { lang } = useLang();
  const ru = lang === 'ru';

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid rgba(255,255,255,0.08)`,
      borderRadius: 14, overflow: 'hidden',
    }}>
      {/* Header */}
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
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1, lineHeight: 1.4 }}>
            {card.subtitle}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          <span style={{
            fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
            color: card.scope === 'farm' ? CY : PU,
            background: card.scope === 'farm' ? 'rgba(0,212,255,0.1)' : 'rgba(189,0,255,0.1)',
            border: `1px solid ${card.scope === 'farm' ? 'rgba(0,212,255,0.25)' : 'rgba(189,0,255,0.25)'}`,
            borderRadius: 4, padding: '2px 5px',
          }}>
            {card.scope === 'farm' ? (ru ? 'ФЕРМА' : 'FARM') : (ru ? 'GPU' : 'GPU')}
          </span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Levels table */}
      {open && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: '8px 14px 12px',
        }}>
          {card.levels.map((lv, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 0',
              borderBottom: i < card.levels.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Level dot */}
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
                        color: '#E74C3C', background: 'rgba(231,76,60,0.12)',
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

// ── Блок-подсказка ─────────────────────────────────────────
// ── Сезонность ────────────────────────────────────────────
function SeasonSection({ ru }: { ru: boolean }) {
  const seasons = [
    {
      emoji: '🌸', name: ru ? 'Весна' : 'Spring', days: ru ? 'Дни 1–7' : 'Days 1–7',
      reward: '+0% → +25%', elec: ru ? 'Норма → −12%' : 'Normal → −12%',
      color: '#FF9EBC',
      tip: ru
        ? 'Награды начинают расти. Хорошее время купить GPU и запастись IGC.'
        : 'Rewards start growing. Good time to buy GPUs and stock up on IGC.',
    },
    {
      emoji: '☀️', name: ru ? 'Лето' : 'Summer', days: ru ? 'Дни 8–14' : 'Days 8–14',
      reward: '+25%', elec: ru ? '−25% дешевле' : '−25% cheaper',
      color: '#FFD700',
      tip: ru
        ? 'Пик наград и самое дешёвое электричество. Включай разгон — сейчас он окупается лучше всего.'
        : 'Peak rewards and cheapest electricity. Enable overclock — it pays off best now.',
    },
    {
      emoji: '🍂', name: ru ? 'Осень' : 'Autumn', days: ru ? 'Дни 15–21' : 'Days 15–21',
      reward: '+25% → 0%', elec: ru ? 'Норма → +12%' : 'Normal → +12%',
      color: '#FF8C42',
      tip: ru
        ? 'Награды падают, электричество дорожает. Умные продают IGC пока цена ещё высокая.'
        : 'Rewards decline, electricity gets pricier. Smart players sell IGC while the price is still high.',
    },
    {
      emoji: '❄️', name: ru ? 'Зима' : 'Winter', days: ru ? 'Дни 22–28' : 'Days 22–28',
      reward: '−25%', elec: ru ? '+25% дороже' : '+25% more expensive',
      color: '#00D4FF',
      tip: ru
        ? 'Минимум наград, максимум расходов на свет. Выключай разгон и экономь IGC.'
        : 'Lowest rewards, highest electricity. Disable overclock and conserve IGC.',
    },
  ];

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: '14px',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      {/* Заголовок */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>🗓️</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
            {ru ? 'Сезонный цикл (28 дней)' : 'Season Cycle (28 days)'}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
            {ru
              ? 'Каждые 28 дней меняется доходность майнинга и стоимость электричества'
              : 'Every 28 days mining rewards and electricity costs shift'}
          </div>
        </div>
      </div>

      {/* Карточки сезонов */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
        {seasons.map(s => (
          <div key={s.name} style={{
            background: `${s.color}10`, border: `1px solid ${s.color}33`,
            borderRadius: 10, padding: '10px',
          }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{s.emoji}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: s.color }}>{s.name}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 5 }}>{s.days}</div>
            <div style={{ fontSize: 9, lineHeight: 1.7 }}>
              <div>
                <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {ru ? 'Награды: ' : 'Rewards: '}
                </span>
                <span style={{ color: s.color, fontWeight: 700 }}>{s.reward}</span>
              </div>
              <div>
                <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {ru ? 'Свет: ' : 'Elec: '}
                </span>
                <span style={{ color: s.color, fontWeight: 700 }}>{s.elec}</span>
              </div>
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 5, lineHeight: 1.5 }}>
              {s.tip}
            </div>
          </div>
        ))}
      </div>

      {/* Пример */}
      <div style={{
        background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 12px',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>
          📊 {ru ? 'Пример: RTX 3070 за 28 дней' : 'Example: RTX 3070 over 28 days'}
        </div>
        {[
          {
            season: `🌸 ${ru ? 'Весна' : 'Spring'}`,
            ton: ru ? '~0.09 TON/день → растёт до 0.12' : '~0.09 TON/day → grows to 0.12',
            igc: ru ? 'свет ~216 IGC/день' : 'elec ~216 IGC/day',
            color: '#FF9EBC',
          },
          {
            season: `☀️ ${ru ? 'Лето' : 'Summer'}`,
            ton: ru ? '~0.12 TON/день (пик)' : '~0.12 TON/day (peak)',
            igc: ru ? 'свет ~162 IGC/день (−25%)' : 'elec ~162 IGC/day (−25%)',
            color: '#FFD700',
          },
          {
            season: `🍂 ${ru ? 'Осень' : 'Autumn'}`,
            ton: ru ? '~0.12 → 0.09 TON/день' : '~0.12 → 0.09 TON/day',
            igc: ru ? 'свет растёт до 243 IGC/день' : 'elec rises to 243 IGC/day',
            color: '#FF8C42',
          },
          {
            season: `❄️ ${ru ? 'Зима' : 'Winter'}`,
            ton: ru ? '~0.09 TON/день (дно)' : '~0.09 TON/day (bottom)',
            igc: ru ? 'свет ~270 IGC/день (+25%)' : 'elec ~270 IGC/day (+25%)',
            color: '#00D4FF',
          },
        ].map((row, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            padding: '5px 0',
            borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.04)' : 'none',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: row.color, minWidth: 70 }}>
              {row.season}
            </div>
            <div style={{ flex: 1, paddingLeft: 8 }}>
              <div style={{ fontSize: 9, color: '#FFD700' }}>💰 {row.ton}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>⚡ {row.igc}</div>
            </div>
          </div>
        ))}
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 8, lineHeight: 1.5 }}>
          {ru
            ? '* Цифры приблизительные. Реальный доход зависит от общего хешрейта сети.'
            : '* Numbers are approximate. Actual income depends on total network hashrate.'}
        </div>
      </div>
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
        borderRadius: 16, padding: '14px 16px',
        border: '1px solid rgba(0,212,255,0.2)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: CY, letterSpacing: 1 }}>
          {ru ? '📖 Гайд по апгрейдам' : '📖 Upgrade Guide'}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
          {ru
            ? 'Нажми на карточку чтобы посмотреть уровни и цены'
            : 'Tap a card to see levels and prices'}
        </div>
      </div>

      {/* Подсказки */}
      <Tip emoji="🌡️" color={OR} text={
        ru
          ? 'Температура влияет на износ GPU. Выше 75°C — быстро изнашиваются. Выше 85°C — критично. Снижай через охлаждение фермы, жидкостное охлаждение, термопасту.'
          : 'Temperature affects GPU wear. Above 75°C — wears fast. Above 85°C — critical. Lower it via farm cooling, liquid cooling, and thermal paste.'
      } />
      <Tip emoji="⏱️" color={GR} text={
        ru
          ? 'Uptime — сколько часов в сутки GPU реально майнит. Базовый уровень 80–95% в зависимости от GPU. Повышается через ИБП, Провайдера и Вентилятор.'
          : 'Uptime — how many hours a day the GPU actually mines. Base is 80–95% depending on GPU tier. Boosted by UPS, Provider and Fan.'
      } />
      <Tip emoji="⚡" color={PU} text={
        ru
          ? 'Электричество списывается каждые 5 минут в IGC. Если IGC на ферме закончились — GPU уходят в офлайн и перестают майнить.'
          : 'Electricity is charged every 5 minutes in IGC. If farm IGC runs out — GPUs go offline and stop mining.'
      } />

      {/* Сезонность */}
      <SeasonSection ru={ru} />

      {/* Апгрейды фермы */}
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: 'rgba(0,212,255,0.5)', marginTop: 4 }}>
        {ru ? '— АПГРЕЙДЫ ФЕРМЫ —' : '— FARM UPGRADES —'}
      </div>
      {farmCards.map(c => <Card key={c.title} card={c} />)}

      {/* Апгрейды GPU */}
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: 'rgba(189,0,255,0.5)', marginTop: 4 }}>
        {ru ? '— АПГРЕЙДЫ GPU (на каждую карточку отдельно) —' : '— GPU UPGRADES (per card separately) —'}
      </div>
      {gpuCards.map(c => <Card key={c.title} card={c} />)}

      {/* Разгон / Undervolt */}
      <div style={{
        background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: '12px 14px',
        border: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: CY, marginBottom: 8 }}>
          ⚡ {ru ? 'Режимы работы GPU' : 'GPU Performance Modes'}
        </div>
        {[
          {
            emoji: '⚡', label: ru ? 'Разгон (OC)' : 'Overclock (OC)',
            color: CY,
            effects: [ru ? '+20% хешрейт' : '+20% hashrate', ru ? '+20% расход IGC' : '+20% IGC cost', ru ? '+15°C температура' : '+15°C temperature', ru ? '×2.5 скорость износа' : '×2.5 wear speed'],
          },
          {
            emoji: '🔋', label: ru ? 'Андервольт (UV)' : 'Undervolt (UV)',
            color: GR,
            effects: [ru ? '−15% хешрейт' : '−15% hashrate', ru ? '−10% расход IGC' : '−10% IGC cost', ru ? '−5°C температура' : '−5°C temperature', ru ? '−30% скорость износа' : '−30% wear speed'],
          },
        ].map(m => (
          <div key={m.label} style={{
            display: 'flex', gap: 10, padding: '8px 0',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{m.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: m.color, marginBottom: 4 }}>{m.label}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {m.effects.map(e => (
                  <span key={e} style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 4,
                    background: `${m.color}15`, border: `1px solid ${m.color}33`,
                    color: m.color,
                  }}>{e}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
          {ru
            ? '⚠️ Разгон и Андервольт взаимно исключают друг друга'
            : '⚠️ Overclock and Undervolt are mutually exclusive'}
        </div>
      </div>

      {/* Стейкинг TON */}
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: 'rgba(0,152,234,0.5)', marginTop: 4 }}>
        {ru ? '— СТЕЙКИНГ —' : '— STAKING —'}
      </div>
      <div style={{
        background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '14px',
        border: '1px solid rgba(0,152,234,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 22 }}>🏦</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0098EA' }}>
              {ru ? 'Стейкинг TON' : 'TON Staking'}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
              {ru ? '≈18.25% годовых в IGC при базовом курсе' : '≈18.25% annual yield in IGC at base price'}
            </div>
          </div>
        </div>
        {[
          {
            q: ru ? 'Как работает?' : 'How it works?',
            a: ru
              ? 'Застейкай TON → TON добавляется в резервный пул (увеличивает награды всем майнерам) → каждые 5 минут тебе начисляется IGC.'
              : 'Stake TON → TON is added to the reserve pool (boosts rewards for all miners) → every 5 minutes you earn IGC.',
          },
          {
            q: ru ? 'Сколько IGC начисляется?' : 'How much IGC do I earn?',
            a: ru
              ? '5 IGC за каждый TON в сутки. При базовой цене IGC (0.0001 TON) это ≈18.25% годовых. Когда IGC дорожает — доходность растёт автоматически.'
              : '5 IGC per TON per day. At base IGC price (0.0001 TON) that\'s ≈18.25% annual. When IGC gets more expensive — yield rises automatically.',
          },
          {
            q: ru ? 'Как вывести?' : 'How to unstake?',
            a: ru
              ? 'Вывод ограничен 1% от пула в сутки (суммарно по всем игрокам). Если лимит исчерпан — жди следующего дня. Минимум для стейкинга и вывода — 1 TON.'
              : 'Withdrawals are limited to 1% of pool size per day (across all players). If the limit is exhausted — wait until the next day. Minimum stake/unstake is 1 TON.',
          },
        ].map((item, i) => (
          <div key={i} style={{
            padding: '8px 0',
            borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0098EA', marginBottom: 3 }}>
              {item.q}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
              {item.a}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
