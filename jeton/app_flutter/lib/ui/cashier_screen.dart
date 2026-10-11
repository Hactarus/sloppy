import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/gen/app_localizations.dart';
import '../models/models.dart';
import '../nfc/nfc_service.dart';
import '../state/pos_controller.dart';
import '../state/providers.dart';
import '../util.dart';
import 'common.dart';

const topupMethods = ['cash', 'sumup_card', 'sumup_online', 'wero', 'bancontact'];
const cashoutMethods = ['cash', 'wero', 'bancontact', 'sumup_card'];

IconData methodIcon(String m) => switch (m) {
      'cash' => Icons.payments,
      'sumup_card' => Icons.credit_card,
      'sumup_online' => Icons.qr_code_2,
      'wero' => Icons.swap_horiz,
      'bancontact' => Icons.account_balance,
      _ => Icons.help_outline,
    };

String methodLabel(AppLocalizations l, String m) => switch (m) {
      'cash' => l.methodCash,
      'sumup_card' => l.methodSumupCard,
      'sumup_online' => l.methodSumupOnline,
      'wero' => l.methodWero,
      'bancontact' => l.methodBancontact,
      _ => m,
    };

/// `POST /topups` body. The caller keeps [clientTxId] stable across retries of the same top-up.
Json buildTopupBody({
  required String clientTxId,
  required TagRef tag,
  required String method,
  required int tokens,
  required int tokenPriceCents,
  String? externalRef,
  String? termsVersion,
}) =>
    {
      'client_tx_id': clientTxId,
      'tag': tag.toJson(),
      'payment_method': method,
      'amount_cents': tokens * tokenPriceCents,
      if (externalRef != null && externalRef.isNotEmpty) 'external_ref': externalRef,
      // Wero / Bancontact are confirmed by hand until the PSP integration exists (R-TOP-7).
      if (method == 'wero' || method == 'bancontact') 'manual': true,
      'terms_version': ?termsVersion,
      'client_created_at': DateTime.now().toUtc().toIso8601String(),
    };

class CashierScreen extends ConsumerStatefulWidget {
  const CashierScreen({super.key});
  @override
  ConsumerState<CashierScreen> createState() => _CashierScreenState();
}

class _CashierScreenState extends ConsumerState<CashierScreen> {
  TagRef? _ref;
  TagInfo? _info;
  bool _waiting = false, _busy = false;
  int _tokens = 10;
  String _method = 'cash';
  String _cashoutMethod = 'cash';
  final _extRef = TextEditingController();
  String? _txId; // stable while the form is unchanged so a retry is idempotent
  PosResult? _result;
  String? _resultText;
  int _tab = 0;

  EventConfig? get _event => ref.read(catalogProvider).catalog?.event;

  Future<void> _scan() async {
    final l = AppLocalizations.of(context);
    setState(() => _waiting = true);
    try {
      final r = await ref.read(nfcProvider).readTag();
      final code = tagCodeFromUrl(r.ndefUrl);
      if (code == null) throw const ApiError('TAG_NOT_FOUND', '', 404);
      final tag = TagRef(code, r.uid);
      final info = await ref.read(apiProvider).lookupTag(tag);
      setState(() {
        _ref = tag;
        _info = info;
        _txId = null;
      });
    } on NfcCancelled {
      // ignored
    } on NfcUnavailable {
      _fail(l, 'NFC_UNAVAILABLE');
    } on ApiError catch (e) {
      _fail(l, e.code, e.details);
    } on NetworkException {
      _fail(l, 'NETWORK');
    } catch (_) {
      _fail(l, 'NFC_ERROR');
    } finally {
      if (mounted) setState(() => _waiting = false);
    }
  }

  void _fail(AppLocalizations l, String code, [Json d = const {}]) {
    setState(() => _result = PosResult.error(code, details: d));
  }

