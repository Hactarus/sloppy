# Jeton server

Fastify 5 + TypeScript (strict) + PostgreSQL 16. The API is **contract first**: routes, roles (`x-roles`) and security schemes are read from
`../api/openapi.yaml` at startup, so the role guard cannot drift from the contract. The ledger lives in SQL (`../db/migrations`, ADR 0003);
the server only calls the `post_journal()` function from one module (`src/ledger/ledger.ts`).

## Run

```sh
cd jeton/server
pnpm install
cp .env.example .env            # adapt, load it into your shell (e.g. `set -a; . ./.env; set +a`)

# 1. database (any PostgreSQL 16) – or `docker compose up db` from jeton/
pnpm migrate                    # applies ../db/migrations as DATABASE_URL_OWNER and creates the runtime login role from DATABASE_URL
pnpm seed-demo                  # demo event (BE): cash desk + stands Bar / Food / Ice cream, 15 items, 4 staff, 20 tags, enrolment codes
pnpm dev                        # http://localhost:3000/v1/health   (pnpm build && pnpm start for production)
```

Docker: `cd jeton && docker compose up --build` (db + one-shot migrate + api on :3000), then `docker compose run --rm cli seed-demo`.
(The compose file and Dockerfile were written without a Docker daemon available here and are untested.)

Nix: `cd jeton && nix develop` gives Node 22, pnpm and PostgreSQL 16 (`flake.nix`, Android tooling is commented out).

### CLI (`pnpm cli <command>` or `node dist/cli.js <command>`; runs as the table owner)

| Command | What |
|---|---|
| `migrate` | apply migrations (checksummed, one transaction each) and create/update the runtime role (`jeton_api`, member of `jeton_app`) |
| `create-admin --name N --pin 123456 (--event UUID \| --new-event "Name")` | bootstrap an admin (ADR 0010) and print a console enrolment code |
| `seed-demo [--tags 20]` | idempotent demo event; prints PINs (admin 1111, cashier 2222, vendor 3333, auditor 4444) and enrolment codes |
| `verify-chain --event UUID [--journal j.csv --postings p.csv]` | verify the hash chain in the database or **offline from the CSV exports** (independent TypeScript implementation of ADR 0003) |

First steps with curl: enrol a console (`POST /v1/auth/devices/enroll` with the code), `GET /v1/auth/staff`, `POST /v1/auth/login {staff_id, pin}`,
use the returned JWT as `Authorization: Bearer ...`.

## Test

```sh
pnpm typecheck && pnpm test
```

Tests run against a **real PostgreSQL**: the global setup `initdb`s a scratch cluster in a temp directory on a free port (as user `postgres` via
`runuser` when run as root), applies the migrations with the production runner and creates the `jeton_api` role, so the API is exercised with the
least-privilege role. To use an existing server instead set `TEST_DATABASE_URL_OWNER=postgres://user:pw@host:5432/postgres` (needs CREATEDB/CREATEROLE;
a throw-away database is created and dropped); `PG_BIN` points to the PostgreSQL binaries if they are not on the `PATH`.

| Suite | Covers |
|---|---|
| `ledger.test.ts` | every journal sums to zero per unit, no negative balance online, hash chain verified by SQL **and** by the independent TS implementation (also on the CSV export, tamper detection), append-only for the runtime role and the owner, reversal semantics, training isolation |
| `idempotency.test.ts` | replay = original result (200 + `Idempotent-Replayed`), different body = `DUPLICATE_TX`, replay unaffected by later changes, `external_ref` uniqueness, tag operations |
| `concurrency.test.ts` | 24 parallel spends on one tag (exactly `balance/price` succeed), parallel replays post once, gapless `seq` / `receipt_no` under load |
| `sync.test.ts` | offline batch: order, overdraft/cap/blocked/UID-mismatch/clock-skew/price flags, duplicates, rejects, 200-item limit, late after close, offline refund/cash-out/cash movement |
| `reports.test.ts` | VAT per rate group, Z preview and seal (gapless, chained, immutable), sales/VAT/top-ups/liability/tips/redemption totals, all CSV exports |
| `auth.test.ts`, `ops.test.ts` | enrolment, PIN lock, role guard, revocation, catalog ETag, tags, public page (headers, rate limit), cash desk, PSP settlement, tips, event close, SumUp (fake) checkout |
| `contract.test.ts` | responses validated against the OpenAPI component schemas with ajv |

