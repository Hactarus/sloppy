import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/gen/app_localizations.dart';
import '../models/models.dart';
import '../state/pos_controller.dart';
import '../state/providers.dart';
import '../util.dart';
import 'common.dart';

const _emoji = {
  'beer': '\u{1F37A}',
  'wine': '\u{1F377}',
  'soda': '\u{1F964}',
  'water': '\u{1F4A7}',
  'coffee': '☕',
  'fries': '\u{1F35F}',
  'hotdog': '\u{1F32D}',
  'burger': '\u{1F354}',
  'icecream': '\u{1F366}',
};

Color _parse(String? hex, Color fallback) {
  if (hex == null || hex.length != 7) return fallback;
  return Color(0xFF000000 | int.parse(hex.substring(1), radix: 16));
}

class PosScreen extends ConsumerStatefulWidget {
  const PosScreen({super.key});
  @override
  ConsumerState<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends ConsumerState<PosScreen> {
  String? _category;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final lang = Localizations.localeOf(context).languageCode;
    final pos = ref.watch(posProvider);
    final ctl = ref.read(posProvider.notifier);
    final cs = ref.watch(catalogProvider);
    final session = ref.watch(authProvider.select((a) => a.session));
    final catalog = cs.catalog;
    final standId = ctl.standId();
    ref.watch(selectedStandProvider);

    final items = catalog == null
        ? <Item>[]
        : (catalog.items.where((i) => i.active && i.standId == standId && (_category == null || i.categoryId == _category)).toList()
          ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder)));
    final cats = catalog == null
        ? <Category>[]
        : catalog.categories.where((c) => catalog.items.any((i) => i.categoryId == c.id && i.standId == standId)).toList();
    final standName = catalog?.stands.where((s) => s.id == standId).firstOrNull?.label(lang) ?? l.menuPos;

    return AppScaffold(
      title: standName,
      body: Stack(children: [
        Column(children: [
          if (session?.standId == null && catalog != null)
            _StandPicker(catalog: catalog, current: standId, lang: lang),
          if (cats.length > 1)
            SizedBox(
              height: 64,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                children: [
                  _CatChip(label: l.categoryAll, selected: _category == null, onTap: () => setState(() => _category = null)),
                  for (final c in cats)
                    _CatChip(label: c.label(lang), selected: _category == c.id, onTap: () => setState(() => _category = c.id)),
                ],
              ),
            ),
          Expanded(
            child: catalog == null
                ? Center(
                    child: cs.loading
                        ? const CircularProgressIndicator()
                        : Column(mainAxisSize: MainAxisSize.min, children: [
                            Text(l.noCatalog),
                            const SizedBox(height: 12),
                            FilledButton(onPressed: () => ref.read(catalogProvider.notifier).refresh(), child: Text(l.retry)),
                          ]),
                  )
                : LayoutBuilder(builder: (context, c) {
                    final cols = c.maxWidth < 440 ? 2 : (c.maxWidth < 720 ? 3 : 4);
                    return GridView.builder(
                      padding: const EdgeInsets.all(8),
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: cols, mainAxisSpacing: 8, crossAxisSpacing: 8, childAspectRatio: 1.15),
                      itemCount: items.length,
                      itemBuilder: (_, i) => _ItemTile(item: items[i], qty: pos.lines[items[i].id] ?? 0, lang: lang),
                    );
                  }),
          ),
          _BottomBar(catalog: catalog),
        ]),
        if (pos.phase == PosPhase.armed)
          TapTagPrompt(title: l.tapTag, subtitle: l.tokensCount(ctl.total(pos)), onCancel: ctl.cancel),
        if (pos.phase == PosPhase.processing)
          const Positioned.fill(child: ColoredBox(color: Color(0x88000000), child: Center(child: CircularProgressIndicator()))),
        if (pos.result != null) _resultOverlay(l, pos.result!, ctl),
      ]),
    );
  }

  Widget _resultOverlay(AppLocalizations l, PosResult r, PosController ctl) {
    switch (r.kind) {
      case ResultKind.success:
        return ResultOverlay(
          key: ValueKey(r),
          kind: ResultKind.success,
          title: l.paid,
          lines: [
            l.newBalance(l.tokensCount(r.balance ?? 0)),
            if (r.receiptNo != null) l.receiptNo(r.receiptNo!),
            if (r.flags.isNotEmpty) r.flags.join(', '),
          ],
          onDone: ctl.dismissResult,
        );
      case ResultKind.queued:
        return ResultOverlay(
          key: ValueKey(r),
          kind: ResultKind.queued,
          title: l.savedOffline,
          lines: [l.savedOfflineBody(r.provisionalRef ?? ''), l.offlineCapLeft(r.remainingCap ?? 0)],
          onDone: ctl.dismissResult,
        );
      case ResultKind.error:
        return ResultOverlay(
          key: ValueKey(r),
          kind: ResultKind.error,
          title: l.paymentFailed,
          lines: [errorMessage(l, r.code ?? '', r.details)],
          onDone: ctl.dismissResult,
        );
    }
  }
}

