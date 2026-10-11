# ADR 0010 — Authentication: enrolled devices + staff PIN

Status: accepted. Source: BRIEF decision 7; R-STAFF-1.

* Device enrolment code (15 min, single use, SHA-256 stored) -> opaque 256-bit device token (SHA-256 stored), bound to event, stand
  and `training` flag (immutable). Revoking a device kills the token at once.
* Staff PIN (4-8 digits, argon2id) on an enrolled device -> 12 h JWT (`sub, did, eid, sid, role, trn`). 5 failed PINs => 15 min lock.
  PIN guessing is further limited by per-device rate limits.
* Roles `admin | cashier | vendor | auditor`; permissions per operation are listed in `x-roles` in the OpenAPI file; vendors are limited
  to their stand. Role checks happen server-side; the JWT role is a convenience for the client UI.
* Offline sync accepts the device token (JWT may have expired) and validates `staff_id` per item.
* Bootstrapping: first admin and console enrolment code are created by a server CLI (`admin:bootstrap`), not by an HTTP endpoint.
