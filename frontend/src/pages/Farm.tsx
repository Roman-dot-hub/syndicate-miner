import { useState, useEffect } from 'react';
import type { SyncData, TapBoost } from '../types';
import { FARM_LEVELS } from '../types';
import { GpuCard } from '../components/GpuCard';
import { TapToCool } from '../components/TapToCool';

interface Props { data: SyncData; onUpdate: () => void }

export function Farm({ data, onUpdate }: Props) {
  const [boostEndTime, setBoostEndTime] = useState(0);
  const [, setTick] = useState(0);

  // Тикаем каждую секунду пока буст активен
  useEffect(() => {
    if (boostEndTime <= Date.now()) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [boostEndTime]);

  // Объединяем локальный таймер с данными сервера
  const localSecondsLeft = Math.max(0, Math.round((boostEndTime - Date.now()) / 1000));
  const serverBoost = data.tapBoost;
  const mergedBoost: TapBoost = {
    active:          localSecondsLeft > 0 || (serverBoost?.active ?? false),
    secondsLeft:     Math.max(localSecondsLeft, serverBoost?.secondsLeft ?? 0),
    cooldownSeconds: serverBoost?.cooldownSeconds ?? 0,
    tapsUsed:        serverBoost?.tapsUsed ?? 0,
    tapsRemaining:   serverBoost?.tapsRemaining ?? 3600,
  };

  const handleBoostTap = (boostSeconds: number) => {
    const newEnd = Date.now() + boostSeconds * 1000;
    setBoostEndTime(prev => Math.max(prev, newEnd));
  };

  const rawFarm = data.farm as any;
  const farm = {
    ...data.farm,
    maxSlots:     rawFarm.maxSlots     ?? rawFarm.max_slots     ?? 5,
    coolingLevel: rawFarm.coolingLevel ?? rawFarm.cooling_level ?? 0,
    igcBalance:   rawFarm.igcBalance   ?? rawFarm.igc_balance   ?? 0,
  };
  const { gpus } = data;
  const activeCount = gpus.filter(g => g.status === 'active').length;
  const totalSlots  = farm.maxSlots;

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Заголовок фермы */}
      <div style={{
        background: 'rgba(255,255,255,0.05)', borderRadius: 14,
        padding: '12px 16px',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
            🏭 {FARM_LEVELS[farm.level] ?? 'Ферма'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
            {activeCount} / {totalSlots} слотов · Охлаждение Lv{farm.coolingLevel}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: '#9B59B6', fontWeight: 600 }}>
            {Math.floor(farm.igcBalance)} IGC
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>на электричество</div>
        </div>
      </div>

      {/* Tap to Cool */}
      <TapToCool onUpdate={onUpdate} tapBoost={mergedBoost} onBoostTap={handleBoostTap} />

      {/* GPU карточки */}
      {gpus.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', padding: 32, fontSize: 13 }}>
          Нет оборудования. Купи GPU в магазине →
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {gpus.map(gpu => (
            <GpuCard key={gpu.id} gpu={gpu} onUpdate={onUpdate} tapBoost={mergedBoost} />
          ))}
        </div>
      )}

      {/* Пустые слоты */}
      {Array.from({ length: Math.max(0, totalSlots - gpus.length) }).map((_, i) => (
        <div key={i} style={{
          borderRadius: 12, padding: 16, textAlign: 'center',
          border: '1px dashed rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.2)', fontSize: 12,
        }}>
          + Пустой слот
        </div>
      ))}
    </div>
  );
}
