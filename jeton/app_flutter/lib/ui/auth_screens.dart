import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config.dart';
import '../l10n/gen/app_localizations.dart';
import '../models/models.dart';
import '../state/providers.dart';
import 'common.dart';

/// Layer 1: exchange the enrolment code for a device token.
class EnrollDeviceScreen extends ConsumerStatefulWidget {
  const EnrollDeviceScreen({super.key});
  @override
  ConsumerState<EnrollDeviceScreen> createState() => _EnrollDeviceScreenState();
}

class _EnrollDeviceScreenState extends ConsumerState<EnrollDeviceScreen> {
  final _code = TextEditingController(text: useFakeApi ? 'DEMO2026' : '');
  final _name = TextEditingController(text: 'Terminal');
  String? _error;
  bool _busy = false;

  Future<void> _submit() async {
    final l = AppLocalizations.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).enroll(_code.text, _name.text.trim());
    } catch (e) {
      if (mounted) setState(() => _error = errorOf(l, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.enrollTitle)),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: ListView(padding: const EdgeInsets.all(20), shrinkWrap: true, children: [
            Text(l.enrollHint, style: const TextStyle(fontSize: 18)),
            const SizedBox(height: 16),
            TextField(
              key: const Key('enroll-code'),
              controller: _code,
              textCapitalization: TextCapitalization.characters,
              inputFormatters: [LengthLimitingTextInputFormatter(8)],
              style: const TextStyle(fontSize: 28, letterSpacing: 4),
              decoration: InputDecoration(labelText: l.enrollCode, border: const OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _name,
              decoration: InputDecoration(labelText: l.deviceName, border: const OutlineInputBorder()),
            ),
            if (useFakeApi) Padding(padding: const EdgeInsets.only(top: 8), child: Text(l.demoHint)),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Row(children: [
                  const Icon(Icons.error, color: kBad),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_error!, style: const TextStyle(color: kBad, fontSize: 16, fontWeight: FontWeight.w700))),
                ]),
              ),
            const SizedBox(height: 20),
            BigButton(label: l.enrollButton, icon: Icons.link, onPressed: _busy ? null : _submit),
          ]),
        ),
      ),
    );
  }
}

final _staffProvider = FutureProvider.autoDispose<List<StaffPublic>>((ref) {
  ref.watch(authProvider.select((a) => a.deviceToken));
  return ref.read(apiProvider).listLoginStaff();
});

/// Layer 2: staff PIN login on the enrolled device.
class LoginScreen extends ConsumerWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final staff = ref.watch(_staffProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l.loginTitle), actions: [
        PopupMenuButton<String>(
          icon: const Icon(Icons.language),
          onSelected: (v) => ref.read(localeProvider.notifier).set(Locale(v)),
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'fr', child: Text('Français')),
            PopupMenuItem(value: 'nl', child: Text('Nederlands')),
            PopupMenuItem(value: 'en', child: Text('English')),
          ],
        ),
      ]),
      body: staff.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(errorOf(l, e)),
            const SizedBox(height: 12),
            FilledButton(onPressed: () => ref.invalidate(_staffProvider), child: Text(l.retry)),
          ]),
        ),
        data: (list) => ListView(
          padding: const EdgeInsets.all(12),
          children: [
            for (final s in list)
              Card(
                child: ListTile(
                  key: Key('staff-${s.id}'),
                  minTileHeight: 72,
                  leading: Icon(_roleIcon(s.role), size: 32),
                  title: Text(s.displayName, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                  subtitle: Text(roleLabel(l, s.role)),
                  onTap: () => showDialog<void>(context: context, builder: (_) => PinDialog(staff: s)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

IconData _roleIcon(String r) => switch (r) {
      Roles.admin => Icons.admin_panel_settings,
      Roles.cashier => Icons.point_of_sale,
      Roles.vendor => Icons.local_bar,
      _ => Icons.fact_check,
    };

String roleLabel(AppLocalizations l, String r) => switch (r) {
      Roles.admin => l.roleAdmin,
      Roles.cashier => l.roleCashier,
      Roles.vendor => l.roleVendor,
      _ => l.roleAuditor,
    };

class PinDialog extends ConsumerStatefulWidget {
  const PinDialog({super.key, required this.staff});
  final StaffPublic staff;
  @override
  ConsumerState<PinDialog> createState() => _PinDialogState();
}

class _PinDialogState extends ConsumerState<PinDialog> {
  String _pin = '';
  String? _error;
  bool _busy = false;

  Future<void> _submit() async {
    final l = AppLocalizations.of(context);
    if (_pin.length < 4) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).login(widget.staff.id, _pin);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = errorOf(l, e);
          _pin = '';
          _busy = false;
        });
      }
    }
  }

  void _press(String d) {
    if (_busy || _pin.length >= 8) return;
    HapticFeedback.selectionClick();
    setState(() => _pin += d);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    Widget key(String label, {VoidCallback? onTap, IconData? icon, Key? k}) => Padding(
          padding: const EdgeInsets.all(4),
          child: SizedBox(
            width: 72,
            height: 64,
            child: FilledButton.tonal(
              key: k,
              onPressed: onTap,
              child: icon != null ? Icon(icon) : Text(label, style: const TextStyle(fontSize: 26)),
            ),
          ),
        );
    return AlertDialog(
      title: Text(l.pinTitle(widget.staff.displayName)),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(List.filled(_pin.length, '●').join(' ').padRight(1, ' '),
            key: const Key('pin-dots'), style: const TextStyle(fontSize: 28, letterSpacing: 2)),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.error, color: kBad, size: 20),
              const SizedBox(width: 6),
              Flexible(child: Text(_error!, style: const TextStyle(color: kBad, fontWeight: FontWeight.w700))),
            ]),
          ),
        const SizedBox(height: 8),
        for (final row in const [
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9']
        ])
          Row(mainAxisSize: MainAxisSize.min, children: [
            for (final d in row) key(d, k: Key('pin-$d'), onTap: () => _press(d)),
          ]),
        Row(mainAxisSize: MainAxisSize.min, children: [
          key('', icon: Icons.backspace_outlined, onTap: () => setState(() => _pin = _pin.isEmpty ? '' : _pin.substring(0, _pin.length - 1))),
          key('0', k: const Key('pin-0'), onTap: () => _press('0')),
          key('', k: const Key('pin-ok'), icon: Icons.check, onTap: _pin.length >= 4 && !_busy ? _submit : null),
        ]),
      ]),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel))],
    );
  }
}
