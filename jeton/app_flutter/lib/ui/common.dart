import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../l10n/gen/app_localizations.dart';
import '../models/models.dart';
import '../offline/queue.dart';
import '../state/pos_controller.dart';
import '../state/providers.dart';

/// Minimum touch target (jeton/CLAUDE.md: >= 56 px).
const double kTouch = 56;

const kOk = Color(0xFF1B6E34);
const kBad = Color(0xFFB3261E);
const kWarn = Color(0xFF8A5300);

String tokensText(AppLocalizations l, int n) => l.tokensCount(n);

/// Localised message for an API / local error code. Switch on `code`, never on server text.
String errorMessage(AppLocalizations l, String code, [Json details = const {}]) {
  String n(String k) => '${details[k] ?? '?'}';
  switch (code) {
    case 'INSUFFICIENT_BALANCE':
      return l.errInsufficientBalance(n('balance_tokens'), n('required_tokens'));
    case 'TAG_UID_MISMATCH':
      return l.errTagUidMismatch;
    case 'TAG_NOT_FOUND':
    case 'NOT_FOUND':
      return l.errTagNotFound;
    case 'TAG_BLOCKED':
      return l.errTagBlocked;
    case 'TAG_NOT_ACTIVE':
      return l.errTagNotActive;
    case 'TAG_ALREADY_ENROLLED':
      return l.errTagAlreadyEnrolled;
    case 'PRICE_MISMATCH':
      return l.errPriceMismatch;
    case 'AGE_CHECK_REQUIRED':
      return l.errAgeCheck;
    case 'TIP_TOO_HIGH':
    case 'TIP_DISABLED':
      return l.errTip;
    case 'STAND_MISMATCH':
    case 'FORBIDDEN':
      return l.errForbidden;
    case 'UNAUTHENTICATED':
    case 'TOKEN_EXPIRED':
      return l.errSessionExpired;
    case 'DEVICE_REVOKED':
      return l.errDeviceRevoked;
    case 'EVENT_NOT_OPEN':
    case 'EVENT_CLOSED':
      return l.errEventClosed;
    case 'INVALID_CREDENTIALS':
      return l.errWrongPin;
    case 'PIN_LOCKED':
      return l.errPinLocked;
    case 'ENROLLMENT_CODE_INVALID':
      return l.errEnrollCode;
    case 'LIMIT_EXCEEDED':
      return l.errLimit(n('limit'), n('would_be'));
    case 'EXTERNAL_REF_REQUIRED':
      return l.errRefRequired;
    case 'EXTERNAL_REF_ALREADY_USED':
      return l.errRefUsed;
    case 'INVALID_AMOUNT':
      return l.errAmount;
    case 'RATE_LIMITED':
      return l.errRateLimited;
    case 'DUPLICATE_TX':
      return l.errDuplicate;
    case 'OFFLINE_CAP':
      return l.errOfflineCap(n('cap'), n('spent'));
    case 'NFC_UNAVAILABLE':
      return l.errNfcUnavailable;
    case 'NFC_ERROR':
    case 'TAG_LOST':
      return l.errNfc;
    case 'READBACK_FAILED':
      return l.errReadback;
    case 'NETWORK':
      return l.errNetwork;
    default:
      return l.errGeneric(code);
  }
}

String errorOf(AppLocalizations l, Object e) {
  if (e is ApiError) return errorMessage(l, e.code, e.details);
  if (e is NetworkException) return l.errNetwork;
  return l.errGeneric(e.runtimeType.toString());
}

/// Common page frame: training banner, offline pill, language / logout menu.
class AppScaffold extends ConsumerWidget {
  const AppScaffold({super.key, required this.title, required this.body, this.bottom, this.showBack = true});
  final String title;
  final Widget body;
  final PreferredSizeWidget? bottom;
  final bool showBack;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final session = ref.watch(authProvider.select((a) => a.session));
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        bottom: bottom,
        automaticallyImplyLeading: showBack,
        actions: [
          const SyncPill(),
          PopupMenuButton<String>(
            tooltip: l.menu,
            icon: const Icon(Icons.more_vert),
            onSelected: (v) async {
              switch (v) {
                case 'home':
                  context.go('/home');
                case 'queue':
                  context.push('/queue');
                case 'logout':
                  await ref.read(authProvider.notifier).logout();
                default:
                  ref.read(localeProvider.notifier).set(v == 'sys' ? null : Locale(v));
              }
            },
            itemBuilder: (_) => [
              PopupMenuItem(value: 'home', child: Text(l.menuHome)),
              PopupMenuItem(value: 'queue', child: Text(l.menuQueue)),
              const PopupMenuDivider(),
              const PopupMenuItem(value: 'fr', child: Text('Français')),
              const PopupMenuItem(value: 'nl', child: Text('Nederlands')),
              const PopupMenuItem(value: 'en', child: Text('English')),
              const PopupMenuDivider(),
              PopupMenuItem(value: 'logout', child: Text(l.logout)),
            ],
          ),
        ],
      ),
      body: Column(children: [
        if (session?.training ?? false)
          Semantics(
            liveRegion: true,
            child: Container(
              width: double.infinity,
              color: const Color(0xFFFFD600),
              padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 12),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                const Icon(Icons.science, color: Colors.black),
                const SizedBox(width: 8),
                Flexible(
                    child: Text(l.trainingBanner,
                        style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w800))),
              ]),
            ),
          ),
        Expanded(child: body),
      ]),
    );
  }
}

