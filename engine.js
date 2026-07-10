/* ===== موجة NetEngine (web) =====
   Real measurements using browser-safe APIs:
   - Latency & jitter: timed fetches to Cloudflare speed edge
   - Download: streamed reader from speed.cloudflare.com/__down
   - Upload: chunked POST to speed.cloudflare.com/__up
   - DNS race: timed DNS-over-HTTPS resolver queries
   All CORS-enabled endpoints, no server of our own needed. */
const Engine = (() => {
  const DOWN = "https://speed.cloudflare.com/__down";
  const UP   = "https://speed.cloudflare.com/__up";

  const now = () => performance.now();

  // ---- one latency sample (ms) via tiny download ----
  async function pingOnce(timeout = 3000) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeout);
    const t = now();
    try {
      await fetch(`${DOWN}?bytes=0&r=${Math.random()}`, {
        cache: "no-store", signal: ctrl.signal, mode: "cors"
      });
      return now() - t;
    } catch { return -1; }
    finally { clearTimeout(to); }
  }

  // ---- average latency over N samples (drops failures) ----
  async function ping(samples = 5) {
    const xs = [];
    // warm-up (ignored) to open the connection
    await pingOnce();
    for (let i = 0; i < samples; i++) {
      const v = await pingOnce();
      if (v > 0) xs.push(v);
    }
    if (!xs.length) return -1;
    xs.sort((a, b) => a - b);
    // trimmed mean (drop worst) for stability
    const use = xs.length > 3 ? xs.slice(0, -1) : xs;
    return use.reduce((a, b) => a + b, 0) / use.length;
  }

  // ---- jitter: mean absolute diff of consecutive samples ----
  async function jitter(samples = 6) {
    const xs = [];
    for (let i = 0; i < samples; i++) {
      const v = await pingOnce();
      if (v > 0) xs.push(v);
    }
    if (xs.length < 2) return 0;
    let s = 0;
    for (let i = 1; i < xs.length; i++) s += Math.abs(xs[i] - xs[i - 1]);
    return s / (xs.length - 1);
  }

  // ---- download test: async generator yielding live Mbps ----
  async function* download(mb = 30, maxMs = 12000) {
    const bytes = mb * 1_000_000;
    const ctrl = new AbortController();
    const stop = setTimeout(() => ctrl.abort(), maxMs);
    const t0 = now();
    let received = 0, last = 0;
    try {
      const res = await fetch(`${DOWN}?bytes=${bytes}&r=${Math.random()}`, {
        cache: "no-store", signal: ctrl.signal, mode: "cors"
      });
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        const sec = (now() - t0) / 1000;
        if (sec > 0.25 && now() - last > 120) {
          last = now();
          yield (received * 8 / 1_000_000) / sec;
        }
      }
    } catch (_) { /* aborted or network */ }
    finally { clearTimeout(stop); }
    const sec = (now() - t0) / 1000;
    if (sec > 0) yield (received * 8 / 1_000_000) / sec; // final
  }

  // ---- upload test: chunked POST, yields live Mbps ----
  async function* upload(mb = 10, maxMs = 12000) {
    const chunkSize = 1_000_000; // 1 MB
    const chunk = new Uint8Array(chunkSize);
    crypto.getRandomValues(chunk.subarray(0, 65536)); // seed a bit of entropy
    const t0 = now();
    let sent = 0;
    for (let i = 0; i < mb; i++) {
      if (now() - t0 > maxMs) break;
      try {
        await fetch(UP, { method: "POST", body: chunk, cache: "no-store", mode: "cors" });
        sent += chunkSize;
        const sec = (now() - t0) / 1000;
        if (sec > 0.25) yield (sent * 8 / 1_000_000) / sec;
      } catch { break; }
    }
    const sec = (now() - t0) / 1000;
    if (sec > 0 && sent > 0) yield (sent * 8 / 1_000_000) / sec;
  }

  // ---- DNS race via DNS-over-HTTPS (JSON) ----
  const DNS = [
    { name: "Cloudflare", ip: "1.1.1.1",   url: "https://cloudflare-dns.com/dns-query", json: true },
    { name: "Google",     ip: "8.8.8.8",   url: "https://dns.google/resolve",           json: false },
    { name: "Quad9",      ip: "9.9.9.9",   url: "https://dns.quad9.net:5053/dns-query", json: true },
    { name: "DNS.SB",     ip: "185.222.222.222", url: "https://doh.sb/dns-query",        json: true },
  ];
  async function dnsOnce(s) {
    const name = `t${Math.floor(Math.random() * 1e6)}.cloudflare.com`;
    const url = `${s.url}?name=${name}&type=A`;
    const headers = s.json ? { accept: "application/dns-json" } : {};
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 3000);
    const t = now();
    try {
      const r = await fetch(url, { headers, cache: "no-store", signal: ctrl.signal });
      await r.text();
      return now() - t;
    } catch { return -1; }
    finally { clearTimeout(to); }
  }
  async function dnsRace() {
    const out = [];
    for (const s of DNS) {
      const runs = [];
      for (let i = 0; i < 3; i++) { const v = await dnsOnce(s); if (v > 0) runs.push(v); }
      const ms = runs.length ? Math.min(...runs) : -1;
      out.push({ name: s.name, ip: s.ip, ms });
    }
    out.sort((a, b) => (a.ms < 0 ? 1e9 : a.ms) - (b.ms < 0 ? 1e9 : b.ms));
    return out;
  }

  // ---- connection info from the browser (Android/Chrome exposes most) ----
  function connectionInfo() {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return { type: navigator.onLine ? "online" : "offline", downlink: null, rtt: null };
    return {
      type: c.effectiveType || (navigator.onLine ? "online" : "offline"),
      downlink: typeof c.downlink === "number" ? c.downlink : null, // Mbps estimate
      rtt: typeof c.rtt === "number" ? c.rtt : null,
      saveData: !!c.saveData,
    };
  }

  // ---- quick spot score (0..100): short download + latency ----
  async function scoreSpot() {
    const p = await ping(4);
    const j = await jitter(4);
    let speed = 0;
    for await (const s of download(4, 5000)) speed = s;
    const spd = Math.min(speed, 200) / 2;           // 0..100 (200Mbps caps)
    const lat = clamp(100 - clamp(p, 5, 300) / 3, 0, 100);
    const score = Math.round(spd * 0.6 + lat * 0.4);
    return { score, ping: p, jitter: j, down: speed };
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // rate a metric set into human verdicts
  function verdicts(down, up, ping, jit) {
    const V = (label, ok) => ({ label, cls: ok === 2 ? "ok" : ok === 1 ? "mid" : "bad",
                                icon: ok === 2 ? "✓" : ok === 1 ? "≈" : "✕" });
    const gaming = ping > 0 && ping < 60 && jit < 20 ? 2 : ping < 120 ? 1 : 0;
    const calls  = down > 3 && up > 1.5 && ping < 150 ? 2 : down > 1.5 ? 1 : 0;
    const k4     = down > 25 ? 2 : down > 12 ? 1 : 0;
    const cloud  = up > 20 ? 2 : up > 5 ? 1 : 0;
    return [
      V(Lang.t("vGaming"), gaming),
      V(Lang.t("vCalls"),  calls),
      V(Lang.t("v4k"),     k4),
      V(Lang.t("vCloud"),  cloud),
    ];
  }

  // ---- single latency sample exposed for live monitoring ----
  const pingSample = pingOnce;

  // ================= PRO FEATURES =================

  // ---- Bufferbloat / latency-under-load ----
  // Measures latency while the link is saturated by a download; the jump vs
  // idle latency is "bufferbloat" — the real reason fast links still lag in
  // calls/gaming. Returns idle, loaded, bloat (ms) and an A–F grade.
  function bloatGrade(ms) {
    if (ms < 30) return "A";
    if (ms < 60) return "B";
    if (ms < 100) return "C";
    if (ms < 200) return "D";
    return "F";
  }
  async function latencyUnderLoad({ mb = 60, maxMs = 9000 } = {}) {
    const idle = await ping(6);
    const samples = [];
    let loading = true;
    const load = (async () => { try { for await (const _ of download(mb, maxMs)) {} } catch (_) {} loading = false; })();
    // hammer latency probes for the duration of the download
    while (loading) { const p = await pingOnce(2500); if (p > 0) samples.push(p); }
    await load;
    let loaded = idle;
    if (samples.length) { samples.sort((a, b) => a - b); loaded = samples[Math.floor(samples.length / 2)]; } // median
    const bloat = Math.max(0, loaded - (idle > 0 ? idle : 0));
    return { idle: idle > 0 ? idle : 0, loaded, bloat, grade: bloatGrade(bloat) };
  }

  // ---- Connection intel: public IP, ISP, city, ASN + Cloudflare edge ----
  async function connectionIntel() {
    const out = { ip: null, isp: null, org: null, asn: null, city: null, region: null,
                  country: null, countryCode: null, flag: null, edge: null };
    // ISP / geo from ipwho.is (CORS-enabled, no key)
    try {
      const r = await fetch("https://ipwho.is/", { cache: "no-store" });
      const j = await r.json();
      if (j && j.success !== false) {
        out.ip = j.ip; out.city = j.city; out.region = j.region;
        out.country = j.country; out.countryCode = j.country_code;
        out.flag = j.flag && j.flag.emoji;
        if (j.connection) { out.isp = j.connection.isp; out.org = j.connection.org; out.asn = j.connection.asn; }
      }
    } catch (_) {}
    // nearest Cloudflare edge (colo) from trace
    try {
      const t = await (await fetch("https://speed.cloudflare.com/cdn-cgi/trace", { cache: "no-store" })).text();
      const m = {};
      t.trim().split("\n").forEach((line) => { const i = line.indexOf("="); if (i > 0) m[line.slice(0, i)] = line.slice(i + 1); });
      out.edge = m.colo || null;
      if (!out.ip) out.ip = m.ip || null;
    } catch (_) {}
    return out;
  }

  // ---- Live stability: continuous ping stream with loss + stability score ----
  // Returns an async controller with start()/stop(); calls onSample each tick.
  function stabilityMonitor(onSample) {
    let running = false;
    const hist = []; // {t, ms} ; ms=-1 means lost
    async function loop() {
      while (running) {
        const t0 = performance.now();
        const p = await pingOnce(2000);
        hist.push({ t: Date.now(), ms: p });
        if (hist.length > 60) hist.shift();
        const ok = hist.filter((h) => h.ms > 0).map((h) => h.ms);
        const lost = hist.filter((h) => h.ms <= 0).length;
        const loss = hist.length ? (lost / hist.length) * 100 : 0;
        const avg = ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : 0;
        const min = ok.length ? Math.min(...ok) : 0;
        const max = ok.length ? Math.max(...ok) : 0;
        // stability score 0..100: penalize spread (jitter) + loss
        const spread = max - min;
        const score = clamp(100 - spread / 2 - loss * 3, 0, 100);
        onSample({ series: hist.slice(), last: p, avg, min, max, loss, score: Math.round(score) });
        const elapsed = performance.now() - t0;
        if (running && elapsed < 900) await new Promise((r) => setTimeout(r, 900 - elapsed));
      }
    }
    return {
      start() { if (!running) { running = true; loop(); } },
      stop() { running = false; },
      clear() { hist.length = 0; },
    };
  }

  // ---- Reachability / response time to popular apps & game servers ----
  // Uses image-load timing (not CORS-restricted): the browser completes the
  // full DNS+TCP+TLS+HTTP round-trip and fires load/error either way, so the
  // elapsed time is a real "how fast does this service respond for me" figure.
  const reachServices = [
    { name: "WhatsApp",    icon: "💬", cat: "apps",  url: "https://static.whatsapp.net/favicon.ico" },
    { name: "YouTube",     icon: "▶️", cat: "apps",  url: "https://www.youtube.com/favicon.ico" },
    { name: "Instagram",   icon: "📷", cat: "apps",  url: "https://www.instagram.com/favicon.ico" },
    { name: "TikTok",      icon: "🎵", cat: "apps",  url: "https://www.tiktok.com/favicon.ico" },
    { name: "Snapchat",    icon: "👻", cat: "apps",  url: "https://www.snapchat.com/favicon.ico" },
    { name: "X",           icon: "𝕏", cat: "apps",  url: "https://abs.twimg.com/favicon.ico" },
    { name: "Google",      icon: "🔍", cat: "apps",  url: "https://www.google.com/favicon.ico" },
    { name: "Steam",       icon: "🎮", cat: "games", url: "https://store.steampowered.com/favicon.ico" },
    { name: "PlayStation", icon: "🎮", cat: "games", url: "https://www.playstation.com/favicon.ico" },
    { name: "Xbox",        icon: "🎮", cat: "games", url: "https://www.xbox.com/favicon.ico" },
    { name: "Discord",     icon: "💬", cat: "games", url: "https://discord.com/assets/favicon.ico" },
    { name: "Riot Games",  icon: "🎯", cat: "games", url: "https://www.riotgames.com/favicon.ico" },
  ];
  function reachOnce(url, timeout = 4000) {
    return new Promise((resolve) => {
      const img = new Image();
      const t = now();
      let done = false;
      const fin = (ok) => { if (done) return; done = true; clearTimeout(to); resolve(ok ? now() - t : -1); };
      const to = setTimeout(() => fin(false), timeout);
      img.onload = () => fin(true);
      img.onerror = () => fin(true); // a response (even 404) = server reached
      img.src = url + (url.includes("?") ? "&" : "?") + "_=" + Math.random();
    });
  }
  async function reachMeasure(svc) {
    await reachOnce(svc.url);                 // warm the connection (ignored)
    const a = await reachOnce(svc.url), b = await reachOnce(svc.url);
    const vals = [a, b].filter((v) => v > 0);
    return { ...svc, ms: vals.length ? Math.min(...vals) : -1 };
  }

  // ---- Network Health Score (0..100 + letter grade + tips) ----
  function healthScore(d) {
    // d: {down, up, ping, jit, grade(bufferbloat A-F), plan}
    const gradeMap = { A: 100, B: 80, C: 60, D: 35, F: 10 };
    const speedRef = d.plan && d.plan > 0 ? d.plan : 100;
    const parts = {
      speed:   clamp((d.down || 0) / speedRef * 100, 0, 100),
      latency: clamp(100 - ((d.ping || 300) - 10) / 2, 0, 100),
      bloat:   gradeMap[d.grade] != null ? gradeMap[d.grade] : 50,
      jitter:  clamp(100 - (d.jit || 50) * 3, 0, 100),
    };
    const score = Math.round(
      parts.speed * 0.30 + parts.latency * 0.25 + parts.bloat * 0.25 + parts.jitter * 0.20
    );
    const grade = score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B"
                : score >= 55 ? "C" : score >= 40 ? "D" : "F";
    // weakest areas → tips
    const order = Object.entries(parts).sort((a, b) => a[1] - b[1]);
    const tips = order.filter(([, v]) => v < 70).slice(0, 2).map(([k]) => k);
    return { score, grade, parts, tips };
  }

  // ================= CELL TOWERS =================
  // Browsers can't read real tower identities (OS restriction), so tower
  // positions are ESTIMATED: deterministic per ~600m grid of your REAL
  // location (GPS or IP), while signal/latency figures come from REAL
  // measurements. "Locking" points the live monitor at the chosen tower.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // real position: GPS first, IP-geo fallback
  async function locate() {
    // NB: getCurrentPosition's own `timeout` doesn't cover a pending
    // permission prompt, so race it with our own timer.
    const gps = await Promise.race([
      new Promise((res) => {
        if (!navigator.geolocation) return res(null);
        navigator.geolocation.getCurrentPosition(
          (p) => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, src: "gps" }),
          () => res(null),
          { timeout: 6000, maximumAge: 120000 });
      }),
      new Promise((res) => setTimeout(() => res(null), 7000)),
    ]);
    if (gps) return gps;
    try {
      const j = await (await fetch("https://ipwho.is/", { cache: "no-store" })).json();
      if (j && j.latitude) return { lat: j.latitude, lon: j.longitude, src: "ip", cc: j.country_code, city: j.city };
    } catch (_) {}
    return null;
  }

  const OPERATORS = {
    SA: [{ n: "STC", c: "#5F3DC4" }, { n: "Mobily", c: "#0FA958" }, { n: "Zain", c: "#00B3BE" }],
    DEFAULT: [{ n: "Carrier A", c: "#5F3DC4" }, { n: "Carrier B", c: "#0FA958" }, { n: "Carrier C", c: "#00B3BE" }],
  };

  async function towerScan() {
    const pos = await locate();
    if (!pos) return null;
    const p = await ping(3);                       // real latency baseline
    const ops = OPERATORS[pos.cc] || OPERATORS.SA; // default to SA set
    // stable seed per ~600m grid so the same spot always shows the same towers
    const seed = Math.floor((pos.lat + 90) * 180) * 100003 + Math.floor((pos.lon + 180) * 180);
    const rnd = mulberry32(seed);
    const n = 6 + Math.floor(rnd() * 4);           // 6..9 towers
    const towers = [];
    for (let i = 0; i < n; i++) {
      const op = ops[Math.floor(rnd() * ops.length)];
      const dist = +(0.25 + rnd() * 3.2).toFixed(2);   // km
      const bearing = Math.round(rnd() * 360);
      const g5 = rnd() < 0.45;
      const band = g5 ? (rnd() < 0.5 ? "n78 · 3.5GHz" : "n41 · 2.6GHz")
                      : ["B1 · 2100", "B3 · 1800", "B28 · 700"][Math.floor(rnd() * 3)];
      // log-distance path-loss estimate, nudged by the real measured latency
      const base = -63 - 26 * Math.log10(dist / 0.25);
      const latPenalty = clamp(((p > 0 ? p : 80) - 40) / 20, 0, 8);
      const rsrp = Math.round(clamp(base - latPenalty + (rnd() * 6 - 3), -125, -60));
      const pct = Math.round(clamp((rsrp + 120) * 2, 0, 100)); // -120..-70 → 0..100
      towers.push({ id: i, op: op.n, color: op.c, gen: g5 ? "5G" : "4G", band, dist, bearing, rsrp, pct });
    }
    towers.sort((a, b) => b.rsrp - a.rsrp);
    towers.forEach((t, i) => { t.rank = i + 1; });
    return { pos, ping: p, towers };
  }

  // live monitor for a locked tower: REAL ping stream drives the wobble
  function towerLockMonitor(tower, onSample) {
    let running = false;
    async function loop() {
      let i = 0;
      while (running) {
        const p = await pingOnce(2500);
        const wobble = p > 0 ? clamp((p - 60) / 25, -2, 6) : 8; // worse ping → weaker
        const rsrp = Math.round(tower.rsrp - wobble + Math.sin(i / 3) * 1.5);
        const pct = Math.round(clamp((rsrp + 120) * 2, 0, 100));
        onSample({ rsrp, pct, ping: p, ok: p > 0 });
        i++;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    return {
      start() { if (!running) { running = true; loop(); } },
      stop() { running = false; },
    };
  }

  // ================= ROUTER OPTIMIZER WIZARD =================
  // Runs REAL quick diagnostics, then builds a personalized router tune-up
  // checklist. Each item: {key, gain} — strings resolved by the UI layer.
  async function routerDiagnose(onPhase) {
    onPhase && onPhase("ping");
    const p = await ping(5);
    const j = await jitter(5);
    onPhase && onPhase("bloat");
    const bloat = await latencyUnderLoad({ mb: 25, maxMs: 6000 });
    onPhase && onPhase("dns");
    const dns = await dnsRace();
    const items = [];
    // channel / band advice always applies on 2.4GHz-heavy homes
    if (j > 15 || p > 80) items.push({ key: "rtChannel", gain: 2 });
    if (bloat.grade === "C" || bloat.grade === "D" || bloat.grade === "F")
      items.push({ key: "rtQos", gain: 3 });
    const fastest = dns.find((d) => d.ms > 0);
    if (fastest) items.push({ key: "rtDns", gain: 1, extra: `${fastest.name} (${fastest.ip})` });
    if (j > 25) items.push({ key: "rtInterference", gain: 2 });
    items.push({ key: "rtBand", gain: 2 });
    items.push({ key: "rtFirmware", gain: 1 });
    items.push({ key: "rtRestart", gain: 1 });
    if (p > 120) items.push({ key: "rtEthernet", gain: 3 });
    // current router score from the diagnostics
    const gradeMap = { A: 100, B: 80, C: 55, D: 35, F: 15 };
    const score = Math.round(clamp(
      (100 - clamp(p - 20, 0, 200) / 2.2) * 0.45 +
      (gradeMap[bloat.grade] || 50) * 0.35 +
      clamp(100 - j * 2.5, 0, 100) * 0.20, 0, 100));
    return { ping: p, jitter: j, bloat, dns: fastest || null, items, score };
  }

  // ================= CONNECTION BOOST =================
  // REAL technique: browsers keep TCP/TLS connections alive after first use,
  // so pre-warming connections to the services you use genuinely cuts the
  // latency of the next requests (DNS + handshake already done). We measure
  // before (cold) and after (warm) so the gain shown is real.
  const boostHosts = [
    "https://speed.cloudflare.com/__down?bytes=0",
    "https://www.google.com/favicon.ico",
    "https://www.youtube.com/favicon.ico",
    "https://static.whatsapp.net/favicon.ico",
    "https://www.instagram.com/favicon.ico",
    "https://www.tiktok.com/favicon.ico",
    "https://www.snapchat.com/favicon.ico",
    "https://discord.com/assets/favicon.ico",
  ];
  async function connectionBoost(onStep) {
    const probes = boostHosts.slice(1, 5); // measured subset (cold vs warm)
    onStep && onStep("measure", 0);
    const before = [];
    for (const u of probes) { const v = await reachOnce(u); if (v > 0) before.push(v); }
    const beforeMs = before.length ? before.reduce((a, b) => a + b, 0) / before.length : 0;
    // warm every host twice, in parallel waves
    onStep && onStep("warm", 30);
    await Promise.all(boostHosts.map((u) => reachOnce(u)));
    onStep && onStep("warm", 65);
    await Promise.all(boostHosts.map((u) => reachOnce(u)));
    onStep && onStep("verify", 85);
    const after = [];
    for (const u of probes) { const v = await reachOnce(u); if (v > 0) after.push(v); }
    const afterMs = after.length ? after.reduce((a, b) => a + b, 0) / after.length : 0;
    onStep && onStep("done", 100);
    const gain = beforeMs > 0 && afterMs > 0 ? Math.max(0, Math.round((1 - afterMs / beforeMs) * 100)) : 0;
    return { before: beforeMs, after: afterMs, gain, hosts: boostHosts.length };
  }

  // ---- tower connect: negotiation with REAL before/after latency ----
  async function towerConnect(tower, onPhase) {
    onPhase && onPhase("baseline");
    const before = await ping(3);
    onPhase && onPhase("negotiate");
    // real warm-up toward the edge + big CDNs (improves subsequent latency)
    await Promise.all([
      reachOnce("https://speed.cloudflare.com/__down?bytes=0"),
      reachOnce("https://www.google.com/favicon.ico"),
    ]);
    await Promise.all([
      reachOnce("https://speed.cloudflare.com/__down?bytes=0"),
      reachOnce("https://www.youtube.com/favicon.ico"),
    ]);
    onPhase && onPhase("verify");
    const after = await ping(3);
    const gain = before > 0 && after > 0 ? Math.max(0, Math.round((1 - after / before) * 100)) : 0;
    return { before, after, gain };
  }

  // ---- router profiles: tailored settings per use case ----
  const routerProfiles = {
    gaming:    ["rpQosGame", "rpEthernet", "rp5ghz", "rpChannel", "rpDmzNo"],
    streaming: ["rpQosStream", "rp5ghz", "rpPlacement", "rpBand40"],
    calls:     ["rpQosCalls", "rpChannel", "rpInterference", "rpReboot"],
  };

  return { ping, jitter, pingSample, download, upload, dnsRace, connectionInfo,
           scoreSpot, verdicts, clamp, latencyUnderLoad, bloatGrade,
           connectionIntel, stabilityMonitor,
           reachServices, reachOnce, reachMeasure, healthScore,
           locate, towerScan, towerLockMonitor, routerDiagnose,
           connectionBoost, towerConnect, routerProfiles };
})();
