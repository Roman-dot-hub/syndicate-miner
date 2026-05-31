/**
 * InfoSheet — универсальный bottom-sheet с описанием апгрейда.
 * Вызывается нажатием на кнопку ℹ️ рядом с любым апгрейдом.
 */
import React from 'react';

export interface InfoLevel {
  label:   string;
  effect:  string;
  cost?:   string;  // undefined = нет стоимости (базовый уровень)
  current?: boolean; // подсвечивать как текущий уровень
}

export interface UpgradeInfo {
  emoji:       string;
  title:       string;
  description: string;
  levels:      InfoLevel[];
  costUnit?:   'IGC' | 'TON'; // цвет стоимости
}

interface Props {
  info:    UpgradeInfo;
  onClose: () => void;
}

const CY  = '#00D4FF';
const PU  = '#BD00FF';
const YL  = '#FFD700';
const GR  = '#00FF88';

export function InfoSheet({ info, onClose }: Props) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 1001,
        background: 'linear-gradient(180deg, #0A1628 0%, #060D1A 100%)',
        border: '1px solid rgba(0,212,255,0.2)',
        borderBottom: 'none',
        borderRadius: '20px 20px 0 0',
        padding: '0 0 env(safe-area-inset-bottom)',
        animation: 'infoSheetIn 0.25s ease-out',
        maxHeight: '70vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Handle */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.15)',
          margin: '10px auto 0',
          flexShrink: 0,
        }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 26 }}>{info.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#E0F0FF' }}>{info.title}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, lineHeight: 1.5 }}>
              {info.description}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.5)', fontSize: 14,
              cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* Levels table */}
        <div style={{ overflowY: 'auto', padding: '8px 18px 20px' }}>
          {info.levels.map((lv, i) => {
            const isBase = !lv.cost;
            const costColor = info.costUnit === 'TON' ? YL : PU;
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 10px', borderRadius: 10, marginBottom: 4,
                background: lv.current
                  ? 'rgba(0,212,255,0.08)'
                  : isBase
                    ? 'rgba(255,255,255,0.02)'
                    : 'rgba(255,255,255,0.04)',
                border: lv.current
                  ? '1px solid rgba(0,212,255,0.25)'
                  : '1px solid transparent',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Level dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: isBase ? 'rgba(255,255,255,0.15)' : lv.current ? CY : 'rgba(255,255,255,0.35)',
                    boxShadow: lv.current ? `0 0 6px ${CY}` : 'none',
                  }} />
                  <div>
                    <div style={{
                      fontSize: 12, fontWeight: 700,
                      color: lv.current ? CY : isBase ? 'rgba(255,255,255,0.4)' : '#E0F0FF',
                    }}>
                      {lv.label}
                      {lv.current && (
                        <span style={{
                          marginLeft: 6, fontSize: 9, fontWeight: 800,
                          color: CY, background: 'rgba(0,212,255,0.15)',
                          border: '1px solid rgba(0,212,255,0.3)',
                          borderRadius: 3, padding: '1px 5px', letterSpacing: 0.5,
                        }}>СЕЙЧАС</span>
                      )}
                    </div>
                    <div style={{
                      fontSize: 11,
                      color: isBase ? 'rgba(255,255,255,0.3)' : GR,
                      fontWeight: 600,
                    }}>
                      {lv.effect}
                    </div>
                  </div>
                </div>
                <div style={{
                  fontSize: 12, fontWeight: 800,
                  color: isBase ? 'rgba(255,255,255,0.2)' : costColor,
                }}>
                  {lv.cost ?? '—'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes infoSheetIn {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}

/** Маленькая кнопка ℹ️ — вставляется рядом с любым заголовком апгрейда */
export function InfoBtn({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(e); }}
      style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
        border: '1px solid rgba(0,212,255,0.3)',
        background: 'rgba(0,212,255,0.08)',
        color: 'rgba(0,212,255,0.7)',
        fontSize: 10, fontWeight: 900, fontStyle: 'italic',
        cursor: 'pointer', lineHeight: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Georgia, serif',
      }}
    >i</button>
  );
}
