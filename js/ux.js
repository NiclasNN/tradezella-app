/* Upplevelsen runt loggningen: ikoner, konfetti, uppräkning, skärmbild från Bybit (⌘V eller dra hit) och kortkommandon. */
(() => {
  "use strict";
  const App = window.App;
  const { fmt, esc } = App;
  const reduced = () => Boolean(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  // ---------------------------------------------------------------- ikoner (streck-SVG som ärver textfärgen)
  const ICONS = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    paste: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    stop: '<path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z"/><path d="M8 12h8"/>',
    flip: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    pause: '<circle cx="12" cy="12" r="10"/><path d="M10 15V9M14 15V9"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    up: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    down: '<path d="m3 7 6 6 4-4 8 8"/><path d="M14 17h7v-7"/>',
    flag: '<path d="M4 22V4a1 1 0 0 1 1-1h11l-2 4 2 4H5"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    chevR: '<path d="m9 6 6 6-6 6"/>',
    chevL: '<path d="m15 6-6 6 6 6"/>',
    list: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    note: '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4M16 3v4M8.5 12h7M8.5 16h4"/>',
    rocket: '<path d="M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5"/><path d="M9 15 6 12c1-4 4-8 12-9-.7 8-5 11-9 12z"/><circle cx="14.5" cy="9.5" r="1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    candles: '<path d="M7 3v5M7 16v5M17 2v4M17 14v8"/><rect x="5" y="8" width="4" height="8" rx="1"/><rect x="15" y="6" width="4" height="8" rx="1"/>',
  };
  App.icon = (name, size = 18) =>
    `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  /** Ikon framför en insikt: styrka, svaghet eller observation. */
  App.insightIcon = (kind) => `<span class="insight-ico">${App.icon(kind === "strength" ? "up" : kind === "weakness" ? "alert" : "info", 16)}</span>`;
  App.drawCheck = () => `<svg class="draw-check" viewBox="0 0 52 52" width="76" height="76" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-15"/></svg>`;

  // ---------------------------------------------------------------- konfetti och gnistor (canvas, inga bibliotek)
  function burst({ x, y, count = 120, spread = 70, angle = -90, power = 12, colors, gravity = 0.32, duration = 2600, size = 1 }) {
    if (reduced()) return;
    const c = document.createElement("canvas");
    c.className = "confetti";
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    c.style.width = `${W}px`;
    c.style.height = `${H}px`;
    document.body.appendChild(c);
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    const pal = colors || ["#7c5cff", "#a78bfa", "#22a06b", "#34d399", "#f5b301", "#38bdf8"];
    const ps = Array.from({ length: count }, () => {
      const a = ((angle + (Math.random() - 0.5) * spread) * Math.PI) / 180;
      const v = power * (0.45 + Math.random() * 0.75);
      return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: (5 + Math.random() * 6) * size, h: (3 + Math.random() * 4) * size, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.35, c: pal[(Math.random() * pal.length) | 0], round: Math.random() < 0.3 };
    });
    const t0 = performance.now();
    const frame = (now) => {
      const t = now - t0;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - duration * 0.6) / (duration * 0.4));
      for (const p of ps) {
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.fillStyle = p.c;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.h * 0.6, 0, 6.28);
          ctx.fill();
        } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * (0.35 + Math.abs(Math.cos(p.r * 1.7)) * 0.65));
        ctx.restore();
      }
      if (t < duration) requestAnimationFrame(frame);
      else c.remove();
    };
    requestAnimationFrame(frame);
  }
  /** Stor fest: två kanoner från nederkanten och en smäll i mitten. */
  App.celebrate = () => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    burst({ x: W * 0.12, y: H * 0.98, angle: -62, spread: 40, power: 18, count: 90 });
    burst({ x: W * 0.88, y: H * 0.98, angle: -118, spread: 40, power: 18, count: 90 });
    setTimeout(() => burst({ x: W / 2, y: H * 0.32, spread: 360, power: 9, count: 70, gravity: 0.22 }), 260);
  };
  /** Liten gnistregn runt en punkt (t.ex. bocken när boten loggats). */
  App.sparks = (x, y, colors) => burst({ x, y, spread: 360, power: 6, count: 36, gravity: 0.12, duration: 1300, size: 0.8, colors: colors || ["#22a06b", "#34d399", "#7c5cff", "#a78bfa"] });
  App.sparksAt = (el, colors) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    App.sparks(r.left + r.width / 2, r.top + r.height / 2, colors);
  };

  /** Räknar upp ett tal till sitt slutvärde (resultatet efter stängd bot). */
  App.countUp = (el, to, format, ms = 1000) => {
    if (!el) return;
    if (reduced() || !Number.isFinite(to)) {
      el.textContent = format(to);
      return;
    }
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      el.textContent = format(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  /** Toast med snurra som ligger kvar tills done(). */
  App.busyToast = (msg) => {
    const el = document.createElement("div");
    el.className = "toast busy";
    el.innerHTML = `<span class="spinner"></span><span>${esc(msg)}</span>`;
    document.getElementById("toast-root").appendChild(el);
    return { done: () => el.remove() };
  };

  // ---------------------------------------------------------------- skärmbild från Bybit
  App.canImportScreens = () => Boolean(App.state.features && App.state.features.bybitImport);
  App.readBybitScreenshot = async (file) => {
    if (!App.canImportScreens()) throw new Error("Skärmbildsläsning finns bara när journalen körs på datorn");
    if (!file || !String(file.type).startsWith("image/")) throw new Error("Det där är ingen bild");
    const image = await App.readFileAsDataUrl(file);
    const r = await App.post("/api/import/bybit", { image });
    return { bot: r.bot, file, image };
  };
  /** "SOLUSDT Long 10x · 200 USDT · P&L +76,87 · avslutad" */
  App.importSummary = (b) => {
    const parts = [];
    const head = [b.symbol, b.side ? (b.side === "LONG" ? "Long" : "Short") + (b.leverage ? ` ${fmt.num(b.leverage, 0)}x` : "") : ""].filter(Boolean).join(" ");
    if (head) parts.push(head);
    if (b.investment !== null && b.investment !== undefined) parts.push(fmt.money(b.investment, 0));
    if (b.pnl !== null && b.pnl !== undefined) parts.push(`P&L ${fmt.signed(b.pnl)}`);
    if (b.status === "finished") parts.push("avslutad");
    else if (b.status === "running") parts.push("kör");
    return parts.join(" · ") || "inga fält";
  };
  /** Är skärmbilden samma bot som en pågående trade i journalen? */
  App.importMatchesTrade = (b, t) => {
    if (b.side && b.side !== t.side) return false;
    let hits = 0;
    const g = t.grid || {};
    if (b.investment !== null && g.investment) {
      if (Math.abs(b.investment - g.investment) > 0.01) return false;
      hits++;
    }
    if (b.startedAt) {
      if (Math.abs(App.fromLocalInput(b.startedAt) - t.opened_at) > 36 * 3600e3) return false;
      hits++;
    }
    if (b.entryPrice && t.entry) {
      if (Math.abs(b.entryPrice - t.entry) / t.entry > 0.01) return false;
      hits++;
    }
    return hits > 0;
  };
  /** Sparar skärmbilden som bild på traden (bonus – misslyckas tyst). Returnerar bildens id. */
  App.attachScreenshot = async (tradeId, imp) => {
    if (!imp || !imp.image) return null;
    try {
      const r = await App.post(`/api/trades/${tradeId}/attachments`, { filename: imp.file?.name || "bybit.png", mime: imp.file?.type || "image/png", data: imp.image });
      return r && r.id ? r.id : null;
    } catch {
      return null; // bilden är inte nödvändig (t.ex. HEIC)
    }
  };

  /** Välj en skärmbild med filväljaren och analysera den (App.importScreenshot finns i quick.js). */
  App.pickScreenshot = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => input.files[0] && App.importScreenshot(input.files[0]));
    input.click();
  };

  // knappen i sidomenyn
  const importBtn = document.getElementById("btn-import");
  if (importBtn) {
    importBtn.insertAdjacentHTML("afterbegin", App.icon("image", 16));
    importBtn.addEventListener("click", App.pickScreenshot);
  }

  // ---------------------------------------------------------------- klistra in (⌘V) och dra hit – var som helst
  App.pasteTarget = null; // sätts av öppna loggflöden som vill ta emot skärmbilder
  const imageIn = (dt) => [...(dt?.files || [])].find((f) => String(f.type).startsWith("image/")) || null;
  const pageTakesImages = () => Boolean(document.querySelector("[data-dropzone]"));
  const typingIn = (el) => Boolean(el && el.closest && el.closest("input, textarea, select, [contenteditable]"));

  document.addEventListener("paste", (e) => {
    const file = imageIn(e.clipboardData);
    if (!file) return;
    if (typingIn(e.target) && [...(e.clipboardData.types || [])].includes("text/plain")) return; // vanlig text i ett fält
    if (App.pasteTarget) {
      e.preventDefault();
      App.pasteTarget(file);
      return;
    }
    if (document.querySelector(".modal") || pageTakesImages() || !App.canImportScreens()) return;
    e.preventDefault();
    App.importScreenshot(file);
  });

  let dragDepth = 0;
  const overlay = () => {
    let d = document.getElementById("drop-overlay");
    if (!d) {
      d = document.createElement("div");
      d.id = "drop-overlay";
      d.className = "drop-overlay hidden";
      d.innerHTML = `<div class="drop-card">${App.icon("image", 34)}<b>Släpp skärmbilden från Bybit</b><span>så loggar jag allt åt dig</span></div>`;
      document.body.appendChild(d);
    }
    return d;
  };
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  const dropMode = () => (App.pasteTarget ? "flow" : document.querySelector(".modal") || pageTakesImages() || !App.canImportScreens() ? null : "global");
  document.addEventListener("dragenter", (e) => {
    if (!hasFiles(e) || !dropMode()) return;
    dragDepth++;
    overlay().classList.remove("hidden");
  });
  document.addEventListener("dragover", (e) => {
    if (hasFiles(e) && dropMode()) e.preventDefault();
  });
  document.addEventListener("dragleave", (e) => {
    if (!hasFiles(e) || !dropMode()) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) overlay().classList.add("hidden");
  });
  document.addEventListener("drop", (e) => {
    const mode = dropMode();
    if (!hasFiles(e) || !mode) return;
    e.preventDefault();
    dragDepth = 0;
    overlay().classList.add("hidden");
    const file = imageIn(e.dataTransfer);
    if (!file) return App.toast("Släpp en bild – skärmbilden från Bybit", true);
    if (mode === "flow") App.pasteTarget(file);
    else App.importScreenshot(file);
  });

  // ---------------------------------------------------------------- kortkommandon: N = ny bot, Esc = stäng
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const modalOpen = Boolean(document.querySelector(".modal"));
    if (e.key === "Escape" && modalOpen && !document.getElementById("pin-input")) {
      App.closeModal();
      return;
    }
    if (modalOpen || typingIn(e.target)) return;
    if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      App.quickTrade();
    }
  });
})();
