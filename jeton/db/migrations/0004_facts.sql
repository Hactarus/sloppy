-- 0004_facts.sql — business documents that explain journals (append-only unless stated)
-- Written by the API in the SAME transaction as post_journal() (after it, so the event chain lock is held).
-- Triggers fill business_date, training, receipt_no (gapless per stand) and the stand grand total.

CREATE TABLE refund_contacts (            -- PURGEABLE personal data (R-LED-7, R-CONS-3); referenced by id only
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES events(id),
  contact_enc   bytea,                    -- application-level encrypted (name/e-mail/phone)
  iban_enc      bytea,
  created_at    timestamptz NOT NULL DEFAULT now(),
  purge_after   timestamptz NOT NULL,     -- default now() + 180 days, set by API
  purged_at     timestamptz
);
CREATE TABLE journal_notes (              -- PURGEABLE free-text notes; never hashed
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_id  uuid NOT NULL REFERENCES journal(id),
  note        text,
  created_by  uuid REFERENCES staff(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  purged_at   timestamptz
);

CREATE TABLE topups (
  id                 uuid PRIMARY KEY,
  event_id           uuid NOT NULL REFERENCES events(id),
  journal_id         uuid NOT NULL UNIQUE REFERENCES journal(id),
  wallet_id          uuid NOT NULL REFERENCES wallets(id),
  stand_id           uuid NOT NULL,                                 -- the cashdesk
  device_id          uuid REFERENCES devices(id),
  staff_id           uuid REFERENCES staff(id),
  kind               text NOT NULL CHECK (kind IN ('paid','promo')),
  payment_method     text NOT NULL CHECK (payment_method IN ('cash','sumup_card','sumup_online','wero','bancontact','promo','other')),
  external_ref       text CHECK (external_ref IS NULL OR length(external_ref) BETWEEN 1 AND 200),   -- PSP reference
  manual             boolean NOT NULL DEFAULT false,                -- manually confirmed (Wero/Bancontact without PSP integration)
  confirmed_by_staff_id uuid REFERENCES staff(id),
  amount_cents       integer NOT NULL CHECK (amount_cents >= 0),
  tokens             integer NOT NULL CHECK (tokens > 0),
  token_price_cents  integer NOT NULL CHECK (token_price_cents > 0),
  vat_cents          integer NOT NULL DEFAULT 0 CHECK (vat_cents >= 0),   -- only for voucher_type = single_purpose
  terms_version      text,
  provisional_ref    text,                                          -- device-local number printed offline (not the legal number)
  training           boolean NOT NULL DEFAULT false,
  receipt_no         bigint,
  business_date      date NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (tokens * token_price_cents = amount_cents),
  CHECK ((kind = 'promo') = (payment_method = 'promo')),
  CHECK (NOT manual OR confirmed_by_staff_id IS NOT NULL),
  CHECK (training OR receipt_no IS NOT NULL),
  FOREIGN KEY (stand_id, event_id) REFERENCES stands(id, event_id)
);
CREATE UNIQUE INDEX topups_external_ref_uq ON topups(event_id, payment_method, external_ref)
  WHERE external_ref IS NOT NULL AND NOT training;                  -- one PSP payment can never credit tokens twice
CREATE UNIQUE INDEX topups_receipt_uq ON topups(stand_id, receipt_no) WHERE receipt_no IS NOT NULL;
CREATE INDEX topups_event_date_idx ON topups(event_id, business_date);

CREATE TABLE cashouts (                   -- guest hands the tag back, tokens -> money
  id                 uuid PRIMARY KEY,
  event_id           uuid NOT NULL REFERENCES events(id),
  journal_id         uuid NOT NULL UNIQUE REFERENCES journal(id),
  wallet_id          uuid NOT NULL REFERENCES wallets(id),
  stand_id           uuid NOT NULL,
  device_id          uuid REFERENCES devices(id),
  staff_id           uuid REFERENCES staff(id),
  payment_method     text NOT NULL CHECK (payment_method IN ('cash','sumup_card','sumup_online','wero','bancontact','bank_transfer','other')),
  external_ref       text,
  refund_contact_id  uuid REFERENCES refund_contacts(id),           -- only for bank_transfer
  tokens             integer NOT NULL CHECK (tokens > 0),
  amount_cents       integer NOT NULL CHECK (amount_cents > 0),
  training           boolean NOT NULL DEFAULT false,
  receipt_no         bigint,
  business_date      date NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (training OR receipt_no IS NOT NULL),
  FOREIGN KEY (stand_id, event_id) REFERENCES stands(id, event_id)
);
CREATE UNIQUE INDEX cashouts_receipt_uq ON cashouts(stand_id, receipt_no) WHERE receipt_no IS NOT NULL;

-- Lost/damaged tag: balance moves to a new tag. Cashier only, with reason (journal.reason_code). No wallet-to-wallet API (R-TOP-6).
CREATE TABLE tag_replacements (
  id               uuid PRIMARY KEY,
  event_id         uuid NOT NULL REFERENCES events(id),
  journal_id       uuid NOT NULL UNIQUE REFERENCES journal(id),
  from_wallet_id   uuid NOT NULL REFERENCES wallets(id),
  to_wallet_id     uuid NOT NULL REFERENCES wallets(id),
  tokens           integer NOT NULL CHECK (tokens >= 0),
  training         boolean NOT NULL DEFAULT false,
  business_date    date NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (from_wallet_id <> to_wallet_id)
);

CREATE TABLE orders (
  id                        uuid PRIMARY KEY,
  event_id                  uuid NOT NULL REFERENCES events(id),
  journal_id                uuid NOT NULL UNIQUE REFERENCES journal(id),
  kind                      text NOT NULL DEFAULT 'sale' CHECK (kind IN ('sale','refund')),
  refund_of_order_id        uuid REFERENCES orders(id),
  wallet_id                 uuid NOT NULL REFERENCES wallets(id),
  stand_id                  uuid NOT NULL,
  device_id                 uuid REFERENCES devices(id),
  staff_id                  uuid REFERENCES staff(id),
  consumption_mode_override text CHECK (consumption_mode_override IN ('on_site','takeaway')),   -- per-order override of item defaults
  age_check_confirmed       boolean NOT NULL DEFAULT false,
  items_tokens              integer NOT NULL CHECK (items_tokens >= 0),
  tip_tokens                integer NOT NULL DEFAULT 0 CHECK (tip_tokens >= 0),    -- NOT part of gross/net/vat
  gross_cents               bigint NOT NULL CHECK (gross_cents >= 0),
  net_cents                 bigint NOT NULL CHECK (net_cents >= 0),
  vat_cents                 bigint NOT NULL CHECK (vat_cents >= 0),
  provisional_ref           text,
  training                  boolean NOT NULL DEFAULT false,
  receipt_no                bigint,                                 -- gapless per stand, assigned at ingest
  grand_total_cents         bigint,                                 -- stand perpetual grand total AFTER this order
  business_date             date NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  CHECK (gross_cents = net_cents + vat_cents),
  CHECK ((kind = 'refund') = (refund_of_order_id IS NOT NULL)),
  CHECK (items_tokens + tip_tokens > 0),
  CHECK (training OR (receipt_no IS NOT NULL AND grand_total_cents IS NOT NULL)),
  FOREIGN KEY (stand_id, event_id) REFERENCES stands(id, event_id)
);
CREATE UNIQUE INDEX orders_receipt_uq ON orders(stand_id, receipt_no) WHERE receipt_no IS NOT NULL;
CREATE INDEX orders_event_date_idx ON orders(event_id, business_date, stand_id);
CREATE INDEX orders_wallet_idx ON orders(wallet_id);
CREATE INDEX orders_refund_of_idx ON orders(refund_of_order_id) WHERE refund_of_order_id IS NOT NULL;

-- Lines snapshot name/price/rate at sale time. VAT is NOT stored per line: it is computed per rate group per
-- order (order_vat). Refund orders: positive quantities, refund_of_line_no points at the original line.
CREATE TABLE order_lines (
  order_id             uuid NOT NULL REFERENCES orders(id),
  line_no              integer NOT NULL CHECK (line_no >= 1),
  item_id              uuid REFERENCES items(id),
  item_name            text NOT NULL,
  category_id          uuid REFERENCES categories(id),
  category_name        text,
  qty                  integer NOT NULL CHECK (qty > 0),
  unit_price_tokens    integer NOT NULL CHECK (unit_price_tokens > 0),
  vat_category         text NOT NULL REFERENCES vat_categories(code),
  consumption_mode     text NOT NULL CHECK (consumption_mode IN ('on_site','takeaway')),
  vat_rate_bp          integer NOT NULL CHECK (vat_rate_bp BETWEEN 0 AND 10000),
  gross_cents          bigint NOT NULL CHECK (gross_cents >= 0),
  refund_of_line_no    integer,
  PRIMARY KEY (order_id, line_no)
);
CREATE INDEX order_lines_item_idx ON order_lines(item_id);

-- VAT per rate group per order: vat = round_half_up(gross * rate_bp / (10000 + rate_bp)); net = gross - vat.
-- vat_due=false for single_purpose vouchers (VAT was booked at top-up; informational here) [À VALIDER].
CREATE TABLE order_vat (
  order_id     uuid NOT NULL REFERENCES orders(id),
  vat_rate_bp  integer NOT NULL CHECK (vat_rate_bp BETWEEN 0 AND 10000),
  gross_cents  bigint NOT NULL CHECK (gross_cents >= 0),
  net_cents    bigint NOT NULL CHECK (net_cents >= 0),
  vat_cents    bigint NOT NULL CHECK (vat_cents >= 0),
  vat_due      boolean NOT NULL DEFAULT true,
  PRIMARY KEY (order_id, vat_rate_bp),
  CHECK (gross_cents = net_cents + vat_cents)
);

CREATE TABLE tips_payouts (               -- tips_payable -> cash out. Tip tokens are never spendable on goods.
  id                  uuid PRIMARY KEY,
  event_id            uuid NOT NULL REFERENCES events(id),
  journal_id          uuid NOT NULL UNIQUE REFERENCES journal(id),
  stand_id            uuid NOT NULL,                                -- tips_payable account owner
  cashdesk_id         uuid NOT NULL,
  recipient_staff_id  uuid REFERENCES staff(id),                    -- NULL for collective donation
  tokens              integer NOT NULL CHECK (tokens > 0),
  amount_cents        integer NOT NULL CHECK (amount_cents > 0),
  method              text NOT NULL CHECK (method IN ('cash','bank_transfer','donation')),
  ack_ref             text,                                         -- signature / acknowledgement reference (no personal data)
  training            boolean NOT NULL DEFAULT false,
  business_date       date NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (stand_id, event_id)    REFERENCES stands(id, event_id),
  FOREIGN KEY (cashdesk_id, event_id) REFERENCES stands(id, event_id)
);

CREATE TABLE cash_movements (             -- float, pay-in, pay-out, drop (R-CASH-2); counter-account = bank
  id             uuid PRIMARY KEY,
  event_id       uuid NOT NULL REFERENCES events(id),
  journal_id     uuid NOT NULL UNIQUE REFERENCES journal(id),
  cashdesk_id    uuid NOT NULL,
  session_id     uuid,
  movement       text NOT NULL CHECK (movement IN ('float_in','pay_in','pay_out','drop')),
  amount_cents   integer NOT NULL CHECK (amount_cents > 0),
  training       boolean NOT NULL DEFAULT false,
  business_date  date NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (cashdesk_id, event_id) REFERENCES stands(id, event_id)
);

-- Cash desk session: mutable until closed; after closing only the admin acknowledgement may be set (trigger).
CREATE TABLE cashdesk_sessions (
  id                    uuid PRIMARY KEY,
  event_id              uuid NOT NULL REFERENCES events(id),
  cashdesk_id           uuid NOT NULL,
  device_id             uuid REFERENCES devices(id),
  opened_by             uuid NOT NULL REFERENCES staff(id),
  opened_at             timestamptz NOT NULL DEFAULT now(),
  opening_float_cents   integer NOT NULL CHECK (opening_float_cents >= 0),
  closed_by             uuid REFERENCES staff(id),
  closed_at             timestamptz,
  counted_cents         integer,
  counted_breakdown     jsonb,                         -- {"5000": 2, "500": 3, "100": 7, ...} denomination in cents -> count
  expected_cents        integer,
  variance_cents        integer,
  variance_journal_id   uuid REFERENCES journal(id),   -- posted to cash_over_short
  ack_by                uuid REFERENCES staff(id),
  ack_at                timestamptz,
  FOREIGN KEY (cashdesk_id, event_id) REFERENCES stands(id, event_id)
);
CREATE FUNCTION cashdesk_sessions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'APPEND_ONLY_VIOLATION: cashdesk_sessions' USING ERRCODE = 'JT005'; END IF;
  IF OLD.closed_at IS NOT NULL AND (NEW.closed_at, NEW.closed_by, NEW.counted_cents, NEW.counted_breakdown, NEW.expected_cents,
        NEW.variance_cents, NEW.variance_journal_id, NEW.opening_float_cents, NEW.opened_by)
      IS DISTINCT FROM (OLD.closed_at, OLD.closed_by, OLD.counted_cents, OLD.counted_breakdown, OLD.expected_cents,
        OLD.variance_cents, OLD.variance_journal_id, OLD.opening_float_cents, OLD.opened_by) THEN
    RAISE EXCEPTION 'APPEND_ONLY_VIOLATION: closed cashdesk session is sealed' USING ERRCODE = 'JT005';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cashdesk_sessions_guard BEFORE UPDATE OR DELETE ON cashdesk_sessions FOR EACH ROW EXECUTE FUNCTION cashdesk_sessions_guard();

-- PSP reconciliation (R-PAY-1): payout from SumUp/Wero/Bancontact. Journal: bank +net, psp_fees +fee, psp_clearing -gross.
CREATE TABLE psp_settlements (
  id            uuid PRIMARY KEY,
  event_id      uuid NOT NULL REFERENCES events(id),
  journal_id    uuid NOT NULL UNIQUE REFERENCES journal(id),
  method        text NOT NULL CHECK (method IN ('sumup_card','sumup_online','wero','bancontact','other')),
  payout_ref    text NOT NULL,
  payout_date   date NOT NULL,
  gross_cents   bigint NOT NULL CHECK (gross_cents > 0),
  fee_cents     bigint NOT NULL CHECK (fee_cents >= 0),
  net_cents     bigint NOT NULL CHECK (net_cents = gross_cents - fee_cents),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, method, payout_ref)
);
CREATE TABLE psp_settlement_lines (
  settlement_id     uuid NOT NULL REFERENCES psp_settlements(id),
  line_no           integer NOT NULL,
  psp_ref           text NOT NULL,
  gross_cents       bigint NOT NULL,
  fee_cents         bigint NOT NULL DEFAULT 0,
  matched_topup_id  uuid REFERENCES topups(id),     -- NULL = unmatched (reported)
  PRIMARY KEY (settlement_id, line_no)
);

