# Software requirements derived from legal/tax analysis

For the backend/client teams. Research date **2026-10-10**. Priority: **M** =
must for first real event; **S** = should; **C** = could. Items depending on
unresolved points carry **[À VALIDER]**. Rationale is in the sibling docs.

## A. Organizer & event data (R-ORG)

- R-ORG-1 (M) `organizer` entity: legal name, legal form (`asbl_vzw|company_be|person_be|association_1901|company_fr|micro_fr|other`), address, enterprise number (BCE/KBO) or SIREN/SIRET, VAT number (nullable), contact. Printed on receipts and the public balance page.
- R-ORG-2 (M) `event`: `country` (`BE|FR`), `vat_regime` (`standard|franchise|exempt_event`), `voucher_type` (`multi|single`, default `multi`), `token_price_cents` (default 200), `timezone`, start/end, `closed_at`.
- R-ORG-3 (M) `vat_regime=franchise|exempt_event`: receipts carry the legal mention ("TVA non applicable, art. 293 B CGI" / "6 manifestations" / "Vrijgesteld van btw - kleine onderneming art. 56bis"), VAT amounts still stored internally.
- R-ORG-4 (S) `be_gks_required` / `fr_cash_software_required` flags with UI warning that Jeton is not a certified GKS (BE).

## B. Tokens, top-ups, payment methods (R-TOP)

- R-TOP-1 (M) Top-up record: `client_tx_id`, tag, token count, price per token snapshot, euro cents, `payment_method` (`cash|sumup_card|sumup_online|wero|bancontact|promo|other`), `psp_ref` (nullable), `status` (`pending|confirmed|failed|reversed`), cashier, cashdesk session, device.
- R-TOP-2 (M) Token price is identical for all methods; no surcharge field.
- R-TOP-3 (M) Top-ups are **not** VAT events when `voucher_type=multi`: no VAT posting; receipt says "bon multi-usage - pas de TVA a l'emission". If `voucher_type=single`, VAT must be computed at top-up per the single category and redemption must not re-post VAT. [À VALIDER]
- R-TOP-4 (M) Promo/free tokens use payment_method `promo`, posted from `promo` account, reported separately; no cash movement.
- R-TOP-5 (M) Configurable `max_balance_tokens` per tag (suggest 100) and `max_topup_tokens` per transaction.
- R-TOP-6 (M) **No wallet-to-wallet transfer** API. Tag replacement (lost tag) only by `cashier` with reason, logged, balance moved via journal.
- R-TOP-7 (M) Manual-confirm payments (Wero/Bancontact before PSP integration): store confirming staff, require unique reference, flagged `manual=true`.
- R-TOP-8 (S) Chargeback/reversal path for card top-ups (reversal journal; negative balance flagged, never auto-fixed).
- R-TOP-9 (M) Never store card data, IBAN of payers (except in refund table R-CONS-3), or payer names.

## C. VAT (R-VAT)

