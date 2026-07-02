/* موجة — bilingual strings (AR / EN) with full RTL support */
const I18N = {
  appName:      { ar: "موجة", en: "Mawja" },
  tagline:      { ar: "شبكتك.. بأفضل حالاتها", en: "Your network, at its best" },
  home:         { ar: "الرئيسية", en: "Home" },
  speedTest:    { ar: "اختبار السرعة", en: "Speed Test" },
  placement:    { ar: "أفضل موقع", en: "Best Spot" },
  optimizer:    { ar: "المُحسِّن", en: "Optimizer" },
  connection:   { ar: "الاتصال", en: "Connection" },
  estDown:      { ar: "سرعة تقديرية", en: "Est. speed" },
  ping:         { ar: "بنق", en: "Ping" },
  jitter:       { ar: "التذبذب", en: "Jitter" },
  download:     { ar: "تحميل", en: "Download" },
  upload:       { ar: "رفع", en: "Upload" },
  start:        { ar: "ابدأ", en: "Start" },
  cancel:       { ar: "إلغاء", en: "Cancel" },
  testing:      { ar: "جارٍ الفحص…", en: "Testing…" },
  livePulse:    { ar: "🔴 نبض حيّ", en: "🔴 Live pulse" },
  pulseStop:    { ar: "■ إيقاف", en: "■ Stop" },
  tapToStart:   { ar: "اضغط للفحص", en: "Tap to scan" },
  scanning:     { ar: "يفحص…", en: "Scanning…" },
  excellent:    { ar: "ممتازة", en: "Excellent" },
  good:         { ar: "جيدة", en: "Good" },
  fair:         { ar: "متوسطة", en: "Fair" },
  weak:         { ar: "ضعيفة", en: "Weak" },
  measureHere:  { ar: "قِس هنا", en: "Measure here" },
  roomName:     { ar: "اسم الغرفة", en: "Room name" },
  placementHint:{ ar: "تنقّل بجوالك في أرجاء المكان، وفي كل غرفة اضغط «قِس هنا». سنرتب المواقع ونخبرك أين يجب أن يكون المودم.",
                  en: "Walk around with your phone and tap “Measure here” in each room. We’ll rank the spots and tell you where the modem should live." },
  bestSpotIs:   { ar: "🏆 أفضل موقع للمودم", en: "🏆 Best modem spot" },
  clearAll:     { ar: "مسح الكل", en: "Clear all" },
  channelGuide: { ar: "دليل القنوات", en: "Channel guide" },
  channelHint:  { ar: "القنوات غير المتداخلة على 2.4GHz هي 1 و6 و11. إن كان بيتك مزدحماً بالشبكات، اختر إحداها من إعدادات الراوتر، وفضّل نطاق 5GHz للأجهزة القريبة.",
                  en: "Non-overlapping 2.4GHz channels are 1, 6 and 11. If your area is crowded, pick one in your router settings — and prefer 5GHz for nearby devices." },
  dnsTest:      { ar: "أسرع DNS لشبكتك", en: "Fastest DNS for you" },
  dnsHint:      { ar: "يقيس زمن استجابة كل مزوّد DNS من موقعك. الأسرع = تصفّح أسرع.",
                  en: "Measures each DNS provider's response time from your location. Faster = snappier browsing." },
  runDns:       { ar: "افحص خوادم DNS", en: "Test DNS servers" },
  tips:         { ar: "نصائح ذهبية", en: "Golden tips" },
  mbps:         { ar: "ميجابت/ث", en: "Mbps" },
  ms:           { ar: "م.ث", en: "ms" },
  share:        { ar: "مشاركة النتيجة", en: "Share result" },
  history:      { ar: "السجل", en: "History" },
  install:      { ar: "تثبيت", en: "Install" },
  installMsg:   { ar: "ثبّت «موجة» على شاشتك الرئيسية لتشغيله كتطبيق.",
                  en: "Install Mawja on your home screen to run it as an app." },
  webNote:      { ar: "نسخة الويب تقيس الأداء الفعلي (السرعة، البنق، التذبذب). لقراءة قوة الإشارة dBm والقنوات ثبّت تطبيق أندرويد.",
                  en: "The web version measures real performance (speed, ping, jitter). For dBm signal & channel scan, install the Android app." },
  madeWith:     { ar: "صُنع بشغف", en: "Made with care" },
  // verdict labels
  vGaming:      { ar: "الألعاب", en: "Gaming" },
  vCalls:       { ar: "مكالمات الفيديو", en: "Video calls" },
  v4k:          { ar: "بث 4K", en: "4K streaming" },
  vCloud:       { ar: "رفع سحابي", en: "Cloud upload" },
  // dynamic
  down:         { ar: "تحميل", en: "Download" },
};

const Lang = {
  cur: localStorage.getItem("mawja_lang") || "ar",
  t(key){ const e = I18N[key]; return e ? (e[this.cur] || e.en) : key; },
  isAr(){ return this.cur === "ar"; },
  set(code){
    this.cur = code;
    localStorage.setItem("mawja_lang", code);
    this.apply();
  },
  toggle(){ this.set(this.cur === "ar" ? "en" : "ar"); },
  apply(){
    const ar = this.isAr();
    document.documentElement.lang = ar ? "ar" : "en";
    document.documentElement.dir = ar ? "rtl" : "ltr";
    document.body.dir = ar ? "rtl" : "ltr";
    document.querySelectorAll("[data-t]").forEach(el => {
      el.textContent = this.t(el.getAttribute("data-t"));
    });
    const lb = document.getElementById("langBtn");
    if (lb) lb.textContent = ar ? "EN" : "AR";
    document.dispatchEvent(new CustomEvent("langchange"));
  }
};