  Future<void> _confirmTopup() async {
    final l = AppLocalizations.of(context);
    final ev = _event;
    if (_ref == null || ev == null) return;
    if (_method != 'cash' && _extRef.text.trim().isEmpty) {
      _fail(l, 'EXTERNAL_REF_REQUIRED');
      return;
    }
    setState(() => _busy = true);
    _txId ??= uuid7();
    try {
      final t = await ref.read(apiProvider).createTopup(buildTopupBody(
            clientTxId: _txId!,
            tag: _ref!,
            method: _method,
            tokens: _tokens,
            tokenPriceCents: ev.tokenPriceCents,
            externalRef: _extRef.text.trim(),
            termsVersion: ev.termsVersion,
          ));
      setState(() {
        _result = PosResult.success(totalTokens: t.tokens, balance: t.balanceTokens, receiptNo: t.receiptNo);
        _resultText = l.topupDone(t.tokens);
        _info = TagInfo(_info!.tagCode, _info!.tagStatus, 'active', t.balanceTokens);
        _txId = null;
        _extRef.clear();
      });
    } on ApiError catch (e) {
      _fail(l, e.code, e.details);
    } on NetworkException {
      _fail(l, 'NETWORK'); // top-ups are online only; the same client_tx_id is reused on retry
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmCashout() async {
    final l = AppLocalizations.of(context);
    if (_ref == null) return;
    setState(() => _busy = true);
    _txId ??= uuid7();
    try {
      final c = await ref.read(apiProvider).createCashout({
        'client_tx_id': _txId,
        'tag': _ref!.toJson(),
        'tokens': null, // whole balance
        'method': _cashoutMethod,
        'reason_code': 'customer_request',
        'client_created_at': DateTime.now().toUtc().toIso8601String(),
      });
      setState(() {
        _result = PosResult.success(totalTokens: c.tokens, balance: c.balanceTokens);
        _resultText = l.cashoutDone(formatEuro(c.amountCents));
        _info = TagInfo(_info!.tagCode, _info!.tagStatus, 'active', c.balanceTokens);
        _txId = null;
      });
    } on ApiError catch (e) {
      _fail(l, e.code, e.details);
    } on NetworkException {
      _fail(l, 'NETWORK');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final ev = ref.watch(catalogProvider).catalog?.event;
    final price = ev?.tokenPriceCents ?? 200;
    final maxTokens = ev == null
        ? 50
        : [ev.maxTopupTokens, ev.maxBalanceTokens - (_info?.balanceTokens ?? 0)].reduce((a, b) => a < b ? a : b).clamp(1, 1000);
    if (_tokens > maxTokens) _tokens = maxTokens;
    final canTopup = _ref != null && !_busy && ev != null && (_method == 'cash' || _extRef.text.trim().isNotEmpty);

    return DefaultTabController(
      length: 2,
      child: AppScaffold(
        title: l.menuCashier,
        bottom: TabBar(
          onTap: (i) => setState(() {
            _tab = i;
            _txId = null;
          }),
          tabs: [Tab(icon: const Icon(Icons.add_card), text: l.tabTopup), Tab(icon: const Icon(Icons.currency_exchange), text: l.tabCashout)],
        ),
        body: Stack(children: [
          ListView(padding: const EdgeInsets.all(12), children: [
            _tagCard(l),
            const SizedBox(height: 12),
            if (_tab == 0) ...[
              Text(l.amountTokens, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final n in const [5, 10, 20])
                  ChoiceChip(
                    key: Key('preset-$n'),
                    label: Text('$n', style: const TextStyle(fontSize: 22)),
                    selected: _tokens == n,
                    materialTapTargetSize: MaterialTapTargetSize.padded,
                    visualDensity: const VisualDensity(horizontal: 2, vertical: 2),
                    onSelected: n > maxTokens ? null : (_) => setState(() {
                          _tokens = n;
                          _txId = null;
                        }),
                  ),
              ]),
              const SizedBox(height: 8),
              Row(children: [
                IconButton.filledTonal(
                    key: const Key('tokens-minus'),
                    iconSize: 32,
                    constraints: const BoxConstraints(minWidth: kTouch, minHeight: kTouch),
                    onPressed: _tokens > 1 ? () => setState(() { _tokens--; _txId = null; }) : null,
                    icon: const Icon(Icons.remove)),
                Expanded(
                    child: Center(
                        child: Text(l.tokensCount(_tokens),
                            key: const Key('tokens-value'),
                            style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w900)))),
                IconButton.filledTonal(
                    key: const Key('tokens-plus'),
                    iconSize: 32,
                    constraints: const BoxConstraints(minWidth: kTouch, minHeight: kTouch),
                    onPressed: _tokens < maxTokens ? () => setState(() { _tokens++; _txId = null; }) : null,
                    icon: const Icon(Icons.add)),
              ]),
              Center(child: Text(formatEuro(_tokens * price), style: const TextStyle(fontSize: 22))),
              const SizedBox(height: 12),
              Text(l.payMethod, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final m in topupMethods)
                  ChoiceChip(
                    key: Key('method-$m'),
                    avatar: Icon(methodIcon(m)),
                    label: Text(methodLabel(l, m), style: const TextStyle(fontSize: 18)),
                    selected: _method == m,
                    materialTapTargetSize: MaterialTapTargetSize.padded,
                    visualDensity: const VisualDensity(vertical: 2),
                    onSelected: (_) => setState(() {
                      _method = m;
                      _txId = null;
                    }),
                  ),
              ]),
              if (_method != 'cash')
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: TextField(
                    key: const Key('ext-ref'),
                    controller: _extRef,
                    onChanged: (_) => setState(() => _txId = null),
                    decoration: InputDecoration(labelText: l.extRef, border: const OutlineInputBorder()),
                  ),
                ),
              const SizedBox(height: 16),
              BigButton(
                  key: const Key('confirm-topup'),
                  label: l.confirmTopup(formatEuro(_tokens * price)),
                  icon: Icons.check,
                  onPressed: canTopup ? _confirmTopup : null),
            ] else ...[
              Text(l.payMethod, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final m in cashoutMethods)
                  ChoiceChip(
                    avatar: Icon(methodIcon(m)),
                    label: Text(methodLabel(l, m), style: const TextStyle(fontSize: 18)),
                    selected: _cashoutMethod == m,
                    materialTapTargetSize: MaterialTapTargetSize.padded,
                    visualDensity: const VisualDensity(vertical: 2),
                    onSelected: (_) => setState(() => _cashoutMethod = m),
                  ),
              ]),
              const SizedBox(height: 16),
              if (_info != null)
                Center(
                    child: Text(formatEuro(_info!.balanceTokens * price),
                        style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800))),
              const SizedBox(height: 12),
              BigButton(
                  key: const Key('confirm-cashout'),
                  label: l.refundAll,
                  icon: Icons.currency_exchange,
                  color: kWarn,
                  onPressed: _ref != null && !_busy && (_info?.balanceTokens ?? 0) > 0 ? _confirmCashout : null),
            ],
          ]),
          if (_waiting) TapTagPrompt(title: l.tapTag, onCancel: () => ref.read(nfcProvider).cancel()),
          if (_result != null)
            ResultOverlay(
              key: ValueKey(_result),
              kind: _result!.kind,
              title: _result!.kind == ResultKind.success ? (_resultText ?? l.paid) : l.paymentFailed,
              lines: _result!.kind == ResultKind.success
                  ? [l.newBalance(l.tokensCount(_result!.balance ?? 0)), if (_result!.receiptNo != null) l.receiptNo(_result!.receiptNo!)]
                  : [errorMessage(l, _result!.code ?? '', _result!.details)],
              onDone: () => setState(() => _result = null),
            ),
        ]),
      ),
    );
  }

  Widget _tagCard(AppLocalizations l) => Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Icon(_info == null ? Icons.nfc : Icons.check_circle, size: 40, color: _info == null ? null : kOk),
            const SizedBox(width: 12),
            Expanded(
              child: _info == null
                  ? Text(l.tapTagFirst, style: const TextStyle(fontSize: 20))
                  : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('…${last4(_info!.tagCode)}', style: const TextStyle(fontSize: 16)),
                      Text(l.tokensCount(_info!.balanceTokens),
                          key: const Key('tag-balance'), style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w900)),
                      if (_info!.walletStatus == 'blocked')
                        Row(children: [const Icon(Icons.block, color: kBad, size: 18), Text(' ${l.errTagBlocked}', style: const TextStyle(color: kBad))]),
                    ]),
            ),
            FilledButton(
              key: const Key('scan'),
              style: FilledButton.styleFrom(minimumSize: const Size(96, kTouch)),
              onPressed: _waiting || _busy ? null : _scan,
              child: Text(_info == null ? l.readTag : l.otherTag),
            ),
          ]),
        ),
      );
}
