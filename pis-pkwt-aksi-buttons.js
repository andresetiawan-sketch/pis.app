/**
 * PIS — TOMBOL "✏️ Edit" & "🗑️ Hapus" PERMANEN DI KOLOM AKSI (halaman
 * "PKWT Karyawan"), untuk PKWT & Surat Tugas yang terhubung dengannya.
 * ============================================================
 * Sebelumnya, ikon pensil Edit & tempat sampah Hapus bawaan di kolom Aksi
 * sudah disembunyikan oleh pis-pkwt-button-replace.js (karena keduanya
 * hanya mengedit/menghapus data kontrak PKWTContract mentah — tidak ikut
 * mengurus dokumen .docx atau Surat Tugas yang terhubung), tetapi belum ada
 * gantinya di kolom Aksi itu sendiri — jadi kolom Aksi tampak kosong/hilang
 * tombol Edit & Hapus-nya.
 *
 * File ini menambahkan gantinya: tombol "✏️ Edit" & "🗑️ Hapus" PERMANEN di
 * kolom Aksi setiap baris PKWT, yang:
 *  - Edit  → membuka panel "Generate PKWT & Surat Tugas" (pis-pkwt-generator.js)
 *            dalam mode edit, sudah terisi data PKWT tsb — menyunting PKWT
 *            & Surat Tugas SEKALIGUS, termasuk membuat ulang dokumen .docx-nya.
 *  - Hapus → memanggil /api/apps/functions/deletePkwtAndAssignment, yang
 *            menghapus PKWTContract & Assignment (Surat Tugas) yang
 *            terhubung dengannya SEKALIGUS, termasuk file .docx-nya di R2.
 *
 * Kenapa lapisan terpisah, bukan edit langsung ke komponen React?
 * Source .jsx asli tidak tersedia di paket ini — jadi tombol ditambahkan di
 * atas DOM yang sudah dirender React, tanpa mengubah bundle-nya. Sama
 * seperti pis-pkwt-generator.js & pis-pkwt-button-replace.js.
 */
