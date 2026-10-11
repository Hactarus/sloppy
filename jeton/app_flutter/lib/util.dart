import 'package:uuid/uuid.dart';

const _uuid = Uuid();

/// New UUIDv7 (time ordered) used for `client_tx_id` and client generated ids.
String uuid7() => _uuid.v7();

String hex(List<int> bytes) =>
    bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join().toUpperCase();

List<int> unhex(String s) => [
      for (var i = 0; i + 1 < s.length; i += 2)
        int.parse(s.substring(i, i + 2), radix: 16)
    ];

final _tagCodeRe = RegExp(r'^[0-9A-HJKMNP-TV-Z]{19}[0G]$');
final _uidRe = RegExp(r'^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$');

bool isValidTagCode(String s) => _tagCodeRe.hasMatch(s);
bool isValidUid(String s) => _uidRe.hasMatch(s);

/// Extracts the tag_code from `https://host/t/<code>` (also without scheme).
String? tagCodeFromUrl(String? url) {
  if (url == null) return null;
  final m = RegExp(r'/t/([0-9A-Za-z]{20})(?:[/?#].*)?$').firstMatch(url);
  final code = m?.group(1)?.toUpperCase();
  return code != null && isValidTagCode(code) ? code : null;
}

String formatEuro(int cents) {
  final sign = cents < 0 ? '-' : '';
  final a = cents.abs();
  return '$sign${a ~/ 100},${(a % 100).toString().padLeft(2, '0')} €';
}

String last4(String tagCode) => tagCode.substring(tagCode.length - 4);
