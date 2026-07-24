/**
 * PIS NOTIFICATION FIX
 * - Hilangkan notif "data berhasil tersimpan" yang muncul terus-menerus
 * - Notif "data tersimpan" hanya muncul saat user benar-benar simpan/upload
 * - Saat kirim laporan → notif "Laporan berhasil terkirim"
 * - Notif chat masuk menampilkan nama pengirim
 */
(function () {
  "use strict";

  // ============================================================
  // Track user actions (save/upload/submit/report)
  // ============================================================
  let lastAction = null;
  let lastActionTime = 0;

  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest('button, [role="button"], a.btn, input[type="submit"]');
      if (!btn) return;
      const text = (btn.textContent || btn.value || "").toLowerCase().trim();
      if (/simpan|save|kirim|send|submit|unggah|upload/.test(text)) {
        if (/laporan|report/.test(text)) lastAction = "report";
        else if (/unggah|upload/.test(text)) lastAction = "upload";
        else lastAction = "save";
        lastActionTime = Date.now();
      }
    },
    true
  );

  // ============================================================
  // Toast interceptor — suppress & fix notification text
  // ============================================================
  const TOAST_SEL = [
    '.toast', '[class*="toast"]', '[class*="Toast"]',
    '[class*="notification"]', '[class*="Notification"]',
    '[class*="snackbar"]', '[class*="Snackbar"]',
    '[class*="alert"]', '[class*="Alert"]',
    '[class*="noti"]', '[class*="Noti"]',
    '[role="alert"]', '[role="status"]',
  ];

  function isToast(el) {
    if (!el || el.nodeType !== 1) return false;
    return TOAST_SEL.some((s) => el.matches?.(s));
  }

  function handleToast(el) {
    const text = (el.textContent || "").toLowerCase().trim();
    if (!text) return;

    const recent = Date.now() - lastActionTime < 5000;

    // Suppress "data berhasil tersimpan" jika bukan dari user action
    if (/data berhasil tersimpan|berhasil tersimpan|saved successfully|data tersimpan/.test(text)) {
      if (!recent) {
        el.style.display = "none";
        setTimeout(() => el.remove(), 100);
        return;
      }
      // Dari user action — ubah teks sesuai konteks
      if (lastAction === "report") {
        el.textContent = "✅ Laporan berhasil terkirim";
      } else if (lastAction === "upload") {
        el.textContent = "✅ File berhasil diunggah";
      } else {
        el.textContent = "✅ Data berhasil disimpan";
      }
    }

    // Ubah "berhasil" generik jadi "laporan berhasil terkirim" untuk konteks laporan
    if (/berhasil|sukses|success/.test(text) && lastAction === "report" && recent) {
      if (!/laporan/.test(text)) {
        el.textContent = "✅ Laporan berhasil terkirim";
      }
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (isToast(node)) handleToast(node);
        const toasts = node.querySelectorAll?.(TOAST_SEL.join(", "));
        if (toasts) toasts.forEach(handleToast);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ============================================================
  // Chat notification — tampilkan nama pengirim
  // ============================================================
  let lastUnreadCount = 0;

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await origFetch.apply(this, args);
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";

    // Intercept getMyChat — deteksi pesan baru dari admin
    if (/getMyChat/.test(url) && response.ok) {
      try {
        const cloned = response.clone();
        const data = await cloned.json();
        if (data.success && data.chats) {
          const unread = data.chats.filter(
            (c) =>
              !c.is_auto_greeting &&
              !c.is_auto_reply &&
              c.nik_pengirim !== "system" &&
              c.dibaca_user === false
          );
          if (unread.length > lastUnreadCount && lastUnreadCount >= 0) {
            const latest = unread[unread.length - 1];
            if (latest && latest.nama_pengirim) {
              showChatNotif(latest.nama_pengirim, latest.pesan);
            }
          }
          lastUnreadCount = unread.length;
        }
      } catch {}
    }

    // Intercept getChats (admin) — deteksi pesan baru dari user
    if (/getChats/.test(url) && response.ok) {
      try {
        const cloned = response.clone();
        const data = await cloned.json();
        if (data.success && data.chats) {
          const unread = data.chats.filter(
            (c) =>
              !c.is_auto_greeting &&
              !c.is_auto_reply &&
              c.nik_pengirim !== "system" &&
              c.dibaca_admin === false
          );
          if (unread.length > lastUnreadCount && lastUnreadCount >= 0) {
            const latest = unread[unread.length - 1];
            if (latest && latest.nama_pengirim) {
              showChatNotif(latest.nama_pengirim, latest.pesan);
            }
          }
          lastUnreadCount = unread.length;
        }
      } catch {}
    }

    return response;
  };

  function showChatNotif(senderName, message) {
    const el = document.createElement("div");
    el.style.cssText = `
      position: fixed; top: 16px; right: 16px; z-index: 100000;
      background: #7B1A2C; color: #fff; padding: 14px 18px;
      border-radius: 12px; font: 600 13px system-ui, sans-serif;
      box-shadow: 0 6px 18px rgba(0,0,0,.25); max-width: 340px;
      cursor: pointer; transition: opacity .3s;
    `;
    el.innerHTML = `
      <div style="font-weight:700;margin-bottom:4px;">💬 Pesan masuk dari ${senderName}</div>
      <div style="font-weight:400;opacity:.9;font-size:12px;">${String(message || "").slice(0, 80)}${message && message.length > 80 ? "..." : ""}</div>
    `;
    el.addEventListener("click", () => el.remove());
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 300);
    }, 5000);
  }
})();
