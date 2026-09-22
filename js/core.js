/* Kärna: API, formatering, router, komponenter. Allt på window.App. */
(() => {
  "use strict";
  const App = (window.App = window.App || {});
  const views = {};
  App.views = views;
  App.state = { settings: { startBalance: 10000, defaultSymbol: "SOLUSDT", currency: "USDT" }, range: localStorage.getItem("tz.range") || "30", strategies: [], tags: [] };

  // ---------------------------------------------------------------- API
  App.isStatic = () => Boolean(window.LocalApi);
  App.api = async function api(path, opts = {}) {
    if (window.LocalApi) {
      const method = (opts.method || "GET").toUpperCase();
      const body = opts.body ? JSON.parse(opts.body) : undefined;
      const r = await window.LocalApi.dispatch(method, path, body);
      if (r.status !== 200) throw new Error((r.body && r.body.error) || `Fel ${r.status}`);
      return r.body;
    }
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 && json.login) {
      location.href = "/login";
      throw new Error("Inte inloggad");
    }
    if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  };
  App.post = (p, b) => App.api(p, { method: "POST", body: JSON.stringify(b ?? {}) });
  App.put = (p, b) => App.api(p, { method: "PUT", body: JSON.stringify(b ?? {}) });
  App.patch = (p, b) => App.api(p, { method: "PATCH", body: JSON.stringify(b ?? {}) });
  App.del = (p) => App.api(p, { method: "DELETE" });

  // ---------------------------------------------------------------- formatering
  const cur = () => App.state.settings.currency || "USDT";
  const nf = (d) => new Intl.NumberFormat("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });
  App.fmt = {
    money(v, d) {
      if (v === null || v === undefined || Number.isNaN(v)) return "–";
      const dec = d ?? (Math.abs(v) >= 1000 ? 0 : 2);
      return `${v < 0 ? "−" : ""}${nf(dec).format(Math.abs(v))} ${cur()}`;
    },
    signed(v, d) {
      if (v === null || v === undefined || Number.isNaN(v)) return "–";
      const dec = d ?? (Math.abs(v) >= 1000 ? 0 : 2);
      return `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf(dec).format(Math.abs(v))}`;
    },
    signedMoney(v, d) {
      if (v === null || v === undefined || Number.isNaN(v)) return "–";
      return `${App.fmt.signed(v, d)} ${cur()}`;
    },
    /** Belopp med valutan som liten suffix (för widgets). */
    moneyHtml(v, d, signed = true) {
      if (v === null || v === undefined || Number.isNaN(v)) return "–";
      const dec = d ?? (Math.abs(v) >= 1000 ? 0 : 2);
      const n = signed ? App.fmt.signed(v, dec) : `${v < 0 ? "−" : ""}${nf(dec).format(Math.abs(v))}`;
      return `${n}<small>${App.esc(cur())}</small>`;
    },
    short(v) {
      if (v === null || v === undefined || Number.isNaN(v)) return "–";
      const a = Math.abs(v);
      const s = a >= 1_000_000 ? (a / 1_000_000).toFixed(2) + "M" : a >= 1000 ? (a / 1000).toFixed(2) + "K" : a.toFixed(a >= 100 ? 0 : 2);
      return `${v < 0 ? "−" : v > 0 ? "+" : ""}${s}`;
    },
    pct(v, d = 1) {
      if (v === null || v === undefined || Number.isNaN(v)) return "–";
      return `${nf(d).format(v)} %`;
    },
    num(v, d = 2) {
      if (v === null || v === undefined || Number.isNaN(v)) return "–";
      if (v === Infinity) return "∞";
      return nf(d).format(v);
    },
    price(v) {
      if (v === null || v === undefined || Number.isNaN(v)) return "–";
      return nf(Math.abs(v) < 1 ? 4 : Math.abs(v) < 100 ? 3 : 2).format(v);
    },
    r(v) {
      if (v === null || v === undefined || Number.isNaN(v)) return "–";
      return `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf(2).format(Math.abs(v))}R`;
    },
    ratio(v) {
      if (v === null || v === undefined) return "–";
      if (v === Infinity) return "∞";
      return nf(2).format(v);
    },
    dt(ms) {
      if (!ms) return "–";
      return new Date(ms).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    },
    date(ms) {
      if (!ms) return "–";
      return new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
    },
    time(ms) {
      if (!ms) return "–";
      return new Date(ms).toLocaleTimeString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" });
    },
    dayLabel(day) {
      const [y, m, d] = day.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    },
    dur(ms) {
      if (ms === null || ms === undefined || ms < 0) return "–";
      const m = Math.round(ms / 60000);
      if (m < 60) return `${m} min`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h} h ${m % 60} min`;
      return `${Math.floor(h / 24)} d ${h % 24} h`;
    },
  };
  App.cls = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");
  App.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  /** Lokal datetime-input (Stockholm) <-> ms */
  App.toLocalInput = (ms) => {
    if (!ms) return "";
    const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms));
    const g = (t) => p.find((x) => x.type === t).value;
    return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
  };
  App.fromLocalInput = (s) => {
    if (!s) return null;
    // tolka som Stockholm-tid: hitta offset för det datumet
    const [d, t] = s.split("T");
    const [y, mo, da] = d.split("-").map(Number);
    const [h, mi] = (t || "00:00").split(":").map(Number);
    const guess = Date.UTC(y, mo - 1, da, h, mi);
    const offsetMin = tzOffsetMinutes(guess);
    return guess - offsetMin * 60000;
  };
  function tzOffsetMinutes(ms) {
    const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms));
    const g = (t) => Number(p.find((x) => x.type === t).value);
    const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"));
    return (asUtc - ms) / 60000;
  }
  App.todayKey = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  App.dayKeyOf = (ms) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

  // ---------------------------------------------------------------- period
  App.rangeParams = function () {
    const r = App.state.range;
    const now = new Date();
    const end = Date.now();
    if (r === "all") return "";
    if (r === "month") return `from=${Date.UTC(now.getFullYear(), now.getMonth(), 1) - 2 * 3600000}&to=${end}`;
    if (r === "year") return `from=${Date.UTC(now.getFullYear(), 0, 1) - 2 * 3600000}&to=${end}`;
    const days = Number(r) || 30;
    return `from=${end - days * 86400000}&to=${end}`;
  };
  App.rangeLabel = () => ({ 7: "senaste 7 dagarna", 30: "senaste 30 dagarna", 90: "senaste 90 dagarna", month: "denna månad", year: "i år", all: "hela historiken" })[App.state.range] || "";

  // ---------------------------------------------------------------- komponenter
  App.toast = (msg, err = false) => {
    const el = document.createElement("div");
    el.className = "toast" + (err ? " err" : "");
    el.textContent = msg;
    document.getElementById("toast-root").appendChild(el);
    setTimeout(() => el.remove(), err ? 5000 : 2600);
  };
  App.modal = (html, { narrow = false } = {}) => {
    const root = document.getElementById("modal-root");
    root.innerHTML = `<div class="modal-backdrop"><div class="modal${narrow ? " narrow" : ""}">${html}</div></div>`;
    const backdrop = root.firstElementChild;
    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop) App.closeModal();
    });
    return backdrop.querySelector(".modal");
  };
  App.closeModal = () => (document.getElementById("modal-root").innerHTML = "");
  App.confirm = (msg) => window.confirm(msg);
  App.stars = (n, input = false) => {
    let s = `<span class="stars${input ? " input" : ""}">`;
    for (let i = 1; i <= 5; i++) s += `<span data-star="${i}" class="${i <= (n || 0) ? "" : "off"}">★</span>`;
    return s + "</span>";
  };
  App.tagChip = (t, outline = false) => `<span class="tag${outline ? " outline" : ""}" style="background:${t.color};color:${outline ? t.color : "#fff"}">${App.esc(t.name)}</span>`;
  App.sidePill = (side, open = false) => (open ? `<span class="pill open">ÖPPEN</span>` : `<span class="pill ${side === "LONG" ? "long" : "short"}">${side === "LONG" ? "LONG" : "SHORT"}</span>`);
  App.pnlHtml = (v, opts = {}) => `<span class="${App.cls(v)} tabular"><b>${opts.short ? App.fmt.short(v) : App.fmt.signedMoney(v)}</b></span>`;
  App.emptyState = (title, text, action) =>
    `<div class="card" style="text-align:center;padding:36px"><h3 style="margin:8px 0 4px">${App.esc(title)}</h3><p class="muted" style="margin:0 0 12px">${text}</p>${action || ""}</div>`;

  /** Enkel markdown → HTML (rubriker, listor, fet/kursiv, citat, radbrytningar) */
  App.md = (src) => {
    const esc = App.esc(src || "");
    const lines = esc.split("\n");
    let html = "";
    let inList = false;
    let inCode = false;
    let table = null;
    const flushTable = () => {
      if (!table) return;
      html += `<div class="table-wrap"><table>${table.map((cells, i) => `<tr>${cells.map((c) => (i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`)).join("")}</tr>`).join("")}</table></div>`;
      table = null;
    };
    for (const raw of lines) {
      if (/^\s*```/.test(raw)) {
        flushTable();
        if (inList) {
          html += "</ul>";
          inList = false;
        }
        inCode = !inCode;
        html += inCode ? "<pre><code>" : "</code></pre>";
        continue;
      }
      if (inCode) {
        html += raw + "\n";
        continue;
      }
      if (/^\s*\|/.test(raw)) {
        if (/^\s*\|\s*-+/.test(raw)) continue; // separatorrad
        const cells = raw.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim().replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>").replace(/`(.+?)`/g, "<code>$1</code>"));
        (table = table || []).push(cells);
        continue;
      }
      flushTable();
      const line = raw.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>").replace(/`(.+?)`/g, "<code>$1</code>");
      if (/^\s*\d+\. /.test(line)) {
        if (!inList) {
          html += "<ul>";
          inList = true;
        }
        html += `<li>${line.replace(/^\s*/, "")}</li>`;
        continue;
      }
      if (/^\s*[-*] /.test(line)) {
        if (!inList) {
          html += "<ul>";
          inList = true;
        }
        html += `<li>${line.replace(/^\s*[-*] /, "")}</li>`;
        continue;
      }
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      if (/^### /.test(line)) html += `<h3>${line.slice(4)}</h3>`;
      else if (/^## /.test(line)) html += `<h2>${line.slice(3)}</h2>`;
      else if (/^# /.test(line)) html += `<h1>${line.slice(2)}</h1>`;
      else if (/^> /.test(line)) html += `<blockquote>${line.slice(2)}</blockquote>`;
      else if (line.trim() === "") html += "";
      else html += `<p>${line}</p>`;
    }
    if (inList) html += "</ul>";
    flushTable();
    if (inCode) html += "</code></pre>";
    return `<div class="md">${html}</div>`;
  };

  /** Ladda ner ett API-svar som fil (fungerar både mot server och i webbläsarläget). */
  App.download = async (path) => {
    if (!window.LocalApi) {
      location.href = path;
      return;
    }
    const r = await window.LocalApi.dispatch("GET", path);
    if (r.status !== 200 || !r.body || !r.body.raw) throw new Error("Kunde inte skapa filen");
    const blob = new Blob([r.body.body], { type: r.body.contentType });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = r.body.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // ---------------------------------------------------------------- PIN-lås (webbläsarläget)
  App.pin = {
    async hash(pin) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("tz:" + pin));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    },
    isSet: () => Boolean(localStorage.getItem("tz.pin")),
    async set(pin) {
      if (!pin) localStorage.removeItem("tz.pin");
      else localStorage.setItem("tz.pin", await App.pin.hash(pin));
    },
    async verify(pin) {
      return (await App.pin.hash(pin)) === localStorage.getItem("tz.pin");
    },
    async lock() {
      if (!App.pin.isSet() || sessionStorage.getItem("tz.unlocked") === "1") return;
      return new Promise((resolve) => {
        const root = document.getElementById("modal-root");
        root.innerHTML = `<div class="modal-backdrop" style="align-items:center;background:#1d1a4b"><div class="modal narrow" style="text-align:center"><div class="logo-mark" style="margin:0 auto 10px;width:40px;height:40px;font-size:18px">Z</div><h3>Ange PIN</h3><input id="pin-input" type="password" inputmode="numeric" autocomplete="off" style="font-size:24px;text-align:center;letter-spacing:8px;width:200px" autofocus /><div id="pin-err" class="neg small" style="min-height:18px;margin-top:6px"></div><button class="btn primary" id="pin-ok" style="margin-top:8px">Lås upp</button></div></div>`;
        const input = root.querySelector("#pin-input");
        const tryIt = async () => {
          if (await App.pin.verify(input.value)) {
            sessionStorage.setItem("tz.unlocked", "1");
            root.innerHTML = "";
            resolve();
          } else {
            root.querySelector("#pin-err").textContent = "Fel PIN";
            input.value = "";
            input.focus();
          }
        };
        root.querySelector("#pin-ok").addEventListener("click", tryIt);
        input.addEventListener("keydown", (e) => e.key === "Enter" && tryIt());
        setTimeout(() => input.focus(), 50);
      });
    },
  };

  // ---------------------------------------------------------------- synkstatus i topraden (webbläsarläget)
  App.syncChip = () => {
    const chip = document.getElementById("sync-chip");
    if (!chip || !App.isStatic()) return;
    const st = window.LocalApi.status;
    const cfg = window.LocalApi.sync.config();
    chip.classList.remove("hidden");
    chip.classList.toggle("off", !cfg);
    chip.classList.toggle("err", Boolean(cfg && st.error));
    const time = st.lastSyncAt ? new Date(st.lastSyncAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }) : "";
    document.getElementById("sync-chip-text").textContent = !cfg ? "Ej kopplad" : st.error ? "Synkfel" : st.text === "Synkad" && time ? `Synkad ${time}` : st.text;
    chip.title = (cfg && st.error) || (cfg ? "Klicka för att hämta det senaste från molnet" : "Klicka för att koppla molnsynk");
  };
  App.syncPullNow = async () => {
    const r = await window.LocalApi.sync.pull(false);
    if (r === "uppdaterad") App.toast("Hämtar den senaste journalen…");
    else if (r === "oförändrad") App.toast("Du har redan det senaste");
    else if (r === "konflikt") App.toast("Konflikt: välj under Inställningar → Molnsynk", true);
    else if (r === "tom") App.toast("Molnet är tomt än");
    else App.toast(window.LocalApi.status.error || "Kunde inte nå molnet", true);
  };

  App.readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });

  /** Bilduppladdning till en endpoint; returnerar antal uppladdade */
  App.uploadImages = async (endpoint, files) => {
    let n = 0;
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      const data = await App.readFileAsDataUrl(f);
      await App.post(endpoint, { filename: f.name, mime: f.type, data });
      n++;
    }
    return n;
  };

  App.bindDropzone = (el, onFiles) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.style.display = "none";
    el.appendChild(input);
    el.addEventListener("click", () => input.click());
    input.addEventListener("change", () => onFiles([...input.files]));
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
      el.classList.add("over");
    });
    el.addEventListener("dragleave", () => el.classList.remove("over"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("over");
      onFiles([...e.dataTransfer.files]);
    });
    document.addEventListener("paste", (e) => {
      if (!document.body.contains(el)) return;
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) onFiles(files);
    });
  };

  // ---------------------------------------------------------------- router
  App.route = { name: "oversikt", params: [] };
  App.navigate = (hash) => {
    location.hash = hash;
  };
  App.render = async () => {
    const hash = location.hash.replace(/^#\/?/, "") || "oversikt";
    const [name, ...params] = hash.split("/");
    App.route = { name, params };
    document.querySelectorAll(".nav a, .bottom-nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === name));
    document.getElementById("more-sheet")?.classList.add("hidden");
    const view = views[name] || views.oversikt;
    document.getElementById("page-title").textContent = view.title || "";
    const el = document.getElementById("view");
    el.innerHTML = `<div class="muted">Laddar…</div>`;
    try {
      await view.render(el, params);
    } catch (err) {
      console.error(err);
      el.innerHTML = `<div class="card"><b>Fel:</b> ${App.esc(err.message)}</div>`;
    }
  };

  App.refreshMeta = async () => {
    const [s, strategies, tags] = await Promise.all([App.api("/api/settings"), App.api("/api/strategies"), App.api("/api/tags")]);
    App.state.settings = s.settings;
    App.state.hasSample = s.hasSample;
    App.state.equity = s.equity;
    App.state.authEnabled = Boolean(s.authEnabled);
    document.querySelectorAll("#btn-logout, #btn-logout-mobile").forEach((b) => b.classList.toggle("hidden", !s.authEnabled));
    App.state.strategies = strategies;
    App.state.tags = tags;
    document.getElementById("account-chip").textContent = `${s.settings.defaultSymbol} · Manuell journal`;
  };

  App.start = async () => {
    if (App.isStatic()) await App.pin.lock();
    const sel = document.getElementById("range-select");
    sel.value = App.state.range;
    sel.addEventListener("change", () => {
      App.state.range = sel.value;
      localStorage.setItem("tz.range", sel.value);
      App.render();
    });
    document.getElementById("btn-add-trade").addEventListener("click", () => App.quickTrade());
    document.getElementById("btn-add-trade-mobile")?.addEventListener("click", () => App.quickTrade());
    document.getElementById("btn-missed")?.addEventListener("click", () => App.quickMissed());
    document.getElementById("btn-missed-mobile")?.addEventListener("click", (e) => (e.preventDefault(), App.quickMissed()));
    document.getElementById("btn-more")?.addEventListener("click", () => document.getElementById("more-sheet").classList.toggle("hidden"));
    const logout = async (e) => {
      e.preventDefault();
      await App.post("/api/logout");
      location.href = "/login";
    };
    document.getElementById("btn-logout")?.addEventListener("click", logout);
    document.getElementById("btn-logout-mobile")?.addEventListener("click", logout);
    window.addEventListener("hashchange", App.render);
    if (App.isStatic()) {
      App.syncChip();
      window.LocalApi.onStatus(App.syncChip);
      document.getElementById("sync-chip").addEventListener("click", () => (window.LocalApi.sync.config() ? App.syncPullNow() : App.go("/installningar")));
      if (window.LocalApi.status.notice) App.toast(window.LocalApi.status.notice, Boolean(window.LocalApi.status.error));
    }
    await App.refreshMeta();
    await App.render();
  };
})();
