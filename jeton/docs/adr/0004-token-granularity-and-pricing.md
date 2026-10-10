# ADR 0004 — Integer-token prices and configurable token value

Status: accepted. Binding source: coordinator note 9; R-VAT-3.

## Decision
Item prices are **integer tokens** (>= 1). The value of a token is per event (`token_price_cents`, default 200, any integer >= 1).
Events needing finer price steps choose a smaller token (e.g. EUR 0.50 => a EUR 2.50 beer costs 5 tokens). Top-ups must be an exact
multiple of the token price (`INVALID_AMOUNT`). Sub-token (fractional) prices are **not supported**; if ever needed, introduce
milli-tokens in a new API version with whole-token order totals. Same price for every payment method (no surcharge field).
`token_price_cents` is immutable once the event has ledger entries (liability invariant, ADR 0003).

## Consequences
Smaller tokens mean larger balances and caps: the UI shows euro equivalents (`price_cents`, `balance_cents`); `max_balance_tokens`,
`max_topup_tokens`, `offline_cap_tokens` and tip limits are token counts and must be scaled by the admin when the token value changes.
