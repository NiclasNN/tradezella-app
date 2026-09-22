const CACHE = "tz-202609221000";
const FILES = ["./", "./index.html", "./style.css", "./engine.js", "./vendor/lightweight-charts.js", "./vendor/sql-wasm-browser.wasm", "./manifest.webmanifest", "./icon-192.png",
  "./js/core.js", "./js/charts.js", "./js/trades.js", "./js/quick.js", "./js/dashboard.js", "./js/daily.js", "./js/notebook.js", "./js/playbook.js", "./js/reports.js", "./js/settings.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html"))));
});
