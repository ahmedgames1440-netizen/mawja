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
      if (p === "opt" && !intelLoaded) loadIntel();
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

  // ---- live stability sparkline ----
  const spark = $("#spark"), sctx = spark.getContext("2d");
  function drawSpark(series) {
    const w = spark.width, h = spark.height;
    sctx.clearRect(0, 0, w, h);
    if (!series.length) return;
    const vals = series.map(s => s.ms);
    const okv = vals.filter(v => v > 0);
    const max = Math.max(30, ...okv) * 1.1, min = 0;
    const stepX = w / Math.max(1, series.length - 1);
    // baseline grid
    sctx.strokeStyle = "rgba(255,255,255,.06)"; sctx.lineWidth = 1;
    for (let g = 1; g <= 3; g++) { const y = h * g / 4; sctx.beginPath(); sctx.moveTo(0, y); sctx.lineTo(w, y); sctx.stroke(); }
    // line
    sctx.lineWidth = 3; sctx.lineJoin = "round";
    const grad = sctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "#37B6FF"); grad.addColorStop(1, "#00E5A0");
    sctx.strokeStyle = grad; sctx.beginPath();
    let started = false;
    series.forEach((s, i) => {
      const x = i * stepX;
      if (s.ms <= 0) { // packet loss marker
        sctx.save(); sctx.strokeStyle = "#FF5470"; sctx.setLineDash([3, 3]);
        sctx.beginPath(); sctx.moveTo(x, 0); sctx.lineTo(x, h); sctx.stroke(); sctx.restore();
        started = false; return;
      }
      const y = h - ((s.ms - min) / (max - min)) * h;
      if (!started) { sctx.moveTo(x, y); started = true; } else sctx.lineTo(x, y);
    });
    sctx.stroke();
  }

  const monitor = Engine.stabilityMonitor((s) => {
    drawSpark(s.series);
    $("#stbScore").textContent = s.score;
    $("#stbAvg").textContent = s.avg ? `${s.avg.toFixed(0)}` : "—";
    $("#stbLoss").textContent = `${s.loss.toFixed(0)}%`;
    $("#stbLast").textContent = s.last > 0 ? `${s.last.toFixed(0)}` : "✕";
    setRadar(s.score); // radar reflects live stability
  });

  const pulseBtn = $("#pulseBtn");
  pulseBtn.addEventListener("click", async () => {
    if (pulsing) { // stop
      pulsing = false; monitor.stop();
      pulseBtn.textContent = Lang.t("livePulse");
      return;
    }
    pulsing = true; pulseBtn.textContent = Lang.t("pulseStop");
    $("#liveCard").style.display = "block";
    $("#radarQual").textContent = Lang.t("liveMonitor");
    homeScan(); // one full pass for connection + est speed
    monitor.clear(); monitor.start();
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

    // bufferbloat / latency-under-load
    gaugePhase.textContent = "🎯 " + Lang.t("bufferbloat");
    const bloat = await Engine.latencyUnderLoad();
    renderBloat(bloat);
    gaugePhase.textContent = "";

    last = { down, up, ping, jit, bloat: bloat.bloat, grade: bloat.grade, ts: Date.now() };
    saveHistory(last);
    renderHistory();
    renderPlan(down);
    renderHealth();

    btn.disabled = false; btn.textContent = Lang.t("start");
    running = false;
  }

  const GRADE_COLOR = { A: "var(--signal)", B: "#7CE0A0", C: "var(--warn)", D: "#FF8A5B", F: "var(--danger)" };
  function renderBloat(b) {
    $("#bloatResult").style.display = "block";
    $("#blIdle").textContent = `${b.idle.toFixed(0)}`;
    $("#blLoad").textContent = `${b.loaded.toFixed(0)}`;
    const g = $("#blGrade");
    g.textContent = b.grade;
    g.style.color = GRADE_COLOR[b.grade];
    g.style.background = GRADE_COLOR[b.grade].startsWith("var")
      ? "rgba(0,229,160,.12)" : GRADE_COLOR[b.grade] + "22";
    const key = { A: "bloatA", B: "bloatB", C: "bloatC", D: "bloatD", F: "bloatF" }[b.grade];
    const v = $("#blVerdict");
    v.textContent = `+${b.bloat.toFixed(0)} ${Lang.t("ms")} · ${Lang.t(key)}`;
    v.style.color = GRADE_COLOR[b.grade];
  }

  // plan vs actual
  function getPlan() { return parseFloat(localStorage.getItem("mawja_plan") || "0") || 0; }
  $("#planSave").addEventListener("click", () => {
    const v = parseFloat($("#planInput").value) || 0;
    if (v > 0) { localStorage.setItem("mawja_plan", String(v)); toast(Lang.isAr() ? "تم الحفظ" : "Saved"); if (last) renderPlan(last.down); }
  });
  function renderPlan(down) {
    const plan = getPlan();
    if (!plan || !down) { $("#planResult").style.display = "none"; return; }
    const pct = Math.min(100, (down / plan) * 100);
    $("#planResult").style.display = "block";
    $("#planBar").style.width = `${pct}%`;
    $("#planPct").textContent = `${pct.toFixed(0)}% (${down.toFixed(0)}/${plan})`;
    const key = pct >= 85 ? "planGreat" : pct >= 60 ? "planOk" : "planLow";
    const col = pct >= 85 ? "var(--signal)" : pct >= 60 ? "var(--warn)" : "var(--danger)";
    const v = $("#planVerdict"); v.textContent = Lang.t(key); v.style.color = col;
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
      const grade = r.grade ? ` · <b style="color:var(--warn)">${r.grade}</b>` : "";
      return `<div class="hist"><span class="d">${t}</span>
        <span>⬇️ <b style="color:var(--signal)">${r.down.toFixed(1)}</b> · ⬆️ <b style="color:var(--wave)">${r.up.toFixed(1)}</b> · ${r.ping.toFixed(0)}${Lang.t("ms")}${grade}</span></div>`;
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
    if (last) { if (last.bloat != null) renderBloat({ idle: last.ping, loaded: last.ping + last.bloat, bloat: last.bloat, grade: last.grade }); renderPlan(last.down); }
    renderHealth();
    if (twData) renderTowers();
    if (wzResult) renderWizard();
    renderProfiles();
    if (intelLoaded) loadIntel();
    $("#radarQual").textContent = pulsing ? Lang.t("liveMonitor") : ($("#radarPct").textContent === "—" ? Lang.t("tapToStart") : qualityLabel(parseFloat($("#radarPct").textContent)));
    pulseBtn.textContent = pulsing ? Lang.t("pulseStop") : Lang.t("livePulse");
  });

  // ---------- connection intel ----------
  let intelLoaded = false;
  async function loadIntel() {
    intelLoaded = true;
    ["ivIp", "ivIsp", "ivLoc", "ivEdge"].forEach(id => $("#" + id).textContent = "…");
    const info = await Engine.connectionIntel();
    $("#ivIp").textContent = info.ip || "—";
    $("#ivIsp").textContent = info.isp || info.org || (info.asn ? "AS" + info.asn : "—");
    const loc = [info.city, info.region, info.country].filter(Boolean).join("، ");
    $("#ivLoc").textContent = (info.flag ? info.flag + " " : "") + (loc || "—");
    $("#ivEdge").textContent = info.edge ? `☁️ ${info.edge}` : "—";
  }
  $("#intelRefresh").addEventListener("click", () => { intelLoaded = false; loadIntel(); });

  // restore saved plan
  (() => { const p = getPlan(); if (p) $("#planInput").value = p; })();

  // ---------- Network Health Score ----------
  function latestResult() { return last || getHistory()[0] || null; }
  function healthMsgFor(s) {
    const k = s >= 80 ? "excellent" : s >= 55 ? "good" : s >= 40 ? "fair" : "weak";
    return Lang.t(k);
  }
  const REC_KEY = { speed: "recSpeed", latency: "recLatency", bloat: "recBloat", jitter: "recJitter" };
  function renderHealth() {
    const d = latestResult();
    if (!d) return;
    const h = Engine.healthScore({ down: d.down, up: d.up, ping: d.ping, jit: d.jit, grade: d.grade, plan: getPlan() });
    const C = 327, arc = $("#healthArc");
    const col = h.score >= 80 ? "var(--signal)" : h.score >= 55 ? "var(--warn)" : "var(--danger)";
    arc.style.strokeDashoffset = String(C * (1 - h.score / 100));
    arc.style.stroke = col;
    $("#hsGrade").textContent = h.grade; $("#hsGrade").style.color = col;
    $("#hsNum").textContent = `${h.score}/100`;
    $("#healthMsg").textContent = healthMsgFor(h.score);
    $("#healthRun").textContent = Lang.t("runTest");
    if (h.tips.length) {
      $("#recsCard").style.display = "block";
      $("#recsList").innerHTML = h.tips.map(t =>
        `<div class="tip"><span class="dot">•</span><span>${Lang.t(REC_KEY[t])}</span></div>`).join("");
    } else $("#recsCard").style.display = "none";
  }
  $("#healthRun").addEventListener("click", () => {
    document.querySelector('[data-page="speed"]').click();
    runSpeed();
  });
  renderHealth(); // from stored history if any

  // ---------- Reach: apps & games response time ----------
  function reachColor(ms) { return ms < 0 ? "var(--ink-dim)" : ms < 80 ? "var(--signal)" : ms < 200 ? "var(--warn)" : "var(--danger)"; }
  function reachRow(r, max) {
    const c = reachColor(r.ms);
    const w = r.ms > 0 ? Math.max(8, (r.ms / max) * 100) : 0;
    return `<div class="reach-row"><span class="re-ic">${r.icon}</span><span class="re-nm">${esc(r.name)}</span>
      <span class="re-bar"><span style="width:${w}%;background:${c}"></span></span>
      <span class="re-ms" style="color:${c}">${r.ms > 0 ? r.ms.toFixed(0) + " " + Lang.t("ms") : "—"}</span></div>`;
  }
  let reaching = false;
  async function runReach() {
    if (reaching) return; reaching = true;
    const btn = $("#reachBtn");
    btn.disabled = true; btn.innerHTML = `<span class="spin"></span> ${Lang.t("testing")}`;
    $("#appsCard").style.display = "block"; $("#gamesCard").style.display = "block";
    const results = { apps: [], games: [] };
    const render = (cat) => {
      const list = results[cat].slice().sort((a, b) => (a.ms < 0 ? 9e9 : a.ms) - (b.ms < 0 ? 9e9 : b.ms));
      const max = Math.max(60, ...list.filter(x => x.ms > 0).map(x => x.ms));
      $(cat === "apps" ? "#appsList" : "#gamesList").innerHTML = list.map(r => reachRow(r, max)).join("");
    };
    for (const s of Engine.reachServices) {
      const r = await Engine.reachMeasure(s);
      results[s.cat].push(r); render(s.cat);
    }
    btn.disabled = false; btn.textContent = Lang.t("runReach"); reaching = false;
  }
  $("#reachBtn").addEventListener("click", runReach);

  // ---------- Shareable report image ----------
  async function makeReport() {
    const d = latestResult();
    if (!d) { toast(Lang.t("healthEmpty")); document.querySelector('[data-page="speed"]').click(); return; }
    const h = Engine.healthScore({ down: d.down, up: d.up, ping: d.ping, jit: d.jit, grade: d.grade, plan: getPlan() });
    const W = 800, H = 520, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const x = cv.getContext("2d");
    // background
    const bg = x.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#0c1730"); bg.addColorStop(1, "#070C17");
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.fillStyle = "rgba(255,255,255,.04)"; roundRect(x, 24, 24, W - 48, H - 48, 28); x.fill();
    // brand
    x.textAlign = "left"; x.fillStyle = "#EAF2FF";
    x.font = "800 40px Tajawal, sans-serif"; x.fillText("موجة", 56, 92);
    x.fillStyle = "#8A9BB8"; x.font = "500 20px Space Grotesk, sans-serif"; x.fillText("Mawja · Network Report", 56, 122);
    x.textAlign = "right"; x.fillStyle = "#8A9BB8"; x.font = "400 18px Space Grotesk, sans-serif";
    x.fillText(new Date(d.ts || Date.now()).toLocaleString(Lang.isAr() ? "ar" : "en"), W - 56, 92);
    // health ring
    const cx = 660, cy = 250, r = 74;
    x.lineWidth = 16; x.strokeStyle = "rgba(255,255,255,.10)"; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
    const col = h.score >= 80 ? "#00E5A0" : h.score >= 55 ? "#FFB547" : "#FF5470";
    x.strokeStyle = col; x.lineCap = "round"; x.beginPath();
    x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (h.score / 100)); x.stroke();
    x.textAlign = "center"; x.fillStyle = col; x.font = "800 46px Tajawal, sans-serif"; x.fillText(h.grade, cx, cy + 6);
    x.fillStyle = "#8A9BB8"; x.font = "500 18px Space Grotesk, sans-serif"; x.fillText(`${h.score}/100`, cx, cy + 34);
    // metrics grid
    const metrics = [
      ["⬇ " + Lang.t("download"), d.down.toFixed(1) + " " + Lang.t("mbps"), "#00E5A0"],
      ["⬆ " + Lang.t("upload"), d.up.toFixed(1) + " " + Lang.t("mbps"), "#37B6FF"],
      [Lang.t("ping"), d.ping.toFixed(0) + " " + Lang.t("ms"), "#FFB547"],
      [Lang.t("bufferbloat"), (d.grade || "—"), "#FF8A5B"],
    ];
    x.textAlign = "left";
    metrics.forEach((m, i) => {
      const px = 56, py = 190 + i * 74;
      x.fillStyle = "#8A9BB8"; x.font = "500 18px Space Grotesk, sans-serif"; x.fillText(m[0], px, py);
      x.fillStyle = m[2]; x.font = "800 32px Space Grotesk, sans-serif"; x.fillText(m[1], px, py + 32);
    });
    x.textAlign = "center"; x.fillStyle = "#8A9BB8"; x.font = "400 16px Space Grotesk, sans-serif";
    x.fillText("ahmedgames1440-netizen.github.io/mawja", W / 2, H - 44);

    const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
    const file = new File([blob], "mawja-report.png", { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Mawja", text: Lang.isAr() ? "تقرير شبكتي من موجة" : "My Mawja network report" });
      } else {
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "mawja-report.png"; a.click();
        toast(Lang.t("reportSaved"));
      }
    } catch (_) {}
  }
  function roundRect(ctx, x0, y0, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x0 + r, y0);
    ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r); ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
    ctx.arcTo(x0, y0 + h, x0, y0, r); ctx.arcTo(x0, y0, x0 + w, y0, r); ctx.closePath();
  }
  $("#reportBtn").addEventListener("click", makeReport);

  // ---------- Towers ----------
  let twData = null, lockedTower = null, lockMon = null;

  function drawTowerMap(data, locked) {
    const cv = $("#twMap"), c = cv.getContext("2d");
    const w = cv.width, h = cv.height, cx = w / 2, cy = h / 2, R = w / 2 - 20;
    c.clearRect(0, 0, w, h);
    // rings
    c.strokeStyle = "rgba(255,255,255,.08)"; c.lineWidth = 2;
    for (let i = 1; i <= 3; i++) { c.beginPath(); c.arc(cx, cy, R * i / 3, 0, 7); c.stroke(); }
    // ring distance labels (3.5km max)
    c.fillStyle = "rgba(255,255,255,.28)"; c.font = "500 20px sans-serif"; c.textAlign = "center";
    [1.2, 2.3, 3.5].forEach((km, i) => c.fillText(`${km}`, cx, cy - R * (i + 1) / 3 + 26));
    // towers
    data.towers.forEach((t) => {
      const r = (t.dist / 3.5) * R;
      const a = (t.bearing - 90) * Math.PI / 180;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      const isLock = locked && locked.id === t.id;
      if (isLock) { // pulse ring for the locked tower
        c.strokeStyle = "#00E5A0"; c.lineWidth = 3;
        c.beginPath(); c.arc(x, y, 26, 0, 7); c.stroke();
      }
      c.fillStyle = t.color;
      c.beginPath(); c.arc(x, y, isLock ? 14 : 10, 0, 7); c.fill();
      c.fillStyle = "rgba(255,255,255,.85)"; c.font = "700 17px sans-serif";
      c.fillText(t.gen, x, y - 18);
    });
    // you
    c.fillStyle = "#37B6FF";
    c.beginPath(); c.arc(cx, cy, 11, 0, 7); c.fill();
    c.strokeStyle = "rgba(55,182,255,.4)"; c.lineWidth = 5;
    c.beginPath(); c.arc(cx, cy, 19, 0, 7); c.stroke();
    c.fillStyle = "#EAF2FF"; c.font = "700 18px sans-serif";
    c.fillText(Lang.t("yourPos"), cx, cy + 42);
  }

  function sigColor(pct) { return pct >= 65 ? "var(--signal)" : pct >= 40 ? "var(--warn)" : "var(--danger)"; }

  let twFilter = "all";
  $$(".tw-filter").forEach((b) => b.addEventListener("click", () => {
    twFilter = b.dataset.twf;
    $$(".tw-filter").forEach((x) => x.classList.toggle("active", x === b));
    renderTowers();
  }));

  function renderTowers() {
    if (!twData) return;
    drawTowerMap(twData, lockedTower);
    $("#twPos").textContent = (twData.pos.src === "gps" ? Lang.t("posGps") : Lang.t("posIp")) +
      ` · ${twData.pos.lat.toFixed(3)}, ${twData.pos.lon.toFixed(3)}`;
    const shown = twData.towers.filter((t) => twFilter === "all" || t.gen === twFilter);
    $("#towersList").innerHTML = shown.map((t) => {
      const isLock = lockedTower && lockedTower.id === t.id;
      return `<div class="tw-row${isLock ? " locked" : ""}">
        <span class="tw-dot" style="background:${t.color}"></span>
        <div class="tw-info">
          <div class="tw-name">${esc(t.op)} <span class="tw-gen${t.gen === "5G" ? " g5" : ""}">${t.gen}</span>${t.rank === 1 ? " 🏆" : ""}</div>
          <div class="tw-sub">${t.band} · ${Lang.t("distance")}: ${t.dist} ${Lang.t("km")}</div>
        </div>
        <div class="tw-sig">
          <div class="tw-rsrp" style="color:${sigColor(t.pct)}">${t.rsrp} dBm</div>
          <div class="tw-sub">${t.pct}%</div>
        </div>
        <button class="tw-lockbtn${isLock ? " on" : ""}" data-lock="${t.id}">${isLock ? Lang.t("connected") : Lang.t("connect")}</button>
      </div>`;
    }).join("");
    $$("#towersList [data-lock]").forEach((b) =>
      b.addEventListener("click", () => lockTower(+b.dataset.lock)));
  }

  let connBusy = false;
  const CONN_PH = { baseline: "baseline", negotiate: "negotiating", verify: "verifying" };
  async function lockTower(id) {
    if (connBusy) return;
    const t = twData.towers.find((x) => x.id === id);
    if (!t) return;
    if (lockedTower && lockedTower.id === id) return unlockTower();
    if (lockMon) lockMon.stop();
    connBusy = true;
    lockedTower = t;
    $("#lockCard").style.display = "block";
    $("#lockName").textContent = `${t.op} · ${t.gen}`;
    $("#lkBand").textContent = t.band;
    $("#connGain").style.display = "none";
    const prog = $("#connProgress");
    prog.style.display = "flex";
    renderTowers();
    $("#lockCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
    // real connection negotiation: before/after latency
    let res = null;
    try {
      res = await Engine.towerConnect(t, (ph) =>
        prog.innerHTML = `<span class="spin" style="border-top-color:var(--warn)"></span> ${Lang.t(CONN_PH[ph] || ph)}`);
    } catch (_) {}
    prog.style.display = "none";
    if (res && res.before > 0 && res.after > 0) {
      $("#connGain").style.display = "flex";
      $("#connGain").innerHTML =
        `<span class="cg-before">${res.before.toFixed(0)} ${Lang.t("ms")}</span>
         <span class="cg-after">${res.after.toFixed(0)} ${Lang.t("ms")}</span>
         <span class="cg-badge">${res.gain > 0 ? `⚡ ${res.gain}% ${Lang.t("boostFaster")}` : "✓"}</span>`;
    }
    // live monitor keeps running after connect
    lockMon = Engine.towerLockMonitor(t, (s) => {
      $("#lkRsrp").textContent = `${s.rsrp}`;
      $("#lkPct").textContent = `${s.pct}%`;
      $("#lkPing").textContent = s.ok ? `${s.ping.toFixed(0)}` : "✕";
      $("#lkBar").style.width = `${s.pct}%`;
    });
    lockMon.start();
    connBusy = false;
  }
  function unlockTower() {
    if (lockMon) lockMon.stop();
    lockMon = null; lockedTower = null;
    $("#lockCard").style.display = "none";
    renderTowers();
  }
  $("#unlockBtn").addEventListener("click", unlockTower);
  function bestOf(gen) {
    const list = twData ? twData.towers.filter((t) => t.gen === gen) : [];
    return list.length ? list[0] : null;
  }
  $("#best5gBtn").addEventListener("click", () => { const t = bestOf("5G"); if (t) lockTower(t.id); });
  $("#best4gBtn").addEventListener("click", () => { const t = bestOf("4G"); if (t) lockTower(t.id); });

  let scanningTw = false;
  $("#towersBtn").addEventListener("click", async () => {
    if (scanningTw) return; scanningTw = true;
    const btn = $("#towersBtn");
    btn.disabled = true; btn.innerHTML = `<span class="spin"></span> ${Lang.t("testing")}`;
    unlockTower();
    twData = await Engine.towerScan();
    btn.disabled = false; btn.textContent = Lang.t("scanTowers"); scanningTw = false;
    if (!twData) { toast(Lang.t("locFailed")); return; }
    $("#towersResult").style.display = "block";
    renderTowers();
  });

  // ---------- Router tune-up wizard ----------
  let wzResult = null;
  function getWzDone() { try { return JSON.parse(localStorage.getItem("mawja_rt_done") || "{}"); } catch { return {}; } }
  function setWzDone(d) { localStorage.setItem("mawja_rt_done", JSON.stringify(d)); }

  function renderWizard() {
    if (!wzResult) return;
    const done = getWzDone();
    $("#wizardResult").style.display = "block";
    const col = wzResult.score >= 75 ? "var(--signal)" : wzResult.score >= 50 ? "var(--warn)" : "var(--danger)";
    const sc = $("#wzScore"); sc.textContent = wzResult.score; sc.style.color = col;
    const remaining = wzResult.items.filter((i) => !done[i.key]).reduce((a, b) => a + b.gain, 0);
    $("#wzGain").textContent = remaining > 0 ? `+${remaining * 4}%` : "🎉";
    $("#wzDone").textContent = wzResult.items.filter((i) => done[i.key]).length;
    $("#wizardSteps").innerHTML = wzResult.items.map((it) => {
      const d = !!done[it.key];
      const txt = Lang.t(it.key) + (it.extra ? ` <b style="color:var(--signal)">${esc(it.extra)}</b>` : "");
      return `<div class="wz-step${d ? " done" : ""}" data-wz="${it.key}">
        <span class="wz-check">${d ? "✓" : ""}</span>
        <span class="wz-txt">${txt}</span>
        <span class="wz-gain">+${it.gain * 4}%</span>
      </div>`;
    }).join("");
    $$("#wizardSteps [data-wz]").forEach((el) =>
      el.addEventListener("click", () => {
        const d = getWzDone(); d[el.dataset.wz] = !d[el.dataset.wz];
        setWzDone(d); renderWizard();
      }));
  }

  let wizardBusy = false;
  const WZ_PH = { ping: "phPing", bloat: "phBloat", dns: "phDns" };
  async function diagnose(phaseEl) {
    return Engine.routerDiagnose((p) =>
      phaseEl.innerHTML = `<span class="spin" style="border-top-color:var(--warn)"></span> ${Lang.t(WZ_PH[p] || p)}`);
  }
  $("#wizardBtn").addEventListener("click", async () => {
    if (wizardBusy) return; wizardBusy = true;
    const btn = $("#wizardBtn"), ph = $("#wizardPhase");
    btn.disabled = true; ph.style.display = "flex";
    try {
      wzResult = await diagnose(ph);
      // keep the FIRST score as the before/after baseline
      if (!localStorage.getItem("mawja_rt_base"))
        localStorage.setItem("mawja_rt_base", String(wzResult.score));
      renderWizard();
    } finally {
      ph.style.display = "none";
      btn.disabled = false; btn.textContent = Lang.t("rerunWizard");
      wizardBusy = false;
    }
  });

  // measure real improvement vs the first diagnosis
  $("#gainBtn").addEventListener("click", async () => {
    if (wizardBusy) return; wizardBusy = true;
    const btn = $("#gainBtn"), ph = $("#wizardPhase");
    btn.disabled = true; ph.style.display = "flex";
    try {
      const base = parseInt(localStorage.getItem("mawja_rt_base") || "0", 10) || (wzResult ? wzResult.score : 0);
      const r = await diagnose(ph);
      wzResult = r; renderWizard();
      $("#gainResult").style.display = "block";
      $("#gnBefore").textContent = base;
      const col = r.score > base ? "var(--signal)" : "var(--warn)";
      const gn = $("#gnAfter"); gn.textContent = r.score; gn.style.color = col;
      const v = $("#gnVerdict");
      if (r.score > base + 2) { v.textContent = `+${r.score - base} · ${Lang.t("improved")}`; v.style.color = "var(--signal)"; }
      else { v.textContent = Lang.t("noChange"); v.style.color = "var(--warn)"; }
    } finally {
      ph.style.display = "none"; btn.disabled = false; wizardBusy = false;
    }
  });

  // ---------- Router presets ----------
  let curProf = "gaming";
  function renderProfiles() {
    $("#profList").innerHTML = Engine.routerProfiles[curProf].map((k) =>
      `<div class="tip"><span class="dot">•</span><span>${Lang.t(k)}</span></div>`).join("");
  }
  $$(".prof-tab").forEach((b) => b.addEventListener("click", () => {
    curProf = b.dataset.prof;
    $$(".prof-tab").forEach((x) => x.classList.toggle("active", x === b));
    renderProfiles();
  }));
  renderProfiles();

  // ---------- Connection Boost ----------
  let boostBusy = false;
  const BO_PH = { measure: "boostMeasure", warm: "boostWarm", verify: "boostVerify", done: "boostDone" };
  $("#boostBtn").addEventListener("click", async () => {
    if (boostBusy) return; boostBusy = true;
    const btn = $("#boostBtn"), bar = $("#boostBar"), fill = $("#boostFill"), ph = $("#boostPhase");
    btn.disabled = true; btn.textContent = Lang.t("boosting");
    bar.style.display = "block"; ph.style.display = "block"; fill.style.width = "0%";
    $("#boostResult").style.display = "none";
    try {
      const r = await Engine.connectionBoost((step, pct) => {
        fill.style.width = `${pct}%`;
        ph.textContent = Lang.t(BO_PH[step] || step);
      });
      $("#boostResult").style.display = "block";
      $("#boBefore").textContent = r.before > 0 ? `${r.before.toFixed(0)} ${Lang.t("ms")}` : "—";
      $("#boAfter").textContent = r.after > 0 ? `${r.after.toFixed(0)} ${Lang.t("ms")}` : "—";
      $("#boGain").textContent = r.gain > 0 ? `⚡ ${r.gain}%` : "✨";
      $("#boMsg").textContent = r.gain > 0
        ? (Lang.isAr() ? `استجابة خدماتك صارت أسرع بنسبة ${r.gain}% (اتصالات دافئة لـ${r.hosts} خدمات)` :
                         `Your services now respond ${r.gain}% faster (warm connections to ${r.hosts} services)`)
        : Lang.t("boostNoGain");
    } finally {
      bar.style.display = "none"; ph.style.display = "none";
      btn.disabled = false; btn.textContent = Lang.t("boost");
      boostBusy = false;
    }
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