CREATE TABLE journal_countersignatures (  -- post-closure adjustments need admin + auditor (R-LED-9)
  journal_id  uuid NOT NULL REFERENCES journal(id),
  staff_id    uuid NOT NULL REFERENCES staff(id),
  role        text NOT NULL CHECK (role IN ('admin','auditor')),
  signed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (journal_id, role)
);

CREATE TABLE receipt_prints (             -- every reprint is logged; reprints carry the DUPLICATA marker (R-LED-5)
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id       uuid NOT NULL REFERENCES events(id),
  document_type  text NOT NULL CHECK (document_type IN ('order','topup','cashout')),
  document_id    uuid NOT NULL,
  print_kind     text NOT NULL CHECK (print_kind IN ('original','duplicata')),
  staff_id       uuid REFERENCES staff(id),
  device_id      uuid REFERENCES devices(id),
  at             timestamptz NOT NULL DEFAULT now()
);

-- Fill business_date / training / receipt_no / grand total from the journal (already inserted, chain lock held).
CREATE FUNCTION fact_defaults() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_tz text; v_eff timestamptz; v_training boolean; v_counter stand_counters%ROWTYPE; v_delta bigint;
BEGIN
  SELECT e.timezone, j.effective_at, j.training INTO v_tz, v_eff, v_training
    FROM journal j JOIN events e ON e.id = j.event_id WHERE j.id = NEW.journal_id;
  NEW.business_date := (v_eff AT TIME ZONE v_tz)::date;
  NEW.training := v_training;
  IF TG_TABLE_NAME IN ('topups','cashouts','orders') AND NOT v_training THEN
    v_delta := 0;
    IF TG_TABLE_NAME = 'orders' THEN
      v_delta := CASE WHEN NEW.kind = 'refund' THEN -NEW.gross_cents ELSE NEW.gross_cents END;
    END IF;
    UPDATE stand_counters SET last_receipt_no = last_receipt_no + 1, grand_total_cents = grand_total_cents + v_delta
     WHERE stand_id = NEW.stand_id
     RETURNING * INTO v_counter;
    NEW.receipt_no := v_counter.last_receipt_no;
    IF TG_TABLE_NAME = 'orders' THEN NEW.grand_total_cents := v_counter.grand_total_cents; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER topups_defaults        BEFORE INSERT ON topups        FOR EACH ROW EXECUTE FUNCTION fact_defaults();
