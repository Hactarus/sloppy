import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'l10n/gen/app_localizations.dart';
import 'models/models.dart';
import 'state/providers.dart';
import 'ui/admin_screen.dart';
import 'ui/auth_screens.dart';
import 'ui/cashier_screen.dart';
import 'ui/enroll_tags_screen.dart';
import 'ui/guest_page.dart';
import 'ui/home_queue.dart';
import 'ui/nfc_simulator.dart';
import 'ui/pos_screen.dart';

GoRouter buildRouter(WidgetRef ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen(authProvider, (_, _) => refresh.value++);
  return GoRouter(
    refreshListenable: refresh,
    initialLocation: '/home',
    redirect: (context, state) {
      final path = state.uri.path;
      if (path.startsWith('/t/')) return null; // public guest page: never gated
      final a = ref.read(authProvider);
      if (!a.enrolled) return path == '/enroll' ? null : '/enroll';
      if (!a.loggedIn) return path == '/login' ? null : '/login';
      if (path == '/enroll' || path == '/login' || path == '/') {
        return a.session?.role == Roles.vendor ? '/pos' : '/home';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/enroll', builder: (_, _) => const EnrollDeviceScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/home', builder: (_, _) => const HomeScreen()),
      GoRoute(path: '/pos', builder: (_, _) => const PosScreen()),
      GoRoute(path: '/cashier', builder: (_, _) => const CashierScreen()),
      GoRoute(path: '/tags', builder: (_, _) => const EnrollTagsScreen()),
      GoRoute(path: '/admin', builder: (_, _) => const AdminScreen()),
      GoRoute(path: '/queue', builder: (_, _) => const QueueScreen()),
      GoRoute(path: '/t/:code', builder: (_, s) => GuestPage(tagCode: s.pathParameters['code']!)),
    ],
  );
}

ThemeData _theme() {
  final scheme = ColorScheme.fromSeed(seedColor: const Color(0xFF0B3D91), brightness: Brightness.light, contrastLevel: 0.6);
  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    visualDensity: VisualDensity.standard,
    materialTapTargetSize: MaterialTapTargetSize.padded,
    filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(minimumSize: const Size(64, 56))),
    outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(minimumSize: const Size(64, 56))),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(minimumSize: const Size(64, 56))),
    listTileTheme: const ListTileThemeData(minTileHeight: 56),
  );
}

class JetonApp extends ConsumerStatefulWidget {
  const JetonApp({super.key});
  @override
  ConsumerState<JetonApp> createState() => _JetonAppState();
}

class _JetonAppState extends ConsumerState<JetonApp> {
  late final GoRouter _router = buildRouter(ref);

  @override
  void initState() {
    super.initState();
    ref.read(syncProvider.notifier).start();
  }

  @override
  Widget build(BuildContext context) {
    final locale = ref.watch(localeProvider);
    return MaterialApp.router(
      title: 'Jeton',
      debugShowCheckedModeBanner: false,
      theme: _theme(),
      routerConfig: _router,
      locale: locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (context, child) => NfcSimulator(child: child ?? const SizedBox.shrink()),
    );
  }
}
