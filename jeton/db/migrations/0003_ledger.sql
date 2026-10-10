-- 0003_ledger.sql — double-entry, append-only, hash-chained ledger
--
-- Error codes raised by this schema (SQLSTATE, message prefix):
--   JT001 DUPLICATE_TX            same client_tx_id with a different request_hash
--   JT002 INSUFFICIENT_BALANCE    wallet would go negative (detail = JSON)
--   JT003 EVENT_NOT_OPEN          event is draft/closed for this journal kind
--   JT004 UNBALANCED_JOURNAL      postings do not sum to zero per unit / bad shape
--   JT005 APPEND_ONLY_VIOLATION   UPDATE/DELETE/TRUNCATE on an append-only table
--   JT006 EVENT_NOT_FOUND
--   JT007 VAT_RATE_NOT_FOUND
--   JT008 TAG_NOT_FOUND
--   JT009 DIRECT_WRITE_FORBIDDEN  journal/postings written outside post_journal()
--   JT010 LEDGER_INTEGRITY_ERROR  hash/chain check failed

-- ───────────────────────── append-only guard ─────────────────────────
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'APPEND_ONLY_VIOLATION: % on % is not allowed (create a reversal instead)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'JT005';
END $$;

-- Per-event chain head. Row lock on this row serialises ALL ledger writes of an event
-- (required anyway for a gap-free hash chain). Mutable by design, derivable from journal.
CREATE TABLE event_chain (
  event_id   uuid PRIMARY KEY REFERENCES events(id),
  last_seq   bigint NOT NULL DEFAULT 0,
  last_hash  bytea NOT NULL CHECK (octet_length(last_hash) = 32)
);
CREATE FUNCTION init_event_chain() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  INSERT INTO event_chain(event_id, last_hash)
  VALUES (NEW.id, sha256(convert_to('jeton-genesis|' || NEW.id::text, 'UTF8')));
  RETURN NULL;
END $$;
CREATE TRIGGER events_chain AFTER INSERT ON events FOR EACH ROW EXECUTE FUNCTION init_event_chain();

