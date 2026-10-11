import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/gen/app_localizations.dart';
import '../models/models.dart';
import '../state/providers.dart';
import '../util.dart';
import 'common.dart';

final _devicesProvider = FutureProvider.autoDispose<List<DeviceInfo>>((ref) {
  final s = ref.watch(authProvider).session;
  return ref.read(apiProvider).listDevices(s!.eventId);
});

final _reportsProvider = FutureProvider.autoDispose<({Liability liab, List<TopupMethodRow> topups, List<ReportRow> sales})>((ref) async {
  final s = ref.watch(authProvider).session!;
  final api = ref.read(apiProvider);
  final r = await Future.wait([api.liability(s.eventId), api.topupsReport(s.eventId), api.salesReport(s.eventId, 'item')]);
  return (liab: r[0] as Liability, topups: r[1] as List<TopupMethodRow>, sales: r[2] as List<ReportRow>);
});

/// Minimal admin: read-only catalog, devices + enrolment codes, key reports.
/// (Editing items/prices/PINs and CSV export are not in this variant.)
class AdminScreen extends ConsumerWidget {
  const AdminScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    return DefaultTabController(
      length: 3,
      child: AppScaffold(
        title: l.menuAdmin,
        bottom: TabBar(tabs: [
          Tab(icon: const Icon(Icons.menu_book), text: l.tabCatalog),
          Tab(icon: const Icon(Icons.tablet_android), text: l.tabDevices),
          Tab(icon: const Icon(Icons.bar_chart), text: l.tabReports),
        ]),
        body: const TabBarView(children: [_CatalogTab(), _DevicesTab(), _ReportsTab()]),
      ),
    );
  }
}

class _CatalogTab extends ConsumerWidget {
  const _CatalogTab();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final lang = Localizations.localeOf(context).languageCode;
    final c = ref.watch(catalogProvider).catalog;
    if (c == null) return Center(child: Text(l.noCatalog));
    return ListView(children: [
      ListTile(
        title: Text(c.event.name),
        subtitle: Text(l.catalogInfo(c.version, formatEuro(c.event.tokenPriceCents))),
        leading: const Icon(Icons.event),
      ),
      for (final s in c.stands.where((s) => s.kind == 'stand'))
        ExpansionTile(
          initiallyExpanded: true,
          title: Text(s.label(lang), style: const TextStyle(fontWeight: FontWeight.w800)),
          children: [
            for (final i in c.items.where((i) => i.standId == s.id))
              ListTile(
                title: Text(i.label(lang)),
                subtitle: Text('${i.vatCategory}${i.minAge != null ? ' · ${i.minAge}+' : ''}${i.active ? '' : ' · ${l.inactive}'}'),
                trailing: Text('${l.tokensCount(i.priceTokens)}\n${formatEuro(i.priceTokens * c.event.tokenPriceCents)}',
                    textAlign: TextAlign.end),
              ),
          ],
        ),
    ]);
  }
}

class _DevicesTab extends ConsumerWidget {
  const _DevicesTab();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final devices = ref.watch(_devicesProvider);
    final isAdmin = ref.watch(authProvider.select((a) => a.session?.role)) == Roles.admin;
    return Scaffold(
      floatingActionButton: isAdmin
          ? FloatingActionButton.extended(
              key: const Key('new-code'),
              onPressed: () async {
                final s = ref.read(authProvider).session!;
                final stand = ref.read(catalogProvider).catalog?.stands.where((x) => x.kind == 'stand').firstOrNull?.id;
                try {
                  final code = await ref.read(apiProvider).createEnrollmentCode(s.eventId, kind: 'terminal', standId: stand);
                  if (context.mounted) {
                    await showDialog<void>(
                      context: context,
                      builder: (_) => AlertDialog(
                        title: Text(l.newEnrollCode),
                        content: SelectableText(code, style: const TextStyle(fontSize: 40, letterSpacing: 6, fontWeight: FontWeight.w900)),
                        actions: [TextButton(onPressed: () => Navigator.pop(context), child: Text(l.ok))],
                      ),
                    );
                  }
                } catch (e) {
                  if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorOf(l, e))));
                }
              },
              icon: const Icon(Icons.add),
              label: Text(l.newEnrollCode),
            )
          : null,
      body: devices.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(errorOf(l, e))),
        data: (list) => ListView(children: [
          if (list.isEmpty) Padding(padding: const EdgeInsets.all(24), child: Center(child: Text(l.noData))),
          for (final d in list)
            ListTile(
              leading: Icon(d.revokedAt != null ? Icons.block : Icons.tablet_android, color: d.revokedAt != null ? kBad : null),
              title: Text(d.name),
              subtitle: Text('${d.kind}${d.training ? ' · TEST' : ''}'),
            ),
        ]),
      ),
    );
  }
}

class _ReportsTab extends ConsumerWidget {
  const _ReportsTab();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final r = ref.watch(_reportsProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_reportsProvider),
      child: r.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text(errorOf(l, e)))]),
        data: (d) => ListView(padding: const EdgeInsets.all(12), children: [
          Card(
            child: ListTile(
              leading: const Icon(Icons.account_balance_wallet, size: 36),
              title: Text(l.liability),
              subtitle: Text(l.liabilityDetail(d.liab.wallets, d.liab.negativeWallets)),
              trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(l.tokensCount(d.liab.outstandingTokens), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                Text(formatEuro(d.liab.outstandingCents)),
              ]),
            ),
          ),
          Text(l.topupsByMethod, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          for (final t in d.topups)
            ListTile(title: Text(t.method), subtitle: Text('${t.count}×'), trailing: Text('${l.tokensCount(t.tokens)}\n${formatEuro(t.grossCents)}', textAlign: TextAlign.end)),
          if (d.topups.isEmpty) Text(l.noData),
          const SizedBox(height: 12),
          Text(l.salesByItem, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          for (final s in d.sales)
            ListTile(title: Text(s.label), subtitle: Text('${s.qty}×'), trailing: Text(l.tokensCount(s.tokens))),
          if (d.sales.isEmpty) Text(l.noData),
        ]),
      ),
    );
  }
}
