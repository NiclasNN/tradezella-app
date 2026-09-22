/* Inställningar: konto, taggar, checklista, exempeldata, backup */
(() => {
  "use strict";
  const App = window.App;
  const { esc } = App;
  const COLORS = ["#7c5cff", "#22a06b", "#e5484d", "#f59e0b", "#3b82f6", "#14b8a6", "#ec4899", "#8b5cf6", "#7a7f9a"];

  App.views.installningar = {
    title: "Inställningar",
    async render(el) {
      const [st, tags, checklist] = await Promise.all([App.api("/api/settings"), App.api("/api/tags"), App.api("/api/checklist")]);
      const s = st.settings;
      el.innerHTML = `
        <div class="grid-halves">
          <div class="card">
            <div class="card-title">Konto</div>
            <div class="form-grid">
              <div class="field"><label>Startkapital</label><input id="s-balance" type="number" step="any" value="${s.startBalance}" /><span class="hint">Används för avkastning i % och kontosaldo-widgeten.</span></div>
              <div class="field"><label>Valuta</label><input id="s-currency" value="${esc(s.currency)}" /></div>
              <div class="field"><label>Standard-symbol</label><input id="s-symbol" value="${esc(s.defaultSymbol)}" /></div>
              <div class="field"><label>Risk per trade (%)</label><input id="s-risk" type="number" step="any" value="${s.riskPerTradePct}" /><span class="hint">Standard i positionskalkylatorn.</span></div>
              <div class="field"><label>Hävstångstak (×)</label><input id="s-lev" type="number" step="any" value="${s.maxLeverage}" /><span class="hint">Kalkylatorn varnar när storleken kräver mer.</span></div>
            </div>
            <div class="form-actions" style="justify-content:flex-start"><button class="btn primary" id="s-save">Spara</button></div>
          </div>
          <div class="card">
            <div class="card-title">Checklistor vid trade</div>
            <div class="muted small" style="margin-bottom:8px">Visas i två steg: innan du loggar en trade ("följer jag min strategi?") och innan du stänger ("stänger jag av rätt skäl?"). Punkterna väljer du själv.</div>
            <div class="form-actions" style="justify-content:flex-start"><button class="btn" id="cl-entry">Ändra: innan ny trade</button><button class="btn" id="cl-exit">Ändra: innan stängning</button></div>
            <div class="card-title" style="margin-top:16px">Daglig checklista</div>
            <div class="muted small" style="margin-bottom:8px">Punkterna visas i Daglig journal och bockas av per dag.</div>
            <div id="cl-items">${checklist.map((c) => `<div style="display:flex;gap:6px;margin-bottom:6px"><input data-clid="${c.id}" value="${esc(c.text)}" style="flex:1" /><button class="btn small ghost cl-del">✕</button></div>`).join("")}</div>
            <div class="form-actions" style="justify-content:flex-start"><button class="btn small" id="cl-add">＋ Punkt</button><button class="btn primary" id="cl-save">Spara checklista</button></div>
          </div>
        </div>
        <details class="card" style="margin-bottom:16px"><summary style="cursor:pointer;font-weight:700">Avancerat: taggar</summary>
          <div class="card-title" style="margin-top:10px">Taggar <button class="btn small" id="t-newcat">＋ Ny kategori</button></div>
          <div class="muted small" style="margin-bottom:10px">Kategorierna Setups och Misstag används i rapporter och insikter. Lägg till egna kategorier (t.ex. Marknadsläge, Känslor, Tidsfönster).</div>
          <div class="grid-3">${tags
            .map(
              (c) => `<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b>${esc(c.name)}</b> <span class="muted small">${c.kind === "setup" ? "setups" : c.kind === "mistake" ? "misstag" : "egen"}</span><span><button class="btn small ghost" data-rencat="${c.id}">✎</button>${c.kind === "custom" ? `<button class="btn small ghost" data-delcat="${c.id}">✕</button>` : ""}</span></div>
              <div class="chip-select">${c.tags.map((t) => `<span class="chip on" style="background:${t.color}" data-tag="${t.id}" data-name="${esc(t.name)}" data-color="${t.color}" title="Klicka för att byta namn/färg">${esc(t.name)}</span>`).join("")}<span class="chip" data-newtag="${c.id}" style="color:var(--muted)">＋</span></div>
            </div>`,
            )
            .join("")}</div>
        </details>
        <div class="grid-halves">
          <div class="card">
            <div class="card-title">Exempeldata</div>
            <p class="muted small">Skapar ~60 påhittade SOL-trades med strategi, regler, taggar och journalanteckningar under senaste två månaderna, så att du ser hur allt ser ut ifyllt. Allt är märkt som exempel och kan tas bort med ett klick utan att röra dina egna trades.</p>
            <div class="form-actions" style="justify-content:flex-start">${st.hasSample ? '<button class="btn danger" id="x-clear">Ta bort exempeldata</button>' : '<button class="btn primary" id="x-create">Skapa exempeldata</button>'}</div>
          </div>
          <div class="card">
            <div class="card-title">Backup</div>
            <p class="muted small">${App.isStatic() ? "Journalen ligger i den här webbläsaren (och i molnet om synk är på). Ta en backup då och då." : "Allt ligger lokalt i <code>data/journal.db</code> och <code>data/attachments/</code>. Exportera en JSON-backup då och då."} Import ersätter hela journalen med filens innehåll.</p>
            <div class="form-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn" id="x-export">Exportera backup (JSON)</button><button class="btn" id="x-csv">Exportera trades (CSV)</button><label class="btn">Importera backup… <input type="file" id="x-import" accept="application/json" style="display:none" /></label></div>
          </div>
        </div>
        ${App.isStatic() ? `
        <div class="grid-halves">
          <div class="card" id="sync-card">
            <div class="card-title">Molnsynk via GitHub <span id="sync-status" class="muted small"></span></div>
            <div id="sync-body"></div>
          </div>
          <div class="card">
            <div class="card-title">PIN-lås</div>
            <p class="muted small">Låser appen på den här enheten. Frågas vid varje ny flik eller omstart.</p>
            <div class="form-actions" style="justify-content:flex-start"><input id="pin-new" type="password" inputmode="numeric" placeholder="Ny PIN (4–8 siffror)" style="width:170px" /><button class="btn primary" id="pin-save">Spara PIN</button>${App.pin.isSet() ? '<button class="btn danger" id="pin-clear">Ta bort PIN</button>' : ""}</div>
          </div>
        </div>` : ""}`;
      el.querySelector("#s-save").addEventListener("click", async () => {
        try {
          await App.put("/api/settings", { startBalance: Number(el.querySelector("#s-balance").value), currency: el.querySelector("#s-currency").value, defaultSymbol: el.querySelector("#s-symbol").value, riskPerTradePct: Number(el.querySelector("#s-risk").value), maxLeverage: Number(el.querySelector("#s-lev").value) });
          await App.refreshMeta();
          App.toast("Inställningar sparade");
        } catch (err) {
          App.toast(err.message, true);
        }
      });
      const strat = (App.state.strategies || [])[0];
      el.querySelector("#cl-entry").addEventListener("click", () => (strat ? App.checklistEditor(strat.id, "entry") : App.toast("Skapa en strategi under Playbook först", true)));
      el.querySelector("#cl-exit").addEventListener("click", () => (strat ? App.checklistEditor(strat.id, "exit") : App.toast("Skapa en strategi under Playbook först", true)));
      const clBox = el.querySelector("#cl-items");
      el.querySelector("#cl-add").addEventListener("click", () => clBox.insertAdjacentHTML("beforeend", `<div style="display:flex;gap:6px;margin-bottom:6px"><input data-clid="" placeholder="Ny punkt" style="flex:1" /><button class="btn small ghost cl-del">✕</button></div>`));
      clBox.addEventListener("click", (e) => e.target.classList.contains("cl-del") && e.target.parentElement.remove());
      el.querySelector("#cl-save").addEventListener("click", async () => {
        const items = [...clBox.querySelectorAll("input[data-clid]")].map((i) => ({ id: i.dataset.clid ? Number(i.dataset.clid) : undefined, text: i.value })).filter((x) => x.text.trim());
        await App.put("/api/checklist", { items });
        App.toast("Checklista sparad");
        App.render();
      });
      el.querySelector("#t-newcat").addEventListener("click", async () => {
        const name = prompt("Kategorins namn:");
        if (!name) return;
        await App.post("/api/tags/categories", { name, kind: "custom" });
        await App.refreshMeta();
        App.render();
      });
      el.querySelectorAll("[data-rencat]").forEach((b) =>
        b.addEventListener("click", async () => {
          const c = tags.find((x) => x.id === Number(b.dataset.rencat));
          const name = prompt("Nytt namn:", c.name);
          if (!name) return;
          await App.put(`/api/tags/categories/${c.id}`, { name });
          await App.refreshMeta();
          App.render();
        }),
      );
      el.querySelectorAll("[data-delcat]").forEach((b) =>
        b.addEventListener("click", async () => {
          if (!App.confirm("Ta bort kategorin och alla dess taggar?")) return;
          await App.del(`/api/tags/categories/${b.dataset.delcat}`);
          await App.refreshMeta();
          App.render();
        }),
      );
      el.querySelectorAll("[data-newtag]").forEach((b) =>
        b.addEventListener("click", async () => {
          const name = prompt("Taggens namn:");
          if (!name) return;
          await App.post("/api/tags", { category_id: Number(b.dataset.newtag), name, color: COLORS[Math.floor(Math.random() * COLORS.length)] });
          await App.refreshMeta();
          App.render();
        }),
      );
      el.querySelectorAll("[data-tag]").forEach((chip) =>
        chip.addEventListener("click", () => {
          const m = App.modal(
            `<h3>Redigera tagg</h3><div class="field"><label>Namn</label><input id="tg-name" value="${esc(chip.dataset.name)}" /></div>
            <div class="field" style="margin-top:10px"><label>Färg</label><div class="chip-select" id="tg-colors">${COLORS.map((c) => `<span class="chip" data-color="${c}" style="background:${c};color:#fff;${c === chip.dataset.color ? "outline:2px solid #1f2340" : ""}">&nbsp;&nbsp;</span>`).join("")}</div></div>
            <div class="form-actions"><button class="btn danger" id="tg-del">Ta bort</button><span style="flex:1"></span><button class="btn" id="tg-cancel">Avbryt</button><button class="btn primary" id="tg-ok">Spara</button></div>`,
            { narrow: true },
          );
          let color = chip.dataset.color;
          m.querySelector("#tg-colors").addEventListener("click", (e) => {
            const c = e.target.closest("[data-color]");
            if (!c) return;
            color = c.dataset.color;
            m.querySelectorAll("[data-color]").forEach((x) => (x.style.outline = x.dataset.color === color ? "2px solid #1f2340" : "none"));
          });
          m.querySelector("#tg-cancel").addEventListener("click", App.closeModal);
          m.querySelector("#tg-del").addEventListener("click", async () => {
            if (!App.confirm("Ta bort taggen från alla trades?")) return;
            await App.del(`/api/tags/${chip.dataset.tag}`);
            App.closeModal();
            await App.refreshMeta();
            App.render();
          });
          m.querySelector("#tg-ok").addEventListener("click", async () => {
            await App.put(`/api/tags/${chip.dataset.tag}`, { name: m.querySelector("#tg-name").value, color });
            App.closeModal();
            await App.refreshMeta();
            App.render();
          });
        }),
      );
      el.querySelector("#x-create")?.addEventListener("click", async () => {
        const r = await App.post("/api/sample");
        await App.refreshMeta();
        App.toast(`${r.trades} exempeltrades skapade`);
        App.navigate("#/oversikt");
      });
      el.querySelector("#x-clear")?.addEventListener("click", async () => {
        if (!App.confirm("Ta bort all exempeldata? Dina egna trades påverkas inte.")) return;
        await App.del("/api/sample");
        await App.refreshMeta();
        App.toast("Exempeldata borttagen");
        App.render();
      });
      el.querySelector("#x-export").addEventListener("click", () => App.download("/api/export").catch((err) => App.toast(err.message, true)));
      el.querySelector("#x-csv").addEventListener("click", () => App.download("/api/export.csv").catch((err) => App.toast(err.message, true)));
      if (App.isStatic()) {
        const renderSync = () => {
          const cfg = window.LocalApi.sync.config();
          const st = window.LocalApi.status;
          el.querySelector("#sync-status").textContent = st.text + (st.lastSyncAt ? " · " + new Date(st.lastSyncAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }) : "");
          el.querySelector("#sync-body").innerHTML = cfg
            ? `<p class="small">Kopplad till <b>${esc(cfg.owner)}/${esc(cfg.repo)}</b> (privat repo). Ändringar sparas automatiskt några sekunder efter varje ändring; på en ny enhet klistrar du in samma token så hämtas allt.</p>
               ${st.error ? `<div class="insight weakness" style="margin-bottom:8px">⚠️ ${esc(st.error)}</div>` : ""}
               <div class="form-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn" id="sync-pull">Hämta från molnet</button><button class="btn" id="sync-push">Skicka till molnet</button><button class="btn danger" id="sync-off">Koppla från</button></div>
               <details style="margin-top:10px" id="link-details"><summary style="cursor:pointer;font-weight:600">Koppla en annan enhet (mobil, iMac, PC)</summary>
                 <p class="small muted" style="margin:8px 0">Mobil: öppna kameran och skanna. Dator: tryck Kopiera länk, skicka den till dig själv (AirDrop, iMessage, mejl) och öppna den där. Länken innehåller din nyckel, så skicka den bara till dig själv.</p>
                 <div class="qr-wrap" id="qr-wrap"></div>
                 <div class="form-actions" style="justify-content:flex-start;flex-wrap:wrap"><input id="link-field" readonly style="flex:1;min-width:220px;font-size:12px" /><button class="btn primary" id="link-copy">Kopiera länk</button></div>
               </details>
               <details style="margin-top:8px"><summary class="muted small" style="cursor:pointer">Vid konflikt</summary><div class="form-actions" style="justify-content:flex-start"><button class="btn small" id="sync-pull-force">Hämta och kasta lokala ändringar</button><button class="btn small" id="sync-push-force">Skriv över molnet med den här enheten</button></div></details>`
            : `<p class="small">Gratis och privat: journalen sparas som en fil i ett privat GitHub-repo som bara du kommer åt, så att iMac och mobil ser samma data.</p>
               <ol class="small" style="padding-left:18px;margin:6px 0 10px;line-height:1.6">
                 <li>Öppna <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com → Fine-grained token</a>.</li>
                 <li>Namn: <b>tradezella</b>. Expiration: så långt som möjligt. Repository access: <b>Only select repositories</b> → välj <b>tradezella-data</b> (skapa repot först som <i>privat</i> på github.com/new om det inte finns, eller låt appen skapa det).</li>
                 <li>Permissions → Repository permissions → <b>Contents: Read and write</b>. Generate token och kopiera.</li>
                 <li>Klistra in här. Samma token på mobilen.</li>
               </ol>
               <div class="form-grid"><div class="field"><label>GitHub-användare</label><input id="sync-owner" value="NiclasNN" /></div><div class="field"><label>Repo (privat)</label><input id="sync-repo" value="tradezella-data" /></div><div class="field full"><label>Token</label><input id="sync-token" type="password" placeholder="github_pat_…" /></div></div>
               <div class="form-actions" style="justify-content:flex-start"><button class="btn primary" id="sync-connect">Koppla</button><span id="sync-msg" class="muted small"></span></div>`;
          if (cfg) {
            const link = window.LocalApi.sync.link();
            el.querySelector("#link-field").value = link;
            el.querySelector("#qr-wrap").innerHTML = window.LocalApi.sync.qrSvg(link);
            el.querySelector("#link-copy").addEventListener("click", async () => {
              try {
                await navigator.clipboard.writeText(link);
                App.toast("Länken kopierad – skicka den till dig själv och öppna på den andra enheten");
              } catch {
                el.querySelector("#link-field").select();
                App.toast("Markera länken och kopiera med Cmd+C", true);
              }
            });
          }
          el.querySelector("#sync-connect")?.addEventListener("click", async () => {
            const msg = el.querySelector("#sync-msg");
            msg.textContent = "Kontrollerar…";
            const r = await window.LocalApi.sync.connect(el.querySelector("#sync-token").value, el.querySelector("#sync-owner").value, el.querySelector("#sync-repo").value);
            msg.textContent = r.message;
            if (r.ok) {
              App.toast("Molnsynk kopplad");
              renderSync();
            }
          });
          el.querySelector("#sync-pull")?.addEventListener("click", async () => (await window.LocalApi.sync.pull(false), renderSync()));
          el.querySelector("#sync-push")?.addEventListener("click", async () => (await window.LocalApi.sync.push(false), renderSync()));
          el.querySelector("#sync-pull-force")?.addEventListener("click", async () => App.confirm("Kasta lokala ändringar och hämta molnets version?") && (await window.LocalApi.sync.pull(true), renderSync()));
          el.querySelector("#sync-push-force")?.addEventListener("click", async () => App.confirm("Skriv över molnet med den här enhetens data?") && (await window.LocalApi.sync.push(true), renderSync()));
          el.querySelector("#sync-off")?.addEventListener("click", () => (window.LocalApi.sync.disconnect(), renderSync()));
        };
        renderSync();
        window.LocalApi.onStatus(() => document.getElementById("sync-body") && renderSync());
        el.querySelector("#pin-save").addEventListener("click", async () => {
          const v = el.querySelector("#pin-new").value.trim();
          if (!/^\d{4,8}$/.test(v)) return App.toast("PIN ska vara 4–8 siffror", true);
          await App.pin.set(v);
          sessionStorage.setItem("tz.unlocked", "1");
          App.toast("PIN sparad");
          App.render();
        });
        el.querySelector("#pin-clear")?.addEventListener("click", async () => (await App.pin.set(""), App.toast("PIN borttagen"), App.render()));
      }
      el.querySelector("#x-import").addEventListener("change", async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (!App.confirm("Import ERSÄTTER hela journalen med filens innehåll. Fortsätta?")) return;
        try {
          const text = await f.text();
          const r = await App.post("/api/import", JSON.parse(text));
          await App.refreshMeta();
          App.toast(`Importerade ${r.rows} rader`);
          App.navigate("#/oversikt");
        } catch (err) {
          App.toast(err.message, true);
        }
      });
    },
  };
})();
