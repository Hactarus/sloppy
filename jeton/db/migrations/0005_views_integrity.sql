-- 0005_views_integrity.sql — reporting views, chain verification, reconciliation

-- All production views exclude training data (training = false).
CREATE VIEW v_wallet_balances AS
SELECT w.event_id, w.id AS wallet_id, t.tag_code, w.status AS wallet_status, w.training,
       COALESCE(b.balance, 0) AS balance_tokens
  FROM wallets w
  JOIN tags t ON t.id = w.tag_id
  LEFT JOIN account_balances b ON b.account_id = w.account_id;

CREATE VIEW v_negative_wallets AS
SELECT * FROM v_wallet_balances WHERE balance_tokens < 0 AND NOT training;

-- Outstanding token liability = tokens in wallets (tip tokens reported separately as tips_payable).
CREATE VIEW v_outstanding_liability AS
SELECT e.id AS event_id, e.token_price_cents,
       COALESCE(sum(v.balance_tokens), 0)::bigint AS outstanding_tokens,
       (COALESCE(sum(v.balance_tokens), 0) * e.token_price_cents)::bigint AS outstanding_cents,
       count(*) FILTER (WHERE v.balance_tokens > 0) AS wallets_with_balance
  FROM events e LEFT JOIN v_wallet_balances v ON v.event_id = e.id AND NOT v.training
 GROUP BY e.id, e.token_price_cents;

CREATE VIEW v_tips_payable AS
SELECT a.event_id, a.ref_id AS stand_id, COALESCE(b.balance, 0)::bigint AS tokens
  FROM accounts a LEFT JOIN account_balances b ON b.account_id = a.id
 WHERE a.kind = 'tips_payable' AND NOT a.training;

-- Signed order lines: refunds count negatively.
CREATE VIEW v_sales_lines AS
SELECT o.event_id, o.id AS order_id, o.journal_id, o.stand_id, o.staff_id, o.business_date, o.created_at,
       l.line_no, l.item_id, l.item_name, l.category_id, l.category_name, l.vat_category, l.consumption_mode, l.vat_rate_bp,
       CASE WHEN o.kind = 'refund' THEN -l.qty ELSE l.qty END AS qty,
       CASE WHEN o.kind = 'refund' THEN -(l.qty * l.unit_price_tokens) ELSE l.qty * l.unit_price_tokens END AS tokens,
       CASE WHEN o.kind = 'refund' THEN -l.gross_cents ELSE l.gross_cents END AS gross_cents
  FROM orders o JOIN order_lines l ON l.order_id = o.id
 WHERE NOT o.training;

-- VAT due (multi-purpose: at redemption). Breakage / refunds of unused tokens never appear here.
CREATE VIEW v_vat_breakdown AS
SELECT o.event_id, o.stand_id, o.business_date, v.vat_rate_bp, v.vat_due,
       sum(CASE WHEN o.kind = 'refund' THEN -v.gross_cents ELSE v.gross_cents END)::bigint AS gross_cents,
       sum(CASE WHEN o.kind = 'refund' THEN -v.net_cents   ELSE v.net_cents   END)::bigint AS net_cents,
       sum(CASE WHEN o.kind = 'refund' THEN -v.vat_cents   ELSE v.vat_cents   END)::bigint AS vat_cents
  FROM orders o JOIN order_vat v ON v.order_id = o.id
 WHERE NOT o.training
 GROUP BY o.event_id, o.stand_id, o.business_date, v.vat_rate_bp, v.vat_due;

CREATE VIEW v_tips AS
SELECT event_id, business_date, stand_id, staff_id,
       sum(CASE WHEN kind = 'refund' THEN -tip_tokens ELSE tip_tokens END)::bigint AS tip_tokens
  FROM orders WHERE NOT training GROUP BY event_id, business_date, stand_id, staff_id;

CREATE VIEW v_cash_movements AS
SELECT event_id, business_date, payment_method, 'topup'::text AS movement,
       count(*) AS n, sum(amount_cents)::bigint AS cents, sum(tokens)::bigint AS tokens
  FROM topups WHERE NOT training GROUP BY event_id, business_date, payment_method
UNION ALL
SELECT event_id, business_date, payment_method, 'cashout', count(*), -sum(amount_cents)::bigint, -sum(tokens)::bigint
  FROM cashouts WHERE NOT training GROUP BY event_id, business_date, payment_method;

-- Rolling 12-month redemption volume per organizer (PSD2 art. 37(2) limited-network threshold, R-REG-1).
CREATE VIEW v_redemptions_rolling_12m AS
SELECT ev.organizer_id,
       COALESCE(sum(CASE WHEN o.kind = 'refund' THEN -o.gross_cents ELSE o.gross_cents END), 0)::bigint AS redeemed_cents_12m,
       80000000::bigint  AS warn_threshold_cents,     -- EUR 800 000
       100000000::bigint AS limit_threshold_cents     -- EUR 1 000 000
  FROM organizers org
  JOIN events ev ON ev.organizer_id = org.id
  LEFT JOIN orders o ON o.event_id = ev.id AND NOT o.training AND o.business_date > (current_date - interval '12 months')
 GROUP BY ev.organizer_id;

