import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jeton_app/api/demo_data.dart';
import 'package:jeton_app/api/fake_api.dart';
import 'package:jeton_app/models/models.dart';
import 'package:jeton_app/nfc/ndef_uri.dart';
import 'package:jeton_app/nfc/nfc_mock.dart';
import 'package:jeton_app/offline/queue.dart';
import 'package:jeton_app/state/enroll_controller.dart';
import 'package:jeton_app/state/pos_controller.dart';
import 'package:jeton_app/state/providers.dart';
import 'package:jeton_app/state/storage.dart';
import 'package:jeton_app/ui/cashier_screen.dart';
import 'package:jeton_app/util.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<ProviderContainer> boot(String staffPin, String staffId) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final c = ProviderContainer(overrides: [
    prefsProvider.overrideWithValue(prefs),
    secureKvProvider.overrideWithValue(MemoryKv()),
  ]);
  addTearDown(c.dispose);
  final auth = c.read(authProvider.notifier);
  await auth.enroll('DEMO2026', 'test');
  await auth.login(staffId, staffPin);
  await c.read(catalogProvider.notifier).refresh();
  return c;
}

const chloe = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0a03'; // vendor, bar
const bob = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0a02'; // cashier
const pils = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f1001';
const cola = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f1004';

/// Waits until the controller is waiting for a tap, then presents [tapIt].
Future<void> tapWhenArmed(ProviderContainer c, void Function(MockNfcService) tapIt) async {
  final nfc = c.read(nfcProvider) as MockNfcService;
  for (var i = 0; i < 200 && !nfc.isWaiting; i++) {
    await Future<void>.delayed(const Duration(milliseconds: 5));
  }
  tapIt(nfc);
}

