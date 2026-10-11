# API requests from the client (variant A)

Append-only list of needs found while building `app/`. The client does not change `api/openapi.yaml`.

1. **Guest page host/CORS** - `GET /public/tags/{tag_code}` is fetched from the page served at `https://<host>/t/<code>`. Either the API is same-origin
   under `/v1` (assumed; reverse proxy) or the API must send CORS headers for the public route. The web server must also serve the guest entry
   (`t.html`) for every `/t/*` path (see `app/README.md`).
2. **Order lookup by tag for refunds** - the cashier refund flow lists `GET /tags/{tag_code}/transactions` and uses `WalletEntry.document_id` of
   `kind=sale` entries as `order_id`. Please confirm `document_id` is the Order id for sales (it is not stated). A per-order preview (items) for the
   cashier before refunding would help: `GET /orders/{id}` exists but is `vendor`-scoped? Please confirm `cashier` may read it.
3. **Catalog 304 handling** - `ETag` is a quoted `catalog_version`; the client sends `If-None-Match: "<version>"`. Please confirm exact quoting.
4. **Generator defaults** - fields with `default:` (e.g. `RefundOrderRequest.include_tip`, `OrderRequest.tip_tokens`) become *required* in
   openapi-typescript output by default; the client generates with `--default-non-nullable false`. No change needed, informational.
5. **Idempotent replay body** - `DUPLICATE_TX` is raised for a different body. The client stores the queued payload byte-identical to the first online
   attempt (provisional ref only in `SyncItem.provisional_ref`). Please confirm the server compares `payload` only, not `SyncItem`.
6. **Sync auth for expired JWT** - the client sends the device token to `/sync/batch` (allowed by `security`), but the item `staff_id` role check then
   relies on the staff record, not the JWT. OK as documented in ADR 0002.
7. **Session training flag on login** - `Session.training` is used for the permanent banner; please ensure it is also in `LoginResponse.session` (it is) and `GET /auth/me`.
8. **Optional NTAG data** - `EnrollTagRequest` has no field for the raw GET_VERSION bytes; the client infers `chip_type` itself. Fine for v1.
9. **Docs inconsistency (nfc-tags.md section 2)** - payload length example says "37 bytes + 1 prefix"; `jeton.example/t/<20 chars>` is 36 bytes + 1 prefix = 37.
10. **Per-event tags count** - enrolment counter "n / 1000" pages through `GET /events/{id}/tags` (200 per page). A `total` or a count endpoint would save 5 requests.

---

# Backend (server/) notes, contract changes and answers

Written by the backend engineer. Contract changes below were made in `api/openapi.yaml` first (coordinator decisions), then implemented.

## Contract changes made
11. **Online checkout** - new operations `createCheckout` (`POST /payments/checkouts`), `getCheckout` (`GET /payments/checkouts/{checkout_id}`) and
    `sumupWebhook` (`POST /webhooks/sumup?token=...`, public, secret in the URL). 65 operations now. Clients: create the checkout, show `hosted_url` (QR),
    poll `getCheckout` until `status=credited` (the webhook normally credits first). Wero / Bancontact-Payconiq stay manual (`POST /topups`, `manual=true`, `external_ref`).
12. **`X-Pending-Offline-Ops: <n>` request header** documented (see "Pending offline operations" in the contract info). Without it the server cannot know
    about unsynced devices, so `PENDING_OFFLINE_OPERATIONS` would never trigger. Please send it on every request (`0` after a successful sync).
13. **`ReplaceTagResponse.journal_seq` is nullable** - `null` when the old wallet had no tokens (no postings => no journal is possible).
14. **`FLAG_ALREADY_RESOLVED`** (409) error code added; **`OFFLINE_PRICE_MISMATCH`** flag added (DB migration `0008_flag_offline_price.sql`).
    `OrderLineInput.unit_price_tokens` (optional): the price the terminal showed. Offline sync posts with that price and flags a difference; online a
    difference is `PRICE_MISMATCH`.
15. **Exports**: `journal` and `postings` always contain training journals (column `is_training`) because they are part of the hash chain; documented columns.

## Answers to the client list above
- (2) `WalletEntry.document_id` is the Order id for `sale`/`order_refund` entries (top-up id for top-ups, cash-out id for cash-outs). `GET /orders/{id}` is
  readable by `cashier` (vendors only for their own stand).
- (3) ETag is exactly `"<catalog_version>"` (`"<catalog_version>-all"` with `include_inactive=true`); send it back verbatim in `If-None-Match`.
- (5) The server compares the request body only (`SyncItem.payload`, normalised: key order, defaults and timestamp formatting do not matter);
  `SyncItem.provisional_ref` is excluded from the comparison.
- (6) Confirmed: with a device token, each item's `staff_id` must be active, assigned to the device's event and allowed for the operation type.
- (7) `GET /auth/me` and `LoginResponse.session` both carry `training`.
- (1) CORS: set `CORS_ORIGINS` (comma separated) on the server; the public route is also served under `/v1`. Serving `/t/*` HTML is not done by the API.

## Behaviours worth knowing / contract gaps found
16. **Idempotency storage** - replays return the stored original response (table `idempotency_keys`, migration 0007), so e.g. an order replay is not affected by later price changes.
17. **Offline cap** is evaluated per sync batch (device + wallet cumulative tokens of the offline orders in the batch). The server has no other notion of an "offline session".
18. **`GET /events/{id}/reports/liability`** : `promo_redeemed_tokens` is not provided (promo tokens are fungible once credited); `promo_issued_tokens` is.
19. **Sales report** per item/category/hour/day computes VAT per line; `group_by=vat_rate` uses the exact per-order VAT groups. Totals can differ by cents between the two.
20. **VAT box mapping** (BE grids 00-03, FR CA3 08/09/9B) is hard-coded and [A VALIDER] with the accountant.
21. **Reversal of sales/refunds** creates a mirrored credit-note order (new `receipt_no`, refund of the sale) so Z, VAT and grand total net out; reversal of top-ups/cash-outs etc. is excluded from reports by joining the reversal journal.
22. **NXP originality signature** is accepted but not verified (`signature_verified` stays `null`): needs the NXP public keys.
23. **Cash desk session**: the opening float is a memo (not posted); movements with `float_in` during the session count towards `expected_cents`.
24. **Cross-event admin**: an `admin` logged in on a `console` device may address other events (create events, enrolment codes, reports); every other role is bound to the device's event (`FORBIDDEN`).
25. **`GET /events` for non-admins** returns the device event only; admins also see the events of the same organizer.
26. **Z-report anchoring**: each seal inserts a `chain_anchors` row and calls an `AnchorNotifier`; the default notifier logs the head hash. An SMTP notifier is not included.
27. **Account lifecycle** - no endpoint exists to deactivate/rotate the organizer or to list organizers; `putOrganizer` is create/replace only.
