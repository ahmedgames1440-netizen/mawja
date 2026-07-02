import 'dart:io';
import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../core/l10n.dart';
import '../core/net_engine.dart';
import '../main.dart';

/// المحسّن: هنا يحدث "التسريع" الحقيقي —
/// كشف ازدحام القنوات، أسرع DNS، ونصائح عملية.
class OptimizerScreen extends StatefulWidget {
  const OptimizerScreen({super.key});
  @override
  State<OptimizerScreen> createState() => _OptimizerScreenState();
}

class _OptimizerScreenState extends State<OptimizerScreen> {
  ChannelReport? _report;
  List<DnsResult>? _dns;
  bool _busyCh = false, _busyDns = false;

  Future<void> _scanChannels() async {
    setState(() => _busyCh = true);
    final r = await NetEngine.channelReport();
    if (mounted) setState(() { _report = r; _busyCh = false; });
  }

  Future<void> _raceDns() async {
    setState(() => _busyDns = true);
    final r = await NetEngine.dnsRace();
    if (mounted) setState(() { _dns = r; _busyDns = false; });
  }

  @override
  Widget build(BuildContext context) {
    final isAr = Localizations.localeOf(context).languageCode == 'ar';
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(L10n.t(context, 'optimizer'),
            style: Theme.of(context)
                .textTheme
                .headlineSmall
                ?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 20),

        // ── تحليل القنوات (Android) ──
        if (Platform.isAndroid) ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    const Icon(Icons.stacked_bar_chart,
                        color: MawjaTheme.wave),
                    const SizedBox(width: 8),
                    Text(L10n.t(context, 'channelAnalysis'),
                        style:
                            const TextStyle(fontWeight: FontWeight.w800)),
                    const Spacer(),
                    IconButton(
                        onPressed: _busyCh ? null : _scanChannels,
                        icon: const Icon(Icons.refresh)),
                  ]),
                  if (_report != null) ...[
                    SizedBox(
                      height: 160,
                      child: BarChart(BarChartData(
                        gridData: const FlGridData(show: false),
                        borderData: FlBorderData(show: false),
                        titlesData: FlTitlesData(
                          leftTitles: const AxisTitles(),
                          topTitles: const AxisTitles(),
                          rightTitles: const AxisTitles(),
                          bottomTitles: AxisTitles(
                              sideTitles: SideTitles(
                                  showTitles: true,
                                  getTitlesWidget: (v, _) => Text(
                                      '${v.toInt()}',
                                      style: const TextStyle(
                                          fontSize: 10,
                                          color: MawjaTheme.inkDim)))),
                        ),
                        barGroups: _report!.counts.entries
                            .map((e) => BarChartGroupData(x: e.key, barRods: [
                                  BarChartRodData(
                                      toY: e.value.toDouble(),
                                      width: 10,
                                      color: e.key == _report!.myChannel
                                          ? MawjaTheme.warn
                                          : e.key == _report!.suggested
                                              ? MawjaTheme.signal
                                              : MawjaTheme.wave
                                                  .withOpacity(.4))
                                ]))
                            .toList(),
                      )),
                    ),
                    const SizedBox(height: 8),
                    if (_report!.crowded)
                      Text(L10n.t(context, 'crowdedChannel'),
                          style: const TextStyle(color: MawjaTheme.warn)),
                    Text(
                        '${L10n.t(context, 'suggestedChannel')}: ${_report!.suggested}',
                        style: const TextStyle(
                            color: MawjaTheme.signal,
                            fontWeight: FontWeight.w800)),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],

        // ── سباق DNS ──
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  const Icon(Icons.dns, color: MawjaTheme.signal),
                  const SizedBox(width: 8),
                  Text(L10n.t(context, 'dnsTest'),
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                ]),
                const SizedBox(height: 12),
                if (_dns != null)
                  ..._dns!.asMap().entries.map((e) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(children: [
                          if (e.key == 0)
                            const Icon(Icons.emoji_events,
                                color: MawjaTheme.warn, size: 18),
                          const SizedBox(width: 6),
                          Text('${e.value.name} (${e.value.ip})'),
                          const Spacer(),
                          Text(
                              e.value.ms < 0
                                  ? '—'
                                  : '${e.value.ms.toStringAsFixed(0)} ms',
                              style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  color: e.key == 0
                                      ? MawjaTheme.signal
                                      : MawjaTheme.inkDim)),
                        ]),
                      )),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _busyDns ? null : _raceDns,
                  icon: _busyDns
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.play_arrow),
                  label: Text(L10n.t(context, 'runDns')),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),

        // ── نصائح ذهبية ──
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  const Icon(Icons.lightbulb, color: MawjaTheme.warn),
                  const SizedBox(width: 8),
                  Text(L10n.t(context, 'tips'),
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                ]),
                const SizedBox(height: 10),
                ...(isAr
                        ? const [
                            'ضع المودم مرتفعاً وفي منتصف المنزل، بعيداً عن الجدران السميكة والمرايا.',
                            'استخدم شبكة 5GHz للأجهزة القريبة و2.4GHz للبعيدة.',
                            'أبعد المودم عن المايكروويف وأجهزة البلوتوث — تشوّش على 2.4GHz.',
                            'أعد تشغيل المودم مرة أسبوعياً لتفريغ الذاكرة.',
                            'حدّث برنامج الراوتر (Firmware) من صفحة الإعدادات.',
                          ]
                        : const [
                            'Place the modem high and central, away from thick walls and mirrors.',
                            'Use 5GHz for nearby devices, 2.4GHz for far rooms.',
                            'Keep it away from microwaves and Bluetooth hubs — they jam 2.4GHz.',
                            'Reboot the router weekly to clear its memory.',
                            'Update the router firmware from its settings page.',
                          ])
                    .map((t) => Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('•  ',
                                    style: TextStyle(
                                        color: MawjaTheme.signal)),
                                Expanded(child: Text(t)),
                              ]),
                        )),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