class _StandPicker extends ConsumerWidget {
  const _StandPicker({required this.catalog, required this.current, required this.lang});
  final Catalog catalog;
  final String? current;
  final String lang;
  @override
  Widget build(BuildContext context, WidgetRef ref) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
        child: DropdownButton<String>(
          isExpanded: true,
          value: current,
          items: [
            for (final s in catalog.stands.where((s) => s.kind == 'stand'))
              DropdownMenuItem(value: s.id, child: Text(s.label(lang))),
          ],
          onChanged: (v) => ref.read(selectedStandProvider.notifier).set(v),
        ),
      );
}

class _CatChip extends StatelessWidget {
  const _CatChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: ChoiceChip(
          label: Text(label, style: const TextStyle(fontSize: 18)),
          selected: selected,
          showCheckmark: true,
          materialTapTargetSize: MaterialTapTargetSize.padded,
          visualDensity: const VisualDensity(vertical: 1),
          onSelected: (_) => onTap(),
        ),
      );
}

class _ItemTile extends ConsumerWidget {
  const _ItemTile({required this.item, required this.qty, required this.lang});
  final Item item;
  final int qty;
  final String lang;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final ctl = ref.read(posProvider.notifier);
    final base = _parse(item.color, Theme.of(context).colorScheme.primary);
    return Semantics(
      button: true,
      label: '${item.label(lang)}, ${l.tokensCount(item.priceTokens)}, ${l.qtyLabel(qty)}',
      child: Material(
        color: Color.alphaBlend(base.withValues(alpha: 0.14), Colors.white),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: qty > 0 ? Colors.black : base, width: qty > 0 ? 3 : 1.5)),
        child: InkWell(
          key: Key('tile-${item.id}'),
          borderRadius: BorderRadius.circular(16),
          onTap: () => ctl.add(item.id),
          onLongPress: () async {
            final q = await _askQty(context, l, qty);
            if (q != null) ctl.setQty(item.id, q);
          },
          child: Stack(children: [
            Center(
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(_emoji[item.icon] ?? '\u{1F3F7}', style: const TextStyle(fontSize: 40)),
                  const SizedBox(height: 4),
                  Text(item.label(lang),
                      maxLines: 2,
                      textAlign: TextAlign.center,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: Colors.black)),
                  Text(l.tokensCount(item.priceTokens),
                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: Colors.black87)),
                ]),
              ),
            ),
            if (item.minAge != null)
              Positioned(
                left: 8,
                top: 8,
                child: Tooltip(message: '${item.minAge}+', child: const Icon(Icons.badge_outlined, size: 22, color: Colors.black87)),
              ),
            if (qty > 0)
              Positioned(
                right: 0,
                top: 0,
                child: InkWell(
                  key: Key('minus-${item.id}'),
                  onTap: () => ctl.remove(item.id),
                  borderRadius: BorderRadius.circular(28),
                  child: Container(
                    constraints: const BoxConstraints(minWidth: kTouch, minHeight: kTouch),
                    alignment: Alignment.center,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(24)),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.remove, size: 18, color: Colors.white),
                        Text('$qty', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
                      ]),
                    ),
                  ),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}

