-- 005: Allow 'stored' as a valid GPU status (off-farm storage)
ALTER TABLE gpus DROP CONSTRAINT IF EXISTS gpus_status_check;
ALTER TABLE gpus ADD CONSTRAINT gpus_status_check
  CHECK (status IN ('active', 'broken', 'offline', 'stored'));