## Design notes

* **Single ledger write path.** `src/ledger/ledger.ts` builds balanced journals (`JournalBuilder`), refuses unbalanced ones before the database, and calls
  `post_journal()` (which computes `seq`, `prev_hash`, `hash`, checks wallet sufficiency and idempotency). Every ledger operation runs in
  `runIdempotent`: one transaction holding a per-event advisory lock (writers of an event are serial, so balance/limit checks are race-free), the
  `idempotency_keys` row (stores the original response) and the fact rows (`orders`, `topups`, ... written after the journal).
* **No UPDATE/DELETE of ledger rows**, ever. Corrections are `reversal` journals; a reversed sale/refund also appends a mirrored credit-note order so Z/VAT net out.
* **Money** is integer cents, tokens integer; VAT = round-half-up per rate group per order (BigInt arithmetic); no floats (SumUp decimals are converted by string arithmetic).
* **Errors**: `{code, message, request_id, retryable, details}` with the contract's stable codes; PostgreSQL `JT001..JT011` are mapped in `src/errors.ts`.
* **Auth**: opaque device tokens (`dvc_...`, SHA-256 stored) + staff JWT (HS256, 12 h). Revocation, staff status and role are re-read from the database on every request.
* **Offline**: `POST /sync/batch` applies items in order, one transaction each; overdrafts, blocked tags, UID mismatch, cap, price mismatch, clock skew and post-close arrivals are posted and flagged.
* `X-Pending-Offline-Ops: <n>` (any authenticated request) lets the server refuse a Z-report while a device of the stand still has queued operations.

## Payments

Top-ups are always recorded with `payment_method` + `external_ref` (unique per method; `manual=true` needs a reference and records the confirming staff).

| Method | How |
|---|---|
| cash | `POST /topups` at the cash desk (counted in the cash desk session / Z) |
| SumUp card reader | cashier takes the payment on the reader, then `POST /topups` with `payment_method=sumup_card` and the SumUp transaction code as `external_ref` |
| **SumUp online checkout** | `POST /payments/checkouts` -> hosted checkout URL (QR) -> SumUp calls `POST /webhooks/sumup?token=...`; the server re-reads the checkout from the SumUp API (the webhook body is never trusted), verifies reference and amount and posts the top-up exactly once. `GET /payments/checkouts/{id}` polls and does the same. Set `PAYMENT_PROVIDER=sumup`, `SUMUP_API_KEY`, `SUMUP_MERCHANT_CODE`, `SUMUP_WEBHOOK_SECRET`, `PUBLIC_BASE_URL` (must be reachable by SumUp). Behind the `PaymentProvider` interface (`src/payments/provider.ts`) with `SumupProvider` and an in-memory `FakePaymentProvider` for tests. **Not tested against the real SumUp API** (no credentials); request/response shapes follow the public docs. |
| Wero, Bancontact/Payconiq | no PSP API integration yet: the cashier confirms the payment in the bank/Payconiq app and records `POST /topups` with `payment_method=wero` or `bancontact`, `manual=true` and the payment reference as `external_ref`. PSP payouts are reconciled with `POST /events/{id}/psp-settlements`. |

## Implemented / stubbed

All 65 operations of `api/openapi.yaml` are implemented (the test `ops.test.ts` asserts that no route answers `501 NOT_IMPLEMENTED`):
auth, admin (organizers, events, staff, enrolment, devices), catalog, tags, public page, top-ups, orders and refunds, cash-outs, cash desk sessions,
cash movements, PSP settlements, tips payouts, journals/reversals/countersignatures/flags/verify/head, sync, receipts, Z preview/seal/list, all reports,
CSV exports, online checkout.

Known limitations (details in `../docs/api-requests.md`): NXP signature not verified; no SMTP notifier for chain anchors (log only); offline cap is
per sync batch; VAT return box mapping hard-coded and to be validated; single-purpose voucher profile is implemented but [A VALIDER] by the accountant;
Docker files untested; SumUp adapter untested against the live API.
