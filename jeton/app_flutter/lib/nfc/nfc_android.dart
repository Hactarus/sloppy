import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:nfc_manager/ndef_record.dart';
import 'package:nfc_manager/nfc_manager.dart';
import 'package:nfc_manager/nfc_manager_android.dart';

import '../models/models.dart';
import '../util.dart';
import 'ndef_uri.dart';
import 'nfc_mock.dart';
import 'nfc_service.dart';

/// Selected by `nfc_platform.dart` on every `dart:io` target. Falls back to the mock on
/// desktop so `flutter run -d linux` works.
NfcService createPlatformNfc() => defaultTargetPlatform == TargetPlatform.android
    ? AndroidNfcService()
    : MockNfcService();

/// Android implementation on top of `nfc_manager` 4.x (reader mode, ISO 14443-3A polling).
/// Reads UID + NDEF, writes one NDEF URI record and configures NTAG21x password protection
/// with raw NfcA commands (GET_VERSION 0x60, READ_SIG 0x3C, READ 0x30, WRITE 0xA2, PWD_AUTH 0x1B).
class AndroidNfcService extends NfcService {
  Completer<void>? _cancel;

  @override
  String get name => 'android';

  @override
  Future<bool> isAvailable() async =>
      await NfcManager.instance.checkAvailability() == NfcAvailability.enabled;

  @override
  Future<R> useTag<R>(Future<R> Function(TagSession tag) action,
      {Duration timeout = const Duration(seconds: 45)}) async {
    final avail = await NfcManager.instance.checkAvailability();
    if (avail != NfcAvailability.enabled) {
      throw NfcUnavailable(avail.name);
    }
    final result = Completer<R>();
    final cancel = _cancel = Completer<void>();
    var busy = false;
    await NfcManager.instance.startSession(
      pollingOptions: {NfcPollingOption.iso14443},
      onDiscovered: (NfcTag tag) async {
        if (busy || result.isCompleted) return;
        busy = true;
        try {
          final s = await _AndroidSession.open(tag);
          result.complete(await action(s));
        } catch (e, st) {
          if (!result.isCompleted) result.completeError(e, st);
        }
      },
    );
    unawaited(cancel.future.then((_) {
      if (!result.isCompleted) result.completeError(const NfcCancelled());
    }));
    try {
      return await result.future.timeout(timeout, onTimeout: () => throw const NfcCancelled());
    } finally {
      _cancel = null;
      try {
        await NfcManager.instance.stopSession();
      } catch (_) {}
    }
  }

  @override
  Future<void> cancel() async {
    final c = _cancel;
    if (c != null && !c.isCompleted) c.complete();
  }
}

class _AndroidSession implements TagSession {
  _AndroidSession._(this.uid, this.ndefUrl, this.chipType, this._nfcA, this._ndef);

  final NfcAAndroid? _nfcA;
  final NdefAndroid? _ndef;

  @override
  final String uid;
  @override
  final String? ndefUrl;
  @override
  final String chipType;

  static Future<_AndroidSession> open(NfcTag tag) async {
    final base = NfcTagAndroid.from(tag);
    if (base == null) throw const NfcUnavailable('not an Android tag');
    final nfcA = NfcAAndroid.from(tag);
    final ndef = NdefAndroid.from(tag);
    final chip = nfcA == null ? 'other' : await _detectChip(nfcA);
    return _AndroidSession._(hex(base.id), _firstUrl(ndef?.cachedNdefMessage), chip, nfcA, ndef);
  }

  static String? _firstUrl(NdefMessage? m) {
    if (m == null) return null;
    for (final r in m.records) {
      if (r.typeNameFormat == TypeNameFormat.wellKnown && r.type.length == 1 && r.type[0] == 0x55) {
        return decodeUriPayload(r.payload);
      }
    }
    return null;
  }

  /// NTAG21x answer GET_VERSION with 8 bytes: [0]=0, [1]=vendor 04 (NXP), [2]=type 04 (NTAG),
  /// [3]=subtype, [4..5]=version, [6]=storage size (0F 213, 11 215, 13 216).
  static Future<String> _detectChip(NfcAAndroid a) async {
    try {
      final v = await a.transceive(Uint8List.fromList([0x60]));
      if (v.length == 8 && v[1] == 0x04) {
        if (v[2] == 0x04) {
          return switch (v[6]) {
            0x0F => 'ntag213',
            0x11 => 'ntag215',
            0x13 => 'ntag216',
            _ => 'other',
          };
        }
        if (v[2] == 0x03) return 'mifare_ultralight';
      }
    } catch (_) {
      // Tags without GET_VERSION NAK; the session may need a reconnect which the plugin does lazily.
    }
    return 'other';
  }

