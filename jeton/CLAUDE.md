# CLAUDE.md — Jeton (NFC token cashless payments)

This directory is a separate project from the Sloppy rhythm game at the repo
root. Ignore the root CLAUDE.md rules about Godot/Rust when working here.

- Read `BRIEF.md` first; its decisions are binding.
- `api/openapi.yaml` is the API source of truth. Change it first, then code.
- Ledger tables are append‑only. Never write UPDATE/DELETE on them; reverse.
- Money = integer euro cents, tokens = integer tokens. No floats.
- Every write endpoint takes an idempotency `client_tx_id` (UUIDv7).
- Waiter flow target: basket + payment in < 5 s, one tap per item.
- UI: portrait, large touch targets (≥ 56 px), high contrast, FR/NL/EN i18n
  (Belgium + France), colorblind‑safe status (icon + color).
- Tests must pass before commit. Agents do not push; the coordinator does.

Agents: `.claude/agents/jeton-*.md`.
