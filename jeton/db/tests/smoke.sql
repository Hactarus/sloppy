-- smoke.sql — proves migrations 0000-0006 work: ledger posting, idempotency, hash chain,
-- append-only triggers, training isolation, reconciliation. Run as the DB owner on a scratch DB:
--   psql -v ON_ERROR_STOP=1 -f smoke.sql scratch_db
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL client_min_messages = warning;

CREATE TEMP TABLE ctx(k text PRIMARY KEY, v uuid);
INSERT INTO organizers(legal_name, legal_form, address, enterprise_no) VALUES ('Test ASBL','asbl_vzw','Rue 1, 1000 Bruxelles','0123.456.789');
INSERT INTO events(id, organizer_id, name, country, status)
  SELECT gen_random_uuid(), id, 'Fête', 'BE', 'open' FROM organizers LIMIT 1;
INSERT INTO ctx SELECT 'event', id FROM events;
INSERT INTO stands(event_id, name, kind) SELECT v, 'Caisse', 'cashdesk' FROM ctx WHERE k='event';
INSERT INTO stands(event_id, name, kind) SELECT v, 'Bar', 'stand' FROM ctx WHERE k='event';
INSERT INTO ctx SELECT 'desk', id FROM stands WHERE kind='cashdesk';
INSERT INTO ctx SELECT 'bar',  id FROM stands WHERE kind='stand';
INSERT INTO tags(tag_code, uid, chip_type, status) VALUES ('0123456789ABCDEFGHJ0', '\x04A1B2C3D4E5F6', 'ntag215', 'active');
-- tag_code above must match the regex: 19 Crockford chars + [0G]
INSERT INTO ctx SELECT 'tag', id FROM tags;

-- helper to fetch account id by code
CREATE FUNCTION pg_temp.acc(p_code text) RETURNS uuid LANGUAGE sql AS
  $$ SELECT id FROM accounts WHERE code = p_code AND event_id = (SELECT v FROM ctx WHERE k='event') $$;

DO $$
DECLARE
  ev uuid := (SELECT v FROM ctx WHERE k='event'); desk uuid := (SELECT v FROM ctx WHERE k='desk');
  bar uuid := (SELECT v FROM ctx WHERE k='bar'); tag uuid := (SELECT v FROM ctx WHERE k='tag');
  w record; j record; tx uuid := gen_random_uuid(); rh bytea := sha256('x'); n int; r record;
