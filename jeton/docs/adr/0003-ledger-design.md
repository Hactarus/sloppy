# ADR 0003 — Ledger: double entry, append-only, hash chain, gapless numbering

Status: accepted. Binding source: BRIEF decision 3; docs/legal/app-requirements.md section D (R-LED-*).
Implementation: `db/migrations/0003_ledger.sql`, `0004_facts.sql`, `0005_views_integrity.sql`.

## Model
* `journal` (header) + `postings` (lines). Signed integer `amount` (+debit/-credit), `unit` is `TOKEN` or `EUR_CENTS`; every journal
  sums to zero **per unit**. Money is cents, tokens are tokens; no floats.
* Accounts per event (`accounts.code`):
  TOKEN: `tag:<code>` (wallet), `issuance`, `promo`, `stand:<id>`, `tips_payable:stand:<id>`, `breakage`, `refunds`.
  EUR_CENTS: `liability`, `receipts:cash:<cashdesk>`, `psp_clearing:<method>`, `psp_fees`, `bank`, `cash_over_short`, `rounding`,
  `revenue:stand:<id>` (net of VAT), `vat:<rate_bp>`, `vat_deferred` (single-purpose only), `breakage_income`, `promo_expense`.
* Posting profiles (event token price P):
  * top-up N tokens: TOKEN `issuance -N, wallet +N`; EUR `receipts|psp_clearing +NP, liability -NP`.
  * promo grant: `promo -N, wallet +N`; EUR `promo_expense +NP, liability -NP`.
  * sale (items G tokens, tip T): TOKEN `wallet -(G+T), stand +G, tips_payable +T`; EUR `liability +GP, revenue -net, vat:<rate> -vat`.
    The tip has **no EUR leg**: tokens move from wallet to `tips_payable` (not spendable: it is not a wallet) and the liability stays.
  * tips payout: TOKEN `tips_payable -T, refunds +T`; EUR `liability +TP, receipts:cash -TP`.
  * cash-out: TOKEN `wallet -N, refunds +N`; EUR `liability +NP, receipts|psp_clearing|bank -NP`.
  * breakage at close: TOKEN `wallet -N, breakage +N`; EUR `liability +NP, breakage_income -NP`. Never in VAT figures.
  * tag replacement: TOKEN `old wallet -N, new wallet +N` only.
  * PSP settlement: `bank +net, psp_fees +fee, psp_clearing -gross`. Cash variance: `receipts:cash` vs `cash_over_short`.
  * reversal: all postings of the original negated.
* **Invariant** (checked by `ledger_reconcile`): `liability = -(sum wallet balances + sum tips_payable) x token_price`.
  `events.token_price_cents` is therefore immutable once the event has journals.

## Append-only
Triggers on every ledger/fact/closure table raise `JT005` on UPDATE, DELETE and TRUNCATE; the app role has no such privileges
and cannot INSERT into `journal/postings/accounts/account_balances/event_chain` directly: only `SECURITY DEFINER post_journal()`
writes them. Corrections are reversal journals (`reverses_journal_id`, unique => reversible once, `reason_code` mandatory).
The table owner can still disable triggers: protection against that is the hash chain + external anchoring (below), plus
operational controls (migrations to ledger tables need a signed change record, R-LED-1).

## Hash chain
Per event: `hash = SHA-256(canonical(journal, postings))`, `prev_hash` = previous journal's hash, genesis =
`SHA-256("jeton-genesis|" + event_id)`. Canonical text (UTF-8, `|` separated, empty string for NULL, booleans `true|false`,
timestamps as integer microseconds since epoch UTC, hashes lowercase hex):

```
jeton/v1|event_id|seq|journal_id|kind|client_tx_id|reverses_journal_id|device_id|staff_id|offline|training|
occurred_us|effective_us|reason_code|request_hash_hex|prev_hash_hex|POSTINGS
POSTINGS = join(",", sorted by line_no: line_no ":" account_id ":" unit ":" amount)
```
(The line break above is only for display.) A deferred constraint trigger recomputes balance, hash and link at COMMIT for every
journal, whatever path inserted it. `ledger_verify()` / `GET /events/{id}/ledger/verify` re-walks the chain; the same algorithm runs
offline on the CSV export (`exports/journal`, `exports/postings`). Chain heads are anchored: `GET .../ledger/head`, `chain_anchors`,
and e-mailed at each Z (R-LED-11).
Contention: all writers of one event lock the `event_chain` row first, so one event's journals are strictly serial (fine for
~1000 guests: well under 100 tx/s), balance checks are race-free at READ COMMITTED and deadlocks cannot occur. Keep ledger
transactions short; write fact rows (`orders`, `topups`...) after `post_journal` in the same transaction.

## Gapless numbering (R-LED-3/4)
* `journal.seq`: gapless per event, assigned under the chain lock.
* `receipt_no`: gapless per stand/cash desk over orders, refund orders, top-ups and cash-outs (training excluded), assigned by
  trigger from `stand_counters` inside the transaction; a rollback rolls the number back, so no gaps.
* `z_no`: gapless per stand; sealed Z-reports (`z_reports`) are append-only, chained (`z_seq`) and carry the stand's cumulative
  `grand_total_cents` (also stored on each order as running grand total) plus the ledger head hash.
* **Offline**: the device holds only the provisional `client_tx_id`/`provisional_ref`; the server assigns the final numbers at
  ingest (ADR 0002). The cumulative grand total across events for the organizer is not kept in v1 (per-stand per-event only).

## No personal data, no free text in hashed rows (R-LED-7)
Journal rows carry ids and a coded `reason_code` only. Free-text notes -> `journal_notes` (purgeable). Refund contact/IBAN ->
`refund_contacts` (encrypted, purged after `purge_after`, default 180 days), referenced by id from `cashouts`. Staff display names
live in `staff` (purgeable); the ledger refers to `staff_id`. Tag UIDs in exports are `HMAC(pepper, uid)`.

## Training mode
`devices.training` (immutable) => `journal.training`. Training journals use **shadow accounts** (`training:` prefix) and training
wallets, never mix with production accounts (`JT011`), are chained like any other, take no `receipt_no`/`z_no`/grand total and are
excluded from all views, reports and exports (unless `include_training=true`).

## Post-closure
After event close only `breakage, adjustment, reversal, cashout, tips_payout, cash_movement, cash_variance, psp_settlement` may be
posted; adjustments/reversals are flagged `ADJUSTMENT_AFTER_CLOSE` and need `journal_countersignatures` from admin and auditor.

## Balances
`account_balances` is a trigger-maintained cache updated inside the posting transaction; `ledger_reconcile` proves it equals
`SUM(postings)`. Overdraft protection: `post_journal` rejects a wallet going negative unless `p_allow_negative` (offline sync,
reversals); negative results are flagged `NEGATIVE_BALANCE`.
