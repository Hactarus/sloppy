# Jeton — NFC token cashless payments for events (BE + FR)

Coordinator brief. Every agent reads this first. Decisions here are binding
unless an ADR in `docs/adr/` supersedes them.

## Problem
- ~1000 blank NFC tags glued on plastic objects = guest "wallets".
- Guests buy **tokens** (no real money on the tag/system). Fixed price per token,
  configurable per event (default **€2.00**). Real money comes in via **cash,
  SumUp (card reader / online checkout), Wero / Bancontact‑Payconiq**.
- Tokens are spent at stands: food, drinks, ice cream, merch, … in **Belgium
  and France**.
- Waiters are in a rush: building/editing a basket must be **one tap per item**,
  paying must be **one NFC tap**.
- Every movement is recorded in a **transactional, append‑only database**.
- Accounting/tax (income, VAT, tips) and legal docs must be planned.

## Binding architecture decisions
1. **Server‑side balances (online‑first, offline‑tolerant).** The tag stores no
   balance. It stores an NDEF URI record `https://<host>/t/<tag_code>` where
   `tag_code` is a random 96‑bit base32 id. Server binds `tag_code` ↔ NFC
   hardware UID; a mismatch is rejected (cheap anti‑clone). Any phone (incl.
   iPhone) tapping the tag opens the public balance page — free guest feature.
   Tags are password‑protected (NTAG PWD_AUTH) when the chip supports it; never
   use permanent lock bits.
2. **Offline tolerance:** terminals generate a UUIDv7 `client_tx_id`
   (idempotency key) per operation, queue locally when offline, and sync.
   Offline spending is capped per tag per device (configurable, default 10
   tokens). Server accepts late transactions; negative balances are flagged,
   never silently fixed.
3. **Ledger = double‑entry, append‑only, hash‑chained.** `journal` (header) +
   `postings` (lines summing to zero per journal). No UPDATE/DELETE on ledger
   tables (enforced by DB triggers/permissions). Corrections = reversal
   entries. Each journal row stores `prev_hash` and `hash` (SHA‑256 over
   canonical content) per event → supports French NF525‑style inalterability
   and Belgian audit needs. Money amounts in integer **euro cents**; token
   amounts in integer **tokens**.
4. **Accounts** (per event): `tag:<id>` wallets, `cashdesk:<id>` (top‑ups),
   `stand:<id>` revenue, `tips:<stand|staff>`, `refunds`, `breakage`
   (unredeemed tokens at close), `promo` (free tokens).
5. **Multi‑purpose voucher (EU Directive 2016/1065)** working assumption:
   tokens usable for goods at different VAT rates ⇒ VAT is computed at
   **redemption** per order line (item has a VAT category; event has a country
   ⇒ rate table BE/FR). Top‑ups are not VAT events. Breakage handling per
   country is documented by the legal agent.
6. **Tips:** a tip is an extra token amount on an order, posted to a tips
   account, never mixed with revenue; reportable per stand/staff.
7. **Roles:** `admin`, `cashier` (top‑up/refund), `vendor` (sell),
   `auditor` (read‑only). Devices are enrolled per event + stand; staff log in
   with short PIN on an enrolled device.
8. **Reports:** Z‑report per stand per day, sales by item/category/VAT rate,
   top‑ups by payment method, tips, outstanding token liability, breakage,
   full CSV export + hash‑chain verification tool for the accountant.

## Tooling (main branch, variant A)
- **Backend:** Node 22 + TypeScript, Fastify, PostgreSQL 16, Drizzle ORM,
  zod, OpenAPI 3.1 contract at `api/openapi.yaml` (source of truth),
  vitest + testcontainers/pg for tests.
- **Client (variant A):** one TypeScript codebase — React + Vite PWA
  (works on any browser; Web NFC on Android Chrome) packaged as an **Android
  app with Capacitor**. NFC in the Android app via a small in‑repo Capacitor
  plugin (Kotlin, `NfcAdapter.enableReaderMode`) to avoid paid plugins.
- **Variant B (branch `claude/nfc-cashless-payments-4lowcf-flutter`):**
  Flutter client (Android + Web) against the **same** API contract.
- **Dev env:** Nix flake in `jeton/flake.nix` (node, pnpm, postgresql, jdk,
  android sdk); `docker-compose.yml` for Postgres + API.

## Layout
```
jeton/
  BRIEF.md            this file
  CLAUDE.md           conventions for agents
  api/openapi.yaml    API contract (architect)
  db/                 SQL migrations + ledger invariants (architect/backend)
  server/             Fastify API (backend)
  app/                React PWA + Capacitor Android (client-a)
  docs/adr/           architecture decision records (architect)
  docs/legal/         tax, legal, contracts plan (legal)
  docs/ux/            waiter/cashier/admin UX spec (client-a)
```

## Non‑goals (for now)
No real money stored, no card data ever touches our system (SumUp/Wero handle
it), no personal data linked to tags (GDPR‑light by design).
