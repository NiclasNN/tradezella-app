/* Det enda flödet: checklista → logga bot, och skäl + checklista → stoppa bot. Enkel redigering. */
(() => {
  "use strict";
  const App = window.App;
  const { fmt, esc } = App;
  App.EXIT_LABEL = { stop: "Stoppen träffades", flip: "Trenden vände", target: "Vinstmål", manual: "Manuellt", other: "Annat" };

  const strategy = () => (App.state.strategies || [])[0] || null;
  const num = (el) => (el && el.value !== "" ? Number(el.value) : null);

  const checklistHtml = (items, answers) =>
    items.length
      ? `<div class="qchecklist">${items.map((r) => `<label class="qitem"><input type="checkbox" data-rule="${r.id}" ${answers.get(r.id) ? "checked" : ""} /><span>${esc(r.text)}</span></label>`).join("")}</div>`
      : `<div class="muted" style="padding:10px 0">Inga punkter ännu. Klicka "Ändra punkter".</div>`;

  /** Redigera en checklista: en punkt per rad. */
  App.checklistEditor = (phase, onSaved) => {
    const st = strategy();
    if (!st) return App.toast("Ingen strategi finns", true);
    App.api(`/api/strategies/${st.id}/checklists`).then((cl) => {
      const m = App.modal(
        `<h3>${phase === "entry" ? "Checklista innan trade" : "Checklista när du stänger"}</h3>
        <div id="cl-rows">${cl[phase].map((r) => `<div class="cl-row"><input data-id="${r.id}" value="${esc(r.text)}" /><button type="button" class="btn small ghost cl-del">✕</button></div>`).join("")}</div>
        <button type="button" class="btn small" id="cl-add">＋ Punkt</button>
        <div class="form-actions"><button class="btn" id="cl-cancel">Avbryt</button><button class="btn primary" id="cl-save">Spara</button></div>`,
        { narrow: true },
      );
      const rows = m.querySelector("#cl-rows");
      const addRow = () => {
        rows.insertAdjacentHTML("beforeend", `<div class="cl-row"><input data-id="" placeholder="Ny punkt…" /><button type="button" class="btn small ghost cl-del">✕</button></div>`);
        rows.lastElementChild.querySelector("input").focus();
      };
      m.querySelector("#cl-add").addEventListener("click", addRow);
      rows.addEventListener("click", (e) => e.target.classList.contains("cl-del") && e.target.parentElement.remove());
      rows.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          addRow();
        }
      });
      if (!cl[phase].length) addRow();
      m.querySelector("#cl-cancel").addEventListener("click", App.closeModal);
      m.querySelector("#cl-save").addEventListener("click", async () => {
        const items = [...rows.querySelectorAll("input")].map((i) => ({ id: i.dataset.id ? Number(i.dataset.id) : null, text: i.value })).filter((i) => i.text.trim());
        try {
          await App.put(`/api/strategies/${st.id}/checklists/${phase}`, { items });
          App.closeModal();
          App.toast("Sparat");
          if (onSaved) onSaved();
        } catch (err) {
          App.toast(err.message, true);
        }
      });
    });
  };

  // ---------------------------------------------------------------- Ny trade
  App.quickTrade = async (prefill = null) => {
    const st = strategy();
    if (!st) {
      App.toast("Skapa en strategi under Strategi först", true);
      return App.navigate("#/playbook");
    }
    const s = App.state.settings;
    const cl = await App.api(`/api/strategies/${st.id}/checklists`);
    const answers = new Map();
    const p = prefill || {};
    const m = App.modal(`<div class="qhead"><h3>Ny trade</h3><span class="qsteps"><b id="q1" class="on">1 Checklista</b> › <b id="q2">2 Boten</b></span></div><div id="q-body"></div>`, { narrow: true });
    const body = m.querySelector("#q-body");

    const step1 = () => {
      m.querySelector("#q2").classList.remove("on");
      body.innerHTML = `
        <p class="muted small" style="margin:0 0 8px">Följer jag min strategi? <a href="#" id="q-edit">Ändra punkter</a></p>
        ${checklistHtml(cl.entry, answers)}
        <div class="qfoot"><span id="q-progress" class="muted small"></span><span style="flex:1"></span><button class="btn" id="q-cancel">Avbryt</button><button class="btn primary" id="q-next">Fortsätt</button></div>`;
      const upd = () => {
        const all = body.querySelectorAll("[data-rule]").length, done = body.querySelectorAll("[data-rule]:checked").length;
        body.querySelector("#q-progress").innerHTML = all ? (done === all ? '<span class="pos">Enligt strategin ✓</span>' : `${done} av ${all} · <span class="neg">regelbrott</span>`) : "";
        body.querySelector("#q-next").textContent = all && done < all ? "Fortsätt ändå" : "Fortsätt";
      };
      body.querySelectorAll("[data-rule]").forEach((c) => c.addEventListener("change", () => (answers.set(Number(c.dataset.rule), c.checked), upd())));
      upd();
      body.querySelector("#q-edit").addEventListener("click", (e) => (e.preventDefault(), App.checklistEditor("entry", () => App.quickTrade(prefill))));
      body.querySelector("#q-cancel").addEventListener("click", App.closeModal);
      body.querySelector("#q-next").addEventListener("click", () => {
        cl.entry.forEach((r) => !answers.has(r.id) && answers.set(r.id, false));
        step2();
      });
    };

    const step2 = () => {
      m.querySelector("#q2").classList.add("on");
      let side = p.side || "LONG";
      body.innerHTML = `
        <div class="seg big" id="q-side"><button type="button" data-side="LONG" class="${side === "LONG" ? "active long" : ""}">Long</button><button type="button" data-side="SHORT" class="${side === "SHORT" ? "active short" : ""}">Short</button></div>
        <div class="form-grid" style="margin-top:12px">
          <div class="field"><label>SOL-pris vid start <span class="hint">Entry Price</span></label><input id="q-price" type="number" step="any" min="0" inputmode="decimal" value="${p.entry ?? ""}" placeholder="104.47" /></div>
          <div class="field"><label>Stopp (linjen)</label><input id="q-stop" type="number" step="any" min="0" inputmode="decimal" placeholder="92.00" /></div>
          <div class="field"><label>Investering (${esc(s.currency)}) <span class="hint">Total Investment</span></label><input id="q-inv" type="number" step="any" min="0" inputmode="decimal" placeholder="200" /></div>
          <div class="field"><label>Hävstång <span class="hint">Long 10x</span></label><input id="q-lev" type="number" step="any" min="1" inputmode="decimal" value="${localStorage.getItem("tz.lev") || s.maxLeverage || 10}" /></div>
          <div class="field full"><label>Starttid <span class="hint">Start-up time – ändra om du loggar i efterhand</span></label><input id="q-time" type="datetime-local" value="${App.toLocalInput(p.opened_at || Date.now())}" /></div>
        </div>
        <div class="qsummary muted small" id="q-summary"></div>
        <div class="qfoot"><button class="btn" id="q-back">‹ Tillbaka</button><span style="flex:1"></span><button class="btn primary" id="q-save">Logga traden</button></div>`;
      body.querySelector("#q-side").addEventListener("click", (e) => {
        const b = e.target.closest("button[data-side]");
        if (!b) return;
        side = b.dataset.side;
        body.querySelectorAll("#q-side button").forEach((x) => (x.className = x.dataset.side === side ? `active ${side.toLowerCase()}` : ""));
        summary();
      });
      const summary = () => {
        const price = num(body.querySelector("#q-price")), inv = num(body.querySelector("#q-inv")), lev = num(body.querySelector("#q-lev")) || 1, stop = num(body.querySelector("#q-stop"));
        const el = body.querySelector("#q-summary");
        if (!price || !inv) return (el.innerHTML = "");
        const b = App.botSetup({ side, startPrice: price, investment: inv, leverage: lev, stop });
        const acc = App.state.equity || s.startBalance;
        el.innerHTML = `Exponering <b>${fmt.money(b.notional, 0)}</b>${stop ? ` · om stoppet träffas ≈ <b class="neg">${fmt.money(b.lossAtStop, 0)}</b> (${fmt.num((b.lossAtStop / acc) * 100, 1)} % av kontot)` : ""}${lev > (s.maxLeverage || 10) ? ` · <span class="warn-badge">över ${s.maxLeverage}×</span>` : ""}`;
      };
      body.addEventListener("input", summary);
      body.querySelector("#q-back").addEventListener("click", step1);
      body.querySelector("#q-save").addEventListener("click", async () => {
        const price = num(body.querySelector("#q-price")), inv = num(body.querySelector("#q-inv")), lev = num(body.querySelector("#q-lev")) || 1;
        if (!price || !inv) return App.toast("Fyll i SOL-pris och investering", true);
        try {
          localStorage.setItem("tz.lev", String(lev));
          const r = await App.post("/api/trades", { kind: "grid", symbol: s.defaultSymbol, side, entry: price, opened_at: App.fromLocalInput(body.querySelector("#q-time").value) || p.opened_at || Date.now(), stop: num(body.querySelector("#q-stop")), strategy_id: st.id, grid: { investment: inv, leverage: lev }, rules: [...answers].map(([rule_id, followed]) => ({ rule_id, followed })) });
          App.closeModal();
          App.toast("Traden loggad");
          await App.refreshMeta();
          App.navigate(`#/trade/${r.id}`);
        } catch (err) {
          App.toast(err.message, true);
        }
      });
      body.querySelector("#q-price").focus();
    };
    step1();
  };

  // ---------------------------------------------------------------- Stoppa bot
  App.quickClose = async (t, reason = "stop") => {
    const cl = t.strategy_id ? await App.api(`/api/strategies/${t.strategy_id}/checklists`) : { entry: [], exit: [] };
    const answers = new Map();
    const g = t.grid || {};
    let cur = reason;
    const m = App.modal(`<div class="qhead"><h3>Stoppa boten</h3><span class="qsteps"><b id="q1" class="on">1 Varför</b> › <b id="q2">2 Resultat</b></span></div><div id="q-body"></div>`, { narrow: true });
    const body = m.querySelector("#q-body");

    const step1 = () => {
      m.querySelector("#q2").classList.remove("on");
      body.innerHTML = `
        <div class="reason-grid">
          <button type="button" class="reason ${cur === "stop" ? "on" : ""}" data-reason="stop">🛑 Stoppen träffades</button>
          <button type="button" class="reason ${cur === "flip" ? "on" : ""}" data-reason="flip">🔁 Trenden vände</button>
          <button type="button" class="reason ${cur === "manual" ? "on" : ""}" data-reason="manual">✋ Manuellt</button>
        </div>
        <div id="q-warn" class="insight weakness hidden" style="margin-top:8px">⚠️ Utanför strategin – loggas som regelbrott.</div>
        <p class="muted small" style="margin:12px 0 6px">Stänger jag av rätt skäl? <a href="#" id="q-edit">Ändra punkter</a></p>
        ${checklistHtml(cl.exit, answers)}
        <div class="qfoot"><button class="btn" id="q-cancel">Avbryt</button><span style="flex:1"></span><button class="btn primary" id="q-next">Fortsätt</button></div>`;
      const upd = () => body.querySelector("#q-warn").classList.toggle("hidden", cur !== "manual");
      body.querySelectorAll("[data-reason]").forEach((b) =>
        b.addEventListener("click", () => {
          cur = b.dataset.reason;
          body.querySelectorAll("[data-reason]").forEach((x) => x.classList.toggle("on", x.dataset.reason === cur));
          upd();
        }),
      );
      body.querySelectorAll("[data-rule]").forEach((c) => c.addEventListener("change", () => answers.set(Number(c.dataset.rule), c.checked)));
      upd();
      body.querySelector("#q-edit").addEventListener("click", (e) => (e.preventDefault(), App.checklistEditor("exit", () => App.quickClose(t, cur))));
      body.querySelector("#q-cancel").addEventListener("click", App.closeModal);
      body.querySelector("#q-next").addEventListener("click", () => {
        cl.exit.forEach((r) => !answers.has(r.id) && answers.set(r.id, false));
        step2();
      });
    };

    const step2 = () => {
      m.querySelector("#q2").classList.add("on");
      let rating = 0;
      body.innerHTML = `
        <div class="form-grid">
          <div class="field"><label>Botens P&L (${esc(App.state.settings.currency || "USDT")}) <span class="hint">P&L på Bybits Details-sida</span></label><input id="q-total" type="number" step="any" inputmode="decimal" value="${g.totalPnl ?? ""}" placeholder="+76.87" /></div>
          <div class="field"><label>SOL-pris vid stopp <span class="hint">(valfritt)</span></label><input id="q-price" type="number" step="any" min="0" inputmode="decimal" placeholder="valfritt" /></div>
          <div class="field"><label>Hur skötte jag traden?</label><div id="q-stars" class="stars input" style="font-size:24px">${[1, 2, 3, 4, 5].map((i) => `<span data-star="${i}" class="off">★</span>`).join("")}</div></div>
          <div class="field"><label>Lärdom <span class="hint">(valfritt)</span></label><input id="q-lesson" placeholder="en mening räcker" /></div>
        </div>
        <details class="qmore" style="margin-top:8px"><summary class="muted small" style="cursor:pointer">Mer från Bybit (valfritt)</summary>
          <div class="form-grid" style="margin-top:8px">
            <div class="field"><label>Grid Profit (USDT)</label><input id="q-gridprofit" type="number" step="any" inputmode="decimal" value="${g.gridProfit ?? ""}" placeholder="21.67" /></div>
            <div class="field"><label>Profitable Trades</label><input id="q-gridtrades" type="number" step="1" min="0" inputmode="numeric" value="${g.gridTrades ?? ""}" placeholder="72" /></div>
            <div class="field full"><label>Sluttid <span class="hint">End time</span></label><input id="q-time" type="datetime-local" value="${App.toLocalInput(Date.now())}" /></div>
          </div>
        </details>
        <div class="qsummary muted small" id="q-summary"></div>
        <div class="qfoot"><button class="btn" id="q-back">‹ Tillbaka</button><span style="flex:1"></span><button class="btn primary" id="q-save">${cur === "flip" ? "Stäng och starta ny bot" : "Stoppa boten"}</button></div>`;
      const summary = () => {
        const pnl = num(body.querySelector("#q-total"));
        const end = App.fromLocalInput(body.querySelector("#q-time").value) || Date.now();
        body.querySelector("#q-summary").innerHTML = pnl === null ? "" : `Resultat <b class="${App.cls(pnl)}">${fmt.signedMoney(pnl)}</b>${g.investment ? ` · ROI <b class="${App.cls(pnl)}">${fmt.pct((pnl / g.investment) * 100, 1)}</b>` : ""} · körtid ${fmt.dur(end - t.opened_at)}`;
      };
      body.addEventListener("input", summary);
      body.querySelector("#q-stars").addEventListener("click", (e) => {
        const st = e.target.closest("[data-star]");
        if (!st) return;
        rating = Number(st.dataset.star) === rating ? 0 : Number(st.dataset.star);
        body.querySelectorAll("#q-stars [data-star]").forEach((x) => x.classList.toggle("off", Number(x.dataset.star) > rating));
      });
      body.querySelector("#q-back").addEventListener("click", step1);
      body.querySelector("#q-save").addEventListener("click", async () => {
        const price = num(body.querySelector("#q-price")), total = num(body.querySelector("#q-total"));
        if (total === null) return App.toast("Fyll i botens P&L från Bybit", true);
        const closedAt = App.fromLocalInput(body.querySelector("#q-time").value) || Date.now();
        if (closedAt < t.opened_at) return App.toast("Sluttiden är före starttiden", true);
        try {
          if (answers.size) await App.patch(`/api/trades/${t.id}/rules`, { merge: true, rules: [...answers].map(([rule_id, followed]) => ({ rule_id, followed })) });
          await App.post(`/api/trades/${t.id}/close`, { exit: price || null, closed_at: closedAt, exit_reason: cur, fees: 0, totalPnl: total, gridProfit: num(body.querySelector("#q-gridprofit")), gridTrades: num(body.querySelector("#q-gridtrades")), rating: rating || null, lesson: body.querySelector("#q-lesson").value });
          App.closeModal();
          App.toast("Boten stoppad");
          await App.refreshMeta();
          if (cur === "flip") App.quickTrade({ side: t.side === "LONG" ? "SHORT" : "LONG", entry: price });
          else App.render();
        } catch (err) {
          App.toast(err.message, true);
        }
      });
      body.querySelector("#q-total").focus();
    };
    step1();
  };

  // ---------------------------------------------------------------- Missad signal (regel 6: varje signal tas)
  App.quickMissed = () => {
    const st = strategy();
    if (!st) return App.toast("Ingen strategi finns", true);
    let side = "LONG";
    const m = App.modal(
      `<h3>Missade en signal</h3><p class="muted small" style="margin:0 0 10px">Regeln säger att varje signal tas. Logga den du missade så syns det i statistiken.</p>
      <div class="seg big" id="ms-side"><button type="button" data-side="LONG" class="active long">Long</button><button type="button" data-side="SHORT">Short</button></div>
      <div class="form-grid" style="margin-top:12px">
        <div class="field"><label>SOL-pris vid signalen</label><input id="ms-price" type="number" step="any" inputmode="decimal" placeholder="105.20" /></div>
        <div class="field"><label>Varför missade jag den?</label><input id="ms-why" placeholder="t.ex. var inte vid skärmen" /></div>
      </div>
      <div class="form-actions"><button class="btn" id="ms-cancel">Avbryt</button><button class="btn primary" id="ms-ok">Logga missad signal</button></div>`,
      { narrow: true },
    );
    m.querySelector("#ms-side").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-side]");
      if (!b) return;
      side = b.dataset.side;
      m.querySelectorAll("#ms-side button").forEach((x) => (x.className = x.dataset.side === side ? `active ${side.toLowerCase()}` : ""));
    });
    m.querySelector("#ms-cancel").addEventListener("click", App.closeModal);
    m.querySelector("#ms-ok").addEventListener("click", async () => {
      try {
        await App.post(`/api/strategies/${st.id}/missed`, { symbol: App.state.settings.defaultSymbol, side, time: Date.now(), price: num(m.querySelector("#ms-price")), notes: m.querySelector("#ms-why").value });
        App.closeModal();
        App.toast("Missad signal loggad");
        App.render();
      } catch (err) {
        App.toast(err.message, true);
      }
    });
    m.querySelector("#ms-price").focus();
  };

  // ---------------------------------------------------------------- Uppdatera resultat medan boten kör
  App.quickProgress = (t) => {
    const m = App.modal(
      `<h3>Botens resultat just nu</h3><div class="field"><label>Från Bybit (${esc(App.state.settings.currency)})</label><input id="gp" type="number" step="any" value="${t.grid?.totalPnl ?? ""}" placeholder="+ eller −" /></div>
      <div class="form-actions"><button class="btn" id="gp-cancel">Avbryt</button><button class="btn primary" id="gp-ok">Spara</button></div>`,
      { narrow: true },
    );
    m.querySelector("#gp").focus();
    m.querySelector("#gp-cancel").addEventListener("click", App.closeModal);
    m.querySelector("#gp-ok").addEventListener("click", async () => {
      await App.post(`/api/trades/${t.id}/grid-progress`, { totalPnl: num(m.querySelector("#gp")) });
      App.closeModal();
      App.render();
    });
  };

  // ---------------------------------------------------------------- Redigera (enkelt)
  App.quickEdit = (t) => {
    const g = t.grid || { investment: t.qty, leverage: 1 };
    const closed = t.exit !== null;
    let side = t.side;
    const m = App.modal(
      `<h3>Redigera trade</h3>
      <div class="seg big" id="e-side"><button type="button" data-side="LONG" class="${side === "LONG" ? "active long" : ""}">Long</button><button type="button" data-side="SHORT" class="${side === "SHORT" ? "active short" : ""}">Short</button></div>
      <div class="form-grid" style="margin-top:12px">
        <div class="field"><label>SOL-pris vid start</label><input id="e-entry" type="number" step="any" value="${t.entry}" /></div>
        <div class="field"><label>Stopp (linjen)</label><input id="e-stop" type="number" step="any" value="${t.stop ?? ""}" /></div>
        <div class="field"><label>Investering</label><input id="e-inv" type="number" step="any" value="${g.investment}" /></div>
        <div class="field"><label>Hävstång</label><input id="e-lev" type="number" step="any" value="${g.leverage}" /></div>
        <div class="field"><label>Startad</label><input id="e-open" type="datetime-local" value="${App.toLocalInput(t.opened_at)}" /></div>
        ${closed ? `<div class="field"><label>Stoppad</label><input id="e-close" type="datetime-local" value="${App.toLocalInput(t.closed_at)}" /></div>
        <div class="field"><label>SOL-pris vid stopp</label><input id="e-exit" type="number" step="any" value="${t.exit}" /></div>
        <div class="field"><label>Botens resultat</label><input id="e-total" type="number" step="any" value="${g.totalPnl ?? ""}" /></div>
        <div class="field full"><label>Varför stängde du?</label><select id="e-reason">${Object.entries(App.EXIT_LABEL).map(([k, v]) => `<option value="${k}" ${t.exit_reason === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>` : ""}
        <div class="field full"><label>Anteckning</label><textarea id="e-notes" style="min-height:60px">${esc(t.notes)}</textarea></div>
      </div>
      <div class="form-actions"><button class="btn" id="e-cancel">Avbryt</button><button class="btn primary" id="e-save">Spara</button></div>`,
      { narrow: true },
    );
    m.querySelector("#e-side").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-side]");
      if (!b) return;
      side = b.dataset.side;
      m.querySelectorAll("#e-side button").forEach((x) => (x.className = x.dataset.side === side ? `active ${side.toLowerCase()}` : ""));
    });
    m.querySelector("#e-cancel").addEventListener("click", App.closeModal);
    m.querySelector("#e-save").addEventListener("click", async () => {
      const q = (id) => num(m.querySelector(id));
      try {
        await App.put(`/api/trades/${t.id}`, {
          kind: "grid",
          symbol: t.symbol,
          side,
          entry: q("#e-entry"),
          qty: q("#e-inv"),
          opened_at: App.fromLocalInput(m.querySelector("#e-open").value) || t.opened_at,
          closed_at: closed ? App.fromLocalInput(m.querySelector("#e-close").value) || t.closed_at : null,
          exit: closed ? q("#e-exit") : null,
          exit_reason: closed ? m.querySelector("#e-reason").value : null,
          stop: q("#e-stop"),
          trail_stop: t.trail_stop,
          fees: t.fees,
          strategy_id: t.strategy_id,
          rating: t.rating,
          notes: m.querySelector("#e-notes").value,
          pnl_override: false,
          grid: { investment: q("#e-inv"), leverage: q("#e-lev") || 1, totalPnl: closed ? q("#e-total") : (t.grid?.totalPnl ?? null), gridTrades: t.grid?.gridTrades ?? null, botName: t.grid?.botName ?? "" },
          tag_ids: (t.tags || []).map((x) => x.id),
          rules: (t.rules || []).map((r) => ({ rule_id: r.rule_id, followed: Boolean(r.followed) })),
        });
        App.closeModal();
        App.toast("Sparat");
        await App.refreshMeta();
        App.render();
      } catch (err) {
        App.toast(err.message, true);
      }
    });
  };
})();
