-- 0002_tags_accounts.sql — physical tags, chart of accounts, per-event wallets

-- A physical NFC tag (global inventory; reusable across events via wallets).
CREATE TABLE tags (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 96 random bits, Crockford base32, 20 chars; last char carries 1 bit => '0' or 'G'.
  tag_code              text NOT NULL UNIQUE CHECK (tag_code ~ '^[0-9A-HJKMNP-TV-Z]{19}[0G]$'),
  uid                   bytea NOT NULL UNIQUE CHECK (octet_length(uid) IN (4,7,10)),
  chip_type             text NOT NULL CHECK (chip_type IN ('ntag213','ntag215','ntag216','ntag424dna','mifare_ultralight','other')),
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','retired')),
  password_protected    boolean NOT NULL DEFAULT false,
  signature_verified    boolean,                                   -- NXP originality signature check result (NULL = not checked)
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
--   TOKEN unit      wallet(tag:<code>) issuance promo_tokens stand_tokens(stand:<id>)
--                   tips_tokens(tips:stand:<id>) breakage_tokens refund_tokens
--   EUR_CENTS unit  liability receipts(receipts:<method>:<cashdesk id>) payout(payout:<method>)
--                   stand_revenue(revenue:stand:<id>, net of VAT) vat_payable(vat:<rate_bp>)
--                   tips_payable(tips_payable:stand:<id>) breakage_income promo_expense
CREATE TABLE accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id),
  code        text NOT NULL CHECK (code !~ '[|[:cntrl:]]'),
  kind        text NOT NULL CHECK (kind IN (
                'wallet','issuance','promo_tokens','stand_tokens','tips_tokens','breakage_tokens','refund_tokens',
                'liability','receipts','payout','stand_revenue','vat_payable','tips_payable','breakage_income','promo_expense')),
  unit        text NOT NULL CHECK (unit IN ('TOKEN','EUR_CENTS')),
  ref_id      uuid,                                      -- stand / tag id when applicable
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, code),
  UNIQUE (id, event_id),
  UNIQUE (id, unit),
  CHECK ((kind IN ('wallet','issuance','promo_tokens','stand_tokens','tips_tokens','breakage_tokens','refund_tokens')) = (unit = 'TOKEN'))
);

-- A tag's wallet inside one event. status is operational state (blockable), logged below.
CREATE TABLE wallets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id),
  tag_id      uuid NOT NULL REFERENCES tags(id),
  account_id  uuid NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, tag_id),
  UNIQUE (id, event_id),
  FOREIGN KEY (account_id, event_id) REFERENCES accounts(id, event_id)
);

-- Append-only audit trail of tag/wallet status changes (written by trigger).
CREATE TABLE tag_status_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope       text NOT NULL CHECK (scope IN ('tag','wallet')),
  tag_id      uuid NOT NULL REFERENCES tags(id),
  wallet_id   uuid REFERENCES wallets(id),
  old_status  text,
  new_status  text NOT NULL,
  reason      text,      -- set by API via set_config('jeton.reason', ..., true)
  staff_id    uuid,      -- set_config('jeton.staff_id', ...)
  device_id   uuid,      -- set_config('jeton.device_id', ...)
  at          timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION log_status_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF TG_TABLE_NAME = 'tags' THEN
      INSERT INTO tag_status_log(scope, tag_id, old_status, new_status, reason, staff_id, device_id)
      VALUES ('tag', NEW.id, OLD.status, NEW.status, current_setting('jeton.reason', true),
              NULLIF(current_setting('jeton.staff_id', true), '')::uuid, NULLIF(current_setting('jeton.device_id', true), '')::uuid);
    ELSE
      INSERT INTO tag_status_log(scope, tag_id, wallet_id, old_status, new_status, reason, staff_id, device_id)
      VALUES ('wallet', NEW.tag_id, NEW.id, OLD.status, NEW.status, current_setting('jeton.reason', true),
              NULLIF(current_setting('jeton.staff_id', true), '')::uuid, NULLIF(current_setting('jeton.device_id', true), '')::uuid);
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER tags_status_log    AFTER UPDATE OF status ON tags    FOR EACH ROW EXECUTE FUNCTION log_status_change();
CREATE TRIGGER wallets_status_log AFTER UPDATE OF status ON wallets FOR EACH ROW EXECUTE FUNCTION log_status_change();

