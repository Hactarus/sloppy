import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jeton_app/app.dart';
import 'package:jeton_app/state/providers.dart';
import 'package:jeton_app/state/storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('enrol, log in as bar vendor, one tap per item, pay with simulated tag', (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({'locale': 'en'});
    final prefs = await SharedPreferences.getInstance();
    await tester.pumpWidget(ProviderScope(
      overrides: [prefsProvider.overrideWithValue(prefs), secureKvProvider.overrideWithValue(MemoryKv())],
      child: const JetonApp(),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Enrol this device'), findsOneWidget);

    await tester.tap(find.text('Enrol').last);
    await tester.pump(const Duration(milliseconds: 300)); // fake API latency
    await tester.pumpAndSettle();
    expect(find.text('Who are you?'), findsOneWidget);

    await tester.tap(find.text('Chloe (bar)'));
    await tester.pumpAndSettle();
    for (final d in ['3', '3', '3', '3']) {
      await tester.tap(find.byKey(Key('pin-$d')));
      await tester.pump();
    }
    await tester.tap(find.byKey(const Key('pin-ok')));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(milliseconds: 300)); // catalog refresh
    await tester.pump(const Duration(milliseconds: 300));

    // Vendor lands straight on the POS grid.
    expect(find.byKey(const Key('pay')), findsOneWidget);
    await tester.tap(find.byKey(const Key('tile-0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f1004'))); // soft drink, 1 token
    await tester.pump();
    expect(find.text('1 token'), findsWidgets);
    await tester.tap(find.byKey(const Key('pay')));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const Key('armed')), findsOneWidget);

    await tester.tap(find.byKey(const Key('sim-toggle')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('sim-tag-0')));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byKey(const Key('result-success')), findsOneWidget);
    expect(find.text('New balance: 19 tokens'), findsOneWidget);
    // auto-reset
    await tester.pump(const Duration(seconds: 2));
    expect(find.byKey(const Key('result-success')), findsNothing);
  });
}
