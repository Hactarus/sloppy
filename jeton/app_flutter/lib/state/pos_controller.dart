import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import '../nfc/nfc_service.dart';
import '../offline/queue.dart';
import '../util.dart';
import 'providers.dart';

enum ResultKind { success, error, queued }

/// Outcome shown full-screen (icon + colour + text, never colour alone).
class PosResult {
  const PosResult.success({required this.totalTokens, required this.balance, this.receiptNo, this.flags = const []})
      : kind = ResultKind.success,
        code = null,
        details = const {},
        provisionalRef = null,
        remainingCap = null;
  const PosResult.queued({required this.totalTokens, required this.provisionalRef, required this.remainingCap})
      : kind = ResultKind.queued,
        balance = null,
        receiptNo = null,
        code = null,
        details = const {},
        flags = const [];
  const PosResult.error(this.code, {this.details = const {}, this.totalTokens = 0})
      : kind = ResultKind.error,
        balance = null,
        receiptNo = null,
        provisionalRef = null,
        remainingCap = null,
        flags = const [];

  final ResultKind kind;
  final int totalTokens;
  final int? balance, receiptNo, remainingCap;
  final String? code, provisionalRef;
  final Json details;
  final List<String> flags;
}

enum PosPhase { idle, armed, processing }

class PosState {
  const PosState({
    this.lines = const {},
    this.tip = 0,
    this.phase = PosPhase.idle,
    this.result,
    this.last = const {},
  });
  final Map<String, int> lines; // item_id -> qty (insertion ordered)
  final int tip; // default 0, never pre-selected
  final PosPhase phase;
  final PosResult? result;
  final Map<String, int> last; // last successfully paid basket (for "repeat")

  PosState copyWith({Map<String, int>? lines, int? tip, PosPhase? phase, PosResult? result, bool clearResult = false, Map<String, int>? last}) =>
      PosState(
        lines: lines ?? this.lines,
        tip: tip ?? this.tip,
        phase: phase ?? this.phase,
        result: clearResult ? null : (result ?? this.result),
        last: last ?? this.last,
      );
}

class PosController extends Notifier<PosState> {
  @override
  PosState build() => const PosState();

  Catalog? get _catalog => ref.read(catalogProvider).catalog;

  int itemsTokens(PosState s) {
    final c = _catalog;
    if (c == null) return 0;
    var t = 0;
    s.lines.forEach((id, q) => t += (c.item(id)?.priceTokens ?? 0) * q);
    return t;
  }

  int total(PosState s) => itemsTokens(s) + s.tip;

  /// Largest tip allowed by the event (`tip_max_tokens`, `tip_max_percent` of the items).
  int maxTip(PosState s) {
    final e = _catalog?.event;
    if (e == null || !e.tipsEnabled) return 0;
    final byPercent = itemsTokens(s) * e.tipMaxPercent ~/ 100;
    return byPercent < e.tipMaxTokens ? byPercent : e.tipMaxTokens;
  }

  bool get busy => state.phase != PosPhase.idle;

  // ---- basket editing: one tap per item ----
  void add(String itemId) {
    if (busy) return;
    final l = Map.of(state.lines);
    l[itemId] = ((l[itemId] ?? 0) + 1).clamp(1, 99);
    state = state.copyWith(lines: l);
  }

  void remove(String itemId) {
    if (busy) return;
    final l = Map.of(state.lines);
    final q = (l[itemId] ?? 0) - 1;
    if (q <= 0) {
      l.remove(itemId);
    } else {
      l[itemId] = q;
    }
    _setLines(l);
  }

  void setQty(String itemId, int qty) {
    if (busy) return;
    final l = Map.of(state.lines);
    if (qty <= 0) {
      l.remove(itemId);
    } else {
      l[itemId] = qty.clamp(1, 99);
    }
    _setLines(l);
  }

  void _setLines(Map<String, int> l) {
    var s = state.copyWith(lines: l);
    final max = maxTip(s);
    if (s.tip > max) s = s.copyWith(tip: max); // keep the tip valid when the basket shrinks
    state = s;
  }

  void clear() {
    if (busy) return;
    state = state.copyWith(lines: {}, tip: 0);
  }

  void repeatLast() {
    if (busy || state.last.isEmpty) return;
    state = state.copyWith(lines: Map.of(state.last), tip: 0);
  }

  void setTip(int t) {
    if (busy) return;
    state = state.copyWith(tip: t.clamp(0, maxTip(state)));
  }

  void dismissResult() => state = state.copyWith(clearResult: true);

