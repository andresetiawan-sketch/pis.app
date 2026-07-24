// ============================================================
// PIS — PWA Install Prompt & Service Worker Registration
// ============================================================
// - Mendaftarkan /sw.js supaya aset & data bisa di-cache di browser.
// - Saat browser mengizinkan instalasi (event "beforeinstallprompt"),
//   langsung tampilkan banner "Install Aplikasi" otomatis tanpa harus
//   dipicu klik menu browser dulu. Catatan: browser tetap mewajibkan
//   satu klik/tap pengguna pada tombol untuk memicu instal — ini
//   batasan keamanan bawaan semua browser modern (Chrome/Edge/Android),
//   tidak bisa benar-benar auto-install tanpa interaksi pengguna sama
//   sekali. Banner ini membuat prosesnya semudah mungkin: begitu link
//   dibuka, tombol instal langsung muncul.
//
// Guard idempotensi: cegah banner/registrasi dobel jika script termuat
// lebih dari sekali (padanan "dependency array kosong []").
// ============================================================
(function () {
  if (window.__pisPwaInstallBound) return;
  window.__pisPwaInstallBound = true;

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  let deferredPrompt = null;

  function showInstallBanner() {
    if (document.getElementById("pis-install-banner")) return;
    const bar = document.createElement("div");
    bar.id = "pis-install-banner";
    bar.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:99999;display:flex;align-items:center;" +
      "justify-content:space-between;gap:8px;padding:10px 16px;background:#7B1A2C;color:#fff;" +
      "font:14px/1.4 system-ui,sans-serif;box-shadow:0 -2px 10px rgba(0,0,0,.2);";
    bar.innerHTML =
      '<span>Pasang PIS Integrated System di perangkat ini untuk akses lebih cepat.</span>' +
      '<span>' +
      '<button id="pis-install-btn" style="background:#fff;color:#7B1A2C;border:0;border-radius:6px;padding:6px 14px;font-weight:600;margin-right:6px;cursor:pointer;">Pasang</button>' +
      '<button id="pis-install-dismiss" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.6);border-radius:6px;padding:6px 10px;cursor:pointer;">Nanti</button>' +
      '</span>';
    document.body.appendChild(bar);

    document.getElementById("pis-install-btn").addEventListener("click", async () => {
      bar.remove();
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => {});
      deferredPrompt = null;
    });
    document.getElementById("pis-install-dismiss").addEventListener("click", () => bar.remove());
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    const bar = document.getElementById("pis-install-banner");
    if (bar) bar.remove();
  });
})();
