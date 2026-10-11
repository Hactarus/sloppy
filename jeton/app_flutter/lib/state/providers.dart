import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/fake_api.dart';
import '../api/http_api.dart';
import '../api/jeton_api.dart';
import '../config.dart';
import '../models/models.dart';
import '../nfc/nfc_mock.dart';
import '../nfc/nfc_platform.dart';
import '../nfc/nfc_service.dart';
import '../offline/queue.dart';
import '../util.dart';
import 'storage.dart';

// ---------------------------------------------------------------- infrastructure

/// Overridden in main() / tests with the real instance.
final prefsProvider = Provider<SharedPreferences>((ref) => throw UnimplementedError('prefsProvider'));

final secureKvProvider = Provider<KeyValueStore>((ref) => SecureKv());

final apiProvider = Provider<JetonApi>((ref) {
  final JetonApi api = useFakeApi ? FakeApi() : HttpApi(apiBaseUrl);
  api.onReachability = (ok) {
    // Never mutate provider state synchronously inside another provider's build.
    scheduleMicrotask(() => ref.read(onlineProvider.notifier).set(ok));
  };
  return api;
});

final nfcProvider = Provider<NfcService>((ref) => useMockNfc ? MockNfcService() : createPlatformNfc());

class OnlineNotifier extends Notifier<bool> {
  @override
  bool build() => true;
  void set(bool v) {
    if (state != v) state = v;
  }
}

final onlineProvider = NotifierProvider<OnlineNotifier, bool>(OnlineNotifier.new);

// ---------------------------------------------------------------- locale

class LocaleNotifier extends Notifier<Locale?> {
  @override
  Locale? build() {
    final c = ref.read(prefsProvider).getString('locale');
    return c == null ? null : Locale(c);
  }

  Future<void> set(Locale? l) async {
    state = l;
    final p = ref.read(prefsProvider);
    if (l == null) {
      await p.remove('locale');
    } else {
      await p.setString('locale', l.languageCode);
    }
  }
}

final localeProvider = NotifierProvider<LocaleNotifier, Locale?>(LocaleNotifier.new);

// ---------------------------------------------------------------- auth

class AuthState {
  const AuthState({this.device, this.deviceToken, this.session, this.jwt, this.jwtExpiresAt});
  final DeviceEnrollment? device;
  final String? deviceToken;
  final Session? session;
  final String? jwt;
  final DateTime? jwtExpiresAt;

  bool get enrolled => deviceToken != null && device != null;
  bool get loggedIn => enrolled && session != null && jwt != null;
  bool get jwtExpired => jwtExpiresAt != null && jwtExpiresAt!.isBefore(DateTime.now());
}

class AuthNotifier extends Notifier<AuthState> {
  @override
  AuthState build() => const AuthState();

  JetonApi get _api => ref.read(apiProvider);
  SharedPreferences get _p => ref.read(prefsProvider);
  KeyValueStore get _kv => ref.read(secureKvProvider);

  /// Loads the persisted device + session. Call once before runApp.
  Future<void> restore() async {
    final token = await _kv.read('device_token');
    final devJson = _p.getString('device');
    final jwt = await _kv.read('jwt');
    final sessJson = _p.getString('session');
    final exp = _p.getString('jwt_exp');
    if (token == null || devJson == null) return;
    final dj = jsonDecode(devJson) as Json;
    final device = DeviceEnrollment(dj['device_id'] as String, '', dj['event_id'] as String,
        dj['stand_id'] as String?, dj['kind'] as String, dj['training'] == true);
    _api.deviceToken = token;
    _api.jwt = jwt;
    state = AuthState(
      device: device,
      deviceToken: token,
      jwt: jwt,
      session: sessJson == null ? null : Session.fromJson(jsonDecode(sessJson) as Json),
      jwtExpiresAt: exp == null ? null : DateTime.tryParse(exp),
    );
  }

