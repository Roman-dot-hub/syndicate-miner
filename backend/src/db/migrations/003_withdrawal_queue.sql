-- 003_withdrawal_queue.sql
BEGIN;

CREATE TABLE withdrawal_queue (
  id              BIGSERIAL    PRIMARY KEY,
  user_id         UUID         NOT NULL REFERENCES users(id),
  amount_ton      NUMERIC(18,8) NOT NULL,
  net_amount_ton  NUMERIC(18,8) NOT NULL,
  fee_ton         NUMERIC(18,8) NOT NULL,
  wallet_address  TEXT         NOT NULL,
  status          TEXT         NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','done','failed')),
  tx_hash         TEXT,                        -- хэш TON-транзакции после отправки
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ
);

CREATE INDEX idx_wq_user_status ON withdrawal_queue(user_id, status);
CREATE INDEX idx_wq_pending     ON withdrawal_queue(status, created_at) WHERE status = 'pending';

COMMENT ON TABLE withdrawal_queue IS
  'Очередь выплат. Backend-воркер читает pending-записи и отправляет TON через смарт-контракт.';

COMMIT;
