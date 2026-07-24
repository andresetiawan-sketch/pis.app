// ============================================================
// PIS — Request Cache & De-duplication Layer
// ============================================================
// Tujuan:
//  - Banyak file pis-*.js melakukan polling (setInterval tiap 1.2–20 detik)
//    yang sebagian memanggil endpoint yang sama berkali-kali beruntun.
//    Script ini menaruh cache singkat (TTL) + de-dupe di window.fetch,
//    SEBELUM aplikasi utama (bundle React) dan semua overlay lain berjalan,
//    supaya XAMPP/hosting tidak dibebani request yang identik & berulang.
//  - Upload file (/api/uploads) dan download file (/files/*) SELALU
//    tembus ke jaringan — TIDAK PERNAH di-cache — sesuai kebutuhan realtime.
//  - Data yang sifatnya personal/realtime (chat, notifikasi, absensi,
//    login) juga TIDAK di-cache — daftarnya sama persis dengan server
//    (lihat backend/cache.php: NO_CACHE_ENTITIES / NO_CACHE_FUNCTIONS).
//
// Guard idempotensi: jika script ini termuat dua kali (mis. re-render SPA
// atau reload sw.js), instalasi kedua dibatalkan supaya interval/patch
// fetch tidak dobel — ini adalah padanan "dependency array kosong []"
// pada file vanilla-JS (bukan React), karena tidak ada useEffect di sini.
// ============================================================
(function () {
  if (window.__pisRequestCacheInstalled) return; // cegah instalasi ganda
  window.__pisRequestCacheInstalled = true;

  const TTL_MS = 8000;              // cache singkat sisi browser: 8 detik
  const INFLIGHT_TIMEOUT_MS = 15000; // jaga-jaga kalau request macet

  // Entity & function yang TIDAK BOLEH di-cache (harus selalu fresh dari server)
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

  const cacheStore = new Map();   // key -> { expires, promise }
  const inflight = new Map();     // key -> promise (de-dupe request bersamaan)

  function isUploadOrFile(pathname) {
    return pathname.startsWith("/api/uploads") || pathname.startsWith("/files/");
  }

  function isCacheableGet(pathname) {
    if (pathname.startsWith("/api/apps/entities/")) {
      const entity = decodeURIComponent(pathname.replace("/api/apps/entities/", "").split("/")[0]);
      return !NO_CACHE_ENTITIES.has(entity);
    }
    if (pathname.startsWith("/api/apps/functions/")) {
      const fnName = pathname.replace("/api/apps/functions/", "");
      return !NO_CACHE_FUNCTIONS.has(fnName);
    }
    if (pathname === "/api/settings/branding") return true;
    return false;
  }

  function cacheKeyFor(url, init) {
    const token =
      (init && init.headers && (init.headers["X-Employee-Token"] || init.headers["x-employee-token"])) ||
      (typeof Headers !== "undefined" && init && init.headers instanceof Headers ? init.headers.get("X-Employee-Token") : "") ||
      "";
    return token + "|" + url;
  }

  function bumpLocalVersion(pathname) {
    // Setelah ada tulis data (POST/PUT/DELETE), buang cache yang match entity terkait
    // supaya request berikutnya membaca data terbaru, bukan data basi.
    for (const key of cacheStore.keys()) {
      if (key.includes(pathname.split("/").slice(0, 4).join("/"))) cacheStore.delete(key);
    }
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    const req = typeof input === "string" ? null : input;
    const url = req ? req.url : String(input);
    const method = ((init && init.method) || (req && req.method) || "GET").toUpperCase();

    let pathname;
    try { pathname = new URL(url, window.location.origin).pathname; } catch { pathname = url; }

    // Upload & download file: SELALU network, tidak pernah disentuh cache.
    if (isUploadOrFile(pathname)) {
      return originalFetch(input, init);
    }

    // Tulis data → jalan seperti biasa, lalu bersihkan cache entity terkait.
    if (method !== "GET") {
      return originalFetch(input, init).then((res) => {
        if (res.ok) bumpLocalVersion(pathname);
        return res;
      });
    }

    // Bukan endpoint yang boleh di-cache → langsung network seperti biasa.
    if (!isCacheableGet(pathname)) {
      return originalFetch(input, init);
    }

    const key = cacheKeyFor(url, init);
    const now = Date.now();

    // 1) Ada di cache & masih segar → kembalikan langsung, TANPA request baru.
    const cached = cacheStore.get(key);
    if (cached && cached.expires > now) {
      return cached.responsePromise.then((r) => r.clone());
    }

    // 2) Ada request identik yang sedang berjalan → gabung (de-dupe), jangan kirim dobel.
    if (inflight.has(key)) {
      return inflight.get(key).then((r) => r.clone());
    }

    // 3) Belum ada → kirim ke jaringan sekali, simpan hasilnya untuk dipakai bersama.
    const promise = originalFetch(input, init)
      .then((res) => {
        inflight.delete(key);
        if (res.ok) {
          cacheStore.set(key, { expires: Date.now() + TTL_MS, responsePromise: Promise.resolve(res.clone()) });
        }
        return res;
      })
      .catch((err) => {
        inflight.delete(key);
        throw err;
      });

    inflight.set(key, promise);
    setTimeout(() => inflight.delete(key), INFLIGHT_TIMEOUT_MS);

    return promise.then((r) => r.clone());
  };
})();