-- ───────────── verification of the hash chain (the accountant's tool) ─────────────
CREATE FUNCTION ledger_verify(p_event_id uuid)
RETURNS TABLE(ok boolean, checked bigint, head_seq bigint, head_hash bytea, first_bad_seq bigint, reason text)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  r record; v_prev bytea := sha256(convert_to('jeton-genesis|' || p_event_id::text, 'UTF8'));
  v_expected bigint := 1; v_n bigint := 0; v_last bytea := v_prev; v_chain event_chain%ROWTYPE;
  v_n_post integer;
BEGIN
  FOR r IN SELECT * FROM journal WHERE event_id = p_event_id ORDER BY seq LOOP
    IF r.seq <> v_expected THEN
      RETURN QUERY SELECT false, v_n, NULL::bigint, NULL::bytea, v_expected, 'sequence gap: expected ' || v_expected || ' got ' || r.seq; RETURN;
    END IF;
    IF r.prev_hash <> v_prev THEN
      RETURN QUERY SELECT false, v_n, NULL::bigint, NULL::bytea, r.seq, 'prev_hash does not match previous journal hash'; RETURN;
    END IF;
    IF journal_recompute_hash(r.id) <> r.hash THEN
      RETURN QUERY SELECT false, v_n, NULL::bigint, NULL::bytea, r.seq, 'hash does not match journal content'; RETURN;
    END IF;
    SELECT count(*) INTO v_n_post FROM postings WHERE journal_id = r.id;
    IF v_n_post < 2 OR EXISTS (SELECT 1 FROM postings WHERE journal_id = r.id GROUP BY unit HAVING sum(amount) <> 0) THEN
      RETURN QUERY SELECT false, v_n, NULL::bigint, NULL::bytea, r.seq, 'journal is not balanced'; RETURN;
    END IF;
    v_prev := r.hash; v_last := r.hash; v_expected := v_expected + 1; v_n := v_n + 1;
  END LOOP;
  SELECT * INTO v_chain FROM event_chain WHERE event_id = p_event_id;
  IF v_chain.last_seq <> v_n OR v_chain.last_hash <> v_last THEN
    RETURN QUERY SELECT false, v_n, NULL::bigint, NULL::bytea, v_n + 1, 'event_chain head does not match last journal (truncated tail?)'; RETURN;
  END IF;
  RETURN QUERY SELECT true, v_n, v_n, v_last, NULL::bigint, NULL::text;
END $$;

-- ───────────── reconciliation invariants ─────────────
CREATE FUNCTION ledger_reconcile(p_event_id uuid)
RETURNS TABLE(check_name text, ok boolean, detail text) LANGUAGE plpgsql STABLE AS $$
DECLARE v_price integer; v_liab bigint; v_wallets bigint; v_x bigint;
BEGIN
  SELECT token_price_cents INTO v_price FROM events WHERE id = p_event_id;

  SELECT COALESCE(sum(amount), 0) INTO v_x FROM postings WHERE event_id = p_event_id AND unit = 'TOKEN';
  RETURN QUERY SELECT 'tokens_sum_zero', v_x = 0, 'sum=' || v_x;

  SELECT COALESCE(sum(amount), 0) INTO v_x FROM postings WHERE event_id = p_event_id AND unit = 'EUR_CENTS';
  RETURN QUERY SELECT 'eur_cents_sum_zero', v_x = 0, 'sum=' || v_x;

  SELECT count(*) INTO v_x FROM (
    SELECT a.id FROM accounts a
      LEFT JOIN account_balances b ON b.account_id = a.id
      LEFT JOIN (SELECT account_id, sum(amount) s FROM postings WHERE event_id = p_event_id GROUP BY account_id) p ON p.account_id = a.id
     WHERE a.event_id = p_event_id AND COALESCE(b.balance, 0) <> COALESCE(p.s, 0)) m;
  RETURN QUERY SELECT 'balance_cache_matches_postings', v_x = 0, 'mismatching_accounts=' || v_x;

  -- Every outstanding token (wallets + unpaid tips) is backed by exactly token_price cents of liability.
  SELECT COALESCE(b.balance, 0) INTO v_liab FROM accounts a LEFT JOIN account_balances b ON b.account_id = a.id
   WHERE a.event_id = p_event_id AND a.code = 'liability';
  SELECT COALESCE(sum(b.balance), 0) INTO v_wallets FROM accounts a JOIN account_balances b ON b.account_id = a.id
   WHERE a.event_id = p_event_id AND a.kind IN ('wallet','tips_payable') AND NOT a.training;
  RETURN QUERY SELECT 'liability_equals_outstanding_tokens_x_price', v_liab = -(v_wallets * v_price),
                      'liability_cents=' || v_liab || ' wallets_tokens=' || v_wallets || ' price=' || v_price;

  RETURN QUERY SELECT 'hash_chain', v.ok, COALESCE(v.reason, 'journals=' || v.checked) FROM ledger_verify(p_event_id) v;
END $$;
