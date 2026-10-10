-- 0002_tags_accounts.sql — physical tags, chart of accounts, per-event wallets, per-stand counters

CREATE TABLE tags (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 96 random bits, Crockford base32, 20 chars; last char carries 1 bit => '0' or 'G'.
  tag_code              text NOT NULL UNIQUE CHECK (tag_code ~ '^[0-9A-HJKMNP-TV-Z]{19}[0G]$'),
  uid                   bytea NOT NULL UNIQUE CHECK (octet_length(uid) IN (4,7,10)),
  chip_type             text NOT NULL CHECK (chip_type IN ('ntag213','ntag215','ntag216','ntag424dna','mifare_ultralight','other')),
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','retired')),
  password_protected    boolean NOT NULL DEFAULT false,
  signature_verified    boolean,
  enrolled_event_id     uuid REFERENCES events(id),
  enrolled_by_staff_id  uuid REFERENCES staff(id),
  enrolled_by_device_id uuid REFERENCES devices(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  activated_at          timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER tags_touch BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Chart of accounts per event. Sign convention for postings: +debit / -credit.
-- Two units; every journal sums to zero PER UNIT.
--   TOKEN      wallet(tag:<code>) issuance promo_tokens stand_tokens(stand:<id>)
--              tips_payable(tips_payable:stand:<id>)  -- tip tokens: NEVER spendable (not a wallet)
--              breakage_tokens refund_tokens
--   EUR_CENTS  liability  receipts(receipts:cash:<cashdesk id>)  psp_clearing(psp_clearing:<method>)
--              psp_fees  bank  cash_over_short  rounding  stand_revenue(revenue:stand:<id>, net of VAT)
--              vat_payable(vat:<rate_bp>)  vat_deferred (single-purpose vouchers only)
--              breakage_income (NEVER in VAT figures)  promo_expense
-- Training shadow accounts have code 'training:' || production code and training = true.
CREATE TABLE accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id),
  code        text NOT NULL CHECK (code !~ '[|[:cntrl:]]'),
  kind        text NOT NULL CHECK (kind IN (
                'wallet','issuance','promo_tokens','stand_tokens','tips_payable','breakage_tokens','refund_tokens',
                'liability','receipts','psp_clearing','psp_fees','bank','cash_over_short','rounding',
                'stand_revenue','vat_payable','vat_deferred','breakage_income','promo_expense')),
  unit        text NOT NULL CHECK (unit IN ('TOKEN','EUR_CENTS')),
  training    boolean NOT NULL DEFAULT false,
  ref_id      uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, code),
  UNIQUE (id, event_id),
  UNIQUE (id, unit),
  CHECK ((kind IN ('wallet','issuance','promo_tokens','stand_tokens','tips_payable','breakage_tokens','refund_tokens')) = (unit = 'TOKEN')),
  CHECK (training = (code LIKE 'training:%'))
);

-- A tag's wallet inside one event (tags never carry balances across events: R-REG-2).
-- Training wallets are separate rows with training = true.
CREATE TABLE wallets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES events(id),
  tag_id         uuid NOT NULL REFERENCES tags(id),
  account_id     uuid NOT NULL UNIQUE,
  training       boolean NOT NULL DEFAULT false,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  terms_version  text,                     -- T&C version accepted at first top-up (R-CONS-4); no personal data
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, tag_id, training),
  UNIQUE (id, event_id),
  FOREIGN KEY (account_id, event_id) REFERENCES accounts(id, event_id)
);

CREATE TABLE tag_status_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope       text NOT NULL CHECK (scope IN ('tag','wallet')),
  tag_id      uuid NOT NULL REFERENCES tags(id),
  wallet_id   uuid REFERENCES wallets(id),
  old_status  text,
  new_status  text NOT NULL,
  reason_code text,      -- set via set_config('jeton.reason', ..., true)
  staff_id    uuid,      -- set_config('jeton.staff_id', ...)
  device_id   uuid,      -- set_config('jeton.device_id', ...)
  at          timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION log_status_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF TG_TABLE_NAME = 'tags' THEN
      INSERT INTO tag_status_log(scope, tag_id, old_status, new_status, reason_code, staff_id, device_id)
      VALUES ('tag', NEW.id, OLD.status, NEW.status, current_setting('jeton.reason', true),
              NULLIF(current_setting('jeton.staff_id', true), '')::uuid, NULLIF(current_setting('jeton.device_id', true), '')::uuid);
    ELSE
      INSERT INTO tag_status_log(scope, tag_id, wallet_id, old_status, new_status, reason_code, staff_id, device_id)
      VALUES ('wallet', NEW.tag_id, NEW.id, OLD.status, NEW.status, current_setting('jeton.reason', true),
              NULLIF(current_setting('jeton.staff_id', true), '')::uuid, NULLIF(current_setting('jeton.device_id', true), '')::uuid);
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER tags_status_log    AFTER UPDATE OF status ON tags    FOR EACH ROW EXECUTE FUNCTION log_status_change();
CREATE TRIGGER wallets_status_log AFTER UPDATE OF status ON wallets FOR EACH ROW EXECUTE FUNCTION log_status_change();

