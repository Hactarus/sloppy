# ADR 0008 — Client stack variants A and B

Status: accepted. Source: BRIEF "Tooling".

* **Variant A (main)**: React + Vite PWA packaged with Capacitor for Android; NFC via an in-repo Kotlin Capacitor plugin
  (`NfcAdapter.enableReaderMode`), Web NFC on Android Chrome. One TypeScript codebase also serves the public balance page.
* **Variant B (branch `...-flutter`)**: Flutter (Android + Web) against the same contract.
* Both implement the identical offline queue semantics (ADR 0002), error handling by `code`, catalog caching by `catalog_version`,
  and the legal UI requirements (training banner, DUPLICATA marker, age check, tip never pre-selected). The OpenAPI file is the only shared
  artifact; clients should generate types from it (openapi-typescript / openapi-generator dart-dio).
* Reader mode must read UID + NDEF; iOS terminals are out of scope.
