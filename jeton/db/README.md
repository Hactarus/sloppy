# Jeton database (PostgreSQL 16)

Plain SQL migrations, applied in order, each in one transaction:

```sh
for f in db/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -1 -f "$f" "$DATABASE_URL_OWNER"; done
psql -v ON_ERROR_STOP=1 -f db/tests/smoke.sql "$DATABASE_URL_OWNER"   # on a scratch DB: posts journals, checks triggers, rolls back
```
Create login roles after `0000_roles.sql`: `CREATE ROLE jeton_api LOGIN PASSWORD '...' IN ROLE jeton_app;` (runtime) and a read-only
`... IN ROLE jeton_auditor;`. The API never connects as the table owner. Ledger writes go through `post_journal()` only; see ADR 0003 for
posting profiles, the canonical hash form, error codes (SQLSTATE `JT001`..`JT011`) and numbering.

| File | Content |
|---|---|
| 0000_roles | NOLOGIN groups `jeton_app`, `jeton_auditor` |
| 0001_catalog_identity | organizers, events, dated VAT rates (category x consumption mode), stands, categories, items, staff, devices, enrolment codes |
| 0002_tags_accounts | tags, chart of accounts, wallets (incl. training), status log, per-stand counters |
| 0003_ledger | journal, postings, hash chain, `post_journal()`, balances cache, flags, append-only guard |
| 0004_facts | topups, cashouts, orders (+lines, VAT groups), tips payouts, cash desk, PSP settlements, Z-reports, receipts log, purgeable tables |
| 0005_views_integrity | reporting views, `ledger_verify()`, `ledger_reconcile()` |
| 0006_grants | least-privilege grants |
| 0007_api_support | (backend) `idempotency_keys`, `payment_intents` (online checkout), `export_log`, `devices.pending_offline_ops` |
| 0008_flag_offline_price | (backend) ledger flag `OFFLINE_PRICE_MISMATCH` |
