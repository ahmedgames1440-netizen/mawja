import 'package:flutter/material.dart';
import '../core/l10n.dart';
import '../core/net_engine.dart';
import '../main.dart';

/// اختبار سرعة حقيقي عبر خوادم Cloudflare — تحميل، رفع، بنق، تذبذب.
class SpeedTestScreen extends StatefulWidget {
  const SpeedTestScreen({super.key});
  @override
  State<SpeedTestScreen> createState() => _SpeedTestScreenState();
}

class _SpeedTestScreenState extends State<SpeedTestScreen> {
  bool _running = false;
  double _down = 0, _up = 0, _ping = 0, _jitter = 0;
  String _phase = '';

  Future<void> _run() async {
    setState(() { _running = true; _down = 0; _up = 0; _phase = 'ping'; });
    _ping = await NetEngine.ping();
    _jitter = await NetEngine.jitter();
    if (mounted) setState(() => _phase = 'download');
    await for (final s in NetEngine.downloadTest(mb: 25)) {
      if (!mounted) return;
      setState(() => _down = s);
    }
    if (mounted) setState(() => _phase = 'upload');
    await for (final s in NetEngine.uploadTest(mb: 8)) {
      if (!mounted) return;
      setState(() => _up = s);
    }
    if (mounted) setState(() { _running = false; _phase = ''; });
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(L10n.t(context, 'speedTest'),
            style: Theme.of(context)
                .textTheme
                .headlineSmall
                ?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 24),
        // العداد الرئيسي
        Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 36),
            child: Column(children: [
              TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: _phase == 'upload' ? _up : _down),
                duration: const Duration(milliseconds: 400),
                builder: (_, v, __) => Text(
                  v.toStringAsFixed(1),
                  style: Theme.of(context).textTheme.displayLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: _phase == 'upload'
                          ? MawjaTheme.wave
                          : MawjaTheme.signal),
                ),
              ),
              Text(L10n.t(context, 'mbps'),
                  style: const TextStyle(color: MawjaTheme.inkDim)),
              const SizedBox(height: 8),
              if (_running)
                Text(L10n.t(context, 'testing'),
                    style: const TextStyle(color: MawjaTheme.warn)),
            ]),
          ),
        ),
        const SizedBox(height: 16),
        Row(children: [
          _Metric(L10n.t(context, 'download'),
              '${_down.toStringAsFixed(1)}', MawjaTheme.signal),
          _Metric(L10n.t(context, 'upload'),
              '${_up.toStringAsFixed(1)}', MawjaTheme.wave),
          _Metric(L10n.t(context, 'ping'),
              _ping <= 0 ? '—' : _ping.toStringAsFixed(0), MawjaTheme.warn),
          _Metric(L10n.t(context, 'jitter'),
              _jitter <= 0 ? '—' : _jitter.toStringAsFixed(0),
              MawjaTheme.danger),
        ]),
        const SizedBox(height: 28),
        FilledButton.icon(
          style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 18),
              backgroundColor: MawjaTheme.signal,
              foregroundColor: Colors.black),
          onPressed: _running ? null : _run,
          icon: const Icon(Icons.play_arrow_rounded),
          label: Text(L10n.t(context, 'start'),
              style: const TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w800)),
        ),
      ],
    );
  }
}

class _Metric extends StatelessWidget {
  final String label, value;
  final Color color;
  const _Metric(this.label, this.value, this.color);
  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(children: [
          Text(value,
              style: TextStyle(
                  color: color, fontWeight: FontWeight.w800, fontSize: 20)),
          Text(label,
              style:
                  const TextStyle(color: MawjaTheme.inkDim, fontSize: 12)),
        ]),
      );
}
