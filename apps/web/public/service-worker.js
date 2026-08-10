/*
 * Offline shell for the installed app.
 *
 * Deliberately narrow. Two rules, and nothing clever:
 *
 * 1. **Navigations** fall back to the cached shell when the network is
 *    gone, so a launched-from-home-screen app opens instead of showing
 *    the browser's offline page.
 * 2. **Everything else** is network-first, cache-as-backup.
 *
 * API responses are never cached. A stale playlist list or a stale
 * transfer report is worse than an honest error — the whole point of the
 * product is telling the user what actually happened, and serving them
 * yesterday's answer from a cache would undermine exactly that.
 */

const CACHE = "ekusupo-shell-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Individually, so one missing file cannot fail the whole install
      // and leave the app with no service worker at all.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET is cacheable, and only from this origin. A sign-in POST or
  // a call to the API host must always go to the network.
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match("/index.html");
        return cached ?? Response.error();
      }),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Only cache genuine successes; an opaque or error response
        // cached here would be served back indefinitely.
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        return cached ?? Response.error();
      }),
  );
});
