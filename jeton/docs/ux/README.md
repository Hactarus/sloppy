# Jeton client UX spec (variant A: React PWA + Capacitor)

Portrait phone first, one hand, thumb zone at the bottom. Touch targets >= 56 px, high contrast, status = icon + colour + text
(never colour alone). FR / NL / EN, language switch in the header menu (default: browser language). Contract: `api/openapi.yaml`.

## 0. Shell

* First run: **Device enrolment** (enrolment code, 8 chars) -> device token stored locally. Then **PIN login** (staff list, PIN pad).
* Role decides the home screen: `vendor` -> POS, `cashier` -> Cashier, `admin` -> Admin (all screens reachable), `auditor` -> Admin (read only).
* Header: stand name, staff, connectivity pill, menu. Pill: `online` (hidden), `offline - 3 pending` (amber, cloud-off icon),
  `syncing...`, `3 rejected` (red, tap = list).
* `session.training = true` -> permanent striped banner "TEST / TRAINING - no real money" on every screen (also on result screens).
* If the event has `be_gks_required`, the cashier and POS screens show a one-line warning "Not a fiscal ticket / not a certified GKS".
* Errors are localised from `error.code`, never from `message`.

## 1. Waiter POS (most important)

Goals: basket + payment < 5 s; one tap per item; undo is as fast as add.

```
+------------------------------+
| Bar 1 - Anna        [offline 3]|  header 48px
+------------------------------+
| [Drinks] [Food] [All]        |  category chips (only if > 1 category)
+------------------------------+
| +--------+  +--------+       |
| | beer   |  | (2)    |       |  tile: icon/emoji, name, price in tokens
| | Pils   |  | Cola   |       |  badge (qty) top-right, tile tinted when qty > 0
| | 1 tok  |  | 1 tok  |       |
| +--------+  +--------+       |
| | Frites |  | Water  |       |
| ...                          |
+------------------------------+
| [Clear] [Repeat last]  tip:+1 +2 |  secondary row
| Total  7 tokens (EUR 14.00)  |  sticky total bar
| [          PAY  7          ] |  big button, bottom, thumb reach
+------------------------------+
```

Interactions
* Tap tile = +1. Tap the badge, or swipe the tile left = -1 (badge disappears at 0). Long-press (500 ms) = number pad "set quantity" (1..99, 0 removes).
* Haptic tick on every change (`navigator.vibrate`/Capacitor), short click sound; errors = long buzz + low tone. Sound can be muted.
* **Clear**: clears the basket (no confirm, but kept in memory so "Undo" snackbar appears for 4 s).
* **Repeat last order**: refills the basket with the last *paid* order of this device (persisted locally). Disabled when none.
* **Tip**: presets from `event.tip_presets_tokens` (default 1/2/5; POS shows the first two) as toggle chips. Never pre-selected, default 0, tapping again clears. Capped by
  `tip_max_tokens` and `tip_max_percent` (chip disabled when it would exceed). Hidden if `tips_enabled=false`.
* Items with `min_age`: PAY first shows an "Age checked (16+)?" confirmation (sent as `age_check_confirmed`).
* Basket survives navigation and app restart (local storage). Prices come from the cached catalog (`catalog_version` sent as `expected_catalog_version`).
  `PRICE_MISMATCH` -> catalog refreshed, basket repriced, user sees "Prices updated" and must press PAY again.

Pay flow
```
basket -> [PAY] -> "armed" overlay: big NFC icon, total, "Hold the wristband/tag to the phone", [Cancel]
       -> tag read (uid + tag_code) -> online: POST /orders ; offline: cap check + queue
       -> RESULT full screen, 1.5 s (tap to dismiss early), then basket cleared, ready for next customer
```
Result screens
* Success: green background, check icon, "PAID 7 tokens", "New balance: 13 tokens" (online) or "Saved offline - balance unknown" (offline, with provisional ref).
* Failure: red background, cross icon, localised reason from `code`: `INSUFFICIENT_BALANCE` shows "Balance 2, needs 6" (+ "Top up at the cash desk");
  `TAG_UID_MISMATCH`, `TAG_BLOCKED`, `TAG_NOT_FOUND`, offline cap reached ("Offline limit 10 tokens per tag"), network error while online
  -> automatic fall back to queue only for connection failures (not for business errors). Failure result stays 3 s (reading time) but is tappable.
* Basket is NOT cleared on failure; the waiter can retry/cancel.
* Receipts: no printing in v1; result shows `receipt_no` when the server returned one; "DUPLICATA" is only used by reprint (admin).

Offline
* Orders (and refunds) are queued in IndexedDB with UUIDv7 `client_tx_id`, `client_created_at`, `provisional_ref` (`<device>-<n>`).
* Without server contact the UID cannot be checked and the balance is unknown: per tag (`tag_code`) per device the app tracks spent offline tokens and refuses
  beyond `event.offline_cap_tokens` (default 10).
* Sync: on `online` events, every 15 s while pending, and on app start; `POST /sync/batch` (<= 200 items, in order). `applied|duplicate` -> removed,
  `rejected` -> moved to a "rejected" list shown by the pill (never silently dropped).

## 2. Cashier

```
[ Tap a tag ]  -> tag card: balance, status, (last 3 entries)
Tabs: [Top up] [Refund]
Top up: presets [5][10][20] [custom -/+]     = tokens, EUR amount shown
        Payment: (cash)(SumUp card)(SumUp QR)(Wero)(Payconiq)   external ref field (required for non-cash manual methods)
        [Confirm 10 tokens - EUR 20.00]  -> result screen (green/red) + new balance
Refund: pick "cash-out" of N tokens (default: whole balance), method, reason code, external ref -> POST /cashouts
        order refund: enter last receipt? (v1: via admin journal list) 
```
Top-ups are online only; offline shows "Top-ups need a connection". Limits (`max_topup_tokens`, `max_balance_tokens`) are shown before confirm.
Reason codes are a select (no free text). Promo method only for admin.

## 3. Tag enrolment (bulk)

```
Enrolment                         312 / 1000
[#############.............]
  status line: "Place next tag"  -> reading -> registering -> writing -> verifying -> OK (green, beep)
  last: ...GHJ0  OK | ...K2M0 FAILED (retry) 
  [Pause] [Target: 1000]
```
Loop per `docs/nfc-tags.md` s.5: read UID -> `POST /tags/enroll` -> write NDEF URI from `ndef_url` (never rebuilt) -> read back ->
(protection written by the native plugin when `protection` != null) -> `POST /tags/{code}/confirm`. Same tag retried returns the same `tag_code`.
After 2 failures the tag is marked "reject bin". The counter counts confirmed tags this session (+ server `listTags` count at start).
Web NFC cannot do PWD_AUTH: in the browser the tag is written unprotected and `password_protected=false` is reported (admin UI warns).

## 4. Admin

Tabs: Catalog (stands, categories, items: name FR/NL/EN, price tokens, VAT category, icon, colour, min age, active), Devices (list, enrolment code
for terminal/cashdesk/console + training flag, revoke), Staff (create/edit, role, PIN set), Reports (Z preview, sales, VAT, top-ups, liability, tips),
Exports (links to CSV datasets, fetched with the staff token). Unvalidated VAT rates are flagged.

## 5. Guest balance page `/t/:tagCode`

Separate tiny entry (no framework, no cookies, no storage). Shows balance (big), EUR value, status, last 20 purchases, event/organiser,
policy summary, privacy link. Language from `navigator.language` (fr/nl/en). 404/unknown -> neutral "tag not found". `noindex` meta.