  bool get _isNtag => chipType == 'ntag213' || chipType == 'ntag215' || chipType == 'ntag216';

  @override
  bool get canProtect => _isNtag && _nfcA != null;

  ({int cfg0, int cfg1, int pwd, int pack}) get _cfgPages => switch (chipType) {
        'ntag213' => (cfg0: 0x29, cfg1: 0x2A, pwd: 0x2B, pack: 0x2C),
        'ntag215' => (cfg0: 0x83, cfg1: 0x84, pwd: 0x85, pack: 0x86),
        _ => (cfg0: 0xE3, cfg1: 0xE4, pwd: 0xE5, pack: 0xE6),
      };

  @override
  Future<String?> readSignature() async {
    final a = _nfcA;
    if (a == null || !_isNtag) return null;
    try {
      final sig = await a.transceive(Uint8List.fromList([0x3C, 0x00]));
      return sig.length == 32 ? hex(sig) : null;
    } catch (_) {
      return null;
    }
  }

  @override
  Future<String?> readNdefUrl() async {
    final n = _ndef;
    if (n == null) return null;
    return _firstUrl(await n.getNdefMessage());
  }

  @override
  Future<void> writeNdefUrl(String url) async {
    final n = _ndef;
    if (n == null) throw const NfcUnavailable('tag has no NDEF technology (format it first)');
    final rec = NdefRecord(
      typeNameFormat: TypeNameFormat.wellKnown,
      type: Uint8List.fromList([0x55]),
      identifier: Uint8List(0),
      payload: encodeUriPayload(url),
    );
    try {
      await n.writeNdefMessage(NdefMessage(records: [rec]));
    } catch (e) {
      throw NfcTagLost(e);
    }
  }

  Future<void> _writePage(NfcAAndroid a, int page, List<int> data4) async {
    final r = await a.transceive(Uint8List.fromList([0xA2, page, ...data4]));
    // ACK is a 4-bit 0xA; the plugin returns it as one byte.
    if (r.isNotEmpty && r[0] != 0x0A) throw NfcTagLost('NAK on page $page');
  }

  @override
  Future<bool> applyProtection(TagProtection p) async {
    final a = _nfcA;
    if (!canProtect || a == null) return false;
    final pg = _cfgPages;
    final pwd = unhex(p.pwd);
    final pack = unhex(p.pack);
    // 1. PWD + PACK
    await _writePage(a, pg.pwd, pwd);
    await _writePage(a, pg.pack, [...pack, 0, 0]);
    // 2. CFG1 ACCESS: PROT=0 (write only), CFGLCK=0 (never lock!), NFC_CNT_EN=0, AUTHLIM=7.
    final cfg1 = await a.transceive(Uint8List.fromList([0x30, pg.cfg1]));
    await _writePage(a, pg.cfg1, [0x07, cfg1[1], cfg1[2], cfg1[3]]);
    // 3. CFG0 AUTH0 = first protected page (4 = whole user memory); keep the other bytes.
    final cfg0 = await a.transceive(Uint8List.fromList([0x30, pg.cfg0]));
    await _writePage(a, pg.cfg0, [cfg0[0], cfg0[1], cfg0[2], p.auth0]);
    // 4. Verify: PWD_AUTH must return PACK, and the configuration must read back as written.
    //    (The "unauthenticated write is refused" check of docs/nfc-tags.md is a NAK that drops the
    //    tag state on NTAG21x and cannot be followed by more commands in the same session, so it
    //    stays a manual QA step.)
    final auth = await a.transceive(Uint8List.fromList([0x1B, ...pwd]));
    if (auth.length < 2 || auth[0] != pack[0] || auth[1] != pack[1]) return false;
    final c0 = await a.transceive(Uint8List.fromList([0x30, pg.cfg0]));
    final c1 = await a.transceive(Uint8List.fromList([0x30, pg.cfg1]));
    return c0[3] == p.auth0 && (c1[0] & 0xC7) == 0x07;
  }
}
