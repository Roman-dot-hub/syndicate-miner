// ─────────────────────────────────────────────
// db/migrate.ts — запуск миграций по порядку
//
// Использование:
//   npm run migrate          — применить все новые
//   npm run migrate --check  — показать статус без применения
// ─────────────────────────────────────────────

import fs   from 'fs';
import path from 'path';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(client: Awaited<ReturnType<typeof pool.connect>>) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL      PRIMARY KEY,
      filename   TEXT        NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getApplied(client: Awaited<ReturnType<typeof pool.connect>>): Promise<Set<string>> {
  const { rows } = await client.query('SELECT filename FROM _migrations ORDER BY id');
  return new Set(rows.map((r: { filename: string }) => r.filename));
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const client    = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort(); // 001_ перед 002_ и т.д.

    const pending = files.filter(f => !applied.has(f));

    if (pending.length === 0) {
      console.log('✅ Все миграции уже применены.');
      return;
    }

    console.log(`📋 Ожидают применения: ${pending.length} миграция(-й)`);
    pending.forEach(f => console.log(`   · ${f}`));

    if (checkOnly) return;

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`\n▶ Применяю: ${file}`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (filename) VALUES ($1)',
          [file],
        );
        await client.query('COMMIT');
        console.log(`  ✓ Готово`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ Ошибка в ${file}:`, err);
        process.exit(1);
      }
    }

    console.log('\n✅ Все миграции применены.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
