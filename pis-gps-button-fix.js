/**
 * PIS — Perbaikan "Log GPS Lokasi" jadi tombol sungguhan
 * Lapisan overlay tambahan (tidak menyentuh bundle React).
 *
 * Masalah: pada detail Panic Alert / log kejadian darurat, koordinat GPS
 * ditampilkan sebagai LINK TEKS biasa ("GPS: -6.20000, 106.81666" berwarna
 * biru underline) — bukan tombol seperti elemen aksi lain di kartu yang sama.
 *
 * Solusi: cari link tersebut (href ke maps.google.com dengan pola koordinat),
 * lalu bungkus ulang menjadi elemen <button> asli. Gaya visualnya disamakan
 * dengan tombol lain yang ada dalam kartu/kontainer yang sama (class asli
 * tombol tersebut di-kloning langsung, bukan ditulis manual).
 */
(function () {
  "use strict";

  function findSiblingButtonClass(el) {
    // Naik ke atas cari kontainer (mis. Card/Dialog) yang berisi tombol asli,
    // lalu pakai class button tersebut supaya visualnya identik.
    let node = el.parentElement;
    for (let depth = 0; depth < 6 && node; depth++) {
      const btn = node.querySelector("button");
      if (btn && btn.className) return btn.className;
      node = node.parentElement;
    }
    return null;
  }

  function convertGpsLinks() {
    const links = document.querySelectorAll('a[href^="https://maps.google.com/?q="]:not([data-pisgps-done])');
    links.forEach((link) => {
      link.dataset.pisgpsDone = "1";
      const href = link.getAttribute("href");
      const label = link.textContent.trim();
      const siblingClass = findSiblingButtonClass(link);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = siblingClass || "pisgps-fallback-btn";
      if (!siblingClass) {
        btn.style.cssText =
          "display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:8px;" +
          "border:1px solid #d9d9d9;background:#f2f2f2;color:#000;font-weight:600;font-size:12px;cursor:pointer;";
      }
      btn.innerHTML = `📍 ${label}`;
      btn.title = "Buka lokasi di Google Maps";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
        showPisgpsToast("Membuka lokasi GPS di Google Maps...", "ok");
      });

      link.replaceWith(btn);
    });
  }

  const style = document.createElement("style");
  style.textContent = `
    .pisgps-toast {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      z-index: 99997; padding: 11px 16px; border-radius: 10px; font-size: 13px;
      font-family: system-ui, sans-serif; box-shadow: 0 6px 20px rgba(0,0,0,.18);
      background: #1a7b2c; color: #fff;
    }
  `;
  document.head.appendChild(style);
  function showPisgpsToast(message) {
    const el = document.createElement("div");
    el.className = "pisgps-toast";
    el.textContent = "✅ " + message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  const observer = new MutationObserver(() => convertGpsLinks());
  observer.observe(document.body, { childList: true, subtree: true });
  convertGpsLinks();
})();
