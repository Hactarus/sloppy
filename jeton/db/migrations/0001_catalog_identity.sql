-- 0001_catalog_identity.sql — organizer, events, VAT reference data, catalog, staff, devices
-- Conventions: ids are UUID (client-generated UUIDv7 allowed, default random v4),
-- money = integer euro cents, tokens = integer, timestamps = timestamptz (UTC).
-- Legal requirements implemented here: docs/legal/app-requirements.md (R-ORG, R-VAT, R-STAFF).

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- ───────────────────────────── organizer ─────────────────────────────
-- v1: all stands are the organizer's own activity (ADR 0006). Printed on receipts.
CREATE TABLE organizers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name        text NOT NULL,
  legal_form        text NOT NULL CHECK (legal_form IN ('asbl_vzw','company_be','person_be','association_1901','company_fr','micro_fr','other')),
  address           text NOT NULL,
  enterprise_no     text NOT NULL,              -- BCE/KBO or SIREN/SIRET
  vat_no            text,
  contact_email     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER organizers_touch BEFORE UPDATE ON organizers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ───────────────────────────── events ─────────────────────────────
CREATE TABLE events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id        uuid NOT NULL REFERENCES organizers(id),
  name                text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  country             text NOT NULL CHECK (country IN ('BE','FR')),
  timezone            text NOT NULL DEFAULT 'Europe/Brussels',
  currency            text NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  -- Item prices are INTEGER tokens (ADR 0004). Finer price granularity = lower token value (e.g. 50 cents).
  token_price_cents   integer NOT NULL DEFAULT 200 CHECK (token_price_cents > 0),
  offline_cap_tokens  integer NOT NULL DEFAULT 10  CHECK (offline_cap_tokens >= 0),
  max_balance_tokens  integer NOT NULL DEFAULT 100 CHECK (max_balance_tokens > 0),   -- R-TOP-5
  max_topup_tokens    integer NOT NULL DEFAULT 50  CHECK (max_topup_tokens > 0),
  -- VAT / legal (R-ORG-2..4, ADR 0005)
  vat_regime          text NOT NULL DEFAULT 'standard' CHECK (vat_regime IN ('standard','franchise','exempt_event')),
  voucher_type        text NOT NULL DEFAULT 'multi_purpose' CHECK (voucher_type IN ('multi_purpose','single_purpose')),
  single_purpose_vat_category text,                        -- required when voucher_type = single_purpose
  be_gks_required     boolean NOT NULL DEFAULT false,      -- BE: certified cash register (GKS/SCE) may be required
  fr_cash_software_required boolean NOT NULL DEFAULT false,
  third_party_vendors_enabled boolean NOT NULL DEFAULT false CHECK (third_party_vendors_enabled = false),  -- v1: documented only (ADR 0006)
  -- Tips (R-TIP)
  tips_enabled        boolean NOT NULL DEFAULT true,
  tip_presets_tokens  integer[] NOT NULL DEFAULT '{1,2,5}',
  tip_max_tokens      integer NOT NULL DEFAULT 10 CHECK (tip_max_tokens >= 0),
  tip_max_percent     integer NOT NULL DEFAULT 50 CHECK (tip_max_percent BETWEEN 0 AND 100),
  tips_payout_policy  text NOT NULL DEFAULT 'collective_donation' CHECK (tips_payout_policy IN ('staff','collective_donation')),
  -- Refund / breakage policy (R-CONS-1)
  refundable_until    timestamptz,
  min_refund_tokens   integer NOT NULL DEFAULT 1 CHECK (min_refund_tokens >= 1),
  expiry_at           timestamptz,
  breakage_treatment  text NOT NULL DEFAULT 'retain' CHECK (breakage_treatment IN ('retain','donate','refund_later')),
  refund_cash_limited_to_cash_topups boolean NOT NULL DEFAULT true,
  policy_version      text,
  terms_version       text,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed')),
  starts_at           timestamptz,
  ends_at             timestamptz,
  closed_at           timestamptz,
  catalog_version     bigint NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CHECK ((voucher_type = 'single_purpose') = (single_purpose_vat_category IS NOT NULL))
);
CREATE INDEX events_organizer_idx ON events(organizer_id);
CREATE TRIGGER events_touch BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─────────────────────────── VAT reference ───────────────────────────
-- Two dimensions: product category x consumption mode (on_site | takeaway). Rates are DATED DATA
-- per country. Legal code mapping (docs/legal/vat-tokens.md §3):
--   BE_FOOD_ONSITE=(FOOD,on_site) BE_FOOD_TAKEAWAY=(FOOD,takeaway) BE_DRINK_SOFT_ONSITE=(DRINK_SOFT,on_site)
--   BE_DRINK_SOFT_GOODS=(DRINK_SOFT,takeaway) BE_ALCOHOL=(ALCOHOL,*) BE_ICECREAM_*=(ICE_CREAM,*) BE_MERCH=(MERCH,*)
--   FR_FOOD_ONSITE=(FOOD,on_site) FR_FOOD_PACKAGED=(FOOD,takeaway) FR_DRINK_SOFT_IMMEDIATE=(DRINK_SOFT,on_site)
--   FR_DRINK_SOFT_PACKAGED=(DRINK_SOFT,takeaway) FR_ALCOHOL / FR_MERCH / FR_ICECREAM_* analogous.
-- All seed rows are validated=false until the accountant ticks them in the admin UI [À VALIDER].
CREATE TABLE vat_categories (
  code        text PRIMARY KEY CHECK (code ~ '^[A-Z_]{3,32}$'),
  description text NOT NULL
);
CREATE TABLE vat_rates (
  country          text NOT NULL CHECK (country IN ('BE','FR')),
  category_code    text NOT NULL REFERENCES vat_categories(code),
  consumption_mode text NOT NULL CHECK (consumption_mode IN ('on_site','takeaway')),
  rate_bp          integer NOT NULL CHECK (rate_bp BETWEEN 0 AND 10000),  -- basis points: 2100 = 21 %, 550 = 5.5 %
  valid_from       date NOT NULL,
  valid_to         date,                                                   -- inclusive, NULL = open ended
  label            text NOT NULL,
  legal_code       text,                                                   -- e.g. BE_FOOD_ONSITE
  validated        boolean NOT NULL DEFAULT false,
  validated_by     text,
  validated_at     timestamptz,
  PRIMARY KEY (country, category_code, consumption_mode, valid_from),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

INSERT INTO vat_categories(code, description) VALUES
  ('FOOD',       'Prepared food / meals'),
  ('DRINK_SOFT', 'Non-alcoholic drinks'),
  ('ALCOHOL',    'Alcoholic drinks'),
  ('ICE_CREAM',  'Ice cream'),
  ('MERCH',      'Merchandise and other goods'),
  ('ZERO',       'Zero rate / exempt activity (also franchise-regime events)');

INSERT INTO vat_rates(country, category_code, consumption_mode, rate_bp, valid_from, label, legal_code) VALUES
  ('BE','FOOD','on_site',    1200,'2010-01-01','BE 12 %','BE_FOOD_ONSITE'),
  ('BE','FOOD','takeaway',    600,'2000-01-01','BE 6 %','BE_FOOD_TAKEAWAY'),
  ('BE','DRINK_SOFT','on_site',2100,'2000-01-01','BE 21 %','BE_DRINK_SOFT_ONSITE'),
  ('BE','DRINK_SOFT','takeaway',600,'2000-01-01','BE 6 %','BE_DRINK_SOFT_GOODS'),
  ('BE','ALCOHOL','on_site', 2100,'2000-01-01','BE 21 %','BE_ALCOHOL'),
  ('BE','ALCOHOL','takeaway',2100,'2000-01-01','BE 21 %','BE_ALCOHOL'),
  ('BE','ICE_CREAM','on_site',1200,'2010-01-01','BE 12 %','BE_ICECREAM_ONSITE'),
  ('BE','ICE_CREAM','takeaway',600,'2000-01-01','BE 6 %','BE_ICECREAM_TAKEAWAY'),
  ('BE','MERCH','on_site',   2100,'2000-01-01','BE 21 %','BE_MERCH'),
  ('BE','MERCH','takeaway',  2100,'2000-01-01','BE 21 %','BE_MERCH'),
  ('BE','ZERO','on_site',       0,'2000-01-01','BE 0 %','BE_ZERO'),
  ('BE','ZERO','takeaway',      0,'2000-01-01','BE 0 %','BE_ZERO'),
  ('FR','FOOD','on_site',    1000,'2014-01-01','FR 10 %','FR_FOOD_ONSITE'),
  ('FR','FOOD','takeaway',    550,'2014-01-01','FR 5,5 %','FR_FOOD_PACKAGED'),
  ('FR','DRINK_SOFT','on_site',1000,'2014-01-01','FR 10 %','FR_DRINK_SOFT_IMMEDIATE'),
  ('FR','DRINK_SOFT','takeaway',550,'2014-01-01','FR 5,5 %','FR_DRINK_SOFT_PACKAGED'),
  ('FR','ALCOHOL','on_site', 2000,'2014-01-01','FR 20 %','FR_ALCOHOL'),
  ('FR','ALCOHOL','takeaway',2000,'2014-01-01','FR 20 %','FR_ALCOHOL'),
  ('FR','ICE_CREAM','on_site',1000,'2014-01-01','FR 10 %','FR_ICECREAM_IMMEDIATE'),
  ('FR','ICE_CREAM','takeaway',550,'2014-01-01','FR 5,5 %','FR_ICECREAM_PACKAGED'),
  ('FR','MERCH','on_site',   2000,'2014-01-01','FR 20 %','FR_MERCH'),
  ('FR','MERCH','takeaway',  2000,'2014-01-01','FR 20 %','FR_MERCH'),
  ('FR','ZERO','on_site',       0,'2014-01-01','FR 0 %','FR_EXEMPT'),
  ('FR','ZERO','takeaway',      0,'2014-01-01','FR 0 %','FR_EXEMPT');

ALTER TABLE events ADD CONSTRAINT events_single_vat_fk FOREIGN KEY (single_purpose_vat_category) REFERENCES vat_categories(code);

-- Rate in force on a date; raises if none (never silently 0 %).
CREATE FUNCTION vat_rate_bp(p_country text, p_category text, p_mode text, p_on date) RETURNS integer
LANGUAGE plpgsql STABLE AS $$
DECLARE v integer;
BEGIN
  SELECT rate_bp INTO v FROM vat_rates
   WHERE country = p_country AND category_code = p_category AND consumption_mode = p_mode
     AND valid_from <= p_on AND (valid_to IS NULL OR valid_to >= p_on)
   ORDER BY valid_from DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT_RATE_NOT_FOUND: % % % on %', p_country, p_category, p_mode, p_on USING ERRCODE = 'JT007';
  END IF;
  RETURN v;
END $$;

-- ───────────────────────────── catalog ─────────────────────────────
-- kind='cashdesk' rows are locations where top-ups happen; 'stand' rows sell items.
CREATE TABLE stands (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  name_i18n   jsonb NOT NULL DEFAULT '{}'::jsonb,
  kind        text NOT NULL DEFAULT 'stand' CHECK (kind IN ('stand','cashdesk')),
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, event_id)
);
CREATE INDEX stands_event_idx ON stands(event_id);
CREATE TRIGGER stands_touch BEFORE UPDATE ON stands FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  name_i18n   jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, event_id)
);
CREATE INDEX categories_event_idx ON categories(event_id);
CREATE TRIGGER categories_touch BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE items (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                  uuid NOT NULL REFERENCES events(id),
  stand_id                  uuid NOT NULL,
  category_id               uuid NOT NULL,
  name                      text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  name_i18n                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_tokens              integer NOT NULL CHECK (price_tokens > 0),
  vat_category              text NOT NULL REFERENCES vat_categories(code),
  default_consumption_mode  text NOT NULL DEFAULT 'on_site' CHECK (default_consumption_mode IN ('on_site','takeaway')),
  min_age                   integer CHECK (min_age IS NULL OR min_age BETWEEN 1 AND 99),         -- R-CONS-7
  allergens                 text[] NOT NULL DEFAULT '{}'
    CHECK (allergens <@ ARRAY['gluten','crustaceans','eggs','fish','peanuts','soy','milk','nuts','celery','mustard','sesame','sulphites','lupin','molluscs']),
  icon                      text,
  color                     text CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order                integer NOT NULL DEFAULT 0,
  active                    boolean NOT NULL DEFAULT true,          -- soft delete: items are never deleted once sold
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (stand_id, event_id)    REFERENCES stands(id, event_id),
  FOREIGN KEY (category_id, event_id) REFERENCES categories(id, event_id)
);
CREATE INDEX items_stand_idx ON items(stand_id);
CREATE TRIGGER items_touch BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE FUNCTION bump_catalog_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE events SET catalog_version = catalog_version + 1 WHERE id = COALESCE(NEW.event_id, OLD.event_id);
  RETURN NULL;
