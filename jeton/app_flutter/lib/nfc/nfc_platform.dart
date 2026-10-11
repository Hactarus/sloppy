// Picks the platform NFC implementation at compile time so that `nfc_manager` is never
// compiled into web builds and `dart:js_interop` never into mobile builds.
export 'nfc_stub.dart'
    if (dart.library.js_interop) 'nfc_web.dart'
    if (dart.library.io) 'nfc_android.dart';
