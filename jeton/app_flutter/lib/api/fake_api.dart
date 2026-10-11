import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../config.dart';
import '../models/models.dart';
import '../util.dart';
import 'demo_data.dart';
import 'jeton_api.dart';

class _FakeTag {
  _FakeTag(this.code, this.uid, this.balance, {this.status = 'active'});
  final String code, uid;
  String status; // pending | active | retired
  bool blocked = false;
  int balance;
  bool hasWallet = true;
  final List<Json> history = [];
}

/// In-memory implementation of the contract: prices from its own catalog, balance
/// check, UID binding, idempotent `client_tx_id`, batch sync with flags, PIN lockout.
/// Enough to exercise every client flow without a backend.
class FakeApi extends JetonApi {
  FakeApi({this.latency = const Duration(milliseconds: 60)}) {
    for (final t in demoTags) {
      _tags[t.code] = _FakeTag(t.code, t.uid, t.balance)
        ..history.add(_hist('topup', t.balance, t.balance, null));
    }
  }

  final Duration latency;

  /// Toggle to simulate losing connectivity (the UI exposes a switch in fake mode).
  final ValueNotifier<bool> networkUp = ValueNotifier(true);

  final _rnd = Random();
  final Map<String, _FakeTag> _tags = {};
  final Map<String, (String, Json)> _idem = {}; // client_tx_id -> (body hash, result)
  final Map<String, int> _badPins = {};
  final Map<String, DateTime> _locked = {};
  final List<Json> _orders = [];
  final List<Json> _topups = [];
  final List<DeviceInfo> _devices = [];
  int _catalogVersion = 1;
  int _journalSeq = 1000;
  final Map<String, int> _receiptNo = {};
  final _enrolCodes = <String>{'DEMO2026'};

  // ---- helpers ----
  Future<void> _guard() async {
    await Future<void>.delayed(latency);
    if (!networkUp.value) {
      onReachability?.call(false);
      throw const NetworkException('simulated offline');
    }
    onReachability?.call(true);
  }

  Never _err(String code, int status, String msg, {Json? details, bool retry = false}) =>
      throw ApiError(code, msg, status, details: details ?? const {}, retryable: retry);

  Session? get _session => _sessionFromJwt(jwt);

  Session _need([Set<String>? roles]) {
    final s = _session;
    if (s == null) _err('UNAUTHENTICATED', 401, 'login required');
    if (roles != null && !roles.contains(s.role)) _err('FORBIDDEN', 403, 'role ${s.role}');
    return s;
  }

  final Map<String, Session> _jwts = {};
  Session? _sessionFromJwt(String? t) => t == null ? null : _jwts[t];

  Json _hist(String kind, int delta, int after, String? stand,
          {int? receipt, List<Json> items = const []}) =>
      {
        'at': DateTime.now().toUtc().toIso8601String(),
        'kind': kind,
        'delta_tokens': delta,
        'balance_after_tokens': after,
        'stand_name': stand,
        'receipt_no': receipt,
        'items': items,
      };

  int _nextReceipt(String stand) => _receiptNo[stand] = (_receiptNo[stand] ?? 0) + 1;

  String _newCode() {
    const a = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    final c = List.generate(19, (_) => a[_rnd.nextInt(a.length)]).join();
    return '$c${_rnd.nextBool() ? '0' : 'G'}';
  }

  Catalog get _catalog => demoCatalog(_catalogVersion);

  // ---- system / auth ----
  @override
  Future<void> health() => _guard();

  @override
  Future<DeviceEnrollment> enrollDevice({required String code, required String deviceName}) async {
    await _guard();
    final c = code.trim().toUpperCase();
    if (!_enrolCodes.remove(c) && c != 'DEMO2026') {
      _err('ENROLLMENT_CODE_INVALID', 410, 'code expired or used');
    }
    final id = uuid7();
    final training = c == 'TRAIN000';
    _devices.add(DeviceInfo(id, deviceName, 'terminal', null, training, null));
    return DeviceEnrollment(id, 'fake-device-token-$id', demoEventId, null, 'terminal', training);
  }

  @override
  Future<List<StaffPublic>> listLoginStaff() async {
    await _guard();
    if (deviceToken == null) _err('UNAUTHENTICATED', 401, 'device token');
    return [for (final s in demoStaff) StaffPublic(s.$1, s.$2, s.$3)];
  }

