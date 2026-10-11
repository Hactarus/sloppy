// Hand-written models mirroring jeton/api/openapi.yaml (contract 1.0.0).
// Money = integer euro cents, tokens = integer tokens. No floats.

typedef Json = Map<String, dynamic>;

int _i(Object? v, [int d = 0]) => v == null ? d : (v as num).toInt();
String _s(Object? v, [String d = '']) => v == null ? d : v as String;

class Roles {
  static const admin = 'admin',
      cashier = 'cashier',
      vendor = 'vendor',
      auditor = 'auditor';
}

class StaffPublic {
  final String id, displayName, role;
  const StaffPublic(this.id, this.displayName, this.role);
  factory StaffPublic.fromJson(Json j) =>
      StaffPublic(_s(j['id']), _s(j['display_name']), _s(j['role']));
  Json toJson() => {'id': id, 'display_name': displayName, 'role': role};
}

class Session {
  final StaffPublic staff;
  final String deviceId, eventId, role;
  final String? standId;
  final bool training;
  const Session(this.staff, this.deviceId, this.eventId, this.standId,
      this.role, this.training);
  factory Session.fromJson(Json j) => Session(
        StaffPublic.fromJson(j['staff'] as Json),
        _s(j['device_id']),
        _s(j['event_id']),
        j['stand_id'] as String?,
        _s(j['role']),
        j['training'] == true,
      );
  Json toJson() => {
        'staff': staff.toJson(),
        'device_id': deviceId,
        'event_id': eventId,
        'stand_id': standId,
        'role': role,
        'training': training,
      };
}

class DeviceEnrollment {
  final String deviceId, deviceToken, eventId, kind;
  final String? standId;
  final bool training;
  const DeviceEnrollment(this.deviceId, this.deviceToken, this.eventId,
      this.standId, this.kind, this.training);
  factory DeviceEnrollment.fromJson(Json j) => DeviceEnrollment(
      _s(j['device_id']),
      _s(j['device_token']),
      _s(j['event_id']),
      j['stand_id'] as String?,
      _s(j['kind']),
      j['training'] == true);
}

class LoginResult {
  final String accessToken;
  final DateTime expiresAt;
  final Session session;
  const LoginResult(this.accessToken, this.expiresAt, this.session);
  factory LoginResult.fromJson(Json j) => LoginResult(
      _s(j['access_token']),
      DateTime.parse(_s(j['expires_at'])),
      Session.fromJson(j['session'] as Json));
}

/// Subset of `Event` the terminals need.
class EventConfig {
  final String id, name, country;
  final int tokenPriceCents, offlineCapTokens, maxBalanceTokens, maxTopupTokens;
  final bool tipsEnabled;
  final List<int> tipPresets;
  final int tipMaxTokens, tipMaxPercent;
  final String? termsVersion, status;
  const EventConfig({
    required this.id,
    required this.name,
    this.country = 'BE',
    this.tokenPriceCents = 200,
    this.offlineCapTokens = 10,
    this.maxBalanceTokens = 100,
    this.maxTopupTokens = 50,
    this.tipsEnabled = true,
    this.tipPresets = const [1, 2, 5],
    this.tipMaxTokens = 10,
    this.tipMaxPercent = 50,
    this.termsVersion,
    this.status,
  });
  factory EventConfig.fromJson(Json j) => EventConfig(
        id: _s(j['id']),
        name: _s(j['name']),
        country: _s(j['country'], 'BE'),
        tokenPriceCents: _i(j['token_price_cents'], 200),
        offlineCapTokens: _i(j['offline_cap_tokens'], 10),
        maxBalanceTokens: _i(j['max_balance_tokens'], 100),
        maxTopupTokens: _i(j['max_topup_tokens'], 50),
        tipsEnabled: j['tips_enabled'] != false,
        tipPresets: ((j['tip_presets_tokens'] as List?) ?? const [1, 2, 5])
            .map((e) => _i(e))
            .toList(),
        tipMaxTokens: _i(j['tip_max_tokens'], 10),
        tipMaxPercent: _i(j['tip_max_percent'], 50),
        termsVersion: j['terms_version'] as String?,
        status: j['status'] as String?,
      );
  Json toJson() => {
        'id': id,
        'name': name,
        'country': country,
        'token_price_cents': tokenPriceCents,
        'offline_cap_tokens': offlineCapTokens,
        'max_balance_tokens': maxBalanceTokens,
        'max_topup_tokens': maxTopupTokens,
        'tips_enabled': tipsEnabled,
        'tip_presets_tokens': tipPresets,
        'tip_max_tokens': tipMaxTokens,
        'tip_max_percent': tipMaxPercent,
        'terms_version': termsVersion,
        'status': status,
      };
}

