import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../l10n/gen/app_localizations.dart';
import '../models/models.dart';
import '../offline/queue.dart';
import '../state/providers.dart';
import 'common.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final role = ref.watch(authProvider.select((a) => a.session?.role));
    final name = ref.watch(authProvider.select((a) => a.session?.staff.displayName)) ?? '';
    final tiles = <(IconData, String, String)>[
      if (role == Roles.admin || role == Roles.vendor) (Icons.local_bar, l.menuPos, '/pos'),
      if (role == Roles.admin || role == Roles.cashier) (Icons.point_of_sale, l.menuCashier, '/cashier'),
      if (role == Roles.admin || role == Roles.cashier) (Icons.nfc, l.menuEncode, '/tags'),
      if (role == Roles.admin || role == Roles.auditor) (Icons.dashboard, l.menuAdmin, '/admin'),
      (Icons.sync, l.menuQueue, '/queue'),
    ];
    return AppScaffold(
      title: l.homeTitle(name),
      showBack: false,
      body: GridView.count(
        crossAxisCount: MediaQuery.sizeOf(context).width < 520 ? 2 : 3,
        padding: const EdgeInsets.all(12),
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        children: [
          for (final t in tiles)
            Card(
              child: InkWell(
                key: Key('home${t.$3}'),
                onTap: () => context.push(t.$3),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(t.$1, size: 56),
                  const SizedBox(height: 8),
                  Text(t.$2, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700), textAlign: TextAlign.center),
                ]),
              ),
            ),
        ],
      ),
    );
  }
}

class QueueScreen extends ConsumerWidget {
  const QueueScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final queue = ref.watch(queueProvider);
    final sync = ref.watch(syncProvider);
    final online = ref.watch(onlineProvider);
    return AppScaffold(
      title: l.menuQueue,
      body: ListView(padding: const EdgeInsets.all(12), children: [
        Row(children: [
          Icon(online ? Icons.cloud_done : Icons.cloud_off, color: online ? kOk : kWarn),
          const SizedBox(width: 8),
          Text(online ? l.online : l.offline, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const Spacer(),
          FilledButton.icon(
            key: const Key('sync-now'),
            style: FilledButton.styleFrom(minimumSize: const Size(140, kTouch)),
            onPressed: sync.syncing ? null : () => ref.read(syncProvider.notifier).flush(),
            icon: const Icon(Icons.sync),
            label: Text(l.syncNow),
          ),
        ]),
        if (sync.lastError != null)
          Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(errorOf(l, sync.lastError!), style: const TextStyle(color: kBad))),
        if (sync.lastFlags.isNotEmpty)
          Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(l.syncFlags(sync.lastFlags.join(', ')), style: const TextStyle(color: kWarn))),
        const SizedBox(height: 12),
        if (queue.isEmpty) Padding(padding: const EdgeInsets.all(24), child: Center(child: Text(l.queueEmpty))),
        for (final q in queue)
          Card(
            child: ListTile(
              leading: Icon(q.status == QueueStatus.pending ? Icons.schedule : Icons.error, color: q.status == QueueStatus.pending ? kWarn : kBad, size: 32),
              title: Text('${q.provisionalRef} · ${l.tokensCount(q.tokens)}'),
              subtitle: Text(q.status == QueueStatus.pending
                  ? '…${q.tagCode.substring(16)}'
                  : '…${q.tagCode.substring(16)} · ${errorMessage(l, q.errorCode ?? '')}'),
              trailing: q.status == QueueStatus.rejected
                  ? IconButton(
                      tooltip: l.dismiss,
                      constraints: const BoxConstraints(minWidth: kTouch, minHeight: kTouch),
                      onPressed: () => ref.read(queueProvider.notifier).removeIds({q.clientTxId}),
                      icon: const Icon(Icons.delete))
                  : null,
            ),
          ),
      ]),
    );
  }
}