Future<int?> _askQty(BuildContext context, AppLocalizations l, int current) {
  final c = TextEditingController(text: current > 0 ? '$current' : '');
  return showDialog<int>(
    context: context,
    builder: (_) => AlertDialog(
      title: Text(l.quantity),
      content: TextField(
        controller: c,
        autofocus: true,
        keyboardType: TextInputType.number,
        style: const TextStyle(fontSize: 28),
        onSubmitted: (v) => Navigator.pop(context, int.tryParse(v) ?? 0),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(onPressed: () => Navigator.pop(context, int.tryParse(c.text) ?? 0), child: Text(l.ok)),
      ],
    ),
  );
}

class _BottomBar extends ConsumerWidget {
  const _BottomBar({required this.catalog});
  final Catalog? catalog;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final pos = ref.watch(posProvider);
    final ctl = ref.read(posProvider.notifier);
    final event = catalog?.event;
    final items = ctl.itemsTokens(pos);
    final total = ctl.total(pos);
    final maxTip = ctl.maxTip(pos);
    final price = event?.tokenPriceCents ?? 200;
    final tips = <int>[if (event != null) ...event.tipPresets.where((t) => t <= maxTip)];
    final canPay = pos.lines.isNotEmpty && pos.phase == PosPhase.idle;

    return Material(
      elevation: 12,
      color: Theme.of(context).colorScheme.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            if (event?.tipsEnabled == true && items > 0 && tips.isNotEmpty)
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  Text('${l.tipLabel}  ', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                  for (final t in [0, ...tips])
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(
                        key: Key('tip-$t'),
                        label: Text(t == 0 ? l.tipNone : '+$t', style: const TextStyle(fontSize: 18)),
                        selected: pos.tip == t,
                        showCheckmark: true,
                        materialTapTargetSize: MaterialTapTargetSize.padded,
                        onSelected: (_) => ctl.setTip(t),
                      ),
                    ),
                ]),
              ),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(children: [
                Text(l.total, style: const TextStyle(fontSize: 18)),
                const Spacer(),
                Flexible(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(l.tokensCount(total),
                        key: const Key('total'),
                        style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w900)),
                  ),
                ),
                const SizedBox(width: 8),
                Text(formatEuro(total * price), style: const TextStyle(fontSize: 18, color: Colors.black54)),
              ]),
            ),
            Row(children: [
              IconButton.outlined(
                key: const Key('clear'),
                tooltip: l.clear,
                iconSize: 28,
                constraints: const BoxConstraints(minWidth: kTouch, minHeight: kTouch),
                onPressed: pos.lines.isEmpty ? null : ctl.clear,
                icon: const Icon(Icons.delete_outline),
              ),
              const SizedBox(width: 8),
              IconButton.outlined(
                key: const Key('repeat'),
                tooltip: l.repeatLast,
                iconSize: 28,
                constraints: const BoxConstraints(minWidth: kTouch, minHeight: kTouch),
                onPressed: pos.last.isEmpty ? null : ctl.repeatLast,
                icon: const Icon(Icons.replay),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: BigButton(
                  key: const Key('pay'),
                  label: l.pay,
                  icon: Icons.nfc,
                  onPressed: canPay ? () => _pay(context, l, ref) : null,
                ),
              ),
            ]),
          ]),
        ),
      ),
    );
  }

  Future<void> _pay(BuildContext context, AppLocalizations l, WidgetRef ref) async {
    final ctl = ref.read(posProvider.notifier);
    var age = false;
    if (ctl.needsAgeCheck()) {
      final min = ref.read(posProvider).lines.keys
          .map((id) => catalog?.item(id)?.minAge)
          .whereType<int>()
          .fold<int>(0, (a, b) => a > b ? a : b);
      final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          icon: const Icon(Icons.badge_outlined, size: 40),
          title: Text(l.ageCheckTitle),
          content: Text(l.ageCheckBody(min), style: const TextStyle(fontSize: 18)),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l.cancel)),
            FilledButton(
                key: const Key('age-ok'),
                style: FilledButton.styleFrom(minimumSize: const Size(120, kTouch)),
                onPressed: () => Navigator.pop(context, true),
                child: Text(l.ageChecked)),
          ],
        ),
      );
      if (ok != true) return;
      age = true;
    }
    await ctl.pay(ageChecked: age);
  }
}