  @override
  Future<LoginResult> login(String staffId, String pin) async {
    await _guard();
    final locked = _locked[staffId];
    if (locked != null && locked.isAfter(DateTime.now())) {
      _err('PIN_LOCKED', 429, 'locked', details: {'locked_until': locked.toIso8601String()});
    }
    final s = demoStaff.where((e) => e.$1 == staffId).firstOrNull;
    if (s == null || s.$4 != pin) {
      final n = (_badPins[staffId] ?? 0) + 1;
      _badPins[staffId] = n;
      if (n >= 5) {
        _locked[staffId] = DateTime.now().add(const Duration(minutes: 15));
        _badPins[staffId] = 0;
        _err('PIN_LOCKED', 429, 'locked',
            details: {'locked_until': _locked[staffId]!.toUtc().toIso8601String()});
      }
      _err('INVALID_CREDENTIALS', 401, 'wrong pin');
    }
    _badPins[staffId] = 0;
    final dev = _devices.isEmpty ? null : _devices.last;
    final session = Session(StaffPublic(s.$1, s.$2, s.$3), dev?.id ?? 'dev', demoEventId, s.$5, s.$3,
        dev?.training ?? false);
    final token = 'fake-jwt-${uuid7()}';
    _jwts[token] = session;
    return LoginResult(token, DateTime.now().add(const Duration(hours: 12)), session);
  }

  // ---- catalog ----
  @override
  Future<Catalog?> getCatalog(String eventId, {int? knownVersion}) async {
    await _guard();
    _need();
    if (knownVersion == _catalogVersion) return null;
    return _catalog;
  }

  /// Test hook: bump catalog version (e.g. to provoke PRICE_MISMATCH).
  void bumpCatalog() => _catalogVersion++;

  // ---- tags ----
  _FakeTag _tag(TagRef r, {bool checkUid = true}) {
    final t = _tags[r.tagCode];
    if (t == null || t.status == 'retired') _err('TAG_NOT_FOUND', 404, 'unknown tag');
    if (t.status == 'pending') _err('TAG_NOT_ACTIVE', 409, 'tag not active');
    if (checkUid && t.uid != r.uid) _err('TAG_UID_MISMATCH', 409, 'uid mismatch');
    return t;
  }

  TagInfo _info(_FakeTag t) => TagInfo(t.code, t.status,
      t.blocked ? 'blocked' : (t.hasWallet ? 'active' : 'new'), t.balance);

  @override
  Future<TagInfo> lookupTag(TagRef tag) async {
    await _guard();
    final s = _need();
    final t = _tag(tag);
    if (t.blocked && s.role != Roles.admin && s.role != Roles.cashier) {
      _err('TAG_BLOCKED', 423, 'blocked');
    }
    return _info(t);
  }

  @override
  Future<EnrollTagResult> enrollTag(
      {required String clientTxId, required String uid, required String chipType, String? signature}) async {
    await _guard();
    _need({Roles.admin, Roles.cashier});
    for (final t in _tags.values) {
      if (t.uid == uid) {
        if (t.status == 'pending') return _enrollResult(t);
        _err('TAG_ALREADY_ENROLLED', 409, 'already enrolled');
      }
    }
    final t = _FakeTag(_newCode(), uid, 0, status: 'pending')..hasWallet = false;
    _tags[t.code] = t;
    return _enrollResult(t);
  }

  EnrollTagResult _enrollResult(_FakeTag t) {
    final h = uid2pwd(t.uid);
    return EnrollTagResult(t.code, 'https://$publicHost/t/${t.code}',
        TagProtection(h.substring(0, 8), h.substring(8, 12), 4, 7));
  }

  @visibleForTesting
  static String uid2pwd(String uid) {
    final d = sha1ish(uid);
    return d.substring(0, 12);
  }

  @override
  Future<TagInfo> confirmTag(String tagCode,
      {required String clientTxId,
      required String uid,
      required bool readbackOk,
      required bool passwordProtected}) async {
    await _guard();
    _need({Roles.admin, Roles.cashier});
    final t = _tags[tagCode];
    if (t == null || t.uid != uid) _err('TAG_NOT_FOUND', 404, 'unknown tag');
    if (!readbackOk) _err('VALIDATION_ERROR', 400, 'readback failed');
    t.status = 'active';
    return _info(t);
  }

