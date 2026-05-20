// ─────────────────────────────────────────────
// notifications/seasonal.ts
//
// Шаблоны уведомлений о смене сезона.
// Рассылка запускается из backend/monitoring/dailyCron.ts
// через sendTgBroadcast при смене season.
// ─────────────────────────────────────────────

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

interface SeasonMessage {
  emoji:   string;
  title:   string;
  body:    string;
}

const SEASON_MESSAGES: Record<Season, SeasonMessage> = {
  spring: {
    emoji: '🌸',
    title: 'Весна началась!',
    body:
      'Ставка майнинга растёт. Умные игроки закупаются IGC — скоро пригодится для Летнего разгона.',
  },
  summer: {
    emoji: '☀️',
    title: 'Лето! Пик наград',
    body:
      'Ставка на максимуме. Доступен <b>Сезонный разгон</b> — потрать 500 IGC и получи +10% хешрейта на 7 дней.',
  },
  autumn: {
    emoji: '🍂',
    title: 'Осень. Ставка падает',
    body:
      'Ставка идёт вниз. Хорошее время продать GPU на P2P-маркетплейсе — цены ещё высокие.',
  },
  winter: {
    emoji: '❄️',
    title: 'Зима. Крипто-дно',
    body:
      'Ставка на минимуме, электричество дороже. Часть конкурентов выключает фермы — твоя доля растёт.',
  },
};

export function buildSeasonMessage(season: Season, cycleDay: number): string {
  const { emoji, title, body } = SEASON_MESSAGES[season];
  return (
    `${emoji} <b>${title}</b>\n\n` +
    `${body}\n\n` +
    `📅 День цикла: ${cycleDay}/28`
  );
}

export function buildHalvingMessage(
  prevPhase: number,
  newPhase:  number,
  newRate:   number,
): string {
  const pct = (newRate * 100).toFixed(1);
  return (
    `⚡ <b>Халвинг! Фаза ${prevPhase} → ${newPhase}</b>\n\n` +
    `Пул выплатил достаточно TON. Дневная ставка снижена до <b>${pct}%</b>.\n\n` +
    `Это продлевает жизнь пула. Ранние игроки зарабатывали больше — теперь конкуренция растёт. 📈`
  );
}
