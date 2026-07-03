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

  return { ping, jitter, pingSample, download, upload, dnsRace, connectionInfo,
           scoreSpot, verdicts, clamp, latencyUnderLoad, bloatGrade,
           connectionIntel, stabilityMonitor,
           reachServices, reachOnce, reachMeasure, healthScore };
})();
