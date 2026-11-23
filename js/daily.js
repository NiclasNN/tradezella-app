/* Daglig journal: dagens trades, checklista, plan/genomgång, humör, betyg, bilagor + kalender och konsistens-heatmap */
(() => {
  "use strict";
  const App = window.App;
  const { fmt, esc } = App;
  const MOODS = ["Lugn", "Fokuserad", "Självsäker", "Otålig", "Stressad", "Trött", "Frustrerad", "Girig"];

  const shiftDay = (day, n) => {
    const [y, m, d] = day.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return dt.toISOString().slice(0, 10);
  };

  App.views.dagbok = {
    title: "Daglig journal",
    cal: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
    async render(el, [dayParam]) {
      const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : App.todayKey();
      const cal = App.views.dagbok.cal;
      if (!dayParam) {
        cal.year = new Date().getFullYear();
        cal.month = new Date().getMonth() + 1;
      }
      const [data, calData] = await Promise.all([App.api(`/api/daily/${day}`), App.api(`/api/calendar?year=${cal.year}&month=${cal.month}`)]);
      const dj = data.daily;
      const s = data.summary;
      let checklist = [];
      try {
        checklist = JSON.parse(dj.checklist || "[]");
      } catch {
        checklist = [];
      }
      const heat = heatmapHtml(calData.cells, calData.journaled, data);
      el.innerHTML = `
        <div class="toolbar">
          <div class="day-nav">
            <button class="btn small" id="d-prev">‹</button>
            <input type="date" id="d-pick" value="${day}" />
            <button class="btn small" id="d-next">›</button>
            <button class="btn small" id="d-today">Idag</button>
          </div>
          <h2 style="margin:0 0 0 8px;font-size:17px;text-transform:capitalize">${esc(fmt.dayLabel(day))}</h2>
          <span style="flex:1"></span>
          <button class="btn primary" id="d-add">＋ Lägg till trade denna dag</button>
        </div>
        <div class="day-layout">
          <div>
            <div class="stat-strip">
              <div>Netto P&L<b class="${App.cls(s.netPnl)}">${fmt.signedMoney(s.netPnl)}</b></div>
              <div>Trades<b>${s.closed}${s.open ? ` (+${s.open} öppna)` : ""}</b></div>
              <div>Vinst-%<b>${fmt.pct(s.tradeWinPct, 0)}</b></div>
              <div>Profit factor<b>${fmt.ratio(s.profitFactor)}</b></div>
              <div>Total R<b>${fmt.r(s.totalR)}</b></div>
              <div>Snitt betyg<b>${s.avgRating ? fmt.num(s.avgRating, 1) + " ★" : "–"}</b></div>
            </div>
            <div class="card" style="margin-bottom:16px">
              <div class="card-title">Dagens trades</div>
              ${data.trades.length ? `<div class="table-wrap"><table class="trade-table"><thead>${App.TRADE_HEAD}</thead><tbody>${data.trades.map((t) => App.tradeRow(t)).join("")}</tbody></table></div>` : '<span class="muted small">Inga trades loggade den här dagen.</span>'}
            </div>
            <div class="card" style="margin-bottom:16px">
              <div class="card-title">Pre-market plan</div>
              <div class="form-grid">
                <div class="field"><label>Dagens plan</label><textarea data-f="pre_plan" placeholder="Nyckelnivåer, scenario, max antal trades, riskbudget…">${esc(dj.pre_plan)}</textarea></div>
                <div class="field"><label>Bevakning / watchlist</label><textarea data-f="watchlist" placeholder="Vad bevakar du och varför?">${esc(dj.watchlist)}</textarea></div>
              </div>
            </div>
            <div class="card" style="margin-bottom:16px">
              <div class="card-title">Genomgång efter dagen</div>
              <div class="form-grid">
                <div class="field"><label>Vad gjorde jag bra</label><textarea data-f="did_great">${esc(dj.did_great)}</textarea></div>
                <div class="field"><label>Misstag jag gjorde</label><textarea data-f="mistakes">${esc(dj.mistakes)}</textarea></div>
                <div class="field full"><label>Sammanfattning &amp; lärdomar</label><textarea data-f="recap" placeholder="Följde jag planen? Vad tar jag med mig till i morgon?">${esc(dj.recap)}</textarea></div>
                <div class="field"><label>Humör</label><div class="chip-select mood-chips">${MOODS.map((m) => `<span class="chip${dj.mood === m ? " on" : ""}" data-mood="${m}" ${dj.mood === m ? 'style="background:var(--purple)"' : ""}>${m}</span>`).join("")}</div></div>
                <div class="field"><label>Dagsbetyg (disciplin, inte resultat)</label><div id="day-rating">${App.stars(dj.rating, true)}</div></div>
              </div>
              <div class="muted small" style="margin-top:8px" id="save-status">Sparas automatiskt.</div>
            </div>
            <div class="card">
              <div class="card-title">Skärmbilder för dagen</div>
              <div class="dropzone" id="day-dz">Klicka, dra in eller klistra in bilder (t.ex. dagens chart)</div>
              <div class="attachments" style="margin-top:12px">${data.attachments.map((a) => `<div class="att"><img src="${a.url}" data-url="${a.url}" alt="Skärmbild" /><button class="btn small danger del" data-att="${a.id}" aria-label="Ta bort bilden">✕</button></div>`).join("")}</div>
            </div>
          </div>
          <div>
            <div class="card" style="margin-bottom:16px">
              <div class="card-title">Daglig checklista <a href="#/installningar" class="small">Redigera</a></div>
              <div class="checklist">${data.checklist.map((c, i) => `<label class="item"><input type="checkbox" data-check="${i}" ${checklist[i] ? "checked" : ""} /><span>${esc(c.text)}</span></label>`).join("") || '<span class="muted small">Inga punkter.</span>'}</div>
              <div class="muted small" style="margin-top:6px" id="check-summary"></div>
            </div>
            <div class="card" style="margin-bottom:16px" id="mini-cal">${App.calendarHtml(calData.calendar, calData.journaled, { compact: true })}</div>
            <div class="card">
              <div class="card-title">Konsistens (senaste 13 veckorna)</div>
              ${heat}
              <div class="muted small" style="margin-top:6px">▪ journal &nbsp;▪ trades &nbsp;▪ båda</div>
            </div>
            <div class="card" style="margin-top:16px">
              <div class="card-title">Anteckningar den här dagen <button class="btn small" id="d-note">＋ Ny</button></div>
              ${data.notes.length ? `<div class="nb-list">${data.notes.map((n) => `<div class="item" data-note="${n.id}"><div class="t">${esc(n.title)}</div><div class="m">${fmt.time(n.updated_at)}</div></div>`).join("")}</div>` : '<span class="muted small">Inga anteckningar.</span>'}
            </div>
          </div>
        </div>`;

      const go = (d) => App.navigate(`#/dagbok/${d}`);
      el.querySelector("#d-prev").addEventListener("click", () => go(shiftDay(day, -1)));
      el.querySelector("#d-next").addEventListener("click", () => go(shiftDay(day, 1)));
      el.querySelector("#d-today").addEventListener("click", () => go(App.todayKey()));
      el.querySelector("#d-pick").addEventListener("change", (e) => e.target.value && go(e.target.value));
      el.querySelector("#d-add").addEventListener("click", () => App.quickTrade({ opened_at: App.fromLocalInput(`${day}T10:00`) }));
      App.bindTradeRows(el);
      App.bindCalendar(el.querySelector("#mini-cal"), cal, () => App.render());

      const save = async (patch) => {
        Object.assign(dj, patch);
        try {
          await App.put(`/api/daily/${day}`, { pre_plan: dj.pre_plan, watchlist: dj.watchlist, did_great: dj.did_great, mistakes: dj.mistakes, recap: dj.recap, mood: dj.mood, rating: dj.rating, checklist: JSON.stringify(checklist) });
          el.querySelector("#save-status").textContent = `Sparat ${new Date().toLocaleTimeString("sv-SE")}`;
        } catch (err) {
          App.toast(err.message, true);
        }
      };
      el.querySelectorAll("textarea[data-f]").forEach((ta) => ta.addEventListener("change", () => save({ [ta.dataset.f]: ta.value })));
      el.querySelectorAll("[data-mood]").forEach((c) =>
        c.addEventListener("click", () => {
          const v = dj.mood === c.dataset.mood ? "" : c.dataset.mood;
          el.querySelectorAll("[data-mood]").forEach((x) => {
            x.classList.toggle("on", x.dataset.mood === v);
            x.style = x.dataset.mood === v ? "background:var(--purple)" : "";
          });
          save({ mood: v });
        }),
      );
      el.querySelector("#day-rating").addEventListener("click", (e) => {
        const s2 = e.target.closest("[data-star]");
        if (!s2) return;
        const v = Number(s2.dataset.star) === dj.rating ? null : Number(s2.dataset.star);
        el.querySelectorAll("#day-rating [data-star]").forEach((x) => x.classList.toggle("off", Number(x.dataset.star) > (v || 0)));
        save({ rating: v });
      });
      const updateCheckSummary = () => {
        const boxes = [...el.querySelectorAll("[data-check]")];
        const done = boxes.filter((b) => b.checked).length;
        el.querySelector("#check-summary").textContent = boxes.length ? `${done}/${boxes.length} avklarade` : "";
      };
      updateCheckSummary();
      el.querySelectorAll("[data-check]").forEach((cb) =>
        cb.addEventListener("change", () => {
          checklist = [...el.querySelectorAll("[data-check]")].map((b) => b.checked);
          updateCheckSummary();
          save({});
        }),
      );
      App.bindDropzone(el.querySelector("#day-dz"), async (files) => {
        try {
          await App.uploadImages(`/api/daily/${day}/attachments`, files);
          App.render();
        } catch (err) {
          App.toast(err.message, true);
        }
      });
      el.querySelectorAll(".attachments .del").forEach((b) =>
        b.addEventListener("click", async () => {
          await App.del(`/api/attachments/${b.dataset.att}`);
          App.render();
        }),
      );
      el.querySelectorAll(".attachments img").forEach((img) => img.addEventListener("click", () => App.modal(`<img src="${img.dataset.url}" style="max-width:100%;border-radius:10px" />`)));
      el.querySelector("#d-note").addEventListener("click", async () => {
        const r = await App.post("/api/notes", { title: `Journal ${day}`, day, body: "## Pre-market plan\n\n## Vad gjorde jag bra\n\n## Misstag\n\n## Lärdomar\n" });
        App.navigate(`#/notebook/${r.id}`);
      });
      el.querySelectorAll("[data-note]").forEach((x) => x.addEventListener("click", () => App.navigate(`#/notebook/${x.dataset.note}`)));
    },
  };

  function heatmapHtml(cells, journaledMonth, data) {
    // 13 veckor bakåt från idag; journal-dagar hämtas från dashboard-anropet (alla) – här visar vi trades + journalerade dagar vi känner till
    const tradeDays = new Set(cells.map((c) => c.day));
    const jDays = new Set([...(journaledMonth || []), ...(App.state.journaledDays || [])]);
    const today = App.todayKey();
    const [y, m, d] = today.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, d));
    const dow = (start.getUTCDay() + 6) % 7;
    const first = new Date(start.getTime() - (dow + 12 * 7) * 86400000);
    let html = '<div class="heatmap">';
    for (let col = 0; col < 13; col++) {
      for (let row = 0; row < 7; row++) {
        const dt = new Date(first.getTime() + (col * 7 + row) * 86400000);
        const key = dt.toISOString().slice(0, 10);
        if (key > today) {
          html += "<i></i>";
          continue;
        }
        const t = tradeDays.has(key), j = jDays.has(key);
        html += `<i class="${t && j ? "jt" : j ? "j" : t ? "t" : ""}" title="${key}"></i>`;
      }
    }
    void data;
    return html + "</div>";
  }
})();
