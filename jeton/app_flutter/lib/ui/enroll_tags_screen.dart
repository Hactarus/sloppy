import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/gen/app_localizations.dart';
import '../state/enroll_controller.dart';
import '../state/providers.dart';
import '../util.dart';
import 'common.dart';

/// Bulk tag provisioning: counter "N / 1000", tap tags one after another.
class EnrollTagsScreen extends ConsumerStatefulWidget {
  const EnrollTagsScreen({super.key});
  @override
  ConsumerState<EnrollTagsScreen> createState() => _EnrollTagsScreenState();
}

class _EnrollTagsScreenState extends ConsumerState<EnrollTagsScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(enrollProvider.notifier).loadCount());
  }

  @override
  void deactivate() {
    ref.read(enrollProvider.notifier).stop();
    super.deactivate();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final s = ref.watch(enrollProvider);
    final ctl = ref.read(enrollProvider.notifier);
    final nfc = ref.watch(nfcProvider);
    return AppScaffold(
      title: l.menuEncode,
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Center(
          child: Text(l.encodeCounter(s.count, s.target),
              key: const Key('counter'), style: const TextStyle(fontSize: 56, fontWeight: FontWeight.w900)),
        ),
        const SizedBox(height: 8),
        LinearProgressIndicator(minHeight: 14, value: s.target == 0 ? 0 : (s.count / s.target).clamp(0, 1).toDouble()),
        const SizedBox(height: 16),
        if (!nfc.isMock && !(nfc.name == 'android'))
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(children: [
              const Icon(Icons.info, color: kWarn),
              const SizedBox(width: 8),
              Expanded(child: Text(l.encodeWebLimit)),
            ]),
          ),
        BigButton(
          key: const Key('enroll-toggle'),
          label: s.running ? l.encodeStop : l.encodeStart,
          icon: s.running ? Icons.stop : Icons.play_arrow,
          color: s.running ? kBad : null,
          onPressed: s.running ? ctl.stop : ctl.start,
        ),
        if (s.waiting)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Icon(Icons.nfc, size: 36),
              const SizedBox(width: 12),
              Text(l.encodeWaiting, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
            ]),
          ),
        const SizedBox(height: 8),
        for (final e in s.log)
          Card(
            color: e.ok ? const Color(0xFFE3F4E8) : const Color(0xFFFBE4E2),
            child: ListTile(
              leading: Icon(e.ok ? Icons.check_circle : Icons.cancel, color: e.ok ? kOk : kBad, size: 32),
              title: Text(e.ok ? l.encodeOk(last4(e.tagCode!)) : errorMessage(l, e.errorCode ?? '')),
              subtitle: e.ok ? Text(e.protected ? l.encodeProtected : l.encodeNoProtection) : null,
            ),
          ),
      ]),
    );
  }
}
