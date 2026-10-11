-- 0008_flag_offline_price.sql — new flag type OFFLINE_PRICE_MISMATCH (offline order priced by the terminal differs from the server catalog)
ALTER TABLE ledger_flags DROP CONSTRAINT ledger_flags_flag_check;
ALTER TABLE ledger_flags ADD CONSTRAINT ledger_flags_flag_check CHECK (flag IN ('NEGATIVE_BALANCE','OFFLINE_CAP_EXCEEDED','TAG_UID_MISMATCH',
  'TAG_BLOCKED_AT_SYNC','LATE_AFTER_CLOSE','CLOCK_SKEW','ADJUSTMENT_AFTER_CLOSE','OFFLINE_PRICE_MISMATCH'));
