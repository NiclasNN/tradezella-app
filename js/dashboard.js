/* Översikt (Dashboard) – upplägg som TradeZella: widgetrad, senaste trades + kalender med veckosummor,
   Zella Score, kumulativ och daglig P&L, insikter. Disciplin och pågående bottar är journalens egna tillägg. */
(() => {
  "use strict";
  const App = window.App;
  const { fmt, esc } = App;
  const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
  const info = (text) => `<span class="info" title="${esc(text)}">${App.icon("info", 15)}</span>`;
  const dayShort = (day) => {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("sv-SE", { day: "numeric", month: "short", timeZone: "UTC" });
  };
  App.dayShort = dayShort;
  /** Belopp utan plustecken, förkortat (kalenderceller och veckosummor). */
  const cellMoney = (v) => fmt.short(v).replace("+", "");

  App.calendarHtml = (cal, journaled = [], opts = {}) => {
    const today = App.todayKey();
    const jset = new Set(journaled);
    const dows = ["Mån", "Tis", "Ons", "Tors", "Fre", "Lör", "Sön"];
    const byDay = new Map(cal.cells.map((c) => [Number(c.day.slice(-2)), c]));
    let cells = "";
    for (let i = 0; i < cal.firstWeekday; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= cal.daysInMonth; d++) {
      const key = `${cal.year}-${String(cal.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const c = byDay.get(d);
      const cls = c ? (c.pnl > 0 ? "pos" : c.pnl < 0 ? "neg" : "be") : "";
      cells += `<div class="cal-cell ${cls}${key === today ? " today" : ""}" data-day="${key}">
        ${jset.has(key) ? `<span class="journ" title="Journal skriven">${App.icon("note", 17)}</span>` : ""}
        <div class="dom">${d}</div>
        ${c ? `<div class="pnl">${cellMoney(c.pnl)}</div><div class="meta">${c.trades} trade${c.trades > 1 ? "s" : ""}<br><i>${c.totalR !== null ? fmt.num(c.totalR, 2) + "R, " : ""}${c.winPct.toFixed(0)} %</i></div>` : ""}
      </div>`;
    }
    const filled = cal.firstWeekday + cal.daysInMonth;
    for (let i = filled; i % 7 !== 0; i++) cells += `<div class="cal-cell empty"></div>`;
    const weeks = cal.weeks
      .map((w) => `<div class="cal-week"><div class="wk">Vecka ${w.index}</div><div class="wp ${w.days ? App.cls(w.pnl) : ""}">${w.days ? cellMoney(w.pnl) : "0"}</div><div class="wd"><span class="pill-soft">${w.days} dag${w.days === 1 ? "" : "ar"}</span></div></div>`)
      .join("");
    return `<div class="cal${opts.compact ? " cal-compact" : ""}">
      <div class="cal-head">
        <div class="cal-nav"><button data-cal="prev" aria-label="Föregående månad">◂</button><span class="cal-month">${MONTHS[cal.month - 1]} ${cal.year}</span><button data-cal="next" aria-label="Nästa månad">▸</button><button class="today" data-cal="today">Denna månad</button></div>
        <div class="cal-summary">${opts.hideSummary ? "" : `<b>Månaden:</b> <span class="pill-soft ${cal.totalPnl > 0 ? "g" : cal.totalPnl < 0 ? "r" : ""}">${cellMoney(cal.totalPnl)}</span><span class="pill-soft">${cal.tradingDays} dag${cal.tradingDays === 1 ? "" : "ar"}</span>`}</div>
      </div>
      <div class="cal-wrap">
        <div class="cal-grid">${dows.map((d) => `<div class="cal-dow">${d}</div>`).join("")}${cells}</div>
        ${opts.compact ? "" : `<div class="cal-weeks">${weeks}</div>`}
      </div></div>`;
  };

  App.bindCalendar = (el, state, onChange) => {
    el.querySelectorAll("[data-cal]").forEach((b) =>
      b.addEventListener("click", () => {
        const now = new Date();
        if (b.dataset.cal === "today") {
          state.year = now.getFullYear();
          state.month = now.getMonth() + 1;
        } else {
          state.month += b.dataset.cal === "next" ? 1 : -1;
          if (state.month > 12) {
            state.month = 1;
            state.year++;
          } else if (state.month < 1) {
            state.month = 12;
            state.year--;
          }
        }
        onChange();
      }),
    );
    el.querySelectorAll(".cal-cell[data-day]").forEach((c) => c.addEventListener("click", () => App.navigate(`#/dagbok/${c.dataset.day}`)));
  };

  const greeting = () => {
    const h = new Date().getHours();
    return h < 10 ? "God morgon!" : h < 17 ? "Hej!" : "God kväll!";
  };

  /** Dagceller inom vald period, äldst först. */
  const cellsInRange = (cells) => {
    const rp = new URLSearchParams(App.rangeParams());
    const from = rp.get("from") ? App.dayKeyOf(Number(rp.get("from"))) : null;
    const to = rp.get("to") ? App.dayKeyOf(Number(rp.get("to"))) : null;
    return cells.filter((c) => (!from || c.day >= from) && (!to || c.day <= to)).sort((a, b) => (a.day < b.day ? -1 : 1));
  };

  App.views.oversikt = {
    title: "Översikt",
    cal: null,
    tab: "recent",
    async render(el) {
      const view = App.views.oversikt;
      const first = !view.cal;
      if (first) view.cal = { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
      const cal = view.cal;
      let [data, calData] = await Promise.all([App.api(`/api/dashboard?${App.rangeParams()}&year=${cal.year}&month=${cal.month}`), App.api(`/api/calendar?year=${cal.year}&month=${cal.month}`)]);
      // första visningen: öppna kalendern på månaden med den senaste traden (annars är den tom mellan bottarna)
      if (first && !data.calendar.cells.length && calData.cells.length) {
        const last = calData.cells.map((c) => c.day).sort().pop();
        cal.year = Number(last.slice(0, 4));
        cal.month = Number(last.slice(5, 7));
        [data, calData] = await Promise.all([App.api(`/api/dashboard?${App.rangeParams()}&year=${cal.year}&month=${cal.month}`), App.api(`/api/calendar?year=${cal.year}&month=${cal.month}`)]);
      }
      const s = data.summary;
      const sc = data.score;
      data.missed = data.missed || [];
      data.open = data.open || [];
      const balance = data.settings.startBalance + s.netPnl;
      const firstTime = !s.trades && !App.state.hasSample;
      const days = cellsInRange(calData.cells);
      const beDays = Math.max(0, s.tradingDays - s.winningDays - s.losingDays);
      const pfShare = s.profitFactor === null ? null : s.profitFactor === Infinity ? 1 : s.profitFactor / (1 + s.profitFactor);
      const [word, wordCls] = App.charts.scoreWord(sc.total, sc.enough);
      const journaledToday = (data.journaledDays || []).includes(App.todayKey());
      const st = App.isStatic() ? window.LocalApi.status : null;
      const synced = st && window.LocalApi.sync.config() && st.lastSyncAt ? new Date(st.lastSyncAt).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
      const recentRows = (data.recent || []).filter((t) => t.derived.pnl !== null).slice(0, 8);

      el.innerHTML = `
        <div class="greeting">
          <h2>${greeting()}</h2>
          <div class="gr-right">
            <span class="last-sync">${synced ? `Senast synkad: <b>${esc(synced)}</b> <a href="#" id="dash-resync">Hämta</a>` : `Visar ${App.rangeLabel()} · ${s.closed} stängda trades${s.open ? ` · ${s.open} pågår` : ""}`}</span>
            <button class="btn blue" id="dash-day">${App.icon("rocket", 16)} ${journaledToday ? "Visa min dag" : "Starta min dag"}</button>
          </div>
        </div>
        ${
          firstTime
            ? `<div class="hero"><div class="hero-main"><div class="hero-title">Dags för första boten?</div><div class="hero-sub">Bocka av checklistan och logga boten på under en minut.</div></div>
               <div class="hero-side"><button class="hero-btn" id="hero-new">${App.icon("zap", 18)} Logga ny bot <kbd>N</kbd></button>${App.canImportScreens() ? `<div class="hero-drop" id="hero-drop" role="button" tabindex="0">${App.icon("image", 20)}<div><b>Dra in skärmbilden från Bybit</b><span>eller klicka – så loggar jag allt</span></div></div>` : ""}</div></div>`
            : ""
        }
        ${App.isStatic() && !window.LocalApi.sync.config() && !localStorage.getItem("tz.hideConnect") ? `
        <div class="card connect-card" id="connect-card" style="margin-bottom:16px">
          <div class="card-title">Använder du journalen på en annan enhet? <a href="#" id="cc-hide" class="muted small" style="font-weight:400">Dölj</a></div>
          <p class="small muted" style="margin:0 0 10px">Koppla molnsynk så visas samma trades här. Enklast: på den enhet som redan är kopplad, gå till Inställningar → <b>Koppla en annan enhet</b> och skanna QR-koden med mobilen eller öppna länken här. Eller klistra in nyckeln:</p>
          <div class="form-actions" style="justify-content:flex-start;flex-wrap:wrap"><input id="cc-token" type="password" placeholder="github_pat_…" style="flex:1;min-width:200px" /><button class="btn primary" id="cc-connect">Koppla</button><span id="cc-msg" class="muted small"></span></div>
        </div>` : ""}
        ${App.openPositionsHtml(data.open)}
        <div class="tiles">
          <div class="tile"><div><div class="label">Netto P&amp;L ${info("Summan av alla stängda trades i perioden, efter avgifter.")} <span class="count">${s.closed}</span></div><div class="value ${App.cls(s.netPnl)}">${fmt.moneyHtml(s.netPnl)}</div><div class="sub">Konto <b>${fmt.money(balance, 0)}</b>${s.returnOnStartPct !== null ? ` · ${fmt.pct(s.returnOnStartPct, 1)}` : ""}</div></div></div>
          <div class="tile"><div><div class="label">Vinst-% trades ${info("Andel vinnande trades. Brickorna: vinster, break-even, förluster.")}</div><div class="value">${fmt.pct(s.tradeWinPct, 2)}</div></div><div class="viz">${App.charts.gauge(s.wins, s.breakeven, s.losses)}</div></div>
          <div class="tile"><div><div class="label">Profit factor ${info("Bruttovinst delat med bruttoförlust. Över 1 = lönsamt.")}</div><div class="value">${fmt.ratio(s.profitFactor)}</div></div><div class="viz">${App.charts.ring(pfShare)}</div></div>
          <div class="tile"><div><div class="label">Vinst-% dagar ${info("Andel dagar som slutade på plus. Brickorna: vinstdagar, nolldagar, förlustdagar.")}</div><div class="value">${fmt.pct(s.dayWinPct, 2)}</div></div><div class="viz">${App.charts.gauge(s.winningDays, beDays, s.losingDays)}</div></div>
          <div class="tile wide-label"><div><div class="label">Snitt vinst/förlust ${info("Snittvinst delat med snittförlust per trade.")}</div><div class="value">${fmt.ratio(s.avgWinLossRatio)}</div></div><div class="viz">${App.charts.wlBar(s.avgWin, s.avgLoss)}</div></div>
          <div class="tile wide-label"><div><div class="label">Disciplin ${info("Senaste stängda trades i rad där checklistorna är 100 % och boten stängdes på stoppen eller vid trendvändning.")}</div><div class="value">${s.disciplineStreak} <small>i rad enligt planen</small></div><div class="sub">checklista ${s.ruleFollowPct === null ? "–" : fmt.pct(s.ruleFollowPct, 0)} · betyg ${s.avgRating ? fmt.num(s.avgRating, 1) + " ★" : "–"} · missade signaler ${data.missed.length}</div></div><div class="viz"><div class="streak"><div class="ring ${s.disciplineStreak ? "" : "zero"}">${s.disciplineStreak}</div></div></div></div>
        </div>
        <div class="dash-main">
          <div class="card recent-card">
            <div class="line-tabs" id="rt-tabs"><button data-tab="recent" class="${view.tab === "recent" ? "active" : ""}">Senaste trades</button><button data-tab="open" class="${view.tab === "open" ? "active" : ""}">Öppna positioner${data.open.length ? ` (${data.open.length})` : ""}</button></div>
            ${
              view.tab === "recent"
                ? recentRows.length
                  ? `<div class="table-wrap"><table><thead><tr><th>Stängd</th><th>Symbol</th><th>Netto P&amp;L</th></tr></thead><tbody>${recentRows.map((t) => `<tr class="clickable" data-id="${t.id}"><td>${fmt.date(t.closed_at)}</td><td class="sym">${esc(App.base(t.symbol))}</td><td class="${App.cls(t.derived.pnl)} tabular">${fmt.signed(t.derived.pnl)}</td></tr>`).join("")}</tbody></table></div><a class="more" href="#/trades">Visa fler</a>`
                  : `<div class="none">Inga stängda trades i perioden.</div>`
                : data.open.length
                  ? `<div class="table-wrap"><table><thead><tr><th>Öppnad</th><th>Symbol</th><th>Resultat nu</th></tr></thead><tbody>${data.open.map((t) => { const g = t.grid || {}; const now = g.totalPnl ?? null; return `<tr class="clickable" data-id="${t.id}"><td>${fmt.date(t.opened_at)}</td><td class="sym">${esc(App.base(t.symbol))}</td><td class="${App.cls(now)} tabular">${now === null ? "–" : fmt.signed(now)}</td></tr>`; }).join("")}</tbody></table></div>`
                  : `<div class="none">Inga bottar kör just nu.</div>`
            }
          </div>
          <div class="card" id="cal-card">${App.calendarHtml(data.calendar, data.journaledDays)}</div>
        </div>
        <div class="grid-3">
          <div class="card"><div class="card-title"><span>Zella Score ${info("Profit factor 25 %, snitt vinst/förlust 20 %, max drawdown 20 %, vinst-% 15 %, recovery factor 10 %, konsistens 10 %. Kräver minst 5 stängda trades.")}</span>${word ? `<span class="badge-tag ${wordCls}">${word}</span>` : ""}</div>
            <div class="score-wrap">
              ${App.charts.radar(sc.parts)}
              <div class="score-total">Din Zella Score: <b>${sc.enough ? fmt.num(sc.total, 2) : "–"}</b>${sc.enough ? "" : '<span class="small muted">(minst 5 stängda trades)</span>'}</div>
              ${App.charts.scoreBar(sc.enough ? sc.total : 0)}
              <div class="score-parts">${sc.parts.map((p) => `<div><span>${esc(p.label)} <span class="muted">(${Math.round(p.weight * 100)} %)</span></span><span><span class="muted">${p.raw === null ? "–" : p.key === "winPct" || p.key === "maxDrawdown" || p.key === "consistency" ? fmt.pct(p.raw, 0) : fmt.ratio(p.raw)}</span> → <b>${p.points.toFixed(0)}</b></span></div>`).join("")}</div>
            </div>
          </div>
          <div class="card"><div class="card-title"><span>Daglig kumulativ netto-P&amp;L ${info("Summan av alla dagars resultat över tid, dag för dag.")}</span></div><div id="chart-cum"></div></div>
          <div class="card"><div class="card-title"><span>Netto P&amp;L per dag ${info("Resultatet per dag (dagen då boten stängdes).")}</span></div><div id="chart-daily"></div></div>
        </div>
        <div class="grid-2">
          <div class="card"><div class="card-title">Insikter <a href="#/insikter" class="small">Mer</a></div>${data.insights.slice(0, 3).map((i) => `<div class="insight ${i.kind}">${App.insightIcon(i.kind)}<span>${esc(i.text)}</span></div>`).join("") || '<span class="muted small">Insikter dyker upp efter några trades.</span>'}</div>
          <div class="card"><div class="card-title">Missade signaler <span class="muted small" style="font-weight:400">regel 6: varje signal tas</span></div>${
            data.missed.length
              ? data.missed.slice(0, 5).map((x) => `<div class="op" style="display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)"><div>${fmt.date(x.time)} ${App.sidePill(x.side)}</div><div class="small">${x.price ? esc(App.base(x.symbol || App.state.settings.defaultSymbol)) + " " + fmt.price(x.price) + " · " : ""}${esc(x.notes) || '<span class="muted">ingen anledning angiven</span>'}</div><button class="btn small ghost" data-delmissed="${x.id}">✕</button></div>`).join("")
              : '<span class="muted small">Inga missade signaler i perioden.</span>'
          }</div>
        </div>`;

      el.querySelector("#dash-day").addEventListener("click", () => App.navigate("#/dagbok"));
      el.querySelector("#dash-resync")?.addEventListener("click", (e) => (e.preventDefault(), App.syncPullNow()));
      el.querySelector("#cc-hide")?.addEventListener("click", (e) => (e.preventDefault(), localStorage.setItem("tz.hideConnect", "1"), App.render()));
      el.querySelector("#cc-connect")?.addEventListener("click", async () => {
        const msg = el.querySelector("#cc-msg");
        msg.textContent = "Kontrollerar…";
        const r = await window.LocalApi.sync.connect(el.querySelector("#cc-token").value, "NiclasNN", "tradezella-data");
        msg.textContent = r.message;
        if (r.ok) App.toast("Molnsynk kopplad");
      });
      el.querySelector("#hero-new")?.addEventListener("click", () => App.quickTrade());
      const heroDrop = el.querySelector("#hero-drop");
      heroDrop?.addEventListener("click", App.pickScreenshot);
      heroDrop?.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), App.pickScreenshot()));
      el.querySelectorAll("#rt-tabs button").forEach((b) => b.addEventListener("click", () => ((view.tab = b.dataset.tab), App.render())));
      App.bindCalendar(el.querySelector("#cal-card"), cal, () => App.render());
      let cum = 0;
      App.charts.area(el.querySelector("#chart-cum"), days.map((c) => ({ v: (cum += c.pnl), label: fmt.dayLabel(c.day), x: dayShort(c.day) })), { label: "Daglig kumulativ netto-P&L" });
      App.charts.bars(el.querySelector("#chart-daily"), days.map((c) => ({ v: c.pnl, label: fmt.dayLabel(c.day), x: dayShort(c.day), tip: `${fmt.signedMoney(c.pnl)} · ${c.trades} trade${c.trades > 1 ? "s" : ""}` })), { label: "Netto P&L per dag" });
      App.bindTradeRows(el);
      App.bindOpenPositions(el, data.open);
      el.querySelectorAll("[data-delmissed]").forEach((b) => b.addEventListener("click", async () => (await App.del(`/api/missed/${b.dataset.delmissed}`), App.render())));
    },
  };
})();
