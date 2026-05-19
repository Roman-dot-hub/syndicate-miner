// ─────────────────────────────────────────────────────────────────────────
// scripts/deployEscrow.ts — неинтерактивный деплой контракта Escrow
//
// Перед запуском заполни contracts/.env (создай если нет):
//   MNEMONIC=word1 word2 ... word24   ← 24 слова кошелька-деплоера
//   ADMIN_WALLET=EQ...                ← адрес, куда идут 5% marketplace fee
//   (если ADMIN_WALLET не задан — feeWallet = адрес самого деплоера)
//
// Запуск:
//   cd contracts && npx blueprint run deployEscrow --testnet
//
// После деплоя скопируй CONTRACT_ADDRESS в backend/.env как ESCROW_CONTRACT_ADDRESS
// ─────────────────────────────────────────────────────────────────────────

import { toNano, Address } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { Escrow } from '../wrappers/Escrow';

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();

    const senderAddress = provider.sender().address;
    if (!senderAddress) {
        throw new Error(
            'Кошелёк не подключён.\n' +
            'Добавь в contracts/.env:\n' +
            '  MNEMONIC=word1 word2 ... word24\n' +
            'Затем запусти: npx blueprint run deployEscrow --testnet',
        );
    }

    // owner = деплоер (backend-кошелёк управляет жизненным циклом сделок)
    const ownerAddress = senderAddress;

    // ── Читаем ADMIN_WALLET для feeWallet ──────────────────────────────────
    const adminWalletStr = process.env.ADMIN_WALLET?.trim();
    let feeAddress: Address;

    if (adminWalletStr) {
        try {
            feeAddress = Address.parse(adminWalletStr);
        } catch {
            throw new Error(`ADMIN_WALLET содержит некорректный адрес: "${adminWalletStr}"`);
        }
    } else {
        feeAddress = senderAddress;
        ui.write('⚠️  ADMIN_WALLET не задан — feeWallet = адрес кошелька деплоера');
    }

    // ── Конфигурация ───────────────────────────────────────────────────────
    ui.write('═══════════════════════════════════════════════════');
    ui.write('  Syndicate Miner — деплой Escrow контракта');
    ui.write('═══════════════════════════════════════════════════');
    ui.write(`  Owner  (управляет сделками): ${ownerAddress.toString()}`);
    ui.write(`  FeeWallet (получает 5%):     ${feeAddress.toString()}`);
    ui.write(`  Деплоер: ${senderAddress.toString()}`);
    ui.write('═══════════════════════════════════════════════════');

    // ── Компиляция и деплой ────────────────────────────────────────────────
    const code = await compile('Escrow');
    const escrow = provider.open(
        Escrow.createFromConfig(
            { owner: ownerAddress, feeWallet: feeAddress },
            code,
        ),
    );

    ui.write('⏳ Отправляем deploy-транзакцию...');
    await escrow.sendDeploy(provider.sender());
    await provider.waitForDeploy(escrow.address);

    // ── Итог ──────────────────────────────────────────────────────────────
    ui.write('');
    ui.write('✅  Escrow задеплоен!');
    ui.write(`    Адрес: ${escrow.address.toString()}`);
    ui.write('');
    ui.write('📋  Добавь в backend/.env:');
    ui.write(`    ESCROW_CONTRACT_ADDRESS=${escrow.address.toString()}`);
}
