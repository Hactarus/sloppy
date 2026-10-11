import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../l10n/gen/app_localizations.dart';
import '../models/models.dart';
import '../state/providers.dart';
import '../util.dart';
import 'common.dart';

final _publicProvider = FutureProvider.autoDispose.family<PublicTagPage, String>(
    (ref, code) => ref.read(apiProvider).getPublicTagPage(code));

/// `/t/:tagCode` - public, read-only, no login, no cookies, no third-party requests.
/// This is what a guest sees when tapping the tag with any phone.
class GuestPage extends ConsumerWidget {
  const GuestPage({super.key, required this.tagCode});
  final String tagCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final page = ref.watch(_publicProvider(tagCode.toUpperCase()));
    final locale = Localizations.localeOf(context).toString();
    return Scaffold(
      appBar: AppBar(title: Text(l.guestTitle), actions: [
        PopupMenuButton<String>(
          tooltip: l.language,
          icon: const Icon(Icons.language),
          onSelected: (v) => ref.read(localeProvider.notifier).set(Locale(v)),
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'fr', child: Text('Français')),
            PopupMenuItem(value: 'nl', child: Text('Nederlands')),
            PopupMenuItem(value: 'en', child: Text('English')),
          ],
        ),
      ]),
      body: page.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.search_off, size: 72),
              const SizedBox(height: 8),
              Text(e is ApiError && e.status == 404 ? l.guestNotFound : errorOf(l, e),
                  style: const TextStyle(fontSize: 20), textAlign: TextAlign.center),
            ]),
          ),
        ),
        data: (p) {
          final df = DateFormat.yMd(locale).add_Hm();
          return Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: ListView(padding: const EdgeInsets.all(16), children: [
                Text(p.eventName, textAlign: TextAlign.center, style: const TextStyle(fontSize: 18)),
                const SizedBox(height: 8),
                Semantics(
                  label: l.tokensCount(p.balanceTokens),
                  child: Text(l.tokensCount(p.balanceTokens),
                      key: const Key('guest-balance'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 52, fontWeight: FontWeight.w900)),
                ),
                Text(l.guestWorth(formatEuro(p.balanceTokens * p.tokenPriceCents)),
                    textAlign: TextAlign.center, style: const TextStyle(fontSize: 20)),
                if (p.status == 'blocked')
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                      const Icon(Icons.block, color: kBad),
                      const SizedBox(width: 8),
                      Flexible(child: Text(l.guestBlocked, style: const TextStyle(color: kBad, fontWeight: FontWeight.w700))),
                    ]),
                  ),
                const SizedBox(height: 20),
                Text(l.recentActivity, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                if (p.recent.isEmpty) Padding(padding: const EdgeInsets.all(12), child: Text(l.noData)),
                for (final r in p.recent)
                  ListTile(
                    dense: true,
                    leading: Icon(r.deltaTokens >= 0 ? Icons.add_circle : Icons.remove_circle,
                        color: r.deltaTokens >= 0 ? kOk : kBad),
                    title: Text(_kind(l, r.kind) +
                        (r.standName != null ? ' · ${r.standName}' : '') +
                        (r.items.isEmpty ? '' : '\n${r.items.map((i) => '${i.qty}× ${i.name}').join(', ')}')),
                    subtitle: Text(df.format(r.at.toLocal()) + (r.receiptNo != null ? ' · #${r.receiptNo}' : '')),
                    trailing: Text('${r.deltaTokens > 0 ? '+' : ''}${r.deltaTokens}',
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                  ),
                const Divider(height: 32),
                if (p.refundableUntil != null) Text(l.guestRefundUntil(df.format(p.refundableUntil!.toLocal()))),
                if (p.expiryAt != null) Text(l.guestExpiry(df.format(p.expiryAt!.toLocal()))),
                if (p.organizerName != null)
                  Text(l.guestOrganizer(p.organizerName!, p.organizerEnterpriseNo ?? ''),
                      style: const TextStyle(fontSize: 13, color: Colors.black54)),
                if (p.policyVersion != null)
                  Text('${l.policy}: ${p.policyVersion}', style: const TextStyle(fontSize: 13, color: Colors.black54)),
                if (p.privacyUrl != null) SelectableText(p.privacyUrl!, style: const TextStyle(fontSize: 13)),
              ]),
            ),
          );
        },
      ),
    );
  }

  String _kind(AppLocalizations l, String k) => switch (k) {
        'topup' => l.kindTopup,
        'promo_grant' => l.kindPromo,
        'sale' => l.kindSale,
        'order_refund' => l.kindRefund,
        'cashout' => l.kindCashout,
        'tag_replacement' => l.kindReplacement,
        _ => l.kindOther,
      };
}
