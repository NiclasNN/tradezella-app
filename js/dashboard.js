/* Översikt (Dashboard) – widgets, kalender, Zella Score, kurvor, senaste trades, insikter */
(() => {
  "use strict";
  const App = window.App;
  const { fmt, esc } = App;
  const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

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
      const cls = c ? (c.pnl > 0 ? "pos" : c.pnl < 0 ? "neg" : "") : "";
      cells += `<div class="cal-cell ${cls}${key === today ? " today" : ""}" data-day="${key}">
        ${jset.has(key) ? '<span class="journ" title="Journal skriven">✎</span>' : ""}
        <div class="dom">${d}</div>
        ${c ? `<div class="pnl">${fmt.short(c.pnl)}</div><div class="meta">${c.trades} trade${c.trades > 1 ? "s" : ""}<br>${c.totalR !== null ? fmt.num(c.totalR, 2) + "R, " : ""}${c.winPct.toFixed(0)} %</div>` : ""}
      </div>`;
    }
    const weeks = cal.weeks.map((w) => `<div class="cal-week"><div class="wk">Vecka ${w.index}</div><div class="wp ${App.cls(w.pnl)}">${w.days ? fmt.short(w.pnl) : "0"}</div><div class="wd">${w.days} dag${w.days === 1 ? "" : "ar"}</div></div>`).join("");
    return `
      <div class="cal-head">
        <div class="cal-nav"><button class="today" data-cal="today">Idag</button><button data-cal="prev">‹</button><span class="cal-month">${MONTHS[cal.month - 1]} ${cal.year}</span><button data-cal="next">›</button></div>
        <div class="cal-summary">${opts.hideSummary ? "" : `<b class="${App.cls(cal.totalPnl)}">${fmt.short(cal.totalPnl)}</b> · ${cal.tradingDays} dag${cal.tradingDays === 1 ? "" : "ar"}`}</div>
      </div>
      <div class="cal-wrap">
        <div class="cal-grid">${dows.map((d) => `<div class="cal-dow">${d}</div>`).join("")}${cells}</div>
        <div class="cal-weeks">${weeks}</div>
      </div>`;
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

  App.views.oversikt = {
    title: "Översikt",
    cal: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
    async render(el) {
      const cal = App.views.oversikt.cal;
      const data = await App.api(`/api/dashboard?${App.rangeParams()}&year=${cal.year}&month=${cal.month}`);
      const s = data.summary;
      const sc = data.score;
      data.missed = data.missed || [];
      data.open = data.open || [];
      const balance = data.settings.startBalance + s.netPnl;
      const streakKind = (k) => (k === "win" ? "vinst" : k === "loss" ? "förlust" : "–");
      el.innerHTML = `
        <div class="greeting"><h2>${greeting()}</h2><span class="muted small">Visar ${App.rangeLabel()} · ${s.closed} stängda trades${s.open ? ` · ${s.open} öppna` : ""}</span></div>
        ${
          !s.trades && !App.state.hasSample
            ? App.emptyState("Inga trades ännu", "Klicka på Lägg till trade när du startar din första bot.", `<button class="btn primary" id="btn-first">＋ Lägg till trade</button>`)
            : ""
        }
        ${App.isStatic() && !window.LocalApi.sync.config() && !localStorage.getItem("tz.hideConnect") ? `
        <div class="card connect-card" id="connect-card">
          <div class="card-title">Använder du journalen på en annan enhet? <a href="#" id="cc-hide" class="muted small" style="font-weight:400;float:right">Dölj</a></div>
          <p class="small muted" style="margin:0 0 10px">Koppla molnsynk så visas samma trades här. Enklast: på den enhet som redan är kopplad, gå till Inställningar → <b>Koppla en annan enhet</b> och skanna QR-koden med mobilen eller öppna länken här. Eller klistra in nyckeln:</p>
          <div class="form-actions" style="justify-content:flex-start;flex-wrap:wrap"><input id="cc-token" type="password" placeholder="github_pat_…" style="flex:1;min-width:200px" /><button class="btn primary" id="cc-connect">Koppla</button><span id="cc-msg" class="muted small"></span></div>
        </div>` : ""}
        ${App.openPositionsHtml(data.open || [])}
        <div class="tiles four">
          <div class="tile"><div><div class="label">Resultat <span class="count">${s.closed}</span></div><div class="value ${App.cls(s.netPnl)}">${fmt.moneyHtml(s.netPnl)}</div><div class="sub">${s.returnOnStartPct !== null ? fmt.pct(s.returnOnStartPct, 1) + " av kontot" : ""}</div></div></div>
          <div class="tile"><div><div class="label">Kontosaldo</div><div class="value">${fmt.moneyHtml(balance, 0, false)}</div><div class="sub">start ${fmt.money(data.settings.startBalance, 0)}</div></div></div>
          <div class="tile"><div><div class="label">Vinst-%</div><div class="value">${fmt.pct(s.tradeWinPct, 0)}</div><div class="sub">${s.wins} vinster · ${s.losses} förluster</div></div><div class="viz">${App.charts.gauge(s.wins, s.breakeven, s.losses)}</div></div>
          <div class="tile"><div><div class="label">Profit factor</div><div class="value">${fmt.ratio(s.profitFactor)}</div><div class="sub">checklista följd ${s.ruleFollowPct === null ? "–" : fmt.pct(s.ruleFollowPct, 0)}</div></div><div class="viz">${App.charts.donut(s.profitFactor === Infinity ? 3 : s.profitFactor, 3, s.profitFactor >= 1 ? "#22a06b" : "#e5484d")}</div></div>
          <div class="tile"><div><div class="label">Disciplin</div><div class="value ${s.disciplineStreak >= 3 ? "pos" : ""}">${s.disciplineStreak} <small>i rad enligt strategin</small></div><div class="sub">snittbetyg ${s.avgRating ? fmt.num(s.avgRating, 1) + " ★" : "–"} · missade signaler ${data.missed.length}</div></div></div>
        </div>
        <div class="grid-2">
          <div class="card" id="cal-card">${App.calendarHtml(data.calendar, data.journaledDays)}</div>
          <div class="card">
            <div class="card-title">Zella Score <span class="muted small" title="Profit factor 25 %, snitt vinst/förlust 20 %, max drawdown 20 %, vinst-% 15 %, recovery factor 10 %, konsistens 10 %">ⓘ</span></div>
            <div class="score-wrap">
              ${App.charts.radar(sc.parts)}
              <div class="score-total">Din Zella Score: <b>${sc.enough ? fmt.num(sc.total, 2) : "–"}</b>${sc.enough ? "" : ' <span class="small">(minst 5 stängda trades)</span>'}</div>
              <div class="score-parts">${sc.parts.map((p) => `<div><span>${esc(p.label)} <span class="muted">(${Math.round(p.weight * 100)} %)</span></span><span><span class="muted">${p.raw === null ? "–" : p.key === "winPct" || p.key === "maxDrawdown" || p.key === "consistency" ? fmt.pct(p.raw, 0) : fmt.ratio(p.raw)}</span> → <b>${p.points.toFixed(0)}</b></span></div>`).join("")}</div>
            </div>
          </div>
        </div>
        <div class="grid-2">
          <div class="card"><div class="card-title">Resultat över tid</div><div id="chart-equity"></div></div>
          <div class="card"><div class="card-title">Insikter <a href="#/rapporter" class="small">Mer</a></div>${data.insights.slice(0, 3).map((i) => `<div class="insight ${i.kind}"><span>${i.kind === "strength" ? "💪" : i.kind === "weakness" ? "⚠️" : "ℹ️"}</span><span>${esc(i.text)}</span></div>`).join("") || '<span class="muted small">Insikter dyker upp efter några trades.</span>'}</div>
        </div>
        ${
          data.missed.length
            ? `<div class="card" style="margin-bottom:16px"><div class="card-title">Missade signaler (${data.missed.length}) <span class="muted small">regel 6: varje signal tas</span></div>${data.missed
                .slice(0, 5)
                .map((x) => `<div class="op" style="grid-template-columns:auto 1fr auto"><div>${fmt.date(x.time)} ${App.sidePill(x.side)}</div><div class="small">${x.price ? "SOL " + fmt.price(x.price) + " · " : ""}${esc(x.notes) || '<span class="muted">ingen anledning angiven</span>'}</div><button class="btn small ghost" data-delmissed="${x.id}">✕</button></div>`)
                .join("")}</div>`
            : ""
        }
        <div class="card"><div class="card-title">Senaste trades <a href="#/trades" class="small">Visa alla</a></div>
            ${data.recent.length ? `<div class="table-wrap"><table><thead>${App.TRADE_HEAD}</thead><tbody>${data.recent.map((t) => App.tradeRow(t)).join("")}</tbody></table></div>` : '<span class="muted small">Inga trades ännu.</span>'}
        </div>`;
      el.querySelector("#cc-hide")?.addEventListener("click", (e) => (e.preventDefault(), localStorage.setItem("tz.hideConnect", "1"), App.render()));
      el.querySelector("#cc-connect")?.addEventListener("click", async () => {
        const msg = el.querySelector("#cc-msg");
        msg.textContent = "Kontrollerar…";
        const r = await window.LocalApi.sync.connect(el.querySelector("#cc-token").value, "NiclasNN", "tradezella-data");
        msg.textContent = r.message;
        if (r.ok) App.toast("Molnsynk kopplad");
      });
      el.querySelector("#btn-first")?.addEventListener("click", () => App.quickTrade());
      el.querySelector("#btn-sample")?.addEventListener("click", async () => {
        await App.post("/api/sample");
        await App.refreshMeta();
        App.toast("Exempeldata skapad");
        App.render();
      });
      App.bindCalendar(el.querySelector("#cal-card"), cal, () => App.render());
      App.charts.equity(el.querySelector("#chart-equity"), data.equity);
      App.bindTradeRows(el);
      App.bindOpenPositions(el, data.open || []);
      el.querySelectorAll("[data-delmissed]").forEach((b) => b.addEventListener("click", async () => (await App.del(`/api/missed/${b.dataset.delmissed}`), App.render())));
    },
  };
})();