(function () {
  "use strict";

  const PKWT_NUMBER_RE = /\d{2,4}\s*\/\s*PKWT\s*\//i;
  // Sama persis dengan daftar peran yang boleh melihat kolom Aksi di halaman
  // native (variabel "b" pada komponen PKWTPage) & yang diizinkan server
  // untuk menghapus PKWT/Surat Tugas (PKWT_MANAGER_ROLES di worker.js).
  const MANAGER_ROLES = ["Master Admin", "Admin Pos", "Chief Security", "Supervisor Facility"];

  function isPkwtPage() {
    return /pkwt/i.test(window.location.pathname);
  }

  function getEmployee() {
    try {
      const s = localStorage.getItem("pis_employee") || sessionStorage.getItem("pis_employee");
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  }
  function getToken() {
    try { return localStorage.getItem("token") || sessionStorage.getItem("token"); } catch { return null; }
  }
  function canManage() {
    const emp = getEmployee();
    const role = (emp && (emp.role || emp.jabatan)) || "";
    return MANAGER_ROLES.includes(role);
  }

  async function apiList(path) {
    try {
      const token = getToken();
      const res = await fetch(path, { headers: token ? { "X-Employee-Token": token } : {} });
      const data = await res.json().catch(() => null);
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }
  async function apiCall(fnName, body) {
    const token = getToken();
    try {
      const res = await fetch(`/api/apps/functions/${fnName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "X-Employee-Token": token } : {}) },
        body: JSON.stringify(body),
      });
      return await res.json().catch(() => ({ success: false, error: "Respons server tidak valid." }));
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Cache daftar PKWTContract supaya tidak fetch berulang untuk setiap baris
  // — cukup satu kali per siklus scan, lalu dicocokkan ke tiap baris lewat
  // nomor PKWT yang tampil di DOM.
  let pkwtCache = [];
  let lastFetchAt = 0;
  async function refreshPkwtCache() {
    const now = Date.now();
    if (now - lastFetchAt < 3000 && pkwtCache.length) return pkwtCache;
    lastFetchAt = now;
    pkwtCache = await apiList("/api/apps/entities/PKWTContract?limit=500");
    return pkwtCache;
  }

  function extractNomorPkwt(rowText) {
    const m = rowText.match(/\d{2,4}\s*\/\s*PKWT\s*\/[^\s]*/i);
    return m ? m[0].trim() : null;
  }

  function findPkwtRows() {
    return Array.from(document.querySelectorAll("tr")).filter((tr) => {
      const txt = tr.textContent || "";
      return txt.length < 3000 && PKWT_NUMBER_RE.test(txt);
    });
  }

  function findAksiCell(row) {
    const cells = row.querySelectorAll("td");
    if (!cells.length) return null;
    // Kolom Aksi selalu kolom paling kanan pada tabel PKWT Karyawan.
    return cells[cells.length - 1];
  }

  function buildButtons(record) {
    const wrap = document.createElement("div");
    wrap.className = "pis-pkwt-aksi-wrap";
    wrap.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "✏️ Edit";
    editBtn.title = "Edit PKWT & Surat Tugas";
    editBtn.style.cssText =
      "font:700 11px system-ui,sans-serif;color:#2563eb;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:3px 8px;cursor:pointer;";
    editBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.__pisOpenPkwtGeneratorModal === "function") {
        window.__pisOpenPkwtGeneratorModal(record);
      }
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "🗑️ Hapus";
    delBtn.title = "Hapus PKWT & Surat Tugas";
    delBtn.style.cssText =
      "font:700 11px system-ui,sans-serif;color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:3px 8px;cursor:pointer;";
    delBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const label = `PKWT ${record.nomor_pkwt || ""}`.trim();
      if (
        !window.confirm(
          `Hapus ${label}?\n\nDokumen PKWT dan Surat Tugas yang terhubung dengannya (jika ada) akan ikut terhapus, termasuk file .docx-nya. Tindakan ini tidak bisa dibatalkan.`
        )
      ) {
        return;
      }
      delBtn.disabled = true;
      delBtn.textContent = "Menghapus...";
      const res = await apiCall("deletePkwtAndAssignment", { pkwt_id: record.id });
      if (!res || res.success === false) {
        window.alert((res && res.error) || "Gagal menghapus.");
        delBtn.disabled = false;
        delBtn.textContent = "🗑️ Hapus";
        return;
      }
      window.alert(res.message || "Berhasil dihapus.");
      window.location.reload();
    });

    wrap.appendChild(editBtn);
    wrap.appendChild(delBtn);
    return wrap;
  }

  function ensureButtons(row, record) {
    const cell = findAksiCell(row);
    if (!cell) return;
    const existing = cell.querySelector(".pis-pkwt-aksi-wrap");
    if (existing) {
      if (existing.dataset.pisPkwtRecordId === String(record.id)) return; // sudah terpasang & sesuai
      existing.remove();
    }
    const wrap = buildButtons(record);
    wrap.dataset.pisPkwtRecordId = String(record.id);
    cell.appendChild(wrap);
  }

  async function scan() {
    if (!isPkwtPage() || !canManage()) return;
    const rows = findPkwtRows();
    if (!rows.length) return;
    await refreshPkwtCache();
    rows.forEach((row) => {
      const nomor = extractNomorPkwt(row.textContent || "");
      if (!nomor) return;
      const normalizedNomor = nomor.replace(/\s+/g, "");
      const record = pkwtCache.find((r) => String(r.nomor_pkwt || "").replace(/\s+/g, "") === normalizedNomor);
      if (record) ensureButtons(row, record);
    });
  }

  const observer = new MutationObserver(() => scan());
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
  // Jaga-jaga untuk kasus data berubah (mis. setelah Edit dari panel
  // mengambang) tanpa memicu mutasi DOM yang cukup besar untuk terdeteksi
  // observer di atas.
  setInterval(scan, 4000);
})();
