// ─────────────────────────────────────────────
// Syndicate.tsx — страница синдикатов
// ─────────────────────────────────────────────

import { useState, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import type { SyncData } from '../types';
import { useAction } from '../hooks/useAction';

const API_URL = import.meta.env.VITE_API_URL ?? '';

interface Props { data: SyncData; onUpdate: () => void }

const BONUS_LABELS: Record<string, { name: string; desc: string; icon: string }> = {
  boost_x1:      { name: '+10% Хешрейт',    desc: '2 часа для всего синдиката',      icon: '⚡' },
  boost_x2:      { name: '+20% Хешрейт',    desc: '4 часа для всего синдиката',      icon: '🚀' },
  shield_break:  { name: 'Щит поломок',     desc: '24ч — карты не ломаются',         icon: '🛡️' },
  season_shield: { name: 'Иммунитет зимы',  desc: '48ч — нет зимних штрафов',       icon: '❄️' },
  double_reward: { name: '×2 Соло-награда', desc: '1ч — удвоенный приз блока',       icon: '💎' },
  domination:    { name: '+50% Хешрейт',    desc: '1ч — для всего синдиката',        icon: '👑' },
};

// Базовые цены (до применения igcRatio рынка). Мьютекс: boost_x1 ↔ boost_x2 взаимоисключающие.
const BONUS_COSTS: Record<string, { igcCost: number; requiredLevel: number }> = {
  boost_x1:      { igcCost: 200,   requiredLevel: 1  },
  boost_x2:      { igcCost: 500,   requiredLevel: 10 },
  shield_break:  { igcCost: 800,   requiredLevel: 20 },
  season_shield: { igcCost: 2_000, requiredLevel: 30 },
  double_reward: { igcCost: 1_500, requiredLevel: 40 },
  domination:    { igcCost: 3_000, requiredLevel: 50 },
};

const HASHRATE_MUTEX = new Set(['boost_x1', 'boost_x2']);

function timeLeft(expiresAt: string): string {
  const sec = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  if (sec >= 3600) return `${Math.floor(sec / 3600)}ч ${Math.floor((sec % 3600) / 60)}м`;
  if (sec >= 60)   return `${Math.floor(sec / 60)}м`;
  return `${sec}с`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

type View = 'main' | 'browse' | 'create' | 'members' | 'bonusShop' | 'management' | 'stats';

export function Syndicate({ data, onUpdate }: Props) {
  const syn = data.syndicate;
  const { action } = useAction();
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>('main');
  const [syndicates, setSyndicates] = useState<any[]>([]);
  const initData = useRef(WebApp.initData);
  const [createName, setCreateName] = useState('');
  const [contributeAmt, setContributeAmt] = useState('');

  const doAction = async (type: string, payload: Record<string, any> = {}) => {
    if (busy) return;
    setBusy(true);
    try {
      await action(type, payload);
      onUpdate();
    } catch (e) {
      WebApp.showAlert(String(e));
    } finally {
      setBusy(false);
    }
  };

  const browseSyndicates = async () => {
    setBusy(true);
    try {
      const headers: Record<string, string> = {};
      if (initData.current) headers['X-TG-Init-Data'] = initData.current;
      else headers['X-Dev-User-Id'] = '1';
      const res = await fetch(`${API_URL}/api/syndicates`, { headers });
      if (res.ok) {
        const json = await res.json();
        setSyndicates(json.data ?? []);
        setView('browse');
      } else {
        WebApp.showAlert('Ошибка сервера');
      }
    } catch (e) { WebApp.showAlert('Не удалось подключиться к серверу'); }
    finally { setBusy(false); }
  };

  const handleCreate = () => {
    if (createName.trim().length < 3) { WebApp.showAlert('Минимум 3 символа'); return; }
    WebApp.showConfirm(
      `Создать синдикат "${createName.trim()}"?\nСтоимость: 2 000 IGC`,
      (ok) => { if (ok) doAction('create_syndicate', { name: createName.trim() }); },
    );
  };

  const handleContribute = () => {
    const amt = parseFloat(contributeAmt);
    if (!amt || amt < 1) { WebApp.showAlert('Укажи сумму'); return; }
    if (amt > (data.user.igcBalance ?? 0)) { WebApp.showAlert('Недостаточно IGC'); return; }
    WebApp.showConfirm(
      `Внести ${amt} IGC в казну?\nПолучишь ${amt} XP для синдиката.`,
      (ok) => { if (ok) { doAction('contribute_igc', { amount: amt }); setContributeAmt(''); } },
    );
  };

  // ── Нет синдиката ─────────────────────────────────────
  if (!syn) {
    if (view === 'create') {
      return (
        <div style={wrap}>
          <div style={card}>
            <div style={cardTitle}>⚔️ Создать синдикат</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
              Стоимость: <b style={{ color: '#9B59B6' }}>2 000 IGC</b>
            </div>
            <input
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              placeholder="Название синдиката (3–30 символов)"
              maxLength={30}
              style={inputStyle}
            />
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>
              Уникальное имя · видно всем игрокам
            </div>
            <button onClick={handleCreate} disabled={busy} style={btnPrimary}>
              {busy ? '...' : 'Создать за 2 000 IGC'}
            </button>
            <button onClick={() => setView('main')} style={{ ...btnSecondary, marginTop: 8 }}>
              ← Назад
            </button>
          </div>
        </div>
      );
    }

    if (view === 'browse') {
      return (
        <div style={wrap}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Открытые синдикаты</div>
          {syndicates.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
              Синдикатов пока нет
            </div>
          ) : syndicates.map((s: any) => (
            <div key={s.id} style={{ ...card, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                    Ур. {s.level} · {s.member_count}/{s.max_members} участников
                  </div>
                </div>
                <button
                  onClick={() => WebApp.showConfirm(
                    `Вступить в синдикат "${s.name}"?\nПул-режим активируется автоматически.`,
                    (ok) => { if (ok) doAction('join_syndicate', { syndicateId: s.id }); },
                  )}
                  disabled={busy}
                  style={{ ...btnPrimary, padding: '6px 12px', fontSize: 12 }}
                >
                  Вступить
                </button>
              </div>
            </div>
          ))}
          <button onClick={() => setView('main')} style={btnSecondary}>← Назад</button>
        </div>
      );
    }

    return (
      <div style={wrap}>
        <div style={{ ...card, textAlign: 'center', padding: '24px 16px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚔️</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Ты не в синдикате</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 20, lineHeight: 1.5 }}>
            Синдикат открывает Pool-майнинг и даёт бонусы к хешрейту, защиту от износа и общую казну.
          </div>
          <button onClick={browseSyndicates} disabled={busy} style={btnPrimary}>
            {busy ? '...' : '🔍 Найти синдикат'}
          </button>
          <button onClick={() => setView('create')} style={{ ...btnSecondary, marginTop: 8 }}>
            ➕ Создать свой
          </button>
        </div>

        <div style={{ ...card, marginTop: 12 }}>
          <div style={cardTitle}>Зачем синдикат?</div>
          {[
            ['⛏️', 'Pool-майнинг', 'Стабильный доход вместо Solo-лотереи'],
            ['⚡', 'Бонус хешрейта', 'До +35% при уровне 50'],
            ['🛡️', 'Защита от износа', 'До −30% при уровне 50'],
            ['💎', 'Казна', 'Общие бонусы для всей команды'],
          ].map(([icon, title, text]) => (
            <div key={title} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 20, minWidth: 26, textAlign: 'center' }}>{icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{title}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>{text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Есть синдикат ──────────────────────────────────────
  const isLeader = syn.role === 'leader';
  const xpPct    = syn.xpToNext > 0 ? Math.min(100, (syn.xpProgress / syn.xpToNext) * 100) : 100;

  // ── Все кланы (browse) — доступно и когда уже в синдикате ─
  if (view === 'browse') {
    return (
      <div style={wrap}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Открытые синдикаты</div>
        {syndicates.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
            Синдикатов пока нет
          </div>
        ) : syndicates.map((s: any) => (
          <div key={s.id} style={{ ...card, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  Ур. {s.level} · {s.member_count}/{s.max_members} участников
                </div>
              </div>
            </div>
          </div>
        ))}
        <button onClick={() => setView('main')} style={btnSecondary}>← Назад</button>
      </div>
    );
  }

  // ── Участники ─────────────────────────────────────────
  if (view === 'members') {
    return (
      <div style={wrap}>
        <div style={card}>
          <div style={cardTitle}>👥 Участники — {syn.memberCount}/{syn.maxMembers}</div>
          {syn.members.map(m => (
            <div key={m.userId} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: m.role === 'leader' ? 700 : 400 }}>
                  {m.role === 'leader' ? '👑 ' : ''}{m.username ?? m.userId.slice(0, 8)}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                  {m.role === 'leader' ? 'Лидер' : 'Участник'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {isLeader && m.role === 'member' && (
                  <button
                    onClick={() => WebApp.showConfirm(
                      `Исключить ${m.username ?? 'участника'}?`,
                      (ok) => { if (ok) doAction('kick_member', { targetUserId: m.userId }); },
                    )}
                    style={{ ...btnSecondary, padding: '4px 8px', fontSize: 11 }}
                  >
                    Кик
                  </button>
                )}
                {!isLeader && m.userId !== data.user.id && m.role !== 'leader' && (
                  <button
                    onClick={() => WebApp.showConfirm(
                      `Проголосовать за ${m.username ?? 'участника'} как нового лидера?`,
                      (ok) => { if (ok) doAction('vote_leader', { candidateId: m.userId }); },
                    )}
                    style={{ ...btnSecondary, padding: '4px 8px', fontSize: 11 }}
                  >
                    Выдвинуть
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => setView('main')} style={btnSecondary}>← Назад</button>
      </div>
    );
  }

  // ── Магазин бонусов ──────────────────────────────────
  if (view === 'bonusShop') {
    const igcRatio  = (data as any).igcSupply?.ratio ?? (data as any).igc?.ratio ?? 1;
    const adjCost   = (base: number) => Math.ceil(base * igcRatio);
    const showRatio = Math.abs(igcRatio - 1) >= 0.02;

    return (
      <div style={wrap}>
        <div style={cardTitle}>🛒 Магазин бонусов</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            Казна: <b style={{ color: '#9B59B6' }}>{syn.treasuryIgc.toFixed(0)} IGC</b>
          </span>
          {showRatio && (
            <span style={{ fontSize: 10, color: igcRatio > 1 ? '#E74C3C' : '#2ECC71' }}>
              Рынок ×{igcRatio.toFixed(2)}
            </span>
          )}
        </div>
        {Object.entries(BONUS_LABELS).map(([type, info]) => {
          const def       = BONUS_COSTS[type];
          const isActive  = syn.activeBonuses.some(b => b.type === type);
          const finalCost = adjCost(def.igcCost);
          const affordable = syn.treasuryIgc >= finalCost;
          const unlocked   = syn.level >= def.requiredLevel;

          // Mutex: буст хешрейта — только один одновременно
          const isHashrateBoost   = HASHRATE_MUTEX.has(type);
          const mutexBlocked      = isHashrateBoost && !isActive &&
            syn.activeBonuses.some(b => HASHRATE_MUTEX.has(b.type) && b.type !== type);
          const activeConflict    = mutexBlocked
            ? syn.activeBonuses.find(b => HASHRATE_MUTEX.has(b.type) && b.type !== type)
            : null;

          const canBuy = !isActive && !mutexBlocked && affordable && unlocked;

          return (
            <div key={type} style={{ ...card, marginBottom: 8, opacity: unlocked ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 20 }}>{info.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{info.name}</span>
                {isActive && (
                  <span style={{ fontSize: 10, color: '#2ECC71', marginLeft: 4 }}>● Активен</span>
                )}
                {mutexBlocked && (
                  <span style={{ fontSize: 10, color: '#E67E22', marginLeft: 4 }}>⛔ Заблокирован</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
                {info.desc}
              </div>
              {isActive && (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>
                  Осталось: {timeLeft(syn.activeBonuses.find(b => b.type === type)!.expiresAt)}
                </div>
              )}
              {mutexBlocked && activeConflict && (
                <div style={{ fontSize: 10, color: '#E67E22', marginBottom: 4 }}>
                  «{BONUS_LABELS[activeConflict.type]?.name}» активен ещё {timeLeft(activeConflict.expiresAt)}
                </div>
              )}
              {!unlocked && (
                <div style={{ fontSize: 10, color: '#E74C3C', marginBottom: 4 }}>
                  Требуется уровень {def.requiredLevel}
                </div>
              )}
              {isLeader && (
                <button
                  onClick={() => {
                    if (isActive)     { WebApp.showAlert('Этот бонус уже активен — подожди пока он закончится.'); return; }
                    if (mutexBlocked) { WebApp.showAlert(`Уже активен другой буст хешрейта. Дождись его окончания.`); return; }
                    const ratioNote = showRatio ? `\nЦена × рынок (×${igcRatio.toFixed(2)})` : '';
                    WebApp.showConfirm(
                      `Купить «${info.name}» за ${finalCost} IGC из казны?${ratioNote}`,
                      (ok) => { if (ok) doAction('buy_syndicate_bonus', { bonusType: type }); },
                    );
                  }}
                  disabled={busy || !canBuy}
                  style={{
                    ...btnPrimary,
                    marginTop: 4,
                    opacity: canBuy ? 1 : 0.4,
                  }}
                >
                  {isActive
                    ? '✓ Активен'
                    : mutexBlocked
                      ? '⛔ Другой буст активен'
                      : `${finalCost} IGC${showRatio ? ` ×${igcRatio.toFixed(2)}` : ''}`}
                </button>
              )}
            </div>
          );
        })}
        <button onClick={() => setView('main')} style={btnSecondary}>← Назад</button>
      </div>
    );
  }

  // ── Статистика клана ──────────────────────────────────
  if (view === 'stats') {
    return (
      <div style={wrap}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>📊 Статистика синдиката</div>
        <div style={card}>
          {[
            ['🖥️', 'Активных GPU',    String(syn.activeGpuCount  ?? 0)],
            ['🏆', 'Блоков добыто',   String(syn.totalBlocksWon  ?? 0)],
            ['💎', 'TON заработано',  (syn.totalTonEarned  ?? 0).toFixed(4)],
            ['🪙', 'IGC заработано',  (syn.totalIgcEarned  ?? 0).toFixed(0)],
            ['👥', 'Участников',      `${syn.memberCount} / ${syn.maxMembers}`],
            ['⭐', 'Уровень клана',   String(syn.level)],
            ['📅', 'Основан',         formatDate(syn.foundedAt ?? null)],
          ].map(([icon, label, value]) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18, minWidth: 24, textAlign: 'center' }}>{icon}</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{label}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{value}</span>
            </div>
          ))}
        </div>
        <button onClick={() => setView('main')} style={btnSecondary}>← Назад</button>
      </div>
    );
  }

  // ── Управление кланом (только лидер) ─────────────────
  if (view === 'management') {
    return (
      <div style={wrap}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>⚙️ Управление синдикатом</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
          Опасные действия — будь внимателен
        </div>

        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>
            👥 Состав
          </div>
          <button onClick={() => setView('members')} style={{ ...btnSecondary, marginBottom: 8 }}>
            👤 Управление участниками
          </button>
        </div>

        <div style={{ ...card, border: '1px solid rgba(231,76,60,0.25)', marginTop: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#E74C3C', marginBottom: 6 }}>
            ⚠️ Опасная зона
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12, lineHeight: 1.5 }}>
            Растворение синдиката необратимо. Все участники перейдут в Solo, казна будет уничтожена.
          </div>
          <button
            onClick={() => WebApp.showConfirm(
              '❗ Растворить синдикат?\n\nВСЕ участники перейдут в Solo-режим.\nКазна будет сожжена.\n\nЭто действие необратимо.',
              (ok) => { if (ok) doAction('dissolve_syndicate'); },
            )}
            disabled={busy}
            style={{ ...btnSecondary, width: '100%', color: '#E74C3C', borderColor: 'rgba(231,76,60,0.4)' }}
          >
            🗑️ Растворить синдикат
          </button>
        </div>

        <button onClick={() => setView('main')} style={btnSecondary}>← Назад</button>
      </div>
    );
  }

  // ── Главный экран синдиката ────────────────────────────
  return (
    <div style={wrap}>
      {/* Заголовок синдиката */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>⚔️ {syn.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              {isLeader ? '👑 Ты лидер' : '🤝 Участник'} · Уровень {syn.level}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Казна</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#9B59B6' }}>
              {syn.treasuryIgc.toFixed(0)} IGC
            </div>
          </div>
        </div>

        {/* XP прогресс */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>XP</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
              {syn.xpToNext > 0 ? `${syn.xpProgress.toFixed(0)} / ${syn.xpToNext} до ур. ${syn.level + 1}` : 'MAX'}
            </span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
            <div style={{ height: '100%', width: `${xpPct}%`, borderRadius: 3,
              background: 'linear-gradient(90deg, #9B59B6, #0098EA)' }} />
          </div>
        </div>

        {/* Пассивные бонусы */}
        {(syn.hashrateBonus > 0 || syn.wearReduction > 0) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {syn.hashrateBonus > 0 && (
              <div style={bonusChip}>
                ⚡ +{Math.round(syn.hashrateBonus * 100)}% Hash
              </div>
            )}
            {syn.wearReduction > 0 && (
              <div style={bonusChip}>
                🛡️ −{Math.round(syn.wearReduction * 100)}% Износ
              </div>
            )}
          </div>
        )}

        {/* Активные временные бонусы */}
        {syn.activeBonuses.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {syn.activeBonuses.map(b => {
              const info = BONUS_LABELS[b.type];
              return (
                <div key={b.type} style={{ fontSize: 11, color: '#2ECC71', marginBottom: 3 }}>
                  {info?.icon} {info?.name} — ещё {timeLeft(b.expiresAt)}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Взнос в казну */}
      <div style={card}>
        <div style={cardTitle}>💰 Пополнить казну</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
          1 IGC = 1 XP синдиката. У тебя: {Math.floor(data.user.igcBalance)} IGC
        </div>
        <input
          type="number"
          value={contributeAmt}
          onChange={e => setContributeAmt(e.target.value)}
          placeholder="Сумма IGC"
          style={inputStyle}
        />
        <button onClick={handleContribute} disabled={busy} style={btnPrimary}>
          Внести
        </button>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {[100, 500, 1000].map(n => (
            <button key={n} onClick={() => setContributeAmt(String(n))}
              style={{ ...btnSecondary, padding: '4px 10px', fontSize: 11, flex: 1 }}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Навигационная сетка: 4 кнопки в 2×2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button onClick={() => setView('members')} style={navCard}>
          <span style={{ fontSize: 20 }}>👥</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Участники</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
            {syn.memberCount}/{syn.maxMembers}
          </span>
        </button>
        <button onClick={() => setView('bonusShop')} style={navCard}>
          <span style={{ fontSize: 20 }}>🛒</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Бонусы</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
            {syn.activeBonuses.length} активно
          </span>
        </button>
        <button onClick={() => setView('stats')} style={navCard}>
          <span style={{ fontSize: 20 }}>📊</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Статистика</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
            {syn.totalBlocksWon ?? 0} блоков
          </span>
        </button>
        <button onClick={browseSyndicates} disabled={busy} style={navCard}>
          <span style={{ fontSize: 20 }}>🔍</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Все кланы</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
            посмотреть список
          </span>
        </button>
      </div>

      {/* Управление (только лидер) */}
      {isLeader && (
        <button onClick={() => setView('management')} style={{ ...btnSecondary, width: '100%' }}>
          ⚙️ Управление синдикатом
        </button>
      )}

      {/* Выход для участника */}
      {!isLeader && (
        <button
          onClick={() => WebApp.showConfirm(
            'Выйти из синдиката? Твой режим переключится на Solo.',
            (ok) => { if (ok) doAction('leave_syndicate'); },
          )}
          disabled={busy}
          style={{ ...btnSecondary, width: '100%', color: '#E74C3C' }}
        >
          🚪 Покинуть синдикат
        </button>
      )}
    </div>
  );
}

// ── Стили ──────────────────────────────────────────────
const wrap: React.CSSProperties = {
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  borderRadius: 14,
  padding: '14px 16px',
  border: '1px solid rgba(255,255,255,0.08)',
};

const cardTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.45)',
  marginBottom: 10,
};

const btnPrimary: React.CSSProperties = {
  background: '#0098EA',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  width: '100%',
};

const btnSecondary: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  color: 'rgba(255,255,255,0.7)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  width: '100%',
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  padding: '10px 12px',
  color: '#fff',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
  marginBottom: 8,
  outline: 'none',
};

const navCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14,
  padding: '14px 10px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  cursor: 'pointer',
  color: '#fff',
};

const bonusChip: React.CSSProperties = {
  background: 'rgba(155,89,182,0.15)',
  border: '1px solid rgba(155,89,182,0.3)',
  borderRadius: 8,
  padding: '4px 10px',
  fontSize: 11,
  color: '#9B59B6',
  fontWeight: 600,
};