  @override
  Future<int> countActiveTags(String eventId) async {
    await _guard();
    return _tags.values.where((t) => t.status == 'active').length - demoTags.length;
  }

  // ---- money ----
  Future<T> _idempotent<T>(Json body, T Function(Json) parse, Json Function() run) {
    final id = body['client_tx_id'] as String?;
    if (id == null) _err('VALIDATION_ERROR', 400, 'client_tx_id required');
    final h = jsonEncode(body);
    final prev = _idem[id];
    if (prev != null) {
      if (prev.$1 != h) _err('DUPLICATE_TX', 409, 'same client_tx_id, different body');
      return Future.value(parse(prev.$2));
    }
    final res = run();
    _idem[id] = (h, res);
    return Future.value(parse(res));
  }

  /// Applies an order; [late] = from sync batch (accept and flag instead of rejecting).
  Json _applyOrder(Json b, Session s, {bool late = false}) {
    final cat = _catalog;
    final standId = b['stand_id'] as String;
    final tagRef = b['tag'] as Json;
    final ref = TagRef(tagRef['tag_code'] as String, tagRef['uid'] as String);
    final flags = <String>[];
    final t = _tags[ref.tagCode];
    if (t == null || t.status != 'active') _err('TAG_NOT_FOUND', 404, 'unknown tag');
    if (t.uid != ref.uid) {
      if (!late) _err('TAG_UID_MISMATCH', 409, 'uid mismatch');
      flags.add('TAG_UID_MISMATCH');
    }
    if (t.blocked) {
      if (!late) _err('TAG_BLOCKED', 423, 'blocked');
      flags.add('TAG_BLOCKED_AT_SYNC');
    }
    if (s.role == Roles.vendor && s.standId != standId) _err('STAND_MISMATCH', 403, 'other stand');
    var itemsTokens = 0;
    final lines = <Json>[];
    var needAge = false;
    var n = 0;
    for (final l in (b['lines'] as List)) {
      final item = cat.item((l as Json)['item_id'] as String);
      if (item == null || !item.active) _err('ITEM_NOT_FOUND', 422, 'item');
      final qty = (l['qty'] as num).toInt();
      itemsTokens += item.priceTokens * qty;
      if (item.minAge != null) needAge = true;
      lines.add({
        'line_no': ++n,
        'item_id': item.id,
        'item_name': item.name,
        'qty': qty,
        'unit_price_tokens': item.priceTokens,
        'tokens': item.priceTokens * qty,
      });
    }
    if (needAge && b['age_check_confirmed'] != true) _err('AGE_CHECK_REQUIRED', 422, 'age check');
    final tip = ((b['tip_tokens'] as num?) ?? 0).toInt();
    final ev = cat.event;
    if (tip > 0) {
      if (!ev.tipsEnabled) _err('TIP_DISABLED', 422, 'tips off');
      if (tip > ev.tipMaxTokens || tip * 100 > itemsTokens * ev.tipMaxPercent) {
        _err('TIP_TOO_HIGH', 422, 'tip too high');
      }
    }
    final total = itemsTokens + tip;
    final expected = (b['expected_total_tokens'] as num?)?.toInt();
    if (!late && expected != null && expected != total) {
      _err('PRICE_MISMATCH', 409, 'prices changed',
          details: {'catalog_version': _catalogVersion, 'total_tokens': total});
    }
    if (t.balance < total) {
      if (!late) {
        _err('INSUFFICIENT_BALANCE', 409, 'balance too low',
            details: {'balance_tokens': t.balance, 'required_tokens': total});
      }
      flags.add('NEGATIVE_BALANCE');
    }
    t.balance -= total;
    final standName = cat.stands.firstWhere((x) => x.id == standId).name;
    final receipt = _nextReceipt(standId);
    t.history.add(_hist('sale', -total, t.balance, standName, receipt: receipt));
    final order = <String, dynamic>{
      'id': uuid7(),
      'kind': 'sale',
      'journal_seq': ++_journalSeq,
      'receipt_no': receipt,
      'provisional_ref': b['provisional_ref'],
      'stand_id': standId,
      'tag_code': t.code,
      'lines': lines,
      'items_tokens': itemsTokens,
      'tip_tokens': tip,
      'total_tokens': total,
      'balance_tokens': t.balance,
      'flags': flags,
      'business_date': DateTime.now().toIso8601String().substring(0, 10),
      'created_at': DateTime.now().toUtc().toIso8601String(),
    };
    _orders.add(order);
    return order;
  }

