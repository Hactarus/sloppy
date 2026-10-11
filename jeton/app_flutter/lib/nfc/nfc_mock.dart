import 'dart:async';

import '../api/demo_data.dart';
import '../api/fake_api.dart' show sha1ish;
import '../models/models.dart';
import '../util.dart';
import 'nfc_service.dart';

/// A simulated physical chip.
class MockChip {
  MockChip(this.uid, {this.url, this.protected = false, this.chipType = 'ntag213'});
  final String uid;
  String? url;
  bool protected;
  final String chipType;
}

/// Mock NFC for desktop development and tests. Nothing happens until [tap] (UI simulator,
/// Ctrl+1..5 shortcuts, or tests) presents a chip to the pending [useTag].
class MockNfcService extends NfcService {
  MockNfcService() {
    for (final t in demoTags) {
      chips[t.uid] = MockChip(t.uid, url: t.url, protected: true);
    }
  }

  final Map<String, MockChip> chips = {};
  int _blankCounter = 0;
  Completer<MockChip>? _pending;

  /// Notifies the simulator UI that somebody waits for a tap.
  final waiting = StreamController<bool>.broadcast();
  bool get isWaiting => _pending != null && !_pending!.isCompleted;

  @override
  String get name => 'mock';
  @override
  bool get isMock => true;
  @override
  Future<bool> isAvailable() async => true;

  /// A brand new blank chip (random-ish 7-byte UID starting with 04).
  MockChip newBlank() {
    _blankCounter++;
    final uid = '04${sha1ish('blank$_blankCounter${DateTime.now().microsecondsSinceEpoch}').substring(0, 12)}';
    return chips[uid] = MockChip(uid);
  }

  /// Present a chip to the reader. Returns false if nobody is waiting.
  bool tap(MockChip chip) {
    final p = _pending;
    if (p == null || p.isCompleted) return false;
    p.complete(chip);
    return true;
  }

  bool tapDemo(int index) => tap(chips[demoTags[index % demoTags.length].uid]!);

  @override
  Future<R> useTag<R>(Future<R> Function(TagSession tag) action,
      {Duration timeout = const Duration(seconds: 45)}) async {
    if (isWaiting) throw StateError('NFC session already active');
    final c = _pending = Completer<MockChip>();
    waiting.add(true);
    try {
      final chip = await c.future.timeout(timeout, onTimeout: () => throw const NfcCancelled());
      return await action(_MockSession(chip));
    } finally {
      _pending = null;
      waiting.add(false);
    }
  }

  @override
  Future<void> cancel() async {
    final p = _pending;
    if (p != null && !p.isCompleted) p.completeError(const NfcCancelled());
  }
}

class _MockSession implements TagSession {
  _MockSession(this.chip);
  final MockChip chip;

  @override
  String get uid => chip.uid;
  @override
  String? get ndefUrl => chip.url;
  @override
  String get chipType => chip.chipType;
  @override
  bool get canProtect => true;
  @override
  Future<String?> readSignature() async => null;
  @override
  Future<String?> readNdefUrl() async => chip.url;
  @override
  Future<void> writeNdefUrl(String url) async {
    if (chip.protected) throw const NfcTagLost('write refused: password protected');
    chip.url = url;
  }

  @override
  Future<bool> applyProtection(TagProtection p) async {
    assert(isValidUid(chip.uid));
    chip.protected = true;
    return true;
  }
}
