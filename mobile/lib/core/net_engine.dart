import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'package:http/http.dart' as http;
import 'package:network_info_plus/network_info_plus.dart';
import 'package:wifi_scan/wifi_scan.dart';

/// المحرك المركزي لكل القياسات — يعمل مع أي مزود اتصالات
/// لأنه يقيس الشبكة نفسها (STC, Mobily, Zain, Salam... جميعها).
class NetEngine {
  static final _info = NetworkInfo();

  /// اسم الشبكة الحالية (يعمل على المنصتين مع صلاحية الموقع)
  static Future<String> ssid() async {
    try {
      final s = await _info.getWifiName();
      return (s ?? '—').replaceAll('"', '');
    } catch (_) {
      return '—';
    }
  }

  /// قوة الإشارة dBm — أندرويد فقط. iOS يرجع null (قيود Apple).
  /// نستخرجها من نتائج المسح (wifi_scan) بمطابقة اسم الشبكة الحالية.
  static Future<int?> rssi() async {
    if (!Platform.isAndroid) return null;
    try {
      final can = await WiFiScan.instance.canGetScannedResults();
      if (can != CanGetScannedResults.yes) return null;
      final mySsid = await ssid();
      final results = await WiFiScan.instance.getScannedResults();
      for (final ap in results) {
        if (ap.ssid.isNotEmpty && ap.ssid == mySsid) return ap.level; // dBm
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  /// تحويل dBm إلى نسبة 0..100
  static int rssiToPercent(int dbm) => ((dbm.clamp(-90, -30) + 90) * 100 ~/ 60);

  /// بنق حقيقي عبر فتح اتصال TCP (يعمل على المنصتين بدون صلاحيات خاصة)
  static Future<double> ping({String host = '1.1.1.1', int samples = 4}) async {
    final times = <double>[];
    for (var i = 0; i < samples; i++) {
      final sw = Stopwatch()..start();
      try {
        final s = await Socket.connect(host, 443,
            timeout: const Duration(seconds: 2));
        sw.stop();
        s.destroy();
        times.add(sw.elapsedMicroseconds / 1000);
      } catch (_) {}
    }
    if (times.isEmpty) return -1;
    return times.reduce((a, b) => a + b) / times.length;
  }

  /// التذبذب (jitter) = متوسط فرق العينات المتتالية
  static Future<double> jitter({int samples = 6}) async {
    final times = <double>[];
    for (var i = 0; i < samples; i++) {
      final p = await ping(samples: 1);
      if (p > 0) times.add(p);
    }
    if (times.length < 2) return 0;
    var sum = 0.0;
    for (var i = 1; i < times.length; i++) {
      sum += (times[i] - times[i - 1]).abs();
    }
    return sum / (times.length - 1);
  }

  /// اختبار تحميل حقيقي عبر Cloudflare — يبث التقدم لحظياً بالميجابت/ث
  static Stream<double> downloadTest({int mb = 25}) async* {
    final url =
        Uri.parse('https://speed.cloudflare.com/__down?bytes=${mb * 1000000}');
    final client = http.Client();
    final sw = Stopwatch()..start();
    var bytes = 0;
    try {
      final res = await client.send(http.Request('GET', url));
      await for (final chunk in res.stream) {
        bytes += chunk.length;
        final sec = sw.elapsedMilliseconds / 1000;
        if (sec > 0.3) yield (bytes * 8 / 1000000) / sec;
      }
    } finally {
      client.close();
    }
  }

  /// اختبار رفع: إرسال دفعات عشوائية إلى Cloudflare
  static Stream<double> uploadTest({int mb = 10}) async* {
    final rnd = Random();
    final chunk =
        List<int>.generate(1000000, (_) => rnd.nextInt(256)); // 1MB
    final sw = Stopwatch()..start();
    var sent = 0;
    for (var i = 0; i < mb; i++) {
      try {
        await http.post(Uri.parse('https://speed.cloudflare.com/__up'),
            body: chunk);
        sent += chunk.length;
        final sec = sw.elapsedMilliseconds / 1000;
        if (sec > 0.3) yield (sent * 8 / 1000000) / sec;
      } catch (_) {
        break;
      }
    }
  }

  /// مسح الشبكات المجاورة وتحليل ازدحام القنوات (Android فقط)
  static Future<ChannelReport?> channelReport() async {
    if (!Platform.isAndroid) return null;
    final can = await WiFiScan.instance.canStartScan();
    if (can != CanStartScan.yes) return null;
    await WiFiScan.instance.startScan();
    final results = await WiFiScan.instance.getScannedResults();
    final counts = <int, int>{};
    int? myChannel;
    final mySsid = await ssid();
    for (final ap in results) {
      final ch = _freqToChannel(ap.frequency);
      if (ch == null) continue;
      counts[ch] = (counts[ch] ?? 0) + 1;
      if (ap.ssid == mySsid) myChannel = ch;
    }
    // أفضل قناة 2.4GHz من غير المتداخلة (1, 6, 11)
    int best = 1;
    var bestLoad = 1 << 30;
    for (final ch in [1, 6, 11]) {
      final load = counts[ch] ?? 0;
      if (load < bestLoad) {
        bestLoad = load;
        best = ch;
      }
    }
    return ChannelReport(
        counts: counts, myChannel: myChannel, suggested: best);
  }

  static int? _freqToChannel(int f) {
    if (f >= 2412 && f <= 2472) return (f - 2407) ~/ 5;
    if (f == 2484) return 14;
    if (f >= 5180 && f <= 5825) return (f - 5000) ~/ 5;
    return null;
  }

  /// فحص أسرع خادم DNS (يفيد كل مزودي الاتصال)
  static Future<List<DnsResult>> dnsRace() async {
    const servers = {
      'Cloudflare': '1.1.1.1',
      'Google': '8.8.8.8',
      'Quad9': '9.9.9.9',
      'OpenDNS': '208.67.222.222',
    };
    final out = <DnsResult>[];
    for (final e in servers.entries) {
      final ms = await ping(host: e.value, samples: 3);
      out.add(DnsResult(e.key, e.value, ms));
    }
    out.sort((a, b) =>
        (a.ms < 0 ? 9999 : a.ms).compareTo(b.ms < 0 ? 9999 : b.ms));
    return out;
  }

  /// نقاط موقع (0..100): أندرويد = إشارة+بنق، iOS = بنق+سرعة عينة
  static Future<SpotScore> scoreSpot() async {
    final r = await rssi();
    final p = await ping(samples: 3);
    final j = await jitter(samples: 4);
    double score;
    if (r != null) {
      final sig = rssiToPercent(r).toDouble(); // 0..100
      final lat = (100 - (p.clamp(5, 300) / 3)).clamp(0, 100).toDouble();
      score = sig * 0.65 + lat * 0.35;
    } else {
      // iOS: عينة تحميل قصيرة 3MB + بنق
      double speed = 0;
      await for (final s in downloadTest(mb: 3)) {
        speed = s;
      }
      final spd = (speed.clamp(0, 200) / 2).toDouble(); // 0..100
      final lat = (100 - (p.clamp(5, 300) / 3)).clamp(0, 100).toDouble();
      score = spd * 0.6 + lat * 0.4;
    }
    return SpotScore(
        score: score.round(), rssi: r, ping: p, jitter: j);
  }
}

class ChannelReport {
  final Map<int, int> counts;
  final int? myChannel;
  final int suggested;
  ChannelReport(
      {required this.counts, required this.myChannel, required this.suggested});
  bool get crowded =>
      myChannel != null && (counts[myChannel] ?? 0) > 2 && myChannel != suggested;
}

class DnsResult {
  final String name, ip;
  final double ms;
  DnsResult(this.name, this.ip, this.ms);
}

class SpotScore {
  final int score;
  final int? rssi;
  final double ping, jitter;
  SpotScore(
      {required this.score,
      required this.rssi,
      required this.ping,
      required this.jitter});
}