  @override
  Future<Order> createOrder(Json body) async {
    await _guard();
    final s = _need({Roles.admin, Roles.vendor});
    return _idempotent(body, Order.fromJson, () => _applyOrder(body, s));
  }

  @override
  Future<Topup> createTopup(Json body) async {
    await _guard();
    _need({Roles.admin, Roles.cashier});
    return _idempotent(body, Topup.fromJson, () {
      final ev = _catalog.event;
      final ref = body['tag'] as Json;
      final t = _tag(TagRef(ref['tag_code'] as String, ref['uid'] as String));
      final method = body['payment_method'] as String;
      final amount = (body['amount_cents'] as num).toInt();
      if (amount <= 0 || amount % ev.tokenPriceCents != 0) _err('INVALID_AMOUNT', 422, 'not a multiple');
      final tokens = amount ~/ ev.tokenPriceCents;
      if (tokens > ev.maxTopupTokens) {
        _err('LIMIT_EXCEEDED', 422, 'limit', details: {'limit': ev.maxTopupTokens, 'would_be': tokens});
      }
      if (t.balance + tokens > ev.maxBalanceTokens) {
        _err('LIMIT_EXCEEDED', 422, 'limit',
            details: {'limit': ev.maxBalanceTokens, 'would_be': t.balance + tokens});
      }
      final ext = body['external_ref'] as String?;
      if (method != 'cash' && method != 'promo' && (ext == null || ext.isEmpty)) {
        _err('EXTERNAL_REF_REQUIRED', 422, 'external_ref');
      }
      if (ext != null && ext.isNotEmpty &&
          _topups.any((x) => x['payment_method'] == method && x['external_ref'] == ext)) {
        _err('EXTERNAL_REF_ALREADY_USED', 409, 'ref used');
      }
      t.balance += tokens;
      t.hasWallet = true;
      final receipt = _nextReceipt('cashdesk');
      t.history.add(_hist('topup', tokens, t.balance, null, receipt: receipt));
      final res = {
        'id': uuid7(),
        'journal_seq': ++_journalSeq,
        'receipt_no': receipt,
        'tag_code': t.code,
        'payment_method': method,
        'external_ref': ext,
        'amount_cents': amount,
        'tokens': tokens,
        'token_price_cents': ev.tokenPriceCents,
        'balance_tokens': t.balance,
      };
      _topups.add(res);
      return res;
    });
  }

  @override
  Future<Cashout> createCashout(Json body) async {
    await _guard();
    _need({Roles.admin, Roles.cashier});
    return _idempotent(body, Cashout.fromJson, () {
      final ref = body['tag'] as Json;
      final t = _tag(TagRef(ref['tag_code'] as String, ref['uid'] as String));
      final tokens = (body['tokens'] as num?)?.toInt() ?? t.balance;
      if (tokens <= 0 || tokens > t.balance) {
        _err('INSUFFICIENT_BALANCE', 409, 'balance',
            details: {'balance_tokens': t.balance, 'required_tokens': tokens});
      }
      t.balance -= tokens;
      t.history.add(_hist('cashout', -tokens, t.balance, null));
      return {
        'id': uuid7(),
        'tokens': tokens,
        'amount_cents': tokens * _catalog.event.tokenPriceCents,
        'balance_tokens': t.balance,
      };
    });
  }

  @override
  Future<List<SyncItemResult>> syncBatch(String batchId, List<Json> items) async {
    await _guard();
    if (deviceToken == null) _err('UNAUTHENTICATED', 401, 'device token');
    final out = <SyncItemResult>[];
    for (final it in items) {
      final payload = it['payload'] as Json;
      final id = payload['client_tx_id'] as String;
      final staff = demoStaff.where((e) => e.$1 == it['staff_id']).firstOrNull;
      try {
        if (it['type'] != 'order') _err('OFFLINE_NOT_ALLOWED', 422, 'type');
        if (staff == null) _err('FORBIDDEN', 403, 'staff');
        final s = Session(StaffPublic(staff.$1, staff.$2, staff.$3), 'dev', demoEventId, staff.$5, staff.$3, false);
        final prev = _idem[id];
        final h = jsonEncode(payload);
        if (prev != null) {
          if (prev.$1 != h) _err('DUPLICATE_TX', 409, 'different body');
          out.add(SyncItemResult(id, 'duplicate', const [], null));
          continue;
        }
        final res = _applyOrder(payload, s, late: true);
        _idem[id] = (h, res);
        out.add(SyncItemResult(id, 'applied', ((res['flags'] as List).cast<String>()), null));
      } on ApiError catch (e) {
        out.add(SyncItemResult(id, 'rejected', const [], e));
      }
    }
    return out;
  }