-- Idempotent account creation.
CREATE FUNCTION ensure_account(p_event_id uuid, p_code text, p_kind text, p_unit text, p_ref_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO accounts(event_id, code, kind, unit, ref_id)
  VALUES (p_event_id, p_code, p_kind, p_unit, p_ref_id)
  ON CONFLICT (event_id, code) DO NOTHING;
  SELECT id INTO v_id FROM accounts WHERE event_id = p_event_id AND code = p_code;
  RETURN v_id;
END $$;

-- Get-or-create the wallet of a tag in an event (also creates the 'tag:<code>' account).
CREATE FUNCTION ensure_wallet(p_event_id uuid, p_tag_id uuid)
RETURNS TABLE(wallet_id uuid, account_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_code text; v_acc uuid; v_w uuid;
BEGIN
  SELECT w.id, w.account_id INTO v_w, v_acc FROM wallets w WHERE w.event_id = p_event_id AND w.tag_id = p_tag_id;
  IF FOUND THEN wallet_id := v_w; account_id := v_acc; RETURN NEXT; RETURN; END IF;
  SELECT 'tag:' || t.tag_code INTO v_code FROM tags t WHERE t.id = p_tag_id;
  IF v_code IS NULL THEN RAISE EXCEPTION 'TAG_NOT_FOUND' USING ERRCODE = 'JT008'; END IF;
  v_acc := ensure_account(p_event_id, v_code, 'wallet', 'TOKEN', p_tag_id);
  INSERT INTO wallets(event_id, tag_id, account_id) VALUES (p_event_id, p_tag_id, v_acc)
  ON CONFLICT (event_id, tag_id) DO NOTHING;
  SELECT w.id, w.account_id INTO v_w, v_acc FROM wallets w WHERE w.event_id = p_event_id AND w.tag_id = p_tag_id;
  wallet_id := v_w; account_id := v_acc; RETURN NEXT;
END $$;

-- Standard accounts created with each event / stand.
CREATE FUNCTION create_event_accounts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  PERFORM ensure_account(NEW.id, 'issuance',        'issuance',        'TOKEN');
  PERFORM ensure_account(NEW.id, 'promo',           'promo_tokens',    'TOKEN');
  PERFORM ensure_account(NEW.id, 'breakage',        'breakage_tokens', 'TOKEN');
  PERFORM ensure_account(NEW.id, 'refunds',         'refund_tokens',   'TOKEN');
  PERFORM ensure_account(NEW.id, 'liability',       'liability',       'EUR_CENTS');
  PERFORM ensure_account(NEW.id, 'breakage_income', 'breakage_income', 'EUR_CENTS');
  PERFORM ensure_account(NEW.id, 'promo_expense',   'promo_expense',   'EUR_CENTS');
  RETURN NULL;
END $$;
CREATE TRIGGER events_accounts AFTER INSERT ON events FOR EACH ROW EXECUTE FUNCTION create_event_accounts();

CREATE FUNCTION create_stand_accounts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.kind = 'stand' THEN
    PERFORM ensure_account(NEW.event_id, 'stand:' || NEW.id,          'stand_tokens',  'TOKEN',     NEW.id);
    PERFORM ensure_account(NEW.event_id, 'tips:stand:' || NEW.id,     'tips_tokens',   'TOKEN',     NEW.id);
    PERFORM ensure_account(NEW.event_id, 'revenue:stand:' || NEW.id,  'stand_revenue', 'EUR_CENTS', NEW.id);
    PERFORM ensure_account(NEW.event_id, 'tips_payable:stand:' || NEW.id, 'tips_payable', 'EUR_CENTS', NEW.id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER stands_accounts AFTER INSERT ON stands FOR EACH ROW EXECUTE FUNCTION create_stand_accounts();
