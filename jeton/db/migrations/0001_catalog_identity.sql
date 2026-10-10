-- 0001_catalog_identity.sql — events, VAT reference data, catalog, staff, devices
-- Conventions: ids are UUID (client-generated UUIDv7 allowed, default random v4),
-- money = integer euro cents, tokens = integer, timestamps = timestamptz (UTC).

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- ───────────────────────────── events ─────────────────────────────
CREATE TABLE events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  country             text NOT NULL CHECK (country IN ('BE','FR')),
  timezone            text NOT NULL DEFAULT 'Europe/Brussels',
  currency            text NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  token_price_cents   integer NOT NULL DEFAULT 200 CHECK (token_price_cents > 0),
  offline_cap_tokens  integer NOT NULL DEFAULT 10  CHECK (offline_cap_tokens >= 0),
  tips_enabled        boolean NOT NULL DEFAULT true,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed')),
  starts_at           timestamptz,
  ends_at             timestamptz,
  closed_at           timestamptz,
  catalog_version     bigint NOT NULL DEFAULT 1,   -- bumped on any catalog change (client cache key)
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE TRIGGER events_touch BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─────────────────────────── VAT reference ───────────────────────────
-- Seed values are a WORKING ASSUMPTION; the legal agent / accountant must
-- validate them before the first real event (see ADR 0005).
CREATE TABLE vat_categories (
  code        text PRIMARY KEY CHECK (code ~ '^[A-Z_]{3,32}$'),
  description text NOT NULL
);
CREATE TABLE vat_rates (
  country        text NOT NULL CHECK (country IN ('BE','FR')),
  category_code  text NOT NULL REFERENCES vat_categories(code),
  rate_bp        integer NOT NULL CHECK (rate_bp BETWEEN 0 AND 10000),  -- basis points: 2100 = 21 %
  valid_from     date NOT NULL,
  valid_to       date,                                                   -- inclusive, NULL = open ended
  label          text NOT NULL,
  PRIMARY KEY (country, category_code, valid_from),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

INSERT INTO vat_categories(code, description) VALUES
  ('STANDARD',     'Standard rate: alcohol, merchandise, most drinks served on site (BE), goods in general'),
  ('REDUCED_FOOD', 'Intermediate rate: food/meals served on site (BE 12 %, FR 10 %)'),
  ('REDUCED_LOW',  'Low rate: takeaway food and non-alcoholic drinks as goods (BE 6 %, FR 5.5 %)'),
  ('ZERO',         'Zero rate / outside scope (deposits, donations)');

INSERT INTO vat_rates(country, category_code, rate_bp, valid_from, label) VALUES
  ('BE','STANDARD',    2100,'2000-01-01','BE 21 %'),
  ('BE','REDUCED_FOOD',1200,'2010-01-01','BE 12 %'),
  ('BE','REDUCED_LOW',  600,'2000-01-01','BE 6 %'),
  ('BE','ZERO',           0,'2000-01-01','BE 0 %'),
  ('FR','STANDARD',    2000,'2014-01-01','FR 20 %'),
  ('FR','REDUCED_FOOD',1000,'2014-01-01','FR 10 %'),
  ('FR','REDUCED_LOW',  550,'2014-01-01','FR 5,5 %'),
  ('FR','ZERO',           0,'2014-01-01','FR 0 %');

-- Rate in force on a given date; raises if none (never silently 0 %).
CREATE FUNCTION vat_rate_bp(p_country text, p_category text, p_on date) RETURNS integer
LANGUAGE plpgsql STABLE AS $$
DECLARE v integer;
BEGIN
  SELECT rate_bp INTO v FROM vat_rates
   WHERE country = p_country AND category_code = p_category
     AND valid_from <= p_on AND (valid_to IS NULL OR valid_to >= p_on)
   ORDER BY valid_from DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT_RATE_NOT_FOUND: % % on %', p_country, p_category, p_on USING ERRCODE = 'JT007';
  END IF;
  RETURN v;
END $$;

-- ───────────────────────────── catalog ─────────────────────────────
-- kind='cashdesk' rows are locations where top-ups happen; 'stand' sell items.
CREATE TABLE stands (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  name_i18n   jsonb NOT NULL DEFAULT '{}'::jsonb,       -- {"fr":"...","nl":"...","en":"..."}
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
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES events(id),
  stand_id      uuid NOT NULL,
  category_id   uuid NOT NULL,
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  name_i18n     jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_tokens  integer NOT NULL CHECK (price_tokens > 0),
  vat_category  text NOT NULL REFERENCES vat_categories(code),
  icon          text,                                   -- client icon key (shape cue for colorblind safety)
  color         text CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order    integer NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,          -- soft delete: items are never deleted once sold
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (stand_id, event_id)    REFERENCES stands(id, event_id),
  FOREIGN KEY (category_id, event_id) REFERENCES categories(id, event_id)
);
CREATE INDEX items_stand_idx ON items(stand_id);
CREATE TRIGGER items_touch BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE FUNCTION bump_catalog_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE events SET catalog_version = catalog_version + 1
   WHERE id = COALESCE(NEW.event_id, OLD.event_id);
  RETURN NULL;
END $$;
CREATE TRIGGER stands_catalog_ver     AFTER INSERT OR UPDATE OR DELETE ON stands     FOR EACH ROW EXECUTE FUNCTION bump_catalog_version();
CREATE TRIGGER categories_catalog_ver AFTER INSERT OR UPDATE OR DELETE ON categories FOR EACH ROW EXECUTE FUNCTION bump_catalog_version();
CREATE TRIGGER items_catalog_ver      AFTER INSERT OR UPDATE OR DELETE ON items      FOR EACH ROW EXECUTE FUNCTION bump_catalog_version();

-- ─────────────────────── staff, devices, enrollment ───────────────────────
CREATE TABLE staff (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  role              text NOT NULL CHECK (role IN ('admin','cashier','vendor','auditor')),
  pin_hash          text NOT NULL,                      -- argon2id PHC string; PIN = 4-8 digits
  pin_failed_count  integer NOT NULL DEFAULT 0,
  pin_locked_until  timestamptz,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER staff_touch BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE staff_events (                              -- which events a non-admin may work on
  staff_id  uuid NOT NULL REFERENCES staff(id),
  event_id  uuid NOT NULL REFERENCES events(id),
  PRIMARY KEY (staff_id, event_id)
);

CREATE TABLE devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES events(id),
  stand_id      uuid,                                   -- NULL for console devices
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  kind          text NOT NULL CHECK (kind IN ('terminal','cashdesk','console')),
  platform      text CHECK (platform IN ('android','ios','web')),
  token_hash    bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),  -- SHA-256 of the opaque device token
  enrolled_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz,
  revoked_reason text,
  UNIQUE (id, event_id),
  FOREIGN KEY (stand_id, event_id) REFERENCES stands(id, event_id)
);
CREATE INDEX devices_event_idx ON devices(event_id);

CREATE TABLE enrollment_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash   bytea NOT NULL UNIQUE CHECK (octet_length(code_hash) = 32),    -- SHA-256 of the 8-char code
  event_id    uuid NOT NULL REFERENCES events(id),
  stand_id    uuid,
  kind        text NOT NULL CHECK (kind IN ('terminal','cashdesk','console')),
  created_by  uuid REFERENCES staff(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  device_id   uuid REFERENCES devices(id),
  FOREIGN KEY (stand_id, event_id) REFERENCES stands(id, event_id)
);
