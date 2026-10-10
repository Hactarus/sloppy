# ADR 0005 — Multi-purpose voucher VAT handling (BE + FR)

Status: accepted as working assumption; rates and rounding [À VALIDER] by the accountant. Sources: docs/legal/vat-tokens.md,
app-requirements.md section C. EU Directive 2016/1065.

## Decision
* Per-event `voucher_type`: `multi_purpose` (default) or `single_purpose`; immutable after the first journal.
* **multi_purpose**: top-ups and promo grants are not VAT events; VAT is computed at **redemption** per order. Breakage and refunds of
  unused tokens create **no** VAT postings and never appear in VAT views (`breakage_income` is a separate non-VAT account).
* **single_purpose** (all sales in one category/rate, `single_purpose_vat_category`): VAT is booked at top-up
  (`receipts +c, liability -c`, `vat_deferred +v, vat:<rate> -v`) and released at redemption without VAT postings
  (`liability +gross, revenue -net... , vat_deferred -v`); `order_vat.vat_due=false`. The admin UI warns when all items of a
  multi-purpose event share one category (`SINGLE_VAT_CATEGORY_ALL_ITEMS`). Full automation of this profile is a backend task to
  be validated by the accountant before use.
* VAT categories are country independent (`FOOD, DRINK_SOFT, ALCOHOL, ICE_CREAM, MERCH, ZERO`) with a second dimension
  **consumption mode** (`on_site | takeaway`). The item has `vat_category` + `default_consumption_mode`; an order may override the
  mode for all lines. The rate is looked up in `vat_rates(country, category, mode, valid_from, valid_to)`: dated data, never code.
  Mapping to the legal codes (BE_FOOD_ONSITE ...) is in `vat_rates.legal_code` and the migration comment. Seed rows carry
  `validated=false` until the accountant validates them; the order line snapshots the rate (basis points) used.
* VAT per **rate group per order**: `vat = round_half_up(gross_cents * rate_bp / (10000 + rate_bp))`, `net = gross - vat`
  (integer arithmetic), stored in `order_vat`. Tips are outside the VAT base and revenue.
* Voids/refunds: refund orders reproduce negative VAT per rate group; full journal reversal negates everything.
* `vat_regime = franchise | exempt_event`: VAT is still computed and stored; receipts carry the legal exemption mention.
* Promo tokens: organizer funds them at face value (`promo_expense`); promo-funded sales are reported in a separate VAT column
  [À VALIDER].

## Open
BE rates for non-alcoholic drinks on site / takeaway meals, FR sealed bottles (5.5 vs 10 %), rounding rule per group vs per line.
