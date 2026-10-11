import 'dart:convert';

import '../models/models.dart';

enum QueueStatus { pending, rejected }

/// One offline operation waiting for `POST /sync/batch` (ADR 0002).
/// Only `order`, `order_refund`, `cashout`, `cash_movement` may be queued; this client queues orders.
class QueueItem {
  QueueItem({
    required this.clientTxId,
    required this.type,
    required this.staffId,
    required this.provisionalRef,
    required this.payload,
    required this.tagCode,
    required this.tokens,
    required this.createdAt,
    this.status = QueueStatus.pending,
    this.errorCode,
  });

  final String clientTxId;
  final String type;
  final String staffId;
  final String provisionalRef;
  final Json payload;
  final String tagCode;

  /// Tokens this item spends on [tagCode] (counts against the per-tag offline cap).
  final int tokens;
  final DateTime createdAt;
  QueueStatus status;
  String? errorCode;

  /// Body of one `SyncItem`.
  Json toSyncItem() => {
        'type': type,
        'staff_id': staffId,
        'provisional_ref': provisionalRef,
        'payload': payload,
      };

  Json toJson() => {
        'client_tx_id': clientTxId,
        'type': type,
        'staff_id': staffId,
        'provisional_ref': provisionalRef,
        'payload': payload,
        'tag_code': tagCode,
        'tokens': tokens,
        'created_at': createdAt.toIso8601String(),
        'status': status.name,
        'error_code': errorCode,
      };

  factory QueueItem.fromJson(Json j) => QueueItem(
        clientTxId: j['client_tx_id'] as String,
        type: j['type'] as String,
        staffId: j['staff_id'] as String,
        provisionalRef: j['provisional_ref'] as String,
        payload: j['payload'] as Json,
        tagCode: j['tag_code'] as String,
        tokens: (j['tokens'] as num).toInt(),
        createdAt: DateTime.parse(j['created_at'] as String),
        status: QueueStatus.values.byName(j['status'] as String? ?? 'pending'),
        errorCode: j['error_code'] as String?,
      );

  static String encodeAll(List<QueueItem> items) =>
      jsonEncode(items.map((e) => e.toJson()).toList());

  static List<QueueItem> decodeAll(String? s) {
    if (s == null || s.isEmpty) return [];
    return (jsonDecode(s) as List).map((e) => QueueItem.fromJson(e as Json)).toList();
  }
}

/// Tokens already spent offline on [tagCode] by still-unsynced orders of this device.
int offlineSpent(Iterable<QueueItem> queue, String tagCode) => queue
    .where((q) => q.status == QueueStatus.pending && q.tagCode == tagCode)
    .fold(0, (a, q) => a + q.tokens);

/// Offline cap check (ADR 0002): a terminal refuses to spend more than
/// `Event.offline_cap_tokens` per tag per device while offline.
bool offlineCapAllows(Iterable<QueueItem> queue, String tagCode, int tokens, int cap) =>
    offlineSpent(queue, tagCode) + tokens <= cap;