void main() {
  test('uuid7 is version 7 and time ordered', () {
    final a = uuid7(), b = uuid7();
    expect(a[14], '7');
    expect(a.compareTo(b) <= 0, isTrue);
  });

  test('NDEF URI payload round trip + TLV layout', () {
    const url = 'https://jeton.example/t/0123456789ABCDEFGHJ0';
    final p = encodeUriPayload(url);
    expect(p.first, 0x04);
    expect(decodeUriPayload(p), url);
    final tlv = ndefTlvForUrl(url);
    expect(tlv.first, 0x03);
    expect(tlv.last, 0xFE);
    expect(tlv[2], 0xD1);
    expect(tlv[5], 0x55);
    expect(tagCodeFromUrl(url), '0123456789ABCDEFGHJ0');
  });

  test('offline cap is per tag and counts only pending items', () {
    QueueItem q(String tag, int t, [QueueStatus s = QueueStatus.pending]) => QueueItem(
        clientTxId: uuid7(), type: 'order', staffId: 's', provisionalRef: 'r', payload: {}, tagCode: tag, tokens: t, createdAt: DateTime.now(), status: s);
    final items = [q('A', 6), q('A', 3, QueueStatus.rejected), q('B', 9)];
    expect(offlineCapAllows(items, 'A', 4, 10), isTrue);
    expect(offlineCapAllows(items, 'A', 5, 10), isFalse);
    expect(offlineCapAllows(items, 'B', 2, 10), isFalse);
  });

  test('POS: one tap per item, unselect, repeat last, tip default 0', () async {
    final c = await boot('3333', chloe);
    final pos = c.read(posProvider.notifier);
    pos.add(pils);
    pos.add(pils);
    pos.add(cola);
    expect(c.read(posProvider).lines, {pils: 2, cola: 1});
    expect(pos.total(c.read(posProvider)), 3);
    expect(c.read(posProvider).tip, 0);
    pos.remove(pils);
    pos.remove(cola);
    expect(c.read(posProvider).lines, {pils: 1});
    pos.setTip(5);
    expect(c.read(posProvider).tip, 0); // 50% of 1 token = 0
    pos.clear();
    expect(c.read(posProvider).lines, isEmpty);
  });

  test('POS: pay online, balance debited, repeat last works', () async {
    final c = await boot('3333', chloe);
    final pos = c.read(posProvider.notifier);
    pos.add(cola);
    pos.add(cola);
    final f = pos.pay();
    await tapWhenArmed(c, (n) => n.tapDemo(0)); // 20 tokens
    await f;
    final r = c.read(posProvider).result!;
    expect(r.kind, ResultKind.success);
    expect(r.balance, 18);
    expect(c.read(posProvider).lines, isEmpty);
    pos.dismissResult();
    pos.repeatLast();
    expect(c.read(posProvider).lines, {cola: 2});
  });

  test('POS: insufficient balance keeps basket and reports code', () async {
    final c = await boot('3333', chloe);
    final pos = c.read(posProvider.notifier);
    pos.add(pils);
    final f = pos.pay(ageChecked: true);
    await tapWhenArmed(c, (n) => n.tapDemo(3)); // 0 tokens
    await f;
    final r = c.read(posProvider).result!;
    expect(r.kind, ResultKind.error);
    expect(r.code, 'INSUFFICIENT_BALANCE');
    expect(c.read(posProvider).lines, isNotEmpty);
  });

  test('POS: offline order is queued with the same client_tx_id, capped, then synced', () async {
    final c = await boot('3333', chloe);
    final api = c.read(apiProvider) as FakeApi;
    final pos = c.read(posProvider.notifier);
    api.networkUp.value = false;

    pos.add(cola);
    pos.add(cola);
    var f = pos.pay();
    await tapWhenArmed(c, (n) => n.tapDemo(0));
    await f;
    expect(c.read(posProvider).result!.kind, ResultKind.queued);
    expect(c.read(queueProvider), hasLength(1));
    final txId = c.read(queueProvider).first.clientTxId;
    expect(c.read(queueProvider).first.payload['client_tx_id'], txId);
    pos.dismissResult();

    // 9 more tokens on the same tag would exceed the cap of 10 (2 already spent).
    for (var i = 0; i < 9; i++) {
      pos.add(cola);
    }
    f = pos.pay();
    await tapWhenArmed(c, (n) => n.tapDemo(0));
    await f;
    expect(c.read(posProvider).result!.code, 'OFFLINE_CAP');
    expect(c.read(queueProvider), hasLength(1));

    // Back online: flush applies the order; a second flush finds nothing (idempotent).
    api.networkUp.value = true;
    await c.read(syncProvider.notifier).flush();
    expect(c.read(queueProvider), isEmpty);
    final tag = await api.lookupTag(const TagRef('0123456789ABCDEFGHJ0', '04A1B2C3D4E5F6'));
    expect(tag.balanceTokens, 18);
  });

  test('sync is idempotent: same client_tx_id twice debits once', () async {
    final c = await boot('3333', chloe);
    final api = c.read(apiProvider) as FakeApi;
    final item = {
      'type': 'order',
      'staff_id': chloe,
      'payload': {
        'client_tx_id': uuid7(),
        'stand_id': demoBarId,
        'tag': {'tag_code': demoTags[0].code, 'uid': demoTags[0].uid},
        'lines': [
          {'item_id': cola, 'qty': 1}
        ],
        'client_created_at': DateTime.now().toUtc().toIso8601String(),
      }
    };
    final r1 = await api.syncBatch(uuid7(), [item]);
    final r2 = await api.syncBatch(uuid7(), [item]);
    expect(r1.single.status, 'applied');
    expect(r2.single.status, 'duplicate');
    expect((await api.lookupTag(TagRef(demoTags[0].code, demoTags[0].uid))).balanceTokens, 19);
  });

  test('cashier top-up body: exact multiple of token price, manual for Wero', () {
    final tag = TagRef(demoTags[0].code, demoTags[0].uid);
    final cash = _body(tag, 'cash', 10);
    expect(cash['amount_cents'], 2000);
    expect(cash.containsKey('manual'), isFalse);
    final wero = _body(tag, 'wero', 5, ref: 'W123');
    expect(wero['manual'], isTrue);
    expect(wero['external_ref'], 'W123');
  });

  test('bulk enrolment: blank tag enrolled, written, protected, confirmed; counter increments', () async {
    final c = await boot('2222', bob);
    final nfc = c.read(nfcProvider) as MockNfcService;
    final ctl = c.read(enrollProvider.notifier);
    final f = ctl.start();
    final blank = nfc.newBlank();
    await tapWhenArmed(c, (n) => n.tap(blank));
    for (var i = 0; i < 100 && c.read(enrollProvider).log.isEmpty; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 20));
    }
    await ctl.stop();
    await f;
    final s = c.read(enrollProvider);
    expect(s.log.first.ok, isTrue);
    expect(s.count, 1);
    expect(blank.url, startsWith('https://'));
    expect(blank.protected, isTrue);
    expect(isValidTagCode(tagCodeFromUrl(blank.url)!), isTrue);
  });

  test('guest page data is public and needs no login', () async {
    final api = FakeApi(latency: Duration.zero);
    final p = await api.getPublicTagPage(demoTags[0].code);
    expect(p.balanceTokens, 20);
    expect(p.recent, isNotEmpty);
    expect(() => api.getPublicTagPage('NOPE'), throwsA(isA<ApiError>()));
  });
}

Map<String, dynamic> _body(TagRef tag, String m, int tokens, {String? ref}) => buildTopupBody(
    clientTxId: uuid7(), tag: tag, method: m, tokens: tokens, tokenPriceCents: 200, externalRef: ref);
