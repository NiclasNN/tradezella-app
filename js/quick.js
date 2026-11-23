/* Loggningen: checklista → boten (→ avslut) och skäl → resultat. Byggt för att gå fort och kännas bra:
   stora bockbara kort, skärmbild från Bybit fyller i siffrorna, levande botkort och en belöning när boten stoppas. */
(() => {
  "use strict";
  const App = window.App;
  const { fmt, esc } = App;
  const I = (name, size) => App.icon(name, size);
  App.EXIT_LABEL = { stop: "Stoppen träffades", flip: "Trenden vände", target: "Vinstmål", manual: "Manuellt", other: "Annat" };

  const strategy = () => (App.state.strategies || [])[0] || null;
  const numOf = (v) => (v === "" || v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const num = (el) => (el ? numOf(el.value) : null);
  const cur = () => App.state.settings.currency || "USDT";

  // ================================================================ byggstenar

  /** Modal med rubrik, stegindikator, framstegslinje och en kropp som byts per steg. */
  function flow(title, opts = {}) {
    const m = App.modal(
      `<div class="flow-head"><div><h3 id="f-title">${esc(title)}</h3><div class="flow-steps" id="f-steps"></div></div><button type="button" class="flow-x" id="f-x" aria-label="Stäng">${I("x", 18)}</button></div>
      <div class="flow-bar"><span id="f-bar"></span></div>
      <div class="flow-body" id="f-body"></div>`,
      { narrow: !opts.wide },
    );
    m.classList.add("flow");
    if (opts.wide) m.classList.add("wide");
    m.setAttribute("tabindex", "-1");
    m.querySelector("#f-x").addEventListener("click", App.closeModal);
    const F = {
      m,
      body: m.querySelector("#f-body"),
      steps(labels, i) {
        m.querySelector("#f-steps").innerHTML = labels.map((l, k) => `<span class="fs ${k < i ? "done" : k === i ? "on" : ""}"><i>${k < i ? I("check", 11) : k + 1}</i>${esc(l)}</span>`).join("");
        m.querySelector("#f-bar").style.width = labels.length ? `${((i + 0.5) / labels.length) * 100}%` : "100%";
      },
      finish(title) {
        m.querySelector("#f-steps").innerHTML = "";
        m.querySelector("#f-bar").style.width = "100%";
        if (title) m.querySelector("#f-title").textContent = title;
      },
      show(html) {
        F.body.innerHTML = `<div class="step">${html}</div>`;
        return F.body.firstElementChild;
      },
    };
    // Klick på kort/knappar i formuläret: lämna fokus på modalen så att Enter alltid betyder "fortsätt".
    const PICK = ".check, .reason-card, .side-toggle button, .star";
    m.addEventListener("click", (e) => {
      if (e.detail > 0 && e.target.closest(PICK)) m.focus({ preventScroll: true });
    });
    // Enter = huvudknappen, 1–9 = bocka punkt (mellanslag bockar punkten som har fokus)
    m.addEventListener("keydown", (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (e.key === "Enter" && t.tagName !== "TEXTAREA" && (!t.closest("button, a, summary") || t.closest(PICK))) {
        const p = m.querySelector(".flow-foot .primary:not([disabled])");
        if (p) {
          e.preventDefault();
          p.click();
        }
        return;
      }
      if (/^[1-9]$/.test(e.key) && !t.closest("input, textarea, select")) {
        const c = m.querySelectorAll(".check")[Number(e.key) - 1];
        if (c) {
          e.preventDefault();
          c.click();
        }
      }
    });
    return F;
  }

  /** Checklistan som stora bockbara kort med mätare. answers: Map(rule_id → bool). */
  function checklist(host, items, answers, onChange, opts = {}) {
    if (!items.length) {
      host.innerHTML = `<div class="muted small" style="padding:6px 0">Inga punkter ännu – klicka "Ändra punkter".</div>`;
      onChange(0, 0);
      return;
    }
    const off = opts.offset || 0;
    host.innerHTML = `<div class="checks ${opts.compact ? "compact" : ""}">${items
      .map((r, i) => `<button type="button" class="check ${answers.get(r.id) ? "on" : ""}" data-rule="${r.id}" aria-pressed="${answers.get(r.id) ? "true" : "false"}"><span class="cbox">${I("check", 15)}</span><span class="ctext">${esc(r.text)}</span>${i + off < 9 ? `<kbd>${i + off + 1}</kbd>` : ""}</button>`)
      .join("")}</div>
      <div class="cmeter"><div class="meter"><span class="cm-fill"></span></div><span class="cm-text"></span></div>
      <div class="cm-note"></div>`;
    const upd = () => {
      const all = items.length;
      const done = items.filter((r) => answers.get(r.id)).length;
      const full = done === all;
      host.querySelector(".cm-fill").style.width = `${(done / all) * 100}%`;
      host.querySelector(".cmeter").classList.toggle("full", full);
      host.querySelector(".cm-text").innerHTML = full ? `${I("check", 14)} ${esc(opts.fullText || "Allt enligt planen")}` : done ? `${done} av ${all}` : esc(opts.emptyText || "Bocka av punkterna");
      host.querySelector(".cm-note").textContent = full || opts.compact ? "" : "Obockade punkter sparas som regelbrott.";
      onChange(done, all);
    };
    host.querySelectorAll(".check").forEach((b) =>
      b.addEventListener("click", () => {
        const id = Number(b.dataset.rule);
        const v = !answers.get(id);
        answers.set(id, v);
        b.classList.toggle("on", v);
        b.setAttribute("aria-pressed", String(v));
        b.classList.remove("pop");
        void b.offsetWidth;
        if (v) b.classList.add("pop");
        upd();
      }),
    );
    upd();
  }

  /** Ytan där skärmbilden klistras in / släpps / väljs. zs = { status, imp, error } */
  function importZone(host, zs, onFile) {
    if (!host) return;
    if (!App.canImportScreens()) {
      host.innerHTML = "";
      return;
    }
    const b = zs.imp && zs.imp.bot;
    const ok = b && !zs.status;
    const inner =
      zs.status === "reading"
        ? `<span class="spinner"></span><div class="iz-text"><b>Läser skärmbilden…</b><span>Det tar ett par sekunder</span></div>`
        : zs.status === "error"
          ? `<div class="iz-ico">${I("alert", 22)}</div><div class="iz-text"><b>${esc(zs.error)}</b><span>Prova en annan bild – eller skriv in siffrorna själv.</span></div>`
          : ok
            ? `<div class="iz-ico">${I("check", 22)}</div><div class="iz-text"><b>Ifyllt från skärmbilden</b><span>${esc(App.importSummary(b))}</span></div><span class="iz-change">Byt bild</span>`
            : `<div class="iz-ico">${I("paste", 22)}</div><div class="iz-text"><b>Klistra in skärmbild från Bybit</b><span>Tryck <kbd>⌘V</kbd>, dra hit bilden eller klicka – så fyller jag i siffrorna.</span></div>`;
    host.innerHTML = `<div class="import-zone ${zs.status || ""} ${ok ? "ok" : ""}" role="button" tabindex="0">${inner}<input type="file" accept="image/*" hidden /></div>`;
    const z = host.firstElementChild;
    const input = z.querySelector("input");
    z.addEventListener("click", (e) => e.target !== input && input.click());
    z.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input.click();
      }
    });
    input.addEventListener("change", () => input.files[0] && onFile(input.files[0]));
  }
  const importChip = (zs) =>
    zs.status === "reading"
      ? `<div class="imp-chip"><span class="spinner"></span> Läser skärmbilden…</div>`
      : zs.status === "error"
        ? `<div class="imp-chip err">${I("alert", 15)} ${esc(zs.error)}</div>`
        : zs.imp
          ? `<div class="imp-chip ok">${I("image", 15)} Skärmbild inläst: ${esc(App.importSummary(zs.imp.bot))}</div>`
          : "";

  /** Läs en skärmbild in i ett flöde; apply(imp) fyller i värdena, render() ritar om steget. */
  function screenshotReader(zs, apply, render) {
    return async (file) => {
      zs.status = "reading";
      zs.error = null;
      render();
      try {
        const imp = await App.readBybitScreenshot(file);
        if (!imp.bot.found.length) throw new Error("Hittade inga siffror i bilden");
        zs.status = null;
        apply(imp);
      } catch (err) {
        zs.status = "error";
        zs.error = err.message;
      }
      render();
    };
  }

  const sideToggle = (side) =>
    `<div class="side-toggle" id="q-side"><button type="button" data-side="LONG" class="${side === "LONG" ? "on" : ""}">${I("up", 18)} Long</button><button type="button" data-side="SHORT" class="${side === "SHORT" ? "on" : ""}">${I("down", 18)} Short</button></div>`;

  /** Förhandsvisning av boten medan man fyller i: exponering, stoppavstånd och risk mot riskregeln. */
  function botCard(o) {
    const s = App.state.settings;
    if (!o.entry || !o.inv) return `<div class="bot-card empty">${I("zap", 18)}<span>Fyll i pris och investering så ser du boten här.</span></div>`;
    const b = App.botSetup({ side: o.side, startPrice: o.entry, investment: o.inv, leverage: o.lev || 1, stop: o.stop });
    const acc = App.state.equity || s.startBalance || 1;
    const rule = s.riskPerTradePct || 1;
    let risk = "";
    if (o.stop && b.lossAtStop !== null) {
      const pct = (b.lossAtStop / acc) * 100;
      const max = Math.max(rule * 3, pct * 1.15);
      const lvl = pct <= rule ? "ok" : pct <= rule * 2 ? "warn" : "high";
      risk = `<div class="bc-risk ${lvl}">
        <div class="bc-line"><span>Om stoppet träffas</span><b>≈ ${fmt.signedMoney(-b.lossAtStop, 0)} · ${fmt.pct(pct, 1)} av kontot</b></div>
        <div class="meter"><span style="width:${Math.min(100, (pct / max) * 100)}%"></span><i style="left:${(rule / max) * 100}%" title="Din riskregel"></i></div>
        <div class="bc-note">${lvl === "ok" ? `Inom din riskregel på ${fmt.pct(rule, 1)} av kontot` : `Över din riskregel på ${fmt.pct(rule, 1)} av kontot`}</div>
      </div>`;
    } else risk = `<div class="bc-note">Fyll i stoppet (linjens värde) så räknar jag risken.</div>`;
    const levWarn = (o.lev || 1) > (s.maxLeverage || 10) ? `<div class="bc-note warn">${I("alert", 14)} Över ditt hävstångstak på ${fmt.num(s.maxLeverage, 0)}x</div>` : "";
    return `<div class="bot-card ${o.side === "SHORT" ? "short" : "long"}">
      <div class="bc-top"><span class="pill ${o.side === "SHORT" ? "short" : "long"}">${o.side}</span><b>${esc(o.symbol)}</b><span class="muted">${fmt.num(o.lev || 1, 0)}x</span><span class="grow"></span><b class="bc-inv">${fmt.money(o.inv, 0)}</b></div>
      <div class="bc-grid"><div><span>Start</span><b>${fmt.price(o.entry)}</b></div><div><span>Exponering</span><b>${fmt.money(b.notional, 0)}</b></div><div><span>Stopp</span><b>${o.stop ? fmt.price(o.stop) + (b.stopDistPct !== null ? ` <small>${fmt.pct(b.stopDistPct, 1)}</small>` : "") : "–"}</b></div></div>
      ${risk}${levWarn}
    </div>`;
  }

  const STAR_WORDS = ["Hur skötte du traden?", "Dåligt", "Svagt", "Okej", "Bra", "Perfekt"];
  function stars(host, st) {
    host.innerHTML = `<div class="star-row">${[1, 2, 3, 4, 5].map((i) => `<button type="button" class="star ${i <= st.rating ? "on" : ""}" data-star="${i}" aria-label="${i} av 5">${I("star", 26)}</button>`).join("")}<span class="star-word">${STAR_WORDS[st.rating]}</span></div>`;
    const word = host.querySelector(".star-word");
    const paint = (n) => host.querySelectorAll(".star").forEach((b) => b.classList.toggle("on", Number(b.dataset.star) <= n));
    host.querySelectorAll(".star").forEach((b) => {
      b.addEventListener("mouseenter", () => {
        paint(Number(b.dataset.star));
        word.textContent = STAR_WORDS[b.dataset.star];
      });
      b.addEventListener("click", () => {
        st.rating = Number(b.dataset.star) === st.rating ? 0 : Number(b.dataset.star);
        paint(st.rating);
        word.textContent = STAR_WORDS[st.rating];
        b.classList.remove("pop");
        void b.offsetWidth;
        b.classList.add("pop");
      });
    });
    host.querySelector(".star-row").addEventListener("mouseleave", () => {
      paint(st.rating);
      word.textContent = STAR_WORDS[st.rating];
    });
  }

  const REASONS = [
    { k: "stop", icon: "stop", title: "Stoppen träffades", sub: "enligt planen" },
    { k: "flip", icon: "flip", title: "Trenden vände", sub: "enligt planen – vänd" },
    { k: "manual", icon: "pause", title: "Manuellt", sub: "utanför planen" },
  ];
  function reasons(host, st, onChange) {
    host.innerHTML = `<div class="reasons">${REASONS.map((r) => `<button type="button" class="reason-card ${r.k} ${st.reason === r.k ? "on" : ""}" data-reason="${r.k}">${I(r.icon, 22)}<b>${r.title}</b><small>${r.sub}</small></button>`).join("")}</div>
      <div class="reason-warn ${st.reason === "manual" ? "" : "hidden"}">${I("alert", 16)}<span>Att stänga manuellt är utanför planen och sparas som regelbrott. Skriv gärna varför som lärdom.</span></div>`;
    host.querySelectorAll(".reason-card").forEach((b) =>
      b.addEventListener("click", () => {
        st.reason = b.dataset.reason;
        host.querySelectorAll(".reason-card").forEach((x) => x.classList.toggle("on", x === b));
        host.querySelector(".reason-warn").classList.toggle("hidden", st.reason !== "manual");
        if (onChange) onChange();
      }),
    );
  }

  const paintPnl = (input) => {
    const v = numOf(input.value);
    input.classList.toggle("pos", v !== null && v > 0);
    input.classList.toggle("neg", v !== null && v < 0);
  };

  /** Siffror före/efter en stängning (för milstolpar och serien). */
  async function journalStats() {
    const r = await App.api("/api/trades");
    const closed = r.trades.filter((t) => t.derived && t.derived.pnl !== null);
    return { closed: r.summary.closed, wins: r.summary.wins, net: r.summary.netPnl, streak: r.summary.disciplineStreak, best: closed.length ? Math.max(...closed.map((t) => t.derived.pnl)) : null };
  }
  function milestonesFor(before, after, pnl) {
    const out = [];
    if (!before) return out;
    if (after.closed === 1 && before.closed === 0) out.push("första avslutade boten i journalen");
    else if ([5, 10, 25, 50, 100].includes(after.closed) && after.closed > before.closed) out.push(`${after.closed} avslutade bottar`);
    if (pnl > 0 && before.wins === 0 && before.closed > 0) out.push("första vinsten");
    else if (pnl > 0 && before.best !== null && before.best > 0 && pnl > before.best) out.push("största vinsten hittills");
    if (after.streak > before.streak && [3, 5, 10, 20, 50].includes(after.streak)) out.push(`${after.streak} trades i rad enligt planen`);
    return out.slice(0, 2);
  }

  // ================================================================ klart-vyer

  /** Efter en ny (pågående) bot: bock, kortet och en påminnelse om planen. */
  async function showStarted(F, id, entryAns) {
    const t = (await App.api(`/api/trades/${id}`)).trade;
    const g = t.grid || {};
    const broken = [...entryAns.values()].filter((v) => !v).length;
    F.finish("Klart!");
    const el = F.show(`
      <div class="success">
        <div class="success-mark">${App.drawCheck()}</div>
        <h4>Boten är loggad</h4>
        <div class="success-card"><span class="pill ${t.side === "SHORT" ? "short" : "long"}">${t.side}</span> <b>${esc(t.symbol)}</b> · ${fmt.num(g.leverage || 1, 0)}x · ${fmt.money(g.investment, 0)} · start ${fmt.price(t.entry)}</div>
        <div>${broken ? `<span class="badge warn">${I("alert", 15)} ${broken} ${broken > 1 ? "punkter" : "punkt"} obockad – sparas som regelbrott</span>` : `<span class="badge ok">${I("shield", 15)} Enligt planen</span>`}</div>
        <div class="plan-remind">
          <div class="pr-title">Nu gör boten jobbet. Stoppa den bara när</div>
          <div class="pr-row">${I("stop", 18)} stoppen träffas</div>
          <div class="pr-row">${I("flip", 18)} trenden vänder – då vänder du</div>
        </div>
      </div>
      <div class="flow-foot"><button class="btn" id="s-view">Visa traden</button><span class="grow"></span><button class="btn primary big" id="s-done">Klar ${I("check", 16)}</button></div>`);
    App.onModalClose(() => App.render());
    el.querySelector("#s-done").addEventListener("click", App.closeModal);
    el.querySelector("#s-view").addEventListener("click", () => {
      App.onModalClose(null);
      App.closeModal();
      App.navigate(`#/trade/${id}`);
    });
    el.querySelector("#s-done").focus();
    setTimeout(() => App.sparksAt(el.querySelector(".success-mark")), 420);
  }

  /** Efter en stängd bot: resultatet räknas upp, planen bedöms, serien och milstolpar – och fest om du följde planen. */
  async function showResult(F, id, before, { flipPrice = null } = {}) {
    const [data, after] = await Promise.all([App.api(`/api/trades/${id}`), journalStats()]);
    const t = data.trade;
    const d = t.derived;
    const g = t.grid || {};
    const pnl = d.pnl ?? 0;
    const win = pnl > 0;
    const planReason = t.exit_reason === "stop" || t.exit_reason === "flip";
    const entryOk = d.entryFollowPct === null || d.entryFollowPct >= 100;
    const exitOk = d.exitFollowPct === null || d.exitFollowPct >= 100;
    const planOk = planReason && entryOk && exitOk;
    const broken = [!planReason && "stängd manuellt", !entryOk && "checklistan innan", !exitOk && "checklistan vid stängning"].filter(Boolean);
    const msg = planOk
      ? win
        ? "Snyggt! Du följde planen och lät vinnaren löpa."
        : "Förlust enligt planen. Stoppen gjorde sitt jobb – det är så strategin vinner över tid."
      : win
        ? "Vinst – men utanför planen. Skriv en lärdom så att nästa trade följer reglerna."
        : "Utanför planen den här gången. Lärdomen är värd mer än resultatet.";
    const balance = (App.state.settings.startBalance || 0) + after.net;
    const ms = milestonesFor(before, after, pnl);
    const next = t.exit_reason === "flip" ? (t.side === "LONG" ? "SHORT" : "LONG") : null;
    F.finish(win ? "Vinst!" : "Boten är stoppad");
    const el = F.show(`
      <div class="result ${win ? "win" : pnl < 0 ? "loss" : "flat"}">
        <div class="res-label">${win ? "Vinst" : pnl < 0 ? "Förlust" : "Plus minus noll"}</div>
        <div class="res-num tabular" id="res-num">${fmt.signedMoney(0)}</div>
        <div class="res-chips">
          ${d.returnPct !== null ? `<span class="chip">${I(win ? "up" : "down", 14)} ROI ${fmt.pct(d.returnPct, 1)}</span>` : ""}
          ${d.durationMs !== null ? `<span class="chip">${I("clock", 14)} ${fmt.dur(d.durationMs)}</span>` : ""}
          ${g.gridProfit !== null && g.gridProfit !== undefined ? `<span class="chip">Grid Profit ${fmt.signed(g.gridProfit)}</span>` : ""}
          ${g.gridTrades ? `<span class="chip">${fmt.num(g.gridTrades, 0)} grid-trades</span>` : ""}
        </div>
        <div><span class="badge ${planOk ? "ok" : "warn"}" id="res-badge">${I(planOk ? "shield" : "alert", 15)} ${planOk ? "Enligt planen" : "Utanför planen: " + esc(broken.join(", "))}</span></div>
        <p class="res-msg">${msg}</p>
        <div class="res-stats">
          <div><span>Kontot</span><b class="tabular">${fmt.money(balance, 2)}</b><small class="${App.cls(pnl)}">${fmt.signedMoney(pnl)}</small></div>
          <div><span>Disciplin i rad</span><b class="tabular" id="res-streak">${before ? before.streak : after.streak}</b><small>trades enligt planen</small></div>
          <div><span>Avslutade</span><b class="tabular">${after.closed}</b><small>bottar totalt</small></div>
        </div>
        ${ms.map((x) => `<div class="milestone">${I("trophy", 16)}<span><b>Ny milstolpe:</b> ${esc(x)}</span></div>`).join("")}
      </div>
      <div class="flow-foot"><button class="btn" id="r-view">Visa traden</button><span class="grow"></span>${
        next ? `<button class="btn primary big" id="r-next">Starta nästa bot (${next === "LONG" ? "Long" : "Short"}) ${I("arrow", 16)}</button>` : `<button class="btn primary big" id="r-done">Klar ${I("check", 16)}</button>`
      }</div>`);
    App.onModalClose(() => App.render());
    App.countUp(el.querySelector("#res-num"), pnl, (v) => fmt.signedMoney(v), 1100);
    if (before && after.streak !== before.streak)
      setTimeout(() => {
        const s = el.querySelector("#res-streak");
        if (!s) return;
        s.textContent = after.streak;
        s.classList.add("bump", after.streak > before.streak ? "up" : "reset");
      }, 1000);
    if (planOk) setTimeout(() => (win ? App.celebrate() : App.sparksAt(el.querySelector("#res-badge"))), 450);
    el.querySelector("#r-view").addEventListener("click", () => {
      App.onModalClose(null);
      App.closeModal();
      App.navigate(`#/trade/${id}`);
    });
    el.querySelector("#r-done")?.addEventListener("click", App.closeModal);
    el.querySelector("#r-next")?.addEventListener("click", () => {
      App.onModalClose(null);
      App.quickTrade({ side: next, entry: flipPrice || null });
    });
    (el.querySelector("#r-done") || el.querySelector("#r-next")).focus();
  }

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

  // ================================================================ Skärmbild → loggat direkt (analysverktyget)
  // Släpp/klistra in/välj en skärmbild av botens Details-sida i Bybit: siffror och datum loggas direkt,
  // sedan visas analysen och "Fyll i resten" (skäl, checklistor, stopp, betyg, lärdom) – allt det är valfritt.

  /** Journalens symbol för en bot från skärmbilden (SOLUSDT → SOLUSDT.P om det är standardsymbolen). */
  const symbolFor = (b) => {
    const d = String(App.state.settings.defaultSymbol || "");
    if (b && b.symbol && !d.toUpperCase().startsWith(b.symbol.toUpperCase())) return b.symbol + (/\.P$/i.test(d) ? ".P" : "");
    return d || (b && b.symbol) || "SOLUSDT.P";
  };

  /** Vad ska skärmbilden göra? Redan loggad, stänga/uppdatera en pågående bot, eller bli en ny trade. */
  function decideImport(b, all) {
    const endMs = b.endedAt ? App.fromLocalInput(b.endedAt) : null;
    const open = all.filter((t) => t.exit === null);
    const closed = all.filter((t) => t.exit !== null);
    if (b.status === "finished") {
      const dup = closed.find((t) => App.importMatchesTrade(b, t) && (endMs === null || Math.abs(t.closed_at - endMs) < 3 * 3600e3));
      if (dup) return { kind: "duplicate", trade: dup };
    }
    const match = open.find((t) => App.importMatchesTrade(b, t));
    if (match && b.status === "finished") return b.pnl === null ? { kind: "manual-close", trade: match } : { kind: "close", trade: match };
    if (match) return { kind: "progress", trade: match };
    if (!b.side || !b.investment || !b.entryPrice || (b.status === "finished" && b.pnl === null)) return { kind: "manual-new" };
    return { kind: b.status === "finished" ? "create-closed" : "create-open" };
  }

  /** Utför beslutet. Returnerar tradens id och en ångra-funktion. */
  async function performImport(d, b, imp) {
    const s = App.state.settings;
    const st = strategy();
    const endMs = b.endedAt ? App.fromLocalInput(b.endedAt) : null;
    const startMs = b.startedAt ? App.fromLocalInput(b.startedAt) : endMs && b.durationMin ? endMs - b.durationMin * 60000 : Date.now();
    if (d.kind === "duplicate") return { id: d.trade.id, undo: null };
    if (d.kind === "progress") {
      const g = d.trade.grid || {};
      await App.post(`/api/trades/${d.trade.id}/grid-progress`, { totalPnl: b.pnl, gridProfit: b.gridProfit, gridTrades: b.gridTrades });
      return { id: d.trade.id, undo: () => App.post(`/api/trades/${d.trade.id}/grid-progress`, { totalPnl: g.totalPnl ?? null, gridProfit: g.gridProfit ?? null, gridTrades: g.gridTrades ?? null }) };
    }
    if (d.kind === "close") {
      const prev = d.trade.grid || null;
      await App.post(`/api/trades/${d.trade.id}/close`, { exit: null, closed_at: Math.max(endMs || Date.now(), d.trade.opened_at), exit_reason: null, fees: 0, totalPnl: b.pnl, gridProfit: b.gridProfit, gridTrades: b.gridTrades });
      const attId = await App.attachScreenshot(d.trade.id, imp);
      return {
        id: d.trade.id,
        undo: async () => {
          await App.post(`/api/trades/${d.trade.id}/reopen`, { grid: prev });
          if (attId) await App.del(`/api/attachments/${attId}`).catch(() => {});
        },
      };
    }
    const lev = b.leverage || Number(localStorage.getItem("tz.lev")) || s.maxLeverage || 10;
    const r = await App.post("/api/trades", {
      kind: "grid",
      symbol: symbolFor(b),
      side: b.side,
      entry: b.entryPrice,
      qty: b.investment,
      opened_at: startMs,
      strategy_id: st ? st.id : null,
      grid: { investment: b.investment, leverage: lev, totalPnl: d.kind === "create-open" ? b.pnl : null },
    });
    if (d.kind === "create-closed")
      await App.post(`/api/trades/${r.id}/close`, { exit: null, closed_at: Math.max(endMs || Date.now(), startMs), exit_reason: null, fees: 0, totalPnl: b.pnl, gridProfit: b.gridProfit, gridTrades: b.gridTrades });
    await App.attachScreenshot(r.id, imp);
    return { id: r.id, undo: () => App.del(`/api/trades/${r.id}`) };
  }

  const HEADLINES = {
    "create-closed": "Loggat – avslutad bot",
    "create-open": "Loggat – boten kör",
    close: "Boten stoppad och loggad",
    progress: "Pågående bot uppdaterad",
    duplicate: "Den här boten är redan loggad",
  };

  App.importScreenshot = async (file) => {
    if (!App.canImportScreens()) return App.toast("Skärmbildsläsning finns bara när journalen körs på datorn", true);
    if (!file || !String(file.type).startsWith("image/")) return App.toast("Det där är ingen bild", true);
    const thumb = URL.createObjectURL(file);
    const F = flow("Skärmbildsanalys", { wide: true });
    F.finish();
    App.onModalClose(() => URL.revokeObjectURL(thumb));
    App.pasteTarget = (f2) => App.importScreenshot(f2); // en ny bild börjar om
    const shot = (cls, extra = "") => `<div class="an-shot ${cls}"><img src="${thumb}" alt="Skärmbilden" />${extra}</div>`;
    F.show(`<div class="analysis">${shot("scanning")}<div class="an-side"><div class="an-status">${`<span class="spinner"></span>`} Analyserar skärmbilden…</div>${[80, 62, 90, 55, 72, 66].map((w) => `<div class="an-skel" style="width:${w}%"></div>`).join("")}</div></div>`);

    const fail = (msg) => {
      const el = F.show(`<div class="analysis">${shot("")}<div class="an-side"><div class="an-status err">${I("alert", 18)} ${esc(msg)}</div>
        <p class="muted small" style="line-height:1.5">Ta skärmbilden på botens <b>Details</b>-sida i Bybit (som den du brukar skicka), så att siffrorna och datumen syns.</p></div></div>
        <div class="flow-foot"><button class="btn" id="an-manual">Fyll i själv</button><span class="grow"></span><button class="btn primary big" id="an-other">${I("image", 16)} Välj en annan bild</button></div>`);
      el.querySelector("#an-manual").addEventListener("click", () => App.quickTrade());
      el.querySelector("#an-other").addEventListener("click", App.pickScreenshot);
    };

    let imp;
    let d;
    let res;
    let before;
    try {
      imp = await App.readBybitScreenshot(file);
      if (!document.body.contains(F.m)) return; // rutan stängdes under analysen – logga inget
      if (!imp.bot.found.length) return fail("Hittade inga siffror i bilden");
      before = await journalStats();
      d = decideImport(imp.bot, (await App.api("/api/trades")).trades);
      if (d.kind === "manual-new") {
        App.toast("Jag hittade inte allt i bilden – fyll i det som saknas", true);
        return App.quickTrade({ import: imp });
      }
      if (d.kind === "manual-close") {
        App.toast("Jag hittade inte P&L i bilden – fyll i det", true);
        return App.quickClose(d.trade, null, imp);
      }
      if (!document.body.contains(F.m)) return;
      res = await performImport(d, imp.bot, imp);
    } catch (err) {
      return fail(err.message);
    }
    await App.refreshMeta();
    await showAnalysis(F, res.id, d, imp.bot, shot, before, res.undo, thumb);
  };

  /** Analysvyn efter loggningen: siffrorna som hittades + "Fyll i resten". */
  async function showAnalysis(F, id, d, b, shot, before, undo, thumb) {
    const t = (await App.api(`/api/trades/${id}`)).trade;
    const der = t.derived;
    const g = t.grid || {};
    const closed = t.exit !== null;
    const pnl = closed ? der.pnl : g.totalPnl;
    const cl = t.strategy_id ? await App.api(`/api/strategies/${t.strategy_id}/checklists`) : { entry: [], exit: [] };
    const answered = (phase) => new Map((t.rules || []).filter((r) => (r.phase ?? "entry") === phase).map((r) => [r.rule_id, Boolean(r.followed)]));
    const entryAns = answered("entry");
    const exitAns = answered("exit");
    const touched = { entry: entryAns.size > 0, exit: exitAns.size > 0 };
    const f = { reason: t.exit_reason, rating: t.rating || 0, lesson: "", stop: t.stop };
    let dirty = false;
    let saved = false;
    let undone = false;
    const after = closed && d.kind !== "duplicate" ? await journalStats() : null;
    const ms = after ? milestonesFor(before, after, der.pnl ?? 0) : [];
    const rows = [
      ["Bot", `${esc(t.symbol)} · ${t.side === "LONG" ? "Long" : "Short"} ${fmt.num(g.leverage || 1, 0)}x${b.isGrid ? " · Grid Bot" : ""}`],
      ["Investering", fmt.money(g.investment ?? t.qty, 0)],
      ["Entry Price", fmt.price(t.entry)],
      ["Start", fmt.dt(t.opened_at)],
      closed && ["Slut", `${fmt.dt(t.closed_at)} · ${fmt.dur(der.durationMs)}`],
      pnl !== null && pnl !== undefined && [closed ? "P&L" : "P&L just nu", `<span class="${App.cls(pnl)}">${fmt.signedMoney(pnl)}</span>${b.pnlPct !== null && d.kind !== "duplicate" ? ` <span class="muted">(${fmt.signed(b.pnlPct)} %)</span>` : ""}`],
      g.gridProfit !== null && g.gridProfit !== undefined && ["Grid Profit", `${fmt.signed(g.gridProfit)}${g.gridTrades ? ` · ${fmt.num(g.gridTrades, 0)} trades` : ""}`],
      closed && der.returnPct !== null && ["ROI", `<span class="${App.cls(der.returnPct)}">${fmt.pct(der.returnPct, 1)}</span>`],
    ].filter(Boolean);

    const el = F.show(`
      <div class="analysis">
        ${shot("done", `<span class="an-badge">${I("check", 16)}</span>`)}
        <div class="an-side">
          <div class="an-status ${d.kind === "duplicate" ? "" : "ok"}">${I(d.kind === "duplicate" ? "flag" : "check", 18)} ${HEADLINES[d.kind]}</div>
          ${closed ? `<div class="an-result ${der.pnl > 0 ? "win" : der.pnl < 0 ? "loss" : ""}"><span>Resultat</span><b class="tabular" id="an-num">${fmt.signedMoney(d.kind === "duplicate" ? der.pnl : 0)}</b></div>` : ""}
          <div class="an-rows">${rows.map(([k, v], i) => `<div class="an-row" style="--i:${i}"><span>${k}</span><b>${v}</b></div>`).join("")}</div>
          ${ms.map((x) => `<div class="milestone">${I("trophy", 16)}<span><b>Ny milstolpe:</b> ${esc(x)}</span></div>`).join("")}
        </div>
      </div>
      <div class="an-fill">
        <div class="an-fill-head"><b>Fyll i resten</b><span class="muted small">valfritt – sparas när du trycker Klar</span><span class="grow"></span><span class="badge" id="an-plan"></span></div>
        ${closed ? `<div class="sub-lead">Varför stoppades boten?</div><div id="an-reasons"></div>` : ""}
        <div class="an-cols ${closed ? "" : "one"}">
          <div><div class="sub-lead">Följde jag planen när jag startade?</div><div id="an-entry"></div></div>
          ${closed ? `<div><div class="sub-lead">Stängde jag av rätt skäl?</div><div id="an-exit"></div></div>` : ""}
        </div>
        <div class="form-grid" style="margin-top:12px">
          <div class="field"><label>Stopp (linjen) <span class="hint">vid start</span></label><input data-f="stop" type="number" step="any" min="0" inputmode="decimal" value="${f.stop ?? ""}" placeholder="92.00" /></div>
          ${closed ? `<div class="field"><label>Lärdom <span class="hint">en mening räcker</span></label><input data-f="lesson" placeholder="t.ex. lät boten jobba hela vägen" /></div>` : ""}
        </div>
        ${closed ? `<div class="sub-lead">Hur skötte jag traden?</div><div id="an-stars"></div>` : ""}
      </div>
      <div class="flow-foot">${undo ? `<button class="btn" id="an-undo">${I("back", 16)} Ångra</button>` : ""}<button class="btn" id="an-open">Öppna traden</button><span class="grow"></span><button class="btn primary big" id="an-done">Klar ${I("check", 16)}</button></div>`);

    const planEl = el.querySelector("#an-plan");
    const paintPlan = () => {
      const any = touched.entry || touched.exit || (closed && f.reason);
      if (!any) {
        planEl.className = "badge";
        planEl.innerHTML = "Bocka av så ser du om den följde planen";
        return;
      }
      if (closed && !f.reason) {
        planEl.className = "badge";
        planEl.innerHTML = "Välj varför boten stoppades";
        return;
      }
      // obesvarade checklistor räknas inte emot (samma regel som servern: inget svar = inte bedömt)
      const entryOk = !touched.entry || !cl.entry.length || cl.entry.every((r) => entryAns.get(r.id));
      const exitOk = !closed || !touched.exit || !cl.exit.length || cl.exit.every((r) => exitAns.get(r.id));
      const reasonOk = !closed || f.reason === "stop" || f.reason === "flip";
      const ok = entryOk && exitOk && reasonOk;
      planEl.className = `badge ${ok ? "ok" : "warn"}`;
      planEl.innerHTML = `${I(ok ? "shield" : "alert", 15)} ${ok ? "Enligt planen" : "Utanför planen"}`;
    };
    const mark = () => {
      dirty = true;
      paintPlan();
    };
    let ready = false;
    if (closed) reasons(el.querySelector("#an-reasons"), f, mark);
    checklist(el.querySelector("#an-entry"), cl.entry, entryAns, () => ready && ((touched.entry = true), mark()), { compact: true, fullText: "Allt enligt planen" });
    if (closed) checklist(el.querySelector("#an-exit"), cl.exit, exitAns, () => ready && ((touched.exit = true), mark()), { compact: true, fullText: "Rätt skäl", offset: cl.entry.length });
    if (closed) stars(el.querySelector("#an-stars"), f);
    el.querySelector("#an-stars")?.addEventListener("click", () => (dirty = true));
    ready = true;
    el.addEventListener("input", (e) => {
      const k = e.target.dataset.f;
      if (!k) return;
      f[k] = k === "stop" ? numOf(e.target.value) : e.target.value;
      dirty = true;
    });
    paintPlan();

    const saveFill = async () => {
      if (touched.entry && cl.entry.length) {
        cl.entry.forEach((r) => !entryAns.has(r.id) && entryAns.set(r.id, false));
        await App.patch(`/api/trades/${id}/rules`, { merge: true, rules: [...entryAns].map(([rule_id, followed]) => ({ rule_id, followed })) });
      }
      if (closed && touched.exit && cl.exit.length) {
        cl.exit.forEach((r) => !exitAns.has(r.id) && exitAns.set(r.id, false));
        await App.patch(`/api/trades/${id}/rules`, { merge: true, rules: [...exitAns].map(([rule_id, followed]) => ({ rule_id, followed })) });
      }
      const meta = {};
      if (closed && f.reason && f.reason !== t.exit_reason) meta.exit_reason = f.reason;
      if (closed && f.rating !== (t.rating || 0)) meta.rating = f.rating || null;
      if (closed && f.lesson.trim()) meta.lesson = f.lesson;
      if ((f.stop ?? null) !== (t.stop ?? null)) meta.stop = f.stop;
      if (Object.keys(meta).length) await App.patch(`/api/trades/${id}/meta`, meta);
      saved = true;
    };
    // stängs rutan utan Klar sparas det som fyllts i ändå
    App.onModalClose(async () => {
      URL.revokeObjectURL(thumb);
      if (dirty && !saved && !undone) await saveFill().catch((err) => App.toast(err.message, true));
      App.render();
    });
    App.pasteTarget = async (f2) => {
      if (dirty && !saved) await saveFill().catch(() => {});
      saved = true;
      App.importScreenshot(f2);
    };

    if (closed && d.kind !== "duplicate") App.countUp(el.querySelector("#an-num"), der.pnl ?? 0, (v) => fmt.signedMoney(v), 900);
    if (d.kind !== "duplicate") setTimeout(() => App.sparksAt(el.querySelector(".an-badge")), 300);

    el.querySelector("#an-undo")?.addEventListener("click", async () => {
      try {
        undone = true;
        await undo();
        App.closeModal();
        App.toast("Ångrat – skärmbilden loggades inte");
      } catch (err) {
        undone = false;
        App.toast(err.message, true);
      }
    });
    el.querySelector("#an-open").addEventListener("click", async () => {
      if (dirty) await saveFill().catch((err) => App.toast(err.message, true));
      App.onModalClose(() => URL.revokeObjectURL(thumb));
      App.closeModal();
      App.navigate(`#/trade/${id}`);
    });
    el.querySelector("#an-done").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        if (dirty) await saveFill();
      } catch (err) {
        btn.disabled = false;
        return App.toast(err.message, true);
      }
      const t2 = (await App.api(`/api/trades/${id}`)).trade;
      App.closeModal();
      await App.refreshMeta();
      const plan = closed ? (t2.exit_reason === "stop" || t2.exit_reason === "flip") && (t2.derived.entryFollowPct === null || t2.derived.entryFollowPct >= 100) && (t2.derived.exitFollowPct === null || t2.derived.exitFollowPct >= 100) : null;
      if (plan && dirty) {
        if ((t2.derived.pnl ?? 0) > 0) {
          App.celebrate();
          App.toast("Enligt planen – snyggt jobbat!");
        } else {
          App.sparks(window.innerWidth / 2, window.innerHeight / 3);
          App.toast("Förlust enligt planen – disciplinen håller");
        }
      } else App.toast(dirty ? "Sparat" : "Klart");
    });
    F.m.focus();
  }

  // ================================================================ Ny bot
  App.quickTrade = async (prefill = null) => {
    const st = strategy();
    if (!st) {
      App.toast("Skapa en strategi under Strategi först", true);
      return App.navigate("#/playbook");
    }
    const s = App.state.settings;
    const [cl, journal] = await Promise.all([App.api(`/api/strategies/${st.id}/checklists`), App.api("/api/trades")]);
    const known = [...new Set([s.defaultSymbol, ...journal.trades.map((t) => t.symbol)].filter(Boolean))];
    const p = prefill || {};
    const entryAns = new Map();
    const exitAns = new Map();
    // formulärets värden – överlever stegbyten och omritningar
    const f = {
      symbol: p.symbol || s.defaultSymbol || "",
      side: p.side || "LONG",
      entry: p.entry ?? null,
      stop: null,
      inv: null,
      lev: Number(localStorage.getItem("tz.lev")) || s.maxLeverage || 10,
      time: App.toLocalInput(p.opened_at || Date.now()),
      finished: false,
      pnl: null,
      end: App.toLocalInput(Date.now()),
      gridProfit: null,
      gridTrades: null,
      runningPnl: null,
      reason: null,
      rating: 0,
      lesson: "",
    };
    const zs = { status: null, imp: null, error: null };
    let filled = new Set();
    let step = 0;
    const labels = () => (f.finished ? ["Checklista", "Boten", "Avslut"] : ["Checklista", "Boten"]);
    const F = flow("Ny bot");

    const apply = (imp) => {
      const b = imp.bot;
      zs.imp = imp;
      filled = new Set();
      const set = (k, v) => {
        if (v !== null && v !== undefined && v !== "") {
          f[k] = v;
          filled.add(k);
        }
      };
      set("symbol", b.symbol ? symbolFor(b) : null);
      set("side", b.side);
      set("entry", b.entryPrice);
      set("inv", b.investment);
      set("lev", b.leverage);
      set("time", b.startedAt);
      if (b.status === "finished") {
        f.finished = true;
        set("pnl", b.pnl);
        set("end", b.endedAt);
        set("gridProfit", b.gridProfit);
        set("gridTrades", b.gridTrades);
      } else if (b.pnl !== null) f.runningPnl = b.pnl;
    };
    const render = () => [step1, step2, step3][step]();
    App.pasteTarget = screenshotReader(zs, apply, render);
    if (p.import) apply(p.import);

    const sym = () => String(f.symbol || s.defaultSymbol || "").trim().toUpperCase();
    const numField = (k, label, hint, ph) =>
      `<div class="field ${filled.has(k) ? "filled" : ""}"><label>${label} <span class="hint">${hint}</span></label><input data-f="${k}" type="number" step="any" min="0" inputmode="decimal" value="${f[k] ?? ""}" placeholder="${ph}" /></div>`;

    // ---- steg 1: följer jag planen?
    function step1() {
      step = 0;
      F.steps(labels(), 0);
      const el = F.show(`
        <div class="lead"><h4>Följer jag planen?</h4><p>Bocka av innan du startar boten. <a href="#" id="q-edit">Ändra punkter</a></p></div>
        ${importChip(zs)}
        <div id="q-checks"></div>
        <div class="flow-foot"><button class="btn" id="q-cancel">Avbryt</button><span class="grow"></span><button class="btn primary big" id="q-next">Fortsätt ${I("arrow", 16)}</button></div>`);
      const next = el.querySelector("#q-next");
      checklist(el.querySelector("#q-checks"), cl.entry, entryAns, (done, all) => {
        const full = all > 0 && done === all;
        next.classList.toggle("ready", full);
        next.innerHTML = `${all && !full ? "Fortsätt ändå" : "Fortsätt"} ${I("arrow", 16)}`;
      });
      el.querySelector("#q-edit").addEventListener("click", (e) => (e.preventDefault(), App.checklistEditor("entry", () => App.quickTrade(prefill))));
      el.querySelector("#q-cancel").addEventListener("click", App.closeModal);
      next.addEventListener("click", () => {
        cl.entry.forEach((r) => !entryAns.has(r.id) && entryAns.set(r.id, false));
        step2();
      });
      F.m.focus();
    }

    // ---- steg 2: boten
    function step2() {
      step = 1;
      F.steps(labels(), 1);
      const el = F.show(`
        <div class="lead"><h4>Boten</h4><p>Skriv av från Bybit – eller klistra in skärmbilden så fylls allt i.</p></div>
        <div id="q-zone"></div>
        ${sideToggle(f.side)}
        <div class="form-grid">
          <div class="field full ${filled.has("symbol") ? "filled" : ""}"><label>Symbol <span class="hint">som i Bybit, t.ex. SOLUSDT.P</span></label><input data-f="symbol" type="text" list="q-symbols" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(f.symbol)}" placeholder="SOLUSDT.P" /><datalist id="q-symbols">${known.map((k) => `<option value="${esc(k)}"></option>`).join("")}</datalist></div>
          ${numField("entry", `<span id="q-base">${esc(App.base(sym()))}</span>-pris vid start`, "Entry Price", "104.47")}
          ${numField("stop", "Stopp (linjen)", "linjens värde", "92.00")}
          ${numField("inv", `Investering (${esc(cur())})`, "Total Investment", "200")}
          ${numField("lev", "Hävstång", "t.ex. 10x", "10")}
          <div class="field full ${filled.has("time") ? "filled" : ""}"><label>Starttid <span class="hint">Start-up time</span></label><input data-f="time" type="datetime-local" value="${f.time}" /></div>
        </div>
        ${
          f.finished
            ? `<div class="done-box">
                <div class="db-head">${I("flag", 16)} <b>Boten är redan avslutad</b>${zs.imp && zs.imp.bot.statusText ? `<span class="muted small">${esc(zs.imp.bot.statusText)}</span>` : ""}<a href="#" id="q-notdone" class="small">Den kör fortfarande</a></div>
                <div class="form-grid">
                  <div class="field ${filled.has("pnl") ? "filled" : ""}"><label>Botens P&amp;L (${esc(cur())}) <span class="hint">P&amp;L</span></label><input data-f="pnl" type="number" step="any" inputmode="decimal" value="${f.pnl ?? ""}" placeholder="+76.87" class="pnl-in" /></div>
                  <div class="field ${filled.has("end") ? "filled" : ""}"><label>Sluttid <span class="hint">End time</span></label><input data-f="end" type="datetime-local" value="${f.end}" /></div>
                </div>
              </div>`
            : `<a href="#" class="already small" id="q-already">${I("flag", 14)} Redan stoppad? Logga resultatet direkt</a>`
        }
        <div id="q-card"></div>
        <div class="flow-foot"><button class="btn" id="q-back">${I("back", 16)} Tillbaka</button><span class="grow"></span><button class="btn primary big" id="q-save">${f.finished ? `Fortsätt till avslut ${I("arrow", 16)}` : `Logga boten ${I("check", 16)}`}</button></div>`);
      importZone(el.querySelector("#q-zone"), zs, App.pasteTarget);
      const card = () => (el.querySelector("#q-card").innerHTML = botCard({ side: f.side, symbol: sym(), entry: f.entry, inv: f.inv, lev: f.lev, stop: f.stop }));
      el.querySelectorAll(".pnl-in").forEach(paintPnl);
      el.addEventListener("input", (e) => {
        const k = e.target.dataset.f;
        if (!k) return;
        f[k] = e.target.type === "number" ? numOf(e.target.value) : e.target.value;
        e.target.closest(".field")?.classList.remove("filled");
        if (k === "pnl") paintPnl(e.target);
        if (k === "symbol") el.querySelector("#q-base").textContent = App.base(sym());
        card();
      });
      el.querySelector("#q-side").addEventListener("click", (e) => {
        const b = e.target.closest("button[data-side]");
        if (!b) return;
        f.side = b.dataset.side;
        el.querySelectorAll("#q-side button").forEach((x) => x.classList.toggle("on", x === b));
        card();
      });
      el.querySelector("#q-already")?.addEventListener("click", (e) => {
        e.preventDefault();
        f.finished = true;
        step2();
        F.body.querySelector('[data-f="pnl"]')?.focus();
      });
      el.querySelector("#q-notdone")?.addEventListener("click", (e) => {
        e.preventDefault();
        f.finished = false;
        step2();
      });
      el.querySelector("#q-back").addEventListener("click", step1);
      el.querySelector("#q-save").addEventListener("click", () => {
        if (!sym()) {
          App.toast("Fyll i symbolen", true);
          el.querySelector('[data-f="symbol"]').focus();
          return;
        }
        if (!f.entry || !f.inv) {
          App.toast("Fyll i pris och investering", true);
          el.querySelector(`[data-f="${!f.entry ? "entry" : "inv"}"]`).focus();
          return;
        }
        if (f.finished) {
          if (f.pnl === null) {
            App.toast("Fyll i botens P&L från Bybit", true);
            el.querySelector('[data-f="pnl"]').focus();
            return;
          }
          return step3();
        }
        save();
      });
      card();
      filled = new Set(); // blinka bara en gång
      const first = ["entry", "stop", "inv"].find((k) => !f[k]);
      if (first) el.querySelector(`[data-f="${first}"]`).focus();
      else F.m.focus();
    }

    // ---- steg 3 (bara för redan avslutad bot): varför och hur det gick
    function step3() {
      step = 2;
      F.steps(labels(), 2);
      const el = F.show(`
        <div class="lead"><h4>Varför stoppades boten?</h4><p>Var ärlig – det är det som gör journalen värdefull.</p></div>
        <div id="q-reasons"></div>
        <div class="sub-lead">Stängde jag av rätt skäl? <a href="#" id="q-edit2">Ändra punkter</a></div>
        <div id="q-exit"></div>
        <div class="sub-lead">Hur skötte jag traden?</div>
        <div id="q-stars"></div>
        <div class="field" style="margin-top:12px"><label>Lärdom <span class="hint">valfritt – en mening räcker</span></label><input data-f="lesson" value="${esc(f.lesson)}" placeholder="t.ex. lät boten jobba hela vägen" /></div>
        <div class="flow-foot"><button class="btn" id="q-back">${I("back", 16)} Tillbaka</button><span class="grow"></span><button class="btn primary big" id="q-save" ${f.reason ? "" : "disabled"}>Spara ${I("check", 16)}</button></div>`);
      const saveBtn = el.querySelector("#q-save");
      reasons(el.querySelector("#q-reasons"), f, () => (saveBtn.disabled = !f.reason));
      checklist(el.querySelector("#q-exit"), cl.exit, exitAns, () => {}, { fullText: "Rätt skäl" });
      stars(el.querySelector("#q-stars"), f);
      el.addEventListener("input", (e) => e.target.dataset.f === "lesson" && (f.lesson = e.target.value));
      el.querySelector("#q-edit2").addEventListener("click", (e) => (e.preventDefault(), App.checklistEditor("exit", () => App.quickTrade(prefill))));
      el.querySelector("#q-back").addEventListener("click", step2);
      saveBtn.addEventListener("click", save);
      F.m.focus();
    }

    async function save() {
      const btn = F.m.querySelector("#q-save");
      if (btn) btn.disabled = true;
      try {
        cl.entry.forEach((r) => !entryAns.has(r.id) && entryAns.set(r.id, false));
        const before = f.finished ? await journalStats() : null;
        localStorage.setItem("tz.lev", String(f.lev || 1));
        const openedAt = App.fromLocalInput(f.time) || Date.now();
        const r = await App.post("/api/trades", {
          kind: "grid",
          symbol: sym(),
          side: f.side,
          entry: f.entry,
          qty: f.inv,
          opened_at: openedAt,
          stop: f.stop,
          strategy_id: st.id,
          grid: { investment: f.inv, leverage: f.lev || 1, totalPnl: f.finished ? null : f.runningPnl },
          rules: [...entryAns].map(([rule_id, followed]) => ({ rule_id, followed })),
        });
        if (f.finished) {
          cl.exit.forEach((x) => !exitAns.has(x.id) && exitAns.set(x.id, false));
          if (exitAns.size) await App.patch(`/api/trades/${r.id}/rules`, { merge: true, rules: [...exitAns].map(([rule_id, followed]) => ({ rule_id, followed })) });
          await App.post(`/api/trades/${r.id}/close`, {
            exit: null,
            closed_at: Math.max(App.fromLocalInput(f.end) || Date.now(), openedAt),
            exit_reason: f.reason,
            fees: 0,
            totalPnl: f.pnl,
            gridProfit: f.gridProfit,
            gridTrades: f.gridTrades,
            rating: f.rating || null,
            lesson: f.lesson,
          });
        }
        await App.attachScreenshot(r.id, zs.imp);
        App.pasteTarget = null;
        await App.refreshMeta();
        if (f.finished) await showResult(F, r.id, before);
        else await showStarted(F, r.id, entryAns);
      } catch (err) {
        if (btn) btn.disabled = false;
        App.toast(err.message, true);
      }
    }

    step1();
  };

  // ================================================================ Stoppa bot
  App.quickClose = async (t, reason = "stop", imp = null) => {
    const cl = t.strategy_id ? await App.api(`/api/strategies/${t.strategy_id}/checklists`) : { entry: [], exit: [] };
    const exitAns = new Map();
    const g = t.grid || {};
    const f = { reason, pnl: g.totalPnl ?? null, price: null, gridProfit: g.gridProfit ?? null, gridTrades: g.gridTrades ?? null, end: App.toLocalInput(Date.now()), rating: 0, lesson: "" };
    const zs = { status: null, imp: null, error: null };
    let filled = new Set();
    let step = 0;
    const F = flow(reason === "flip" ? "Trenden vände" : "Stoppa boten");
    const apply = (im) => {
      const b = im.bot;
      zs.imp = im;
      filled = new Set();
      const set = (k, v) => {
        if (v !== null && v !== undefined) {
          f[k] = v;
          filled.add(k);
        }
      };
      set("pnl", b.pnl);
      set("gridProfit", b.gridProfit);
      set("gridTrades", b.gridTrades);
      set("end", b.endedAt);
    };
    const render = () => (step === 0 ? step1() : step2());
    App.pasteTarget = screenshotReader(zs, apply, render);
    if (imp) apply(imp);
    const numField = (k, label, hint, ph, cls = "") =>
      `<div class="field ${cls} ${filled.has(k) ? "filled" : ""}"><label>${label} <span class="hint">${hint}</span></label><input data-f="${k}" type="number" step="any" inputmode="decimal" value="${f[k] ?? ""}" placeholder="${ph}" /></div>`;

    function step1() {
      step = 0;
      F.steps(["Varför", "Resultat"], 0);
      const el = F.show(`
        <div class="lead"><h4>Varför stoppar du boten?</h4><p>${esc(t.symbol)} ${t.side === "LONG" ? "Long" : "Short"} · ${fmt.money(g.investment ?? t.qty, 0)} · startad ${fmt.date(t.opened_at)} (${fmt.dur(Date.now() - t.opened_at)} sedan)</p></div>
        ${importChip(zs)}
        <div id="q-reasons"></div>
        <div class="sub-lead">Stänger jag av rätt skäl? <a href="#" id="q-edit">Ändra punkter</a></div>
        <div id="q-exit"></div>
        <div class="flow-foot"><button class="btn" id="q-cancel">Avbryt</button><span class="grow"></span><button class="btn primary big" id="q-next" ${f.reason ? "" : "disabled"}>Fortsätt ${I("arrow", 16)}</button></div>`);
      const next = el.querySelector("#q-next");
      reasons(el.querySelector("#q-reasons"), f, () => (next.disabled = !f.reason));
      checklist(el.querySelector("#q-exit"), cl.exit, exitAns, (done, all) => next.classList.toggle("ready", all > 0 && done === all), { fullText: "Rätt skäl" });
      el.querySelector("#q-edit").addEventListener("click", (e) => (e.preventDefault(), App.checklistEditor("exit", () => App.quickClose(t, f.reason, zs.imp))));
      el.querySelector("#q-cancel").addEventListener("click", App.closeModal);
      next.addEventListener("click", () => {
        cl.exit.forEach((r) => !exitAns.has(r.id) && exitAns.set(r.id, false));
        step2();
      });
      F.m.focus();
    }

    function step2() {
      step = 1;
      F.steps(["Varför", "Resultat"], 1);
      const openMore = ["price", "gridProfit", "gridTrades", "end"].some((k) => filled.has(k));
      const el = F.show(`
        <div class="lead"><h4>Hur gick det?</h4><p>Skriv av P&amp;L från Bybit – eller klistra in skärmbilden.</p></div>
        <div id="q-zone"></div>
        <div class="pnl-hero ${filled.has("pnl") ? "filled" : ""}">
          <label for="q-pnl">Botens P&amp;L</label>
          <div class="pnl-wrap"><input id="q-pnl" data-f="pnl" type="number" step="any" inputmode="decimal" value="${f.pnl ?? ""}" placeholder="0.00" /><span>${esc(cur())}</span></div>
          <div class="pnl-chips" id="q-chips"></div>
        </div>
        <div id="q-stars"></div>
        <div class="field" style="margin-top:12px"><label>Lärdom <span class="hint">valfritt – en mening räcker</span></label><input data-f="lesson" value="${esc(f.lesson)}" placeholder="t.ex. höll mig till planen trots rekylen" /></div>
        <details class="qmore" ${openMore ? "open" : ""}><summary>Mer från Bybit (valfritt)</summary>
          <div class="form-grid">
            ${numField("price", `${esc(App.base(t.symbol))}-pris vid stopp`, "valfritt", "91.50")}
            ${numField("gridProfit", "Grid Profit", "USDT", "21.67")}
            ${numField("gridTrades", "Profitable Trades", "antal", "72")}
            <div class="field ${filled.has("end") ? "filled" : ""}"><label>Sluttid <span class="hint">End time</span></label><input data-f="end" type="datetime-local" value="${f.end}" /></div>
          </div>
        </details>
        <div class="flow-foot"><button class="btn" id="q-back">${I("back", 16)} Tillbaka</button><span class="grow"></span><button class="btn primary big" id="q-save">${f.reason === "flip" ? "Stäng och vänd" : "Stoppa boten"} ${I("check", 16)}</button></div>`);
      importZone(el.querySelector("#q-zone"), zs, App.pasteTarget);
      stars(el.querySelector("#q-stars"), f);
      const pnlIn = el.querySelector("#q-pnl");
      const chips = () => {
        const end = App.fromLocalInput(f.end) || Date.now();
        const inv = g.investment || t.qty;
        const bits = [];
        if (f.pnl !== null && inv) bits.push(`<span class="chip ${App.cls(f.pnl)}">${I(f.pnl >= 0 ? "up" : "down", 14)} ROI ${fmt.pct((f.pnl / inv) * 100, 1)}</span>`);
        bits.push(`<span class="chip">${I("clock", 14)} ${fmt.dur(end - t.opened_at)}</span>`);
        if (f.pnl !== null) bits.push(`<span class="chip">Kontot blir ${fmt.money((App.state.equity || App.state.settings.startBalance) + f.pnl, 2)}</span>`);
        el.querySelector("#q-chips").innerHTML = bits.join("");
      };
      paintPnl(pnlIn);
      el.addEventListener("input", (e) => {
        const k = e.target.dataset.f;
        if (!k) return;
        f[k] = e.target.type === "number" ? numOf(e.target.value) : e.target.value;
        e.target.closest(".field, .pnl-hero")?.classList.remove("filled");
        if (k === "pnl") paintPnl(e.target);
        chips();
      });
      el.querySelector("#q-back").addEventListener("click", step1);
      el.querySelector("#q-save").addEventListener("click", save);
      chips();
      filled = new Set();
      pnlIn.focus();
    }

    async function save() {
      const btn = F.m.querySelector("#q-save");
      if (f.pnl === null) {
        App.toast("Fyll i botens P&L från Bybit", true);
        F.body.querySelector("#q-pnl")?.focus();
        return;
      }
      const closedAt = App.fromLocalInput(f.end) || Date.now();
      if (closedAt < t.opened_at) return App.toast("Sluttiden är före starttiden", true);
      if (btn) btn.disabled = true;
      try {
        const before = await journalStats();
        if (exitAns.size) await App.patch(`/api/trades/${t.id}/rules`, { merge: true, rules: [...exitAns].map(([rule_id, followed]) => ({ rule_id, followed })) });
        await App.post(`/api/trades/${t.id}/close`, { exit: f.price || null, closed_at: closedAt, exit_reason: f.reason, fees: 0, totalPnl: f.pnl, gridProfit: f.gridProfit, gridTrades: f.gridTrades, rating: f.rating || null, lesson: f.lesson });
        await App.attachScreenshot(t.id, zs.imp);
        App.pasteTarget = null;
        await App.refreshMeta();
        await showResult(F, t.id, before, { flipPrice: f.price });
      } catch (err) {
        if (btn) btn.disabled = false;
        App.toast(err.message, true);
      }
    }

    step1();
  };

  // ================================================================ Resultat just nu (medan boten kör)
  App.quickProgress = (t, imp = null) => {
    const g = t.grid || {};
    const f = { pnl: g.totalPnl ?? null, gridProfit: g.gridProfit ?? null, gridTrades: g.gridTrades ?? null };
    const zs = { status: null, imp: null, error: null };
    let filled = new Set();
    const F = flow("Hur går boten?");
    F.finish();
    const apply = (im) => {
      zs.imp = im;
      filled = new Set();
      for (const [k, v] of [["pnl", im.bot.pnl], ["gridProfit", im.bot.gridProfit], ["gridTrades", im.bot.gridTrades]])
        if (v !== null && v !== undefined) {
          f[k] = v;
          filled.add(k);
        }
    };
    const render = () => {
      const el = F.show(`
        <div class="lead"><p>${esc(t.symbol)} ${t.side === "LONG" ? "Long" : "Short"} · ${fmt.money(g.investment ?? t.qty, 0)} · kört ${fmt.dur(Date.now() - t.opened_at)}</p></div>
        <div id="q-zone"></div>
        <div class="pnl-hero ${filled.has("pnl") ? "filled" : ""}">
          <label for="q-pnl">P&amp;L just nu</label>
          <div class="pnl-wrap"><input id="q-pnl" data-f="pnl" type="number" step="any" inputmode="decimal" value="${f.pnl ?? ""}" placeholder="0.00" /><span>${esc(cur())}</span></div>
        </div>
        <div class="flow-foot"><button class="btn" id="q-cancel">Avbryt</button><span class="grow"></span><button class="btn primary big" id="q-save">Spara ${I("check", 16)}</button></div>`);
      importZone(el.querySelector("#q-zone"), zs, App.pasteTarget);
      const input = el.querySelector("#q-pnl");
      paintPnl(input);
      input.addEventListener("input", () => {
        f.pnl = numOf(input.value);
        paintPnl(input);
      });
      el.querySelector("#q-cancel").addEventListener("click", App.closeModal);
      el.querySelector("#q-save").addEventListener("click", async () => {
        try {
          await App.post(`/api/trades/${t.id}/grid-progress`, { totalPnl: f.pnl, gridProfit: f.gridProfit, gridTrades: f.gridTrades });
          App.closeModal();
          App.toast(f.pnl === null ? "Sparat" : `Boten ligger på ${fmt.signedMoney(f.pnl)} just nu`);
          App.render();
        } catch (err) {
          App.toast(err.message, true);
        }
      });
      filled = new Set();
      input.focus();
    };
    App.pasteTarget = screenshotReader(zs, apply, render);
    if (imp) apply(imp);
    render();
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
        <div class="field"><label>${esc(App.base(App.state.settings.defaultSymbol))}-pris vid signalen</label><input id="ms-price" type="number" step="any" inputmode="decimal" placeholder="105.20" /></div>
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

  // ---------------------------------------------------------------- Redigera
  App.quickEdit = (t) => {
    const bot = t.kind === "grid";
    const g = t.grid || { investment: t.qty, leverage: 1 };
    const closed = t.exit !== null;
    const end = App.endPrice(t); // null = slutpriset är okänt (exit är då bara platshållaren från stängningen)
    const v = (x) => (x === null || x === undefined ? "" : x);
    const base = () => esc(App.base(m ? m.querySelector("#e-symbol").value : t.symbol));
    let side = t.side;
    let m = null;
    m = App.modal(
      `<h3>Redigera trade</h3>
      <div class="seg big" id="e-side"><button type="button" data-side="LONG" class="${side === "LONG" ? "active long" : ""}">Long</button><button type="button" data-side="SHORT" class="${side === "SHORT" ? "active short" : ""}">Short</button></div>
      <div class="form-grid" style="margin-top:12px">
        <div class="field"><label>Symbol</label><input id="e-symbol" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(t.symbol)}" /></div>
        <div class="field"><label>Strategi</label><select id="e-strategy"><option value="">Ingen</option>${(App.state.strategies || []).map((s) => `<option value="${s.id}" ${t.strategy_id === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></div>
        <div class="field"><label><span class="e-base">${base()}</span>-pris vid start</label><input id="e-entry" type="number" step="any" value="${t.entry}" /></div>
        <div class="field"><label>Stopp (linjen)</label><input id="e-stop" type="number" step="any" value="${v(t.stop)}" /></div>
        <div class="field"><label>${bot ? "Investering" : "Antal"}</label><input id="e-inv" type="number" step="any" value="${v(g.investment)}" /></div>
        ${bot ? `<div class="field"><label>Hävstång</label><input id="e-lev" type="number" step="any" value="${v(g.leverage)}" /></div>` : ""}
        <div class="field"><label>Startad</label><input id="e-open" type="datetime-local" value="${App.toLocalInput(t.opened_at)}" /></div>
        ${
          closed
            ? `<div class="field"><label>Stoppad</label><input id="e-close" type="datetime-local" value="${App.toLocalInput(t.closed_at)}" /></div>
        <div class="field"><label><span class="e-base">${base()}</span>-pris vid stopp${bot ? ' <span class="hint">valfritt</span>' : ""}</label><input id="e-exit" type="number" step="any" value="${v(end)}" /></div>
        ${
          bot
            ? `<div class="field"><label>Botens P&amp;L</label><input id="e-total" type="number" step="any" value="${v(g.totalPnl)}" /></div>
        <div class="field"><label>Grid Profit <span class="hint">valfritt</span></label><input id="e-gp" type="number" step="any" value="${v(g.gridProfit)}" /></div>
        <div class="field"><label>Profitable Trades <span class="hint">valfritt</span></label><input id="e-gt" type="number" step="1" min="0" value="${v(g.gridTrades)}" /></div>`
            : ""
        }
        <div class="field full"><label>Varför stängde du?</label><select id="e-reason"><option value="">Ej angivet</option>${Object.entries(App.EXIT_LABEL).map(([k, lbl]) => `<option value="${k}" ${t.exit_reason === k ? "selected" : ""}>${lbl}</option>`).join("")}</select></div>`
            : ""
        }
        <div class="field full"><label>Anteckning</label><textarea id="e-notes" style="min-height:60px">${esc(t.notes)}</textarea></div>
      </div>
      <div class="form-actions"><button class="btn" id="e-cancel">Avbryt</button><button class="btn primary" id="e-save">Spara</button></div>`,
      { narrow: true },
    );
    m.querySelector("#e-symbol").addEventListener("input", () => m.querySelectorAll(".e-base").forEach((x) => (x.innerHTML = base())));
    m.querySelector("#e-side").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-side]");
      if (!b) return;
      side = b.dataset.side;
      m.querySelectorAll("#e-side button").forEach((x) => (x.className = x.dataset.side === side ? `active ${side.toLowerCase()}` : ""));
    });
    m.querySelector("#e-cancel").addEventListener("click", App.closeModal);
    m.querySelector("#e-save").addEventListener("click", async () => {
      const q = (id) => num(m.querySelector(id));
      const symbol = m.querySelector("#e-symbol").value.trim().toUpperCase();
      const entry = q("#e-entry");
      const inv = q("#e-inv");
      if (!symbol || !entry || !inv) return App.toast(`Symbol, pris och ${bot ? "investering" : "antal"} behövs`, true);
      const exit = closed ? q("#e-exit") : null;
      const total = bot && closed ? q("#e-total") : null;
      if (bot && closed && total === null) return App.toast("Fyll i botens P&L", true);
      if (!bot && closed && !exit) return App.toast("Fyll i priset vid stängning", true);
      const sid = m.querySelector("#e-strategy").value;
      try {
        await App.put(`/api/trades/${t.id}`, {
          kind: bot ? "grid" : "position",
          symbol,
          side,
          entry,
          qty: inv,
          opened_at: App.fromLocalInput(m.querySelector("#e-open").value) || t.opened_at,
          closed_at: closed ? App.fromLocalInput(m.querySelector("#e-close").value) || t.closed_at : null,
          // okänt slutpris på en bot: startpriset står som platshållare och grid.endPrice är null (som när boten stoppas)
          exit: closed ? (exit ?? (bot ? entry : null)) : null,
          exit_reason: closed ? m.querySelector("#e-reason").value || null : null,
          stop: q("#e-stop"),
          target: t.target,
          trail_stop: t.trail_stop,
          fees: t.fees,
          strategy_id: sid ? Number(sid) : null,
          rating: t.rating,
          notes: m.querySelector("#e-notes").value,
          pnl: t.pnl,
          pnl_override: bot ? false : Boolean(t.pnl_override),
          // alla botens fält följer med – det som inte står i formuläret behålls som det var
          grid: bot ? { ...g, investment: inv, leverage: q("#e-lev") || 1, totalPnl: closed ? total : (g.totalPnl ?? null), gridProfit: closed ? q("#e-gp") : (g.gridProfit ?? null), gridTrades: closed ? q("#e-gt") : (g.gridTrades ?? null), endPrice: closed ? exit : null } : null,
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
