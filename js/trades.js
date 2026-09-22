/* Trades: pågående bottar, lista och en avskalad trade-sida */
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
  const botTotal = (g) => (g && g.totalPnl !== null && g.totalPnl !== undefined ? g.totalPnl : g && (g.gridProfit !== null || g.positionPnl !== null) ? (g.gridProfit || 0) + (g.positionPnl || 0) : null);
  const reasonLabel = (k) => (k ? App.EXIT_LABEL[k] || k : "–");

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
    return `<div class="card" style="margin-bottom:16px"><div class="card-title">Pågående (${open.length})</div>
      <div class="open-list">${open
        .map((t) => {
          const cur = App.currentStop(t);
          const g = t.grid || {};
          const sofar = botTotal(g);
          return `<div class="op" data-id="${t.id}">
            <div><a href="#/trade/${t.id}"><b>${esc(t.symbol)}</b></a> ${App.sidePill(t.side)}<div class="muted small">${fmt.date(t.opened_at)} · ${fmt.dur(Date.now() - t.opened_at)} · SOL ${fmt.price(t.entry)} · ${isGrid(t) ? `${fmt.money(g.investment, 0)} × ${fmt.num(g.leverage, 0)}` : `${fmt.num(t.qty, 2)} st`}</div></div>
            <div class="small">Stopp <b>${cur === null ? "–" : fmt.price(cur)}</b>${parseHist(t).some((h) => h.backward) ? ' <span class="warn-badge">flyttad bakåt</span>' : ""}<br>Resultat nu: ${sofar === null ? '<span class="muted">–</span>' : `<b class="${App.cls(sofar)}">${fmt.signedMoney(sofar)}</b>`}</div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end"><input type="number" step="any" placeholder="Nytt stopp" data-stop-input="${t.id}" style="width:100px" /><button class="btn small" data-move="${t.id}">Flytta stopp</button><button class="btn small" data-progress="${t.id}">Resultat nu</button><button class="btn small" data-close="${t.id}">Stoppa bot</button><button class="btn small primary" data-flip="${t.id}">Vänd</button></div>
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

  // ---------------------------------------------------------------- lista
  /** Slutpris att visa: bots har det i grid.endPrice (kan saknas – Bybit visar det inte), positioner i exit. */
  App.endPrice = (t) => (t.kind === "grid" ? (t.grid && t.grid.endPrice !== null && t.grid.endPrice !== undefined ? t.grid.endPrice : null) : t.exit);
  App.TRADE_HEAD = `<tr><th>Datum</th><th>Sida</th><th class="num">Investering</th><th class="num">SOL start → stopp</th><th class="num">Resultat</th><th class="num">ROI</th><th>Varför stängd</th><th class="num">Checklista</th></tr>`;
  App.TRADE_HEAD_COMPACT = App.TRADE_HEAD;
  App.tradeRow = (t) => {
    const d = t.derived;
    const open = d.outcome === "open";
    const g = t.grid || {};
    const check = d.entryFollowPct === null ? "–" : `${Math.round(d.entryFollowPct)} %${d.exitFollowPct !== null ? ` / ${Math.round(d.exitFollowPct)} %` : ""}`;
    return `<tr class="clickable" data-id="${t.id}">
      <td>${fmt.date(t.opened_at)}${open ? '<br><span class="muted small">pågår</span>' : `<br><span class="muted small">→ ${fmt.date(t.closed_at)}</span>`}</td>
      <td>${App.sidePill(t.side, open)}</td>
      <td class="num">${isGrid(t) ? `${fmt.money(g.investment, 0)} <span class="muted">× ${fmt.num(g.leverage, 0)}</span>` : fmt.num(t.qty, 2)}</td>
      <td class="num">${fmt.price(t.entry)} → ${App.endPrice(t) === null ? '<span class="muted">–</span>' : fmt.price(App.endPrice(t))}</td>
      <td class="num">${open ? '<span class="muted">–</span>' : App.pnlHtml(d.pnl)}</td>
      <td class="num ${App.cls(d.returnPct)}">${open || d.returnPct === null ? "–" : fmt.pct(d.returnPct, 1)}</td>
      <td>${open ? '<span class="muted">–</span>' : reasonLabel(t.exit_reason)}</td>
      <td class="num">${check}</td>
    </tr>`;
  };
  App.bindTradeRows = (el) => el.querySelectorAll("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => App.navigate(`#/trade/${tr.dataset.id}`)));

  App.views.trades = {
    title: "Trades",
    async render(el) {
      const filt = (App.views.trades.filter = App.views.trades.filter || { outcome: "" });
      const params = new URLSearchParams(App.rangeParams());
      if (filt.outcome) params.set("outcome", filt.outcome);
      const [data, open] = await Promise.all([App.api(`/api/trades?${params}`), App.api("/api/open")]);
      const s = data.summary;
      el.innerHTML = `
        <div class="toolbar">
          <label>Visa <select id="f-outcome"><option value="">Alla</option><option value="win">Vinster</option><option value="loss">Förluster</option><option value="open">Pågående</option></select></label>
          <span style="flex:1"></span>
          <button class="btn primary" id="btn-new">＋ Lägg till trade</button>
        </div>
        ${App.openPositionsHtml(open)}
        <div class="stat-strip">
          <div>Resultat<b class="${App.cls(s.netPnl)}">${fmt.signedMoney(s.netPnl)}</b></div>
          <div>Trades<b>${s.closed}</b></div>
          <div>Vinst-%<b>${fmt.pct(s.tradeWinPct, 0)}</b></div>
          <div>Profit factor<b>${fmt.ratio(s.profitFactor)}</b></div>
          <div>Checklista följd<b>${s.ruleFollowPct === null ? "–" : fmt.pct(s.ruleFollowPct, 0)}</b></div>
        </div>
        ${
          data.trades.length
            ? `<div class="card"><div class="table-wrap"><table><thead>${App.TRADE_HEAD}</thead><tbody>${data.trades.map((t) => App.tradeRow(t)).join("")}</tbody></table></div></div>`
            : App.emptyState("Inga trades i perioden", `Perioden är ${App.rangeLabel()}.`, `<button class="btn primary" id="btn-new-empty">＋ Lägg till trade</button>`)
        }`;
      el.querySelector("#f-outcome").value = filt.outcome;
      el.querySelector("#f-outcome").addEventListener("change", (e) => ((filt.outcome = e.target.value), App.render()));
      el.querySelector("#btn-new")?.addEventListener("click", () => App.quickTrade());
      el.querySelector("#btn-new-empty")?.addEventListener("click", () => App.quickTrade());
      App.bindTradeRows(el);
      App.bindOpenPositions(el, open);
    },
  };

  // ---------------------------------------------------------------- trade-sida
  App.views.trade = {
    title: "Trade",
    async render(el, [idStr]) {
      const data = await App.api(`/api/trades/${idStr}`);
      const t = data.trade;
      const d = t.derived;
      const open = d.outcome === "open";
      const g = t.grid || {};
      const cur = App.currentStop(t);
      const hist = parseHist(t);
      const rules = t.rules || [];
      const entryRules = rules.filter((r) => (r.phase ?? "entry") !== "exit");
      const exitRules = rules.filter((r) => r.phase === "exit");
      const st = (l, v, cls = "") => `<div class="st"><div class="l">${l}</div><div class="v ${cls}">${v}</div></div>`;
      const ruleList = (list) => `<div class="qchecklist">${list.map((r) => `<label class="qitem small ${r.followed ? "" : "no"}"><input type="checkbox" data-rule="${r.rule_id}" ${r.followed ? "checked" : ""} /><span>${esc(r.text || "")}</span></label>`).join("")}</div>`;
      el.innerHTML = `
        <div class="toolbar"><a href="#/trades" class="btn small">‹ Alla trades</a><span style="flex:1"></span><button class="btn small" id="btn-edit">Redigera</button><button class="btn small danger" id="btn-del">Ta bort</button></div>
        <div class="card" style="margin-bottom:16px">
          <div class="trade-head">
            <h2>${esc(t.symbol)} ${App.sidePill(t.side, open)} <span class="muted small" style="font-weight:500">${fmt.dt(t.opened_at)}${t.closed_at ? " → " + fmt.dt(t.closed_at) : " · pågår"}</span></h2>
            <div class="big-pnl ${App.cls(open ? botTotal(g) : d.pnl)}">${open ? (botTotal(g) === null ? "PÅGÅR" : fmt.signedMoney(botTotal(g)) + "<small> just nu</small>") : fmt.signedMoney(d.pnl)}</div>
          </div>
          <div class="stats-grid" style="margin-top:12px">
            ${st("SOL vid start", fmt.price(t.entry))}
            ${st("SOL vid stopp", App.endPrice(t) === null ? "–" : fmt.price(App.endPrice(t)))}
            ${st("Investering", isGrid(t) ? `${fmt.money(g.investment, 0)} <span class="muted">× ${fmt.num(g.leverage, 0)}</span>` : fmt.num(t.qty, 2))}
            ${st("Stopp (linjen)", cur === null ? "–" : fmt.price(cur) + (hist.some((h) => h.backward) ? ' <span class="warn-badge">bakåt</span>' : ""))}
            ${st("Varför stängd", open ? "–" : reasonLabel(t.exit_reason), t.exit_reason === "manual" ? "neg" : "")}
            ${st("ROI", d.returnPct === null ? "–" : fmt.pct(d.returnPct, 1), App.cls(d.returnPct))}
            ${isGrid(t) && g.gridProfit !== null && g.gridProfit !== undefined ? st("Grid Profit", fmt.signedMoney(g.gridProfit), App.cls(g.gridProfit)) : ""}
            ${isGrid(t) && g.gridTrades !== null && g.gridTrades !== undefined ? st("Profitable Trades", fmt.num(g.gridTrades, 0)) : ""}
            ${isGrid(t) && !open && d.aprPct !== null && d.aprPct !== undefined ? st("APR", fmt.pct(d.aprPct, 0), App.cls(d.aprPct)) : ""}
            ${st("Checklista", `${d.entryFollowPct === null ? "–" : Math.round(d.entryFollowPct) + " %"}${d.exitFollowPct !== null ? ` / ${Math.round(d.exitFollowPct)} %` : ""}`, d.entryFollowPct === 100 && (d.exitFollowPct === null || d.exitFollowPct === 100) ? "pos" : d.entryFollowPct !== null && d.entryFollowPct < 100 ? "neg" : "")}
            ${st(open || isGrid(t) ? "Körtid" : "Hålltid", fmt.dur(open ? Date.now() - t.opened_at : d.durationMs))}
          </div>
          ${
            open
              ? `<div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap">
              <input type="number" step="any" id="new-stop" placeholder="Nytt stopp (linjen)" style="width:170px" /><button class="btn" id="btn-move">Flytta stopp</button>
              <button class="btn" id="btn-progress">Resultat nu</button><span style="flex:1"></span>
              <button class="btn" id="btn-close">Stoppa bot</button><button class="btn primary" id="btn-flip">Trenden vände → vänd</button></div>`
              : ""
          }
          <details style="margin-top:12px"><summary class="muted small" style="cursor:pointer">Mer detaljer</summary>
            <div class="stats-grid" style="margin-top:8px">
              ${st("Exponering", fmt.money(d.notional, 0))}
              ${st("Risk om stoppet träffas", d.plannedRisk === null ? "–" : fmt.money(d.plannedRisk, 0), "neg")}
              ${st("R", fmt.r(d.realizedR), App.cls(d.realizedR))}
              ${st("Årstakt", d.aprPct === null ? "–" : fmt.pct(d.aprPct, 0))}
            </div>
            ${hist.length > 1 ? `<ul class="stop-hist">${hist.map((h) => `<li class="${h.backward ? "back" : ""}"><span>${fmt.dt(h.time)}</span><span>${fmt.price(h.stop)}${h.backward ? " · bakåt" : ""}</span></li>`).join("")}</ul>` : ""}
          </details>
        </div>
        <div class="grid-halves">
          <div class="card"><div class="card-title">Checklista</div>
            ${entryRules.length ? `<div class="muted small" style="margin-bottom:4px">Innan trade</div>${ruleList(entryRules)}` : '<span class="muted small">Ingen checklista besvarad.</span>'}
            ${exitRules.length ? `<div class="muted small" style="margin:10px 0 4px">Vid stängning</div>${ruleList(exitRules)}` : ""}
          </div>
          <div class="card"><div class="card-title">Anteckning &amp; bilder</div>
            <textarea id="trade-notes" placeholder="T.ex. hur signalen såg ut, var linjen låg…">${esc(t.notes)}</textarea>
            <div class="dropzone" id="dz" style="margin-top:8px">Klistra in eller dra hit skärmbild</div>
            <div class="attachments" style="margin-top:10px">${t.attachments.map((a) => `<div class="att"><img src="${a.url}" data-url="${a.url}" /><button class="btn small danger del" data-att="${a.id}">✕</button></div>`).join("")}</div>
          </div>
        </div>`;
      el.querySelector("#btn-edit").addEventListener("click", () => App.quickEdit(t));
      el.querySelector("#btn-del").addEventListener("click", async () => {
        if (!App.confirm("Ta bort traden?")) return;
        await App.del(`/api/trades/${t.id}`);
        await App.refreshMeta();
        App.navigate("#/trades");
      });
      if (open) {
        el.querySelector("#btn-move").addEventListener("click", async () => {
          const v = Number(el.querySelector("#new-stop").value);
          if (!v) return App.toast("Ange linjens nya värde", true);
          if (await App.moveStop(t, v)) App.render();
        });
        el.querySelector("#btn-progress").addEventListener("click", () => App.quickProgress(t));
        el.querySelector("#btn-close").addEventListener("click", () => App.quickClose(t, "stop"));
        el.querySelector("#btn-flip").addEventListener("click", () => App.quickClose(t, "flip"));
      }
      el.querySelectorAll("[data-rule]").forEach((cb) =>
        cb.addEventListener("change", async () => {
          await App.patch(`/api/trades/${t.id}/rules`, { merge: true, rules: [{ rule_id: Number(cb.dataset.rule), followed: cb.checked }] });
          App.render();
        }),
      );
      el.querySelector("#trade-notes").addEventListener("change", async (e) => {
        await App.put(`/api/trades/${t.id}`, { ...t, notes: e.target.value, tag_ids: (t.tags || []).map((x) => x.id), rules: rules.map((r) => ({ rule_id: r.rule_id, followed: Boolean(r.followed) })), pnl_override: Boolean(t.pnl_override) });
        App.toast("Sparat");
      });
      App.bindDropzone(el.querySelector("#dz"), async (files) => {
        try {
          await App.uploadImages(`/api/trades/${t.id}/attachments`, files);
          App.render();
        } catch (err) {
          App.toast(err.message, true);
        }
      });
      el.querySelectorAll(".attachments .del").forEach((b) => b.addEventListener("click", async () => (await App.del(`/api/attachments/${b.dataset.att}`), App.render())));
      el.querySelectorAll(".attachments img").forEach((img) => img.addEventListener("click", () => App.modal(`<img src="${img.dataset.url}" style="max-width:100%;border-radius:10px" />`)));
    },
  };
})();
