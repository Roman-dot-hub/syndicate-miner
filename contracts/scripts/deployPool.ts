// ─────────────────────────────────────────────────────────────────────────
// scripts/deployPool.ts — деплой контракта Pool в TON Testnet
//
// Запуск:
//   npm run deploy:pool
//   или: npx blueprint run deployPool --testnet
//
// Требования:
//   .env (в папке contracts/): ADMIN_WALLET_MNEMONIC, BACKEND_WALLET_ADDRESS
//
// После деплоя:
//   1. Скопируй CONTRACT_ADDRESS в backend/.env как POOL_CONTRACT_ADDRESS
//   2. Пополни контракт (в игре это делает сбор от продаж)
// ─────────────────────────────────────────────────────────────────────────

import { toNano, Address } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { Pool } from '../wrappers/Pool';

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();

    ui.write('═══════════════════════════════════════════════════');
    ui.write('  Syndicate Miner — деплой Pool контракта');
    ui.write('═══════════════════════════════════════════════════');

    // ── Адреса ────────────────────────────────────────────────────────────
    const ownerAddress = provider.sender().address;
    if (!ownerAddress) {
        throw new Error('Подключи кошелёк (TON Connect или мнемоника в .env)');
    }

    const backendAddrStr = await ui.input(
        'Backend-кошелёк (из BACKEND_WALLET_ADDRESS в backend/.env):',
    );
    const backendAddress = Address.parse(backendAddrStr.trim());

    ui.write('');
    ui.write(`Owner (admin):  ${ownerAddress.toString()}`);
    ui.write(`Backend:        ${backendAddress.toString()}`);
    ui.write('Admin fee:      10%');
    ui.write('MIN_RESERVE:    0.3 TON');
    ui.write('');

    const confirm = await ui.input('Деплоить? (yes/no):');
    if (confirm.toLowerCase() !== 'yes') {
        ui.write('Отменено.');
        return;
    }

    // ── Компиляция и деплой ───────────────────────────────────────────────
    const code = await compile('Pool');
    const pool = provider.open(
        Pool.createFromConfig(
            { owner: ownerAddress, backend: backendAddress },
            code,
        ),
    );

    // Деплоим с начальным балансом 0.5 TON (на storage + первые транзакции)
    await pool.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(pool.address);

    ui.write('');
    ui.write('✅ Pool задеплоен!');
    ui.write(`   Адрес: ${pool.address.toString()}`);
    ui.write('');
    ui.write('📋 Следующие шаги:');
    ui.write(`   1. Добавь в backend/.env:`);
    ui.write(`      POOL_CONTRACT_ADDRESS=${pool.address.toString()}`);
    ui.write(`   2. Пополни пул — отправь TON на адрес контракта`);
    ui.write(`      (10% уйдёт owner, 90% осядет в резерве)`);
    ui.write(`   3. Проверь баланс: npx blueprint run checkPool --testnet`);
}
