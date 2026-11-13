const V = "hannah-v5";
const SHELL = ["./", "index.html", "style.css", "app.js", "ics.js", "manifest.json", "icon-180.png", "icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("hannah-v") && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || !u.pathname.includes("/hannah/") || u.pathname.endsWith("__api")) return;
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});

/* notificarea de seară: serverul trimite un push gol, aici aflăm cine e neconfirmat */
self.addEventListener("push", e => {
  e.waitUntil((async () => {
    let kids = [];
    try {
      const c = await caches.open("hannah-api"), r = await c.match(self.registration.scope + "__api");
      const api = await r.json();
      const j = await fetch(api.u + "?t=" + encodeURIComponent(api.t) + "&a=pending").then(x => x.json());
      kids = j.kids || [];
    } catch (err) {}
    const n = kids.length;
    const title = n ? (n === 1 ? "Ai o oră de confirmat" : `Ai ${n} ore de confirmat`) : "Confirmă orele de azi";
    const body = n ? kids.join(", ") + " — a venit sau nu?" : "Deschide aplicația și bifează cine a venit.";
    await self.registration.showNotification(title, { body, icon: "icon-192.png", badge: "icon-192.png", tag: "ore", data: { url: self.registration.scope + "#ore" } });
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope + "#ore";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ("focus" in c) { try { c.navigate(url); } catch (x) {} return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
