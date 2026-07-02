import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'core/l10n.dart';
import 'screens/home_screen.dart';
import 'screens/speed_test_screen.dart';
import 'screens/placement_screen.dart';
import 'screens/optimizer_screen.dart';

void main() => runApp(const MawjaApp());

/// هوية «موجة» البصرية — Deep Ocean:
/// خلفية ليلية عميقة، وإشارة فيروزية متوهجة كأنها نبض السونار.
class MawjaTheme {
  static const bg = Color(0xFF070C17);        // ليل عميق
  static const surface = Color(0xFF101A2E);   // سطح البطاقات
  static const surface2 = Color(0xFF16233D);
  static const signal = Color(0xFF00E5A0);    // نبض الإشارة
  static const wave = Color(0xFF37B6FF);      // موجة زرقاء
  static const warn = Color(0xFFFFB547);
  static const danger = Color(0xFFFF5470);
  static const ink = Color(0xFFEAF2FF);
  static const inkDim = Color(0xFF8A9BB8);
}

class MawjaApp extends StatefulWidget {
  const MawjaApp({super.key});
  @override
  State<MawjaApp> createState() => _MawjaAppState();

  static _MawjaAppState of(BuildContext c) =>
      c.findAncestorStateOfType<_MawjaAppState>()!;
}

class _MawjaAppState extends State<MawjaApp> {
  Locale _locale = const Locale('ar');

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((p) {
      final code = p.getString('lang');
      if (code != null) setState(() => _locale = Locale(code));
    });
  }

  void toggleLocale() async {
    final next = _locale.languageCode == 'ar' ? 'en' : 'ar';
    setState(() => _locale = Locale(next));
    (await SharedPreferences.getInstance()).setString('lang', next);
  }

  @override
  Widget build(BuildContext context) {
    final isAr = _locale.languageCode == 'ar';
    final textTheme = (isAr
            ? GoogleFonts.tajawalTextTheme()
            : GoogleFonts.spaceGroteskTextTheme())
        .apply(bodyColor: MawjaTheme.ink, displayColor: MawjaTheme.ink);

    return MaterialApp(
      title: 'Mawja | موجة',
      debugShowCheckedModeBanner: false,
      locale: _locale,
      supportedLocales: L10n.supported,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: MawjaTheme.bg,
        colorScheme: const ColorScheme.dark(
          primary: MawjaTheme.signal,
          secondary: MawjaTheme.wave,
          surface: MawjaTheme.surface,
        ),
        textTheme: textTheme,
        cardTheme: CardThemeData(
          color: MawjaTheme.surface,
          elevation: 0,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(22),
              side: BorderSide(color: Colors.white.withOpacity(.06))),
        ),
      ),
      home: const _Shell(),
    );
  }
}

class _Shell extends StatefulWidget {
  const _Shell();
  @override
  State<_Shell> createState() => _ShellState();
}

class _ShellState extends State<_Shell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final pages = const [
      HomeScreen(),
      SpeedTestScreen(),
      PlacementScreen(),
      OptimizerScreen(),
    ];
    return Scaffold(
      body: SafeArea(child: pages[_tab]),
      bottomNavigationBar: NavigationBar(
        backgroundColor: MawjaTheme.surface,
        indicatorColor: MawjaTheme.signal.withOpacity(.15),
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          NavigationDestination(
              icon: const Icon(Icons.radar), label: L10n.t(context, 'home')),
          NavigationDestination(
              icon: const Icon(Icons.speed),
              label: L10n.t(context, 'speedTest')),
          NavigationDestination(
              icon: const Icon(Icons.travel_explore),
              label: L10n.t(context, 'placement')),
          NavigationDestination(
              icon: const Icon(Icons.auto_fix_high),
              label: L10n.t(context, 'optimizer')),
        ],
      ),
    );
  }
}
