// TMR Team - permette di installare l'app e di aprirla anche con rete debole.
// Le pagine dell'app vengono prese sempre da internet quando c'e' rete (cosi' gli aggiornamenti arrivano subito);
// la copia salvata serve solo se si e' offline. I dati (Supabase) non vengono mai salvati qui.
const CACHE = "tmr-team-v2";
const FILE = ["./", "index.html", "app.js?v=2", "config.js?v=2", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./")))
  );
});
