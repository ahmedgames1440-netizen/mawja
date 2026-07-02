import 'package:flutter/material.dart';

/// نظام ترجمة خفيف بدون ملفات خارجية — أضف أي مفتاح جديد هنا.
class L10n {
  static const supported = [Locale('ar'), Locale('en')];

  static const Map<String, Map<String, String>> _s = {
    'appName': {'ar': 'موجة', 'en': 'Mawja'},
    'tagline': {'ar': 'شبكتك.. بأفضل حالاتها', 'en': 'Your network, at its best'},
    'home': {'ar': 'الرئيسية', 'en': 'Home'},
    'speedTest': {'ar': 'اختبار السرعة', 'en': 'Speed Test'},
    'placement': {'ar': 'أفضل موقع', 'en': 'Best Spot'},
    'optimizer': {'ar': 'المُحسِّن', 'en': 'Optimizer'},
    'signal': {'ar': 'قوة الإشارة', 'en': 'Signal'},
    'network': {'ar': 'الشبكة', 'en': 'Network'},
    'latency': {'ar': 'زمن الاستجابة', 'en': 'Latency'},
    'download': {'ar': 'التحميل', 'en': 'Download'},
    'upload': {'ar': 'الرفع', 'en': 'Upload'},
    'ping': {'ar': 'بنق', 'en': 'Ping'},
    'jitter': {'ar': 'التذبذب', 'en': 'Jitter'},
    'start': {'ar': 'ابدأ', 'en': 'Start'},
    'testing': {'ar': 'جارٍ الفحص...', 'en': 'Testing...'},
    'excellent': {'ar': 'ممتازة', 'en': 'Excellent'},
    'good': {'ar': 'جيدة', 'en': 'Good'},
    'fair': {'ar': 'متوسطة', 'en': 'Fair'},
    'weak': {'ar': 'ضعيفة', 'en': 'Weak'},
    'measureHere': {'ar': 'قِس هنا', 'en': 'Measure here'},
    'roomName': {'ar': 'اسم الغرفة', 'en': 'Room name'},
    'placementHint': {
      'ar': 'تنقّل بجوالك في أرجاء المكان، وفي كل غرفة اضغط «قِس هنا». سنرتب المواقع ونخبرك أين يجب أن يكون المودم.',
      'en': 'Walk around with your phone and tap "Measure here" in each room. We\'ll rank the spots and tell you where the modem should live.'
    },
    'bestSpotIs': {'ar': '🏆 أفضل موقع للمودم:', 'en': '🏆 Best modem spot:'},
    'score': {'ar': 'النقاط', 'en': 'Score'},
    'clearAll': {'ar': 'مسح الكل', 'en': 'Clear all'},
    'channelAnalysis': {'ar': 'تحليل القنوات', 'en': 'Channel analysis'},
    'crowdedChannel': {
      'ar': 'قناتك مزدحمة! غيّرها من إعدادات الراوتر إلى القناة المقترحة.',
      'en': 'Your channel is crowded! Switch it in your router settings.'
    },
    'suggestedChannel': {'ar': 'القناة المقترحة', 'en': 'Suggested channel'},
    'dnsTest': {'ar': 'أسرع DNS لشبكتك', 'en': 'Fastest DNS for you'},
    'runDns': {'ar': 'افحص خوادم DNS', 'en': 'Test DNS servers'},
    'tips': {'ar': 'نصائح ذهبية', 'en': 'Golden tips'},
    'iosNote': {
      'ar': 'على iOS تمنع Apple قراءة تفاصيل WiFi، لذا نعتمد قياس السرعة وزمن الاستجابة — النتيجة دقيقة أيضاً.',
      'en': 'Apple restricts WiFi details on iOS, so we score using speed & latency sampling — equally accurate.'
    },
    'mbps': {'ar': 'ميجابت/ث', 'en': 'Mbps'},
    'ms': {'ar': 'مللي ثانية', 'en': 'ms'},
    'dbm': {'ar': 'dBm', 'en': 'dBm'},
  };

  static String t(BuildContext ctx, String key) {
    final lang = Localizations.localeOf(ctx).languageCode;
    return _s[key]?[lang] ?? _s[key]?['en'] ?? key;
  }
}
