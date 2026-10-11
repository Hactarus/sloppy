# ADR 0001 — Tag format and anti-clone

Status: accepted. Supersedes: none. Binding source: BRIEF decision 1.

## Context
~1000 NFC stickers act as guest wallets. The tag must work with any phone (iPhone included), carry no money, and resist
cheap cloning and vandalism.

## Decision
* The tag holds one NDEF **URI record** `https://<host>/t/<tag_code>` (URI identifier code 0x04 "https://").
* `tag_code` = 96 random bits from a CSPRNG, Crockford base32, upper-case, 20 characters; the final character encodes
  only 1 bit so it is `0` or `G`. Regex `^[0-9A-HJKMNP-TV-Z]{19}[0G]$`. No check digit (never typed by hand).
* The server stores `tag_code <-> hardware UID` at enrolment. Every staff-side operation sends both; mismatch =>
  `TAG_UID_MISMATCH` (409). The expected UID is never revealed.
* The public balance page is keyed by `tag_code` only (unguessable capability) and exposes no UID.
* NTAG21x tags are **password protected for writing** (PWD_AUTH, `PROT=0`, `AUTH0=4`); reading stays open so phones can read
  the URL. **Never** set permanent lock bits (static/dynamic). Password = first 4 bytes of
  `HMAC-SHA256(master_key, "pwd" || uid)`, PACK = next 2 bytes, so no per-tag secret is stored.
* If the chip supports the NXP originality signature (NTAG21x `READ_SIG`), the encoder app submits it at enrolment and the
  server verifies it against the NXP public key; result stored in `tags.signature_verified`.
* Unprotected or non-NXP chips (`chip_type=other`) are allowed but marked; admin UI warns.

## Consequences
* A cloner who copies URL and UID (magic/UID-changeable cards) defeats the binding: accepted residual risk because a tag holds
  no value beyond its token balance and the server can block the wallet (`/tags/{code}/status`) and flag anomalies.
  Mitigation: signature check, UID mismatch alerts, per-tag `max_balance_tokens` (default 100).
* Upgrade path: NTAG 424 DNA (SUN/CMAC rolling code) would make clones detectable; the API already carries `chip_type=ntag424dna`.
  Not required for v1 (cost, Android-only secure channel).
* iOS phones tapping a tag open the page; iOS app terminals are out of scope (Web NFC is Android Chrome only).

## Alternatives rejected
* Balance on tag (clonable, offline double spend, no audit). * Sequential codes (guessable balances). * MIFARE Classic
  (broken crypto, iPhone cannot read NDEF on it).
