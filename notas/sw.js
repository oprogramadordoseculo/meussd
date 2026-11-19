const CACHE = "notas-v1";
const ARQUIVOS = [
  "./", "index.html", "estilo.css", "icone.svg", "manifest.webmanifest",
  "js/app.js", "js/armazenamento.js", "js/config.js",
];
const CDNS = ["cdn.jsdelivr.net", "www.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(chaves => Promise.all(chaves.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const proprio = url.origin === location.origin;
  if (!proprio && !CDNS.includes(url.hostname)) return;
  if (proprio && url.pathname.startsWith("/__/")) return;

  if (proprio) {
    e.respondWith(fetch(req).then(r => {
      if (r.ok) caches.open(CACHE).then(c => c.put(req, r.clone()));
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true })));
  } else {
    e.respondWith(caches.match(req).then(salvo => salvo || fetch(req).then(r => {
      if (r.ok || r.type === "opaque") caches.open(CACHE).then(c => c.put(req, r.clone()));
      return r;
    })));
  }
});