  Future<void> cancel() async {
    await ref.read(nfcProvider).cancel();
  }

  String? standId() {
    final s = ref.read(authProvider).session;
    final c = _catalog;
    return s?.standId ?? ref.read(selectedStandProvider) ?? c?.stands.where((x) => x.kind == 'stand').firstOrNull?.id;
  }

  bool needsAgeCheck() {
    final c = _catalog;
    if (c == null) return false;
    return state.lines.keys.any((id) => c.item(id)?.minAge != null);
  }

  /// Arms NFC, charges on the tap. One request = one confirmed payment (API `createOrder`).
  Future<void> pay({bool ageChecked = false}) async {
    final catalog = _catalog;
    final session = ref.read(authProvider).session;
    final stand = standId();
    if (busy || catalog == null || session == null || stand == null || state.lines.isEmpty) return;
    final snapshot = state;
    final totalTokens = total(snapshot);
    state = state.copyWith(phase: PosPhase.armed);

    TagReading tag;
    try {
      tag = await ref.read(nfcProvider).readTag();
    } on NfcCancelled {
      state = state.copyWith(phase: PosPhase.idle);
      return;
    } on NfcUnavailable {
      state = state.copyWith(phase: PosPhase.idle, result: const PosResult.error('NFC_UNAVAILABLE'));
      return;
    } catch (_) {
      state = state.copyWith(phase: PosPhase.idle, result: const PosResult.error('NFC_ERROR'));
      return;
    }
    state = state.copyWith(phase: PosPhase.processing);

    final tagCode = tagCodeFromUrl(tag.ndefUrl);
    if (tagCode == null || !isValidUid(tag.uid)) {
      state = state.copyWith(phase: PosPhase.idle, result: const PosResult.error('TAG_NOT_FOUND'));
      return;
    }

    // The idempotency key is fixed at tap time: if the response is lost, the same key is queued.
    final body = <String, dynamic>{
      'client_tx_id': uuid7(),
      'stand_id': stand,
      'tag': TagRef(tagCode, tag.uid).toJson(),
      'lines': [
        for (final e in snapshot.lines.entries) {'item_id': e.key, 'qty': e.value}
      ],
      'tip_tokens': snapshot.tip,
      'expected_total_tokens': totalTokens,
      'expected_catalog_version': catalog.version,
      'age_check_confirmed': ageChecked,
      'client_created_at': DateTime.now().toUtc().toIso8601String(),
    };

    PosResult result;
    var paid = false;
    try {
      final o = await ref.read(apiProvider).createOrder(body);
      paid = true;
      result = PosResult.success(totalTokens: o.totalTokens, balance: o.balanceTokens, receiptNo: o.receiptNo, flags: o.flags);
    } on NetworkException {
      result = await _queueOffline(body, session, tagCode, totalTokens, catalog.event.offlineCapTokens);
      paid = result.kind == ResultKind.queued;
    } on ApiError catch (e) {
      if (e.code == 'PRICE_MISMATCH') await ref.read(catalogProvider.notifier).refresh();
      if (e.status == 401 && e.code != 'INVALID_CREDENTIALS') {
        await ref.read(authProvider.notifier).sessionExpired();
      }
      result = PosResult.error(e.code, details: e.details, totalTokens: totalTokens);
    }

    state = state.copyWith(
      phase: PosPhase.idle,
      result: result,
      lines: paid ? <String, int>{} : null,
      tip: paid ? 0 : null,
      last: paid ? Map.of(snapshot.lines) : null,
    );
  }

  Future<PosResult> _queueOffline(Json body, Session session, String tagCode, int totalTokens, int cap) async {
    final q = ref.read(queueProvider.notifier);
    if (!offlineCapAllows(ref.read(queueProvider), tagCode, totalTokens, cap)) {
      return PosResult.error('OFFLINE_CAP',
          details: {'cap': cap, 'spent': q.spent(tagCode)}, totalTokens: totalTokens);
    }
    final prov = q.nextProvisionalRef();
    final payload = {...body, 'provisional_ref': prov};
    await q.add(QueueItem(
      clientTxId: body['client_tx_id'] as String,
      type: 'order',
      staffId: session.staff.id,
      provisionalRef: prov,
      payload: payload,
      tagCode: tagCode,
      tokens: totalTokens,
      createdAt: DateTime.now(),
    ));
    return PosResult.queued(
        totalTokens: totalTokens, provisionalRef: prov, remainingCap: cap - q.spent(tagCode));
  }
}

final posProvider = NotifierProvider<PosController, PosState>(PosController.new);
