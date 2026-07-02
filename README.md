<div align="center">

# موجة | Mawja 📡

**تحليل وتحسين شبكة WiFi — يعمل مع كل شركات الاتصال (STC، موبايلي، زين، سلام…)**
لأنه يتعامل مع الشبكة نفسها، لا مع المزوّد.

نسخة ويب تعمل فوراً في المتصفح + مشروع تطبيق أصلي لأندرويد و iOS.

</div>

---

## 🚀 جرّبه الآن (نسخة الويب / PWA)

نسخة الويب تعمل في أي متصفح حديث، وتُثبَّت على شاشة جوالك كتطبيق حقيقي (Add to Home Screen).

- **الرابط المباشر:** بعد رفع المشروع على GitHub Pages سيكون على:
  `https://<username>.github.io/mawja/`
- **محلياً على جهازك:**
  ```bash
  cd mawja-app
  python -m http.server 8000
  # ثم افتح http://localhost:8000
  ```

### ماذا يعمل في نسخة الويب؟
| الميزة | الحالة |
|---|---|
| ⚡ اختبار سرعة حقيقي (تحميل/رفع عبر Cloudflare) | ✅ يعمل |
| 📶 بنق + تذبذب (Jitter) فعلي | ✅ يعمل |
| 📡 رادار حيّ لجودة الاتصال | ✅ يعمل |
| 🧭 أفضل موقع للمودم (قياس غرفة بغرفة) | ✅ يعمل |
| 🌐 سباق DNS (أسرع مزوّد لموقعك) | ✅ يعمل |
| 🏆 حكم ذكي (ألعاب / مكالمات / بث 4K / رفع سحابي) | ✅ يعمل |
| 🕘 سجل النتائج + مشاركة | ✅ يعمل |
| 📊 قوة الإشارة dBm + تحليل القنوات | 📱 في تطبيق أندرويد فقط |

> **صدق تقني:** لا يمكن لأي تطبيق «تسريع» الراوتر برمجياً — Apple وGoogle لا تسمحان بذلك.
> التسريع الحقيقي = الموقع الصحيح + القناة الأقل ازدحاماً + أسرع DNS، وهذا بالضبط ما يقدّمه موجة.
> على iOS تمنع Apple قراءة قوة إشارة WiFi، لذا نعتمد قياس السرعة والاستجابة (بدقة عملية مماثلة).

---

## 📱 التطبيق الأصلي (Android / iOS)

مشروع Flutter كامل وجاهز للبناء داخل مجلد [`mobile/`](mobile/).

```bash
cd mobile
flutter pub get
flutter run                     # تجربة على جهاز/محاكي
flutter build apk --release     # أندرويد → APK
flutter build ios --no-codesign # iOS (على ماك مع Xcode)
```

الصلاحيات ومفاتيح Info.plist **مضبوطة مسبقاً** في مشروع mobile. على iOS فعّل
Capability باسم **"Access WiFi Information"** من Xcode ▸ Signing & Capabilities.

### بناء سحابي بدون جهازك
ادفع المشروع إلى GitHub ثم شغّل workflow **Build Mawja** يدوياً من تبويب Actions:
- ينتج **APK** لأندرويد (جاهز للتثبيت المباشر).
- ينتج **IPA غير موقّع** لـ iOS (يُثبَّت عبر AltStore / Sideloadly / Xcode).

---

## 🌐 النشر على GitHub Pages (خطوة واحدة)

1. أنشئ مستودعاً على GitHub باسم `mawja` وادفع هذا المجلد إليه.
2. من **Settings ▸ Pages** اختر المصدر: **GitHub Actions**.
3. كل `push` على `main` ينشر نسخة الويب تلقائياً عبر workflow **Deploy Mawja PWA**.

أوامر جاهزة:
```bash
git init && git add -A && git commit -m "Mawja"
git branch -M main
git remote add origin https://github.com/<username>/mawja.git
git push -u origin main
```

---

## 🗂️ هيكل المشروع
```
mawja-app/
├─ index.html · styles.css · app.js · engine.js · i18n.js   ← نسخة الويب (PWA)
├─ manifest.webmanifest · sw.js · icons/                    ← أصول التثبيت
├─ mobile/                                                  ← تطبيق Flutter (Android/iOS)
└─ .github/workflows/  pages.yml · mobile.yml               ← البناء والنشر التلقائي
```

## 🛠️ التقنيات
نسخة الويب: HTML/CSS/JS خالص (بدون أطر)، Canvas للرادار، Service Worker للعمل دون اتصال،
قياسات فعلية عبر Cloudflare Speed + DNS-over-HTTPS. التطبيق الأصلي: Flutter 3 + Material 3.

<div align="center">صُنع بشغف · Mawja © 2026</div>
