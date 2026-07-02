import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import '../core/l10n.dart';
import '../core/net_engine.dart';
import '../main.dart';

/// الرئيسية: رادار حيّ يمسح ويعرض نبض شبكتك لحظياً.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _sweep =
      AnimationController(vsync: this, duration: const Duration(seconds: 3))
        ..repeat();
  Timer? _timer;
  String _ssid = '—';
  int? _rssi;
  double _ping = -1;

  @override
  void initState() {
    super.initState();
    _refresh();
    _timer = Timer.periodic(const Duration(seconds: 4), (_) => _refresh());
  }

  Future<void> _refresh() async {
    final s = await NetEngine.ssid();
    final r = await NetEngine.rssi();
    final p = await NetEngine.ping(samples: 2);
    if (mounted) setState(() { _ssid = s; _rssi = r; _ping = p; });
  }

  @override
  void dispose() {
    _sweep.dispose();
    _timer?.cancel();
    super.dispose();
  }

  String _quality(BuildContext c) {
    final pct = _rssi != null
        ? NetEngine.rssiToPercent(_rssi!)
        : (_ping < 0 ? 0 : (100 - _ping.clamp(5, 300) / 3).round());
    if (pct >= 75) return L10n.t(c, 'excellent');
    if (pct >= 55) return L10n.t(c, 'good');
    if (pct >= 35) return L10n.t(c, 'fair');
    return L10n.t(c, 'weak');
  }

  @override
  Widget build(BuildContext context) {
    final pct = _rssi != null
        ? NetEngine.rssiToPercent(_rssi!)
        : (_ping < 0 ? 0 : (100 - _ping.clamp(5, 300) / 3).round());

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(L10n.t(context, 'appName'),
                  style: Theme.of(context)
                      .textTheme
                      .headlineMedium
                      ?.copyWith(fontWeight: FontWeight.w800)),
              Text(L10n.t(context, 'tagline'),
                  style: const TextStyle(color: MawjaTheme.inkDim)),
            ]),
            IconButton.filledTonal(
              onPressed: () => MawjaApp.of(context).toggleLocale(),
              icon: const Icon(Icons.translate),
            ),
          ],
        ),
        const SizedBox(height: 24),
        // ── الرادار الحي ──
        AspectRatio(
          aspectRatio: 1,
          child: AnimatedBuilder(
            animation: _sweep,
            builder: (_, __) => CustomPaint(
              painter: _RadarPainter(sweep: _sweep.value, level: pct / 100),
              child: Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text('$pct%',
                      style: Theme.of(context)
                          .textTheme
                          .displayMedium
                          ?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: MawjaTheme.signal)),
                  Text(_quality(context),
                      style: const TextStyle(color: MawjaTheme.inkDim)),
                ]),
              ),
            ),
          ),
        ),
        const SizedBox(height: 24),
        Row(children: [
          _StatCard(
              icon: Icons.wifi,
              label: L10n.t(context, 'network'),
              value: _ssid),
          const SizedBox(width: 12),
          _StatCard(
              icon: Icons.bolt,
              label: L10n.t(context, 'ping'),
              value: _ping < 0
                  ? '—'
                  : '${_ping.toStringAsFixed(0)} ${L10n.t(context, 'ms')}'),
        ]),
        const SizedBox(height: 12),
        if (_rssi != null)
          Row(children: [
            _StatCard(
                icon: Icons.network_check,
                label: L10n.t(context, 'signal'),
                value: '$_rssi ${L10n.t(context, 'dbm')}'),
          ]),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  final IconData icon;
  final String label, value;
  const _StatCard(
      {required this.icon, required this.label, required this.value});
  @override
  Widget build(BuildContext context) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(children: [
              Icon(icon, color: MawjaTheme.wave),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(label,
                          style: const TextStyle(
                              color: MawjaTheme.inkDim, fontSize: 12)),
                      Text(value,
                          overflow: TextOverflow.ellipsis,
                          style:
                              const TextStyle(fontWeight: FontWeight.w700)),
                    ]),
              ),
            ]),
          ),
        ),
      );
}

/// رسم الرادار: حلقات سونار + ذراع مسح متوهجة + قوس مستوى الإشارة.
class _RadarPainter extends CustomPainter {
  final double sweep; // 0..1
  final double level; // 0..1
  _RadarPainter({required this.sweep, required this.level});

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.shortestSide / 2 - 8;

    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = Colors.white.withOpacity(.07);
    for (var i = 1; i <= 4; i++) {
      canvas.drawCircle(c, r * i / 4, ring);
    }

    // ذراع المسح
    final angle = sweep * 2 * pi;
    final sweepPaint = Paint()
      ..shader = SweepGradient(
        startAngle: angle - .9,
        endAngle: angle,
        colors: [Colors.transparent, MawjaTheme.signal.withOpacity(.35)],
        transform: GradientRotation(angle - .9),
      ).createShader(Rect.fromCircle(center: c, radius: r));
    canvas.drawCircle(c, r, sweepPaint);

    // قوس المستوى
    final arc = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 10
      ..shader = const LinearGradient(
              colors: [MawjaTheme.wave, MawjaTheme.signal])
          .createShader(Rect.fromCircle(center: c, radius: r));
    canvas.drawArc(Rect.fromCircle(center: c, radius: r - 14), -pi / 2,
        2 * pi * level, false, arc);
  }

  @override
  bool shouldRepaint(covariant _RadarPainter old) =>
      old.sweep != sweep || old.level != level;
}
