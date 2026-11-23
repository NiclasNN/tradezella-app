/* Diagram i TradeZellas stil: mätare, ring och stapel i widgetarna, radar (Zella Score) och
   SVG-kurvor med hovring (kumulativ P&L, dags-P&L, dagens kurva). Inga bibliotek. */
(() => {
  "use strict";
  const App = window.App;
  const C = (App.charts = {});
  const GREEN = "#4dbf94";
  const RED = "#ef6363";
  const BLUE = "#2959da";
  const LINE = "#6457a5";
  const GRID = "#e9e9ee";
  const AXIS = "#64646b";
  const EMPTY = "#e9e9ee";
  let uid = 0;

  // ---------------------------------------------------------------- widgetar
  /** Halvcirkel med vinster / break-even / förluster och tre små brickor under (Trade win %, Day win %). */
  C.gauge = (wins, be, losses) => {
    const total = wins + be + losses;
    const w = 88, r = 35, cx = w / 2, cy = 42, sw = 7;
    const pt = (f) => [cx + Math.cos(Math.PI + f * Math.PI) * r, cy + Math.sin(Math.PI + f * Math.PI) * r];
    const arc = (from, to, color) => {
      if (to - from <= 0.004) return "";
      const [x0, y0] = pt(from), [x1, y1] = pt(to);
      return `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}" stroke="${color}" stroke-width="${sw}" fill="none" stroke-linecap="butt"/>`;
    };
    let arcs = "";
    if (!total) arcs = arc(0, 1, EMPTY);
    else {
      const gap = 0.012;
      const parts = [[wins, GREEN], [be, BLUE], [losses, RED]].filter(([n]) => n > 0);
      let at = 0;
      parts.forEach(([n, color], i) => {
        const f = n / total;
        arcs += arc(at + (i ? gap / 2 : 0), at + f - (i < parts.length - 1 ? gap / 2 : 0), color);
        at += f;
      });
    }
    return `<div class="gauge"><svg viewBox="0 0 ${w} 47" width="${w}" height="47" aria-hidden="true">${arcs}</svg><div class="gauge-pills"><span class="gp g">${wins}</span><span class="gp b">${be}</span><span class="gp r">${losses}</span></div></div>`;
  };

  /** Ring med grön och röd del (profit factor: bruttovinst mot bruttoförlust). share = gröna andelen 0–1, null = ingen data. */
  C.ring = (share, size = 62) => {
    const r = size / 2 - 5, c = 2 * Math.PI * r, m = size / 2;
    const circle = (color, from, len) =>
      `<circle cx="${m}" cy="${m}" r="${r}" stroke="${color}" stroke-width="7" fill="none" stroke-dasharray="${Math.max(0, len).toFixed(2)} ${c.toFixed(2)}" stroke-dashoffset="${(-from).toFixed(2)}" transform="rotate(-90 ${m} ${m})"/>`;
    if (share === null || share === undefined || Number.isNaN(share)) return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${circle(EMPTY, 0, c)}</svg>`;
    const s = Math.max(0, Math.min(1, share));
    const gap = s > 0 && s < 1 ? 3 : 0;
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${s > 0 ? circle(GREEN, gap / 2, c * s - gap) : ""}${s < 1 ? circle(RED, c * s + gap / 2, c * (1 - s) - gap) : ""}</svg>`;
  };
  /** Bakåtkompatibel: en färg, värde mot max. */
  C.donut = (value, max) => C.ring(value === null || value === undefined ? null : Math.min(1, value / max));

  /** Stapel med snittvinst (grön) mot snittförlust (röd) och beloppen under. */
  C.wlBar = (avgWin, avgLoss) => {
    const tot = (avgWin || 0) + (avgLoss || 0);
    const bar = tot > 0 ? `${avgWin > 0 ? `<i class="w" style="flex:${avgWin}"></i>` : ""}${avgLoss > 0 ? `<i class="l" style="flex:${avgLoss}"></i>` : ""}` : `<i class="none"></i>`;
    return `<div class="wl"><div class="wl-bar">${bar}</div><div class="wl-legend"><span class="pos">${App.fmt.num(avgWin || 0, 0)}</span><span class="neg">−${App.fmt.num(avgLoss || 0, 0)}</span></div></div>`;
  };

  /** Liten kurva utan axlar (Net cumulative P&L-widgeten). pts = [tal]. */
  C.spark = (vals, w = 150, h = 44) => {
    if (!vals.length) return "";
    const data = [0, ...vals];
    const lo = Math.min(...data), hi = Math.max(...data), span = hi - lo || 1;
    const X = (i) => (i / (data.length - 1)) * w;
    const Y = (v) => 3 + (h - 6) * (1 - (v - lo) / span);
    const line = data.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
    const id = `sp${++uid}`;
    const zero = Y(0);
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
      <defs><clipPath id="${id}a"><rect x="0" y="0" width="${w}" height="${zero.toFixed(1)}"/></clipPath><clipPath id="${id}b"><rect x="0" y="${zero.toFixed(1)}" width="${w}" height="${(h - zero).toFixed(1)}"/></clipPath></defs>
      <path d="${line} L${w} ${zero.toFixed(1)} L0 ${zero.toFixed(1)} Z" fill="${GREEN}" opacity=".28" clip-path="url(#${id}a)"/>
      <path d="${line} L${w} ${zero.toFixed(1)} L0 ${zero.toFixed(1)} Z" fill="${RED}" opacity=".25" clip-path="url(#${id}b)"/>
      <path d="${line}" fill="none" stroke="${LINE}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  };

  // ---------------------------------------------------------------- Zella Score
  C.radar = (parts, size = 250) => {
    // sidornas etiketter bryts på två rader så att sexhörningen får plats att vara stor även i ett smalt kort
    const n = parts.length, r = size / 2 - 33, side = 86;
    const W = 2 * (r + side), H = size + 6, cx = W / 2, cy = H / 2;
    const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const pt = (i, v) => [cx + Math.cos(ang(i)) * r * v, cy + Math.sin(ang(i)) * r * v];
    const poly = (v) => parts.map((_, i) => pt(i, v).map((x) => x.toFixed(1)).join(",")).join(" ");
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="max-width:100%;height:auto" role="img" aria-label="Zella Score per mått">`;
    s += `<polygon points="${poly(1)}" fill="none" stroke="#e4e3f3" stroke-width="9" stroke-linejoin="round"/>`;
    for (const lvl of [0.33, 0.66]) s += `<polygon points="${poly(lvl)}" fill="none" stroke="#ececf4" stroke-width="1"/>`;
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(i, 1);
      s += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#ececf4" stroke-width="1"/>`;
    }
    const val = parts.map((p, i) => pt(i, Math.max(0.04, p.points / 100)));
    s += `<polygon points="${val.map((p) => p.map((x) => x.toFixed(1)).join(",")).join(" ")}" fill="rgba(100,87,165,.28)" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round"/>`;
    parts.forEach((p, i) => {
      const [x, y] = val[i];
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="#fff" stroke="${LINE}" stroke-width="1.6"/>`;
      const [lx, ly] = pt(i, 1.17);
      const mid = Math.abs(lx - cx) < 8;
      const cut = mid ? -1 : p.label.indexOf(" ");
      const rows = cut > 0 && p.label.length > 10 ? [p.label.slice(0, cut), p.label.slice(cut + 1)] : [p.label];
      const y0 = mid ? ly + (ly < cy ? -2 : 6) : ly - (rows.length - 1) * 7;
      s += `<text text-anchor="${mid ? "middle" : lx < cx ? "end" : "start"}" dominant-baseline="middle" font-size="12" fill="#646a9d">${rows.map((row, k) => `<tspan x="${lx.toFixed(1)}" y="${(y0 + k * 14).toFixed(1)}">${App.esc(row)}</tspan>`).join("")}</text>`;
    });
    return s + "</svg>";
  };

  /** Poängstapel 0–100 med markör, som under TradeZellas Zella Score. */
  C.scoreBar = (total) => {
    const v = Math.max(0, Math.min(100, total || 0));
    return `<div class="score-bar"><div class="score-track"><i style="left:${v}%"></i></div><div class="score-ticks"><span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span></div></div>`;
  };
  C.scoreWord = (total, enough) => (!enough ? ["", ""] : total >= 80 ? ["Utmärkt", "good"] : total >= 60 ? ["Bra", "good"] : total >= 40 ? ["Okej", "mid"] : ["Svagt", "bad"]);

  // ---------------------------------------------------------------- SVG-kurvor med hovring
  const nice = (lo, hi, count = 4) => {
    if (hi === lo) hi = lo + 1;
    const raw = (hi - lo) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    const a = Math.floor(lo / step) * step;
    const b = Math.ceil(hi / step) * step;
    const ticks = [];
    for (let v = a; v <= b + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
    return { ticks, step };
  };
  const tickFmt = (v, step) => {
    const d = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
    return `${v < 0 ? "−" : ""}${new Intl.NumberFormat("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }).format(Math.abs(v))}`;
  };
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver((entries) => {
    for (const e of entries) {
      const el = e.target;
      if (!document.body.contains(el)) { ro.unobserve(el); continue; }
      if (el.__draw && Math.abs((el.__w || 0) - el.clientWidth) > 4) el.__draw();
    }
  }) : null;
  const mount = (el, draw) => {
    el.__draw = () => { el.__w = el.clientWidth; draw(); };
    el.__draw();
    if (ro) ro.observe(el);
  };
  const frame = (el, W, H, P, lo, hi, ticks, step) => {
    const Y = (v) => P.t + (H - P.t - P.b) * (1 - (v - lo) / (hi - lo));
    let g = "";
    for (const v of ticks) {
      const y = Y(v).toFixed(1);
      g += `<line x1="${P.l}" y1="${y}" x2="${W - P.r}" y2="${y}" stroke="${GRID}" stroke-width="1" ${v === 0 ? "" : 'stroke-dasharray="3 4"'}/>`;
      g += `<text x="${P.l - 8}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="11.5" fill="${AXIS}">${tickFmt(v, step)}</text>`;
    }
    return { Y, g };
  };
  const tipAt = (el, tip, x, y, html) => {
    tip.innerHTML = html;
    tip.style.opacity = "1";
    const w = tip.offsetWidth, max = el.clientWidth;
    tip.style.left = `${Math.max(0, Math.min(max - w, x + 12 + w > max ? x - w - 12 : x + 12))}px`;
    tip.style.top = `${Math.max(0, y - 34)}px`;
  };

  /**
   * Kurva med fyllnad: grön över noll, röd under (Daily net cumulative P&L, dagens kurva).
   * pts = [{ v, label, sub? }] i tidsordning. opts: { height, empty }
   */
  C.area = (el, pts, opts = {}) => {
    if (!el) return;
    if (!pts.length) {
      el.innerHTML = `<div class="chart-empty">${App.esc(opts.empty || "Inga stängda trades i perioden.")}</div>`;
      return;
    }
    el.classList.add("chart");
    mount(el, () => {
      const W = Math.max(220, el.clientWidth), H = opts.height || 230;
      const vals = pts.map((p) => p.v);
      const { ticks, step } = nice(Math.min(0, ...vals), Math.max(0, ...vals), opts.ticks || 4);
      const lo = ticks[0], hi = ticks[ticks.length - 1];
      const P = { t: 10, r: 12, b: opts.xLabels === false ? 10 : 26, l: Math.max(34, 12 + Math.max(...ticks.map((t) => tickFmt(t, step).length)) * 6.6) };
      const { Y, g } = frame(el, W, H, P, lo, hi, ticks, step);
      const X = (i) => P.l + (W - P.l - P.r) * (pts.length < 2 ? 0.5 : i / (pts.length - 1));
      const line = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(" ");
      const zero = Y(0);
      const closed = `${line} L${X(pts.length - 1).toFixed(1)} ${zero.toFixed(1)} L${X(0).toFixed(1)} ${zero.toFixed(1)} Z`;
      const id = `ar${++uid}`;
      let xl = "";
      if (opts.xLabels !== false) {
        const want = Math.max(2, Math.min(pts.length, Math.floor((W - P.l - P.r) / 90)));
        const idx = pts.length <= want ? pts.map((_, i) => i) : Array.from({ length: want }, (_, k) => Math.round((k * (pts.length - 1)) / (want - 1)));
        for (const i of [...new Set(idx)]) xl += `<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 && pts.length > 1 ? "start" : i === pts.length - 1 && pts.length > 1 ? "end" : "middle"}" font-size="11.5" fill="${AXIS}">${App.esc(pts[i].x || "")}</text>`;
      }
      el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${App.esc(opts.label || "Kurva")}">
        <defs>
          <linearGradient id="${id}g" x1="0" y1="${P.t}" x2="0" y2="${zero.toFixed(1)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${GREEN}" stop-opacity=".75"/><stop offset="1" stop-color="${GREEN}" stop-opacity=".06"/></linearGradient>
          <linearGradient id="${id}r" x1="0" y1="${zero.toFixed(1)}" x2="0" y2="${H - P.b}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${RED}" stop-opacity=".06"/><stop offset="1" stop-color="${RED}" stop-opacity=".7"/></linearGradient>
          <clipPath id="${id}a"><rect x="0" y="0" width="${W}" height="${zero.toFixed(1)}"/></clipPath>
          <clipPath id="${id}b"><rect x="0" y="${zero.toFixed(1)}" width="${W}" height="${(H - zero).toFixed(1)}"/></clipPath>
        </defs>
        ${g}
        <path d="${closed}" fill="url(#${id}g)" clip-path="url(#${id}a)"/>
        <path d="${closed}" fill="url(#${id}r)" clip-path="url(#${id}b)"/>
        <path d="${line}" fill="none" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
        ${pts.length === 1 ? `<circle cx="${X(0).toFixed(1)}" cy="${Y(pts[0].v).toFixed(1)}" r="4" fill="${LINE}"/>` : ""}
        ${xl}
        <line class="cross" x1="0" y1="${P.t}" x2="0" y2="${H - P.b}" stroke="#b9b6cc" stroke-width="1" opacity="0"/>
        <circle class="dot" r="4.5" fill="#fff" stroke="${LINE}" stroke-width="2" opacity="0"/>
        <rect x="${P.l}" y="${P.t}" width="${W - P.l - P.r}" height="${H - P.t - P.b}" fill="transparent"/>
      </svg><div class="tip"></div>`;
      const svg = el.querySelector("svg"), tip = el.querySelector(".tip"), cross = svg.querySelector(".cross"), dot = svg.querySelector(".dot");
      const move = (e) => {
        const b = svg.getBoundingClientRect();
        const mx = ((e.touches ? e.touches[0].clientX : e.clientX) - b.left) * (W / b.width);
        let i = pts.length < 2 ? 0 : Math.round(((mx - P.l) / (W - P.l - P.r)) * (pts.length - 1));
        i = Math.max(0, Math.min(pts.length - 1, i));
        const x = X(i), y = Y(pts[i].v);
        cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.setAttribute("opacity", "1");
        dot.setAttribute("cx", x); dot.setAttribute("cy", y); dot.setAttribute("opacity", "1");
        tipAt(el, tip, x * (b.width / W), y * (b.height / H), `<b>${App.esc(pts[i].label || "")}</b><br>${pts[i].tip || App.fmt.signedMoney(pts[i].v)}`);
      };
      const leave = () => { tip.style.opacity = "0"; cross.setAttribute("opacity", "0"); dot.setAttribute("opacity", "0"); };
      svg.addEventListener("mousemove", move);
      svg.addEventListener("touchstart", move, { passive: true });
      svg.addEventListener("mouseleave", leave);
    });
  };

  /** Staplar runt noll: gröna vinster, röda förluster (Net daily P&L). items = [{ v, label, x }] */
  C.bars = (el, items, opts = {}) => {
    if (!el) return;
    if (!items.length) {
      el.innerHTML = `<div class="chart-empty">${App.esc(opts.empty || "Inga dagar i perioden.")}</div>`;
      return;
    }
    el.classList.add("chart");
    mount(el, () => {
      const W = Math.max(220, el.clientWidth), H = opts.height || 230;
      const vals = items.map((p) => p.v);
      const { ticks, step } = nice(Math.min(0, ...vals), Math.max(0, ...vals), 4);
      const lo = ticks[0], hi = ticks[ticks.length - 1];
      const P = { t: 10, r: 12, b: 26, l: Math.max(34, 12 + Math.max(...ticks.map((t) => tickFmt(t, step).length)) * 6.6) };
      const { Y, g } = frame(el, W, H, P, lo, hi, ticks, step);
      const slot = (W - P.l - P.r) / items.length;
      const bw = Math.max(3, Math.min(24, slot - 4));
      const zero = Y(0);
      let bars = "";
      items.forEach((p, i) => {
        const cx = P.l + slot * i + slot / 2;
        const y = Y(p.v), top = Math.min(y, zero), h = Math.max(1.5, Math.abs(y - zero));
        const rx = Math.min(3, bw / 2, h);
        bars += `<rect data-i="${i}" x="${(cx - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx}" fill="${p.v >= 0 ? GREEN : RED}"/>`;
        bars += `<rect data-i="${i}" x="${(cx - slot / 2).toFixed(1)}" y="${P.t}" width="${slot.toFixed(1)}" height="${H - P.t - P.b}" fill="transparent"/>`;
      });
      const want = Math.max(2, Math.min(items.length, Math.floor((W - P.l - P.r) / 90)));
      const idx = items.length <= want ? items.map((_, i) => i) : Array.from({ length: want }, (_, k) => Math.round((k * (items.length - 1)) / (want - 1)));
      let xl = "";
      for (const i of [...new Set(idx)]) xl += `<text x="${(P.l + slot * i + slot / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="11.5" fill="${AXIS}">${App.esc(items[i].x || "")}</text>`;
      el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${App.esc(opts.label || "Staplar")}">${g}${bars}${xl}</svg><div class="tip"></div>`;
      const svg = el.querySelector("svg"), tip = el.querySelector(".tip");
      svg.addEventListener("mousemove", (e) => {
        const i = e.target.dataset && e.target.dataset.i;
        if (i === undefined) return (tip.style.opacity = "0");
        const p = items[Number(i)], b = svg.getBoundingClientRect();
        tipAt(el, tip, (P.l + slot * Number(i) + slot / 2) * (b.width / W), Math.min(Y(p.v), zero) * (b.height / H), `<b>${App.esc(p.label || "")}</b><br>${p.tip || App.fmt.signedMoney(p.v)}`);
      });
      svg.addEventListener("mouseleave", () => (tip.style.opacity = "0"));
    });
  };

  // ---------------------------------------------------------------- prisdiagram för en trade
  // Ljusen hämtas från Bybits öppna marknadsdata (ingen inloggning, inget om journalen skickas dit).
  const INTERVALS = [[1, "1"], [3, "3"], [5, "5"], [15, "15"], [30, "30"], [60, "60"], [120, "120"], [240, "240"], [360, "360"], [720, "720"], [1440, "D"]];
  const klineCache = new Map();
  async function klines(symbol, from, to) {
    const [min, code] = INTERVALS.find(([m]) => (to - from) / (m * 60000) <= 500) || INTERVALS[INTERVALS.length - 1];
    const key = `${symbol}|${code}|${Math.floor(from / 60000)}|${Math.floor(to / (min * 60000))}`;
    if (klineCache.has(key)) return klineCache.get(key);
    const res = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=${code}&start=${Math.floor(from)}&end=${Math.floor(to)}&limit=1000`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.retCode !== 0) throw new Error(json.retMsg || "okänt fel");
    const list = (json.result && json.result.list) || [];
    const prec = list.reduce((p, r) => Math.max(p, (String(r[4]).split(".")[1] || "").length), 0);
    const rows = list.map((r) => ({ time: Math.floor(Number(r[0]) / 1000), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]) })).sort((a, b) => a.time - b.time);
    const out = { rows, min, prec };
    klineCache.set(key, out);
    return out;
  }
  let liveChart = null;
  /** Ljusdiagram runt en trade: pil vid start, markering vid stopp, linjer för startpris, slutpris och stopplinjen. */
  C.priceChart = async (el, t) => {
    if (!el) return null;
    const LC = window.LightweightCharts;
    const say = (msg) => document.body.contains(el) && (el.innerHTML = `<div class="chart-empty">${App.esc(msg)}</div>`);
    if (!LC) return say("Diagrammet kunde inte laddas."), null;
    const symbol = String(t.symbol || "").toUpperCase().replace(/\.P$/, "");
    const end = t.closed_at || Date.now();
    const pad = Math.max((end - t.opened_at) * 0.3, 45 * 60000);
    say("Hämtar prisdata…");
    let data;
    try {
      data = await klines(symbol, t.opened_at - pad, Math.min(Date.now(), end + pad));
    } catch (err) {
      return say(`Kunde inte hämta prisdata för ${symbol} från Bybit (${err.message}). Diagrammet behöver internet.`), null;
    }
    if (!document.body.contains(el)) return null;
    if (!data.rows.length) return say(`Bybit har ingen prisdata för ${symbol} i den här perioden.`), null;
    if (liveChart) {
      try {
        liveChart.remove();
      } catch {
        /* redan borta */
      }
      liveChart = null;
    }
    el.innerHTML = "";
    const at = (sec, o) => new Date(sec * 1000).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", ...o });
    const chart = LC.createChart(el, {
      autoSize: true,
      layout: { background: { type: "solid", color: "#ffffff" }, textColor: AXIS, fontFamily: 'Inter, "Segoe UI", Roboto, sans-serif', fontSize: 11.5 },
      grid: { vertLines: { color: "#f4f4f7" }, horzLines: { color: "#f0f0f3" } },
      rightPriceScale: { borderColor: "#e6e6e6" },
      crosshair: { mode: LC.CrosshairMode.Normal },
      localization: {
        locale: "sv-SE",
        timeFormatter: (sec) => at(sec, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
        priceFormatter: (p) => new Intl.NumberFormat("sv-SE", { minimumFractionDigits: data.prec, maximumFractionDigits: data.prec }).format(p),
      },
      timeScale: {
        borderColor: "#e6e6e6",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (sec, type) => (type === 0 ? at(sec, { year: "numeric" }) : type === 1 ? at(sec, { month: "short" }) : type === 2 ? at(sec, { day: "numeric", month: "short" }) : at(sec, { hour: "2-digit", minute: "2-digit" })),
      },
    });
    liveChart = chart;
    const series = chart.addSeries(LC.CandlestickSeries, {
      upColor: GREEN,
      downColor: RED,
      borderUpColor: GREEN,
      borderDownColor: RED,
      wickUpColor: GREEN,
      wickDownColor: RED,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: "price", precision: data.prec, minMove: Math.pow(10, -data.prec) },
    });
    series.setData(data.rows);
    const snap = (ms) => {
      const s = Math.floor(ms / 1000);
      let best = data.rows[0].time;
      for (const r of data.rows) {
        if (r.time > s) break;
        best = r.time;
      }
      return best;
    };
    const long = t.side === "LONG";
    const marks = [{ time: snap(t.opened_at), position: long ? "belowBar" : "aboveBar", color: long ? GREEN : RED, shape: long ? "arrowUp" : "arrowDown", text: long ? "Start long" : "Start short" }];
    if (t.closed_at) marks.push({ time: snap(t.closed_at), position: long ? "aboveBar" : "belowBar", color: "#2f324a", shape: "square", text: "Stopp" });
    LC.createSeriesMarkers(series, marks);
    series.createPriceLine({ price: t.entry, color: LINE, lineWidth: 1, lineStyle: LC.LineStyle.Dashed, axisLabelVisible: true, title: "Start" });
    const endPrice = App.endPrice(t);
    if (t.closed_at && endPrice) series.createPriceLine({ price: endPrice, color: "#64646b", lineWidth: 1, lineStyle: LC.LineStyle.Dotted, axisLabelVisible: true, title: "Slut" });
    const stop = App.currentStop(t);
    if (stop) series.createPriceLine({ price: stop, color: RED, lineWidth: 1, lineStyle: LC.LineStyle.Solid, axisLabelVisible: true, title: "Stopplinje" });
    chart.timeScale().fitContent();
    return { min: data.min };
  };

  // bakåtkompatibla namn (äldre vyer)
  C.equity = (el, points) => C.area(el, points.map((p) => ({ v: p.cum, label: App.fmt.date(p.time), x: App.fmt.date(p.time) })));
  C.dailyBars = (el, cells) => C.bars(el, [...cells].sort((a, b) => (a.day < b.day ? -1 : 1)).map((c) => ({ v: c.pnl, label: c.day, x: c.day.slice(5) })));

  /** Enkel horisontell stapel i tabellceller */
  C.hbar = (v, max) => {
    const w = max > 0 ? Math.min(100, (Math.abs(v) / max) * 100) : 0;
    return `<div class="bar-track"><div class="bar${v < 0 ? " neg" : ""}" style="width:${w}%"></div></div>`;
  };
})();
