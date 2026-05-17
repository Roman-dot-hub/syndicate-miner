// ─────────────────────────────────────────────
// monitoring/syncPoolBalance.ts
//
// Синхронизирует pool_stats.reserve_pool_ton
// с реальным балансом смарт-контракта через TON API.
//
// Запускается dailyCron каждые 5 минут
// (независимо от epochRunner).
//
// Логика:
//   1. Читаем баланс контракта через TON HTTP API v2
//   2. Сравниваем с текущим значением в БД
//   3. Если расхождение > порога — обновляем БД и пишем в лог
//   4. Если контракт пуст — эпохи приостанавливаются
// ─────────────────────────────────────────────

import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const TON_ENDPOINT    = process.env.TON_ENDPOINT    ?? 'https://testnet.toncenter.com/api/v2/';
const CONTRACT_ADDRESS = process.env.POOL_CONTRACT_ADDRESS ?? ''; // заполнить после деплоя контракта

// Максимальное допустимое расхождение (0.001 TON = шум комиссий)
const DRIFT_THRESHOLD_TON = 0.001;

// ─────────────────────────────────────────────

interface TonGetAddressBalanceResponse {
  ok: boolean;
  result: string; // баланс в нано-TON (строка)
}

async function fetchContractBalance(address: string): Promise<number> {
  if (!address) {
    console.warn('[SyncPool] POOL_CONTRACT_ADDRESS не задан — синхронизация пропущена.');
    return -1;
  }

  const url = `${TON_ENDPOINT}getAddressBalance?address=${address}`;
  const res  = await fetch(url);

  if (!res.ok) throw new Error(`TON API ошибка: ${res.status}`);

  const json = await res.json() as TonGetAddressBalanceResponse;
  if (!json.ok) throw new Error(`TON API вернул ok=false`);

  // Конвертируем нано-TON → TON (1 TON = 1_000_000_000 нано)
  return Number(json.result) / 1_000_000_000;
}

// ─────────────────────────────────────────────

export async function syncPoolBalance(): Promise<void> {
  try {
    const contractTon = await fetchContractBalance(CONTRACT_ADDRESS);
    if (contractTon < 0) return; // адрес не задан

    // Читаем текущее значение из БД
    const { rows: [row] } = await db.query(
      'SELECT reserve_pool_ton FROM pool_stats WHERE id = 1'
    );
    const dbTon: number = parseFloat(row?.reserve_pool_ton ?? '0');

    const drift = Math.abs(contractTon - dbTon);

    if (drift <= DRIFT_THRESHOLD_TON) {
      // Расхождение в пределах нормы — не трогаем
      return;
    }

    // Обновляем БД реальным балансом контракта
    await db.query(
      'UPDATE pool_stats SET reserve_pool_ton = $1, updated_at = NOW() WHERE id = 1',
      [contractTon]
    );

    console.log(
      `[SyncPool] Баланс обновлён: ${dbTon.toFixed(4)} → ${contractTon.toFixed(4)} TON ` +
      `(расхождение: ${drift.toFixed(6)} TON)`
    );

    // Если пул полностью пуст — предупреждение
    if (contractTon === 0) {
      console.error('[SyncPool] ⚠️ ПУЛЬ ПУСТОЙ! Эпохи будут пропущены до пополнения.');
      // TODO: отправить уведомление в Telegram-бота администратора
    }

  } catch (err) {
    // Ошибка синхронизации не должна ронять сервер
    console.error('[SyncPool] Ошибка:', err);
  }
}
