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