  Future<void> enroll(String code, String deviceName) async {
    final d = await _api.enrollDevice(code: code, deviceName: deviceName);
    await _kv.write('device_token', d.deviceToken);
    await _p.setString(
        'device',
        jsonEncode({
          'device_id': d.deviceId,
          'event_id': d.eventId,
          'stand_id': d.standId,
          'kind': d.kind,
          'training': d.training,
        }));
    _api.deviceToken = d.deviceToken;
    state = AuthState(device: d, deviceToken: d.deviceToken);
  }

  Future<void> login(String staffId, String pin) async {
    final r = await _api.login(staffId, pin);
    _api.jwt = r.accessToken;
    await _kv.write('jwt', r.accessToken);
    await _p.setString('session', jsonEncode(r.session.toJson()));
    await _p.setString('jwt_exp', r.expiresAt.toIso8601String());
    state = AuthState(
        device: state.device,
        deviceToken: state.deviceToken,
        session: r.session,
        jwt: r.accessToken,
        jwtExpiresAt: r.expiresAt);
  }

  /// Staff logout; the device stays enrolled and the offline queue is kept.
  Future<void> logout() async {
    _api.jwt = null;
    await _kv.delete('jwt');
    await _p.remove('session');
    await _p.remove('jwt_exp');
    state = AuthState(device: state.device, deviceToken: state.deviceToken);
  }

  /// JWT rejected by the server (expired / revoked): go back to the PIN screen.
  Future<void> sessionExpired() => logout();
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);

// ---------------------------------------------------------------- catalog

class CatalogState {
  const CatalogState({this.catalog, this.loading = false, this.error});
  final Catalog? catalog;
  final bool loading;
  final Object? error;
}

class CatalogNotifier extends Notifier<CatalogState> {
  Timer? _timer;

  @override
  CatalogState build() {
    final eventId = ref.watch(authProvider.select((a) => a.session?.eventId));
    ref.onDispose(() => _timer?.cancel());
    final cached = ref.read(prefsProvider).getString('catalog');
    Catalog? c;
    if (cached != null) {
      try {
        c = Catalog.fromJson(jsonDecode(cached) as Json);
      } catch (_) {}
    }
    if (eventId != null) {
      scheduleMicrotask(refresh);
      _timer = Timer.periodic(const Duration(minutes: 5), (_) => refresh());
    }
    return CatalogState(catalog: c);
  }

  /// Refresh at login and every 5 minutes while online (API `getCatalog` description).
  Future<void> refresh() async {
    final s = ref.read(authProvider).session;
    if (s == null) return;
    state = CatalogState(catalog: state.catalog, loading: true);
    try {
      final c = await ref.read(apiProvider).getCatalog(s.eventId, knownVersion: state.catalog?.version);
      if (c != null) {
        await ref.read(prefsProvider).setString('catalog', jsonEncode(c.toJson()));
        state = CatalogState(catalog: c);
      } else {
        state = CatalogState(catalog: state.catalog);
      }
    } on NetworkException catch (e) {
      state = CatalogState(catalog: state.catalog, error: e); // keep cached catalog
    } on ApiError catch (e) {
      state = CatalogState(catalog: state.catalog, error: e);
      if (e.status == 401 && e.code != 'INVALID_CREDENTIALS') {
        await ref.read(authProvider.notifier).sessionExpired();
      }
    }
  }
}

final catalogProvider = NotifierProvider<CatalogNotifier, CatalogState>(CatalogNotifier.new);

// ---------------------------------------------------------------- offline queue + sync

class QueueNotifier extends Notifier<List<QueueItem>> {
  @override
  List<QueueItem> build() {
    try {
      return QueueItem.decodeAll(ref.read(prefsProvider).getString('queue.v1'));
    } catch (_) {
      return [];
    }
  }

  Future<void> _save() => ref.read(prefsProvider).setString('queue.v1', QueueItem.encodeAll(state));

