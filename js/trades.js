/* Trades i TradeZellas upplägg: flikarna Dag / Vecka / Alla, dagkort med kurva och nyckeltal, minikalender,
   tabell med status, filter och valbara kolumner – och trade-sidan med Stats, Strategi och prisdiagram.
   Pågående bottar, stopplinjen och checklistorna är journalens egna. */
(() => {
  "use strict";
  const App = window.App;
  const { fmt, esc } = App;
  const parseHist = (t) => {
    try {
      return JSON.parse(t.stop_history || "[]");
    } catch {
      return [];
    }
  };
  App.currentStop = (t) => (t.trail_stop !== null && t.trail_stop !== undefined ? t.trail_stop : t.stop);
  const isGrid = (t) => t.kind === "grid";
  const isOpen = (t) => t.derived.outcome === "open";
  const botTotal = (g) => (g && g.totalPnl !== null && g.totalPnl !== undefined ? g.totalPnl : g && (g.gridProfit !== null || g.positionPnl !== null) ? (g.gridProfit || 0) + (g.positionPnl || 0) : null);
  const reasonLabel = (k) => (k ? App.EXIT_LABEL[k] || k : "–");
  const STATUS = { win: ["win", "VINST"], loss: ["loss", "FÖRLUST"], breakeven: ["be", "NOLL"], open: ["open", "PÅGÅR"] };
  App.statusPill = (outcome) => `<span class="pill ${STATUS[outcome][0]}">${STATUS[outcome][1]}</span>`;
  const sideTxt = (side) => `<span class="side-txt ${side === "LONG" ? "long" : "short"}">${side}</span>`;
  const DASH = '<span class="muted">--</span>';
  const NONE = '<span class="muted">–</span>';
  const checkTxt = (d) => (d.entryFollowPct === null ? "–" : `${Math.round(d.entryFollowPct)} %${d.exitFollowPct !== null ? ` / ${Math.round(d.exitFollowPct)} %` : ""}`);
  /** Följde traden planen? true / false / null (inte bedömd) – samma regel som servern (followedPlan). */
  const planOf = (t) => {
    const d = t.derived;
    const open = isOpen(t);
    if (d.entryFollowPct === null && d.exitFollowPct === null && (open || !t.exit_reason)) return null;
    const reasonOk = open || t.exit_reason === "stop" || t.exit_reason === "flip";
    return reasonOk && (d.entryFollowPct === null || d.entryFollowPct >= 100) && (d.exitFollowPct === null || d.exitFollowPct >= 100);
  };

  /** Samma formler som src/journal/grid.ts (botSetup). */
  App.botSetup = (p) => {
    const notional = p.investment * p.leverage;
    if (p.stop === null || p.stop === undefined || Number.isNaN(p.stop) || !(p.startPrice > 0)) return { notional, stopDistPct: null, lossAtStop: null };
    const onRightSide = p.side === "LONG" ? p.stop < p.startPrice : p.stop > p.startPrice;
    const stopDistPct = (Math.abs(p.startPrice - p.stop) / p.startPrice) * 100;
    return { notional, stopDistPct, lossAtStop: onRightSide ? notional * (stopDistPct / 100) : 0 };
  };

  App.moveStop = async (t, newStop) => {
    const cur = App.currentStop(t);
    const backward = cur !== null && (t.side === "LONG" ? newStop < cur : newStop > cur);
    if (backward && !App.confirm(`Det här flyttar stoppen bakåt (${fmt.price(cur)} → ${fmt.price(newStop)}). Logga ändå?`)) return false;
    await App.post(`/api/trades/${t.id}/stop`, { stop: newStop });
    App.toast(backward ? "Stopp flyttat bakåt – loggat som regelbrott" : "Stopp flyttat");
    return true;
  };

  // ---------------------------------------------------------------- pågående bottar
  App.openPositionsHtml = (open) => {
    if (!open.length) return "";
    return `<div class="card" style="margin-bottom:16px"><div class="card-title"><span><span class="live-dot"></span>Pågående (${open.length})</span>${App.canImportScreens && App.canImportScreens() ? '<span class="muted small" style="font-weight:400">Tips: dra in en skärmbild från Bybit (eller ⌘V) så uppdateras eller stoppas boten</span>' : ""}</div>
      <div class="open-list">${open
        .map((t) => {
          const cur = App.currentStop(t);
          const g = t.grid || {};
          const sofar = botTotal(g);
          return `<div class="op" data-id="${t.id}">
            <div><a href="#/trade/${t.id}"><b>${esc(t.symbol)}</b></a> ${App.sidePill(t.side)}<div class="muted small">${fmt.date(t.opened_at)} · ${fmt.dur(Date.now() - t.opened_at)} · ${esc(App.base(t.symbol))} ${fmt.price(t.entry)} · ${isGrid(t) ? `${fmt.money(g.investment, 0)} × ${fmt.num(g.leverage, 0)}` : `${fmt.num(t.qty, 2)} st`}</div></div>
            <div class="small">Stopp <b>${cur === null ? "–" : fmt.price(cur)}</b>${parseHist(t).some((h) => h.backward) ? ' <span class="warn-badge">flyttad bakåt</span>' : ""}<br>Resultat nu: ${sofar === null ? NONE : `<b class="${App.cls(sofar)}">${fmt.signedMoney(sofar)}</b>`}</div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end"><input type="number" step="any" placeholder="Nytt stopp" aria-label="Nytt stopp" data-stop-input="${t.id}" style="width:100px" /><button class="btn small" data-move="${t.id}">Flytta stopp</button><button class="btn small" data-progress="${t.id}">Resultat nu</button><button class="btn small" data-close="${t.id}">Stoppa bot</button><button class="btn small primary" data-flip="${t.id}">Vänd</button></div>
          </div>`;
        })
        .join("")}</div></div>`;
  };
  App.bindOpenPositions = (el, open) => {
    const find = (b, k) => open.find((x) => x.id === Number(b.dataset[k]));
    el.querySelectorAll("[data-move]").forEach((b) =>
      b.addEventListener("click", async () => {
        const t = find(b, "move");
        const v = Number(el.querySelector(`[data-stop-input="${t.id}"]`).value);
        if (!v) return App.toast("Ange ett nytt stopp", true);
        if (await App.moveStop(t, v)) App.render();
      }),
    );
    el.querySelectorAll("[data-progress]").forEach((b) => b.addEventListener("click", () => App.quickProgress(find(b, "progress"))));
    el.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => App.quickClose(find(b, "close"), "stop")));
    el.querySelectorAll("[data-flip]").forEach((b) => b.addEventListener("click", () => App.quickClose(find(b, "flip"), "flip")));
  };

  // ---------------------------------------------------------------- tabellens kolumner
  /** Slutpris att visa: bots har det i grid.endPrice (kan saknas – Bybit visar det inte alltid), positioner i exit. */
  App.endPrice = (t) => (t.kind === "grid" ? (t.grid && t.grid.endPrice !== null && t.grid.endPrice !== undefined ? t.grid.endPrice : null) : t.exit);
  const COL = {
    opened: { label: "Öppnad", cell: (t) => fmt.date(t.opened_at), sort: (t) => t.opened_at },
    openedAt: { label: "Öppnad", cell: (t) => `${App.dayShort(App.dayKeyOf(t.opened_at))} ${fmt.time(t.opened_at)}` },
    symbol: { label: "Symbol", cell: (t) => `<span class="sym">${esc(App.base(t.symbol))}</span>`, sort: (t) => t.symbol, asc: true },
    ticker: { label: "Symbol", cell: (t) => `<span class="ticker">${esc(App.base(t.symbol))}</span>` },
    status: { label: "Status", cell: (t) => App.statusPill(t.derived.outcome), sort: (t) => ["win", "breakeven", "loss", "open"].indexOf(t.derived.outcome), asc: true },
    closed: { label: "Stängd", cell: (t) => (isOpen(t) ? DASH : fmt.date(t.closed_at)), sort: (t) => t.closed_at ?? Infinity },
    side: { label: "Sida", cell: (t) => sideTxt(t.side), sort: (t) => t.side, asc: true },
    inv: {
      label: "Investering",
      num: true,
      cell: (t) => (isGrid(t) && t.grid ? `${fmt.num(t.grid.investment, 0)} <span class="muted">× ${fmt.num(t.grid.leverage, 0)}</span>` : fmt.num(t.qty, 2)),
      sort: (t) => (t.grid ? t.grid.investment : t.qty),
    },
    entry: { label: "Entry", num: true, cell: (t) => fmt.price(t.entry), sort: (t) => t.entry },
    exit: { label: "Exit", num: true, cell: (t) => (App.endPrice(t) === null ? DASH : fmt.price(App.endPrice(t))), sort: (t) => App.endPrice(t) ?? -Infinity },
    pnl: {
      label: "Netto P&amp;L",
      num: true,
      cell: (t) => {
        if (!isOpen(t)) return `<b class="${App.cls(t.derived.pnl)}">${fmt.signed(t.derived.pnl)}</b>`;
        const now = botTotal(t.grid);
        return `<span class="open-tag">(pågår)</span> ${now === null ? NONE : `<b class="${App.cls(now)}">${fmt.signed(now)}</b>`}`;
      },
      sort: (t) => t.derived.pnl ?? botTotal(t.grid) ?? -Infinity,
    },
    roi: { label: "Netto ROI", num: true, cell: (t) => (isOpen(t) || t.derived.returnPct === null ? DASH : `<span class="${App.cls(t.derived.returnPct)}">${fmt.pct(t.derived.returnPct, 2)}</span>`), sort: (t) => t.derived.returnPct ?? -Infinity },
    r: { label: "R-multipel", num: true, cell: (t) => (t.derived.realizedR === null ? DASH : `<span class="${App.cls(t.derived.realizedR)}">${fmt.r(t.derived.realizedR)}</span>`), sort: (t) => t.derived.realizedR ?? -Infinity },
    hold: { label: "Körtid", num: true, cell: (t) => fmt.dur(isOpen(t) ? Date.now() - t.opened_at : t.derived.durationMs), sort: (t) => (isOpen(t) ? Date.now() - t.opened_at : t.derived.durationMs) ?? -1 },
    strategy: { label: "Strategi", cell: (t) => (t.strategy_name ? `<span class="strat-pill">${esc(t.strategy_name)}</span>` : NONE), sort: (t) => t.strategy_name || "", asc: true },
    reason: { label: "Varför stängd", cell: (t) => (isOpen(t) || !t.exit_reason ? NONE : esc(reasonLabel(t.exit_reason))), sort: (t) => t.exit_reason || "", asc: true },
    check: { label: "Checklista", num: true, cell: (t) => checkTxt(t.derived), sort: (t) => t.derived.entryFollowPct ?? -1 },
    rating: { label: "Betyg", cell: (t) => (t.rating ? App.stars(t.rating) : NONE), sort: (t) => t.rating ?? 0 },
  };
  const COLS_PICK = ["opened", "symbol", "status", "closed", "side", "inv", "entry", "exit", "pnl", "roi", "r", "hold", "strategy", "reason", "check", "rating"];
  const COLS_DEFAULT = ["opened", "symbol", "status", "closed", "side", "inv", "entry", "exit", "pnl", "roi", "strategy", "reason", "check"];
  const COLS_DAY = ["openedAt", "ticker", "side", "inv", "pnl", "roi", "strategy", "reason", "check"];
  const COLS_COMPACT = ["opened", "symbol", "status", "side", "inv", "pnl", "roi", "reason", "check"];
  const headHtml = (cols, sort) =>
    `<tr>${cols
      .map((k) => {
        const c = COL[k];
        const can = Boolean(sort && c.sort);
        const on = can && sort.key === k;
        return `<th class="${c.num ? "num" : ""}${can ? " sortable" : ""}"${can ? ` data-sort="${k}" aria-sort="${on ? (sort.dir > 0 ? "ascending" : "descending") : "none"}"` : ""}>${c.label}${on ? (sort.dir > 0 ? " ↑" : " ↓") : ""}</th>`;
      })
      .join("")}</tr>`;
  const rowHtml = (t, cols) => `<tr class="clickable" data-id="${t.id}">${cols.map((k) => `<td${COL[k].num ? ' class="num"' : ""}>${COL[k].cell(t)}</td>`).join("")}</tr>`;
  const userCols = () => {
    try {
      const saved = JSON.parse(localStorage.getItem("tz.tradeCols") || "null");
      if (Array.isArray(saved)) {
        const ok = COLS_PICK.filter((k) => saved.includes(k));
        if (ok.length) return ok;
      }
    } catch {
      /* trasigt värde – standardkolumnerna gäller */
    }
    return COLS_DEFAULT;
  };
  // tabellen som dagjournalen och strategisidan visar
  App.TRADE_HEAD = headHtml(COLS_COMPACT, null);
  App.TRADE_HEAD_COMPACT = App.TRADE_HEAD;
  App.tradeRow = (t) => rowHtml(t, COLS_COMPACT);
  App.bindTradeRows = (el) => el.querySelectorAll("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => App.navigate(`#/trade/${tr.dataset.id}`)));

  // rutor som fälls ut under en knapp (filter, kolumner): stängs vid klick utanför och med Esc
  const closePops = (except) =>
    document.querySelectorAll(".pop:not(.hidden)").forEach((p) => {
      if (p === except) return;
      p.classList.add("hidden");
      p.previousElementSibling?.setAttribute("aria-expanded", "false");
    });
  document.addEventListener("click", (e) => {
    if (e.target.closest(".pop-wrap")) return;
    closePops();
    if (App.views.trades) App.views.trades.pop = null;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !document.querySelector(".pop:not(.hidden)")) return;
    closePops();
    if (App.views.trades) App.views.trades.pop = null;
  });

  // ---------------------------------------------------------------- dag- och veckokort
  const dayLong = (day) => {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  };
  const mondayOf = (day) => {
    const [y, m, d] = day.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    return dt.toISOString().slice(0, 10);
  };
  const isoWeek = (monday) => {
    const [y, m, d] = monday.split("-").map(Number);
    const thu = new Date(Date.UTC(y, m - 1, d + 3));
    const jan4 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 4));
    return 1 + Math.round((thu - jan4) / 6048e5 - ((jan4.getUTCDay() + 6) % 7) / 7 + 3 / 7);
  };
  const addDays = (day, n) => {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  };
  const groupStats = (rows) => {
    const pnls = rows.map((t) => t.derived.pnl);
    const wins = pnls.filter((p) => p > 0);
    const losses = pnls.filter((p) => p < 0);
    const gp = wins.reduce((a, b) => a + b, 0);
    const gl = Math.abs(losses.reduce((a, b) => a + b, 0));
    const net = pnls.reduce((a, b) => a + b, 0);
    const fees = rows.reduce((a, t) => a + (t.fees || 0), 0);
    return {
      n: rows.length,
      wins: wins.length,
      losses: losses.length,
      net,
      gross: net + fees,
      fees,
      winPct: rows.length ? (wins.length / rows.length) * 100 : 0,
      volume: rows.reduce((a, t) => a + (t.grid ? t.grid.investment : t.derived.notional || 0), 0),
      pf: gl > 0 ? gp / gl : gp > 0 ? Infinity : null,
    };
  };
  const groupCard = (key, title, rows, open, noteBtn) => {
    const s = groupStats(rows);
    const ds = (l, v) => `<div class="ds"><span>${l}</span><b>${v}</b></div>`;
    return `<div class="day-card ${open ? "open" : ""}" data-key="${key}" id="grp-${key}">
      <div class="day-head">
        <button class="chev" type="button" aria-label="Visa eller dölj trades" aria-expanded="${open ? "true" : "false"}">${App.icon("chevR", 18)}</button>
        <span class="date">${esc(title)}</span><span class="dot"></span><span class="np ${App.cls(s.net)}">Netto P&amp;L ${fmt.signedMoney(s.net)}</span>
        <span class="grow"></span>${noteBtn || ""}
      </div>
      <div class="day-body">
        <div data-curve="${key}"></div>
        <div class="day-stats">
          ${ds("Antal trades", s.n)}${ds("Vinnare", s.wins)}${ds("Brutto P&amp;L", fmt.signed(s.gross))}${ds("Avgifter", fmt.num(s.fees, 2))}
          ${ds("Vinst-%", fmt.pct(s.winPct, 2))}${ds("Förlorare", s.losses)}${ds("Investerat", fmt.num(s.volume, 0))}${ds("Profit factor", fmt.ratio(s.pf))}
        </div>
      </div>
      <div class="day-trades"><div class="table-wrap"><table class="trade-table"><thead>${headHtml(COLS_DAY, null)}</thead><tbody>${rows.map((t) => rowHtml(t, COLS_DAY)).join("")}</tbody></table></div></div>
    </div>`;
  };
  const drawCurves = (el, groups) => {
    for (const [key, rows] of groups) {
      const host = el.querySelector(`[data-curve="${key}"]`);
      if (!host) continue;
      const sorted = [...rows].sort((a, b) => a.closed_at - b.closed_at);
      let cum = 0;
      const pts = [{ v: 0, label: "Start", tip: "0" }, ...sorted.map((t) => ({ v: (cum += t.derived.pnl), label: `${fmt.dt(t.closed_at)} · ${App.base(t.symbol)}`, tip: `${fmt.signedMoney(t.derived.pnl)} → ${fmt.signedMoney(cum)}` }))];
      App.charts.area(host, pts, { height: 150, xLabels: false, ticks: 3, label: "Kumulativ netto-P&L" });
    }
  };
  /** Dagceller (P&L och antal per stängningsdag) för ett urval trades – samma form som /api/calendar ger. */
  const cellsOf = (closed) => {
    const m = new Map();
    for (const t of closed) {
      const day = App.dayKeyOf(t.closed_at);
      const c = m.get(day) || { day, pnl: 0, trades: 0 };
      c.pnl += t.derived.pnl;
      c.trades++;
      m.set(day, c);
    }
    return [...m.values()];
  };

  const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
  const miniCal = (mc, cells) => {
    const byDay = new Map(cells.map((c) => [c.day, c]));
    const first = new Date(Date.UTC(mc.year, mc.month - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7;
    const dim = new Date(Date.UTC(mc.year, mc.month, 0)).getUTCDate();
    const today = App.todayKey();
    let html = ["Må", "Ti", "On", "To", "Fr", "Lö", "Sö"].map((d) => `<div class="dw">${d}</div>`).join("");
    for (let i = 0; i < lead; i++) html += "<div></div>";
    for (let d = 1; d <= dim; d++) {
      const key = `${mc.year}-${String(mc.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const c = byDay.get(key);
      html += `<div class="mc-day ${c ? `has ${c.pnl > 0 ? "pos" : c.pnl < 0 ? "neg" : ""}` : ""}${key === today ? " today" : ""}" ${c ? `data-day="${key}" tabindex="0" role="button"` : ""}>${d}${c ? `<span class="mc-tip">${App.dayShort(key)} ${mc.year}<br>P&amp;L: <b>${fmt.signedMoney(c.pnl)}</b><br>${c.trades} trade${c.trades > 1 ? "s" : ""}</span>` : ""}</div>`;
    }
    return `<div class="mc-head"><button data-mc="prev" aria-label="Föregående månad">‹</button><b>${MONTHS[mc.month - 1]} ${mc.year}</b><button data-mc="next" aria-label="Nästa månad">›</button></div><div class="mc-grid">${html}</div>
      <div class="mc-legend">Grönt = dag på plus, rött = dag på minus. Klicka på en dag för att hoppa dit.</div>`;
  };

  const symbolsSeen = new Set();
  App.views.trades = {
    title: "Trades",
    tab: localStorage.getItem("tz.tradesTab") || "day",
    filter: { outcome: "", side: "", symbol: "", strategy: "" },
    sort: { key: "opened", dir: -1 },
    openKeys: null,
    mc: null,
    pop: null,
    async render(el) {
      const view = App.views.trades;
      const filt = view.filter;
      const params = new URLSearchParams(App.rangeParams());
      if (filt.outcome) params.set("outcome", filt.outcome);
      if (filt.side) params.set("side", filt.side);
      if (filt.symbol) params.set("symbol", filt.symbol);
      if (filt.strategy) params.set("strategy_id", filt.strategy);
      const nFilters = Object.values(filt).filter(Boolean).length;
      const now = new Date();
      const [data, open, calData] = await Promise.all([App.api(`/api/trades?${params}`), App.api("/api/open"), App.api(`/api/calendar?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)]);
      const s = data.summary;
      [...data.trades, ...open].forEach((t) => symbolsSeen.add(t.symbol));
      const closed = data.trades.filter((t) => t.derived.pnl !== null);
      const journaled = new Set(calData.journaled || []);
      const showStats = localStorage.getItem("tz.tradeStats") !== "0";
      const cols = userCols();

      // grupper per dag eller vecka (dagen då boten stängdes)
      const groups = new Map();
      if (view.tab !== "all") {
        for (const t of closed) {
          const day = App.dayKeyOf(t.closed_at);
          const key = view.tab === "week" ? mondayOf(day) : day;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(t);
        }
      }
      const keys = [...groups.keys()].sort().reverse();
      if (!view.openKeys) view.openKeys = new Set(keys.slice(0, 1));
      if (!view.mc) {
        const last = keys[0] || App.todayKey();
        view.mc = { year: Number(last.slice(0, 4)), month: Number(last.slice(5, 7)) };
      }
      // minikalendern visar samma urval som korten när ett filter är på
      const calCells = nFilters ? cellsOf(closed) : calData.cells;

      const empty = (what) =>
        App.emptyState(
          nFilters ? "Inga trades matchar filtret" : what,
          nFilters ? "Ändra eller rensa filtret för att se fler." : `Perioden är ${App.rangeLabel()}.`,
          nFilters ? `<button class="btn" id="f-clear-empty">Rensa filter</button>` : `<button class="btn primary" id="btn-new-empty">${App.icon("plus", 16)} Lägg till trade</button>`,
        );
      let body = "";
      if (view.tab === "all") {
        const sortOf = COL[view.sort.key] && COL[view.sort.key].sort ? COL[view.sort.key].sort : COL.opened.sort;
        const sorted = [...data.trades].sort((a, b) => {
          const va = sortOf(a);
          const vb = sortOf(b);
          return (va < vb ? -1 : va > vb ? 1 : 0) * view.sort.dir;
        });
        let cum = 0;
        const curve = [...closed].sort((a, b) => a.closed_at - b.closed_at).map((t) => (cum += t.derived.pnl));
        const pfShare = s.profitFactor === null ? null : s.profitFactor === Infinity ? 1 : s.profitFactor / (1 + s.profitFactor);
        body = `
          ${
            showStats
              ? `<div class="tiles four">
            <div class="tile wide-label"><div><div class="label">Kumulativ netto-P&amp;L <span class="count">${s.closed}</span></div><div class="value ${App.cls(s.netPnl)}">${fmt.moneyHtml(s.netPnl)}</div></div><div class="viz">${App.charts.spark(curve, 96, 44)}</div></div>
            <div class="tile"><div><div class="label">Profit factor</div><div class="value">${fmt.ratio(s.profitFactor)}</div></div><div class="viz">${App.charts.ring(pfShare)}</div></div>
            <div class="tile"><div><div class="label">Vinst-% trades</div><div class="value">${fmt.pct(s.tradeWinPct, 2)}</div></div><div class="viz">${App.charts.gauge(s.wins, s.breakeven, s.losses)}</div></div>
            <div class="tile wide-label"><div><div class="label">Snitt vinst/förlust</div><div class="value">${fmt.ratio(s.avgWinLossRatio)}</div></div><div class="viz">${App.charts.wlBar(s.avgWin, s.avgLoss)}</div></div>
          </div>`
              : ""
          }
          ${sorted.length ? `<div class="card"><div class="table-wrap"><table class="trade-table"><thead>${headHtml(cols, view.sort)}</thead><tbody>${sorted.map((t) => rowHtml(t, cols)).join("")}</tbody></table></div></div>` : empty("Inga trades i perioden")}`;
      } else {
        const cards = keys
          .map((key) => {
            if (view.tab === "week") {
              const sun = addDays(key, 6);
              return groupCard(key, `Vecka ${isoWeek(key)} · ${App.dayShort(key)} – ${App.dayShort(sun)} ${sun.slice(0, 4)}`, groups.get(key), view.openKeys.has(key), "");
            }
            const note = `<a class="btn small" href="#/dagbok/${key}">${journaled.has(key) ? `${App.icon("note", 15)} Visa anteckning` : `${App.icon("plus", 15)} Lägg till anteckning`}</a>`;
            return groupCard(key, dayLong(key), groups.get(key), view.openKeys.has(key), note);
          })
          .join("");
        body = `<div class="days-layout">
          <div>${cards || empty("Inga stängda trades i perioden")}</div>
          <div class="mini-cal" id="mini-cal">${miniCal(view.mc, calCells)}</div>
        </div>`;
      }

      const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? "selected" : ""}>${esc(label)}</option>`;
      const tab = (name, label) => `<button data-tab="${name}" role="tab" aria-selected="${view.tab === name}" class="${view.tab === name ? "active" : ""}">${label}</button>`;
      el.innerHTML = `
        <div class="page-tools">
          <div class="left"><div class="seg-tabs" id="t-tabs" role="tablist">${tab("day", "Dag")}${tab("week", "Vecka")}${tab("all", "Alla")}</div></div>
          <div class="right">
            ${
              view.tab === "all"
                ? `<div class="pop-wrap"><button class="btn icon" id="t-cols" title="Välj kolumner" aria-label="Välj kolumner" aria-expanded="${view.pop === "cols"}">${App.icon("columns", 17)}</button>
              <div class="pop ${view.pop === "cols" ? "" : "hidden"}" id="t-cols-pop"><div class="pop-title">Kolumner</div>${COLS_PICK.map((k) => `<label class="pop-check"><input type="checkbox" data-col="${k}" ${cols.includes(k) ? "checked" : ""} /> ${COL[k].label}</label>`).join("")}<button class="btn small" id="t-cols-reset" style="margin-top:8px">Standard</button></div></div>
            <button class="btn" id="t-stats">${showStats ? "Dölj statistik" : "Visa statistik"}</button>`
                : ""
            }
            <div class="pop-wrap"><button class="btn" id="t-filter" aria-expanded="${view.pop === "filter"}">${App.icon("filter", 15)} Filter${nFilters ? ` <span class="count">${nFilters}</span>` : ""}</button>
              <div class="pop ${view.pop === "filter" ? "" : "hidden"}" id="t-filter-pop"><div class="pop-title">Filter</div>
                <label class="pop-field">Status<select data-filter="outcome">${opt("", "Alla", filt.outcome)}${opt("win", "Vinster", filt.outcome)}${opt("loss", "Förluster", filt.outcome)}${opt("breakeven", "Noll", filt.outcome)}${opt("open", "Pågående", filt.outcome)}</select></label>
                <label class="pop-field">Sida<select data-filter="side">${opt("", "Alla", filt.side)}${opt("LONG", "Long", filt.side)}${opt("SHORT", "Short", filt.side)}</select></label>
                <label class="pop-field">Symbol<select data-filter="symbol">${opt("", "Alla", filt.symbol)}${[...symbolsSeen].sort().map((x) => opt(x, x, filt.symbol)).join("")}</select></label>
                <label class="pop-field">Strategi<select data-filter="strategy">${opt("", "Alla", filt.strategy)}${(App.state.strategies || []).map((x) => opt(x.id, x.name, filt.strategy)).join("")}</select></label>
                <button class="btn small" id="f-clear" ${nFilters ? "" : "disabled"}>Rensa filter</button>
              </div></div>
            <button class="btn" id="t-day">${App.icon("rocket", 16)} Starta min dag</button>
            <button class="btn primary" id="btn-new">${App.icon("plus", 16)} Lägg till trade</button>
          </div>
        </div>
        ${App.openPositionsHtml(open)}
        ${body}`;

      const rerender = () => ((view.openKeys = null), App.render());
      const toggle = (btnId, popId, name) => {
        const btn = el.querySelector(btnId);
        if (!btn) return;
        btn.addEventListener("click", () => {
          const pop = el.querySelector(popId);
          const show = pop.classList.contains("hidden");
          closePops(pop);
          pop.classList.toggle("hidden", !show);
          btn.setAttribute("aria-expanded", String(show));
          view.pop = show ? name : null;
        });
      };
      toggle("#t-filter", "#t-filter-pop", "filter");
      toggle("#t-cols", "#t-cols-pop", "cols");
      el.querySelectorAll("[data-filter]").forEach((sel) => sel.addEventListener("change", () => ((filt[sel.dataset.filter] = sel.value), rerender())));
      const clear = () => {
        Object.keys(filt).forEach((k) => (filt[k] = ""));
        view.pop = null;
        rerender();
      };
      el.querySelector("#f-clear").addEventListener("click", clear);
      el.querySelector("#f-clear-empty")?.addEventListener("click", clear);
      el.querySelectorAll("[data-col]").forEach((cb) =>
        cb.addEventListener("change", () => {
          const picked = [...el.querySelectorAll("[data-col]")].filter((x) => x.checked).map((x) => x.dataset.col);
          if (!picked.length) return (cb.checked = true);
          localStorage.setItem("tz.tradeCols", JSON.stringify(picked));
          App.render();
        }),
      );
      el.querySelector("#t-cols-reset")?.addEventListener("click", () => (localStorage.removeItem("tz.tradeCols"), App.render()));
      el.querySelectorAll("#t-tabs button").forEach((b) =>
        b.addEventListener("click", () => {
          view.tab = b.dataset.tab;
          view.pop = null;
          localStorage.setItem("tz.tradesTab", view.tab);
          rerender();
        }),
      );
      el.querySelector("#t-stats")?.addEventListener("click", () => (localStorage.setItem("tz.tradeStats", showStats ? "0" : "1"), App.render()));
      el.querySelector("#t-day").addEventListener("click", () => App.navigate("#/dagbok"));
      el.querySelector("#btn-new").addEventListener("click", () => App.quickTrade());
      el.querySelector("#btn-new-empty")?.addEventListener("click", () => App.quickTrade());
      el.querySelectorAll("th[data-sort]").forEach((th) =>
        th.addEventListener("click", () => {
          const k = th.dataset.sort;
          view.sort = view.sort.key === k ? { key: k, dir: -view.sort.dir } : { key: k, dir: COL[k].asc ? 1 : -1 };
          App.render();
        }),
      );
      el.querySelectorAll(".day-card .chev").forEach((b) =>
        b.addEventListener("click", () => {
          const card = b.closest(".day-card");
          const on = card.classList.toggle("open");
          b.setAttribute("aria-expanded", String(on));
          if (on) view.openKeys.add(card.dataset.key);
          else view.openKeys.delete(card.dataset.key);
        }),
      );
      drawCurves(el, groups);
      const mcEl = el.querySelector("#mini-cal");
      if (mcEl) {
        const jump = (d) => {
          const key = view.tab === "week" ? mondayOf(d.dataset.day) : d.dataset.day;
          const card = el.querySelector(`#grp-${key}`);
          if (!card) return App.navigate(`#/dagbok/${d.dataset.day}`);
          card.classList.add("open");
          card.querySelector(".chev").setAttribute("aria-expanded", "true");
          view.openKeys.add(key);
          card.scrollIntoView({ behavior: "smooth", block: "start" });
        };
        const bindMc = () => {
          mcEl.querySelectorAll("[data-mc]").forEach((b) =>
            b.addEventListener("click", () => {
              view.mc.month += b.dataset.mc === "next" ? 1 : -1;
              if (view.mc.month > 12) (view.mc.month = 1), view.mc.year++;
              else if (view.mc.month < 1) (view.mc.month = 12), view.mc.year--;
              mcEl.innerHTML = miniCal(view.mc, calCells);
              bindMc();
            }),
          );
          mcEl.querySelectorAll(".mc-day.has").forEach((d) => {
            d.addEventListener("click", () => jump(d));
            d.addEventListener("keydown", (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              jump(d);
            });
          });
        };
        bindMc();
      }
      App.bindTradeRows(el);
      App.bindOpenPositions(el, open);
    },
  };

  // ---------------------------------------------------------------- trade-sida
  const spanLabel = (t) => {
    const a = App.dayKeyOf(t.opened_at);
    if (!t.closed_at) return `${App.dayShort(a)} ${a.slice(0, 4)} – pågår`;
    const b = App.dayKeyOf(t.closed_at);
    return a === b ? `${App.dayShort(a)} ${a.slice(0, 4)}` : `${App.dayShort(a)}${a.slice(0, 4) === b.slice(0, 4) ? "" : " " + a.slice(0, 4)} – ${App.dayShort(b)} ${b.slice(0, 4)}`;
  };
  const candleLabel = (min) => (min >= 1440 ? "dagsljus" : min >= 60 ? `${min / 60} h-ljus` : `${min} min-ljus`);

  App.views.trade = {
    title: "Trades",
    left: "stats",
    right: "chart",
    async render(el, [idStr]) {
      const view = App.views.trade;
      const [data, all] = await Promise.all([App.api(`/api/trades/${idStr}`), App.api("/api/trades")]);
      const t = data.trade;
      const d = t.derived;
      const open = isOpen(t);
      const g = t.grid || {};
      const base = esc(App.base(t.symbol));
      const cur = App.currentStop(t);
      const hist = parseHist(t);
      const cl = t.strategy_id ? await App.api(`/api/strategies/${t.strategy_id}/checklists`) : { entry: [], exit: [] };
      const ans = new Map((t.rules || []).map((r) => [r.rule_id, Boolean(r.followed)]));
      const order = [...all.trades].sort((a, b) => a.opened_at - b.opened_at).map((x) => x.id);
      const at = order.indexOf(t.id);
      const prevId = at > 0 ? order[at - 1] : null;
      const nextId = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
      const shown = open ? botTotal(g) : d.pnl;
      const plan = planOf(t);
      const row = (l, v, cls = "") => `<div class="td-row"><span>${l}</span><b class="${cls}">${v}</b></div>`;
      const planBadge =
        plan === null
          ? `<span class="badge">Inte bedömd än</span>`
          : plan
            ? `<span class="badge ok">${App.icon("shield", 15)} ${open ? "Enligt planen hittills" : "Enligt planen"}</span>`
            : `<span class="badge warn">${App.icon("alert", 15)} Utanför planen</span>`;

      const stats = `
        <div class="td-pnl ${App.cls(shown)}"><div class="rule-bar"></div><div><div class="l">${open ? "Resultat nu" : "Netto P&amp;L"}</div><div class="v">${shown === null ? "–" : `${fmt.signed(shown)}<small>${esc(App.state.settings.currency || "USDT")}</small>`}</div></div></div>
        <div class="td-rows">
          ${row("Sida", sideTxt(t.side))}
          ${row(isGrid(t) ? "Investering" : "Antal", isGrid(t) ? fmt.money(g.investment, 0) : fmt.num(t.qty, 2))}
          ${isGrid(t) ? row("Hävstång", `${fmt.num(g.leverage, 0)}x`) : ""}
          ${row("Exponering", fmt.money(d.notional, 0))}
          ${row(`${base} vid start`, fmt.price(t.entry))}
          ${row(`${base} vid stopp`, App.endPrice(t) === null ? "–" : fmt.price(App.endPrice(t)))}
          ${row("Netto ROI", d.returnPct === null ? "–" : fmt.pct(d.returnPct, 2), App.cls(d.returnPct))}
          ${isGrid(t) && g.gridProfit !== null && g.gridProfit !== undefined ? row("Grid Profit", fmt.signed(g.gridProfit), App.cls(g.gridProfit)) : ""}
          ${isGrid(t) && g.gridTrades !== null && g.gridTrades !== undefined ? row("Profitable Trades", fmt.num(g.gridTrades, 0)) : ""}
          ${isGrid(t) && !open && d.aprPct !== null && d.aprPct !== undefined ? row("APR", fmt.pct(d.aprPct, 0), App.cls(d.aprPct)) : ""}
          ${row(open || isGrid(t) ? "Körtid" : "Hålltid", fmt.dur(open ? Date.now() - t.opened_at : d.durationMs))}
          ${row("Öppnad", fmt.dt(t.opened_at))}
          ${row("Stängd", open ? "pågår" : fmt.dt(t.closed_at))}
        </div>
        <div class="td-sec">Risk</div>
        <div class="td-rows">
          ${row("Stopp (linjen)", cur === null ? "–" : fmt.price(cur) + (hist.some((h) => h.backward) ? ' <span class="warn-badge">bakåt</span>' : ""))}
          ${row("Risk om stoppet träffas", d.plannedRisk === null ? "–" : fmt.money(d.plannedRisk, 0))}
          ${row("R-multipel", fmt.r(d.realizedR), App.cls(d.realizedR))}
        </div>
        ${hist.length > 1 ? `<ul class="stop-hist">${hist.map((h) => `<li class="${h.backward ? "back" : ""}"><span>${fmt.dt(h.time)}</span><span>${fmt.price(h.stop)}${h.backward ? " · bakåt" : ""}</span></li>`).join("")}</ul>` : ""}
        <div class="td-sec">Planen</div>
        <div class="td-rows">
          ${row("Strategi", t.strategy_name ? `<span class="strat-pill">${esc(t.strategy_name)}</span>` : "–")}
          ${row("Varför stängd", open ? "–" : esc(reasonLabel(t.exit_reason)), t.exit_reason === "manual" ? "neg" : "")}
          ${row("Checklista", checkTxt(d), plan === true ? "pos" : plan === false ? "neg" : "")}
          ${row("Betyg", t.rating ? App.stars(t.rating) : "–")}
        </div>
        ${
          open
            ? `<div class="td-actions"><input type="number" step="any" id="new-stop" placeholder="Nytt stopp (linjen)" aria-label="Nytt stopp" style="width:150px" /><button class="btn small" id="btn-move">Flytta stopp</button><button class="btn small" id="btn-progress">Resultat nu</button><span class="grow"></span><button class="btn small" id="btn-close">Stoppa bot</button><button class="btn small primary" id="btn-flip">Trenden vände → vänd</button></div>`
            : ""
        }`;

      const phaseHtml = (phase, items, title) => {
        if (!items.length) return "";
        const answered = items.some((r) => ans.has(r.id));
        const done = items.filter((r) => ans.get(r.id)).length;
        return `<div class="td-sec">${title}<span class="td-sec-meta">${answered ? `${done} av ${items.length} följda · <a href="#" data-clear="${phase}">rensa</a>` : "inte besvarad"}</span></div>
          <div class="qchecklist" data-phase="${phase}">${items.map((r) => `<label class="qitem small ${answered && !ans.get(r.id) ? "no" : ""}"><input type="checkbox" data-rule="${r.id}" ${ans.get(r.id) ? "checked" : ""} /><span>${esc(r.text || "")}</span></label>`).join("")}</div>`;
      };
      const strat = `
        <div style="margin-bottom:10px">${planBadge}</div>
        <div class="td-rows">
          <div class="td-row"><span><label for="td-strategy">Strategi</label></span><b><select id="td-strategy"><option value="">Ingen</option>${(App.state.strategies || []).map((x) => `<option value="${x.id}" ${t.strategy_id === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></b></div>
          ${open ? "" : `<div class="td-row"><span><label for="td-reason">Varför stängd</label></span><b><select id="td-reason"><option value="">Ej angivet</option>${Object.entries(App.EXIT_LABEL).map(([k, v]) => `<option value="${k}" ${t.exit_reason === k ? "selected" : ""}>${v}</option>`).join("")}</select></b></div>`}
          <div class="td-row"><span>Betyg</span><b id="td-stars">${App.stars(t.rating, true)}</b></div>
        </div>
        ${
          t.strategy_id
            ? cl.entry.length || cl.exit.length
              ? `${phaseHtml("entry", cl.entry, "Innan trade")}${open ? "" : phaseHtml("exit", cl.exit, "Vid stängning")}<p class="muted small" style="margin:10px 0 0">När du bockar i en lista sparas de obockade punkterna som regelbrott.</p>`
              : `<p class="muted small" style="margin:12px 0 0">Strategin har inga checklistor än. Lägg till punkter under <a href="#/playbook">Strategi</a>.</p>`
            : `<p class="muted small" style="margin:12px 0 0">Välj en strategi för att bocka av dess checklistor på den här traden.</p>`
        }`;
      const shots = `<div class="dropzone" id="dz">Klistra in eller dra hit skärmbild</div>
        <div class="attachments" style="margin-top:10px">${t.attachments.map((a) => `<div class="att"><img src="${a.url}" data-url="${a.url}" alt="Skärmbild" /><button class="btn small danger del" data-att="${a.id}" aria-label="Ta bort bilden">✕</button></div>`).join("")}</div>`;
      const chart = `<div class="td-chart" id="td-chart"></div><div class="muted small" id="td-chart-note" style="margin-top:8px">Pris från Bybits öppna marknadsdata.</div>`;
      const notes = `<textarea id="trade-notes" style="min-height:300px" aria-label="Anteckning" placeholder="T.ex. hur signalen såg ut, var linjen låg…">${esc(t.notes)}</textarea><div class="muted small" style="margin-top:6px">Sparas när du lämnar fältet.</div>`;
      const tab = (name, cur2, label) => `<button data-tab="${name}" role="tab" aria-selected="${cur2 === name}" class="${cur2 === name ? "active" : ""}">${label}</button>`;

      el.innerHTML = `
        <div class="td-head">
          <a class="btn icon" href="#/trades" title="Alla trades" aria-label="Alla trades">${App.icon("list", 18)}</a>
          <button class="btn icon" id="td-prev" ${prevId ? "" : "disabled"} title="Föregående trade" aria-label="Föregående trade">${App.icon("chevL", 18)}</button>
          <button class="btn icon" id="td-next" ${nextId ? "" : "disabled"} title="Nästa trade" aria-label="Nästa trade">${App.icon("chevR", 18)}</button>
          <span class="sym">${esc(t.symbol)}</span>
          <span class="muted">${isGrid(t) ? `Gridbot · ${fmt.num(g.leverage || 1, 0)}x` : "Position"}</span>
          <span class="when">${esc(spanLabel(t))}</span>
          ${App.statusPill(d.outcome)}
          <span class="grow"></span>
          <button class="btn" id="btn-edit">${App.icon("edit", 15)} Redigera</button>
          <button class="btn danger" id="btn-del">${App.icon("trash", 15)} Ta bort</button>
        </div>
        <div class="td-layout">
          <div class="card">
            <div class="seg-tabs" id="td-left" role="tablist" style="margin-bottom:14px">${tab("stats", view.left, "Stats")}${tab("strat", view.left, "Strategi")}${tab("shots", view.left, `Bilder${t.attachments.length ? ` (${t.attachments.length})` : ""}`)}</div>
            ${view.left === "strat" ? strat : view.left === "shots" ? shots : stats}
          </div>
          <div class="card">
            <div class="seg-tabs" id="td-right" role="tablist" style="margin-bottom:14px">${tab("chart", view.right, "Diagram")}${tab("notes", view.right, "Anteckning")}</div>
            ${view.right === "notes" ? notes : chart}
          </div>
        </div>`;

      el.querySelector("#td-prev").addEventListener("click", () => prevId && App.navigate(`#/trade/${prevId}`));
      el.querySelector("#td-next").addEventListener("click", () => nextId && App.navigate(`#/trade/${nextId}`));
      el.querySelectorAll("#td-left button").forEach((b) => b.addEventListener("click", () => ((view.left = b.dataset.tab), App.render())));
      el.querySelectorAll("#td-right button").forEach((b) => b.addEventListener("click", () => ((view.right = b.dataset.tab), App.render())));
      el.querySelector("#btn-edit").addEventListener("click", () => App.quickEdit(t));
      el.querySelector("#btn-del").addEventListener("click", async () => {
        if (!App.confirm("Ta bort traden?")) return;
        await App.del(`/api/trades/${t.id}`);
        await App.refreshMeta();
        App.navigate("#/trades");
      });
      const meta = async (body, msg) => {
        try {
          await App.patch(`/api/trades/${t.id}/meta`, body);
          if (msg) App.toast(msg);
          await App.refreshMeta();
          App.render();
        } catch (err) {
          App.toast(err.message, true);
        }
      };
      if (view.left === "stats" && open) {
        el.querySelector("#btn-move").addEventListener("click", async () => {
          const v = Number(el.querySelector("#new-stop").value);
          if (!v) return App.toast("Ange linjens nya värde", true);
          if (await App.moveStop(t, v)) App.render();
        });
        el.querySelector("#btn-progress").addEventListener("click", () => App.quickProgress(t));
        el.querySelector("#btn-close").addEventListener("click", () => App.quickClose(t, "stop"));
        el.querySelector("#btn-flip").addEventListener("click", () => App.quickClose(t, "flip"));
      }
      if (view.left === "strat") {
        el.querySelector("#td-strategy").addEventListener("change", (e) => meta({ strategy_id: e.target.value ? Number(e.target.value) : null }, "Strategin sparad"));
        el.querySelector("#td-reason")?.addEventListener("change", (e) => meta({ exit_reason: e.target.value || null }, "Sparat"));
        el.querySelectorAll("#td-stars [data-star]").forEach((x) => x.addEventListener("click", () => meta({ rating: Number(x.dataset.star) === t.rating ? null : Number(x.dataset.star) })));
        const saveRules = async (body) => {
          try {
            await App.patch(`/api/trades/${t.id}/rules`, body);
            App.render();
          } catch (err) {
            App.toast(err.message, true);
          }
        };
        el.querySelectorAll("[data-phase] input[data-rule]").forEach((cb) =>
          cb.addEventListener("change", () => saveRules({ merge: true, rules: [...cb.closest("[data-phase]").querySelectorAll("input[data-rule]")].map((x) => ({ rule_id: Number(x.dataset.rule), followed: x.checked })) })),
        );
        el.querySelectorAll("[data-clear]").forEach((a) =>
          a.addEventListener("click", (e) => {
            e.preventDefault();
            const drop = new Set(cl[a.dataset.clear].map((r) => r.id));
            saveRules({ rules: (t.rules || []).filter((r) => !drop.has(r.rule_id)).map((r) => ({ rule_id: r.rule_id, followed: Boolean(r.followed) })) });
          }),
        );
      }
      if (view.left === "shots") {
        App.bindDropzone(el.querySelector("#dz"), async (files) => {
          try {
            await App.uploadImages(`/api/trades/${t.id}/attachments`, files);
            App.render();
          } catch (err) {
            App.toast(err.message, true);
          }
        });
        el.querySelectorAll(".attachments .del").forEach((b) => b.addEventListener("click", async () => (await App.del(`/api/attachments/${b.dataset.att}`), App.render())));
        el.querySelectorAll(".attachments img").forEach((img) => img.addEventListener("click", () => App.modal(`<img src="${img.dataset.url}" style="max-width:100%;border-radius:10px" alt="Skärmbild" />`)));
      }
      if (view.right === "notes") {
        el.querySelector("#trade-notes").addEventListener("change", async (e) => {
          try {
            await App.patch(`/api/trades/${t.id}/meta`, { notes: e.target.value });
            t.notes = e.target.value;
            App.toast("Sparat");
          } catch (err) {
            App.toast(err.message, true);
          }
        });
      } else {
        App.charts.priceChart(el.querySelector("#td-chart"), t).then((info) => {
          const note = el.querySelector("#td-chart-note");
          if (info && note) {
            const lines = ["startpris", App.endPrice(t) && t.closed_at ? "slutpris" : "", cur ? "stopplinjen" : ""].filter(Boolean);
            note.textContent = `Pris från Bybits öppna marknadsdata (${candleLabel(info.min)}). Pilen visar starten${t.closed_at ? " och rutan stoppet" : ""}. ${lines.length > 1 ? "Linjerna" : "Linjen"} är ${lines.length > 1 ? lines.slice(0, -1).join(", ") + " och " + lines[lines.length - 1] : lines[0]}.`;
          }
        });
      }
    },
  };
})();
