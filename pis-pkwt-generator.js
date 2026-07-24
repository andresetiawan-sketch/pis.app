/**
 * PIS PKWT & SURAT TUGAS GENERATOR — tombol + panel terapung untuk membuat
 * DAN mengedit dokumen PKWT (.docx) dan Surat Tugas (.docx) secara otomatis
 * & saling terhubung, langsung siap diunduh.
 *
 * Fitur ini SEKARANG MENGGANTIKAN SEPENUHNYA form bawaan "Buat PKWT Baru"
 * (yang tombol "Generate PDF"-nya belum benar-benar berfungsi). Tombol
 * bawaan "Buat PKWT" di halaman PKWT Karyawan tetap tampil apa adanya
 * (styling tidak diubah) tapi sekarang membuka panel ini — lihat
 * pis-pkwt-button-replace.js untuk bagian yang "membajak" tombol tsb.
 *
 * Kenapa lapisan terpisah (bukan edit langsung ke komponen React)?
 * Sama seperti pis-enhancements.js & pis-recruitment-form.js — source .jsx
 * asli tidak tersedia di paket ini, jadi fitur baru ditambahkan sebagai
 * panel mengambang di atas halaman yang sudah dirender React, tanpa
 * mengubah bundle-nya.
 *
 * Data diambil otomatis dari:
 *  1) Data Karyawan yang diterima (nama, NIK, jabatan, area tugas/proyek)
 *  2) Data pelamar asal (formulir lamaran online) — TTL, NIK E-KTP, alamat
 *  3) Data Area/Proyek — alamat lokasi penugasan
 * Endpoint backend:
 *  - POST /api/apps/functions/generatePKWTAndAssignment  (buat / edit)
 *  - POST /api/apps/functions/searchEmployeesForPkwt      (cari nik/nama/ktp)
 *  - POST /api/apps/functions/pkwtSalaryOptions            (riwayat gaji)
 * Begitu PKWT dibuat/diedit, Surat Tugas OTOMATIS ikut dibuat/diperbarui &
 * siap diunduh — nomornya memakai kode "ST" (bukan "PKWT").
 */
