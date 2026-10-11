import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/demo_data.dart';
import '../api/fake_api.dart';
import '../nfc/nfc_mock.dart';
import '../state/providers.dart';

/// Dev tool shown only with the mock NFC service: tap simulated chips, toggle "offline".
/// Keyboard: Ctrl+1..5 tap demo tags, Ctrl+0 tap a blank chip.
class NfcSimulator extends ConsumerStatefulWidget {
  const NfcSimulator({super.key, required this.child});
  final Widget child;
  @override
  ConsumerState<NfcSimulator> createState() => _NfcSimulatorState();
}

class _NfcSimulatorState extends ConsumerState<NfcSimulator> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final nfc = ref.watch(nfcProvider);
    if (nfc is! MockNfcService) return widget.child;
    final api = ref.watch(apiProvider);
    return CallbackShortcuts(
      bindings: {
        for (var i = 0; i < demoTags.length; i++)
          SingleActivator(LogicalKeyboardKey(0x31 + i), control: true): () =>
              nfc.tapDemo(i),
        const SingleActivator(LogicalKeyboardKey.digit0, control: true): () =>
            nfc.tap(nfc.newBlank()),
      },
      child: Focus(
        autofocus: false,
        child: Stack(
          children: [
            widget.child,
            Positioned(
              right: 4,
              bottom: 120,
              child: Directionality(
                textDirection: TextDirection.ltr,
                child: Material(
                  color: Colors.transparent,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (_open)
                        SizedBox(
                          width: 260,
                          child: Card(
                            elevation: 8,
                            child: Padding(
                              padding: const EdgeInsets.all(8),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Text(
                                    'NFC simulator',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  for (var i = 0; i < demoTags.length; i++)
                                    TextButton(
                                      key: Key('sim-tag-$i'),
                                      onPressed: () => nfc.tapDemo(i),
                                      child: Text(
                                        'Ctrl+${i + 1}  Tag ${i + 1} (${demoTags[i].balance} tok)',
                                      ),
                                    ),
                                  TextButton(
                                    key: const Key('sim-blank'),
                                    onPressed: () => nfc.tap(nfc.newBlank()),
                                    child: const Text('Ctrl+0  Blank tag'),
                                  ),
                                  if (api is FakeApi)
                                    ValueListenableBuilder<bool>(
                                      valueListenable: api.networkUp,
                                      builder: (_, up, _) => SwitchListTile(
                                        key: const Key('sim-offline'),
                                        dense: true,
                                        title: const Text('Simulate offline'),
                                        value: !up,
                                        onChanged: (v) =>
                                            api.networkUp.value = !v,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      FloatingActionButton.small(
                        key: const Key('sim-toggle'),
                        heroTag: 'nfc-sim',
                        onPressed: () => setState(() => _open = !_open),
                        child: const Icon(Icons.bug_report),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
