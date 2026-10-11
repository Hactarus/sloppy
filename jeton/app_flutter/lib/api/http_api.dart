import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../config.dart';
import '../models/models.dart';
import 'jeton_api.dart';

enum _Auth { none, device, staff }

/// Real HTTP implementation of the contract.
class HttpApi extends JetonApi {
  HttpApi(String baseUrl, {Dio? dio})
      : _dio = dio ??
            Dio(BaseOptions(
              baseUrl: baseUrl.endsWith('/') ? baseUrl : '$baseUrl/',
              connectTimeout: const Duration(seconds: 4),
              sendTimeout: const Duration(seconds: 6),
              receiveTimeout: const Duration(seconds: 8),
              headers: {'Accept': 'application/json'},
            ));

  final Dio _dio;

  String get _platform {
    if (kIsWeb) return 'web';
    return defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
  }

  Future<Response<dynamic>> _send(String method, String path,
      {Object? data,
      Map<String, dynamic>? query,
      _Auth auth = _Auth.staff,
      Map<String, String>? headers,
      bool allow304 = false}) async {
    final h = <String, String>{...?headers};
    final token = switch (auth) {
      _Auth.none => null,
      _Auth.device => deviceToken,
      _Auth.staff => jwt ?? deviceToken,
    };
    if (token != null) h['Authorization'] = 'Bearer $token';
    try {
      final r = await _dio.request<dynamic>(
        path.startsWith('/') ? path.substring(1) : path,
        data: data,
        queryParameters: query,
        options: Options(
          method: method,
          headers: h,
          validateStatus: (s) => s != null && (s < 300 || (allow304 && s == 304)),
        ),
      );
      onReachability?.call(true);
      return r;
    } on DioException catch (e) {
      final resp = e.response;
      if (resp == null) {
        onReachability?.call(false);
        throw NetworkException(e.message ?? e.type.name);
      }
      onReachability?.call(true);
      final body = resp.data;
      final status = resp.statusCode ?? 0;
      if (body is Map<String, dynamic> && body['code'] is String) {
        throw ApiError.fromJson(body, status);
      }
      // 5xx without an Error body (proxy etc.): treat as unreachable so the op can be queued.
      if (status >= 500) throw NetworkException('HTTP $status');
      throw ApiError('HTTP_$status', e.message ?? '', status);
    }
  }

  Json _obj(Response<dynamic> r) => r.data as Json;

  @override
  Future<void> health() async => _send('GET', '/health', auth: _Auth.none);

  @override
  Future<DeviceEnrollment> enrollDevice(
      {required String code, required String deviceName}) async {
    final r = await _send('POST', '/auth/devices/enroll',
        auth: _Auth.none,
        data: {
          'enrollment_code': code.trim().toUpperCase(),
          'device_name': deviceName,
          'platform': _platform,
          'app_version': appVersion,
        });
    return DeviceEnrollment.fromJson(_obj(r));
  }

  @override
  Future<List<StaffPublic>> listLoginStaff() async {
    final r = await _send('GET', '/auth/staff', auth: _Auth.device);
    return (_obj(r)['items'] as List)
        .map((e) => StaffPublic.fromJson(e as Json))
        .toList();
  }

  @override
  Future<LoginResult> login(String staffId, String pin) async {
    final r = await _send('POST', '/auth/login',
        auth: _Auth.device, data: {'staff_id': staffId, 'pin': pin});
    return LoginResult.fromJson(_obj(r));
  }

  @override
  Future<Catalog?> getCatalog(String eventId, {int? knownVersion}) async {
    final r = await _send('GET', '/events/$eventId/catalog',
        allow304: true,
        headers: {if (knownVersion != null) 'If-None-Match': '"$knownVersion"'});
    if (r.statusCode == 304) return null;
    return Catalog.fromJson(_obj(r));
  }

  @override
  Future<TagInfo> lookupTag(TagRef tag) async => TagInfo.fromJson(_obj(
      await _send('GET', '/tags/${tag.tagCode}', query: {'uid': tag.uid})));

  @override
  Future<EnrollTagResult> enrollTag(
      {required String clientTxId,
      required String uid,
      required String chipType,
      String? signature}) async {
    final r = await _send('POST', '/tags/enroll', data: {
      'client_tx_id': clientTxId,
      'uid': uid,
      'chip_type': chipType,
      'signature': signature,
    });
    return EnrollTagResult.fromJson(_obj(r));
  }

  @override
  Future<TagInfo> confirmTag(String tagCode,
      {required String clientTxId,
      required String uid,
      required bool readbackOk,
      required bool passwordProtected}) async {
    final r = await _send('POST', '/tags/$tagCode/confirm', data: {
      'client_tx_id': clientTxId,
      'uid': uid,
      'readback_ok': readbackOk,
      'password_protected': passwordProtected,
    });
    return TagInfo.fromJson(_obj(r));
  }

  @override
  Future<int> countActiveTags(String eventId) async {
    var n = 0;
    String? cursor;
    do {
      final r = await _send('GET', '/events/$eventId/tags',
          query: {'limit': 200, 'cursor': ?cursor});
      final o = _obj(r);
      n += (o['items'] as List).length;
      cursor = o['next_cursor'] as String?;
    } while (cursor != null);
    return n;
  }

  @override
  Future<Order> createOrder(Json body) async =>
      Order.fromJson(_obj(await _send('POST', '/orders', data: body)));

  @override
  Future<Topup> createTopup(Json body) async =>
      Topup.fromJson(_obj(await _send('POST', '/topups', data: body)));

  @override
  Future<Cashout> createCashout(Json body) async =>
      Cashout.fromJson(_obj(await _send('POST', '/cashouts', data: body)));

  @override
  Future<List<SyncItemResult>> syncBatch(String batchId, List<Json> items) async {
    final r = await _send('POST', '/sync/batch',
        auth: _Auth.device, data: {'batch_id': batchId, 'items': items});
    return (_obj(r)['results'] as List)
        .map((e) => SyncItemResult.fromJson(e as Json))
        .toList();
  }

  @override
  Future<PublicTagPage> getPublicTagPage(String tagCode) async =>
      PublicTagPage.fromJson(
          _obj(await _send('GET', '/public/tags/$tagCode', auth: _Auth.none)));

  @override
  Future<List<DeviceInfo>> listDevices(String eventId) async {
    final r = await _send('GET', '/events/$eventId/devices');
    return (_obj(r)['items'] as List)
        .map((e) => DeviceInfo.fromJson(e as Json))
        .toList();
  }

  @override
  Future<String> createEnrollmentCode(String eventId,
      {required String kind, String? standId, bool training = false}) async {
    final r = await _send('POST', '/events/$eventId/enrollment-codes',
        data: {'kind': kind, 'stand_id': standId, 'training': training});
    return _obj(r)['code'] as String;
  }

  @override
  Future<List<ReportRow>> salesReport(String eventId, String groupBy) async {
    final r = await _send('GET', '/events/$eventId/reports/sales',
        query: {'group_by': groupBy});
    return (_obj(r)['rows'] as List)
        .map((e) => ReportRow.fromJson(e as Json))
        .toList();
  }

  @override
  Future<Liability> liability(String eventId) async => Liability.fromJson(
      _obj(await _send('GET', '/events/$eventId/reports/liability')));

  @override
  Future<List<TopupMethodRow>> topupsReport(String eventId) async {
    final r = await _send('GET', '/events/$eventId/reports/topups');
    return (_obj(r)['by_method'] as List)
        .map((e) => TopupMethodRow.fromJson(e as Json))
        .toList();
  }
}