BEGIN
  SELECT * INTO w FROM ensure_wallet(ev, tag);

  -- TOP-UP 10 tokens = 2000 cents
  SELECT * INTO j FROM post_journal(ev,'topup',tx,rh,NULL,NULL,now(),false,NULL,NULL, jsonb_build_array(
      jsonb_build_object('account_id', pg_temp.acc('issuance'), 'amount', -10),
      jsonb_build_object('account_id', w.account_id, 'amount', 10),
      jsonb_build_object('account_id', pg_temp.acc('receipts:cash:'||desk), 'amount', 2000),
      jsonb_build_object('account_id', pg_temp.acc('liability'), 'amount', -2000)));
  ASSERT j.r_seq = 1 AND NOT j.r_replayed, 'first journal seq 1';
  INSERT INTO topups(id, event_id, journal_id, wallet_id, stand_id, kind, payment_method, external_ref, amount_cents, tokens, token_price_cents)
    VALUES (gen_random_uuid(), ev, j.r_journal_id, w.wallet_id, desk, 'paid', 'cash', NULL, 2000, 10, 200);
  ASSERT (SELECT receipt_no FROM topups) = 1, 'topup receipt_no 1';

  -- idempotent replay
  SELECT * INTO j FROM post_journal(ev,'topup',tx,rh,NULL,NULL,now(),false,NULL,NULL, '[]'::jsonb);
  ASSERT j.r_replayed AND j.r_seq = 1, 'replay returns original';
  BEGIN
    PERFORM post_journal(ev,'topup',tx,sha256('other'),NULL,NULL,now(),false,NULL,NULL,'[]'::jsonb);
    RAISE EXCEPTION 'expected DUPLICATE_TX';
  EXCEPTION WHEN SQLSTATE 'JT001' THEN NULL; END;

  -- SALE: 3 tokens item (BE soft drink on site 21 %: gross 600, vat 104, net 496) + 1 token tip
  SELECT * INTO j FROM post_journal(ev,'sale',gen_random_uuid(),sha256('s1'),NULL,NULL,now(),false,NULL,NULL, jsonb_build_array(
      jsonb_build_object('account_id', w.account_id, 'amount', -4),
      jsonb_build_object('account_id', pg_temp.acc('stand:'||bar), 'amount', 3),
      jsonb_build_object('account_id', pg_temp.acc('tips_payable:stand:'||bar), 'amount', 1),
      jsonb_build_object('account_id', pg_temp.acc('liability'), 'amount', 600),
      jsonb_build_object('account_id', pg_temp.acc('revenue:stand:'||bar), 'amount', -496),
      jsonb_build_object('account_id', ensure_account(ev,'vat:2100','vat_payable','EUR_CENTS'), 'amount', -104)));
  ASSERT j.r_seq = 2;
  INSERT INTO orders(id,event_id,journal_id,wallet_id,stand_id,items_tokens,tip_tokens,gross_cents,net_cents,vat_cents)
    VALUES (gen_random_uuid(),ev,j.r_journal_id,w.wallet_id,bar,3,1,600,496,104);
  INSERT INTO order_lines(order_id,line_no,item_name,qty,unit_price_tokens,vat_category,consumption_mode,vat_rate_bp,gross_cents)
    SELECT id,1,'Cola',3,1,'DRINK_SOFT','on_site',2100,600 FROM orders;
  INSERT INTO order_vat(order_id,vat_rate_bp,gross_cents,net_cents,vat_cents) SELECT id,2100,600,496,104 FROM orders;
  ASSERT (SELECT receipt_no FROM orders) = 1 AND (SELECT grand_total_cents FROM orders) = 600, 'order numbering + grand total';

  -- INSUFFICIENT_BALANCE (6 left, spend 7)
  BEGIN
    PERFORM post_journal(ev,'sale',gen_random_uuid(),sha256('s2'),NULL,NULL,now(),false,NULL,NULL, jsonb_build_array(
      jsonb_build_object('account_id', w.account_id, 'amount', -7),
      jsonb_build_object('account_id', pg_temp.acc('stand:'||bar), 'amount', 7),
      jsonb_build_object('account_id', pg_temp.acc('liability'), 'amount', 1400),
      jsonb_build_object('account_id', pg_temp.acc('revenue:stand:'||bar), 'amount', -1400)));
    RAISE EXCEPTION 'expected INSUFFICIENT_BALANCE';
  EXCEPTION WHEN SQLSTATE 'JT002' THEN NULL; END;

  -- offline overdraft is accepted and flagged
  PERFORM post_journal(ev,'sale',gen_random_uuid(),sha256('s3'),NULL,NULL,now(),true,NULL,NULL, jsonb_build_array(
      jsonb_build_object('account_id', w.account_id, 'amount', -7),
      jsonb_build_object('account_id', pg_temp.acc('stand:'||bar), 'amount', 7),
      jsonb_build_object('account_id', pg_temp.acc('liability'), 'amount', 1400),
      jsonb_build_object('account_id', pg_temp.acc('revenue:stand:'||bar), 'amount', -1400)), true);
  ASSERT (SELECT count(*) FROM ledger_flags WHERE flag='NEGATIVE_BALANCE') = 1, 'negative balance flagged';
  -- bring wallet back: top-up 5 tokens
  PERFORM post_journal(ev,'topup',gen_random_uuid(),sha256('t2'),NULL,NULL,now(),false,NULL,NULL, jsonb_build_array(
      jsonb_build_object('account_id', pg_temp.acc('issuance'), 'amount', -5),
      jsonb_build_object('account_id', w.account_id, 'amount', 5),
      jsonb_build_object('account_id', pg_temp.acc('receipts:cash:'||desk), 'amount', 1000),
      jsonb_build_object('account_id', pg_temp.acc('liability'), 'amount', -1000)));

  -- unbalanced journal rejected
  BEGIN
    PERFORM post_journal(ev,'topup',gen_random_uuid(),sha256('bad'),NULL,NULL,now(),false,NULL,NULL, jsonb_build_array(
      jsonb_build_object('account_id', pg_temp.acc('issuance'), 'amount', -5),
      jsonb_build_object('account_id', w.account_id, 'amount', 4)));
    RAISE EXCEPTION 'expected UNBALANCED';
  EXCEPTION WHEN SQLSTATE 'JT004' THEN NULL; END;

  -- direct writes forbidden
  BEGIN
    INSERT INTO postings(journal_id,line_no,event_id,account_id,unit,amount) SELECT id,99,event_id,pg_temp.acc('issuance'),'TOKEN',1 FROM journal LIMIT 1;
    RAISE EXCEPTION 'expected DIRECT_WRITE_FORBIDDEN';
  EXCEPTION WHEN SQLSTATE 'JT009' THEN NULL; END;

END $$;

-- fire the deferred per-journal commit checks (balance + hash + chain) now
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

