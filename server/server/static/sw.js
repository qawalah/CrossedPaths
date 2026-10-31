// Minimal service worker: makes the app installable and keeps the shell available offline.
// API calls are never cached.
const SHELL = "crosspaths-shell-v1";
self.addEventListener("install", e => { e.waitUntil(caches.open(SHELL).then(c => c.add("/")).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  e.respondWith(fetch(e.request).then(r => { if (e.request.mode === "navigate") { const c = r.clone(); caches.open(SHELL).then(k => k.put("/", c)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("/"))));
});
