// ─────────────────────────────────────────────
// Syndicate.tsx — страница синдикатов
// ─────────────────────────────────────────────

import React, { useState, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import type { SyncData } from '../types';
import { useAction } from '../hooks/useAction';
import { useLang } from '../LangContext';
import { fmt } from '../i18n';

const API_URL = import.meta.env.VITE_API_URL ?? '';

interface Props { data: SyncData; onUpdate: () => void }

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
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  if (sec >= 60)   return `${Math.floor(sec / 60)}m`;
  return `${sec}s`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

type View = 'main' | 'browse' | 'create' | 'members' | 'bonusShop' | 'management' | 'stats';

export function Syndicate({ data, onUpdate }: Props) {
  const { t } = useLang();
  const syn = data.syndicate;
  const { action } = useAction();
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>('main');
  const [syndicates, setSyndicates] = useState<any[]>([]);
  const initData = useRef(WebApp.initData);
  const [createName, setCreateName] = useState('');
  const [contributeAmt, setContributeAmt] = useState('');

  // Dynamic bonus labels (translated)
  const bonusLabels: Record<string, { name: string; desc: string; icon: string }> = {
    boost_x1:      t.bonus_boost_x1,
    boost_x2:      t.bonus_boost_x2,
    shield_break:  t.bonus_shield_break,
    season_shield: t.bonus_season_shield,
    double_reward: t.bonus_double_reward,
    domination:    t.bonus_domination,
  };

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
        WebApp.showAlert(t.syn_err_server);
      }
    } catch (e) { WebApp.showAlert(t.syn_err_connect); }
    finally { setBusy(false); }
  };

  const handleCreate = () => {
    if (createName.trim().length < 3) { WebApp.showAlert(t.syn_min_name); return; }
    WebApp.showConfirm(
      fmt(t.syn_create_conf, { name: createName.trim() }),
      (ok) => { if (ok) doAction('create_syndicate', { name: createName.trim() }); },
    );
  };

  const handleContribute = () => {
    const amt = parseFloat(contributeAmt);
    if (!amt || amt < 1) { WebApp.showAlert(t.syn_no_amount); return; }
    if (amt > (data.user.igcBalance ?? 0)) { WebApp.showAlert(t.syn_not_enough); return; }
    WebApp.showConfirm(
      fmt(t.syn_contribute_confirm, { amt }),
      (ok) => { if (ok) { doAction('contribute_igc', { amount: amt }); setContributeAmt(''); } },
    );
  };

  // ── Нет синдиката ─────────────────────────────────────
  if (!syn) {
    if (view === 'create') {
      return (
        <div style={wrap}>
          <div style={card}>
            <div style={cardTitle}>{t.syn_create_title}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
              {t.syn_create_cost} <b style={{ color: '#9B59B6' }}>2 000 IGC</b>
            </div>
            <input
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              placeholder={t.syn_placeholder}
              maxLength={30}
              style={inputStyle}
            />
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>
              {t.syn_create_hint}
            </div>
            <button onClick={handleCreate} disabled={busy} style={btnPrimary}>
              {busy ? '...' : t.syn_create_btn}
            </button>
            <button onClick={() => setView('main')} style={{ ...btnSecondary, marginTop: 8 }}>
              {t.syn_back}
            </button>
          </div>
        </div>
      );
    }

    if (view === 'browse') {
      return (
        <div style={wrap}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{t.syn_browse_title}</div>
          {syndicates.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
              {t.syn_no_list}
            </div>
          ) : syndicates.map((s: any) => (
            <div key={s.id} style={{ ...card, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                    {fmt(t.syn_members_fmt, { lvl: s.level, cur: s.member_count, max: s.max_members })}
                  </div>
                </div>
                <button
                  onClick={() => WebApp.showConfirm(
                    fmt(t.syn_join_confirm, { name: s.name }),
                    (ok) => { if (ok) doAction('join_syndicate', { syndicateId: s.id }); },
                  )}
                  disabled={busy}
                  style={{ ...btnPrimary, padding: '6px 12px', fontSize: 12 }}
                >
                  {t.syn_join}
                </button>
              </div>
            </div>
          ))}
          <button onClick={() => setView('main')} style={btnSecondary}>{t.syn_back}</button>
        </div>
      );
    }

    return (
      <div style={wrap}>
        <div style={{ ...card, textAlign: 'center', padding: '24px 16px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚔️</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{t.syn_no_syn_title}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 20, lineHeight: 1.5 }}>
            {t.syn_no_syn_desc}
          </div>
          <button onClick={browseSyndicates} disabled={busy} style={btnPrimary}>
            {busy ? '...' : t.syn_find}
          </button>
          <button onClick={() => setView('create')} style={{ ...btnSecondary, marginTop: 8 }}>
            {t.syn_create_own}
          </button>
        </div>

        <div style={{ ...card, marginTop: 12 }}>
          <div style={cardTitle}>{t.syn_why_title}</div>
          {(t.syn_why as [string, string][]).map(([title, text]) => (
            <div key={title} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
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
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{t.syn_browse_title}</div>
        {syndicates.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
            {t.syn_no_list}
          </div>
        ) : syndicates.map((s: any) => (
          <div key={s.id} style={{ ...card, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  {fmt(t.syn_members_fmt, { lvl: s.level, cur: s.member_count, max: s.max_members })}
                </div>
              </div>
            </div>
          </div>
        ))}
        <button onClick={() => setView('main')} style={btnSecondary}>{t.syn_back}</button>
      </div>
    );
  }

  // ── Участники ─────────────────────────────────────────
  if (view === 'members') {
    return (
      <div style={wrap}>
        <div style={card}>
          <div style={cardTitle}>{fmt(t.syn_members_title, { cur: syn.memberCount, max: syn.maxMembers })}</div>
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
                  {m.role === 'leader' ? t.syn_leader : t.syn_member}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {isLeader && m.role === 'member' && (
                  <button
                    onClick={() => WebApp.showConfirm(
                      fmt(t.syn_kick_confirm, { name: m.username ?? m.userId.slice(0, 8) }),
                      (ok) => { if (ok) doAction('kick_member', { targetUserId: m.userId }); },
                    )}
                    style={{ ...btnSecondary, padding: '4px 8px', fontSize: 11 }}
                  >
                    {t.syn_kick}
                  </button>
                )}
                {!isLeader && m.userId !== data.user.id && m.role !== 'leader' && (
                  <button
                    onClick={() => WebApp.showConfirm(
                      fmt(t.syn_vote_confirm, { name: m.username ?? m.userId.slice(0, 8) }),
                      (ok) => { if (ok) doAction('vote_leader', { candidateId: m.userId }); },
                    )}
                    style={{ ...btnSecondary, padding: '4px 8px', fontSize: 11 }}
                  >
                    {t.syn_vote}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => setView('main')} style={btnSecondary}>{t.syn_back}</button>
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
        <div style={cardTitle}>{t.syn_bonus_shop}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            {t.syn_treasury} <b style={{ color: '#9B59B6' }}>{syn.treasuryIgc.toFixed(0)} IGC</b>
          </span>
          {showRatio && (
            <span style={{ fontSize: 10, color: igcRatio > 1 ? '#E74C3C' : '#2ECC71' }}>
              {fmt(t.syn_market_ratio, { r: igcRatio.toFixed(2) })}
            </span>
          )}
        </div>
        {Object.entries(bonusLabels).map(([type, info]) => {
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

          const ratioNote = showRatio
            ? ` (${igcRatio > 1 ? '+' : '−'}${Math.abs(finalCost - def.igcCost)} IGC)`
            : '';

          return (
            <div key={type} style={{ ...card, marginBottom: 8, opacity: unlocked ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 20 }}>{info.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{info.name}</span>
                {isActive && (
                  <span style={{ fontSize: 10, color: '#2ECC71', marginLeft: 4 }}>{t.syn_active}</span>
                )}
                {mutexBlocked && (
                  <span style={{ fontSize: 10, color: '#E67E22', marginLeft: 4 }}>{t.syn_blocked}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
                {info.desc}
              </div>
              {isActive && (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>
                  {t.syn_time_left} {timeLeft(syn.activeBonuses.find(b => b.type === type)!.expiresAt)}
                </div>
              )}
              {mutexBlocked && activeConflict && (
                <div style={{ fontSize: 10, color: '#E67E22', marginBottom: 4 }}>
                  {fmt(t.syn_mutex_blocked, {
                    name: bonusLabels[activeConflict.type]?.name ?? activeConflict.type,
                    time: timeLeft(activeConflict.expiresAt),
                  })}
                </div>
              )}
              {!unlocked && (
                <div style={{ fontSize: 10, color: '#E74C3C', marginBottom: 4 }}>
                  {fmt(t.syn_req_level, { n: def.requiredLevel })}
                </div>
              )}
              {isLeader && (
                <button
                  onClick={() => {
                    if (isActive)     { WebApp.showAlert(t.syn_bonus_active); return; }
                    if (mutexBlocked) { WebApp.showAlert(t.syn_mutex_alert); return; }
                    WebApp.showConfirm(
                      fmt(t.syn_buy_confirm, {
                        icon: info.icon, name: info.name, desc: info.desc,
                        cost: finalCost, ratio: ratioNote,
                        treasury: syn.treasuryIgc.toFixed(0),
                      }),
                      (ok) => { if (ok) doAction('buy_syndicate_bonus', { bonusType: type }); },
                    );
                  }}
                  disabled={busy || !canBuy}
                  style={{ ...btnPrimary, marginTop: 4, opacity: canBuy ? 1 : 0.4 }}
                >
                  {isActive
                    ? `✓ ${t.syn_active}`
                    : mutexBlocked
                      ? t.syn_blocked
                      : `${finalCost} IGC${ratioNote}`}
                </button>
              )}
            </div>
          );
        })}
        <button onClick={() => setView('main')} style={btnSecondary}>{t.syn_back}</button>
      </div>
    );
  }

  // ── Статистика клана ──────────────────────────────────
  if (view === 'stats') {
    return (
      <div style={wrap}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{t.syn_stats_title}</div>
        <div style={card}>
          {([
            ['🖥️', t.syn_active_gpus,    String(syn.activeGpuCount  ?? 0)],
            ['🏆', t.syn_blocks_won,      String(syn.totalBlocksWon  ?? 0)],
            ['💎', t.syn_ton_earned,      (syn.totalTonEarned  ?? 0).toFixed(4)],
            ['🪙', t.syn_igc_earned,      (syn.totalIgcEarned  ?? 0).toFixed(0)],
            ['👥', t.syn_members_count,   `${syn.memberCount} / ${syn.maxMembers}`],
            ['⭐', t.syn_clan_level,      String(syn.level)],
            ['📅', t.syn_founded,         formatDate(syn.foundedAt ?? null)],
          ] as [string, string, string][]).map(([icon, label, value]) => (
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
        <button onClick={() => setView('main')} style={btnSecondary}>{t.syn_back}</button>
      </div>
    );
  }

  // ── Управление кланом (только лидер) ─────────────────
  if (view === 'management') {
    return (
      <div style={wrap}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{t.syn_mgmt_title}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
          {t.syn_mgmt_sub}
        </div>

        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>
            {t.syn_mgmt_roster}
          </div>
          <button onClick={() => setView('members')} style={{ ...btnSecondary, marginBottom: 8 }}>
            {t.syn_mgmt_members_btn}
          </button>
        </div>

        <div style={{ ...card, border: '1px solid rgba(231,76,60,0.25)', marginTop: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#E74C3C', marginBottom: 6 }}>
            {t.syn_danger_zone}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12, lineHeight: 1.5 }}>
            {t.syn_dissolve_warning}
          </div>
          <button
            onClick={() => WebApp.showConfirm(
              t.syn_dissolve_confirm,
              (ok) => { if (ok) doAction('dissolve_syndicate'); },
            )}
            disabled={busy}
            style={{ ...btnSecondary, width: '100%', color: '#E74C3C', borderColor: 'rgba(231,76,60,0.4)' }}
          >
            {t.syn_dissolve_btn}
          </button>
        </div>

        <button onClick={() => setView('main')} style={btnSecondary}>{t.syn_back}</button>
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
              {isLeader ? t.syn_is_leader : t.syn_is_member} · {fmt(t.syn_level_fmt, { n: syn.level })}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{t.syn_treasury_label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#9B59B6' }}>
              {syn.treasuryIgc.toFixed(0)} IGC
            </div>
          </div>
        </div>

        {/* XP прогресс */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{t.syn_xp_label}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
              {syn.xpToNext > 0
                ? fmt(t.syn_xp_progress, { cur: syn.xpProgress.toFixed(0), next: syn.xpToNext, lvl: syn.level + 1 })
                : t.syn_xp_max}
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
                🛡️ −{Math.round(syn.wearReduction * 100)}% Wear
              </div>
            )}
          </div>
        )}

        {/* Активные временные бонусы */}
        {syn.activeBonuses.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {syn.activeBonuses.map(b => {
              const info = bonusLabels[b.type];
              return (
                <div key={b.type} style={{ fontSize: 11, color: '#2ECC71', marginBottom: 3 }}>
                  {info?.icon} {info?.name} — {t.syn_time_left} {timeLeft(b.expiresAt)}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Взнос в казну */}
      <div style={card}>
        <div style={cardTitle}>{t.syn_contribute_title}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
          {fmt(t.syn_contribute_sub, { igc: Math.floor(data.user.igcBalance) })}
        </div>
        <input
          type="number"
          value={contributeAmt}
          onChange={e => setContributeAmt(e.target.value)}
          placeholder={t.syn_contribute_ph}
          style={inputStyle}
        />
        <button onClick={handleContribute} disabled={busy} style={btnPrimary}>
          {t.syn_contribute_btn}
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
          <span style={{ fontSize: 12, fontWeight: 600 }}>{t.syn_nav_members}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
            {syn.memberCount}/{syn.maxMembers}
          </span>
        </button>
        <button onClick={() => setView('bonusShop')} style={navCard}>
          <span style={{ fontSize: 20 }}>🛒</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{t.syn_nav_bonuses}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
            {fmt(t.syn_active_n, { n: syn.activeBonuses.length })}
          </span>
        </button>
        <button onClick={() => setView('stats')} style={navCard}>
          <span style={{ fontSize: 20 }}>📊</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{t.syn_nav_stats}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
            {fmt(t.syn_blocks_fmt, { n: syn.totalBlocksWon ?? 0 })}
          </span>
        </button>
        <button onClick={browseSyndicates} disabled={busy} style={navCard}>
          <span style={{ fontSize: 20 }}>🔍</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{t.syn_nav_clans}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
            {t.syn_nav_clans_sub}
          </span>
        </button>
      </div>

      {/* Управление (только лидер) */}
      {isLeader && (
        <button onClick={() => setView('management')} style={{ ...btnSecondary, width: '100%' }}>
          {t.syn_mgmt_btn}
        </button>
      )}

      {/* Выход для участника */}
      {!isLeader && (
        <button
          onClick={() => WebApp.showConfirm(
            t.syn_leave_confirm,
            (ok) => { if (ok) doAction('leave_syndicate'); },
          )}
          disabled={busy}
          style={{ ...btnSecondary, width: '100%', color: '#E74C3C' }}
        >
          {t.syn_leave_btn}
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