  /// Device-local number printed on offline receipts; NOT a legal number (server assigns those).
  String nextProvisionalRef() {
    final p = ref.read(prefsProvider);
    final n = (p.getInt('prov_seq') ?? 0) + 1;
    p.setInt('prov_seq', n);
    final dev = ref.read(authProvider).device?.deviceId ?? 'xx';
    return 'T${dev.substring(dev.length - 2).toUpperCase()}-${n.toString().padLeft(6, '0')}';
  }

  int spent(String tagCode) => offlineSpent(state, tagCode);

  Future<void> add(QueueItem i) async {
    state = [...state, i];
    await _save();
  }

  Future<void> removeIds(Set<String> ids) async {
    state = state.where((q) => !ids.contains(q.clientTxId)).toList();
    await _save();
  }

  Future<void> markRejected(String id, String code) async {
    for (final q in state) {
      if (q.clientTxId == id) {
        q.status = QueueStatus.rejected;
        q.errorCode = code;
      }
    }
    state = [...state];
    await _save();
  }
}

final queueProvider = NotifierProvider<QueueNotifier, List<QueueItem>>(QueueNotifier.new);

class SyncState {
  const SyncState({this.syncing = false, this.lastError, this.lastSyncAt, this.lastFlags = const []});
  final bool syncing;
  final Object? lastError;
  final DateTime? lastSyncAt;
  final List<String> lastFlags;
}

class SyncNotifier extends Notifier<SyncState> {
  Timer? _timer;

  @override
  SyncState build() {
    ref.onDispose(() => _timer?.cancel());
    return const SyncState();
  }

  /// Background loop: every 10 s, probe connectivity when offline and flush the queue when online.
  void start() {
    _timer ??= Timer.periodic(const Duration(seconds: 10), (_) async {
      final online = ref.read(onlineProvider);
      final pending = ref.read(queueProvider).any((q) => q.status == QueueStatus.pending);
      if (!online) {
        try {
          await ref.read(apiProvider).health();
        } catch (_) {}
      }
      if (ref.read(onlineProvider) && pending) await flush();
    });
  }

  /// Sends pending items in creation order, <= 200 per request. `applied` and `duplicate` leave
  /// the queue; `rejected` stays visible (never retried). Network failure keeps everything.
  Future<void> flush() async {
    if (state.syncing) return;
    final auth = ref.read(authProvider);
    if (!auth.enrolled) return;
    final q = ref.read(queueProvider.notifier);
    state = SyncState(syncing: true, lastSyncAt: state.lastSyncAt);
    final flags = <String>[];
    try {
      while (true) {
        final pending = ref.read(queueProvider).where((i) => i.status == QueueStatus.pending).take(200).toList();
        if (pending.isEmpty) break;
        final results = await ref
            .read(apiProvider)
            .syncBatch(uuid7(), pending.map((e) => e.toSyncItem()).toList());
        final done = <String>{};
        for (final r in results) {
          if (r.status == 'rejected') {
            await q.markRejected(r.clientTxId, r.error?.code ?? 'REJECTED');
          } else {
            done.add(r.clientTxId);
            flags.addAll(r.flags);
          }
        }
        await q.removeIds(done);
        if (results.length < pending.length) break; // defensive: server answered fewer
      }
      state = SyncState(lastSyncAt: DateTime.now(), lastFlags: flags);
    } on NetworkException catch (e) {
      state = SyncState(lastError: e, lastSyncAt: state.lastSyncAt);
    } on ApiError catch (e) {
      state = SyncState(lastError: e, lastSyncAt: state.lastSyncAt);
    }
  }
}

final syncProvider = NotifierProvider<SyncNotifier, SyncState>(SyncNotifier.new);

/// Stand the POS sells for: the device/staff stand, or (admin without a stand) the chosen one.
class SelectedStandNotifier extends Notifier<String?> {
  @override
  String? build() => null;
  void set(String? id) => state = id;
}

final selectedStandProvider = NotifierProvider<SelectedStandNotifier, String?>(SelectedStandNotifier.new);
