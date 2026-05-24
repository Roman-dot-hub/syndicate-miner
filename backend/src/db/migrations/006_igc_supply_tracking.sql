-- Track total IGC minted and burned across the network
ALTER TABLE pool_stats
  ADD COLUMN IF NOT EXISTS total_igc_minted NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_igc_burned  NUMERIC NOT NULL DEFAULT 0;
