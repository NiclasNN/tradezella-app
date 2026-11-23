/* Playbook (strategier): kort med statistik, detaljsida med grupper/regler, regelstatistik, missade trades */
(() => {
  "use strict";
  const App = window.App;
  const { fmt, esc } = App;
  const ICONS = ["🎯", "⚡", "🚀", "📈", "📉", "🔁", "🧲", "🛡️", "🔥", "🧠", "🐂", "🐻"];
  const COLORS = ["#7c5cff", "#22a06b", "#e5484d", "#f59e0b", "#3b82f6", "#14b8a6", "#ec4899", "#8b5cf6"];

  App.views.playbook = {
    title: "Strategi",
    async render(el, [idStr]) {
      if (idStr) return renderDetail(el, Number(idStr));
      const list = await App.api("/api/strategies?all=1");
      el.innerHTML = `
        <div class="toolbar"><span class="muted small">En strategi = ett regelverk (entry, exit, marknad, risk). Koppla varje trade till en strategi och bocka i vilka regler du följde – då ser du om disciplinen lönar sig.</span><span style="flex:1"></span><button class="btn primary" id="pb-new">＋ Ny strategi</button></div>
        ${list.length ? `<div class="pb-grid">${list.map(card).join("")}</div>` : App.emptyState("Inga strategier ännu", "Skapa din första strategi och skriv ner reglerna. Du har sagt att du börjat med en ny strategi – det här är stället att formalisera den.", '<button class="btn primary" id="pb-new-empty">＋ Ny strategi</button>')}`;
      el.querySelector("#pb-new")?.addEventListener("click", () => strategyDialog());
      el.querySelector("#pb-new-empty")?.addEventListener("click", () => strategyDialog());
      el.querySelectorAll(".pb-card").forEach((c) => c.addEventListener("click", () => App.navigate(`#/playbook/${c.dataset.id}`)));
    },
  };

  function card(s) {
    const st = s.stats;
    return `<div class="card pb-card" data-id="${s.id}" style="border-top-color:${s.color}">
      <h3><span>${esc(s.icon)}</span> ${esc(s.name)} ${s.archived ? '<span class="pill open">ARKIVERAD</span>' : ""}</h3>
      <div class="muted small">${esc(s.description) || "Ingen beskrivning"}</div>
      <div class="pb-stats">
        <div>Trades<b>${st.closed}${st.trades > st.closed ? ` (+${st.trades - st.closed})` : ""}</b></div>
        <div>Netto P&L<b class="${App.cls(st.netPnl)}">${fmt.short(st.netPnl)}</b></div>
        <div>Vinst-%<b>${fmt.pct(st.winPct, 0)}</b></div>
        <div>Profit factor<b>${fmt.ratio(st.profitFactor)}</b></div>
        <div>Förväntan<b class="${App.cls(st.expectancy)}">${fmt.short(st.expectancy)}</b></div>
        <div>Regler följda<b>${st.followPct === null ? "–" : fmt.pct(st.followPct, 0)}</b></div>
      </div>
      <div class="muted small" style="margin-top:8px">${s.rules} regler · ${st.missed} missade trades</div>
    </div>`;
  }

  function strategyDialog(existing = null) {
    const s = existing || { name: "", description: "", icon: "🎯", color: "#7c5cff", archived: 0 };
    const m = App.modal(
      `<h3>${existing ? "Redigera strategi" : "Ny strategi"}</h3>
      <div class="form-grid">
        <div class="field full"><label>Namn</label><input id="sd-name" value="${esc(s.name)}" placeholder="T.ex. VWAP-återtest SOL" /></div>
        <div class="field full"><label>Beskrivning</label><textarea id="sd-desc" placeholder="Kort: vad är idén bakom strategin?">${esc(s.description)}</textarea></div>
        <div class="field"><label>Ikon</label><div class="chip-select" id="sd-icons">${ICONS.map((i) => `<span class="chip${i === s.icon ? " on" : ""}" data-icon="${i}" ${i === s.icon ? 'style="background:var(--purple)"' : ""}>${i}</span>`).join("")}</div></div>
        <div class="field"><label>Färg</label><div class="chip-select" id="sd-colors">${COLORS.map((c) => `<span class="chip${c === s.color ? " on" : ""}" data-color="${c}" style="background:${c};color:#fff;${c === s.color ? "outline:2px solid #1f2340" : ""}">&nbsp;&nbsp;</span>`).join("")}</div></div>
        ${existing ? `<div class="field full"><label><input type="checkbox" id="sd-arch" ${s.archived ? "checked" : ""}/> Arkiverad (döljs i listor)</label></div>` : ""}
      </div>
      <div class="form-actions">${existing ? '<button class="btn danger" id="sd-del">Ta bort</button>' : ""}<span style="flex:1"></span><button class="btn" id="sd-cancel">Avbryt</button><button class="btn primary" id="sd-ok">${existing ? "Spara" : "Skapa"}</button></div>`,
    );
    let icon = s.icon, color = s.color;
    m.querySelector("#sd-icons").addEventListener("click", (e) => {
      const c = e.target.closest("[data-icon]");
      if (!c) return;
      icon = c.dataset.icon;
      m.querySelectorAll("[data-icon]").forEach((x) => {
        x.classList.toggle("on", x.dataset.icon === icon);
        x.style = x.dataset.icon === icon ? "background:var(--purple)" : "";
      });
    });
    m.querySelector("#sd-colors").addEventListener("click", (e) => {
      const c = e.target.closest("[data-color]");
      if (!c) return;
      color = c.dataset.color;
      m.querySelectorAll("[data-color]").forEach((x) => (x.style.outline = x.dataset.color === color ? "2px solid #1f2340" : "none"));
    });
    m.querySelector("#sd-cancel").addEventListener("click", App.closeModal);
    m.querySelector("#sd-del")?.addEventListener("click", async () => {
      if (!App.confirm("Ta bort strategin? Trades behålls men tappar kopplingen.")) return;
      await App.del(`/api/strategies/${existing.id}`);
      App.closeModal();
      await App.refreshMeta();
      App.navigate("#/playbook");
    });
    m.querySelector("#sd-ok").addEventListener("click", async () => {
      const body = { name: m.querySelector("#sd-name").value, description: m.querySelector("#sd-desc").value, icon, color, archived: m.querySelector("#sd-arch")?.checked || false };
      try {
        if (existing) await App.put(`/api/strategies/${existing.id}`, body);
        else {
          const r = await App.post("/api/strategies", body);
          App.closeModal();
          await App.refreshMeta();
          App.navigate(`#/playbook/${r.id}`);
          return;
        }
        App.closeModal();
        await App.refreshMeta();
        App.render();
      } catch (err) {
        App.toast(err.message, true);
      }
    });
  }

  async function renderDetail(el, id) {
    const s = await App.api(`/api/strategies/${id}`);
    const st = s.stats;
    const rs = new Map(s.ruleStats.map((r) => [r.rule_id, r]));
    const SHOW = { always: "Alltid", winner: "Vid vinst", loser: "Vid förlust", breakeven: "Vid break-even" };
    el.innerHTML = `
      <div class="toolbar"><a href="#/playbook" class="btn small">‹ Alla strategier</a><span style="flex:1"></span><button class="btn small" id="pd-edit">Redigera</button></div>
      <div class="card" style="border-top:4px solid ${s.color};margin-bottom:16px">
        <div class="trade-head"><h2>${esc(s.icon)} ${esc(s.name)}</h2><span class="follow-badge">Regler följda: ${st.followPct === null ? "–" : fmt.pct(st.followPct, 0)}</span></div>
        <div class="muted" style="margin:6px 0 12px">${esc(s.description)}</div>
        <div class="stats-grid" style="grid-template-columns:repeat(6,1fr)">
          <div class="st"><div class="l">Trades</div><div class="v">${st.closed}</div></div>
          <div class="st"><div class="l">Netto P&L</div><div class="v ${App.cls(st.netPnl)}">${fmt.signedMoney(st.netPnl, 0)}</div></div>
          <div class="st"><div class="l">Vinst-%</div><div class="v">${fmt.pct(st.winPct, 0)}</div></div>
          <div class="st"><div class="l">Profit factor</div><div class="v">${fmt.ratio(st.profitFactor)}</div></div>
          <div class="st"><div class="l">Förväntan</div><div class="v ${App.cls(st.expectancy)}">${fmt.signedMoney(st.expectancy)}</div></div>
          <div class="st"><div class="l">Snitt R</div><div class="v">${fmt.r(st.avgR)}</div></div>
        </div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-title">Regler <button class="btn small" id="pd-newgroup">＋ Grupp</button></div>
          ${s.groups
            .map(
              (g) => `<div class="rule-group" data-group="${g.id}">
              <h4 style="display:flex;justify-content:space-between;align-items:center">${esc(g.name)} <span><button class="btn small ghost" data-rename="${g.id}">✎</button><button class="btn small ghost" data-delgroup="${g.id}">✕</button></span></h4>
              ${g.rules
                .map((r) => {
                  const x = rs.get(r.id);
                  return `<div class="rule"><span class="txt">${esc(r.text)}<br><span class="meta">${r.phase === "exit" ? "Vid stängning" : "Innan trade"} · ${SHOW[r.show_when]} · följd ${x && x.followRate !== null ? fmt.pct(x.followRate, 0) : "–"} · P&L följd <b class="${App.cls(x?.pnlFollowed)}">${x ? fmt.short(x.pnlFollowed) : "–"}</b> / ej följd <b class="${App.cls(x?.pnlNotFollowed)}">${x ? fmt.short(x.pnlNotFollowed) : "–"}</b></span></span><button class="btn small ghost" data-editrule="${r.id}" data-text="${esc(r.text)}" data-show="${r.show_when}">✎</button><button class="btn small ghost" data-delrule="${r.id}">✕</button></div>`;
                })
                .join("")}
              <div style="display:flex;gap:6px;margin-top:4px"><input placeholder="Ny regel…" data-newrule="${g.id}" style="flex:1" /><select data-newphase="${g.id}"><option value="entry">Innan trade</option><option value="exit">Vid stängning</option></select><select data-newshow="${g.id}"><option value="always">Alltid</option><option value="winner">Visa vid vinst</option><option value="loser">Visa vid förlust</option><option value="breakeven">Visa vid break-even</option></select><button class="btn small" data-addrule="${g.id}">Lägg till</button></div>
            </div>`,
            )
            .join("")}
        </div>
        <div>
          <div class="card" style="margin-bottom:16px">
            <div class="card-title">Regelstatistik</div>
            ${s.ruleStats.length ? `<div class="table-wrap"><table><thead><tr><th>Regel</th><th class="num">Följd</th><th class="num">Vinst-% när följd</th><th class="num">PF när följd</th><th class="num">P&L följd</th><th class="num">P&L ej följd</th></tr></thead><tbody>${s.ruleStats
              .map((x) => {
                const r = s.groups.flatMap((g) => g.rules).find((y) => y.id === x.rule_id);
                return `<tr><td style="white-space:normal">${esc(r?.text || "")}</td><td class="num">${x.followRate === null ? "–" : fmt.pct(x.followRate, 0)}</td><td class="num">${x.winPctFollowed === null ? "–" : fmt.pct(x.winPctFollowed, 0)}</td><td class="num">${fmt.ratio(x.pfFollowed)}</td><td class="num ${App.cls(x.pnlFollowed)}">${fmt.short(x.pnlFollowed)}</td><td class="num ${App.cls(x.pnlNotFollowed)}">${fmt.short(x.pnlNotFollowed)}</td></tr>`;
              })
              .join("")}</tbody></table></div>` : '<span class="muted small">Lägg till regler och koppla trades så fylls tabellen.</span>'}
          </div>
          <div class="card">
            <div class="card-title">Missade trades (${s.missedTrades.length}) <button class="btn small" id="pd-missed">＋ Logga missad</button></div>
            <div class="muted small" style="margin-bottom:8px">Setups som uppfyllde reglerna men som du inte tog. Bra för att se om strategin ger fler chanser än du använder.</div>
            ${s.missedTrades.length ? `<div class="table-wrap"><table><thead><tr><th>Tid</th><th>Symbol</th><th>Sida</th><th class="num">Pris</th><th>Notering</th><th></th></tr></thead><tbody>${s.missedTrades.map((m) => `<tr><td>${fmt.dt(m.time)}</td><td>${esc(m.symbol)}</td><td>${App.sidePill(m.side)}</td><td class="num">${m.price === null ? "–" : fmt.price(m.price)}</td><td style="white-space:normal">${esc(m.notes)}</td><td><button class="btn small ghost" data-delmissed="${m.id}">✕</button></td></tr>`).join("")}</tbody></table></div>` : ""}
          </div>
        </div>
      </div>
      <div class="card"><div class="card-title">Senaste trades med strategin</div>
        ${s.recentTrades.length ? `<div class="table-wrap"><table class="trade-table"><thead>${App.TRADE_HEAD_COMPACT}</thead><tbody>${s.recentTrades.map((t) => App.tradeRow(t)).join("")}</tbody></table></div>` : '<span class="muted small">Inga trades kopplade ännu.</span>'}
      </div>`;
    el.querySelector("#pd-edit").addEventListener("click", () => strategyDialog(s));
    el.querySelector("#pd-newgroup").addEventListener("click", async () => {
      const name = prompt("Gruppens namn (t.ex. Entry-kriterier):");
      if (!name) return;
      await App.post(`/api/strategies/${id}/groups`, { name });
      App.render();
    });
    el.querySelectorAll("[data-rename]").forEach((b) =>
      b.addEventListener("click", async () => {
        const g = s.groups.find((x) => x.id === Number(b.dataset.rename));
        const name = prompt("Nytt namn:", g.name);
        if (!name) return;
        await App.put(`/api/groups/${g.id}`, { name });
        App.render();
      }),
    );
    el.querySelectorAll("[data-delgroup]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!App.confirm("Ta bort gruppen och dess regler?")) return;
        await App.del(`/api/groups/${b.dataset.delgroup}`);
        App.render();
      }),
    );
    el.querySelectorAll("[data-addrule]").forEach((b) =>
      b.addEventListener("click", async () => {
        const gid = b.dataset.addrule;
        const input = el.querySelector(`[data-newrule="${gid}"]`);
        if (!input.value.trim()) return;
        await App.post(`/api/groups/${gid}/rules`, { text: input.value, show_when: el.querySelector(`[data-newshow="${gid}"]`).value, phase: el.querySelector(`[data-newphase="${gid}"]`).value });
        App.render();
      }),
    );
    el.querySelectorAll("[data-newrule]").forEach((i) => i.addEventListener("keydown", (e) => e.key === "Enter" && el.querySelector(`[data-addrule="${i.dataset.newrule}"]`).click()));
    el.querySelectorAll("[data-editrule]").forEach((b) =>
      b.addEventListener("click", async () => {
        const text = prompt("Regeltext:", b.dataset.text);
        if (!text) return;
        await App.put(`/api/rules/${b.dataset.editrule}`, { text, show_when: b.dataset.show });
        App.render();
      }),
    );
    el.querySelectorAll("[data-delrule]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!App.confirm("Ta bort regeln? Bockar på befintliga trades försvinner.")) return;
        await App.del(`/api/rules/${b.dataset.delrule}`);
        App.render();
      }),
    );
    el.querySelectorAll("[data-delmissed]").forEach((b) =>
      b.addEventListener("click", async () => {
        await App.del(`/api/missed/${b.dataset.delmissed}`);
        App.render();
      }),
    );
    el.querySelector("#pd-missed").addEventListener("click", () => {
      const m = App.modal(
        `<h3>Logga missad trade</h3>
        <div class="form-grid">
          <div class="field"><label>Symbol</label><input id="mt-symbol" value="${esc(App.state.settings.defaultSymbol)}" /></div>
          <div class="field"><label>Sida</label><select id="mt-side"><option value="LONG">Long</option><option value="SHORT">Short</option></select></div>
          <div class="field"><label>Tidpunkt</label><input id="mt-time" type="datetime-local" value="${App.toLocalInput(Date.now())}" /></div>
          <div class="field"><label>Pris</label><input id="mt-price" type="number" step="any" /></div>
          <div class="field full"><label>Varför missade du den?</label><textarea id="mt-notes"></textarea></div>
        </div>
        <div class="form-actions"><button class="btn" id="mt-cancel">Avbryt</button><button class="btn primary" id="mt-ok">Spara</button></div>`,
        { narrow: true },
      );
      m.querySelector("#mt-cancel").addEventListener("click", App.closeModal);
      m.querySelector("#mt-ok").addEventListener("click", async () => {
        await App.post(`/api/strategies/${id}/missed`, { symbol: m.querySelector("#mt-symbol").value, side: m.querySelector("#mt-side").value, time: App.fromLocalInput(m.querySelector("#mt-time").value), price: m.querySelector("#mt-price").value ? Number(m.querySelector("#mt-price").value) : null, notes: m.querySelector("#mt-notes").value });
        App.closeModal();
        App.render();
      });
    });
    App.bindTradeRows(el);
  }
})();
