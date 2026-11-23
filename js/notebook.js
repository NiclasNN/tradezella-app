/* Notebook: mappar, anteckningar, mallar, markdown-förhandsvisning, länk till dag/trade, bilagor */
(() => {
  "use strict";
  const App = window.App;
  const { fmt, esc } = App;

  const TEMPLATES = {
    "Pre-market plan": "# Pre-market plan\n\n## Marknadsläge\n- Trend på 1h/4h:\n- Nyckelnivåer:\n\n## Scenario\n- Om pris gör X → jag gör Y\n\n## Regler för dagen\n- Max trades:\n- Max risk:\n- Endast setup:\n",
    "Dagens sammanfattning": "# Dagens sammanfattning\n\n## Resultat\n\n## Vad gjorde jag bra\n\n## Misstag jag gjorde\n\n## Följde jag planen? Varför/varför inte?\n\n## Fokus i morgon\n",
    "Veckogenomgång": "# Veckogenomgång\n\n## Siffror\n- Netto P&L:\n- Vinst-%:\n- Profit factor:\n\n## Vad fungerade\n\n## Vad fungerade inte\n\n## Mönster jag ser\n\n## Fokus nästa vecka (max 2 saker)\n",
    "Trade-genomgång": "# Trade-genomgång\n\n## Setup\n\n## Utförande\n- Entry:\n- Stopp:\n- Exit:\n\n## Vad gjorde jag bra\n\n## Vad gör jag annorlunda nästa gång\n",
    "Tradingplan": "# Tradingplan\n\n**Instrument:**\n**Tidsfönster:**\n**Risk per trade:**\n**Max dagsförlust:**\n\n## Setups jag handlar\n1.\n\n## Setups jag INTE handlar\n\n## Regler för stopp och mål\n\n## Regler för när jag slutar för dagen\n",
  };

  App.views.notebook = {
    title: "Notebook",
    state: { folder: null, q: "", preview: false },
    async render(el, [noteId]) {
      const st = App.views.notebook.state;
      const [folders, notes] = await Promise.all([App.api("/api/folders"), App.api(`/api/notes?${st.folder ? "folder_id=" + st.folder + "&" : ""}${st.q ? "q=" + encodeURIComponent(st.q) : ""}`)]);
      const note = noteId ? await App.api(`/api/notes/${noteId}`).catch(() => null) : null;
      el.innerHTML = `
        <div class="nb-layout">
          <div class="card">
            <div class="card-title">Mappar <button class="btn small" id="nb-newfolder">＋</button></div>
            <div class="nb-list">
              <div class="item${st.folder === null ? " active" : ""}" data-folder=""><div class="t">Alla anteckningar</div></div>
              ${folders.map((f) => `<div class="item${st.folder === f.id ? " active" : ""}" data-folder="${f.id}"><div class="t">${esc(f.name)}</div><div class="m">${f.notes} st</div></div>`).join("")}
            </div>
          </div>
          <div class="card">
            <div class="card-title">Anteckningar <button class="btn small primary" id="nb-new">＋ Ny</button></div>
            <input id="nb-q" placeholder="Sök…" value="${esc(st.q)}" style="width:100%;margin-bottom:8px" />
            <div class="nb-list">${notes.map((n) => `<div class="item${note && note.id === n.id ? " active" : ""}" data-note="${n.id}"><div class="t">${n.pinned ? "📌 " : ""}${esc(n.title)}</div><div class="m">${fmt.dt(n.updated_at)}${n.day ? " · " + n.day : ""}${n.tags ? " · " + esc(n.tags) : ""}</div></div>`).join("") || '<span class="muted small">Inga anteckningar.</span>'}</div>
          </div>
          <div class="card nb-editor" id="nb-editor">${note ? "" : '<div class="muted" style="padding:30px;text-align:center">Välj en anteckning till vänster eller skapa en ny.<br><br>Mallar: pre-market plan, dagens sammanfattning, veckogenomgång, trade-genomgång, tradingplan.</div>'}</div>
        </div>`;
      el.querySelectorAll("[data-folder]").forEach((x) =>
        x.addEventListener("click", () => {
          st.folder = x.dataset.folder ? Number(x.dataset.folder) : null;
          App.render();
        }),
      );
      el.querySelectorAll("[data-note]").forEach((x) => x.addEventListener("click", () => App.navigate(`#/notebook/${x.dataset.note}`)));
      let qt;
      el.querySelector("#nb-q").addEventListener("input", (e) => {
        clearTimeout(qt);
        qt = setTimeout(() => {
          st.q = e.target.value;
          App.render();
        }, 300);
      });
      el.querySelector("#nb-newfolder").addEventListener("click", async () => {
        const name = prompt("Mappens namn:");
        if (!name) return;
        await App.post("/api/folders", { name });
        App.render();
      });
      el.querySelector("#nb-new").addEventListener("click", () => newNoteDialog(st.folder));
      if (note) renderEditor(el.querySelector("#nb-editor"), note, folders);
    },
  };

  function newNoteDialog(folderId) {
    const m = App.modal(
      `<h3>Ny anteckning</h3>
      <div class="field"><label>Mall</label><select id="nn-tpl"><option value="">Tom</option>${Object.keys(TEMPLATES).map((k) => `<option>${k}</option>`).join("")}</select></div>
      <div class="field" style="margin-top:10px"><label>Titel</label><input id="nn-title" placeholder="T.ex. Veckogenomgång v.37" /></div>
      <div class="form-actions"><button class="btn" id="nn-cancel">Avbryt</button><button class="btn primary" id="nn-ok">Skapa</button></div>`,
      { narrow: true },
    );
    m.querySelector("#nn-tpl").addEventListener("change", (e) => {
      if (!m.querySelector("#nn-title").value) m.querySelector("#nn-title").value = e.target.value;
    });
    m.querySelector("#nn-cancel").addEventListener("click", App.closeModal);
    m.querySelector("#nn-ok").addEventListener("click", async () => {
      const tpl = m.querySelector("#nn-tpl").value;
      const r = await App.post("/api/notes", { title: m.querySelector("#nn-title").value || tpl || "Ny anteckning", body: TEMPLATES[tpl] || "", folder_id: folderId });
      App.closeModal();
      App.navigate(`#/notebook/${r.id}`);
    });
  }

  function renderEditor(box, note, folders) {
    const st = App.views.notebook.state;
    box.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
        <select id="ne-folder">${`<option value="">Ingen mapp</option>` + folders.map((f) => `<option value="${f.id}" ${note.folder_id === f.id ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</select>
        <input id="ne-day" type="date" value="${note.day || ""}" title="Länka till dag" />
        <input id="ne-tags" placeholder="taggar, komma-separerade" value="${esc(note.tags)}" style="flex:1;min-width:140px" />
        <label class="small muted"><input type="checkbox" id="ne-pinned" ${note.pinned ? "checked" : ""}/> Fäst</label>
        <button class="btn small" id="ne-preview">${st.preview ? "Redigera" : "Förhandsvisa"}</button>
        <button class="btn small danger" id="ne-del">Ta bort</button>
      </div>
      <input class="title" id="ne-title" value="${esc(note.title)}" />
      ${st.preview ? `<div style="padding:10px 4px">${App.md(note.body)}</div>` : `<textarea id="ne-body" placeholder="Skriv… (markdown: # rubrik, - lista, **fet**)">${esc(note.body)}</textarea>`}
      <div class="muted small" style="margin-top:6px" id="ne-status">${note.trade_id ? `Länkad till <a href="#/trade/${note.trade_id}">trade #${note.trade_id}</a> · ` : ""}Sparas automatiskt.</div>
      <div style="margin-top:12px"><div class="card-title">Bilder</div><div class="dropzone" id="ne-dz">Klicka, dra in eller klistra in bilder</div>
      <div class="attachments" style="margin-top:10px">${(note.attachments || []).map((a) => `<div class="att"><img src="${a.url}" data-url="${a.url}" /><button class="btn small danger del" data-att="${a.id}">✕</button></div>`).join("")}</div></div>`;
    const save = async () => {
      const body = {
        folder_id: box.querySelector("#ne-folder").value ? Number(box.querySelector("#ne-folder").value) : null,
        title: box.querySelector("#ne-title").value,
        body: st.preview ? note.body : box.querySelector("#ne-body").value,
        day: box.querySelector("#ne-day").value || null,
        trade_id: note.trade_id,
        tags: box.querySelector("#ne-tags").value,
        pinned: box.querySelector("#ne-pinned").checked,
      };
      note.body = body.body;
      await App.put(`/api/notes/${note.id}`, body);
      box.querySelector("#ne-status").textContent = `Sparat ${new Date().toLocaleTimeString("sv-SE")}`;
    };
    let t;
    box.querySelectorAll("#ne-title, #ne-body, #ne-tags").forEach((x) =>
      x.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(save, 600);
      }),
    );
    box.querySelectorAll("#ne-folder, #ne-day, #ne-pinned").forEach((x) => x.addEventListener("change", save));
    box.querySelector("#ne-preview").addEventListener("click", async () => {
      if (!st.preview) await save();
      st.preview = !st.preview;
      App.render();
    });
    box.querySelector("#ne-del").addEventListener("click", async () => {
      if (!App.confirm("Ta bort anteckningen?")) return;
      await App.del(`/api/notes/${note.id}`);
      App.navigate("#/notebook");
    });
    App.bindDropzone(box.querySelector("#ne-dz"), async (files) => {
      await App.uploadImages(`/api/notes/${note.id}/attachments`, files);
      App.render();
    });
    box.querySelectorAll(".attachments .del").forEach((b) =>
      b.addEventListener("click", async () => {
        await App.del(`/api/attachments/${b.dataset.att}`);
        App.render();
      }),
    );
    box.querySelectorAll(".attachments img").forEach((img) => img.addEventListener("click", () => App.modal(`<img src="${img.dataset.url}" style="max-width:100%;border-radius:10px" />`)));
  }
})();
