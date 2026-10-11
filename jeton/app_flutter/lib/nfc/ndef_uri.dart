import 'dart:convert';
import 'dart:typed_data';

/// NFC Forum URI record payload (RTD 'U'): one prefix-code byte + the rest of the URL.
const _prefixes = <String>[
  '',
  'http://www.',
  'https://www.',
  'http://',
  'https://',
  'tel:',
  'mailto:',
];

/// Encodes [url] as an RTD_URI payload using the shortest prefix code.
Uint8List encodeUriPayload(String url) {
  var code = 0;
  var best = 0;
  for (var i = 1; i < _prefixes.length; i++) {
    if (url.startsWith(_prefixes[i]) && _prefixes[i].length > best) {
      code = i;
      best = _prefixes[i].length;
    }
  }
  return Uint8List.fromList([code, ...utf8.encode(url.substring(best))]);
}

String decodeUriPayload(List<int> payload) {
  if (payload.isEmpty) return '';
  final code = payload[0];
  final prefix = code < _prefixes.length ? _prefixes[code] : '';
  return prefix + utf8.decode(payload.sublist(1), allowMalformed: true);
}

/// Raw Type 2 TLV bytes for a message holding one URI record (docs/nfc-tags.md section 2).
/// Useful for page-level writes and for tests: `03 <len> D1 01 <plen> 55 <payload> FE`.
Uint8List ndefTlvForUrl(String url) {
  final payload = encodeUriPayload(url);
  final record = [0xD1, 0x01, payload.length, 0x55, ...payload];
  if (record.length > 254) throw ArgumentError('URL too long for a short TLV');
  return Uint8List.fromList([0x03, record.length, ...record, 0xFE]);
}
