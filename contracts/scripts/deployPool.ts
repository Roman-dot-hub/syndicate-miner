// ─────────────────────────────────────────────────────────────────────────
// scripts/deployPool.ts — неинтерактивный деплой контракта Pool
//
// Перед запуском заполни contracts/.env (создай если нет):
//   MNEMONIC=word1 word2 ... word24   ← 24 слова кошелька-деплоера
//   ADMIN_WALLET=EQ...                ← адрес, куда идут 10% admin fee
//   (если ADMIN_WALLET не задан — owner = адрес самого деплоера)
//
// Запуск:
//   cd contracts && npx blueprint run deployPool --testnet
//
// После деплоя скопируй CONTRACT_ADDRESS в backend/.env как POOL_CONTRACT_ADDRESS
// ─────────────────────────────────────────────────────────────────────────

import { toNano, Address } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { Pool } from '../wrappers/Pool';

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();

    const senderAddress = provider.sender().address;
    if (!senderAddress) {
        throw new Error(
            'Кошелёк не подключён.\n' +
            'Добавь в contracts/.env:\n' +
            '  MNEMONIC=word1 word2 ... word24\n' +
            'Затем запусти: npx blueprint run deployPool --testnet',
        );
    }

    // ── Читаем ADMIN_WALLET из переменных среды ────────────────────────────
    const adminWalletStr = process.env.ADMIN_WALLET?.trim();
    let ownerAddress: Address;

    if (adminWalletStr) {
        try {
            ownerAddress = Address.parse(adminWalletStr);
        } catch {
            throw new Error(`ADMIN_WALLET содержит некорректный адрес: "${adminWalletStr}"`);
        }
    } else {
        // owner = сам деплоер (можно сменить позже через ChangeBackend)
        ownerAddress = senderAddress;
        ui.write('⚠️  ADMIN_WALLET не задан — owner = адрес кошелька деплоера');
    }

    // backend (подписывает on-chain выплаты) = тот же деплоер по умолчанию
    const backendAddress = senderAddress;

    // ── Конфигурация ───────────────────────────────────────────────────────
    ui.write('═══════════════════════════════════════════════════');
    ui.write('  Syndicate Miner — деплой Pool контракта');
    ui.write('═══════════════════════════════════════════════════');
    ui.write(`  Owner  (получает 10% fee): ${ownerAddress.toString()}`);
    ui.write(`  Backend (подписывает выплаты): ${backendAddress.toString()}`);
    ui.write(`  Деплоер: ${senderAddress.toString()}`);
    ui.write('═══════════════════════════════════════════════════');

    // ── Компиляция и деплой ────────────────────────────────────────────────
    const code = await compile('Pool');
    const pool = provider.open(
        Pool.createFromConfig(
            { owner: ownerAddress, backend: backendAddress },
            code,
        ),
    );

    ui.write('⏳ Отправляем deploy-транзакцию...');
    await pool.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(pool.address);

    // ── Итог ──────────────────────────────────────────────────────────────
    ui.write('');
    ui.write('✅  Pool задеплоен!');
    ui.write(`    Адрес: ${pool.address.toString()}`);
    ui.write('');
    ui.write('📋  Добавь в backend/.env:');
    ui.write(`    POOL_CONTRACT_ADDRESS=${pool.address.toString()}`);
    ui.write(`    BACKEND_WALLET_MNEMONIC=<те же 24 слова из MNEMONIC>`);
    ui.write('');
    ui.write('▶️  Следующий шаг: npx blueprint run deployEscrow --testnet');
}