  // ---- public ----
  @override
  Future<PublicTagPage> getPublicTagPage(String tagCode) async {
    await _guard();
    final t = _tags[tagCode];
    if (t == null || t.status != 'active') _err('NOT_FOUND', 404, 'unknown');
    final ev = _catalog.event;
    return PublicTagPage(
      tagCode: t.code,
      status: t.blocked ? 'blocked' : 'active',
      eventName: ev.name,
      organizerName: 'ASBL Fête du Quartier',
      organizerEnterpriseNo: 'BE 0123.456.789',
      policyVersion: 'policy-2026-07',
      privacyUrl: 'https://$publicHost/privacy',
      refundableUntil: DateTime.now().add(const Duration(days: 14)),
      balanceTokens: t.balance,
      tokenPriceCents: ev.tokenPriceCents,
      recent: [
        for (final h in t.history.reversed.take(20))
          PublicRecent(DateTime.parse(h['at'] as String), h['kind'] as String,
              h['delta_tokens'] as int, h['stand_name'] as String?, h['receipt_no'] as int?, const [])
      ],
    );
  }

  // ---- admin ----
  @override
  Future<List<DeviceInfo>> listDevices(String eventId) async {
    await _guard();
    _need({Roles.admin, Roles.auditor});
    return List.of(_devices);
  }

  @override
  Future<String> createEnrollmentCode(String eventId,
      {required String kind, String? standId, bool training = false}) async {
    await _guard();
    _need({Roles.admin});
    const a = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    final c = List.generate(8, (_) => a[_rnd.nextInt(a.length)]).join();
    _enrolCodes.add(c);
    return c;
  }

  @override
  Future<List<ReportRow>> salesReport(String eventId, String groupBy) async {
    await _guard();
    _need({Roles.admin, Roles.auditor});
    final byItem = <String, ({int qty, int tokens})>{};
    for (final o in _orders) {
      for (final l in (o['lines'] as List)) {
        final k = (l as Json)['item_name'] as String;
        final p = byItem[k] ?? (qty: 0, tokens: 0);
        byItem[k] = (qty: p.qty + (l['qty'] as int), tokens: p.tokens + (l['tokens'] as int));
      }
    }
    final price = _catalog.event.tokenPriceCents;
    return [
      for (final e in byItem.entries)
        ReportRow(e.key, e.key, e.value.qty, e.value.tokens, e.value.tokens * price)
    ];
  }

  @override
  Future<Liability> liability(String eventId) async {
    await _guard();
    _need({Roles.admin, Roles.auditor});
    final w = _tags.values.where((t) => t.status == 'active');
    final tokens = w.fold<int>(0, (a, t) => a + t.balance);
    return Liability(tokens, tokens * _catalog.event.tokenPriceCents, w.where((t) => t.balance > 0).length,
        w.where((t) => t.balance < 0).length,
        _orders.fold<int>(0, (a, o) => a + (o['tip_tokens'] as int)));
  }

  @override
  Future<List<TopupMethodRow>> topupsReport(String eventId) async {
    await _guard();
    _need({Roles.admin, Roles.auditor});
    final m = <String, TopupMethodRow>{};
    for (final t in _topups) {
      final k = t['payment_method'] as String;
      final p = m[k];
      m[k] = TopupMethodRow(k, (p?.count ?? 0) + 1, (p?.grossCents ?? 0) + (t['amount_cents'] as int),
          (p?.tokens ?? 0) + (t['tokens'] as int));
    }
    return m.values.toList();
  }
}

/// Tiny deterministic hash used only to fake NTAG password material in demo mode.
String sha1ish(String s) {
  var h = 0x811C9DC5;
  final out = StringBuffer();
  for (var round = 0; round < 4; round++) {
    for (final c in s.codeUnits) {
      h = ((h ^ (c + round)) * 0x01000193) & 0xFFFFFFFF;
    }
    out.write(h.toRadixString(16).padLeft(8, '0'));
  }
  return out.toString().toUpperCase();
}