(function () {
  "use strict";

  const MANAGER_ROLES = ["Master Admin", "Admin Pos", "Chief Security", "Supervisor Facility", "Admin"];
  const DEFAULT_PP35_TEXT = "Peraturan Pemerintah No. 35 Tahun 2021 tentang Perjanjian Kerja Waktu Tertentu";

  // Halaman "PKWT Karyawan" di sidebar bermuara ke route "/PKWTPage".
  function isPkwtKaryawanPage() {
    return window.location.pathname.replace(/\/+$/, "") === "/PKWTPage";
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
  function canUseFeature() {
    const emp = getEmployee();
    const role = (emp && (emp.role || emp.jabatan)) || "";
    return MANAGER_ROLES.includes(role);
  }

  async function apiGet(path) {
    const token = getToken();
    const res = await fetch(path, { headers: token ? { "X-Employee-Token": token } : {} });
    return res.json().catch(() => null);
  }
  async function apiList(path) {
    const data = await apiGet(path);
    return Array.isArray(data) ? data : (data && data.data) || [];
  }
  async function apiCall(fnName, body) {
    const token = getToken();
    const res = await fetch(`/api/apps/functions/${fnName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { "X-Employee-Token": token } : {}) },
      body: JSON.stringify(body),
    });
    return res.json().catch(() => ({ success: false, error: "Respons server tidak valid." }));
  }

  // ============================================================
  // Styles
  // ============================================================
  const style = document.createElement("style");
  style.textContent = `
    .pispkwt-topbar {
      position: sticky; top: 0; z-index: 40;
      display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px;
      padding: 8px 0; margin-bottom: 6px;
      background: linear-gradient(to bottom, #f9fafb 88%, transparent);
    }
    .pispkwt-top-btn {
      display: inline-flex; align-items: center; gap: 8px;
      font: 700 13px system-ui, sans-serif; color: #fff;
      background: linear-gradient(135deg, #7B1A2C, #a12238);
      border: none; border-radius: 10px; padding: 10px 16px;
      cursor: pointer; box-shadow: 0 4px 12px rgba(123,26,44,.25);
    }
    .pispkwt-top-btn:hover { filter: brightness(1.08); }
    .pispkwt-top-btn.pispkwt-top-btn-secondary {
      background: #fff; color: #b91c1c; border: 1.5px solid #fecaca; box-shadow: none;
    }
    .pispkwt-top-btn.pispkwt-top-btn-secondary:hover { background: #fef2f2; }
    .pispkwt-overlay {
      position: fixed; inset: 0; background: rgba(17,17,20,.5); z-index: 9999;
      display: flex; align-items: center; justify-content: center; padding: 16px;
    }
    .pispkwt-modal {
      background: #fff; border-radius: 16px; width: 100%; max-width: 600px;
      max-height: 90vh; overflow-y: auto; padding: 22px 24px;
      font: 400 13.5px system-ui, sans-serif; color: #1f2937;
      box-shadow: 0 20px 50px rgba(0,0,0,.25);
    }
    .pispkwt-modal h2 { font-size: 17px; font-weight: 800; color: #7B1A2C; margin: 0 0 4px; }
    .pispkwt-modal .pispkwt-sub { color: #6b7280; font-size: 12.5px; margin-bottom: 16px; }
    .pispkwt-field { margin-bottom: 12px; position: relative; }
    .pispkwt-field label { display: block; font-weight: 600; font-size: 12.5px; margin-bottom: 4px; color: #374151; }
    .pispkwt-field select, .pispkwt-field input, .pispkwt-field textarea {
      width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #d1d5db;
      border-radius: 8px; font-size: 13.5px; font-family: inherit;
    }
    .pispkwt-field textarea { resize: vertical; min-height: 56px; }
    .pispkwt-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .pispkwt-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
    .pispkwt-btn {
      font: 700 13px system-ui, sans-serif; border-radius: 9px; padding: 9px 16px;
      cursor: pointer; border: 1px solid transparent;
    }
    .pispkwt-btn.primary { background: #7B1A2C; color: #fff; }
    .pispkwt-btn.primary:disabled { opacity: .55; cursor: not-allowed; }
    .pispkwt-btn.ghost { background: #fff; color: #374151; border-color: #d1d5db; }
    .pispkwt-msg { font-size: 12.5px; margin-top: 10px; border-radius: 8px; padding: 8px 10px; }
    .pispkwt-msg.err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
    .pispkwt-msg.ok { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
    .pispkwt-download { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
    .pispkwt-download a {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      background: #fdf2f3; color: #7B1A2C; border: 1px solid #e5c9ce; border-radius: 9px;
      padding: 10px; font-weight: 700; text-decoration: none; font-size: 13px;
    }
    .pispkwt-download a:hover { background: #fbe4e6; }
    .pispkwt-history { margin-top: 16px; border-top: 1px dashed #e5e7eb; padding-top: 12px; }
    .pispkwt-history h3 { font-size: 12.5px; font-weight: 700; color: #6b7280; margin: 0 0 8px; }
    .pispkwt-history-item {
      display: flex; justify-content: space-between; align-items: center; gap: 8px;
      font-size: 12.5px; padding: 6px 0; border-bottom: 1px solid #f3f4f6;
    }
    .pispkwt-history-item .pispkwt-hlinks { display: flex; align-items: center; gap: 10px; }
    .pispkwt-history-item a { color: #7B1A2C; font-weight: 700; text-decoration: none; }
    .pispkwt-history-item a.pispkwt-edit-link { color: #2563eb; }
    .pispkwt-history-item a.pispkwt-delete-link { color: #dc2626; }
    .pispkwt-suggest {
      position: absolute; left: 0; right: 0; top: calc(100% + 2px); z-index: 20;
      background: #fff; border: 1px solid #d1d5db; border-radius: 8px;
      max-height: 190px; overflow-y: auto; box-shadow: 0 8px 20px rgba(0,0,0,.12);
    }
    .pispkwt-suggest-item { padding: 8px 10px; cursor: pointer; font-size: 13px; border-bottom: 1px solid #f3f4f6; }
    .pispkwt-suggest-item:last-child { border-bottom: none; }
    .pispkwt-suggest-item:hover { background: #fdf2f3; }
    .pispkwt-suggest-item .sub { color: #6b7280; font-size: 11.5px; }
    .pispkwt-hint { font-size: 11px; color: #9ca3af; margin-top: 3px; }
    .pispkwt-manage-list { max-height: 50vh; overflow-y: auto; margin-top: 4px; }
    .pispkwt-manage-empty { color: #9ca3af; font-size: 12.5px; padding: 10px 0; }
  `;
  document.head.appendChild(style);


  // ============================================================
  // Data helpers
  // ============================================================
  async function searchEmployees(q) {
    const res = await apiCall("searchEmployeesForPkwt", { q });
    if (res && res.success) return res.data || [];
    // fallback lama jika endpoint baru belum di-deploy
    const list = await apiList("/api/apps/entities/Employee?status_aktif=Aktif");
    const ql = (q || "").toLowerCase();
    return list.filter(
      (e) => !ql ||
        String(e.nik_karyawan || "").toLowerCase().includes(ql) ||
        String(e.nama_lengkap || "").toLowerCase().includes(ql)
    );
  }

  async function loadSalaryOptions(jabatan, area_tugas) {
    const res = await apiCall("pkwtSalaryOptions", { jabatan, area_tugas });
    if (res && res.success) return res;
    return { gaji_pokok: [], tunjangan_jabatan: [], tunjangan_lain: [] };
  }

  async function deletePkwtRecord(id, label) {
    if (!window.confirm(`Hapus ${label}?\n\nDokumen PKWT dan Surat Tugas yang terhubung dengannya (jika ada) akan ikut terhapus, termasuk file .docx-nya. Tindakan ini tidak bisa dibatalkan.`)) {
      return null;
    }
    return apiCall("deletePkwtAndAssignment", { pkwt_id: id });
  }
  async function deleteAssignmentRecord(id, label) {
    if (!window.confirm(`Hapus ${label}?\n\nFile .docx Surat Tugas ini akan ikut terhapus. Tindakan ini tidak bisa dibatalkan.`)) {
      return null;
    }
    return apiCall("deleteAssignmentOnly", { assignment_id: id });
  }

  async function renderHistory(container, employeeId) {
    container.innerHTML = `<h3>Riwayat dokumen karyawan ini</h3><div style="color:#9ca3af;">Memuat...</div>`;
    const [pkwts, assignments] = await Promise.all([
      apiList(`/api/apps/entities/PKWTContract?employee_id=${encodeURIComponent(employeeId)}`),
      apiList(`/api/apps/entities/Assignment?employee_id=${encodeURIComponent(employeeId)}`),
    ]);
    const items = [
      ...pkwts.map((r) => ({ ...r, _kind: "pkwt", _label: `PKWT ${r.nomor_pkwt || ""}` })),
      ...assignments.map((r) => ({ ...r, _kind: "assignment", _label: `Surat Tugas ${r.nomor_surat_tugas || ""}` })),
    ]
      .filter((r) => r.file_url)
      .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")));

    if (!items.length) {
      container.innerHTML = `<h3>Riwayat dokumen karyawan ini</h3><div style="color:#9ca3af;">Belum ada dokumen yang pernah dibuat.</div>`;
      return;
    }
    const rows = items
      .map((r) => {
        const editLink =
          r._kind === "pkwt"
            ? `<a href="#" class="pispkwt-edit-link" data-edit-pkwt-id="${escapeHtml(r.id)}">✏️ Edit</a>`
            : "";
        const deleteLink =
          r._kind === "pkwt"
            ? `<a href="#" class="pispkwt-delete-link" data-delete-pkwt-id="${escapeHtml(r.id)}" data-delete-label="${escapeHtml(r._label)}">🗑️ Hapus</a>`
            : `<a href="#" class="pispkwt-delete-link" data-delete-assignment-id="${escapeHtml(r.id)}" data-delete-label="${escapeHtml(r._label)}">🗑️ Hapus</a>`;
        return `<div class="pispkwt-history-item">
          <span>${escapeHtml(r._label)}</span>
          <span class="pispkwt-hlinks">
            ${editLink}
            <a href="${escapeHtml(r.file_url)}" target="_blank" rel="noopener">Unduh</a>
            ${deleteLink}
          </span>
        </div>`;
      })
      .join("");
    container.innerHTML = `<h3>Riwayat dokumen karyawan ini</h3>${rows}`;

    container.querySelectorAll("[data-edit-pkwt-id]").forEach((a) => {
      a.addEventListener("click", async (e) => {
        e.preventDefault();
        const id = a.getAttribute("data-edit-pkwt-id");
        const record = await apiGet(`/api/apps/entities/PKWTContract/${encodeURIComponent(id)}`);
        if (record && !record.error) {
          document.getElementById("pispkwt-overlay")?.remove();
          openModal(record);
        }
      });
    });

    container.querySelectorAll("[data-delete-pkwt-id]").forEach((a) => {
      a.addEventListener("click", async (e) => {
        e.preventDefault();
        const id = a.getAttribute("data-delete-pkwt-id");
        const label = a.getAttribute("data-delete-label") || "dokumen ini";
        const res = await deletePkwtRecord(id, label);
        if (!res) return; // dibatalkan
        if (res.success === false) { window.alert(res.error || "Gagal menghapus."); return; }
        renderHistory(container, employeeId);
      });
    });
    container.querySelectorAll("[data-delete-assignment-id]").forEach((a) => {
      a.addEventListener("click", async (e) => {
        e.preventDefault();
        const id = a.getAttribute("data-delete-assignment-id");
        const label = a.getAttribute("data-delete-label") || "dokumen ini";
        const res = await deleteAssignmentRecord(id, label);
        if (!res) return; // dibatalkan
        if (res.success === false) { window.alert(res.error || "Gagal menghapus."); return; }
        renderHistory(container, employeeId);
      });
    });
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ============================================================
  // Modal
  // ============================================================
  async function openModal(editRecord) {
    if (document.getElementById("pispkwt-overlay")) return;
    const isEdit = !!(editRecord && editRecord.id);
    const overlay = document.createElement("div");
    overlay.id = "pispkwt-overlay";
    overlay.className = "pispkwt-overlay";
    overlay.innerHTML = `
      <div class="pispkwt-modal">
        <h2>📄 ${isEdit ? "Edit PKWT & Surat Tugas" : "Generate PKWT & Surat Tugas"}</h2>
        <div class="pispkwt-sub">Data diambil otomatis dari Data Karyawan, data pelamar (formulir lamaran online), dan penempatan Area Tugas/Proyek. Surat Tugas akan otomatis ikut dibuat/diperbarui begitu PKWT selesai.</div>

        <div class="pispkwt-field">
          <label>Karyawan</label>
          <input type="text" id="pispkwt-employee-search" placeholder="Ketik NIK Karyawan / Nama / NIK E-KTP..." autocomplete="off" ${isEdit ? "disabled" : ""} />
          <input type="hidden" id="pispkwt-employee-id" />
          <div id="pispkwt-suggest" class="pispkwt-suggest" style="display:none;"></div>
          <div class="pispkwt-hint">Cari berdasarkan NIK Karyawan, Nama, atau NIK E-KTP.</div>
        </div>

        <div id="pispkwt-emp-info" style="font-size:12px;color:#6b7280;margin:-6px 0 12px;"></div>

        <div class="pispkwt-row">
          <div class="pispkwt-field">
            <label>Tanggal Mulai</label>
            <input type="date" id="pispkwt-mulai" />
          </div>
          <div class="pispkwt-field">
            <label>Tanggal Selesai</label>
            <input type="date" id="pispkwt-selesai" />
          </div>
        </div>

        <div class="pispkwt-field">
          <label>Entity PT</label>
          <select id="pispkwt-entity">
            <option value="">(Otomatis dari data karyawan)</option>
            <option value="PT. Putra Indonesia Solusi">PT. Putra Indonesia Solusi</option>
            <option value="PT. Prestasi Indonesia Solusi">PT. Prestasi Indonesia Solusi</option>
          </select>
        </div>

        <div class="pispkwt-row">
          <div class="pispkwt-field">
            <label>Gaji Pokok (Rp)</label>
            <input type="number" min="0" step="1000" id="pispkwt-gaji" placeholder="4500000" list="pispkwt-gaji-list" />
            <datalist id="pispkwt-gaji-list"></datalist>
          </div>
          <div class="pispkwt-field">
            <label>Tunjangan Jabatan (Rp)</label>
            <input type="number" min="0" step="1000" id="pispkwt-tj" placeholder="0" list="pispkwt-tj-list" />
            <datalist id="pispkwt-tj-list"></datalist>
          </div>
        </div>
        <div class="pispkwt-field">
          <label>Tunjangan Lain-lain (Rp)</label>
          <input type="number" min="0" step="1000" id="pispkwt-tl" placeholder="0" list="pispkwt-tl-list" />
          <datalist id="pispkwt-tl-list"></datalist>
          <div class="pispkwt-hint" id="pispkwt-salary-hint"></div>
        </div>

        <div class="pispkwt-field">
          <label>Pasal 9 Ayat (2) — Ketentuan Berakhirnya PKWT</label>
          <textarea id="pispkwt-pp35">${escapeHtml(isEdit ? (editRecord.pasal_9_ayat2_pp35 || DEFAULT_PP35_TEXT) : DEFAULT_PP35_TEXT)}</textarea>
          <div class="pispkwt-hint">Rujukan aturan (mis. PP 35/2021) — bisa disunting sesuai kebutuhan.</div>
        </div>

        <div id="pispkwt-result"></div>
        <div id="pispkwt-history" class="pispkwt-history" style="display:none;"></div>

        <div class="pispkwt-actions">
          <button type="button" class="pispkwt-btn ghost" id="pispkwt-close">Tutup</button>
          <button type="button" class="pispkwt-btn primary" id="pispkwt-submit">${isEdit ? "💾 Simpan Perubahan" : "Generate PKWT & Surat Tugas"}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // ── Tabel "Data PKWT Karyawan" bawaan (React) tidak tahu ada PKWT
    // baru/berubah karena dibuat lewat endpoint kustom di luar alur
    // mutation React Query miliknya (tidak ada cara resmi memicu
    // refetch-nya dari luar tanpa mengubah bundle). Solusinya: begitu
    // panel ini DITUTUP (bukan langsung setelah sukses, supaya tautan
    // unduh PKWT/Surat Tugas masih bisa diklik dulu), halaman di-reload
    // otomatis — Data PKWT Karyawan pun otomatis ikut baris terbaru
    // tanpa pengguna harus me-refresh browser sendiri. ──
    let needsTableRefresh = false;
    function closeOverlay() {
      overlay.remove();
      if (needsTableRefresh) window.location.reload();
    }
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeOverlay(); });
    document.getElementById("pispkwt-close").addEventListener("click", () => closeOverlay());

    const searchInput = document.getElementById("pispkwt-employee-search");
    const empIdInput = document.getElementById("pispkwt-employee-id");
    const suggestBox = document.getElementById("pispkwt-suggest");
    const empInfo = document.getElementById("pispkwt-emp-info");
    const historyBox = document.getElementById("pispkwt-history");
    let selectedEmployee = null;

    async function refreshSalaryOptions() {
      if (!selectedEmployee || !selectedEmployee.jabatan) return;
      const opts = await loadSalaryOptions(selectedEmployee.jabatan, selectedEmployee.area_tugas);
      const fill = (listId, values) => {
        const el = document.getElementById(listId);
        el.innerHTML = values.map((v) => `<option value="${v}"></option>`).join("");
      };
      fill("pispkwt-gaji-list", opts.gaji_pokok || []);
      fill("pispkwt-tj-list", opts.tunjangan_jabatan || []);
      fill("pispkwt-tl-list", opts.tunjangan_lain || []);
      const hint = document.getElementById("pispkwt-salary-hint");
      const total = (opts.gaji_pokok || []).length + (opts.tunjangan_jabatan || []).length + (opts.tunjangan_lain || []).length;
      hint.textContent = total
        ? `Saran nominal muncul dari riwayat PKWT untuk jabatan "${selectedEmployee.jabatan}" di area "${selectedEmployee.area_tugas}".`
        : "";
    }

    async function selectEmployee(emp) {
      selectedEmployee = emp;
      empIdInput.value = emp.id;
      searchInput.value = `${emp.nama_lengkap || "-"} — ${emp.nik_karyawan || "-"}`;
      suggestBox.style.display = "none";
      document.getElementById("pispkwt-result").innerHTML = "";
      const complete = emp.jabatan && emp.area_tugas;
      empInfo.innerHTML = complete
        ? `Jabatan: <strong>${escapeHtml(emp.jabatan)}</strong> · Area Tugas: <strong>${escapeHtml(emp.area_tugas)}</strong>${emp.nik_ektp ? ` · NIK E-KTP: <strong>${escapeHtml(emp.nik_ektp)}</strong>` : ""}`
        : `⚠️ Jabatan/Area Tugas karyawan ini belum lengkap — lengkapi dulu di Data Karyawan sebelum membuat PKWT.`;
      historyBox.style.display = "block";
      renderHistory(historyBox, emp.id);
      refreshSalaryOptions();
    }

    let searchTimer = null;
    searchInput.addEventListener("input", () => {
      empIdInput.value = "";
      selectedEmployee = null;
      const q = searchInput.value.trim();
      clearTimeout(searchTimer);
      if (!q) { suggestBox.style.display = "none"; return; }
      searchTimer = setTimeout(async () => {
        const results = await searchEmployees(q);
        if (!results.length) {
          suggestBox.innerHTML = `<div class="pispkwt-suggest-item" style="color:#9ca3af;">Tidak ditemukan.</div>`;
          suggestBox.style.display = "block";
          return;
        }
        suggestBox.innerHTML = results
          .slice(0, 15)
          .map(
            (e, i) =>
              `<div class="pispkwt-suggest-item" data-idx="${i}">
                <div>${escapeHtml(e.nama_lengkap || "-")}</div>
                <div class="sub">NIK: ${escapeHtml(e.nik_karyawan || "-")}${e.nik_ektp ? " · KTP: " + escapeHtml(e.nik_ektp) : ""} · ${escapeHtml(e.jabatan || "-")}</div>
              </div>`
          )
          .join("");
        suggestBox.style.display = "block";
        suggestBox.querySelectorAll("[data-idx]").forEach((el) => {
          el.addEventListener("click", () => selectEmployee(results[Number(el.getAttribute("data-idx"))]));
        });
      }, 220);
    });
    document.addEventListener("click", (e) => {
      if (!suggestBox.contains(e.target) && e.target !== searchInput) suggestBox.style.display = "none";
    });

    // ── Mode edit: pre-isi seluruh form dari record yang dipilih ──
    if (isEdit) {
      const emp = await apiGet(`/api/apps/entities/Employee/${encodeURIComponent(editRecord.employee_id)}`);
      if (emp && !emp.error) {
        selectedEmployee = { ...emp, nik_ektp: editRecord.nik_ektp || "" };
        empIdInput.value = emp.id;
        searchInput.value = `${emp.nama_lengkap || "-"} — ${emp.nik_karyawan || "-"}`;
        const complete = emp.jabatan && emp.area_tugas;
        empInfo.innerHTML = complete
          ? `Jabatan: <strong>${escapeHtml(emp.jabatan)}</strong> · Area Tugas: <strong>${escapeHtml(emp.area_tugas)}</strong>`
          : "";
        refreshSalaryOptions();
      }
      document.getElementById("pispkwt-mulai").value = (editRecord.tanggal_mulai || "").slice(0, 10);
      document.getElementById("pispkwt-selesai").value = (editRecord.tanggal_selesai || "").slice(0, 10);
      document.getElementById("pispkwt-entity").value = editRecord.entity_pt || "";
      document.getElementById("pispkwt-gaji").value = editRecord.gaji_pokok || "";
      document.getElementById("pispkwt-tj").value = editRecord.tunjangan_jabatan || "";
      document.getElementById("pispkwt-tl").value = editRecord.tunjangan_lain || "";
      historyBox.style.display = "block";
      renderHistory(historyBox, editRecord.employee_id);
    }

    document.getElementById("pispkwt-submit").addEventListener("click", async () => {
      const btn = document.getElementById("pispkwt-submit");
      const resultBox = document.getElementById("pispkwt-result");
      const employee_id = empIdInput.value;
      const tanggal_mulai = document.getElementById("pispkwt-mulai").value;
      const tanggal_selesai = document.getElementById("pispkwt-selesai").value;
      const entity_pt = document.getElementById("pispkwt-entity").value;
      const gaji_pokok = document.getElementById("pispkwt-gaji").value;
      const tunjangan_jabatan = document.getElementById("pispkwt-tj").value;
      const tunjangan_lain = document.getElementById("pispkwt-tl").value;
      const pasal_9_ayat2_pp35 = document.getElementById("pispkwt-pp35").value;

      if (!employee_id || !tanggal_mulai || !tanggal_selesai) {
        resultBox.innerHTML = `<div class="pispkwt-msg err">Karyawan, Tanggal Mulai, dan Tanggal Selesai wajib diisi.</div>`;
        return;
      }
      btn.disabled = true;
      btn.textContent = "Memproses...";
      resultBox.innerHTML = "";
      try {
        const res = await apiCall("generatePKWTAndAssignment", {
          pkwt_id: isEdit ? editRecord.id : undefined,
          employee_id, tanggal_mulai, tanggal_selesai,
          entity_pt: entity_pt || undefined,
          gaji_pokok: gaji_pokok || 0,
          tunjangan_jabatan: tunjangan_jabatan || 0,
          tunjangan_lain: tunjangan_lain || 0,
          pasal_9_ayat2_pp35: pasal_9_ayat2_pp35 || undefined,
        });
        if (!res || res.success === false) {
          resultBox.innerHTML = `<div class="pispkwt-msg err">${escapeHtml((res && res.error) || "Gagal membuat dokumen.")}</div>`;
          return;
        }
        let html = `<div class="pispkwt-msg ok">${escapeHtml(res.message || "Dokumen berhasil dibuat.")}</div><div class="pispkwt-download">`;
        if (res.pkwt && res.pkwt.file_url) {
          html += `<a href="${escapeHtml(res.pkwt.file_url)}" target="_blank" rel="noopener">⬇️ Unduh PKWT (${escapeHtml(res.pkwt.nomor_pkwt || "")})</a>`;
        }
        if (res.assignment && res.assignment.file_url) {
          html += `<a href="${escapeHtml(res.assignment.file_url)}" target="_blank" rel="noopener">⬇️ Unduh Surat Tugas (${escapeHtml(res.assignment.nomor_surat_tugas || "")})</a>`;
        }
        html += `</div><div class="pispkwt-hint">Tabel "Data PKWT Karyawan" akan otomatis diperbarui begitu panel ini ditutup.</div>`;
        resultBox.innerHTML = html;
        needsTableRefresh = true;
        renderHistory(historyBox, employee_id);
      } catch (err) {
        resultBox.innerHTML = `<div class="pispkwt-msg err">Gagal terhubung ke server: ${escapeHtml(err.message || String(err))}</div>`;
      } finally {
        btn.disabled = false;
        btn.textContent = isEdit ? "💾 Simpan Perubahan" : "Generate PKWT & Surat Tugas";
      }
    });
  }
  // Ekspos supaya bisa dipanggil dari script lain (mis. tombol Edit di kolom Aksi)
  window.__pisOpenPkwtGeneratorModal = openModal;

  // ============================================================
  // Modal "Kelola/Hapus Dokumen" — daftar SEMUA PKWT & Surat Tugas yang
  // pernah dibuat lewat "Generate PKWT & Surat Tugas" (lintas karyawan,
  // tidak perlu cari/pilih karyawan dulu seperti riwayat per-karyawan di
  // dalam form Edit), lengkap dengan tombol Hapus untuk masing-masing &
  // kolom pencarian berdasarkan Nama atau NIK Karyawan.
  // ============================================================
  let manageItemsCache = null; // di-fetch sekali per buka modal, difilter di client saat mengetik

  async function loadManageItems() {
    const [pkwts, assignments] = await Promise.all([
      apiList("/api/apps/entities/PKWTContract?limit=500"),
      apiList("/api/apps/entities/Assignment?limit=500"),
    ]);
    manageItemsCache = [
      ...pkwts.map((r) => ({ ...r, _kind: "pkwt", _label: `PKWT ${r.nomor_pkwt || "-"} — ${r.nama_karyawan || "-"}` })),
      ...assignments.map((r) => ({ ...r, _kind: "assignment", _label: `Surat Tugas ${r.nomor_surat_tugas || "-"} — ${r.nama_karyawan || "-"}` })),
    ]
      .filter((r) => r.file_url)
      .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")));
    return manageItemsCache;
  }

  function filterManageItems(items, query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (r) =>
        String(r.nama_karyawan || "").toLowerCase().includes(q) ||
        String(r.nik_karyawan || "").toLowerCase().includes(q)
    );
  }

  function renderManageItemsList(container, items, query) {
    if (!items.length) {
      container.innerHTML = `<div class="pispkwt-manage-empty">${
        query ? "Tidak ada dokumen yang cocok dengan pencarian." : "Belum ada dokumen PKWT/Surat Tugas yang pernah dibuat."
      }</div>`;
      return;
    }

    container.innerHTML = items
      .map((r) => {
        const deleteAttr =
          r._kind === "pkwt"
            ? `data-delete-pkwt-id="${escapeHtml(r.id)}"`
            : `data-delete-assignment-id="${escapeHtml(r.id)}"`;
        return `<div class="pispkwt-history-item">
          <span>${escapeHtml(r._label)}${r.nik_karyawan ? ` <span style="color:#9ca3af;">(NIK ${escapeHtml(r.nik_karyawan)})</span>` : ""}</span>
          <span class="pispkwt-hlinks">
            <a href="${escapeHtml(r.file_url)}" target="_blank" rel="noopener">Unduh</a>
            <a href="#" class="pispkwt-delete-link" ${deleteAttr} data-delete-label="${escapeHtml(r._label)}">🗑️ Hapus</a>
          </span>
        </div>`;
      })
      .join("");

    container.querySelectorAll("[data-delete-pkwt-id]").forEach((a) => {
      a.addEventListener("click", async (e) => {
        e.preventDefault();
        const id = a.getAttribute("data-delete-pkwt-id");
        const label = a.getAttribute("data-delete-label") || "dokumen ini";
        const res = await deletePkwtRecord(id, label);
        if (!res) return; // dibatalkan
        if (res.success === false) { window.alert(res.error || "Gagal menghapus."); return; }
        refreshManageList(container, query);
      });
    });
    container.querySelectorAll("[data-delete-assignment-id]").forEach((a) => {
      a.addEventListener("click", async (e) => {
        e.preventDefault();
        const id = a.getAttribute("data-delete-assignment-id");
        const label = a.getAttribute("data-delete-label") || "dokumen ini";
        const res = await deleteAssignmentRecord(id, label);
        if (!res) return; // dibatalkan
        if (res.success === false) { window.alert(res.error || "Gagal menghapus."); return; }
        refreshManageList(container, query);
      });
    });
  }

  // Ambil ulang data dari server (mis. setelah Hapus) lalu terapkan lagi
  // pencarian yang sedang aktif.
  async function refreshManageList(container, query) {
    container.innerHTML = `<div class="pispkwt-manage-empty">Memuat...</div>`;
    const items = await loadManageItems();
    renderManageItemsList(container, filterManageItems(items, query), query);
  }

  function openManageDocsModal() {
    if (document.getElementById("pispkwt-manage-overlay")) return;
    manageItemsCache = null;
    const overlay = document.createElement("div");
    overlay.id = "pispkwt-manage-overlay";
    overlay.className = "pispkwt-overlay";
    overlay.innerHTML = `
      <div class="pispkwt-modal" style="max-width:640px;">
        <h2>🗑️ Kelola / Hapus Dokumen PKWT & Surat Tugas</h2>
        <div class="pispkwt-sub">Semua PKWT & Surat Tugas yang pernah dibuat lewat "Generate PKWT & Surat Tugas". Hapus akan ikut menghapus file .docx-nya — tidak bisa dibatalkan.</div>
        <div class="pispkwt-field">
          <input type="text" id="pispkwt-manage-search" placeholder="Cari berdasarkan Nama atau NIK Karyawan..." autocomplete="off" />
        </div>
        <div class="pispkwt-manage-list" id="pispkwt-manage-list"></div>
        <div class="pispkwt-actions">
          <button type="button" class="pispkwt-btn ghost" id="pispkwt-manage-close">Tutup</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById("pispkwt-manage-close").addEventListener("click", () => overlay.remove());

    const listBox = document.getElementById("pispkwt-manage-list");
    const searchInput = document.getElementById("pispkwt-manage-search");

    loadManageItems().then((items) => renderManageItemsList(listBox, items, ""));

    let searchTimer = null;
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const q = searchInput.value;
        const items = manageItemsCache || [];
        renderManageItemsList(listBox, filterManageItems(items, q), q);
      }, 180);
    });
  }


  // ============================================================
  // Toolbar terkunci (sticky) di ATAS halaman "PKWT Karyawan" — berisi
  // tombol "Generate PKWT & Surat Tugas" (buat/edit) dan "Kelola/Hapus
  // Dokumen" (lihat & hapus dokumen yang pernah dibuat). Menggantikan
  // tombol mengambang (FAB) di pojok kanan bawah yang dipakai sebelumnya —
  // sekarang selalu terlihat di bagian atas halaman, tidak perlu scroll
  // ke bawah untuk mengaksesnya.
  // ============================================================
  function findPageRoot() {
    const heading = Array.from(document.querySelectorAll("h2")).find(
      (el) => el.textContent && el.textContent.trim() === "Data PKWT Karyawan"
    );
    if (!heading) return null;
    let node = heading;
    for (let depth = 0; depth < 8 && node.parentElement; depth++) {
      node = node.parentElement;
      if (node.classList && node.classList.contains("space-y-4")) return node;
    }
    return heading.parentElement ? heading.parentElement.parentElement : null;
  }

  function injectTopBar() {
    if (!isPkwtKaryawanPage() || !canUseFeature()) {
      const existing = document.getElementById("pispkwt-topbar");
      if (existing) existing.remove();
      return;
    }
    if (document.getElementById("pispkwt-topbar")) return;
    const pageRoot = findPageRoot();
    if (!pageRoot) return;

    const bar = document.createElement("div");
    bar.id = "pispkwt-topbar";
    bar.className = "pispkwt-topbar";

    const genBtn = document.createElement("button");
    genBtn.type = "button";
    genBtn.className = "pispkwt-top-btn";
    genBtn.textContent = "📄 Generate PKWT & Surat Tugas";
    genBtn.addEventListener("click", () => openModal());

    const manageBtn = document.createElement("button");
    manageBtn.type = "button";
    manageBtn.className = "pispkwt-top-btn pispkwt-top-btn-secondary";
    manageBtn.textContent = "🗑️ Kelola/Hapus Dokumen";
    manageBtn.addEventListener("click", () => openManageDocsModal());

    bar.appendChild(genBtn);
    bar.appendChild(manageBtn);
    pageRoot.insertBefore(bar, pageRoot.firstChild);
  }

  const observer = new MutationObserver(() => injectTopBar());
  observer.observe(document.body, { childList: true, subtree: true });
  injectTopBar();
})();