- R-VAT-1 (M) Table `vat_rate(country, category_code, rate_bp, valid_from, valid_to)`; rates in basis points. Event snapshots rates at start (`event_vat_rate`). Seed from `vat-tokens.md` §3; rate changes are data, not code.
- R-VAT-2 (M) Item has `vat_category` (codes): BE: `BE_FOOD_ONSITE`(12), `BE_FOOD_TAKEAWAY`(6), `BE_DRINK_SOFT_ONSITE`(21), `BE_DRINK_SOFT_GOODS`(6), `BE_ALCOHOL`(21), `BE_ICECREAM_ONSITE`(12), `BE_ICECREAM_TAKEAWAY`(6), `BE_MERCH`(21), `BE_ZERO`(0). FR: `FR_FOOD_ONSITE`(10), `FR_FOOD_PACKAGED`(5.5), `FR_DRINK_SOFT_IMMEDIATE`(10), `FR_DRINK_SOFT_PACKAGED`(5.5), `FR_ALCOHOL`(20), `FR_ICECREAM_IMMEDIATE`(10), `FR_ICECREAM_PACKAGED`(5.5), `FR_MERCH`(20), `FR_EXEMPT`(0). Items may be tagged `consumption_mode` (`onsite|takeaway`) which selects the category; an item may have one category per mode. Unverified rates flagged in the admin UI until the accountant ticks "validated". [À VALIDER]
- R-VAT-3 (M) Item price stored in **tokens** (integer) with a displayed euro equivalent. Sub-token pricing (e.g. 0.5 token) is not supported by BRIEF; if needed later, store price in "milli-tokens" and require whole-token totals per order. Flag to architect.
- R-VAT-4 (M) For every order line store: tokens, gross euro cents, `vat_rate_bp`, `vat_cents`, `net_cents`. Compute VAT per **rate group per order**: `vat = round_half_up(gross_cents * rate_bp / (10000 + rate_bp))` with integer arithmetic (rate_bp: 5.5 % = 550, 21 % = 2100). Note R-VAT-2 lists 5.5 % as 550 bp. Rounding rule to be confirmed by accountant. [À VALIDER]
- R-VAT-5 (M) Tip lines excluded from VAT and from revenue accounts.
- R-VAT-6 (M) Voids/refunds of orders: reversal journal reproducing negative VAT with `reverses_journal_id` and reason.
- R-VAT-7 (M) Breakage and refunds of unused tokens: **no VAT postings**.
- R-VAT-8 (S) Warn at event setup if all items share one VAT category (possible single-purpose voucher).
- R-VAT-9 (M) VAT summary report per event/day/stand/country; mapping `vat_category -> return box` (BE grids 00-03/54; FR CA3 lines) configurable.
- R-VAT-10 (S) Promo-funded sales reported in a separate VAT column. [À VALIDER]

## D. Ledger, integrity, numbering (R-LED) — extends BRIEF decision 3

- R-LED-1 (M) Append-only enforcement: no UPDATE/DELETE on journal/postings (trigger + role permissions), including for admin/app DB role; migrations that alter ledger tables require a signed change record.
- R-LED-2 (M) Per-event hash chain: `hash = SHA-256(canonical_json(journal+postings) || prev_hash)`; first row's `prev_hash` = event genesis hash. Store `app_version`, `device_id`, `staff_id`, `server_received_at`, `client_created_at`.
- R-LED-3 (M) **Gapless sequential numbers**: `journal_seq` per event; `receipt_no` per event per stand; `z_no` per stand. Assigned server-side at commit (offline transactions get final numbers on sync; receipts printed offline show a provisional device number + final number on the balance page) [À VALIDER vs FR "sequential" requirement for offline].
- R-LED-4 (M) Cumulative grand total (gross sales) stored per stand in each Z and also running per journal of kind `sale`.
- R-LED-5 (M) Corrections = reversal + new entry; every reversal carries reason code and actor; receipt reprint logs `DUPLICATA`.
- R-LED-6 (M) Training/test mode: separate event type `test`, labelled on all outputs, excluded from production totals; cannot be switched on in a live event.
- R-LED-7 (M) **No free text with personal data in ledger rows.** Notes live in a separate purgeable table referencing journal ids.
- R-LED-8 (M) Time from server UTC; device clock skew logged; event timezone for reports.
- R-LED-9 (M) Event close: locks event; post-closure adjustments allowed only as flagged journals requiring `admin` + `auditor` countersignature.
- R-LED-10 (M) Hash-chain verification CLI/endpoint (offline-runnable on an exported CSV), producing a signed report.
- R-LED-11 (S) Daily anchor: hash of chain head is emailed to the organizer/accountant at each Z.
- R-LED-12 (M) Additional accounts beyond BRIEF: `cash_over_short`, `psp_clearing:<method>` (money in transit from SumUp/Wero until payout), `psp_fees`, `tips_payable`, `rounding`.

## E. Receipts (R-RCPT)

- R-RCPT-1 (M) Sale receipt: organizer legal name/ID/VAT no., event, stand, date-time, receipt_no, lines (name, tokens, euro, VAT category/rate), totals by VAT rate (net/VAT/gross), tip (separate, "pourboire/fooi - hors TVA"), payment = tokens, balance after (optional), duplicate marker. Printable/PDF/on balance page.
- R-RCPT-2 (M) Top-up receipt: tokens, euros, method, "bon multi-usage - pas de TVA", refund/expiry policy summary.
- R-RCPT-3 (S) Receipt shown on public balance page without staff names (privacy).
- R-RCPT-4 (C) "Invoice on request" export for B2B (manual process documented).