String _i18n(Json? names, String fallback, String lang) {
  final v = names?[lang];
  return v is String && v.isNotEmpty ? v : fallback;
}

class Stand {
  final String id, name, kind;
  final Json? nameI18n;
  final int sortOrder;
  final bool active;
  const Stand(this.id, this.name, this.kind, this.nameI18n, this.sortOrder,
      this.active);
  factory Stand.fromJson(Json j) => Stand(
      _s(j['id']),
      _s(j['name']),
      _s(j['kind'], 'stand'),
      j['name_i18n'] as Json?,
      _i(j['sort_order']),
      j['active'] != false);
  Json toJson() => {
        'id': id,
        'name': name,
        'kind': kind,
        'name_i18n': nameI18n,
        'sort_order': sortOrder,
        'active': active
      };
  String label(String lang) => _i18n(nameI18n, name, lang);
}

class Category {
  final String id, name;
  final Json? nameI18n;
  final int sortOrder;
  final bool active;
  const Category(
      this.id, this.name, this.nameI18n, this.sortOrder, this.active);
  factory Category.fromJson(Json j) => Category(_s(j['id']), _s(j['name']),
      j['name_i18n'] as Json?, _i(j['sort_order']), j['active'] != false);
  Json toJson() => {
        'id': id,
        'name': name,
        'name_i18n': nameI18n,
        'sort_order': sortOrder,
        'active': active
      };
  String label(String lang) => _i18n(nameI18n, name, lang);
}

class Item {
  final String id, standId, categoryId, name, vatCategory;
  final Json? nameI18n;
  final int priceTokens, sortOrder;
  final int? minAge;
  final String? icon, color;
  final bool active;
  const Item({
    required this.id,
    required this.standId,
    required this.categoryId,
    required this.name,
    required this.priceTokens,
    required this.vatCategory,
    this.nameI18n,
    this.minAge,
    this.icon,
    this.color,
    this.sortOrder = 0,
    this.active = true,
  });
  factory Item.fromJson(Json j) => Item(
        id: _s(j['id']),
        standId: _s(j['stand_id']),
        categoryId: _s(j['category_id']),
        name: _s(j['name']),
        nameI18n: j['name_i18n'] as Json?,
        priceTokens: _i(j['price_tokens'], 1),
        vatCategory: _s(j['vat_category']),
        minAge: j['min_age'] == null ? null : _i(j['min_age']),
        icon: j['icon'] as String?,
        color: j['color'] as String?,
        sortOrder: _i(j['sort_order']),
        active: j['active'] != false,
      );
  Json toJson() => {
        'id': id,
        'stand_id': standId,
        'category_id': categoryId,
        'name': name,
        'name_i18n': nameI18n,
        'price_tokens': priceTokens,
        'vat_category': vatCategory,
        'min_age': minAge,
        'icon': icon,
        'color': color,
        'sort_order': sortOrder,
        'active': active,
      };
  String label(String lang) => _i18n(nameI18n, name, lang);
}

class Catalog {
  final EventConfig event;
  final int version;
  final List<Stand> stands;
  final List<Category> categories;
  final List<Item> items;
  const Catalog(
      this.event, this.version, this.stands, this.categories, this.items);
  factory Catalog.fromJson(Json j) => Catalog(
        EventConfig.fromJson(j['event'] as Json),
        _i(j['catalog_version']),
        (j['stands'] as List).map((e) => Stand.fromJson(e as Json)).toList(),
        (j['categories'] as List)
            .map((e) => Category.fromJson(e as Json))
            .toList(),
        (j['items'] as List).map((e) => Item.fromJson(e as Json)).toList(),
      );
  Json toJson() => {
        'event': event.toJson(),
        'catalog_version': version,
        'stands': stands.map((e) => e.toJson()).toList(),
        'categories': categories.map((e) => e.toJson()).toList(),
        'items': items.map((e) => e.toJson()).toList(),
      };
  Item? item(String id) {
    for (final i in items) {
      if (i.id == id) return i;
    }
    return null;
  }
}

