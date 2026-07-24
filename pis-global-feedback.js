/**
 * PIS — Keterangan Keberhasilan Global
 * Lapisan overlay tambahan (tidak menyentuh bundle React).
 *
 * Masalah: banyak tombol di berbagai menu memanggil API tapi hanya sebagian
 * yang menampilkan toast sukses/gagal (tergantung apakah komponen React
 * terkait memanggil showToast miliknya sendiri atau tidak).
 *
 * Solusi: pasang "penjaga" global di window.fetch. Setiap kali sebuah tombol
 * DIKLIK dan itu memicu request POST/PUT/PATCH/DELETE ke /api/..., skrip ini
 * otomatis menampilkan toast keberhasilan/gagal — terlepas dari apakah
 * komponen halaman itu sendiri sudah menampilkan toast atau belum.
 * Untuk menghindari toast dobel di halaman yang SUDAH punya toast sendiri
 * (mis. sonner/react-hot-toast bawaan bundle React), toast ini hanya muncul
 * jika belum ada notifikasi lain yang tampil dalam 600ms terakhir.
 */
(function () {
  "use strict";

  const style = document.createElement("style");
  style.textContent = `
    .pisgf-toast {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      z-index: 99997; padding: 11px 16px; border-radius: 10px; font-size: 13px;
      font-family: system-ui, sans-serif; box-shadow: 0 6px 20px rgba(0,0,0,.18);
      max-width: 90vw; text-align: center; display: flex; align-items: center; gap: 8px;
      animation: pisgf-in .2s ease;
    }
    @keyframes pisgf-in { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }
    .pisgf-toast.ok { background: #1a7b2c; color: #fff; }
    .pisgf-toast.fail { background: #7b1a1a; color: #fff; }
  `;
  document.head.appendChild(style);

  // ── Lacak apakah ada toast/notifikasi LAIN (dari bundle React atau overlay
  //    lain: pis-toast, sonner, dsb) yang baru saja tampil, supaya tidak dobel.
  let lastAnyToastAt = 0;
  const toastObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const cls = node.className || "";
        if (
          typeof cls === "string" &&
          (cls.includes("toast") || cls.includes("sonner") || node.hasAttribute?.("data-sonner-toast"))
        ) {
          lastAnyToastAt = Date.now();
        }
      }
    }
  });
  toastObserver.observe(document.body, { childList: true, subtree: true });

  function showGlobalToast(message, kind) {
    // Ada notifikasi lain yang baru saja muncul (≤600ms) → jangan dobel
    if (Date.now() - lastAnyToastAt < 600) return;
    const el = document.createElement("div");
    el.className = "pisgf-toast " + kind;
    el.textContent = (kind === "ok" ? "✅ " : "⚠️ ") + message;
    document.body.appendChild(el);
    lastAnyToastAt = Date.now();
    setTimeout(() => el.remove(), 4000);
  }

  // ── Tandai bahwa aksi terakhir berasal dari klik tombol nyata (bukan
  //    fetch background/polling), supaya toast hanya muncul akibat aksi user.
  let lastClickAt = 0;
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target.closest && e.target.closest('button, [role="button"], a');
      if (target) lastClickAt = Date.now();
    },
    true
  );

  // Label ramah untuk beberapa pola endpoint yang umum, fallback generik jika tidak dikenali.
  function friendlyLabel(method, path) {
    const entityMatch = path.match(/\/api\/apps\/entities\/([A-Za-z]+)/);
    const entity = entityMatch ? entityMatch[1] : null;
    const ENTITY_LABELS = {
      Applicant: "Data Pelamar", Employee: "Data Karyawan", Attendance: "Absensi",
      LeaveRequest: "Pengajuan Cuti", OvertimeClaim: "Pengajuan Lembur", Payslip: "Slip Gaji",
      AreaProject: "Area/Proyek", Inventory: "Inventaris", GuestBook: "Buku Tamu",
      FacilityTicket: "Tiket Fasilitas", PanicAlert: "Panic Alert", TaskBoard: "Task Board",
    };
    const label = entity ? (ENTITY_LABELS[entity] || entity) : null;
    if (method === "POST") return label ? `${label} berhasil disimpan.` : "Data berhasil disimpan.";
    if (method === "PUT" || method === "PATCH") return label ? `${label} berhasil diperbarui.` : "Data berhasil diperbarui.";
    if (method === "DELETE") return label ? `${label} berhasil dihapus.` : "Data berhasil dihapus.";
    return "Aksi berhasil dilakukan.";
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const method = ((init && init.method) || (typeof input === "object" && input.method) || "GET").toUpperCase();
    const url = typeof input === "string" ? input : input && input.url || "";
    const isApi = url.includes("/api/");
    const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
    // Jangan ganggu endpoint upload/import (punya toast hasil sendiri yang lebih detail)
    // atau endpoint log/analytics (tidak relevan ditampilkan ke user).
    const isNoisy = /\/api\/app-logs\/|\/api\/apps\/analytics\/|\/api\/uploads|\/api\/applicant\/import/.test(url);

    const response = await originalFetch(input, init);

    if (isApi && isWrite && !isNoisy && Date.now() - lastClickAt < 3000) {
      try {
        const clone = response.clone();
        const data = await clone.json().catch(() => null);
        const failed = data && (data.success === false || data.error);
        if (response.ok && !failed) {
          showGlobalToast(friendlyLabel(method, url), "ok");
        } else if (data && data.error) {
          showGlobalToast(String(data.error), "fail");
        } else if (!response.ok) {
          showGlobalToast("Aksi gagal dilakukan.", "fail");
        }
      } catch {
        /* respons bukan JSON / tidak bisa dibaca — biarkan, jangan ganggu alur asli */
      }
    }
    return response;
  };
})();
