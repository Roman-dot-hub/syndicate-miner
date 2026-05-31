/**
 * GpuIcon — SVG-иконка видеокарты с tier-специфичными цветами.
 * Заменяет эмодзи в GpuCard, GpuDetailModal и Shop.
 */

const TIER_COLORS: Record<number, { main: string; dim: string; accent: string }> = {
  0: { main: '#4a9eff', dim: '#1a3a70', accent: '#7bc4ff' }, // USB Nano — синий
  1: { main: '#e84040', dim: '#6a1010', accent: '#ff7070' }, // RX 580 — AMD-красный
  2: { main: '#76b900', dim: '#2e4800', accent: '#a8e000' }, // GTX 1660 S — Nvidia-зелёный
  3: { main: '#00c4ff', dim: '#004870', accent: '#60dcff' }, // RTX 3070 — яркий голубой
  4: { main: '#ff7b00', dim: '#6a2e00', accent: '#ffb060' }, // RTX 4090 — оранжевый (горячий)
  5: { main: '#ffd000', dim: '#6a5000', accent: '#ffe87a' }, // ASIC S19 — золотой
  6: { main: '#c040ff', dim: '#4a0070', accent: '#e890ff' }, // Quantum X1 — фиолетовый
};

interface Props {
  tier: number;
  size?: number;
}