class TagRef {
  final String tagCode, uid;
  const TagRef(this.tagCode, this.uid);
  Json toJson() => {'tag_code': tagCode, 'uid': uid};
}

class TagInfo {
  final String tagCode, tagStatus, walletStatus;
  final int balanceTokens;
  final List<String> flags;
  const TagInfo(this.tagCode, this.tagStatus, this.walletStatus,
      this.balanceTokens,
      [this.flags = const []]);
  factory TagInfo.fromJson(Json j) => TagInfo(
      _s(j['tag_code']),
      _s(j['tag_status']),
      _s(j['wallet_status']),
      _i(j['balance_tokens']),
      ((j['flags'] as List?) ?? const []).cast<String>());
}

class Order {
  final String id;
  final int? receiptNo;
  final int journalSeq, itemsTokens, tipTokens, totalTokens, balanceTokens;
  final List<String> flags;
  const Order(this.id, this.receiptNo, this.journalSeq, this.itemsTokens,
      this.tipTokens, this.totalTokens, this.balanceTokens, this.flags);
  factory Order.fromJson(Json j) => Order(
        _s(j['id']),
        j['receipt_no'] == null ? null : _i(j['receipt_no']),
        _i(j['journal_seq']),
        _i(j['items_tokens']),
        _i(j['tip_tokens']),
        _i(j['total_tokens']),
        _i(j['balance_tokens']),
        ((j['flags'] as List?) ?? const []).cast<String>(),
      );
}

class Topup {
  final String id;
  final int tokens, amountCents, balanceTokens;
  final int? receiptNo;
  const Topup(
      this.id, this.tokens, this.amountCents, this.balanceTokens, this.receiptNo);
  factory Topup.fromJson(Json j) => Topup(
      _s(j['id']),
      _i(j['tokens']),
      _i(j['amount_cents']),
      _i(j['balance_tokens']),
      j['receipt_no'] == null ? null : _i(j['receipt_no']));
}

class Cashout {
  final String id;
  final int tokens, amountCents, balanceTokens;
  const Cashout(this.id, this.tokens, this.amountCents, this.balanceTokens);
  factory Cashout.fromJson(Json j) => Cashout(_s(j['id']), _i(j['tokens']),
      _i(j['amount_cents']), _i(j['balance_tokens']));
}

class TagProtection {
  final String pwd, pack;
  final int auth0, authlim;
  const TagProtection(this.pwd, this.pack, this.auth0, this.authlim);
  factory TagProtection.fromJson(Json j) => TagProtection(
      _s(j['pwd']), _s(j['pack']), _i(j['auth0'], 4), _i(j['authlim'], 7));
}

class EnrollTagResult {
  final String tagCode, ndefUrl;
  final TagProtection? protection;
  const EnrollTagResult(this.tagCode, this.ndefUrl, this.protection);
  factory EnrollTagResult.fromJson(Json j) => EnrollTagResult(
      _s(j['tag_code']),
      _s(j['ndef_url']),
      j['protection'] == null
          ? null
          : TagProtection.fromJson(j['protection'] as Json));
}

class PublicRecent {
  final DateTime at;
  final String kind;
  final int deltaTokens;
  final String? standName;
  final int? receiptNo;
  final List<({String name, int qty})> items;
  const PublicRecent(this.at, this.kind, this.deltaTokens, this.standName,
      this.receiptNo, this.items);
  factory PublicRecent.fromJson(Json j) => PublicRecent(
        DateTime.parse(_s(j['at'])),
        _s(j['kind']),
        _i(j['delta_tokens']),
        j['stand_name'] as String?,
        j['receipt_no'] == null ? null : _i(j['receipt_no']),
        ((j['items'] as List?) ?? const [])
            .map((e) => (name: _s((e as Json)['name']), qty: _i(e['qty'])))
            .toList(),
      );
}

