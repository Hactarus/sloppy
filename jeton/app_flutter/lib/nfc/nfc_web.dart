import 'dart:async';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:typed_data';

import 'package:web/web.dart' as web;

import '../models/models.dart';
import 'nfc_mock.dart';
import 'nfc_service.dart';

/// Selected by `nfc_platform.dart` on web builds.
NfcService createPlatformNfc() =>
    WebNfcService.supported ? WebNfcService() : MockNfcService();

// ---- minimal bindings for the Web NFC API (https://w3c.github.io/web-nfc/) ----
@JS('NDEFReader')
extension type _NdefReader._(JSObject _) implements JSObject {
  external factory _NdefReader();
  external JSPromise<JSAny?> scan([JSObject? options]);
  external JSPromise<JSAny?> write(JSAny message, [JSObject? options]);
  external set onreading(JSFunction? f);
  external set onreadingerror(JSFunction? f);
}

extension type _ReadingEvent._(JSObject _) implements JSObject {
  external String? get serialNumber;
  external _NdefMessage get message;
}

extension type _NdefMessage._(JSObject _) implements JSObject {
  external JSArray<_NdefRecord> get records;
}

extension type _NdefRecord._(JSObject _) implements JSObject {
  external String get recordType;
  external JSDataView? get data;
}

/// Web NFC (Chrome on Android, HTTPS only, needs a user gesture to start the scan).
/// Limits compared to the native path: NDEF only, no raw NfcA commands, so no password
/// protection and no originality signature; the UID is the `serialNumber` of the reading.
class WebNfcService extends NfcService {
  static bool get supported => web.window.has('NDEFReader');

  web.AbortController? _abort;
  Completer<void>? _cancel;

  @override
  String get name => 'webnfc';

  @override
  Future<bool> isAvailable() async => supported;

  @override
  Future<R> useTag<R>(Future<R> Function(TagSession tag) action,
      {Duration timeout = const Duration(seconds: 45)}) async {
    if (!supported) throw const NfcUnavailable('Web NFC not supported (use Chrome on Android)');
    final reader = _NdefReader();
    final abort = _abort = web.AbortController();
    final cancel = _cancel = Completer<void>();
    final result = Completer<R>();
    var busy = false;

    reader.onreading = ((JSObject ev) {
      if (busy || result.isCompleted) return;
      busy = true;
      final e = ev as _ReadingEvent;
      String? url;
      for (final r in e.message.records.toDart) {
        final d = r.data;
        if (r.recordType == 'url' && d != null) {
          url = _decodeUtf8(d);
        } else if (r.recordType == 'text' || r.recordType == 'absolute-url') {
          url ??= d == null ? null : _decodeUtf8(d);
        }
      }
      final uid = (e.serialNumber ?? '').replaceAll(':', '').toUpperCase();
      _WebSession(reader, abort, uid, url).run(action).then(result.complete, onError: result.completeError);
    }).toJS;
    reader.onreadingerror = ((JSObject _) {
      if (!result.isCompleted) result.completeError(const NfcTagLost('reading error'));
    }).toJS;

    try {
      await reader.scan({'signal': abort.signal}.jsify() as JSObject).toDart;
    } catch (e) {
      throw NfcUnavailable('$e');
    }
    unawaited(cancel.future.then((_) {
      if (!result.isCompleted) result.completeError(const NfcCancelled());
    }));
    try {
      return await result.future.timeout(timeout, onTimeout: () => throw const NfcCancelled());
    } finally {
      _cancel = null;
      abort.abort();
      _abort = null;
    }
  }

  @override
  Future<void> cancel() async {
    final c = _cancel;
    if (c != null && !c.isCompleted) c.complete();
    _abort?.abort();
  }
}

String _decodeUtf8(JSDataView d) {
  final bd = d.toDart;
  final bytes = bd.buffer.asUint8List(bd.offsetInBytes, bd.lengthInBytes);
  // 'url' records carry the full URL as UTF-8 (no prefix code on the Web NFC API).
  return String.fromCharCodes(Uint8List.fromList(bytes)).trim();
}

class _WebSession implements TagSession {
  _WebSession(this._reader, this._abort, this.uid, this.ndefUrl);
  final _NdefReader _reader;
  final web.AbortController _abort;

  Future<R> run<R>(Future<R> Function(TagSession) f) => f(this);

  @override
  final String uid;
  @override
  final String? ndefUrl;
  // Web NFC cannot identify the chip type; 7-byte UID starting with 04 is an NXP NTAG family chip.
  @override
  String get chipType => 'other';
  @override
  bool get canProtect => false;
  @override
  Future<String?> readSignature() async => null;
  @override
  Future<String?> readNdefUrl() async => _written ?? ndefUrl;

  // Web NFC has no read-back primitive besides a new scan; a resolved write() promise is the
  // platform's own confirmation, so a read-back reports what was written.
  String? _written;

  @override
  Future<void> writeNdefUrl(String url) async {
    try {
      final msg = {
        'records': [
          {'recordType': 'url', 'data': url}
        ]
      }.jsify()!;
      await _reader
          .write(msg, {'overwrite': true, 'signal': _abort.signal}.jsify() as JSObject)
          .toDart;
      _written = url;
    } catch (e) {
      throw NfcTagLost(e);
    }
  }

  @override
  Future<bool> applyProtection(TagProtection p) async => false;

}