CREATE TRIGGER cashouts_defaults      BEFORE INSERT ON cashouts      FOR EACH ROW EXECUTE FUNCTION fact_defaults();
CREATE TRIGGER orders_defaults        BEFORE INSERT ON orders        FOR EACH ROW EXECUTE FUNCTION fact_defaults();
CREATE TRIGGER tag_replacements_defaults BEFORE INSERT ON tag_replacements FOR EACH ROW EXECUTE FUNCTION fact_defaults();
CREATE TRIGGER tips_payouts_defaults  BEFORE INSERT ON tips_payouts  FOR EACH ROW EXECUTE FUNCTION fact_defaults();
CREATE TRIGGER cash_movements_defaults BEFORE INSERT ON cash_movements FOR EACH ROW EXECUTE FUNCTION fact_defaults();

-- Sealed Z-reports, one gapless z_no per stand, with cumulative grand total (R-LED-3/4, R-REP-1).
-- payload = canonical JSON text produced by the API. The DB chains them:
--   hash = SHA-256(prev_hash || z_seq|stand_id|z_no|grand_total_cents|chain_seq|chain_hash_hex|payload)
CREATE TABLE z_reports (
  id                 uuid PRIMARY KEY,
  event_id           uuid NOT NULL REFERENCES events(id),
  stand_id           uuid NOT NULL,
  business_date      date NOT NULL,
  period_start       timestamptz NOT NULL,
  period_end         timestamptz NOT NULL,
  z_seq              bigint NOT NULL,          -- event-wide chain order
  z_no               bigint NOT NULL,          -- gapless per stand
  grand_total_cents  bigint NOT NULL,          -- stand perpetual grand total at sealing
  first_receipt_no   bigint,
  last_receipt_no    bigint,
  chain_seq          bigint NOT NULL,          -- ledger head at sealing time
  chain_hash         bytea NOT NULL,
  payload            text NOT NULL,
  prev_hash          bytea NOT NULL,
  hash               bytea NOT NULL,
  sealed_by          uuid REFERENCES staff(id),
  sealed_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, z_seq),
  UNIQUE (stand_id, z_no),
  UNIQUE (stand_id, business_date),
  FOREIGN KEY (stand_id, event_id) REFERENCES stands(id, event_id)
);
CREATE FUNCTION z_reports_chain() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_head event_chain%ROWTYPE; v_prev bytea; v_seq bigint; v_c stand_counters%ROWTYPE;
BEGIN
  SELECT * INTO v_head FROM event_chain WHERE event_id = NEW.event_id FOR UPDATE;
  UPDATE stand_counters SET last_z_no = last_z_no + 1 WHERE stand_id = NEW.stand_id RETURNING * INTO v_c;
  SELECT z.z_seq, z.hash INTO v_seq, v_prev FROM z_reports z WHERE z.event_id = NEW.event_id ORDER BY z.z_seq DESC LIMIT 1;
  IF v_seq IS NULL THEN
    v_seq := 0; v_prev := sha256(convert_to('jeton-z-genesis|' || NEW.event_id::text, 'UTF8'));
  END IF;
  NEW.z_seq := v_seq + 1;
  NEW.z_no := v_c.last_z_no;
  NEW.grand_total_cents := v_c.grand_total_cents;
  NEW.prev_hash := v_prev;
  NEW.chain_seq := v_head.last_seq;
  NEW.chain_hash := v_head.last_hash;
  NEW.hash := sha256(v_prev || convert_to(NEW.z_seq::text || '|' || NEW.stand_id::text || '|' || NEW.z_no::text || '|' ||
                      NEW.grand_total_cents::text || '|' || NEW.chain_seq::text || '|' ||
                      encode(NEW.chain_hash, 'hex') || '|' || NEW.payload, 'UTF8'));
  RETURN NEW;
END $$;
CREATE TRIGGER z_reports_chain BEFORE INSERT ON z_reports FOR EACH ROW EXECUTE FUNCTION z_reports_chain();

CREATE TABLE chain_anchors (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id       uuid NOT NULL REFERENCES events(id),
  seq            bigint NOT NULL,
  hash           bytea NOT NULL CHECK (octet_length(hash) = 32),
  method         text NOT NULL,      -- 'email', 'rfc3161', 'manual', ...
  reference      text,
  anchored_at    timestamptz NOT NULL DEFAULT now()
);

-- Append-only enforcement on every ledger / fact / closure table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['journal','postings','accounts','topups','cashouts','tag_replacements','orders','order_lines','order_vat',
                           'tips_payouts','cash_movements','psp_settlements','psp_settlement_lines','journal_countersignatures',
                           'receipt_prints','z_reports','chain_anchors','ledger_flags','flag_resolutions','tag_status_log'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION forbid_mutation()',
                   t || '_no_mutation', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation()',
                   t || '_no_truncate', t);
  END LOOP;
END $$;
