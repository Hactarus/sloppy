# ADR 0002 — Offline tolerance, spending cap and batch sync

Status: accepted. Binding source: BRIEF decision 2; legal R-LED-3.

## Decision
* Terminals are online-first. When offline they queue **orders, order refunds, cash-outs and cash movements**. Top-ups, tag
  enrolment/replacement/blocking and admin actions are online only (`OFFLINE_NOT_ALLOWED`).
* Every queued operation has a UUIDv7 `client_tx_id` (idempotency key), `client_created_at` and optional device-local
  `provisional_ref`.
* **Offline cap**: a terminal refuses to spend more than `Event.offline_cap_tokens` (default 10) per tag per device while
  offline, tracked locally by `tag_code`. The cap is a client-side control; the server records breaches (`OFFLINE_CAP_EXCEEDED`).
* Sync = `POST /sync/batch`, <= 200 items, applied in order, per-item result `applied | duplicate | rejected`.
* The server accepts late operations. Overdrafts, blocked tags, UID mismatches, caps exceeded and post-close arrivals are
  **posted and flagged** (`ledger_flags`), never silently corrected or dropped. Only structurally impossible items
  (unknown tag, revoked device, same `client_tx_id` with different body) are rejected.
* The offline UID cannot be verified against the server, so cloned tags can only spend up to the cap per device while offline.
* Business time = `client_created_at` clamped to server time; skew > 5 min => `CLOCK_SKEW` flag and server time used.
* **Legal numbering** (ADR 0003): offline receipts show only the provisional number; the final gapless `receipt_no` is assigned
  at ingest and is visible in the sync response and on the public balance page.
* Z-reports for a stand cannot be sealed while the server knows of unsynced operations for it (`PENDING_OFFLINE_OPERATIONS`);
  terminals should sync before the day's Z.

## Consequences
Worst-case loss = cap x number of offline devices a cloned tag visits. Gapless-numbering compliance for offline receipts is
[À VALIDER] with the accountant (FR "sequential" requirement); the design keeps the legal number server-assigned and gapless.
