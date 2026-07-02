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

  return { ping, jitter, download, upload, dnsRace, connectionInfo, scoreSpot, verdicts, clamp };
})();
