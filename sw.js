/* Wedding Seating Planner - offline app shell.
   Cache-first for the page and its libraries so it loads with no signal;
   network-first (never cached) for the Apps Script /exec data endpoint. */
const CACHE = "wsp-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js",
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Karla:wght@400;500;700&display=swap",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c =>
    /* cache each individually so one CDN miss doesn't fail the whole install */
    Promise.all(SHELL.map(u => c.add(u).catch(() => null)))
  ).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = e.request.url;
  if (e.request.method !== "GET") return;             /* never touch POSTs */
  if (url.includes("script.google.com")) return;      /* live data: network only */

  /* the page: network-first so updates arrive, cache as offline fallback */
  const isPage = url.includes("/wedding-seating/") &&
    (url.endsWith("/") || url.includes("index.html"));
  if (isPage){
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put("./index.html", copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html").then(r => r || caches.match("./")))
    );
    return;
  }

  /* libraries and fonts: cache-first (they're version-pinned and immutable) */
  e.respondWith(
    caches.match(e.request, {ignoreSearch: true}).then(hit =>
      hit || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => hit)
    )
  );
});
