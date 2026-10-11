import '../models/models.dart';

/// Thrown when the user cancels a pending tap or the wait times out.
class NfcCancelled implements Exception {
  const NfcCancelled();
  @override
  String toString() => 'NfcCancelled';
}

class NfcUnavailable implements Exception {
  final String reason;
  const NfcUnavailable(this.reason);
  @override
  String toString() => 'NfcUnavailable($reason)';
}

class NfcTagLost implements Exception {
  final Object? cause;
  const NfcTagLost([this.cause]);
  @override
  String toString() => 'NfcTagLost($cause)';
}

/// What a terminal needs from one tap: hardware UID + the NDEF URL stored on the tag.
class TagReading {
  final String uid;
  final String? ndefUrl;
  const TagReading(this.uid, this.ndefUrl);
}

/// A tag that is currently in the field. Only valid inside [NfcService.useTag].
abstract class TagSession {
  /// Upper-case hex UID without separators (API `TagUid`).
  String get uid;

  /// NDEF URI record found on the tag when it was discovered (null when empty/blank).
  String? get ndefUrl;

  /// `ntag213|ntag215|ntag216|ntag424dna|mifare_ultralight|other` (API `chip_type`).
  String get chipType;

  /// True when raw page access (NTAG PWD_AUTH configuration) is possible. Android only;
  /// Web NFC exposes NDEF only.
  bool get canProtect;

  /// NXP originality signature (READ_SIG, 64 hex chars) if the chip supports it.
  Future<String?> readSignature();

  Future<String?> readNdefUrl();

  /// Writes exactly one NDEF URI record (docs/nfc-tags.md section 2).
  Future<void> writeNdefUrl(String url);

  /// Applies NTAG21x password protection (docs/nfc-tags.md section 3) and verifies it.
  /// Returns true when verified (PWD_AUTH returns PACK and an unauthenticated write is refused).
  Future<bool> applyProtection(TagProtection p);
}

/// One abstraction for all platforms: nfc_manager (Android), Web NFC (browser), mock (desktop/tests).
abstract class NfcService {
  String get name;

  /// True for the simulated implementation (UI then shows the tap simulator).
  bool get isMock => false;

  Future<bool> isAvailable();

  /// Waits for the next tag, runs [action] while it is in the field, then releases the reader.
  /// Throws [NfcCancelled] on [cancel] or [timeout].
  Future<R> useTag<R>(Future<R> Function(TagSession tag) action,
      {Duration timeout = const Duration(seconds: 45)});

  /// Aborts a pending [useTag] (UI "Cancel" button).
  Future<void> cancel();

  /// Convenience: one tap, read UID + NDEF URL.
  Future<TagReading> readTag({Duration timeout = const Duration(seconds: 45)}) =>
      useTag((t) async => TagReading(t.uid, t.ndefUrl), timeout: timeout);
}
