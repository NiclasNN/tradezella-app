/* Diagram: radar (Zella Score), gauge, donut, equity/daily via lightweight-charts */
(() => {
  "use strict";
  const App = window.App;
  const C = (App.charts = {});

  C.radar = (parts, size = 250) => {
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 52;
    const n = parts.length;
    const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const pt = (i, v) => [cx + Math.cos(ang(i)) * r * v, cy + Math.sin(ang(i)) * r * v];
    const pad = 70;
    let s = `<svg viewBox="${-pad} 0 ${size + 2 * pad} ${size}" width="${size + 2 * pad}" height="${size}" style="max-width:100%;height:auto">`;
    for (const lvl of [0.25, 0.5, 0.75, 1]) {
      const pts = parts.map((_, i) => pt(i, lvl).join(",")).join(" ");
      s += `<polygon points="${pts}" fill="${lvl === 1 ? "#f3f1ff" : "none"}" stroke="#d9d4f5" stroke-width="1"/>`;
    }
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(i, 1);
      s += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#d9d4f5" stroke-width="1"/>`;
    }
    const poly = parts.map((p, i) => pt(i, Math.max(0.02, p.points / 100)).join(",")).join(" ");
    s += `<polygon points="${poly}" fill="rgba(124,92,255,.35)" stroke="#7c5cff" stroke-width="2"/>`;
    parts.forEach((p, i) => {
      const [x, y] = pt(i, Math.max(0.02, p.points / 100));
      s += `<circle cx="${x}" cy="${y}" r="3.5" fill="#7c5cff"/>`;
      const [lx, ly] = pt(i, 1.3);
      const anchor = Math.abs(lx - cx) < 8 ? "middle" : lx < cx ? "end" : "start";
      s += `<text x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="middle" font-size="10" font-weight="700" fill="#7a7f9a">${App.esc(p.label)}</text>`;
    });
    return s + "</svg>";
  };

  /** Halvcirkel-gauge: vinster / BE / förluster som i Trade Win %-widgeten */
  C.gauge = (wins, be, losses, size = 92) => {
    const total = Math.max(1, wins + be + losses);
    const r = size / 2 - 8;
    const cx = size / 2;
    const cy = size / 2 + 6;
    const arc = (from, to, color) => {
      const a0 = Math.PI + from * Math.PI;
      const a1 = Math.PI + to * Math.PI;
      const x0 = cx + Math.cos(a0) * r, y0 = cy + Math.sin(a0) * r;
      const x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;
      return `<path d="M${x0} ${y0} A${r} ${r} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x1} ${y1}" stroke="${color}" stroke-width="9" fill="none" stroke-linecap="butt"/>`;
    };
    const w = wins / total, b = be / total;
    let s = `<svg viewBox="0 0 ${size} ${size / 2 + 16}" width="${size}" height="${size / 2 + 16}">`;
    s += arc(0, 1, "#eceef7");
    if (w > 0) s += arc(0, w, "#22a06b");
    if (b > 0) s += arc(w, w + b, "#3b82f6");
    if (losses > 0) s += arc(w + b, 1, "#e5484d");
    s += `<text x="${cx - r - 2}" y="${cy + 12}" font-size="9" fill="#22a06b" font-weight="700" text-anchor="start">${wins}</text>`;
    s += `<text x="${cx}" y="${cy + 12}" font-size="9" fill="#3b82f6" font-weight="700" text-anchor="middle">${be}</text>`;
    s += `<text x="${cx + r + 2}" y="${cy + 12}" font-size="9" fill="#e5484d" font-weight="700" text-anchor="end">${losses}</text>`;
    return s + "</svg>";
  };

  C.donut = (value, max, color = "#22a06b", size = 56) => {
    const r = size / 2 - 6;
    const c = 2 * Math.PI * r;
    const frac = Math.max(0, Math.min(1, (value ?? 0) / max));
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="#eceef7" stroke-width="8" fill="none"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="8" fill="none" stroke-dasharray="${c * frac} ${c}" stroke-linecap="round" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
  };

  const chartOpts = {
    layout: { background: { color: "transparent" }, textColor: "#7a7f9a", fontSize: 11 },
    grid: { vertLines: { color: "#f0f1f8" }, horzLines: { color: "#f0f1f8" } },
    rightPriceScale: { borderColor: "#e6e8f2" },
    timeScale: { borderColor: "#e6e8f2", timeVisible: false },
    localization: { locale: "sv-SE" },
    autoSize: true,
    handleScroll: false,
    handleScale: false,
  };

  C.equity = (el, points) => {
    if (!window.LightweightCharts || !points.length) {
      el.innerHTML = `<div class="muted small" style="padding:20px;text-align:center">Inga stängda trades i perioden.</div>`;
      return;
    }
    el.innerHTML = "";
    const chart = LightweightCharts.createChart(el, chartOpts);
    const series = chart.addSeries(LightweightCharts.AreaSeries, {
      lineColor: "#7c5cff",
      topColor: "rgba(124,92,255,.35)",
      bottomColor: "rgba(124,92,255,.02)",
      lineWidth: 2,
      priceLineVisible: false,
    });
    // en punkt per tidpunkt (lightweight-charts kräver strikt stigande tider)
    const data = [];
    let last = 0;
    for (const p of points) {
      let t = Math.floor(p.time / 1000);
      if (t <= last) t = last + 1;
      last = t;
      data.push({ time: t, value: Math.round(p.cum * 100) / 100 });
    }
    series.setData(data);
    chart.timeScale().fitContent();
    return chart;
  };

  C.dailyBars = (el, cells) => {
    if (!window.LightweightCharts || !cells.length) {
      el.innerHTML = `<div class="muted small" style="padding:20px;text-align:center">Inga dagar i perioden.</div>`;
      return;
    }
    el.innerHTML = "";
    const chart = LightweightCharts.createChart(el, { ...chartOpts, timeScale: { ...chartOpts.timeScale, timeVisible: false } });
    const series = chart.addSeries(LightweightCharts.HistogramSeries, { priceLineVisible: false });
    series.setData(cells.sort((a, b) => (a.day < b.day ? -1 : 1)).map((c) => ({ time: c.day, value: Math.round(c.pnl * 100) / 100, color: c.pnl >= 0 ? "#22a06b" : "#e5484d" })));
    chart.timeScale().fitContent();
    return chart;
  };

  /** Enkel horisontell stapel i tabellceller */
  C.hbar = (v, max) => {
    const w = max > 0 ? Math.min(100, (Math.abs(v) / max) * 100) : 0;
    return `<div class="bar-track"><div class="bar${v < 0 ? " neg" : ""}" style="width:${w}%"></div></div>`;
  };
})();
