/* ===== موجة app.js — UI wiring ===== */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fmt = (n, d = 1) => (n <= 0 ? "—" : n.toFixed(d));

  // ---------- i18n boot ----------
  Lang.apply();
  $("#langBtn").addEventListener("click", () => Lang.toggle());

  // ---------- navigation ----------
  $$(".nav button").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.page;
      $$(".nav button").forEach(b => b.classList.toggle("active", b === btn));
      $$(".page").forEach(pg => pg.classList.toggle("active", pg.id === `page-${p}`));
    });
  });

  // ================= RADAR (home) =================
  const cv = $("#radar"), ctx = cv.getContext("2d");
  let level = 0, sweep = 0, rafId = null, pulsing = false, pulseTimer = null;

  function drawRadar() {
    const w = cv.width, h = cv.height, cx = w / 2, cy = h / 2, R = w / 2 - 16;
    ctx.clearRect(0, 0, w, h);
    // rings
    ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 2;
    for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(cx, cy, R * i / 4, 0, 7); ctx.stroke(); }
    // cross
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    // sweep arm
    const a = sweep * Math.PI * 2;
    const g = ctx.createConicGradient ? ctx.createConicGradient(a, cx, cy) : null;
    if (g) {
      g.addColorStop(0, "rgba(0,229,160,.38)");
      g.addColorStop(0.12, "rgba(0,229,160,0)");
      g.addColorStop(1, "rgba(0,229,160,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    }
    // level arc
    ctx.lineCap = "round"; ctx.lineWidth = 16;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#37B6FF"); grad.addColorStop(1, "#00E5A0");
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, R - 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * level);
    ctx.stroke();
  }
  function loop() { sweep = (sweep + 0.006) % 1; drawRadar(); rafId = requestAnimationFrame(loop); }
  loop();

  function qualityLabel(pct) {
    if (pct >= 75) return Lang.t("excellent");
    if (pct >= 55) return Lang.t("good");
    if (pct >= 35) return Lang.t("fair");
    return Lang.t("weak");
  }
  function setRadar(pct) {
    level = Engine.clamp(pct, 0, 100) / 100;
    $("#radarPct").textContent = `${Math.round(pct)}%`;
    $("#radarQual").textContent = qualityLabel(pct);
  }

  // one measurement cycle for home
  async function homeScan() {
    $("#radarQual").textContent = Lang.t("scanning");
    const info = Engine.connectionInfo();
    $("#stConn").textContent =
      info.type + (info.downlink ? ` · ~${info.downlink}Mb` : "");
    const p = await Engine.ping(4);
    const j = await Engine.jitter(4);
    $("#stPing").textContent = p > 0 ? `${p.toFixed(0)} ${Lang.t("ms")}` : "—";
    $("#stJitter").textContent = j > 0 ? `${j.toFixed(0)} ${Lang.t("ms")}` : "—";
    // short speed probe for the ring + est speed
    let sp = 0;
    for await (const s of Engine.download(4, 5000)) { sp = s; }
    $("#stDown").textContent = sp > 0 ? `${sp.toFixed(1)} ${Lang.t("mbps")}` : "—";
    // pct from latency + speed blend
    const lat = Engine.clamp(100 - Engine.clamp(p, 5, 300) / 3, 0, 100);
    const spd = Engine.clamp(sp / 2, 0, 100);
    setRadar(spd * 0.6 + lat * 0.4);
  }

  const pulseBtn = $("#pulseBtn");
  pulseBtn.addEventListener("click", async () => {
    if (pulsing) { // stop
      pulsing = false; clearTimeout(pulseTimer);
      pulseBtn.textContent = Lang.t("livePulse");
      return;
    }
    pulsing = true; pulseBtn.textContent = Lang.t("pulseStop");
    const tick = async () => {
      if (!pulsing) return;
      await homeScan();
      if (pulsing) pulseTimer = setTimeout(tick, 1200);
    };
    tick();
  });
  // first passive scan on load
  setTimeout(homeScan, 600);

  // ================= SPEED TEST =================
  const gaugeVal = $("#gaugeVal"), gaugePhase = $("#gaugePhase");
  let running = false, last = null;

  function animateGauge(v, up) {
    gaugeVal.classList.toggle("up", up);
    gaugeVal.textContent = v.toFixed(1);
  }

  async function runSpeed() {
    if (running) return;
    running = true;
    const btn = $("#speedBtn");
    btn.disabled = true; btn.textContent = Lang.t("testing");
    $("#verdicts").innerHTML = "";
    ["mDown", "mUp", "mPing", "mJit"].forEach(id => $("#" + id).textContent = "—");

    gaugePhase.textContent = "⚡ " + Lang.t("ping");
    const ping = await Engine.ping(6);
    const jit = await Engine.jitter(6);
    $("#mPing").textContent = ping > 0 ? ping.toFixed(0) : "—";
    $("#mJit").textContent = jit > 0 ? jit.toFixed(0) : "—";

    gaugePhase.textContent = "⬇️ " + Lang.t("download");
    let down = 0;
    for await (const s of Engine.download(40)) { down = s; animateGauge(s, false); }
    $("#mDown").textContent = down.toFixed(1);

    gaugePhase.textContent = "⬆️ " + Lang.t("upload");
    let up = 0;
    for await (const s of Engine.upload(12)) { up = s; animateGauge(s, true); }
    $("#mUp").textContent = up.toFixed(1);

    gaugePhase.textContent = "";
    animateGauge(down, false);

    // verdicts
    const vs = Engine.verdicts(down, up, ping, jit);
    $("#verdicts").innerHTML = vs.map(v =>
      `<span class="chip ${v.cls}">${v.icon} ${v.label}</span>`).join("");

    last = { down, up, ping, jit, ts: Date.now() };
    saveHistory(last);
    renderHistory();

    btn.disabled = false; btn.textContent = Lang.t("start");
    running = false;
  }
  $("#speedBtn").addEventListener("click", runSpeed);

  // history
  function getHistory() { try { return JSON.parse(localStorage.getItem("mawja_hist") || "[]"); } catch { return []; } }
  function saveHistory(r) {
    const h = getHistory(); h.unshift(r);
    localStorage.setItem("mawja_hist", JSON.stringify(h.slice(0, 10)));
  }
  function renderHistory() {
    const h = getHistory();
    if (!h.length) { $("#histCard").style.display = "none"; return; }
    $("#histCard").style.display = "block";
    $("#histList").innerHTML = h.map(r => {
      const d = new Date(r.ts);
      const t = d.toLocaleString(Lang.isAr() ? "ar" : "en", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      return `<div class="hist"><span class="d">${t}</span>
        <span>⬇️ <b style="color:var(--signal)">${r.down.toFixed(1)}</b> · ⬆️ <b style="color:var(--wave)">${r.up.toFixed(1)}</b> · ${r.ping.toFixed(0)}${Lang.t("ms")}</span></div>`;
    }).join("");
  }
  renderHistory();

  // share
  $("#shareBtn").addEventListener("click", async () => {
    if (!last) return;
    const txt = Lang.isAr()
      ? `📡 نتيجة موجة:\nتحميل ${last.down.toFixed(1)} · رفع ${last.up.toFixed(1)} ميجابت/ث\nبنق ${last.ping.toFixed(0)}ms · تذبذب ${last.jit.toFixed(0)}ms`
      : `📡 Mawja result:\n↓ ${last.down.toFixed(1)} · ↑ ${last.up.toFixed(1)} Mbps\nping ${last.ping.toFixed(0)}ms · jitter ${last.jit.toFixed(0)}ms`;
    try {
      if (navigator.share) await navigator.share({ title: "Mawja", text: txt });
      else { await navigator.clipboard.writeText(txt); toast(Lang.isAr() ? "نُسخت النتيجة" : "Copied"); }
    } catch {}
  });

  // ================= PLACEMENT =================
  const dlg = $("#roomDlg");
  function getSpots() { try { return JSON.parse(localStorage.getItem("mawja_spots") || "[]"); } catch { return []; } }
  function setSpots(s) { localStorage.setItem("mawja_spots", JSON.stringify(s)); }

  function scoreColor(s) { return s >= 75 ? "var(--signal)" : s >= 50 ? "var(--warn)" : "var(--danger)"; }

  function renderSpots() {
    const spots = getSpots().sort((a, b) => b.score - a.score);
    if (!spots.length) {
      $("#bestSpot").innerHTML = ""; $("#spotsCard").style.display = "none";
      $("#clearSpots").style.display = "none"; return;
    }
    $("#bestSpot").innerHTML =
      `<div class="card tint-signal"><div style="display:flex;align-items:center;gap:12px">
        <div style="flex:1;font-weight:800;font-size:16px">${Lang.t("bestSpotIs")}<br><span style="color:var(--signal)">${esc(spots[0].room)}</span></div>
        <div style="font-size:34px;font-weight:800;color:var(--signal)">${spots[0].score}</div>
      </div></div>`;
    $("#spotsCard").style.display = "block";
    $("#spotsList").innerHTML = spots.map((s, i) =>
      `<div class="spot">
         <div class="rank" style="background:${scoreColor(s.score)}22;color:${scoreColor(s.score)}">${i + 1}</div>
         <div><div class="room">${esc(s.room)}</div>
           <div class="sub">${s.down ? s.down.toFixed(1) + " " + Lang.t("mbps") + " · " : ""}${s.ping.toFixed(0)} ${Lang.t("ms")}</div></div>
         <div class="sc" style="color:${scoreColor(s.score)}">${s.score}</div>
       </div>`).join("");
    $("#clearSpots").style.display = "flex";
  }

  const measureBtn = $("#measureBtn");
  $("#roomOk").addEventListener("click", () => dlg.close($("#roomInput").value.trim()));
  $("#roomCancel").addEventListener("click", () => dlg.close(""));
  $("#roomInput").addEventListener("keydown", e => { if (e.key === "Enter") dlg.close($("#roomInput").value.trim()); });

  measureBtn.addEventListener("click", () => {
    $("#roomInput").value = "";
    dlg.showModal();
    setTimeout(() => $("#roomInput").focus(), 50);
    dlg.addEventListener("close", async function handler() {
      dlg.removeEventListener("close", handler);
      const room = dlg.returnValue;
      if (!room) return;
      measureBtn.disabled = true;
      measureBtn.innerHTML = `<span class="spin"></span> ${Lang.t("testing")}`;
      const r = await Engine.scoreSpot();
      const spots = getSpots();
      spots.push({ room, score: r.score, ping: r.ping, down: r.down });
      setSpots(spots);
      renderSpots();
      measureBtn.disabled = false;
      measureBtn.textContent = Lang.t("measureHere");
    }, { once: true });
  });

  $("#clearSpots").addEventListener("click", () => { setSpots([]); renderSpots(); });
  renderSpots();

  // ================= OPTIMIZER =================
  const dnsBtn = $("#dnsBtn");
  dnsBtn.addEventListener("click", async () => {
    dnsBtn.disabled = true;
    dnsBtn.innerHTML = `<span class="spin" style="border-top-color:var(--wave)"></span> ${Lang.t("testing")}`;
    const res = await Engine.dnsRace();
    const max = Math.max(...res.map(r => (r.ms > 0 ? r.ms : 0)), 1);
    $("#dnsList").innerHTML = res.map((r, i) => `
      <div>
        <div class="dns-row">
          ${i === 0 ? "🏆" : "&nbsp;"}
          <span class="nm">${r.name}</span> <span class="ip">${r.ip}</span>
          <span class="ms" style="color:${i === 0 ? "var(--signal)" : "var(--ink-dim)"}">${r.ms > 0 ? r.ms.toFixed(0) + " " + Lang.t("ms") : "—"}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${r.ms > 0 ? Math.max(8, (r.ms / max) * 100) : 0}%"></div></div>
      </div>`).join("");
    dnsBtn.disabled = false;
    dnsBtn.textContent = Lang.t("runDns");
  });

  const TIPS = {
    ar: [
      "ضع المودم مرتفعاً وفي منتصف المنزل، بعيداً عن الجدران السميكة والمرايا.",
      "استخدم شبكة 5GHz للأجهزة القريبة و2.4GHz للغرف البعيدة.",
      "أبعد المودم عن المايكروويف وأجهزة البلوتوث — تشوّش على 2.4GHz.",
      "أعد تشغيل المودم مرة أسبوعياً لتفريغ الذاكرة.",
      "حدّث برنامج الراوتر (Firmware) من صفحة الإعدادات.",
      "وجّه هوائيات الراوتر: أحدها عمودي والآخر أفقي لتغطية أوسع.",
    ],
    en: [
      "Place the modem high and central, away from thick walls and mirrors.",
      "Use 5GHz for nearby devices, 2.4GHz for far rooms.",
      "Keep it away from microwaves and Bluetooth hubs — they jam 2.4GHz.",
      "Reboot the router weekly to clear its memory.",
      "Update the router firmware from its settings page.",
      "Angle the antennas: one vertical, one horizontal for wider coverage.",
    ],
  };
  function renderTips() {
    $("#tipsList").innerHTML = TIPS[Lang.cur].map(t =>
      `<div class="tip"><span class="dot">•</span><span>${t}</span></div>`).join("");
  }
  renderTips();

  // re-render language-dependent content
  document.addEventListener("langchange", () => {
    renderTips(); renderHistory(); renderSpots();
    $("#radarQual").textContent = pulsing ? Lang.t("scanning") : ($("#radarPct").textContent === "—" ? Lang.t("tapToStart") : qualityLabel(parseFloat($("#radarPct").textContent)));
    pulseBtn.textContent = pulsing ? Lang.t("pulseStop") : Lang.t("livePulse");
  });

  // ---------- toast ----------
  let toastEl;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.style.cssText = "position:fixed;left:50%;bottom:100px;transform:translateX(-50%);background:var(--surface2);color:var(--ink);padding:12px 18px;border-radius:14px;box-shadow:var(--shadow);z-index:99;font-weight:700;transition:opacity .3s;border:1px solid var(--card-border)";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg; toastEl.style.opacity = "1";
    clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.style.opacity = "0", 1800);
  }

  // ---------- PWA install ----------
  let deferredPrompt = null;
  const installBar = $("#installBar");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferredPrompt = e;
    if (!localStorage.getItem("mawja_install_dismiss")) installBar.classList.add("show");
  });
  $("#installBtn").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null; installBar.classList.remove("show");
  });
  $("#installClose").addEventListener("click", () => {
    installBar.classList.remove("show");
    localStorage.setItem("mawja_install_dismiss", "1");
  });

  // ---------- helpers ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // ---------- service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