CREATE FUNCTION ensure_account(p_event_id uuid, p_code text, p_kind text, p_unit text, p_ref_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO accounts(event_id, code, kind, unit, ref_id, training)
  VALUES (p_event_id, p_code, p_kind, p_unit, p_ref_id, p_code LIKE 'training:%')
  ON CONFLICT (event_id, code) DO NOTHING;
  SELECT id INTO v_id FROM accounts WHERE event_id = p_event_id AND code = p_code;
  RETURN v_id;
END $$;

-- Maps a production account to its training shadow (created on demand).
CREATE FUNCTION ensure_training_shadow(p_account_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE a accounts%ROWTYPE;
BEGIN
  SELECT * INTO a FROM accounts WHERE id = p_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'account not found' USING ERRCODE = 'JT004'; END IF;
  IF a.training THEN RETURN a.id; END IF;
  RETURN ensure_account(a.event_id, 'training:' || a.code, a.kind, a.unit, a.ref_id);
END $$;

-- Get-or-create the wallet of a tag in an event (creates the 'tag:<code>' / 'training:tag:<code>' account).
CREATE FUNCTION ensure_wallet(p_event_id uuid, p_tag_id uuid, p_training boolean DEFAULT false)
RETURNS TABLE(wallet_id uuid, account_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_code text; v_acc uuid; v_w uuid;
BEGIN
  SELECT w.id, w.account_id INTO v_w, v_acc FROM wallets w
   WHERE w.event_id = p_event_id AND w.tag_id = p_tag_id AND w.training = p_training;
  IF FOUND THEN wallet_id := v_w; account_id := v_acc; RETURN NEXT; RETURN; END IF;
  SELECT (CASE WHEN p_training THEN 'training:tag:' ELSE 'tag:' END) || t.tag_code INTO v_code FROM tags t WHERE t.id = p_tag_id;
  IF v_code IS NULL THEN RAISE EXCEPTION 'TAG_NOT_FOUND' USING ERRCODE = 'JT008'; END IF;
  v_acc := ensure_account(p_event_id, v_code, 'wallet', 'TOKEN', p_tag_id);
  INSERT INTO wallets(event_id, tag_id, account_id, training) VALUES (p_event_id, p_tag_id, v_acc, p_training)
  ON CONFLICT (event_id, tag_id, training) DO NOTHING;
  SELECT w.id, w.account_id INTO v_w, v_acc FROM wallets w
   WHERE w.event_id = p_event_id AND w.tag_id = p_tag_id AND w.training = p_training;
  wallet_id := v_w; account_id := v_acc; RETURN NEXT;
END $$;

CREATE FUNCTION create_event_accounts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  PERFORM ensure_account(NEW.id, 'issuance',        'issuance',        'TOKEN');
  PERFORM ensure_account(NEW.id, 'promo',           'promo_tokens',    'TOKEN');
  PERFORM ensure_account(NEW.id, 'breakage',        'breakage_tokens', 'TOKEN');
  PERFORM ensure_account(NEW.id, 'refunds',         'refund_tokens',   'TOKEN');
  PERFORM ensure_account(NEW.id, 'liability',       'liability',       'EUR_CENTS');
  PERFORM ensure_account(NEW.id, 'breakage_income', 'breakage_income', 'EUR_CENTS');
  PERFORM ensure_account(NEW.id, 'promo_expense',   'promo_expense',   'EUR_CENTS');
  PERFORM ensure_account(NEW.id, 'psp_fees',        'psp_fees',        'EUR_CENTS');
  PERFORM ensure_account(NEW.id, 'bank',            'bank',            'EUR_CENTS');
  PERFORM ensure_account(NEW.id, 'cash_over_short', 'cash_over_short', 'EUR_CENTS');
  PERFORM ensure_account(NEW.id, 'rounding',        'rounding',        'EUR_CENTS');
  PERFORM ensure_account(NEW.id, 'vat_deferred',    'vat_deferred',    'EUR_CENTS');
  RETURN NULL;
END $$;
CREATE TRIGGER events_accounts AFTER INSERT ON events FOR EACH ROW EXECUTE FUNCTION create_event_accounts();

-- Per-stand gapless counters (R-LED-3/4): receipt_no, z_no and perpetual grand total.
-- Mutable on purpose (derivable); incremented in the same transaction as the document,
-- so a rollback also rolls the number back => no gaps.
CREATE TABLE stand_counters (
  stand_id          uuid PRIMARY KEY REFERENCES stands(id),
  event_id          uuid NOT NULL REFERENCES events(id),
  last_receipt_no   bigint NOT NULL DEFAULT 0,
  last_z_no         bigint NOT NULL DEFAULT 0,
  grand_total_cents bigint NOT NULL DEFAULT 0     -- cumulative signed gross sales (refunds subtract)
);

CREATE FUNCTION create_stand_accounts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  INSERT INTO stand_counters(stand_id, event_id) VALUES (NEW.id, NEW.event_id);
  IF NEW.kind = 'stand' THEN
    PERFORM ensure_account(NEW.event_id, 'stand:' || NEW.id,              'stand_tokens',  'TOKEN',     NEW.id);
    PERFORM ensure_account(NEW.event_id, 'tips_payable:stand:' || NEW.id, 'tips_payable',  'TOKEN',     NEW.id);
    PERFORM ensure_account(NEW.event_id, 'revenue:stand:' || NEW.id,      'stand_revenue', 'EUR_CENTS', NEW.id);
  ELSE
    PERFORM ensure_account(NEW.event_id, 'receipts:cash:' || NEW.id,      'receipts',      'EUR_CENTS', NEW.id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER stands_accounts AFTER INSERT ON stands FOR EACH ROW EXECUTE FUNCTION create_stand_accounts();
