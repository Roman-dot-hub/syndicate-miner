-- ═══════════════════════════════════════════════════════════
-- 014_expand_transactions_type.sql
-- Расширяем CHECK constraint на transactions.type:
-- добавляем типы для апгрейдов инфраструктуры и ремонта GPU
-- ═══════════════════════════════════════════════════════════

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
  CHECK (type = ANY (ARRAY[
    -- существующие типы
    'epoch_reward', 'solo_reward', 'referral_igc', 'referral_bonus',
    'electricity', 'purchase', 'buy_gpu', 'buy_igc',
    'infrastructure', 'marketplace_sale', 'marketplace_buy', 'marketplace_fee',
    'refurbish', 'withdrawal', 'deposit', 'stake_ton', 'unstake_ton',
    -- новые: ремонт и апгрейды (добавлены 2026-06-08)
    'repair_gpu',
    'upgrade_server_room', 'upgrade_ups', 'upgrade_provider',
    'upgrade_paste', 'upgrade_fan', 'upgrade_liquid_cooling',
    'upgrade_infra:farm_level_2', 'upgrade_infra:farm_level_3', 'upgrade_infra:farm_level_4',
    'upgrade_infra:cooling_1',    'upgrade_infra:cooling_2',    'upgrade_infra:cooling_3',
    'upgrade_infra:workbench_1',  'upgrade_infra:workbench_2',  'upgrade_infra:workbench_3'
  ]));
