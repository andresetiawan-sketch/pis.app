/**
 * PIS — TAMPILKAN PKWT & SURAT TUGAS (HASIL "Generate PKWT & Surat Tugas")
 * DI KOLOM "Dokumen" (halaman "PKWT Karyawan" / PKWTPage).
 * ============================================================
 * Kolom "Dokumen" bawaan pada tabel "Data PKWT Karyawan" hanya menampilkan
 * tombol "Generate PDF" (belum benar-benar berfungsi) dan link "Final" /
 * "Draft PKWT" dari upload manual (field dokumen_pkwt / draft_template).
 * Dokumen PKWT & Surat Tugas yang dibuat lewat fitur baru "Generate PKWT &
 * Surat Tugas" (pis-pkwt-generator.js) TIDAK ikut tampil di kolom itu —
 * sejauh ini hanya bisa dilihat lewat modal "Kelola/Hapus Dokumen" atau
 * riwayat di dalam form Edit.
 *
 * File ini menambahkan blok kecil di BAWAH isi kolom "Dokumen" bawaan,
 * berisi link unduh PKWT & Surat Tugas hasil generate otomatis untuk baris
 * PKWT tsb — keduanya ditampilkan BERDAMPINGAN & ditandai simbol 🔗 supaya
 * jelas kalau keduanya saling terhubung (satu PKWT ⇄ satu Surat Tugas,
 * lewat PKWTContract.assignment_id / Assignment.pkwt_id di backend).
 * Meng-klik salah satu tautan mengunduh dokumen .docx-nya langsung.
 *
 * Kenapa lapisan terpisah, bukan edit langsung ke komponen React?
 * Source .jsx asli tidak tersedia di paket ini — jadi blok ini ditambahkan
 * di atas DOM yang sudah dirender React, tanpa mengubah bundle-nya. Sama
 * seperti pis-pkwt-generator.js & pis-pkwt-aksi-buttons.js.
 */
