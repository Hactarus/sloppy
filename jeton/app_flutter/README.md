# Jeton - Flutter client (variant B)

Flutter 3 (stable, built with 3.47 / Dart 3.13) client for Android and Web against the same contract as variant A
(`../api/openapi.yaml`). Scope: waiter POS, cashier (top-up, refund), bulk tag enrolment, minimal admin, public guest
balance page, offline queue, FR/NL/EN.

## Run (no backend needed)

```sh
cd jeton/app_flutter
flutter pub get
flutter gen-l10n                      # generated files are committed in lib/l10n/gen; re-run after editing the .arb files
flutter run -d chrome                 # in-memory fake API + mock NFC
flutter run -d linux                  # same, desktop
```

Demo mode: enrolment code `DEMO2026`; PINs: admin 1111, cashier 2222, bar 3333, fries 4444, auditor 5555.
The bug icon (bottom right) opens the **NFC simulator**: five demo tags (20/8/3/0/50 tokens), a blank tag (for
enrolment) and a "simulate offline" switch. Keyboard: Ctrl+1..5 tap demo tags, Ctrl+0 a blank tag.
Guest page: open `/t/0123456789ABCDEFGHJ0` (path URL strategy is enabled).

## Build-time defines

| define | meaning |
|---|---|
| `API_BASE_URL=https://api.example/v1` | use the real HTTP API; empty (default) = in-memory fake |
| `NFC=mock\|native` | default: mock with the fake API, native (nfc_manager / Web NFC) with a real API |
| `TAG_TARGET=1000` | bulk-enrolment counter target |
| `PUBLIC_HOST=...` | host used in tag URLs by the fake API |

```sh
flutter build web --release --dart-define=API_BASE_URL=https://api.example/v1
flutter build apk --release --dart-define=API_BASE_URL=https://api.example/v1   # needs the Android SDK (minSdk from Flutter default, NFC permission already in the manifest)
flutter analyze && flutter test
```

Web NFC needs HTTPS (or localhost) and Chrome on Android; the NFC scan must start from a user gesture, which the
"Pay" / "Read tag" / "Start" buttons are.

## Layout

```
lib/models        hand-written models of the contract (Order, Topup, Catalog, TagInfo, ApiError ...)
lib/api           JetonApi interface, HttpApi (dio), FakeApi (in memory: pricing, balance, UID binding,
                  idempotent client_tx_id, sync batch with flags, PIN lockout), demo seed data
lib/nfc           NfcService / TagSession abstraction; nfc_android.dart (nfc_manager 4: UID, NDEF read/write,
                  NTAG GET_VERSION / READ_SIG / PWD config via raw NfcA), nfc_web.dart (Web NFC through
                  dart:js_interop), nfc_mock.dart; nfc_platform.dart picks one with conditional imports
lib/offline       queue item model + per-tag offline cap
lib/state         Riverpod: auth (device token + PIN JWT), catalog cache (ETag/version, 5 min refresh),
                  queue, sync loop, POS controller, bulk-enrolment controller
lib/ui            screens: enrol device, PIN login, home, POS, cashier, tag encoding, admin, guest page, queue
lib/l10n          app_{en,fr,nl}.arb  (flutter gen-l10n -> lib/l10n/gen)
test/             logic + widget tests (11 + 1)
```

## What is implemented

* **Waiter POS**: tile grid (emoji + name + token price, colour tint), tap = +1, tap the qty badge = -1, long press =
  set quantity, Clear, Repeat last order, sticky total bar, optional tip chips (default "No tip", never pre-selected,
  limited by `tip_max_*`), age-check dialog when an item has `min_age`, "Pay" arms NFC, one request per confirmed payment
  (`expected_total_tokens` + `expected_catalog_version`; `PRICE_MISMATCH` refreshes the catalog and keeps the basket),
  full-screen result (green check / red cross / amber cloud, icon + colour + text, new balance), haptic + system sound,
  auto-reset after 1.5 s (3.5 s for errors), tap to dismiss. Training banner when the device is a training device.
* **Offline**: the `client_tx_id` (UUIDv7) is fixed at tap time. On a network failure the same body is queued
  (SharedPreferences JSON) with a device-local `provisional_ref`, if the per-tag offline cap (`offline_cap_tokens`,
  counted over the still-pending queue) allows it; otherwise `OFFLINE_CAP`. A 10 s loop probes connectivity and flushes
  via `POST /sync/batch` (device token auth, <= 200 per request, in order). `applied`/`duplicate` leave the queue,
  `rejected` stays visible; flags returned by the server are shown. Pill "offline - N pending" in the app bar.
