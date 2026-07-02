# بناء تطبيق موجة (Android / iOS)

## بناء محلي
```bash
cd mobile
flutter pub get
flutter run                      # على جهاز/محاكي متصل
flutter build apk --release      # أندرويد → build/app/outputs/flutter-apk/app-release.apk
flutter build appbundle --release# أندرويد (للنشر على Google Play)
flutter build ios --no-codesign  # iOS (على ماك مع Xcode)
```

## بناء سحابي (بدون جهازك)
شغّل workflow **Build Mawja (Android + iOS)** من تبويب **Actions** في GitHub
(زر *Run workflow*)، أو ادفع أي تعديل داخل مجلد `mobile/`.
ستجد الملفات الجاهزة في **Artifacts**:
- `mawja-android-apk` — ملف APK للتثبيت المباشر على أندرويد.
- `mawja-ios-ipa` — ملف IPA غير موقّع لـ iOS (يُثبّت عبر AltStore / Sideloadly / Xcode).

## ملاحظات
- الصلاحيات ومفاتيح `Info.plist` مضبوطة مسبقاً.
- على iOS فعّل Capability باسم **Access WiFi Information** من Xcode ▸ Signing & Capabilities.
- قوة الإشارة dBm وتحليل القنوات تعمل على أندرويد فقط (قيود Apple على iOS).
