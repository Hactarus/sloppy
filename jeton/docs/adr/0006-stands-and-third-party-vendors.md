# ADR 0006 — Stands are the organizer's own activity in v1

Status: accepted. Source: coordinator note 8; legal R-VEND-*, payment-regulation.md.

## Decision
All stands sell on behalf of the single `organizer` of the event. `events.third_party_vendors_enabled` exists but is constrained to
`false` (DB CHECK and API `const: false`). Documented-only design for later: `stand.operator_entity_id`, per-vendor VAT breakdown and
settlement statements signed with the chain hash, self-billing, and a legal review of the payment-law (limited network / e-money)
implications before enabling. The ledger already supports it (stand accounts, per-stand revenue).
Related regulatory counter: `v_redemptions_rolling_12m` / `GET /organizers/{id}/reports/redemption-volume` tracks rolling 12-month
redemptions (warn EUR 800k, limit EUR 1M, PSD2 art. 37(2)).