-- append-only: UPDATE / DELETE / TRUNCATE rejected on every ledger/fact table that has rows
DO $$
DECLARE t record; n int := 0;
BEGIN
  FOR t IN SELECT * FROM (VALUES ('journal','seq'),('postings','amount'),('accounts','code'),('topups','tokens'),
                                 ('orders','items_tokens'),('order_lines','qty'),('ledger_flags','flag')) v(tbl,col) LOOP
    BEGIN EXECUTE format('UPDATE %I SET %I = %I', t.tbl, t.col, t.col); RAISE EXCEPTION 'UPDATE % not blocked', t.tbl;
    EXCEPTION WHEN SQLSTATE 'JT005' THEN n := n + 1; END;
    BEGIN EXECUTE format('DELETE FROM %I', t.tbl); RAISE EXCEPTION 'DELETE % not blocked', t.tbl;
    EXCEPTION WHEN SQLSTATE 'JT005' THEN n := n + 1; END;
    BEGIN EXECUTE format('TRUNCATE %I CASCADE', t.tbl); RAISE EXCEPTION 'TRUNCATE % not blocked', t.tbl;
    EXCEPTION WHEN SQLSTATE 'JT005' THEN n := n + 1; END;
  END LOOP;
  RAISE NOTICE 'append-only: % mutation attempts correctly rejected', n;
END $$;

-- tips payout, training isolation, reconciliation, verification
DO $$
DECLARE
  ev uuid := (SELECT v FROM ctx WHERE k='event'); desk uuid := (SELECT v FROM ctx WHERE k='desk');
  bar uuid := (SELECT v FROM ctx WHERE k='bar'); tag uuid := (SELECT v FROM ctx WHERE k='tag');
  tw record; j record; bad int;
BEGIN
  -- tips payout: 1 tip token -> 200 cents cash out
  PERFORM post_journal(ev,'tips_payout',gen_random_uuid(),sha256('tp'),NULL,NULL,now(),false,NULL,NULL, jsonb_build_array(
      jsonb_build_object('account_id', pg_temp.acc('tips_payable:stand:'||bar), 'amount', -1),
      jsonb_build_object('account_id', pg_temp.acc('refunds'), 'amount', 1),
      jsonb_build_object('account_id', pg_temp.acc('liability'), 'amount', 200),
      jsonb_build_object('account_id', pg_temp.acc('receipts:cash:'||desk), 'amount', -200)));

  -- training: shadow accounts, no mixing, no production receipt numbers
  SELECT * INTO tw FROM ensure_wallet(ev, tag, true);
  PERFORM post_journal(ev,'topup',gen_random_uuid(),sha256('tr'),NULL,NULL,now(),false,NULL,NULL, jsonb_build_array(
      jsonb_build_object('account_id', ensure_training_shadow(pg_temp.acc('issuance')), 'amount', -4),
      jsonb_build_object('account_id', tw.account_id, 'amount', 4),
      jsonb_build_object('account_id', ensure_training_shadow(pg_temp.acc('receipts:cash:'||desk)), 'amount', 800),
      jsonb_build_object('account_id', ensure_training_shadow(pg_temp.acc('liability')), 'amount', -800)), false, NULL, true);
  BEGIN
    PERFORM post_journal(ev,'topup',gen_random_uuid(),sha256('mix'),NULL,NULL,now(),false,NULL,NULL, jsonb_build_array(
      jsonb_build_object('account_id', pg_temp.acc('issuance'), 'amount', -4),
      jsonb_build_object('account_id', tw.account_id, 'amount', 4)), false, NULL, true);
    RAISE EXCEPTION 'expected TRAINING_MIX';
  EXCEPTION WHEN SQLSTATE 'JT011' THEN NULL; END;

  -- reason_code is mandatory on reversals; reversal negates a journal
  SELECT id INTO j FROM journal WHERE kind='topup' AND NOT training ORDER BY seq LIMIT 1;

  SELECT count(*) INTO bad FROM ledger_reconcile(ev) WHERE NOT ok;
  ASSERT bad = 0, 'reconcile: ' || (SELECT string_agg(check_name||':'||detail, '; ') FROM ledger_reconcile(ev) WHERE NOT ok);
  ASSERT (SELECT ok FROM ledger_verify(ev)), 'chain verifies';
END $$;

-- fire the deferred per-journal commit checks (balance + hash + chain) now
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

-- tamper test: owner disables triggers and edits a posting; verification must catch it
ALTER TABLE postings DISABLE TRIGGER USER;
UPDATE postings SET amount = amount + 1 WHERE journal_id = (SELECT id FROM journal WHERE seq = 1) AND line_no = 1;
ALTER TABLE postings ENABLE TRIGGER USER;
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM ledger_verify((SELECT v FROM ctx WHERE k='event'));
  ASSERT NOT r.ok AND r.first_bad_seq = 1, 'tampering detected at seq 1';
  RAISE NOTICE 'tamper detected: %', r.reason;
END $$;

ROLLBACK;  -- scratch test: leave nothing behind
SELECT 'SMOKE OK' AS result;
