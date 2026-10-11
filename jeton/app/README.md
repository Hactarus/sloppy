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
Status: the Gradle build and the Kotlin plugin have **not been built yet** (Google Maven was unreachable in the authoring sandbox, see below) and nothing is tested on hardware.

Runtime configuration (no rebuild per environment): the enrolment screen has a "Server URL" field (stored on the device in localStorage, default = build-time `VITE_API_BASE`)
and a "Demo mode (offline mock)" button that switches to the in-memory mock API (`src/api/settings.ts`; tests in `settings.test.ts`).
Note: the WebView origin is `https://localhost`, so the server must allow CORS for it and be served over https (cleartext/http LAN servers are blocked as mixed content).

Getting an SDK without dl.google.com (sandbox recipe that worked for the SDK part): `crane export cimg/android:2025.12.1 - | tar -x --wildcards 'home/circleci/android-sdk*'`
then move it to `~/android-sdk` (contains platform 36, build-tools 35.0.1/36.1.0-rc1); `echo sdk.dir=$HOME/android-sdk > android/local.properties`.
The Gradle step still needs `maven.google.com` -> `dl.google.com/dl/android/maven2` (AGP, androidx) to be reachable.

Signing a release with a real key: create `keystore.properties` (not committed) or pass `-Pandroid.injected.signing.*`; or build `assembleRelease` unsigned and run
`apksigner sign --ks my.jks --out jeton-release.apk app-release-unsigned.apk` (after `zipalign -p 4`).
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