export function GpuIcon({ tier, size = 36 }: Props) {
  // USB Nano — отдельная иконка USB-флешки
  if (tier === 0) {
    const c = TIER_COLORS[0];
    return (
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* USB body */}
        <rect x="13" y="4" width="10" height="18" rx="2" fill={c.dim} stroke={c.main} strokeWidth="1.4"/>
        {/* USB plug */}
        <rect x="11" y="22" width="14" height="6" rx="1.5" fill={c.main} fillOpacity="0.7"/>
        <rect x="14" y="22" width="8" height="6" fill={c.accent} fillOpacity="0.2"/>
        {/* LED */}
        <circle cx="18" cy="12" r="2.5" fill={c.main} fillOpacity="0.9"/>
        <circle cx="18" cy="12" r="1" fill={c.accent}/>
        {/* Chip lines */}
        <rect x="15" y="7" width="6" height="1" rx="0.5" fill={c.main} fillOpacity="0.4"/>
        <rect x="15" y="9" width="6" height="1" rx="0.5" fill={c.main} fillOpacity="0.3"/>
        {/* USB prongs */}
        <rect x="15" y="28" width="2" height="4" rx="0.5" fill={c.main} fillOpacity="0.8"/>
        <rect x="19" y="28" width="2" height="4" rx="0.5" fill={c.main} fillOpacity="0.8"/>
      </svg>
    );
  }

  const c = TIER_COLORS[tier] ?? TIER_COLORS[1];

  // Quantum X1 — отдельный индустриальный дизайн
  const isQuantum = tier === 6;
  // Количество вентиляторов зависит от тира
  const twoFans = tier >= 3 && !isQuantum;
  // ASIC — без обычных вентиляторов, с решёткой
  const isAsic  = tier === 5;

  /* ──────────────────────────────────────────────────────
     Quantum X1 — индустриальный блок (отдельный SVG-дизайн)
     ────────────────────────────────────────────────────── */
  if (isQuantum) {
    return (
      <svg width={size} height={size} viewBox="0 0 44 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Тяжёлый корпус */}
        <rect x="1" y="1" width="42" height="34" rx="3"
          fill={c.dim} fillOpacity="0.45" stroke={c.main} strokeWidth="1.6"/>
        {/* Внутренняя рамка — двойной борт */}
        <rect x="3.5" y="3.5" width="37" height="29" rx="2"
          fill="none" stroke={c.main} strokeWidth="0.5" strokeOpacity="0.35"/>

        {/* Индустриальная турбина-нагнетатель (blower) */}
        {/* Внешнее кольцо */}
        <circle cx="16" cy="18" r="11" fill={c.dim} fillOpacity="0.5"
          stroke={c.main} strokeWidth="1.3"/>
        {/* Рассекатель — горизонтальная перегородка */}
        <rect x="5" y="17" width="22" height="2" rx="0.5"
          fill={c.main} fillOpacity="0.18"/>
        {/* Лопасти turbo-blower (загнутые к центру) */}
        {[0, 40, 80, 120, 160, 200, 240, 280, 320].map(deg => {
          const rad  = (deg * Math.PI) / 180;
          const rad2 = ((deg + 25) * Math.PI) / 180;
          const x1   = 16 + 4.5 * Math.cos(rad);
          const y1   = 18 + 4.5 * Math.sin(rad);
          const x2   = 16 + 9.5 * Math.cos(rad2);
          const y2   = 18 + 9.5 * Math.sin(rad2);
          return (
            <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={c.main} strokeWidth="1.3" strokeOpacity="0.75"
              strokeLinecap="round"/>
          );
        })}
        {/* Ступица турбины */}
        <circle cx="16" cy="18" r="3.2" fill={c.dim} stroke={c.main} strokeWidth="1"/>
        <circle cx="16" cy="18" r="1.4" fill={c.main} fillOpacity="0.9"/>

        {/* Правая панель — индустриальный блок управления */}
        <rect x="30" y="4" width="12" height="28" rx="1.5"
          fill={c.main} fillOpacity="0.07" stroke={c.main} strokeWidth="0.7" strokeOpacity="0.4"/>

        {/* 8-pin силовой разъём (сверху справа) */}
        <rect x="31" y="5.5" width="10" height="6" rx="1"
          fill={c.main} fillOpacity="0.2" stroke={c.main} strokeWidth="0.6"/>
        {[32.5, 34.5, 36.5, 38.5].map(x => (
          <rect key={x} x={x} y="6.5" width="1.2" height="4" rx="0.3"
            fill={c.main} fillOpacity="0.7"/>
        ))}
        {[32.5, 34.5, 36.5, 38.5].map(x => (
          <rect key={`b${x}`} x={x} y="6.5" width="1.2" height="1.8" rx="0.3"
            fill={c.accent} fillOpacity="0.5"/>
        ))}

        {/* Статус-индикаторы */}
        <circle cx="35" cy="17" r="1.5" fill={c.main} fillOpacity="0.9"/>
        <circle cx="35" cy="17" r="0.7" fill={c.accent}/>
        <circle cx="38" cy="17" r="1" fill={c.main} fillOpacity="0.4"/>

        {/* Вентиляционные прорези снизу */}
        {[31.5, 33.5, 35.5, 37.5].map(x => (
          <rect key={`v${x}`} x={x} y="22" width="1.2" height="8" rx="0.4"
            fill={c.main} fillOpacity="0.45"/>
        ))}

        {/* Нижняя полоса — предупреждающая (жёлтые засечки как на промышленном оборудовании) */}
        <rect x="1" y="31" width="42" height="4" rx="0 0 3 3"
          fill={c.main} fillOpacity="0.1"/>
        {[3, 8, 13, 18, 23, 28].map(x => (
          <line key={x} x1={x} y1="31" x2={x + 3} y2="35"
            stroke={c.main} strokeWidth="1.2" strokeOpacity="0.45"/>
        ))}

        {/* Метка модели */}
        <text x="16" y="9" textAnchor="middle"
          fontSize="4.5" fontWeight="bold" fill={c.accent} fillOpacity="0.85"
          fontFamily="monospace" letterSpacing="0.5">QNT-X1</text>
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 44 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* ── PCB-основание ── */}
      <rect x="1" y="3" width="38" height="27" rx="2.5"
        fill={c.dim} fillOpacity="0.5" stroke={c.main} strokeWidth="1.2"/>

      {/* ── Световая полоса (RGB-имитация) ── */}
      <rect x="1" y="28" width="38" height="2" rx="1"
        fill={c.main} fillOpacity="0.35"/>

      {isAsic ? (
        /* ── ASIC: вентиляционная решётка ── */
        <>
          {[6, 10, 14, 18, 22, 26, 30].map(x => (
            <rect key={x} x={x} y="7" width="2" height="18" rx="1"
              fill={c.main} fillOpacity="0.55"/>
          ))}
          {/* Центральная пластина */}
          <rect x="5" y="12" width="28" height="9" rx="1"
            fill={c.main} fillOpacity="0.07" stroke={c.main} strokeWidth="0.6" strokeOpacity="0.4"/>
          <text x="19" y="18.5" textAnchor="middle"
            fontSize="5" fontWeight="bold" fill={c.accent} fillOpacity="0.9"
            fontFamily="monospace">ASIC</text>
        </>
      ) : twoFans ? (
        /* ── Два вентилятора (RTX 3070 / RTX 4090 / Quantum) ── */
        <>
          {[11, 27].map(cx => (
            <g key={cx}>
              {/* Внешнее кольцо */}
              <circle cx={cx} cy="16" r="9" fill={c.dim} fillOpacity="0.6"
                stroke={c.main} strokeWidth="1.1" strokeOpacity="0.8"/>
              {/* Крыльчатка — 6 лопастей */}
              {[0, 60, 120, 180, 240, 300].map(deg => {
                const rad = (deg * Math.PI) / 180;
                const x1  = cx + 3.5 * Math.cos(rad);
                const y1  = 16 + 3.5 * Math.sin(rad);
                const x2  = cx + 7.5 * Math.cos(rad + 0.5);
                const y2  = 16 + 7.5 * Math.sin(rad + 0.5);
                return (
                  <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={c.main} strokeWidth="1.2" strokeOpacity="0.65"
                    strokeLinecap="round"/>
                );
              })}
              {/* Ступица */}
              <circle cx={cx} cy="16" r="3" fill={c.dim} stroke={c.main} strokeWidth="0.8"/>
              <circle cx={cx} cy="16" r="1.2" fill={c.main} fillOpacity="0.8"/>
            </g>
          ))}
        </>
      ) : (
        /* ── Один вентилятор (RX 580 / GTX 1660) ── */
        <>
          <circle cx="16" cy="16" r="10" fill={c.dim} fillOpacity="0.6"
            stroke={c.main} strokeWidth="1.2" strokeOpacity="0.85"/>
          {[0, 60, 120, 180, 240, 300].map(deg => {
            const rad = (deg * Math.PI) / 180;
            const x1  = 16 + 4 * Math.cos(rad);
            const y1  = 16 + 4 * Math.sin(rad);
            const x2  = 16 + 8.5 * Math.cos(rad + 0.5);
            const y2  = 16 + 8.5 * Math.sin(rad + 0.5);
            return (
              <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={c.main} strokeWidth="1.4" strokeOpacity="0.7"
                strokeLinecap="round"/>
            );
          })}
          <circle cx="16" cy="16" r="3.5" fill={c.dim} stroke={c.main} strokeWidth="0.9"/>
          <circle cx="16" cy="16" r="1.5" fill={c.main} fillOpacity="0.85"/>
          {/* Полоска рядом с вентилятором — радиаторные рёбра */}
          <rect x="29" y="7" width="2" height="19" rx="1" fill={c.main} fillOpacity="0.5"/>
          <rect x="32" y="7" width="2" height="19" rx="1" fill={c.main} fillOpacity="0.35"/>
          <rect x="35" y="7" width="2" height="19" rx="1" fill={c.main} fillOpacity="0.2"/>
        </>
      )}

      {!isQuantum && (
        <>
          {/* ── Выходные порты справа (HDMI/DP) ── */}
          <rect x="39" y="7"  width="5" height="3" rx="0.8" fill={c.main} fillOpacity="0.75"/>
          <rect x="39" y="12" width="5" height="3" rx="0.8" fill={c.main} fillOpacity="0.65"/>
          <rect x="39" y="17" width="5" height="2" rx="0.8" fill={c.main} fillOpacity="0.5"/>
          <rect x="39" y="21" width="5" height="2" rx="0.8" fill={c.main} fillOpacity="0.5"/>

          {/* ── PCIe-слот (золото) ── */}
          <rect x="2" y="30" width="36" height="5" rx="1.2"
            fill="#b8860b" fillOpacity="0.35" stroke="#d4a800" strokeWidth="0.7" strokeOpacity="0.6"/>
          {/* Контактные пины */}
          {[4, 6.5, 9, 11.5, 14, 16.5, 19, 21.5, 24, 26.5, 29, 31.5, 34].map(x => (
            <rect key={x} x={x} y="31" width="1.2" height="3" rx="0.3"
              fill="#d4a800" fillOpacity="0.7"/>
          ))}
        </>
      )}
    </svg>
  );
}
