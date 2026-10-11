# Jeton app (variant A): React + Vite PWA + Capacitor Android

One TypeScript codebase: waiter POS, cashier, tag enrolment, admin, and a tiny separate guest balance page (`/t/:tagCode`).
UX spec: `../docs/ux/README.md`. API contract: `../api/openapi.yaml` (types generated, never edited).

## Commands
```sh
pnpm install
pnpm gen:api        # openapi-typescript -> src/api/schema.d.ts (needs TypeScript 5: TS 7 has no JS API)
pnpm dev            # mock API + mock NFC by default
pnpm test           # vitest + Testing Library + fake-indexeddb
pnpm build          # gen:api + tsc + vite build  -> dist/ (index.html app, t.html guest)
```

## Mock vs real API
* `VITE_API_MODE=mock` (default in `vite dev`) uses `src/api/mock.ts`, an in-memory fake implementing the generated types, injected as the `fetch` of
  openapi-fetch (so middleware/error handling are the real ones). Browser console: `jetonMock.offline(true)` simulates a dead network.
  Setup codes: `C...` cash desk, `A...` console, `X...` training, other = waiter. PINs: Anna 1111, Bob 2222, Admin 9999.
* `VITE_API_MODE=real` (default in production builds) talks to `VITE_API_BASE` (default `/v1`; dev server proxies `/v1` to `API_PROXY`, default
  `http://localhost:3000`). In the Capacitor app set `VITE_API_BASE=https://api.example/v1` (absolute).

## NFC
`NfcService` (`src/nfc/types.ts`) has three implementations: `web.ts` (Web NFC, Android Chrome, no PWD_AUTH), `capacitor.ts` (native plugin) and
`mock.ts` (desktop; keys 1-5 tap the fake chips, `n` taps a new blank chip, `x` taps a chip with a wrong UID). `VITE_NFC=mock` forces the mock.

## Guest page hosting
`/t/*` must be served by `t.html` (dev/preview does this automatically). nginx: `location /t/ { try_files /t.html =404; }`. The page ships no framework,
no cookies, no storage.

## Android (Capacitor)
Project: `android/`; in-repo Kotlin plugin: `android-plugins/nfc` (module `:jeton-nfc`, registered in `MainActivity`).
The Android SDK was NOT available when this was written, so the Gradle build and the plugin are **unbuilt and untested on hardware**.
```sh
export ANDROID_HOME=...        # SDK with platform 36 + build-tools; JDK 17+
CAP=1 VITE_API_MODE=real VITE_API_BASE=https://api.example/v1 pnpm exec vite build
pnpm exec cap sync android     # regenerates android/capacitor.settings.gradle (machine-specific pnpm path)
cd android && ./gradlew assembleDebug     # app/build/outputs/apk/debug
```
Plugin API (`src/nfc/capacitor.ts` mirrors it): `isAvailable()`, `readTag()` -> `{uid, ndefHex, chipType, signature}`, `writeUri({url, protection})` ->
adds `{readbackOk, passwordProtected}`, `cancel()`. Reader mode flags: NFC-A/B/V, no platform sounds. Protection follows `docs/nfc-tags.md` section 3.
Kotlin plugin version in `android/build.gradle` (2.1.20) may need adjusting to the installed AGP.

## Offline
IndexedDB (`src/offline`): ops queue (UUIDv7 `client_tx_id`, creation order), per-tag offline spend vs `offline_cap_tokens`, sync via `/sync/batch`
(every 15 s, on `online`, tap the pill). Rejected items stay listed (never dropped). Top-ups are online only.
