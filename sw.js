// ============================================================
// Service Worker — PIS Integrated System (v6 — + cache API read singkat)
// Strategi:
//  - Aset statis (JS/CSS/ikon)        → cache-first
//  - Halaman (navigasi)               → network-first, fallback ke shell offline
//  - /api/uploads & /files/*          → SELALU network, tidak pernah dicache
//    (upload & download file wajib realtime)
//  - /api/apps/entities|functions GET → network-first + cache TTL singkat (8 detik)
//    supaya polling yang saling tumpuk tidak membebani server, tapi data
//    tetap dianggap basi (stale) dalam hitungan detik, bukan menit.
//  - Entity/function personal & realtime (chat, notifikasi, absensi, login)
//    tidak pernah dicache — daftar sama persis dengan pis-request-cache.js
//    dan backend/cache.php supaya perilakunya konsisten di 3 lapisan.
// ============================================================

const CACHE_NAME = "pis-shell-v6";
const API_CACHE_NAME = "pis-api-v6";
const API_TTL_MS = 8000;
const APP_SHELL = ["/", "/index.html", "/manifest.json"];

const NO_CACHE_ENTITIES = new Set([
  "AdminChat", "SystemNotification", "Attendance", "EPatrol",
  "PanicAlert", "ShiftNotification", "PasswordResetRequest",
]);
const NO_CACHE_FUNCTIONS = new Set([
  "getMyNotifications", "getMyChat", "getMyChatUnreadCount",
  "getChatCount", "getChats", "getAttendanceButtons",
  "employeeLogin", "employeeLogout", "getEmployeeByNik",
  "markChatRead", "markNotificationRead",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== API_CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isApiCacheable(pathname) {
  if (pathname.startsWith("/api/apps/entities/")) {
    const entity = decodeURIComponent(pathname.replace("/api/apps/entities/", "").split("/")[0]);
    return !NO_CACHE_ENTITIES.has(entity);
  }
  if (pathname.startsWith("/api/apps/functions/")) {
    const fnName = pathname.replace("/api/apps/functions/", "");
    return !NO_CACHE_FUNCTIONS.has(fnName);
  }
  return pathname === "/api/settings/branding";
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // Upload & download file: JANGAN PERNAH dicache, selalu network.
  if (url.pathname.startsWith("/api/uploads") || url.pathname.startsWith("/files/")) return;

  // Bacaan API yang aman dicache singkat (bukan data personal/realtime)
  if (url.pathname.startsWith("/api/") && isApiCacheable(url.pathname)) {
    event.respondWith(
      caches.open(API_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          const cachedAt = Number(cached.headers.get("X-Pis-Cached-At") || 0);
          if (Date.now() - cachedAt < API_TTL_MS) return cached;
        }
        try {
          const res = await fetch(request);
          if (res.ok) {
            const buf = await res.clone().arrayBuffer();
            const headers = new Headers(res.headers);
            headers.set("X-Pis-Cached-At", String(Date.now()));
            cache.put(request, new Response(buf, { status: res.status, headers }));
          }
          return res;
        } catch (err) {
          if (cached) return cached; // offline → data basi lebih baik daripada error
          throw err;
        }
      })
    );
    return;
  }

  // API lain (personal/realtime/menulis data): selalu network, tidak dicache.
  if (url.pathname.startsWith("/api/")) return;

  // Aset statis hash (Vite output) → cache-first
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  // Navigasi halaman (SPA) → network-first, fallback ke shell saat offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (res) => {
          const resClone = res.clone();
          const cache = await caches.open(CACHE_NAME);
          cache.put("/index.html", resClone);
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // File lain (manifest.json, dll) → network-first, fallback cache
  event.respondWith(
    fetch(request)
      .then(async (res) => {
        if (res.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, res.clone());
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
