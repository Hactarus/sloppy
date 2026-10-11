import '../models/models.dart';

/// Client-side view of jeton/api/openapi.yaml. Two implementations:
/// [HttpApi] (real backend, `--dart-define=API_BASE_URL=...`) and [FakeApi]
/// (in-memory, used when API_BASE_URL is empty).
///
/// Write operations take the already built JSON body (including `client_tx_id`)
/// so the very same map can be stored in the offline queue and replayed later.
/// Network failures raise [NetworkException]; server errors raise [ApiError].
abstract class JetonApi {
  /// Set by the auth layer. Device token (layer 1) and staff JWT (layer 2).
  String? deviceToken;
  String? jwt;

  /// Called with true after any successful round trip and false after a network failure.
  void Function(bool reachable)? onReachability;

  Future<void> health();

  // Auth
  Future<DeviceEnrollment> enrollDevice(
      {required String code, required String deviceName});
  Future<List<StaffPublic>> listLoginStaff();
  Future<LoginResult> login(String staffId, String pin);

  // Catalog: returns null when [knownVersion] is still current (HTTP 304).
  Future<Catalog?> getCatalog(String eventId, {int? knownVersion});

  // Tags
  Future<TagInfo> lookupTag(TagRef tag);
  Future<EnrollTagResult> enrollTag(
      {required String clientTxId,
      required String uid,
      required String chipType,
      String? signature});
  Future<TagInfo> confirmTag(String tagCode,
      {required String clientTxId,
      required String uid,
      required bool readbackOk,
      required bool passwordProtected});
  Future<int> countActiveTags(String eventId);

  // Money
  Future<Order> createOrder(Json body);
  Future<Topup> createTopup(Json body);
  Future<Cashout> createCashout(Json body);

  /// `POST /sync/batch`; uses the device token so it still works when the JWT expired offline.
  Future<List<SyncItemResult>> syncBatch(String batchId, List<Json> items);

  // Public (unauthenticated)
  Future<PublicTagPage> getPublicTagPage(String tagCode);

  // Admin / reports
  Future<List<DeviceInfo>> listDevices(String eventId);
  Future<String> createEnrollmentCode(String eventId,
      {required String kind, String? standId, bool training = false});
  Future<List<ReportRow>> salesReport(String eventId, String groupBy);
  Future<Liability> liability(String eventId);
  Future<List<TopupMethodRow>> topupsReport(String eventId);
}