## F. Tips (R-TIP)

- R-TIP-1 (M) Tip is optional, **default 0**, never pre-selected; configurable presets and cap (default max 50 % of order or 10 tokens).
- R-TIP-2 (M) Posted to `tips:<stand|staff>` only; never to revenue; excluded from VAT and from Z gross sales (shown on separate Z line).
- R-TIP-3 (M) `tip_pool` per event: key (`equal|hours|direct`), members (pseudonymous `staff_id`), shares computed by a report, payout record (`tips_payout`: pool, staff, amount cents, method cash/bank, signature/ack, date). Payout posts `tips:* -> cashdesk` (not spendable-token redemption by default).
- R-TIP-4 (M) Reports: tips by stand/staff/day; payable vs paid; open balance at close; "tips total" CSV for payroll (FR DSN / BE social secretariat). [À VALIDER on legal treatment for volunteers]
- R-TIP-5 (S) Config `tips_payout_policy`: `staff|collective_donation`; tip tokens may not be redeemed for goods (default).
- R-TIP-6 (S) Event close blocks until `tips_payable` is paid out or explicitly assigned.

## G. Refunds, breakage, expiry (R-CONS)

- R-CONS-1 (M) Per-event `refund_policy`: `refundable_until` (timestamp), `min_refund_tokens`, `expiry_at`, `breakage_treatment` (`retain|donate|refund_later`), plus `policy_version` text (FR/NL/EN) shown on receipt, balance page and cashdesk.
- R-CONS-2 (M) Refund flow (cashier role): reduces tag balance, posts `tag -> refunds -> cashdesk|psp_clearing`; refund to original payment method preferred; cash refund allowed only up to the tag's cash top-ups (`refund_method_limit`) [À VALIDER].
- R-CONS-3 (M) Refund bank transfers: store contact/IBAN in a separate encrypted `refund_contact` table, purged after `retention_days` (default 180).
- R-CONS-4 (M) T&C acceptance record: `terms_version` stored on first top-up of a tag (no personal data) and shown on balance page.
- R-CONS-5 (S) Event cancellation: bulk "refund all outstanding balances" report listing per tag amount (for claim handling).
- R-CONS-6 (M) At close: compute `outstanding_tokens`, euro value, apply `breakage_treatment` via journal `tag -> breakage` (or `donation`); breakage report; **no VAT**.
- R-CONS-7 (M) Alcohol items carry `min_age`; sale flow forces a confirm "age checked" tick (logged).
- R-CONS-8 (S) Allergen field per item (14 EU allergens) displayed to guests/staff.

## H. Cash desk & reconciliation (R-CASH, R-PAY, R-REG)

- R-CASH-1 (M) Cashdesk sessions: opening float, closing count by denomination, expected vs counted.
- R-CASH-2 (M) Cash drops/pay-ins/pay-outs as journal entries with reason.
- R-CASH-3 (M) Variance posted to `cash_over_short`; requires admin ack.
- R-PAY-1 (M) SumUp/Wero/Bancontact: import of PSP reports (CSV) and matching by `psp_ref`/amount/time; fields gross, fee, net, payout date, payout ref; unmatched list; posting fee to `psp_fees` and payout bank movement.
- R-PAY-2 (M) Payment-method totals report (counts, gross, fees, net, payouts) per event.
- R-PAY-3 (M) The Jeton instance never holds PSP credentials of third parties beyond the organizer's own (per-organizer secrets, encrypted); organizer-owned merchant accounts only.
- R-REG-1 (S) Rolling 12-month token-redemption volume per organizer; warn at EUR 800k, flag at EUR 1m (PSD2 art. 37(2) notification threshold).
- R-REG-2 (M) Single-event scope: tags/wallets cannot carry balances across events.

## I. Vendors & staff (R-VEND, R-STAFF)

