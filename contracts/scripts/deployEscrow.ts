// ─────────────────────────────────────────────────────────────────────────
// scripts/deployEscrow.ts — деплой контракта Escrow в TON Testnet
//
// Запуск:
//   npm run deploy:escrow
//   или: npx blueprint run deployEscrow --testnet
//
// После деплоя:
//   Скопируй CONTRACT_ADDRESS в backend/.env как ESCROW_CONTRACT_ADDRESS
// ─────────────────────────────────────────────────────────────────────────

import { toNano, Address } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { Escrow } from '../wrappers/Escrow';

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();

    ui.write('═══════════════════════════════════════════════════');
    ui.write('  Syndicate Miner — деплой Escrow контракта');
    ui.write('═══════════════════════════════════════════════════');

    const ownerAddress = provider.sender().address;
    if (!ownerAddress) {
        throw new Error('Подключи кошелёк (TON Connect или мнемоника в .env)');
    }

    // По умолчанию комиссия идёт на тот же owner (можно отдельный кошелёк)
    const feeAddrStr = await ui.input(
        `Fee-кошелёк для 5% комиссий (Enter = совпадает с owner ${ownerAddress.toString()}):`,
    );
    const feeAddress = feeAddrStr.trim()
        ? Address.parse(feeAddrStr.trim())
        : ownerAddress;

    ui.write('');
    ui.write(`Owner (backend): ${ownerAddress.toString()}`);
    ui.write(`Fee wallet:      ${feeAddress.toString()}`);
    ui.write('Marketplace fee: 5%');
    ui.write('');

    const confirm = await ui.input('Деплоить? (yes/no):');
    if (confirm.toLowerCase() !== 'yes') {
        ui.write('Отменено.');
        return;
    }

    const code   = await compile('Escrow');
    const escrow = provider.open(
        Escrow.createFromConfig(
            { owner: ownerAddress, feeWallet: feeAddress },
            code,
        ),
    );

    await escrow.sendDeploy(provider.sender(), toNano('0.3'));
    await provider.waitForDeploy(escrow.address);

    ui.write('');
    ui.write('✅ Escrow задеплоен!');
    ui.write(`   Адрес: ${escrow.address.toString()}`);
    ui.write('');
    ui.write('📋 Следующие шаги:');
    ui.write(`   1. Добавь в backend/.env:`);
    ui.write(`      ESCROW_CONTRACT_ADDRESS=${escrow.address.toString()}`);
}
