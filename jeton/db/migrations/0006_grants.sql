-- 0006_grants.sql — least privilege. Defence in depth on top of the triggers.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO jeton_app, jeton_auditor;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO jeton_app, jeton_auditor;
-- The auditor never sees secrets or personal data.
REVOKE SELECT ON staff, devices, enrollment_codes, refund_contacts, journal_notes FROM jeton_auditor;
GRANT SELECT (id, role, staff_type, active, created_at) ON staff TO jeton_auditor;

GRANT INSERT, UPDATE ON organizers, events, stands, categories, items, staff, staff_events, devices, enrollment_codes,
      tags, wallets, stand_counters, refund_contacts, journal_notes, cashdesk_sessions TO jeton_app;
GRANT DELETE ON staff_events TO jeton_app;
GRANT INSERT, UPDATE ON vat_categories, vat_rates TO jeton_app;

-- Append-only tables: INSERT only (no UPDATE/DELETE/TRUNCATE is ever granted).
GRANT INSERT ON topups, cashouts, tag_replacements, orders, order_lines, order_vat, tips_payouts, cash_movements,
      psp_settlements, psp_settlement_lines, journal_countersignatures, receipt_prints, z_reports, chain_anchors,
      flag_resolutions TO jeton_app;

-- journal, postings, accounts, account_balances, event_chain, ledger_flags, tag_status_log:
-- NO direct DML for jeton_app; written only by SECURITY DEFINER functions / triggers.
GRANT EXECUTE ON FUNCTION post_journal(uuid,text,uuid,bytea,uuid,uuid,timestamptz,boolean,uuid,text,jsonb,boolean,uuid,boolean,text) TO jeton_app;
GRANT EXECUTE ON FUNCTION ensure_account(uuid,text,text,text,uuid)  TO jeton_app;
GRANT EXECUTE ON FUNCTION ensure_training_shadow(uuid)              TO jeton_app;
GRANT EXECUTE ON FUNCTION ensure_wallet(uuid,uuid,boolean)          TO jeton_app;
GRANT EXECUTE ON FUNCTION add_ledger_flag(uuid,uuid,text,jsonb)     TO jeton_app;
GRANT EXECUTE ON FUNCTION vat_rate_bp(text,text,text,date)          TO jeton_app, jeton_auditor;
GRANT EXECUTE ON FUNCTION ledger_verify(uuid), ledger_reconcile(uuid) TO jeton_app, jeton_auditor;
GRANT EXECUTE ON FUNCTION journal_postings_json(uuid), journal_recompute_hash(uuid) TO jeton_app, jeton_auditor;
GRANT EXECUTE ON FUNCTION ledger_hash(uuid,bigint,uuid,text,uuid,uuid,uuid,uuid,boolean,boolean,timestamptz,timestamptz,text,bytea,bytea,jsonb)
      TO jeton_app, jeton_auditor;
-- Trigger functions (invoked by the triggers; executable so they fire under the caller's role).
GRANT EXECUTE ON FUNCTION touch_updated_at(), bump_catalog_version(), forbid_mutation(), require_post_journal(),
      events_guard(), devices_guard(), journal_commit_check(), fact_defaults(), z_reports_chain(), cashdesk_sessions_guard(),
      log_status_change(), apply_posting_to_balance(), init_event_chain(),
      create_event_accounts(), create_stand_accounts() TO jeton_app;