class PublicTagPage {
  final String tagCode, status, eventName;
  final String? organizerName, organizerEnterpriseNo, policyVersion, privacyUrl;
  final DateTime? refundableUntil, expiryAt;
  final int balanceTokens, tokenPriceCents;
  final List<PublicRecent> recent;
  const PublicTagPage({
    required this.tagCode,
    required this.status,
    required this.eventName,
    required this.balanceTokens,
    required this.tokenPriceCents,
    required this.recent,
    this.organizerName,
    this.organizerEnterpriseNo,
    this.policyVersion,
    this.privacyUrl,
    this.refundableUntil,
    this.expiryAt,
  });
  factory PublicTagPage.fromJson(Json j) {
    final e = j['event'] as Json;
    DateTime? d(Object? v) => v == null ? null : DateTime.parse(v as String);
    return PublicTagPage(
      tagCode: _s(j['tag_code']),
      status: _s(j['status'], 'active'),
      eventName: _s(e['name']),
      organizerName: e['organizer_name'] as String?,
      organizerEnterpriseNo: e['organizer_enterprise_no'] as String?,
      policyVersion: e['policy_version'] as String?,
      privacyUrl: e['privacy_url'] as String?,
      refundableUntil: d(e['refundable_until']),
      expiryAt: d(e['expiry_at']),
      balanceTokens: _i(j['balance_tokens']),
      tokenPriceCents: _i(j['token_price_cents'], 200),
      recent: ((j['recent'] as List?) ?? const [])
          .map((e) => PublicRecent.fromJson(e as Json))
          .toList(),
    );
  }
}

class DeviceInfo {
  final String id, name, kind;
  final String? standId;
  final bool training;
  final DateTime? revokedAt;
  const DeviceInfo(
      this.id, this.name, this.kind, this.standId, this.training, this.revokedAt);
  factory DeviceInfo.fromJson(Json j) => DeviceInfo(
      _s(j['id']),
      _s(j['name']),
      _s(j['kind']),
      j['stand_id'] as String?,
      j['training'] == true,
      j['revoked_at'] == null ? null : DateTime.parse(j['revoked_at'] as String));
}

class ReportRow {
  final String key, label;
  final int qty, tokens, grossCents;
  const ReportRow(this.key, this.label, this.qty, this.tokens, this.grossCents);
  factory ReportRow.fromJson(Json j) => ReportRow(_s(j['key']),
      _s(j['label'], _s(j['key'])), _i(j['qty']), _i(j['tokens']), _i(j['gross_cents']));
}

class Liability {
  final int outstandingTokens,
      outstandingCents,
      wallets,
      negativeWallets,
      tipsPayableTokens;
  const Liability(this.outstandingTokens, this.outstandingCents, this.wallets,
      this.negativeWallets, this.tipsPayableTokens);
  factory Liability.fromJson(Json j) => Liability(
      _i(j['outstanding_tokens']),
      _i(j['outstanding_cents']),
      _i(j['wallets_with_balance']),
      _i(j['negative_wallets']),
      _i(j['tips_payable_tokens']));
}

class TopupMethodRow {
  final String method;
  final int count, grossCents, tokens;
  const TopupMethodRow(this.method, this.count, this.grossCents, this.tokens);
  factory TopupMethodRow.fromJson(Json j) => TopupMethodRow(_s(j['payment_method']),
      _i(j['count']), _i(j['gross_cents']), _i(j['tokens']));
}

/// Error body (`Error` schema) as an exception. Switch on [code], never on [message].
class ApiError implements Exception {
  final String code, message;
  final int status;
  final bool retryable;
  final Json details;
  const ApiError(this.code, this.message, this.status,
      {this.retryable = false, this.details = const {}});
  factory ApiError.fromJson(Json j, int status) => ApiError(
      _s(j['code'], 'UNKNOWN'), _s(j['message']), status,
      retryable: j['retryable'] == true,
      details: (j['details'] as Json?) ?? const {});
  @override
  String toString() => 'ApiError($status $code: $message)';
}

class SyncItemResult {
  final String clientTxId, status; // applied | duplicate | rejected
  final List<String> flags;
  final ApiError? error;
  const SyncItemResult(this.clientTxId, this.status, this.flags, this.error);
  factory SyncItemResult.fromJson(Json j) => SyncItemResult(
        _s(j['client_tx_id']),
        _s(j['status']),
        ((j['flags'] as List?) ?? const []).cast<String>(),
        j['error'] == null ? null : ApiError.fromJson(j['error'] as Json, 200),
      );
}

/// No connectivity / timeout: the caller may queue the operation (same client_tx_id).
class NetworkException implements Exception {
  final String message;
  const NetworkException([this.message = 'network unreachable']);
  @override
  String toString() => 'NetworkException($message)';
}
