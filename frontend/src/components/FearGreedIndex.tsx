import type { IgcStatus } from '../types';
import { useLang } from '../LangContext';

export function FearGreedIndex({ igc }: { igc: IgcStatus }) {
  const { t } = useLang();

  const STATUS_CONFIG: Record<string, { label: string; color: string; pct: number }> = {
    healthy:          { label: t.fgi_neutral,   color: '#2ECC71', pct: 50 },
    mild_surplus:     { label: t.fgi_greed,     color: '#F39C12', pct: 70 },
    mild_deficit:     { label: t.fgi_fear,      color: '#3498DB', pct: 30 },
    critical_surplus: { label: t.fgi_ext_greed, color: '#E74C3C', pct: 90 },
    critical_deficit: { label: t.fgi_panic,     color: '#8E44AD', pct: 10 },
  };

  const cfg = STATUS_CONFIG[igc.status] ?? STATUS_CONFIG.healthy;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.05)', borderRadius: 12,
      padding: '10px 14px',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{t.fgi_title}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
        <div style={{
          height: '100%', borderRadius: 3, width: `${cfg.pct}%`,
          background: `linear-gradient(90deg, #3498DB, ${cfg.color})`,
          transition: 'width 0.5s',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{t.fgi_left}</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{t.fgi_right}</span>
      </div>
    </div>
  );
}
