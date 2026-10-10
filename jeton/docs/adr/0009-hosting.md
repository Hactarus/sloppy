# ADR 0009 — Hosting and operations

Status: accepted (default; revisit per event).

* One VPS or small container host **in the EU** (data location R-GDPR-5): API (Node 22) + PostgreSQL 16 via docker-compose, behind a
  TLS reverse proxy (Caddy). Daily encrypted off-site backups plus WAL archiving during events; restore tested before each event.
* Web payload kept small; balance page is a static page served with `Cache-Control: no-store` for data calls, `noindex`, no cookies.
* DB roles: owner (migrations only), `jeton_app` (runtime), `jeton_auditor` (read-only, accountant/verification tool). API never
  connects as owner.
* Retention: ledger/exports 10 years; refund contacts 180 days; audit logs 12 months; test events 30 days. Purge jobs touch only
  purgeable tables.
* Secrets (JWT key, HMAC master key for tag passwords, UID pepper, contact encryption key) in environment/secret store, never in the DB.
* Event-day degradation: terminals keep working offline (ADR 0002) if the server or Internet fails.