* **Cashier**: read tag, presets 5/10/20 + stepper bounded by `max_topup`/`max_balance`, payment method (cash, SumUp card,
  SumUp online, Wero, Bancontact), reference field (required unless cash; `manual=true` for Wero/Bancontact),
  `terms_version`, stable `client_tx_id` across retries. Refund tab: cash out the whole balance. Online only.
* **Bulk enrolment**: loop of `enrollTag` -> write NDEF URI -> read back -> NTAG password config (Android) -> `confirmTag`,
  counter `N / 1000`, per-tag log, same chip is not re-processed while still on the reader.
* **Admin (minimal, read-only)**: catalog, devices + create enrolment code, liability / top-ups by method / sales by item.
* **Guest page** `/t/:tagCode`: public, no login, balance, last 20 operations, organiser, refund/expiry/policy.
* **i18n**: FR/NL/EN for every string and every API error code; language menu; system default.

## Honest limits / not done

* Not run on a real device or real tags: `nfc_android.dart` and `nfc_web.dart` compile (`flutter build web`, analyzer)
  but the Android build (no SDK here) and all hardware paths are untested. The "unauthenticated write must be refused"
  check of docs/nfc-tags.md section 5 is not automated (a NAK drops the NTAG session); do it as the manual QA step.
  Web NFC cannot do raw commands: no password protection, no originality signature (the UI says so).
* HTTP API is written from the contract but only exercised against the fake (no backend available).
* Admin has no editing (items, prices, staff PINs), no CSV export, no refund-of-order flow, no cash-desk sessions/Z.
* Offline queue persistence is SharedPreferences, not drift/hive: simpler and works on web without wasm setup; fine for
  hundreds of small items. Swap `QueueNotifier` storage if you need more.
* The device token is stored with `flutter_secure_storage` (Keystore on Android, WebCrypto-wrapped on web).
* Offline login is not possible (the JWT comes from the server); an expired JWT still lets queued orders sync because
  sync uses the device token.

## Comparison with variant A (React + Vite PWA + Capacitor)

| | A: React/Capacitor | B: Flutter |
|---|---|---|
| Web payload (measured B) | measured: ~97 KB gzip full app (79.7 KB main + 14.8 KB i18n + 2.1 KB CSS), lazy role chunks 1.7–3.3 KB, guest page 2.4 KB | `main.dart.js` 3.3 MB (958 KB gzip) + CanvasKit wasm 7.3 MB (2.9 MB gzip) = ~3.9 MB gzip first load; build/web is 41 MB on disk (several renderer variants; only one set is downloaded). Heavy for the public guest page: serve it from variant A's tiny page or a static HTML page even if B is the terminal app |
| Guest page | trivial, SEO/no-JS friendly, instant | works, but pays the full engine download; rendered to canvas (no text selection/accessibility parity with DOM) |
| Android NFC | in-repo Kotlin plugin, full control of reader mode, raw commands | `nfc_manager` 4 (maintained, free): UID, NDEF, NfcA transceive - enough for the NTAG password procedure; no code to maintain in Kotlin |
| Web NFC | same API for both variants (Chrome Android only) | same, through `dart:js_interop` bindings (~100 lines) |
| Offline | IndexedDB, service worker also caches the app shell (installable offline PWA) | queue works the same; app shell offline caching is Flutter's service worker (less configurable) |
| Dev speed | fast hot reload on web; two toolchains (Node + Android/Gradle + Kotlin plugin) | one language/toolchain, hot reload on device, single codebase for UI + NFC glue; Dart models hand-written here (openapi-generator dart-dio possible) |
| UI quality on tablets/phones | web-view in Capacitor | native rendering, steady 60 fps, consistent haptics/sound |
| iOS outlook | Capacitor iOS works, but Core NFC needs another native plugin; iPhone can still read the public URL | `nfc_manager` supports Core NFC (read/write NDEF, ISO 14443) with an Apple entitlement and a system sheet per scan: a continuous bulk-enrolment loop is awkward on iOS in both variants; raw NTAG PWD commands are possible via MiFare tag API. iOS terminals are out of scope in ADR 0008 |
| Risks | WebView NFC quirks, plugin upkeep | large web download, Wasm/CanvasKit hosting headers, smaller pool of web developers |

Recommendation: Flutter is attractive for the Android terminal (single stack, NFC without custom Kotlin), React for
anything public/web. A hybrid (A for `/t/:code` and admin web, B for terminals) is possible because the API is the only
shared artifact.