(function () {
  "use strict";

  const PKWT_NUMBER_RE = /\d{2,4}\s*\/\s*PKWT\s*\//i;
  const DEBUG = true; // log ringkas ke console.debug supaya mudah dicek lewat DevTools

  function isPkwtPage() {
    return /pkwt/i.test(window.location.pathname);
  }

  function getToken() {
    try { return localStorage.getItem("token") || sessionStorage.getItem("token"); } catch { return null; }
  }
  async function apiList(path) {
    try {
      const token = getToken();
      const res = await fetch(path, { headers: token ? { "X-Employee-Token": token } : {} });
      const data = await res.json().catch(() => null);
      return Array.isArray(data) ? data : (data && data.data) || [];
    } catch { return []; }
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Cache PKWTContract + Assignment supaya tidak fetch berulang untuk setiap
  // baris — cukup sekali per siklus scan, lalu dicocokkan lewat nomor PKWT
  // yang tampil di DOM (sama seperti pis-pkwt-aksi-buttons.js).
  let pkwtCache = [];
  let assignmentById = new Map();
  let lastFetchAt = 0;
  async function refreshCache() {
    const now = Date.now();
    if (now - lastFetchAt < 3000 && pkwtCache.length) return;
    lastFetchAt = now;
    const [pkwts, assignments] = await Promise.all([
      apiList("/api/apps/entities/PKWTContract?limit=500"),
      apiList("/api/apps/entities/Assignment?limit=500"),
    ]);
    pkwtCache = pkwts;
    assignmentById = new Map(assignments.map((a) => [String(a.id), a]));
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

  // Index kolom "Dokumen" dicari otomatis dari baris header tabel (bukan
  // angka tetap) — supaya tetap benar walau urutan/jumlah kolom berbeda
  // dari yang diasumsikan sebelumnya (mis. beda per peran/versi bundle).
  // Disimpan di tabelnya sendiri (WeakMap) supaya tidak dihitung berulang.
  const dokumenColIndexCache = new WeakMap();
  function getDokumenColumnIndex(table) {
    if (dokumenColIndexCache.has(table)) return dokumenColIndexCache.get(table);
    let idx = -1;
    table.querySelectorAll("thead th").forEach((th, i) => {
      if ((th.textContent || "").trim() === "Dokumen") idx = i;
    });
    dokumenColIndexCache.set(table, idx);
    if (DEBUG && idx === -1) {
      console.debug("[pis-pkwt-dokumen-kolom] Header 'Dokumen' tidak ditemukan di tabel ini:", table);
    }
    return idx;
  }

  function findDokumenCell(row) {
    const table = row.closest("table");
    if (!table) return null;
    const idx = getDokumenColumnIndex(table);
    if (idx === -1) return null;
    const cells = row.querySelectorAll("td");
    if (cells.length <= idx) return null;
    return cells[idx];
  }

  function buildBlock(pkwtRecord, assignmentRecord) {
    if (!pkwtRecord || !pkwtRecord.file_url) return null; // belum pernah dibuat lewat Generate PKWT & Surat Tugas

    const wrap = document.createElement("div");
    wrap.className = "pis-pkwt-dok-auto";
    wrap.style.cssText =
      "margin-top:6px;padding-top:6px;border-top:1px dashed #e5e7eb;display:flex;flex-direction:column;gap:4px;";

    const label = document.createElement("div");
    label.textContent = "Dari Generate PKWT & Surat Tugas:";
    label.style.cssText = "font:600 10px system-ui,sans-serif;color:#9ca3af;";
    wrap.appendChild(label);

    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:4px;flex-wrap:wrap;";

    const pkwtLink = document.createElement("a");
    pkwtLink.href = pkwtRecord.file_url;
    pkwtLink.target = "_blank";
    pkwtLink.rel = "noopener";
    pkwtLink.title = `PKWT ${pkwtRecord.nomor_pkwt || ""}`.trim();
    pkwtLink.textContent = "📄 PKWT";
    pkwtLink.style.cssText =
      "font:700 11px system-ui,sans-serif;color:#7B1A2C;background:#fdf2f3;border:1px solid #e5c9ce;border-radius:6px;padding:3px 8px;text-decoration:none;white-space:nowrap;";
    row.appendChild(pkwtLink);

    if (assignmentRecord && assignmentRecord.file_url) {
      const linkIcon = document.createElement("span");
      linkIcon.textContent = "🔗";
      linkIcon.title = "PKWT & Surat Tugas ini saling terhubung";
      linkIcon.style.cssText = "font-size:11px;color:#9ca3af;";
      row.appendChild(linkIcon);

      const stLink = document.createElement("a");
      stLink.href = assignmentRecord.file_url;
      stLink.target = "_blank";
      stLink.rel = "noopener";
      stLink.title = `Surat Tugas ${assignmentRecord.nomor_surat_tugas || ""}`.trim();
      stLink.textContent = "📋 Surat Tugas";
      stLink.style.cssText =
        "font:700 11px system-ui,sans-serif;color:#2563eb;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:3px 8px;text-decoration:none;white-space:nowrap;";
      row.appendChild(stLink);
    }

    wrap.appendChild(row);
    wrap.title = escapeHtml(
      `${pkwtRecord.nomor_pkwt || ""}${assignmentRecord && assignmentRecord.nomor_surat_tugas ? " ⇄ " + assignmentRecord.nomor_surat_tugas : ""}`
    );
    return wrap;
  }

  function ensureBlock(row, pkwtRecord, assignmentRecord) {
    const cell = findDokumenCell(row);
    if (!cell) return;
    const marker = `${pkwtRecord.id}:${pkwtRecord.assignment_id || ""}:${pkwtRecord.file_url || ""}`;
    const existing = cell.querySelector(".pis-pkwt-dok-auto");
    if (existing) {
      if (existing.dataset.pisPkwtDokMarker === marker) return; // sudah sesuai, tidak perlu render ulang
      existing.remove();
    }
    const block = buildBlock(pkwtRecord, assignmentRecord);
    if (!block) return;
    block.dataset.pisPkwtDokMarker = marker;
    cell.appendChild(block);
  }

  async function scan() {
    if (!isPkwtPage()) return;
    const rows = findPkwtRows();
    if (!rows.length) {
      if (DEBUG) console.debug("[pis-pkwt-dokumen-kolom] Tidak ada baris PKWT ditemukan di halaman ini.");
      return;
    }
    await refreshCache();
    let matched = 0, withDoc = 0, injected = 0;
    rows.forEach((row) => {
      const nomor = extractNomorPkwt(row.textContent || "");
      if (!nomor) return;
      const normalizedNomor = nomor.replace(/\s+/g, "");
      const record = pkwtCache.find((r) => String(r.nomor_pkwt || "").replace(/\s+/g, "") === normalizedNomor);
      if (!record) return;
      matched++;
      if (!record.file_url) return; // bukan hasil "Generate PKWT & Surat Tugas"
      withDoc++;
      const assignment = record.assignment_id ? assignmentById.get(String(record.assignment_id)) : null;
      const cell = findDokumenCell(row);
      if (!cell) return;
      ensureBlock(row, record, assignment);
      injected++;
    });
    if (DEBUG) {
      console.debug("[pis-pkwt-dokumen-kolom] scan:", {
        baris_ditemukan: rows.length,
        pkwt_di_database: pkwtCache.length,
        cocok_nomor: matched,
        punya_file_url_generator: withDoc,
        berhasil_disisipkan: injected,
      });
    }
  }

  // Panggil window.__pisDebugPkwtDokumen() dari console browser (F12) di
  // halaman "PKWT Karyawan" untuk melihat detail kenapa tautan tidak muncul
  // (mis. cocok_nomor=0 → nomor PKWT di layar tidak ada di database;
  // punya_file_url_generator=0 → PKWT itu belum pernah dibuat lewat
  // "Generate PKWT & Surat Tugas"; berhasil_disisipkan=0 padahal yang lain
  // >0 → kolom "Dokumen" tidak ketemu di header tabel).
  window.__pisDebugPkwtDokumen = async function () {
    lastFetchAt = 0; // paksa fetch ulang
    await scan();
    return {
      pkwtCache,
      assignmentById: Object.fromEntries(assignmentById),
      rowsFound: findPkwtRows().length,
    };
  };

  const observer = new MutationObserver(() => scan());
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
  // Jaga-jaga untuk kasus data berubah (mis. setelah Generate/Edit dari
  // panel mengambang) tanpa memicu mutasi DOM yang cukup besar untuk
  // terdeteksi observer di atas.
  setInterval(scan, 4000);
})();