END $$;
CREATE TRIGGER stands_catalog_ver     AFTER INSERT OR UPDATE OR DELETE ON stands     FOR EACH ROW EXECUTE FUNCTION bump_catalog_version();
CREATE TRIGGER categories_catalog_ver AFTER INSERT OR UPDATE OR DELETE ON categories FOR EACH ROW EXECUTE FUNCTION bump_catalog_version();
CREATE TRIGGER items_catalog_ver      AFTER INSERT OR UPDATE OR DELETE ON items      FOR EACH ROW EXECUTE FUNCTION bump_catalog_version();

-- ─────────────────────── staff, devices, enrollment ───────────────────────
-- Ledger rows reference staff_id only. `name` is a purgeable display name (R-STAFF-2).
CREATE TABLE staff (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  role              text NOT NULL CHECK (role IN ('admin','cashier','vendor','auditor')),
  staff_type        text NOT NULL DEFAULT 'volunteer' CHECK (staff_type IN ('employee','volunteer','vendor_staff')),
  pin_hash          text NOT NULL,                      -- argon2id PHC string; PIN = 4-8 digits
  pin_failed_count  integer NOT NULL DEFAULT 0,
  pin_locked_until  timestamptz,
  active            boolean NOT NULL DEFAULT true,
  purged_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER staff_touch BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE staff_events (
  staff_id  uuid NOT NULL REFERENCES staff(id),
  event_id  uuid NOT NULL REFERENCES events(id),
  PRIMARY KEY (staff_id, event_id)
);

CREATE TABLE devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES events(id),
  stand_id      uuid,
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  kind          text NOT NULL CHECK (kind IN ('terminal','cashdesk','console')),
  platform      text CHECK (platform IN ('android','ios','web')),
  training      boolean NOT NULL DEFAULT false,         -- training-mode device: its journals never count in production figures (immutable)
  app_version   text,
  token_hash    bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  enrolled_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz,
  revoked_reason text,
  UNIQUE (id, event_id),
  FOREIGN KEY (stand_id, event_id) REFERENCES stands(id, event_id)
);
CREATE INDEX devices_event_idx ON devices(event_id);
CREATE FUNCTION devices_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.training <> OLD.training OR NEW.event_id <> OLD.event_id OR NEW.token_hash <> OLD.token_hash THEN
    RAISE EXCEPTION 'devices.training/event_id/token_hash are immutable; enrol a new device' USING ERRCODE = 'JT004';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER devices_guard BEFORE UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION devices_guard();

CREATE TABLE enrollment_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash   bytea NOT NULL UNIQUE CHECK (octet_length(code_hash) = 32),
  event_id    uuid NOT NULL REFERENCES events(id),
  stand_id    uuid,
  kind        text NOT NULL CHECK (kind IN ('terminal','cashdesk','console')),
  training    boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES staff(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  device_id   uuid REFERENCES devices(id),
  FOREIGN KEY (stand_id, event_id) REFERENCES stands(id, event_id)
);
