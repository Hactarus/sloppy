import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config.dart';
import '../models/models.dart';
import '../nfc/nfc_service.dart';
import '../util.dart';
import 'providers.dart';

class EnrollEntry {
  const EnrollEntry({required this.ok, this.tagCode, this.uid, this.errorCode, this.protected = false});
  final bool ok;
  final String? tagCode, uid, errorCode;
  final bool protected;
}

class EnrollState {
  const EnrollState({this.count = 0, this.target = tagTarget, this.running = false, this.waiting = false, this.log = const []});
  final int count, target;
  final bool running, waiting;
  final List<EnrollEntry> log; // newest first

  EnrollState copyWith({int? count, bool? running, bool? waiting, List<EnrollEntry>? log}) => EnrollState(
      count: count ?? this.count,
      target: target,
      running: running ?? this.running,
      waiting: waiting ?? this.waiting,
      log: log ?? this.log);
}

/// Bulk tag provisioning (docs/nfc-tags.md section 5): tap tags one after another;
/// each gets enrolled (server allocates tag_code), written, read back, protected, confirmed.
class EnrollController extends Notifier<EnrollState> {
  String? _lastUid;
  int _gen = 0;

  @override
  EnrollState build() => const EnrollState();

  Future<void> loadCount() async {
    final s = ref.read(authProvider).session;
    if (s == null) return;
    try {
      final n = await ref.read(apiProvider).countActiveTags(s.eventId);
      state = state.copyWith(count: n);
    } catch (_) {}
  }

  Future<void> start() async {
    if (state.running) return;
    final gen = ++_gen;
    state = state.copyWith(running: true);
    while (gen == _gen && state.running) {
      state = state.copyWith(waiting: true);
      try {
        final entry = await ref.read(nfcProvider).useTag(_enrollOne, timeout: const Duration(minutes: 10));
        if (entry == null) continue; // same chip still on the reader
        _push(entry);
        // let the operator lift the tag before the next poll
        await Future<void>.delayed(const Duration(milliseconds: 700));
      } on NfcCancelled {
        // stop() or timeout
      } on NfcUnavailable {
        _push(const EnrollEntry(ok: false, errorCode: 'NFC_UNAVAILABLE'));
        break;
      } catch (_) {
        _push(const EnrollEntry(ok: false, errorCode: 'NFC_ERROR'));
        await Future<void>.delayed(const Duration(seconds: 1));
      }
    }
    state = state.copyWith(running: false, waiting: false);
  }

  Future<void> stop() async {
    _gen++;
    state = state.copyWith(running: false, waiting: false);
    await ref.read(nfcProvider).cancel();
  }

  void _push(EnrollEntry e) {
    state = state.copyWith(
        count: e.ok ? state.count + 1 : state.count, log: [e, ...state.log.take(49)], waiting: false);
  }

  /// One tag, full procedure. Retrying the same chip is safe: the server returns the same
  /// tag_code while it is still `pending`.
  Future<EnrollEntry?> _enrollOne(TagSession t) async {
    if (t.uid == _lastUid) return null;
    final api = ref.read(apiProvider);
    try {
      final sig = await t.readSignature();
      final r = await api.enrollTag(clientTxId: uuid7(), uid: t.uid, chipType: t.chipType, signature: sig);
      await t.writeNdefUrl(r.ndefUrl);
      final back = await t.readNdefUrl();
      final readbackOk = back == r.ndefUrl;
      var prot = false;
      if (readbackOk && r.protection != null && t.canProtect) {
        prot = await t.applyProtection(r.protection!);
      }
      if (!readbackOk) {
        return EnrollEntry(ok: false, tagCode: r.tagCode, uid: t.uid, errorCode: 'READBACK_FAILED');
      }
      await api.confirmTag(r.tagCode,
          clientTxId: uuid7(), uid: t.uid, readbackOk: true, passwordProtected: prot);
      _lastUid = t.uid;
      return EnrollEntry(ok: true, tagCode: r.tagCode, uid: t.uid, protected: prot);
    } on ApiError catch (e) {
      _lastUid = t.uid;
      return EnrollEntry(ok: false, uid: t.uid, errorCode: e.code);
    } on NetworkException {
      return EnrollEntry(ok: false, uid: t.uid, errorCode: 'NETWORK');
    } on NfcTagLost {
      return EnrollEntry(ok: false, uid: t.uid, errorCode: 'TAG_LOST');
    }
  }
}

final enrollProvider = NotifierProvider<EnrollController, EnrollState>(EnrollController.new);