- R-VEND-1 (S) `stand.operator_entity_id` (default organizer). If different: vendor settlement statement (tokens redeemed by VAT rate, commission, payable), requires explicit event flag `third_party_vendors_enabled` with a warning referencing legal review. [À VALIDER]
- R-VEND-2 (S) Vendor statement export (PDF/CSV) signed with chain hash.
- R-VEND-3 (C) Self-billing record.
- R-STAFF-1 (M) Roles as BRIEF (`admin|cashier|vendor|auditor`); PIN stored as salted slow hash (argon2id); lockout after N attempts.
- R-STAFF-2 (M) Staff identified by pseudonymous `staff_id` + display name kept in a purgeable table; ledger refers to `staff_id` only.
- R-STAFF-3 (S) Staff type `employee|volunteer|vendor_staff` (drives tip-reporting category). [À VALIDER]

## J. Reports & exports (R-REP)

- R-REP-1 (M) Z-report (per stand per day) fields: event, stand, z_no, period start/end, order count, voids count/value, gross/net/VAT by rate, total tokens, tips (separate), token-method breakdown, cumulative grand total, first/last receipt_no, chain head hash.
- R-REP-2 (M) Sales by item/category/VAT rate/hour.
- R-REP-3 (M) Top-ups by method; cash reconciliation; PSP reconciliation.
- R-REP-4 (M) Outstanding token liability (as-of timestamp); breakage; promo issued/redeemed; refunds.
- R-REP-5 (M) Full CSV export of journal+postings with hashes; **FEC-compatible export** for France (18 columns) and generic accounting CSV; account mapping configurable. [À VALIDER format]
- R-REP-6 (M) Event closing pack (PDF + CSV zip) with totals and final chain hash, stored immutably, retention >= **10 years**.
- R-REP-7 (M) Reports available to `auditor` read-only; every export logged.

## K. Retention & privacy (R-GDPR)

- R-GDPR-1 (M) Retention config: ledger/exports 10 years; refund contacts 180 days; security/audit logs 12 months; test events 30 days.
- R-GDPR-2 (M) Public balance page `/t/<tag_code>`: HTTPS, `noindex`, rate-limited, no cookies/trackers, shows balance + last 20 purchases (item names, no staff names), policy summary and privacy link.
- R-GDPR-3 (M) NFC UID stored hashed with per-instance pepper in exports; raw UID only in the tag-binding table.
- R-GDPR-4 (M) No names/e-mails/phones attached to tags in v1; adding any such feature requires a DPIA/ADR.
- R-GDPR-5 (M) Data location EU; encrypted backups; access logs for admin/auditor.
- R-GDPR-6 (S) Breach register table and export.
- R-GDPR-7 (M) Purge jobs for non-ledger personal data; ledger never purged within retention.

## L. France-specific compliance (R-FR) / Belgium (R-BE)

- R-FR-1 (M) Maintain a *conformity dossier* in repo (`docs/legal/compliance-dossier/`): hash algorithm, immutability controls, numbering, closure, archive, security.
- R-FR-2 (M) Version stamping and build hash recorded; generate the **attestation individuelle** PDF per organizer/version. [À VALIDER whether attestation still sufficient]
- R-FR-3 (M) Event closure creates the archive (CSV + hash + signature) required by the 6-year / 10-year retention.
- R-FR-4 (S) Daily/monthly/annual closure types for permanent use.
- R-BE-1 (M) If `be_gks_required`: block or mark receipts "Not a fiscal ticket" and show instructions to use a certified GKS/FDM for meal sales. [À VALIDER]
- R-BE-2 (S) Option to export sales per item in a format importable to a certified GKS or accountant.

## M. Open points that could change requirements

1. Third-party vendors permitted? (R-VEND, payment-regulation gate)
2. Refund vs non-refundable policy (R-CONS-1/2/6) — also affects e-money qualification.
3. FR attestation vs certification (R-FR-2).
4. BE white-box applicability to occasional events (R-BE-1).
5. Tip treatment for volunteers (R-TIP-3/4).
6. Current BE VAT rates for non-alcoholic drinks served on site and takeaway meals (R-VAT-2): check before each event.
