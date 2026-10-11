# Jeton — NFC token cashless payments for events (BE + FR)

Guests buy **tokens** (default €2 each) at a cash desk with cash, SumUp, Wero or
Bancontact. Their balance lives on the server, keyed by an **NFC tag** glued on a
plastic object. Waiters build a basket with one tap per item and charge it with
one tag tap. Every movement is written to an **append-only, double-entry,
hash-chained ledger** in PostgreSQL.

See [`BRIEF.md`](BRIEF.md) for the requirements and the binding decisions.

## Status

| Part | Where | State |
|---|---|---|
| API contract | `api/openapi.yaml` | 65 operations, Redocly-lint clean |
| Ledger schema | `db/migrations/` | 9 migrations; append-only enforced by triggers + grants; smoke test in `db/tests/` |
| Backend | `server/` | Fastify + TS, all operations implemented, 43 integration tests on real Postgres |
| Client A: web + Android | `app/` | React PWA + Capacitor + in-repo Kotlin NFC plugin, 56 tests, ~97 KB gzip, guest page 2.4 KB |
| Client B: Flutter | branch `claude/nfc-cashless-payments-4lowcf-flutter`, `app_flutter/` | Android + Web, 12 tests, ~3.9 MB gzip on web |
| Architecture decisions | `docs/adr/` | 10 ADRs |
| NFC tag procedure | `docs/nfc-tags.md` | chip identification, NDEF format, password protection, bulk enrolment of 1000 tags |
| UX spec | `docs/ux/` | waiter, cashier, enrolment, admin, guest |
| Legal / tax / contracts plan | `docs/legal/` | BE + FR planning, ~90 software requirements; **not legal advice** |
| Open contract notes | `docs/api-requests.md` | client/server questions and answers |

**Recommendation:** variant A (React + Capacitor). It has one codebase for the web
app and the Android app, a 40× smaller web payload (this matters for the public
guest page that any phone opens when tapping a tag), and a fuller admin. Keep
variant B only if the team prefers Dart/Flutter.

## Run locally

```sh
nix develop                          # node 22, pnpm, postgresql 16
docker compose up db                 # or any local PostgreSQL 16
cd server && pnpm install && pnpm migrate && pnpm seed-demo && pnpm dev
cd app && pnpm install && pnpm dev   # uses the in-memory mock API by default
VITE_API_MODE=real VITE_API_BASE=http://localhost:3000 pnpm dev   # real API
```

Tests: `pnpm test` in `server/` (starts a scratch Postgres cluster) and in `app/`.

## Not yet verified (do these before a real event)

1. **Android build and real NFC.** There was no Android SDK or NFC hardware in the
   build environment. Build `app/android`, then test on 2–3 Android phones with
   your actual tags, starting with chip identification (see `docs/nfc-tags.md` §1).
2. **End-to-end run.** Point the app at the real server and do a full rehearsal:
   enrol 50 tags, top up, run a waiter rush, go offline and sync, seal the Z,
   export, then run `verify-chain`.
3. **SumUp online checkout.** It is implemented from the public docs and needs
   sandbox credentials. Wero and Bancontact are recorded as manual references
   until a merchant API is confirmed.
4. **Docker / deployment.** `docker-compose.yml` and the Dockerfile are untested.
   Hosting is covered in ADR 0009.
5. **Accountant and lawyer validation** of everything marked **[À VALIDER]** in
   `docs/legal/`. This covers the VAT rates and categories (seeded with
   `validated=false`), the VAT return box mapping, the single-purpose voucher
   profile, French cash-software attestation, and Belgian GKS applicability.

## Business decisions still open

- Refund policy for unused tokens (deadline, cash vs transfer). This affects
  consumer law and the PSD2 limited-network exclusion.
- Tips policy for volunteers versus paid staff, and pool distribution.
- Whether third-party vendors are ever allowed. They are disabled in v1 (ADR 0006).
- Production hostnames for the API and the guest balance page.
- The legal entity and country of the organizer, which drive income declaration
  and VAT registration (`docs/legal/00-overview.md`).

## Contracts and legal documents to draft later

Listed with outlines in `docs/legal/contracts-todo.md`:

- guest terms (CGV/T&C)
- privacy notice
- staff/volunteer agreement
- venue clauses
- SumUp/Wero merchant setup
- DPA with the host
- vendor agreement (only if vendors are enabled)

## Agents

The project was built by the agents in `.claude/agents/jeton-*.md`:

- `jeton-architect`
- `jeton-backend`
- `jeton-client-web`
- `jeton-client-flutter`
- `jeton-legal`
