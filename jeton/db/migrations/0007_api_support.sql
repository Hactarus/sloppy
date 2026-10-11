-- 0007_api_support.sql — tables the API server needs on top of the ledger schema (added by the backend, see server/README.md)
--   * idempotency_keys : original response of every write keyed by (event, client_tx_id). Ledger writes are additionally
--                        protected by journal(event_id, client_tx_id); this table also covers operations without a journal
--                        (tag enrolment/confirmation/status, Z seal, session open/close ...) and lets a replay return the
--                        ORIGINAL result byte for byte.
--   * payment_intents  : online checkouts (SumUp hosted checkout) waiting for the PSP confirmation before tokens are credited.
--   * export_log       : every CSV export is logged (contract: "every export is logged").
--   * devices.pending_offline_ops : last value reported by the terminal in the `X-Pending-Offline-Ops` header; a Z-report
--                        cannot be sealed while a device of the stand reports unsynced operations (ADR 0002).

CREATE TABLE idempotency_keys (
  event_id      uuid NOT NULL REFERENCES events(id),
  client_tx_id  uuid NOT NULL,
  operation     text NOT NULL,
  request_hash  bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  status_code   integer NOT NULL,
  response      jsonb NOT NULL,
  journal_id    uuid REFERENCES journal(id),
  device_id     uuid REFERENCES devices(id),
  staff_id      uuid REFERENCES staff(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, client_tx_id)
);
CREATE TRIGGER idempotency_keys_no_mutation BEFORE UPDATE OR DELETE ON idempotency_keys FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER idempotency_keys_no_truncate BEFORE TRUNCATE ON idempotency_keys FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

CREATE TABLE export_log (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id         uuid NOT NULL REFERENCES events(id),
  dataset          text NOT NULL,
  include_training boolean NOT NULL DEFAULT false,
  row_count        integer NOT NULL,
  staff_id         uuid REFERENCES staff(id),
  device_id        uuid REFERENCES devices(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER export_log_no_mutation BEFORE UPDATE OR DELETE ON export_log FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER export_log_no_truncate BEFORE TRUNCATE ON export_log FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

CREATE TABLE payment_intents (
  id                    uuid PRIMARY KEY,
  event_id              uuid NOT NULL REFERENCES events(id),
  provider              text NOT NULL CHECK (provider IN ('sumup','fake')),
  payment_method        text NOT NULL CHECK (payment_method IN ('sumup_online')),
  provider_checkout_id  text UNIQUE,
  checkout_reference    text NOT NULL UNIQUE,                   -- our reference sent to the PSP (= intent id)
  client_tx_id          uuid NOT NULL,                          -- becomes the top-up's client_tx_id when credited
  tag_code              text NOT NULL,
  tag_uid               text NOT NULL,
  cashdesk_id           uuid NOT NULL,
  amount_cents          integer NOT NULL CHECK (amount_cents > 0),
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','credited','failed','expired','credit_failed')),
  external_ref          text,                                   -- PSP transaction code once paid
  topup_id              uuid REFERENCES topups(id),
  last_error            text,
  created_by_staff_id   uuid REFERENCES staff(id),
  device_id             uuid REFERENCES devices(id),
  training              boolean NOT NULL DEFAULT false,
  hosted_url            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, client_tx_id)
);
CREATE TRIGGER payment_intents_touch BEFORE UPDATE ON payment_intents FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE devices ADD COLUMN pending_offline_ops integer NOT NULL DEFAULT 0 CHECK (pending_offline_ops >= 0);
ALTER TABLE devices ADD COLUMN pending_reported_at timestamptz;

GRANT SELECT, INSERT ON idempotency_keys, export_log TO jeton_app;
GRANT SELECT, INSERT, UPDATE ON payment_intents TO jeton_app;
GRANT SELECT ON export_log TO jeton_auditor;   -- idempotency_keys / payment_intents carry tag codes (bearer capabilities): no auditor access
GRANT SELECT (id, event_id, name, kind, platform, training, stand_id, enrolled_at, last_seen_at, revoked_at, pending_offline_ops) ON devices TO jeton_auditor;
