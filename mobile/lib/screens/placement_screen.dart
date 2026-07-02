import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/l10n.dart';
import '../core/net_engine.dart';
import '../main.dart';

/// مسح المكان غرفة بغرفة: قِس في كل نقطة، ونرتب لك أفضل موقع للمودم.
class PlacementScreen extends StatefulWidget {
  const PlacementScreen({super.key});
  @override
  State<PlacementScreen> createState() => _PlacementScreenState();
}

class _Spot {
  final String room;
  final int score;
  final int? rssi;
  final double ping;
  _Spot(this.room, this.score, this.rssi, this.ping);
  Map<String, dynamic> toJson() =>
      {'room': room, 'score': score, 'rssi': rssi, 'ping': ping};
  static _Spot fromJson(Map<String, dynamic> j) =>
      _Spot(j['room'], j['score'], j['rssi'], (j['ping'] as num).toDouble());
}

class _PlacementScreenState extends State<PlacementScreen> {
  final List<_Spot> _spots = [];
  bool _measuring = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString('spots');
    if (raw != null) {
      setState(() => _spots.addAll(
          (jsonDecode(raw) as List).map((e) => _Spot.fromJson(e))));
    }
  }

  Future<void> _save() async {
    final p = await SharedPreferences.getInstance();
    p.setString('spots', jsonEncode(_spots.map((s) => s.toJson()).toList()));
  }

  Future<void> _measure() async {
    final ctrl = TextEditingController();
    final room = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        backgroundColor: MawjaTheme.surface2,
        title: Text(L10n.t(c, 'roomName')),
        content: TextField(controller: ctrl, autofocus: true),
        actions: [
          FilledButton(
              onPressed: () => Navigator.pop(c, ctrl.text.trim()),
              child: Text(L10n.t(c, 'start'))),
        ],
      ),
    );
    if (room == null || room.isEmpty) return;
    setState(() => _measuring = true);
    final s = await NetEngine.scoreSpot();
    setState(() {
      _spots.add(_Spot(room, s.score, s.rssi, s.ping));
      _spots.sort((a, b) => b.score.compareTo(a.score));
      _measuring = false;
    });
    _save();
  }

  Color _scoreColor(int s) => s >= 75
      ? MawjaTheme.signal
      : s >= 50
          ? MawjaTheme.warn
          : MawjaTheme.danger;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(L10n.t(context, 'placement'),
            style: Theme.of(context)
                .textTheme
                .headlineSmall
                ?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        Text(L10n.t(context, 'placementHint'),
            style: const TextStyle(color: MawjaTheme.inkDim)),
        if (Platform.isIOS) ...[
          const SizedBox(height: 8),
          Text(L10n.t(context, 'iosNote'),
              style: const TextStyle(color: MawjaTheme.warn, fontSize: 12)),
        ],
        const SizedBox(height: 20),
        FilledButton.icon(
          style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 18),
              backgroundColor: MawjaTheme.wave,
              foregroundColor: Colors.black),
          onPressed: _measuring ? null : _measure,
          icon: _measuring
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.my_location),
          label: Text(
              _measuring
                  ? L10n.t(context, 'testing')
                  : L10n.t(context, 'measureHere'),
              style: const TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w800)),
        ),
        const SizedBox(height: 20),
        if (_spots.isNotEmpty) ...[
          Card(
            color: MawjaTheme.signal.withOpacity(.1),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(children: [
                Expanded(
                    child: Text(
                        '${L10n.t(context, 'bestSpotIs')} ${_spots.first.room}',
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 16))),
                Text('${_spots.first.score}',
                    style: const TextStyle(
                        color: MawjaTheme.signal,
                        fontWeight: FontWeight.w800,
                        fontSize: 24)),
              ]),
            ),
          ),
          const SizedBox(height: 8),
          ..._spots.asMap().entries.map((e) => Card(
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: _scoreColor(e.value.score).withOpacity(.15),
                    child: Text('${e.key + 1}',
                        style: TextStyle(
                            color: _scoreColor(e.value.score),
                            fontWeight: FontWeight.w800)),
                  ),
                  title: Text(e.value.room,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(
                      '${e.value.rssi != null ? '${e.value.rssi} dBm · ' : ''}${e.value.ping.toStringAsFixed(0)} ms',
                      style: const TextStyle(color: MawjaTheme.inkDim)),
                  trailing: Text('${e.value.score}',
                      style: TextStyle(
                          color: _scoreColor(e.value.score),
                          fontWeight: FontWeight.w800,
                          fontSize: 20)),
                ),
              )),
          TextButton.icon(
            onPressed: () {
              setState(() => _spots.clear());
              _save();
            },
            icon: const Icon(Icons.delete_outline, color: MawjaTheme.danger),
            label: Text(L10n.t(context, 'clearAll'),
                style: const TextStyle(color: MawjaTheme.danger)),
          ),
        ],
      ],
    );
  }
}