/// "offline - 3 pending" pill (hidden when online with nothing queued).
class SyncPill extends ConsumerWidget {
  const SyncPill({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final online = ref.watch(onlineProvider);
    final queue = ref.watch(queueProvider);
    final syncing = ref.watch(syncProvider.select((s) => s.syncing));
    final pending = queue.where((q) => q.status == QueueStatus.pending).length;
    final rejected = queue.length - pending;
    if (online && pending == 0 && rejected == 0) return const SizedBox.shrink();
    final bad = rejected > 0;
    final text = !online ? l.pillOffline(pending) : (bad ? l.pillRejected(rejected) : l.pillSyncing(pending));
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: ActionChip(
        key: const Key('sync-pill'),
        avatar: syncing
            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
            : Icon(!online ? Icons.cloud_off : (bad ? Icons.error : Icons.sync), size: 18),
        label: Text(text),
        backgroundColor: !online ? const Color(0xFFFFE0B2) : (bad ? const Color(0xFFFFCDD2) : const Color(0xFFBBDEFB)),
        labelStyle: const TextStyle(color: Colors.black, fontWeight: FontWeight.w700),
        onPressed: () {
          ref.read(syncProvider.notifier).flush();
          context.push('/queue');
        },
      ),
    );
  }
}

/// Full-screen outcome: icon + colour + text, haptic + sound, auto-dismiss.
class ResultOverlay extends StatefulWidget {
  const ResultOverlay({super.key, required this.kind, required this.title, this.lines = const [], required this.onDone});
  final ResultKind kind;
  final String title;
  final List<String> lines;
  final VoidCallback onDone;

  @override
  State<ResultOverlay> createState() => _ResultOverlayState();
}

class _ResultOverlayState extends State<ResultOverlay> {
  Timer? _t;

  @override
  void initState() {
    super.initState();
    if (widget.kind == ResultKind.error) {
      HapticFeedback.heavyImpact();
      SystemSound.play(SystemSoundType.alert);
    } else {
      HapticFeedback.mediumImpact();
      SystemSound.play(SystemSoundType.click);
    }
    _t = Timer(widget.kind == ResultKind.error ? const Duration(milliseconds: 3500) : const Duration(milliseconds: 1500), widget.onDone);
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final (color, icon) = switch (widget.kind) {
      ResultKind.success => (kOk, Icons.check_circle),
      ResultKind.error => (kBad, Icons.cancel),
      ResultKind.queued => (kWarn, Icons.cloud_off),
    };
    return Positioned.fill(
      child: Semantics(
        liveRegion: true,
        label: widget.title,
        child: Material(
          key: Key('result-${widget.kind.name}'),
          color: color,
          child: InkWell(
            onTap: widget.onDone,
            child: SafeArea(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Icon(icon, size: 140, color: Colors.white),
                    const SizedBox(height: 16),
                    Text(widget.title,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800)),
                    for (final s in widget.lines)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(s,
                            textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 22)),
                      ),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Big, high-contrast button (>= 56 px tall).
class BigButton extends StatelessWidget {
  const BigButton({super.key, required this.label, required this.onPressed, this.icon, this.color});
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final Color? color;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 64,
        child: FilledButton.icon(
          style: FilledButton.styleFrom(
              backgroundColor: color,
              minimumSize: const Size(kTouch, 64),
              textStyle: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          onPressed: onPressed,
          icon: icon == null ? const SizedBox.shrink() : Icon(icon, size: 28),
          label: Text(label),
        ),
      );
}

/// Waiting for a tag.
class TapTagPrompt extends StatelessWidget {
  const TapTagPrompt({super.key, required this.title, this.subtitle, required this.onCancel});
  final String title;
  final String? subtitle;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Positioned.fill(
      child: Material(
        key: const Key('armed'),
        color: Theme.of(context).colorScheme.primary,
        child: SafeArea(
          child: Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const _Pulse(child: Icon(Icons.nfc, size: 150, color: Colors.white)),
              const SizedBox(height: 16),
              Text(title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800)),
              if (subtitle != null)
                Text(subtitle!, style: const TextStyle(color: Colors.white, fontSize: 24)),
              const SizedBox(height: 32),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white, width: 2),
                    minimumSize: const Size(200, 64)),
                onPressed: onCancel,
                icon: const Icon(Icons.close),
                label: Text(l.cancel, style: const TextStyle(fontSize: 20)),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class _Pulse extends StatefulWidget {
  const _Pulse({required this.child});
  final Widget child;
  @override
  State<_Pulse> createState() => _PulseState();
}

class _PulseState extends State<_Pulse> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat(reverse: true);
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      ScaleTransition(scale: Tween(begin: 0.9, end: 1.1).animate(_c), child: widget.child);
}
