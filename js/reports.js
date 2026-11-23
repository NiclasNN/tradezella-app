/* Rapporter + Insikter */
(() => {
  "use strict";
  const App = window.App;
  const { fmt, esc } = App;

  const bucketTable = (title, buckets, opts = {}) => {
    if (!buckets.length) return `<div class="card report-section"><div class="card-title">${title}</div><span class="muted small">Ingen data.</span></div>`;
    const max = Math.max(...buckets.map((b) => Math.abs(b.pnl)), 1);
    return `<div class="card report-section"><div class="card-title">${title}${opts.note ? `<span class="muted small">${opts.note}</span>` : ""}</div>
      <div class="table-wrap"><table><thead><tr><th>${opts.keyLabel || ""}</th><th class="num">Trades</th><th class="num">Vinst-%</th><th class="num">PF</th><th class="num">Snitt R</th><th class="num">Snitt P&L</th><th class="num">Netto P&L</th><th class="bar-cell"></th></tr></thead><tbody>
      ${buckets.map((b) => `<tr><td>${esc(b.label)}</td><td class="num">${b.n}</td><td class="num">${fmt.pct(b.winPct, 0)}</td><td class="num">${fmt.ratio(b.profitFactor)}</td><td class="num">${fmt.r(b.avgR)}</td><td class="num ${App.cls(b.avgPnl)}">${fmt.signed(b.avgPnl, 0)}</td><td class="num ${App.cls(b.pnl)}"><b>${fmt.signed(b.pnl, 0)}</b></td><td class="bar-cell">${App.charts.hbar(b.pnl, max)}</td></tr>`).join("")}
      </tbody></table></div></div>`;
  };

  App.views.rapporter = {
    title: "Rapporter",
    async render(el) {
      const data = await App.api(`/api/reports?${App.rangeParams()}`);
      const s = data.summary;
      const r = data.reports;
      const m = (l, v, cls = "") => `<div class="m"><div class="l">${l}</div><div class="v ${cls}">${v}</div></div>`;
      const heatMax = Math.max(1, ...r.mistakesByWeekday.flatMap((x) => x.cells.map((c) => Math.abs(c.pnl))));
      el.innerHTML = `
        <div class="greeting"><h2>Rapporter</h2><span class="muted small">Period: ${App.rangeLabel()} · ${s.closed} stängda trades</span></div>
        ${data.insights.length ? `<div class="card report-section"><div class="card-title">Insikter</div>${data.insights.map((i) => `<div class="insight ${i.kind}">${App.insightIcon(i.kind)}<span>${esc(i.text)}</span></div>`).join("")}</div>` : ""}
        <div class="card report-section"><div class="card-title">Översikt (${s.closed} trades, ${s.tradingDays} handelsdagar)</div>
          <div class="metrics-grid">
            ${m("Netto P&L", fmt.signedMoney(s.netPnl), App.cls(s.netPnl))}${m("Brutto P&L", fmt.signedMoney(s.grossPnl), App.cls(s.grossPnl))}${m("Avgifter", fmt.money(s.fees))}${m("Avkastning på startkapital", s.returnOnStartPct === null ? "–" : fmt.pct(s.returnOnStartPct, 2), App.cls(s.returnOnStartPct))}${m("Zella Score", data.score.enough ? fmt.num(data.score.total, 1) : "–")}
            ${m("Trade win %", fmt.pct(s.tradeWinPct, 1))}${m("Day win %", fmt.pct(s.dayWinPct, 1))}${m("Profit factor", fmt.ratio(s.profitFactor))}${m("Snitt vinst/förlust", fmt.ratio(s.avgWinLossRatio))}${m("Förväntan/trade", fmt.signedMoney(s.expectancy), App.cls(s.expectancy))}
            ${m("Snitt vinst", fmt.signedMoney(s.avgWin, 0), "pos")}${m("Snitt förlust", fmt.signedMoney(-s.avgLoss, 0), "neg")}${m("Största vinst", fmt.signedMoney(s.largestWin, 0), "pos")}${m("Största förlust", fmt.signedMoney(s.largestLoss, 0), "neg")}${m("Vinster / BE / förluster", `${s.wins} / ${s.breakeven} / ${s.losses}`)}
            ${m("Snitt R", fmt.r(s.avgR))}${m("Total R", fmt.r(s.totalR))}${m("Snitt planerad R:R", s.avgPlannedRR === null ? "–" : "1:" + fmt.num(s.avgPlannedRR, 2))}${m("Trades med stopp angivet", `${s.tradesWithR} / ${s.closed}`)}${m("Regler följda", s.ruleFollowPct === null ? "–" : fmt.pct(s.ruleFollowPct, 0))}
            ${m("Max drawdown", `${fmt.money(s.maxDrawdown, 0)}${s.maxDrawdownPct !== null ? " (" + fmt.pct(s.maxDrawdownPct, 1) + ")" : ""}`, "neg")}${m("Recovery factor", fmt.ratio(s.recoveryFactor))}${m("Konsistens", s.consistencyPct === null ? "–" : fmt.pct(s.consistencyPct, 0))}${m("Snitt dags-P&L", fmt.signedMoney(s.avgDailyPnl, 0), App.cls(s.avgDailyPnl))}${m("Bästa / sämsta dag", `${s.bestDay ? fmt.short(s.bestDay.pnl) : "–"} / ${s.worstDay ? fmt.short(s.worstDay.pnl) : "–"}`)}
            ${m("Snitt hålltid", fmt.dur(s.avgHoldMs))}${m("Hålltid vinnare / förlorare", `${fmt.dur(s.avgHoldWinMs)} / ${fmt.dur(s.avgHoldLossMs)}`)}${m("Längsta vinst-/förlustsvit", `${s.maxWinStreak} / ${s.maxLossStreak}`)}${m("Snitt trades per dag", fmt.num(s.avgTradesPerDay, 1))}${m("Snitt positionsvärde", fmt.money(s.avgNotional, 0))}
            ${m("Long", `${s.longs.n} st · ${fmt.pct(s.longs.winPct, 0)} · ${fmt.short(s.longs.pnl)}`, App.cls(s.longs.pnl))}${m("Short", `${s.shorts.n} st · ${fmt.pct(s.shorts.winPct, 0)} · ${fmt.short(s.shorts.pnl)}`, App.cls(s.shorts.pnl))}${m("Snitt betyg", s.avgRating ? fmt.num(s.avgRating, 1) + " ★" : "–")}${m("Vinnande / förlorande dagar", `${s.winningDays} / ${s.losingDays}`)}${m("Öppna trades", s.open)}
          </div>
        </div>
        <div class="grid-halves">
          ${bucketTable("Per exit-orsak", r.exitReason, { keyLabel: "Exit", note: "stopp, trendvändning eller manuell?" })}
          ${bucketTable("Per veckodag (entry)", r.weekday, { keyLabel: "Dag" })}
          ${bucketTable("Per timme (entry, svensk tid)", r.hour, { keyLabel: "Timme" })}
          ${bucketTable("Per hålltid", r.duration, { keyLabel: "Hålltid" })}
          ${bucketTable("Per månad", r.month, { keyLabel: "Månad" })}
          ${bucketTable("Per riktning", r.side, { keyLabel: "Riktning" })}
          ${bucketTable("Per symbol", r.symbol, { keyLabel: "Symbol" })}
          ${bucketTable("Per strategi", r.strategy, { keyLabel: "Strategi" })}
          ${bucketTable("Regelföljsamhet", r.ruleAdherence, { keyLabel: "Följsamhet", note: "handlar disciplinen?" })}
          ${r.tagsByCategory.map((c) => bucketTable(`Taggar: ${esc(c.category)}`, c.buckets, { keyLabel: "Tagg", note: c.kind === "mistake" ? "sorterat bäst → sämst" : "" })).join("")}
          ${bucketTable("Per betyg på utförandet", r.rating, { keyLabel: "Betyg" })}
          ${bucketTable("R-multipel-fördelning", r.rDistribution, { keyLabel: "R" })}
          ${bucketTable("P&L-fördelning", r.pnlDistribution, { keyLabel: "P&L-intervall" })}
        </div>
        ${
          r.mistakesByWeekday.length
            ? `<div class="card report-section"><div class="card-title">Misstag × veckodag <span class="muted small">antal (netto P&L)</span></div><div class="table-wrap"><table class="heat"><thead><tr><th>Misstag</th>${["mån", "tis", "ons", "tors", "fre", "lör", "sön"].map((d) => `<th>${d}</th>`).join("")}</tr></thead><tbody>${r.mistakesByWeekday
                .map((row) => `<tr><td style="text-align:left">${esc(row.mistake)}</td>${row.cells.map((c) => `<td><span style="background:${c.n ? `rgba(229,72,77,${0.15 + (0.7 * Math.abs(c.pnl)) / heatMax})` : "transparent"}">${c.n ? `${c.n} (${fmt.short(c.pnl)})` : "·"}</span></td>`).join("")}</tr>`)
                .join("")}</tbody></table></div></div>`
            : ""
        }`;
    },
  };

  App.views.insikter = {
    title: "Insikter",
    async render(el) {
      const data = await App.api(`/api/reports?${App.rangeParams()}`);
      const sc = data.score;
      const strengths = data.insights.filter((i) => i.kind === "strength");
      const weaknesses = data.insights.filter((i) => i.kind === "weakness");
      const infos = data.insights.filter((i) => i.kind === "info");
      const block = (title, items) => `<div class="card report-section"><div class="card-title">${title}</div>${items.length ? items.map((i) => `<div class="insight ${i.kind}">${App.insightIcon(i.kind)}<span>${esc(i.text)}</span></div>`).join("") : '<span class="muted small">Inget ännu.</span>'}</div>`;
      el.innerHTML = `
        <div class="greeting"><h2>Insikter</h2><span class="muted small">Regelbaserade slutsatser ur din egen logg, ${App.rangeLabel()}. Inga gissningar – bara det dina siffror visar.</span></div>
        <div class="grid-2">
          <div>${block("Styrkor", strengths)}${block("Svagheter", weaknesses)}${block("Observationer", infos)}</div>
          <div class="card report-section"><div class="card-title">Zella Score – vad drar ner?</div>
            <div class="score-wrap">${App.charts.radar(sc.parts, 240)}<div class="score-total">Din Zella Score: <b>${sc.enough ? fmt.num(sc.total, 2) : "–"}</b></div></div>
            <div class="score-parts">${sc.parts
              .map((p) => {
                const tip = { profitFactor: "Bruttovinst / bruttoförlust. ≥ 2,6 ger full poäng.", avgWinLoss: "Snittvinst / snittförlust. ≥ 2,6 ger full poäng – låt vinnare löpa, kapa förlorare.", maxDrawdown: "Största fall från toppen av den kumulativa P&L-kurvan, i % av toppen.", winPct: "Andel vinnande trades. 60 % ger full poäng.", recovery: "Netto P&L / max drawdown. ≥ 3,5 ger full poäng.", consistency: "100 − (standardavvikelse för dags-P&L / total P&L). Jämna dagar ger hög poäng." }[p.key];
                return `<div title="${tip}"><span>${esc(p.label)} <span class="muted">(${Math.round(p.weight * 100)} %)</span></span><span><b>${p.points.toFixed(0)}</b> / 100</span></div>`;
              })
              .join("")}</div>
            <div class="muted small" style="margin-top:8px">Vikter och trappsteg följer TradeZellas beskrivning av Zella Score. Kräver minst 5 stängda trades.</div>
          </div>
        </div>`;
    },
  };
})();