-- token_price_cents / country / timezone are frozen once the ledger has entries.
CREATE FUNCTION events_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'closed' AND NEW.status <> 'closed' THEN
    RAISE EXCEPTION 'event % is closed; closing is irreversible', OLD.id USING ERRCODE = 'JT003';
  END IF;
  IF (NEW.token_price_cents <> OLD.token_price_cents OR NEW.country <> OLD.country OR NEW.timezone <> OLD.timezone)
     AND EXISTS (SELECT 1 FROM journal WHERE event_id = OLD.id) THEN
    RAISE EXCEPTION 'token_price_cents/country/timezone are immutable once the event has ledger entries'
      USING ERRCODE = 'JT004';
  END IF;
  IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN NEW.closed_at := now(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER events_guard BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION events_guard();

-- ───────────────────────────── journal ─────────────────────────────
CREATE TABLE journal (
  id                   uuid PRIMARY KEY,
  event_id             uuid NOT NULL REFERENCES events(id),
  seq                  bigint NOT NULL CHECK (seq >= 1),            -- gap-free per event
  kind                 text NOT NULL CHECK (kind IN
                         ('topup','promo_grant','sale','order_refund','cashout','transfer','reversal','breakage','adjustment')),
  client_tx_id         uuid NOT NULL,                               -- idempotency key (UUIDv7)
  request_hash         bytea CHECK (request_hash IS NULL OR octet_length(request_hash) = 32),
  device_id            uuid REFERENCES devices(id),
  staff_id             uuid REFERENCES staff(id),
  offline              boolean NOT NULL DEFAULT false,              -- created offline, synced later
  client_created_at    timestamptz,
  occurred_at          timestamptz NOT NULL,                        -- server time of posting
  effective_at         timestamptz NOT NULL,                        -- business time (client time clamped to <= occurred_at)
  reverses_journal_id  uuid UNIQUE REFERENCES journal(id),          -- a journal can be reversed once
  memo                 text CHECK (memo IS NULL OR memo !~ '[|[:cntrl:]]'),
  prev_hash            bytea NOT NULL CHECK (octet_length(prev_hash) = 32),
  hash                 bytea NOT NULL CHECK (octet_length(hash) = 32),
  UNIQUE (event_id, seq),
  UNIQUE (event_id, client_tx_id),
  UNIQUE (id, event_id),
  CHECK ((kind = 'reversal') = (reverses_journal_id IS NOT NULL))
);
CREATE INDEX journal_event_effective_idx ON journal(event_id, effective_at);

CREATE TABLE postings (
  journal_id  uuid NOT NULL,
  line_no     integer NOT NULL CHECK (line_no >= 1),
  event_id    uuid NOT NULL,
  account_id  uuid NOT NULL,
  unit        text NOT NULL CHECK (unit IN ('TOKEN','EUR_CENTS')),
  amount      bigint NOT NULL CHECK (amount <> 0),                  -- +debit / -credit
  PRIMARY KEY (journal_id, line_no),
  FOREIGN KEY (journal_id, event_id) REFERENCES journal(id, event_id),
  FOREIGN KEY (account_id, event_id) REFERENCES accounts(id, event_id),
  FOREIGN KEY (account_id, unit)     REFERENCES accounts(id, unit)
);
CREATE INDEX postings_account_idx ON postings(account_id, journal_id);

-- Materialised balances (cache). Updated by trigger inside the same transaction
-- as the posting; correct under concurrency because every writer first locks the
-- event_chain row (see post_journal). ledger_reconcile() proves cache == SUM(postings).
CREATE TABLE account_balances (
  account_id  uuid PRIMARY KEY REFERENCES accounts(id),
  event_id    uuid NOT NULL REFERENCES events(id),
  balance     bigint NOT NULL DEFAULT 0,
  last_seq    bigint NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_balances_event_idx ON account_balances(event_id);

-- Trigger: only post_journal() may write journal/postings (it sets a tx-local GUC).
CREATE FUNCTION require_post_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_expected text;
BEGIN
  v_expected := current_setting('jeton.posting', true);
  IF TG_TABLE_NAME = 'journal' THEN
    IF v_expected IS DISTINCT FROM NEW.id::text THEN
      RAISE EXCEPTION 'DIRECT_WRITE_FORBIDDEN: use post_journal()' USING ERRCODE = 'JT009';
    END IF;
  ELSE
    IF v_expected IS DISTINCT FROM NEW.journal_id::text THEN
      RAISE EXCEPTION 'DIRECT_WRITE_FORBIDDEN: use post_journal()' USING ERRCODE = 'JT009';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_guard  BEFORE INSERT ON journal  FOR EACH ROW EXECUTE FUNCTION require_post_journal();
CREATE TRIGGER postings_guard BEFORE INSERT ON postings FOR EACH ROW EXECUTE FUNCTION require_post_journal();

CREATE FUNCTION apply_posting_to_balance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_seq bigint;
BEGIN
  SELECT seq INTO v_seq FROM journal WHERE id = NEW.journal_id;
  INSERT INTO account_balances(account_id, event_id, balance, last_seq)
  VALUES (NEW.account_id, NEW.event_id, NEW.amount, v_seq)
  ON CONFLICT (account_id) DO UPDATE
    SET balance = account_balances.balance + EXCLUDED.balance,
        last_seq = EXCLUDED.last_seq,
        updated_at = now();
  RETURN NULL;
END $$;
CREATE TRIGGER postings_balance AFTER INSERT ON postings FOR EACH ROW EXECUTE FUNCTION apply_posting_to_balance();

-- ───────────────────────────── hashing ─────────────────────────────
-- Canonical form (UTF-8, '|' separated; '' for NULL; booleans 'true'/'false';
-- timestamps = integer microseconds since Unix epoch UTC; hashes lower-case hex):
--   jeton/v1|event_id|seq|journal_id|kind|client_tx_id|reverses_journal_id|device_id|staff_id|
--   offline|occurred_us|effective_us|memo|request_hash_hex|prev_hash_hex|POSTINGS
--   POSTINGS = comma-joined, ordered by line_no:  line_no:account_id:unit:amount
-- hash = SHA-256(canonical). prev_hash(seq 1) = SHA-256('jeton-genesis|' || event_id).
CREATE FUNCTION ledger_hash(
  p_event_id uuid, p_seq bigint, p_id uuid, p_kind text, p_client_tx_id uuid,
  p_reverses uuid, p_device uuid, p_staff uuid, p_offline boolean,
  p_occurred timestamptz, p_effective timestamptz, p_memo text,
  p_request_hash bytea, p_prev bytea, p_postings jsonb
) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
  SELECT sha256(convert_to(
    'jeton/v1|' || p_event_id::text || '|' || p_seq::text || '|' || p_id::text || '|' || p_kind || '|' ||
    p_client_tx_id::text || '|' || COALESCE(p_reverses::text, '') || '|' || COALESCE(p_device::text, '') || '|' ||
    COALESCE(p_staff::text, '') || '|' || (CASE WHEN p_offline THEN 'true' ELSE 'false' END) || '|' ||
    ((extract(epoch FROM p_occurred)  * 1000000)::bigint)::text || '|' ||
    ((extract(epoch FROM p_effective) * 1000000)::bigint)::text || '|' ||
    COALESCE(p_memo, '') || '|' || COALESCE(encode(p_request_hash, 'hex'), '') || '|' ||
    encode(p_prev, 'hex') || '|' ||
    COALESCE((SELECT string_agg((e->>'line_no') || ':' || (e->>'account_id') || ':' || (e->>'unit') || ':' || (e->>'amount'),
                                ',' ORDER BY (e->>'line_no')::int)
                FROM jsonb_array_elements(p_postings) e), ''),
    'UTF8'))
$$;

-- Postings of a journal as the jsonb array used by ledger_hash.
CREATE FUNCTION journal_postings_json(p_journal_id uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('line_no', line_no, 'account_id', account_id, 'unit', unit, 'amount', amount)
                            ORDER BY line_no), '[]'::jsonb)
    FROM postings WHERE journal_id = p_journal_id
$$;

-- Recompute the hash of a stored journal (verification).
CREATE FUNCTION journal_recompute_hash(p_journal_id uuid) RETURNS bytea LANGUAGE sql STABLE AS $$
  SELECT ledger_hash(j.event_id, j.seq, j.id, j.kind, j.client_tx_id, j.reverses_journal_id, j.device_id, j.staff_id,
                     j.offline, j.occurred_at, j.effective_at, j.memo, j.request_hash, j.prev_hash,
                     journal_postings_json(j.id))
    FROM journal j WHERE j.id = p_journal_id
$$;

-- Deferred constraint trigger: whatever path wrote a journal, at COMMIT it must be
-- balanced, correctly hashed and correctly chained to its predecessor.
CREATE FUNCTION journal_commit_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_prev bytea; v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM postings WHERE journal_id = NEW.id;
  IF v_n < 2 THEN
    RAISE EXCEPTION 'UNBALANCED_JOURNAL: journal % has % postings', NEW.id, v_n USING ERRCODE = 'JT004';
  END IF;
  IF EXISTS (SELECT 1 FROM postings WHERE journal_id = NEW.id GROUP BY unit HAVING sum(amount) <> 0) THEN
    RAISE EXCEPTION 'UNBALANCED_JOURNAL: journal % does not sum to zero per unit', NEW.id USING ERRCODE = 'JT004';
  END IF;
  IF NEW.seq = 1 THEN
    v_prev := sha256(convert_to('jeton-genesis|' || NEW.event_id::text, 'UTF8'));
  ELSE
    SELECT hash INTO v_prev FROM journal WHERE event_id = NEW.event_id AND seq = NEW.seq - 1;
  END IF;
  IF v_prev IS DISTINCT FROM NEW.prev_hash THEN
    RAISE EXCEPTION 'LEDGER_INTEGRITY_ERROR: journal % (seq %) prev_hash mismatch', NEW.id, NEW.seq USING ERRCODE = 'JT010';
  END IF;
  IF journal_recompute_hash(NEW.id) IS DISTINCT FROM NEW.hash THEN
    RAISE EXCEPTION 'LEDGER_INTEGRITY_ERROR: journal % hash mismatch', NEW.id USING ERRCODE = 'JT010';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_commit_check AFTER INSERT ON journal
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_commit_check();

-- ───────────────────────────── flags ─────────────────────────────
-- Anomalies are recorded, never silently fixed. Append-only; resolution is a separate row.
CREATE TABLE ledger_flags (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id    uuid NOT NULL REFERENCES events(id),
  journal_id  uuid REFERENCES journal(id),
  flag        text NOT NULL CHECK (flag IN ('NEGATIVE_BALANCE','OFFLINE_CAP_EXCEEDED','TAG_UID_MISMATCH',
                                            'TAG_BLOCKED_AT_SYNC','LATE_AFTER_CLOSE','CLOCK_SKEW')),
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_flags_event_idx ON ledger_flags(event_id, created_at);
CREATE TABLE flag_resolutions (
  flag_id      bigint PRIMARY KEY REFERENCES ledger_flags(id),
  resolved_by  uuid REFERENCES staff(id),
  note         text,
  resolved_at  timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION add_ledger_flag(p_event_id uuid, p_journal_id uuid, p_flag text, p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO ledger_flags(event_id, journal_id, flag, detail) VALUES (p_event_id, p_journal_id, p_flag, p_detail)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ───────────────────────────── post_journal ─────────────────────────────
-- The ONLY write path into journal/postings.
--   p_postings: jsonb array of {"account_id": uuid, "amount": bigint}; unit comes from the account.
--   p_allow_negative: true for offline sync / reversals / breakage (negative balance is flagged, not rejected).
-- Idempotent on (event_id, client_tx_id): same request_hash returns the original (replayed=true);
-- a different request_hash raises JT001 DUPLICATE_TX.
-- Concurrency: locks event_chain row first => all writers of an event are serialised, balance checks are
-- race-free at READ COMMITTED, no deadlocks possible between journals. Keep the transaction short.
CREATE FUNCTION post_journal(
  p_event_id uuid, p_kind text, p_client_tx_id uuid, p_request_hash bytea,
  p_device_id uuid, p_staff_id uuid, p_client_created_at timestamptz, p_offline boolean,
  p_reverses uuid, p_memo text, p_postings jsonb,
  p_allow_negative boolean DEFAULT false, p_journal_id uuid DEFAULT NULL
) RETURNS TABLE(r_journal_id uuid, r_seq bigint, r_hash bytea, r_replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_ev        events%ROWTYPE;
  v_chain     event_chain%ROWTYPE;
  v_exist     journal%ROWTYPE;
  v_id        uuid := COALESCE(p_journal_id, gen_random_uuid());
  v_postings  jsonb;
  v_n         integer;
  v_bad       integer;
  v_occurred  timestamptz := clock_timestamp();
  v_effective timestamptz;
  v_skew      boolean := false;
  v_seq       bigint;
  v_hash      bytea;
  r           record;
  v_bal       bigint;
  v_negative  jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_ev FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'JT006'; END IF;

  SELECT * INTO v_chain FROM event_chain WHERE event_chain.event_id = p_event_id FOR UPDATE;

  SELECT * INTO v_exist FROM journal j WHERE j.event_id = p_event_id AND j.client_tx_id = p_client_tx_id;
  IF FOUND THEN
    IF v_exist.request_hash IS NOT DISTINCT FROM p_request_hash THEN
      RETURN QUERY SELECT v_exist.id, v_exist.seq, v_exist.hash, true;
      RETURN;
    END IF;
    RAISE EXCEPTION 'DUPLICATE_TX: client_tx_id % already used with a different request', p_client_tx_id USING ERRCODE = 'JT001';
  END IF;

  IF p_kind IN ('topup','promo_grant','sale','transfer') AND v_ev.status <> 'open' AND NOT p_offline THEN
    RAISE EXCEPTION 'EVENT_NOT_OPEN: event is %', v_ev.status USING ERRCODE = 'JT003';
  END IF;
  IF p_kind IN ('topup','promo_grant') AND v_ev.status <> 'open' THEN
    RAISE EXCEPTION 'EVENT_NOT_OPEN: event is %', v_ev.status USING ERRCODE = 'JT003';
  END IF;

  -- Resolve accounts, derive units, validate shape.
  SELECT jsonb_agg(jsonb_build_object('line_no', e.ord, 'account_id', a.id, 'unit', a.unit, 'amount', (e.val->>'amount')::bigint)
                   ORDER BY e.ord),
         count(*),
         count(*) FILTER (WHERE a.id IS NULL OR a.event_id <> p_event_id OR (e.val->>'amount')::bigint = 0)
    INTO v_postings, v_n, v_bad
    FROM jsonb_array_elements(p_postings) WITH ORDINALITY AS e(val, ord)
    LEFT JOIN accounts a ON a.id = (e.val->>'account_id')::uuid;
  IF v_n IS NULL OR v_n < 2 OR v_bad > 0 THEN
    RAISE EXCEPTION 'UNBALANCED_JOURNAL: need >= 2 non-zero postings on accounts of this event' USING ERRCODE = 'JT004';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_postings) e GROUP BY e->>'unit' HAVING sum((e->>'amount')::bigint) <> 0) THEN
    RAISE EXCEPTION 'UNBALANCED_JOURNAL: postings must sum to zero per unit' USING ERRCODE = 'JT004';
  END IF;

  -- Wallet sufficiency (race-free: chain lock held).
  FOR r IN
    SELECT a.id AS account_id, a.code, sum((e->>'amount')::bigint) AS delta
      FROM jsonb_array_elements(v_postings) e JOIN accounts a ON a.id = (e->>'account_id')::uuid
     WHERE a.kind = 'wallet'
     GROUP BY a.id, a.code
  LOOP
    SELECT COALESCE((SELECT balance FROM account_balances WHERE account_id = r.account_id), 0) INTO v_bal;
    IF r.delta < 0 AND v_bal + r.delta < 0 THEN
      IF NOT p_allow_negative THEN
        RAISE EXCEPTION 'INSUFFICIENT_BALANCE: %', jsonb_build_object('account', r.code, 'balance', v_bal, 'required', -r.delta)::text
          USING ERRCODE = 'JT002';
      END IF;
      v_negative := v_negative || jsonb_build_array(jsonb_build_object('account', r.code, 'balance_before', v_bal, 'delta', r.delta));
    END IF;
  END LOOP;

  -- Business time: trust the device clock only within [.., server time].
  IF p_client_created_at IS NULL OR p_client_created_at > v_occurred + interval '5 minutes' THEN
    v_effective := v_occurred;
    v_skew := (p_client_created_at IS NOT NULL);
  ELSE
    v_effective := LEAST(p_client_created_at, v_occurred);
  END IF;

  v_seq := v_chain.last_seq + 1;
  v_hash := ledger_hash(p_event_id, v_seq, v_id, p_kind, p_client_tx_id, p_reverses, p_device_id, p_staff_id, p_offline,
                        v_occurred, v_effective, p_memo, p_request_hash, v_chain.last_hash, v_postings);

  PERFORM set_config('jeton.posting', v_id::text, true);
  INSERT INTO journal(id, event_id, seq, kind, client_tx_id, request_hash, device_id, staff_id, offline,
                      client_created_at, occurred_at, effective_at, reverses_journal_id, memo, prev_hash, hash)
  VALUES (v_id, p_event_id, v_seq, p_kind, p_client_tx_id, p_request_hash, p_device_id, p_staff_id, p_offline,
          p_client_created_at, v_occurred, v_effective, p_reverses, p_memo, v_chain.last_hash, v_hash);
  INSERT INTO postings(journal_id, line_no, event_id, account_id, unit, amount)
  SELECT v_id, (e->>'line_no')::int, p_event_id, (e->>'account_id')::uuid, e->>'unit', (e->>'amount')::bigint
    FROM jsonb_array_elements(v_postings) e;
  PERFORM set_config('jeton.posting', '', true);

  UPDATE event_chain SET last_seq = v_seq, last_hash = v_hash WHERE event_chain.event_id = p_event_id;

  IF jsonb_array_length(v_negative) > 0 THEN
    PERFORM add_ledger_flag(p_event_id, v_id, 'NEGATIVE_BALANCE', jsonb_build_object('wallets', v_negative));
  END IF;
  IF v_skew THEN
    PERFORM add_ledger_flag(p_event_id, v_id, 'CLOCK_SKEW', jsonb_build_object('client_created_at', p_client_created_at, 'server_time', v_occurred));
  END IF;
  IF v_ev.status = 'closed' AND p_kind IN ('sale','transfer') THEN
    PERFORM add_ledger_flag(p_event_id, v_id, 'LATE_AFTER_CLOSE', '{}'::jsonb);
  END IF;

  RETURN QUERY SELECT v_id, v_seq, v_hash, false;
END $$;
