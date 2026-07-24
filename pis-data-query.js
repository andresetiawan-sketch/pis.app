/**
 * PIS — Menu "Data Query" (disematkan sebagai TAB tambahan di dalam
 * halaman "Kontrak & Invoice", tepat setelah tab "Ringkasan Keuangan").
 *
 * Kenapa lapisan terpisah (bukan komponen React baru di dalam bundle)?
 * Sama seperti pis-pkwt-generator.js / pis-recruitment-form.js / dst:
 * source .jsx asli (folder src/) TIDAK tersedia di paket ini — yang ada
 * hanya hasil build yang sudah diminify (public/assets/index-*.js).
 * Menambah tab baru + halaman baru langsung di dalam bundle yang sudah
 * diminify sangat berisiko merusak seluruh aplikasi. Jadi tab ini
 * disuntikkan ke halaman Kontrak & Invoice yang sudah dirender React
 * (di-clone dari tab "Ringkasan Keuangan" supaya visualnya identik —
 * font, warna, padding), dan saat diklik membuka panel penuh di atas
 * halaman — tanpa mengubah bundle React sama sekali.
 *
 * (Sebelumnya sempat juga disuntik sebagai item sidebar terpisah di
 * bawah "Kontrak & Invoice" — ini sudah dihapus atas permintaan, cukup
 * satu titik akses lewat tab di dalam halaman Kontrak & Invoice.)
 *
 * Skema kolom input & tabel PERSIS mengikuti file "query_all_area.xlsx"
 * (55 kolom termasuk PERIODE, lihat DATA_QUERY_COLUMNS di worker.js).
 *
 * Integrasi dengan Data Karyawan:
 *  - Kolom "EMPLOYEE NO" = NIK Karyawan (nik_karyawan). Begitu diisi &
 *    kolom itu kehilangan fokus, sistem otomatis mencari karyawan yang
 *    bersangkutan (via /api/apps/functions/getEmployeeByNik) dan
 *    melengkapi NAME/POSITION/ENTITY/BRANCH/dst yang masih kosong.
 *  - Hal yang sama juga ditegakkan di server (worker.js) saat data
 *    disimpan, supaya konsisten walau data dikirim lewat impor Excel.
 *
 * Endpoint backend:
 *  - CRUD  : /api/apps/entities/DataQuery  (mengikuti pola entity lain)
 *  - Lookup: POST /api/apps/functions/getEmployeeByNik { nik }
 *  - Excel : GET  /api/data-query/template
 *            POST /api/data-query/import   { file_url }
 *            GET  /api/data-query/export
 */
(function () {
  "use strict";

  const ALLOWED_ROLES = ["Master Admin", "Admin"];

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
    const role = (emp && emp.role) || "";
    return ALLOWED_ROLES.includes(role);
  }

  async function apiList() {
    const token = getToken();
    const res = await fetch("/api/apps/entities/DataQuery?limit=100000&sort=-created_date", {
      headers: token ? { "X-Employee-Token": token } : {},
    });
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : [];
  }
  async function apiCreate(body) {
    const token = getToken();
    const res = await fetch("/api/apps/entities/DataQuery", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { "X-Employee-Token": token } : {}) },
      body: JSON.stringify(body),
    });
    return res.json().catch(() => null);
  }
  async function apiUpdate(id, body) {
    const token = getToken();
    const res = await fetch(`/api/apps/entities/DataQuery/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(token ? { "X-Employee-Token": token } : {}) },
      body: JSON.stringify(body),
    });
    return res.json().catch(() => null);
  }
  async function apiDelete(id) {
    const token = getToken();
    const res = await fetch(`/api/apps/entities/DataQuery/${id}`, {
      method: "DELETE",
      headers: token ? { "X-Employee-Token": token } : {},
    });
    return res.json().catch(() => null);
  }
  async function apiLookupEmployee(nik) {
    const token = getToken();
    const res = await fetch("/api/apps/functions/getEmployeeByNik", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { "X-Employee-Token": token } : {}) },
      body: JSON.stringify({ nik }),
    });
    return res.json().catch(() => null);
  }
  async function apiCallFunction(name, body) {
    const token = getToken();
    const res = await fetch(`/api/apps/functions/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { "X-Employee-Token": token } : {}) },
      body: JSON.stringify(body || {}),
    });
    return res.json().catch(() => null);
  }
  async function downloadWithAuth(url, filename) {
    const token = getToken();
    const res = await fetch(url, { headers: token ? { "X-Employee-Token": token } : {} });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Gagal mengunduh (${res.status})`);
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ============================================================
  // Skema 54 kolom (harus sinkron dengan DATA_QUERY_COLUMNS di worker.js)
  // ============================================================
  const FIELD_GROUPS = [
    {
      title: "Identitas & Penempatan",
      fields: [
        ["employee_no", "EMPLOYEE NO (NIK Karyawan)", "text"],
        ["name", "NAME", "text"],
        ["position", "POSITION", "text"],
        ["cost_center", "COST CENTER (Area Tugas / Proyek)", "text"],
        ["entity", "ENTITY", "text"],
        ["branch", "BRANCH", "text"],
        ["paytype", "PAYTYPE", "text"],
      ],
    },
    {
      title: "Bank",
      fields: [
        ["bank_name", "BANK NAME", "text"],
        ["bank_account", "BANK ACCOUNT", "text"],
        ["bank_transfer", "BANK TRANSFER", "number"],
      ],
    },
    {
      title: "Tanggal & Status",
      fields: [
        ["periode", "PERIODE / BULAN LAPORAN", "month"],
        ["join_date", "JOIN DATE", "date"],
        ["mutasi_date", "MUTASI DATE", "date"],
        ["terminate_date", "TERMINATE DATE", "date"],
        ["mutasi_noted", "MUTASI NOTED", "text"],
        ["move", "MOVE", "text"],
      ],
    },
    {
      title: "Gaji Pokok & Tunjangan",
      fields: [
        ["basic_salary", "BASIC SALARY", "number"],
        ["adjustment_salary", "ADJUSMENT SALARY", "number"],
        ["allowance_kehadiran", "ALLOWANCE KEHADIRAN", "number"],
        ["adjustment_new_employee", "ADJUSTMENT NEW EMPLOYEE", "number"],
        ["allowance_jabatan", "ALLOWANCE JABATAN", "number"],
        ["allowance_transport", "ALLOWANCE TRANSPORT", "number"],
        ["allowance_acting", "ALLOWANCE ACTING", "number"],
        ["allowance_pulsa", "ALLOWANCE PULSA", "number"],
        ["long_shift", "LONG SHIFT", "number"],
        ["premi_in", "PREMI IN", "number"],
        ["ins_produktifitas", "INS. PRODUKTIFITAS", "number"],
        ["total_allowance", "TOTAL ALLOWANCE", "number"],
      ],
    },
    {
      title: "Iuran BPJS & Pensiun — Perusahaan",
      fields: [
        ["jht_perusahaan", "JHT 3.7% (Perusahaan)", "number"],
        ["jkk_perusahaan", "JKK 0.24% (Perusahaan)", "number"],
        ["jkm_perusahaan", "JKM 0.3% (Perusahaan)", "number"],
        ["bpjs_kes_perusahaan", "BPJS KES 4% (Perusahaan)", "number"],
        ["tunjangan_pensiun_perusahaan", "TUNJANGAN PENSIUN 2% (Perusahaan)", "number"],
      ],
    },
    {
      title: "Potongan / Deduction — Karyawan & Pajak",
      fields: [
        ["ketidakhadiran", "KETIDAKHADIRAN", "number"],
        ["pembayaran_lain_1", "PEMBAYARAN LAIN-LAIN", "number"],
        ["pembayaran_lain_2", "PEMBAYARAN LAIN-LAIN 2", "number"],
        ["pembayaran_lain_3", "PEMBAYARAN LAIN-LAIN 3", "number"],
        ["pembayaran_lain_fix_bpjs_mandiri", "PEMBAYARAN LAIN-LAIN FIX BPJS MANDIRI", "number"],
        ["jht_karyawan", "JHT 3.7% (Karyawan)", "number"],
        ["jht_employee_2", "JHT EMPLOYEE 2%", "number"],
        ["jkk_karyawan", "JKK 0.24% (Karyawan)", "number"],
        ["jkm_karyawan", "JKM 0.3% (Karyawan)", "number"],
        ["bpjs_kes_karyawan", "BPJS KES 5% (Karyawan)", "number"],
        ["iuran_pensiun", "IURAN PENSIUN", "number"],
        ["iuran_pensiun_karyawan", "IURAN PENSIUN KARYAWAN", "number"],
        ["premi_out", "PREMI OUT", "number"],
        ["tax", "TAX", "number"],
        ["total_deduction", "TOTAL DEDUCTION", "number"],
      ],
    },
    {
      title: "Ringkasan Gaji",
      fields: [
        ["net_salary", "NET SALARY", "number"],
        ["full_salary", "FULL SALARY", "number"],
        ["account_check", "ACCOUNT CHECK", "text"],
        ["full_salary_check", "FULL SALARY CHECK", "text"],
        ["basic_kehadiran", "BASIC + KEHADIRAN", "number"],
        ["cek", "CEK", "text"],
      ],
    },
  ];
  const ALL_FIELDS = FIELD_GROUPS.flatMap((g) => g.fields);
  const EMPLOYEE_AUTOFILL_KEYS = ["name", "position", "entity", "branch", "cost_center", "join_date", "bank_name", "bank_account"];

  // ============================================================
  // Styles
  // ============================================================
  const style = document.createElement("style");
  style.textContent = `
    .pisdq-nav-item { cursor: pointer; }
    .pisdq-overlay {
      position: fixed; inset: 0; background: #f3f4f6; z-index: 9950;
      display: none; flex-direction: column;
      font: 400 13.5px system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #1f2937;
    }
    .pisdq-overlay.show { display: flex; }
    .pisdq-header {
      background: #fff; border-bottom: 1px solid #e5e7eb; padding: 14px 20px;
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    }
    .pisdq-header h1 { font-size: 17px; font-weight: 800; color: #7B1A2C; margin: 0; }
    .pisdq-header .pisdq-sub { font-size: 12px; color: #6b7280; margin: 2px 0 0; }
    .pisdq-header-title { margin-right: auto; }
    .pisdq-btn {
      font: 700 12.5px system-ui, sans-serif; border-radius: 9px; padding: 9px 14px;
      cursor: pointer; border: 1px solid transparent; white-space: nowrap;
    }
    .pisdq-btn-primary { background: linear-gradient(135deg, #7B1A2C, #a12238); color: #fff; box-shadow: 0 3px 10px rgba(123,26,44,.25); }
    .pisdq-btn-primary:hover { filter: brightness(1.08); }
    .pisdq-btn-outline { background: #fff; color: #374151; border-color: #d1d5db; }
    .pisdq-btn-outline:hover { background: #f9fafb; }
    .pisdq-btn-close { background: #fff; color: #b91c1c; border-color: #fecaca; }
    .pisdq-btn-close:hover { background: #fef2f2; }
    .pisdq-toolbar { padding: 12px 20px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; background: #fff; border-bottom: 1px solid #f0f0f0; }
    .pisdq-toolbar-selection { justify-content: space-between; background: #faf7f7; }
    .pisdq-search { flex: 1; min-width: 200px; max-width: 340px; padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 9px; font-size: 13px; }
    .pisdq-filter { padding: 9px 10px; border: 1px solid #d1d5db; border-radius: 9px; font-size: 12.5px; font-family: inherit; background: #fff; color: #374151; }
    .pisdq-count { font-size: 12px; color: #6b7280; }
    .pisdq-pagination { display: flex; align-items: center; gap: 14px; }
    .pisdq-page-btn { font: 700 12.5px system-ui, sans-serif; border-radius: 9px; padding: 8px 16px; cursor: pointer; border: 1px solid #d1d5db; background: #fff; color: #374151; }
    .pisdq-page-btn:hover:not(:disabled) { background: #fff; border-color: #7B1A2C; color: #7B1A2C; }
    .pisdq-page-btn:disabled { opacity: .4; cursor: not-allowed; }
    .pisdq-page-info { font-size: 12.5px; color: #6b7280; font-weight: 600; min-width: 160px; text-align: center; }
    .pisdq-btn-danger { background: #fff; color: #b91c1c; border: 1px solid #fecaca; }
    .pisdq-btn-danger:hover:not(:disabled) { background: #fef2f2; }
    .pisdq-btn-danger:disabled { opacity: .45; cursor: not-allowed; }
    th.pisdq-check-col, td.pisdq-check-col { width: 34px; text-align: center; white-space: nowrap; }
    .pisdq-row-check, .pisdq-check-all { width: 15px; height: 15px; cursor: pointer; accent-color: #7B1A2C; }
    table.pisdq-table tr.pisdq-row-selected { background: #fdeceb; }
    .pisdq-body { flex: 1; overflow: auto; padding: 16px 20px; }
    .pisdq-table-wrap { background: #fff; border-radius: 12px; border: 1px solid #eee; overflow: auto; max-height: 100%; }
    table.pisdq-table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
    table.pisdq-table th, table.pisdq-table td { padding: 9px 12px; border-bottom: 1px solid #f0f0f0; text-align: left; white-space: nowrap; }
    table.pisdq-table th { background: #faf7f7; color: #7B1A2C; font-weight: 700; position: sticky; top: 0; z-index: 1; }
    table.pisdq-table tbody tr:hover { background: #fdf6f7; }
    .pisdq-action-btn { border: none; background: none; cursor: pointer; font-size: 13px; padding: 4px 6px; border-radius: 6px; }
    .pisdq-action-btn.edit { color: #2563eb; }
    .pisdq-action-btn.del { color: #b91c1c; }
    .pisdq-action-btn:hover { background: #f3f4f6; }
    .pisdq-empty { padding: 40px; text-align: center; color: #9ca3af; font-size: 13px; }

    .pisdq-modal-overlay { position: fixed; inset: 0; background: rgba(17,17,20,.5); z-index: 9960; display: none; align-items: flex-start; justify-content: center; padding: 24px 16px; overflow-y: auto; }
    .pisdq-modal-overlay.show { display: flex; }
    .pisdq-modal { background: #fff; border-radius: 16px; width: 100%; max-width: 760px; padding: 22px 24px 24px; box-shadow: 0 20px 50px rgba(0,0,0,.25); }
    .pisdq-modal h2 { font-size: 16px; font-weight: 800; color: #7B1A2C; margin: 0 0 4px; }
    .pisdq-modal .pisdq-modal-sub { color: #6b7280; font-size: 12px; margin-bottom: 14px; }
    .pisdq-group { margin-bottom: 14px; border: 1px solid #f0f0f0; border-radius: 10px; padding: 12px 14px; }
    .pisdq-group h3 { font-size: 12.5px; font-weight: 700; color: #a12238; margin: 0 0 10px; text-transform: uppercase; letter-spacing: .02em; }
    .pisdq-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
    .pisdq-field label { display: block; font-weight: 600; font-size: 11.5px; margin-bottom: 4px; color: #374151; }
    .pisdq-field input { width: 100%; box-sizing: border-box; padding: 7px 9px; border: 1px solid #d1d5db; border-radius: 7px; font-size: 12.5px; font-family: inherit; }
    .pisdq-field input:focus { outline: none; border-color: #7B1A2C; box-shadow: 0 0 0 2px rgba(123,26,44,.12); }
    .pisdq-hint { font-size: 11px; margin-top: 4px; }
    .pisdq-hint.ok { color: #15803d; }
    .pisdq-hint.warn { color: #b45309; }
    .pisdq-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; position: sticky; bottom: 0; background: #fff; padding-top: 10px; }

    .pisdq-toast { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 99999; padding: 12px 18px; border-radius: 10px; font-size: 13px; font-family: system-ui, sans-serif; box-shadow: 0 6px 20px rgba(0,0,0,.18); max-width: 90vw; text-align: center; }
    .pisdq-toast.ok { background: #1a7b2c; color: #fff; }
    .pisdq-toast.fail { background: #7b1a1a; color: #fff; }
  `;
  document.head.appendChild(style);

  function toast(message, kind) {
    const el = document.createElement("div");
    el.className = "pisdq-toast " + (kind || "ok");
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }
  function fmtNum(v) {
    if (v === "" || v === null || v === undefined) return "";
    const n = Number(v);
    return isNaN(n) ? String(v) : n.toLocaleString("id-ID");
  }

  // ============================================================
  // Overlay halaman utama
  // ============================================================
  let rows = [];
  let filteredRows = [];
  let currentPage = 1;
  const PAGE_SIZE = 50;
  const overlay = document.createElement("div");
  overlay.className = "pisdq-overlay";
  overlay.innerHTML = `
    <div class="pisdq-header">
      <div class="pisdq-header-title">
        <h1>📊 Data Query</h1>
        <p class="pisdq-sub">Data payroll/laporan bulanan per karyawan — skema query_all_area.xlsx, terhubung dengan Data Karyawan via EMPLOYEE NO.</p>
      </div>
      <button class="pisdq-btn pisdq-btn-outline" data-act="template">⬇️ Unduh Template</button>
      <button class="pisdq-btn pisdq-btn-outline" data-act="import">📥 Impor Excel</button>
      <button class="pisdq-btn pisdq-btn-outline" data-act="export">📤 Ekspor Excel</button>
      <button class="pisdq-btn pisdq-btn-outline" data-act="sync">🔄 Sinkron Data Karyawan</button>
      <button class="pisdq-btn pisdq-btn-primary" data-act="add">+ Tambah Data</button>
      <button class="pisdq-btn pisdq-btn-close" data-act="close">✕ Tutup</button>
    </div>
    <div class="pisdq-toolbar">
      <input type="text" class="pisdq-search" placeholder="Cari EMPLOYEE NO / NAME / BRANCH / POSITION…" />
      <select class="pisdq-filter" data-filter="cost_center"><option value="">Semua Area Tugas (Cost Center)</option></select>
      <input type="month" class="pisdq-filter" data-filter="periode" title="Filter bulan laporan" />
      <button class="pisdq-btn pisdq-btn-outline" data-act="reset-filter">Reset Filter</button>
      <span class="pisdq-count"></span>
    </div>
    <div class="pisdq-toolbar pisdq-toolbar-selection">
      <div class="pisdq-pagination">
        <button class="pisdq-page-btn" data-act="prev-page" title="Baris sebelumnya">‹ Sebelumnya</button>
        <span class="pisdq-page-info"></span>
        <button class="pisdq-page-btn" data-act="next-page" title="Baris selanjutnya">Selanjutnya ›</button>
      </div>
      <button class="pisdq-btn pisdq-btn-danger" data-act="delete-selected" disabled>🗑️ Hapus Terpilih (<span class="pisdq-selected-count">0</span>)</button>
    </div>
    <div class="pisdq-body">
      <div class="pisdq-table-wrap">
        <table class="pisdq-table">
          <thead>
            <tr>
              <th class="pisdq-check-col"><input type="checkbox" class="pisdq-check-all" title="Tandai semua baris di halaman ini" /></th>
              <th>EMPLOYEE NO</th><th>NAME</th><th>POSITION</th><th>AREA TUGAS (COST CENTER)</th><th>BRANCH</th>
              <th>ENTITY</th><th>PERIODE</th><th>JOIN DATE</th><th>BASIC SALARY</th><th>NET SALARY</th><th>Aksi</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const tbody = overlay.querySelector("tbody");
  const searchInput = overlay.querySelector(".pisdq-search");
  const areaFilter = overlay.querySelector('[data-filter="cost_center"]');
  const periodeFilter = overlay.querySelector('[data-filter="periode"]');
  const countEl = overlay.querySelector(".pisdq-count");
  const pageInfoEl = overlay.querySelector(".pisdq-page-info");
  const prevPageBtn = overlay.querySelector('[data-act="prev-page"]');
  const nextPageBtn = overlay.querySelector('[data-act="next-page"]');
  const checkAllEl = overlay.querySelector(".pisdq-check-all");
  const deleteSelectedBtn = overlay.querySelector('[data-act="delete-selected"]');
  const selectedCountEl = overlay.querySelector(".pisdq-selected-count");
  const selectedIds = new Set();
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".xlsx,.xls";
  fileInput.style.display = "none";
  document.body.appendChild(fileInput);
  let pendingImportPeriode = "";

  function renderRows() {
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRows = filteredRows.slice(start, start + PAGE_SIZE);

    if (!pageRows.length) {
      tbody.innerHTML = `<tr><td colspan="12"><div class="pisdq-empty">${
        rows.length ? "Tidak ada data yang cocok dengan filter/pencarian." : 'Belum ada data. Klik "+ Tambah Data" atau "Impor Excel" untuk mulai mengisi.'
      }</div></td></tr>`;
    } else {
      tbody.innerHTML = pageRows
        .map(
          (r) => `
        <tr data-id="${r.id}" class="${selectedIds.has(r.id) ? "pisdq-row-selected" : ""}">
          <td class="pisdq-check-col"><input type="checkbox" class="pisdq-row-check" data-id="${r.id}" ${selectedIds.has(r.id) ? "checked" : ""} /></td>
          <td>${escapeHtml(r.employee_no || "-")}</td>
          <td>${escapeHtml(r.name || "-")}</td>
          <td>${escapeHtml(r.position || "-")}</td>
          <td>${escapeHtml(r.cost_center || "-")}</td>
          <td>${escapeHtml(r.branch || "-")}</td>
          <td>${escapeHtml(r.entity || "-")}</td>
          <td>${escapeHtml(r.periode || "-")}</td>
          <td>${escapeHtml(r.join_date || "-")}</td>
          <td>${fmtNum(r.basic_salary)}</td>
          <td>${fmtNum(r.net_salary)}</td>
          <td>
            <button class="pisdq-action-btn edit" data-id="${r.id}" title="Edit">✏️</button>
            <button class="pisdq-action-btn del" data-id="${r.id}" title="Hapus">🗑️</button>
          </td>
        </tr>`
        )
        .join("");
    }
    countEl.textContent = `${filteredRows.length} data (dari ${rows.length} total)`;
    pageInfoEl.textContent = filteredRows.length ? `Halaman ${currentPage} dari ${totalPages} — baris ${start + 1}–${Math.min(start + PAGE_SIZE, filteredRows.length)}` : "";
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
    checkAllEl.checked = pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id));
    updateSelectionUI();
  }
  function updateSelectionUI() {
    selectedCountEl.textContent = selectedIds.size;
    deleteSelectedBtn.disabled = selectedIds.size === 0;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function populateAreaFilterOptions() {
    const areas = Array.from(new Set(rows.map((r) => (r.cost_center || "").trim()).filter(Boolean))).sort();
    const current = areaFilter.value;
    areaFilter.innerHTML = '<option value="">Semua Area Tugas (Cost Center)</option>' + areas.map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join("");
    if (areas.includes(current)) areaFilter.value = current;
  }

  async function refresh() {
    tbody.innerHTML = `<tr><td colspan="12"><div class="pisdq-empty">Memuat data…</div></td></tr>`;
    rows = await apiList();
    selectedIds.clear();
    populateAreaFilterOptions();
    applyFilter();
  }
  function applyFilter(resetPage) {
    const q = searchInput.value.trim().toLowerCase();
    const areaVal = areaFilter.value;
    const periodeVal = periodeFilter.value;
    filteredRows = rows.filter((r) => {
      if (areaVal && String(r.cost_center || "") !== areaVal) return false;
      if (periodeVal && String(r.periode || "") !== periodeVal) return false;
      if (!q) return true;
      return [r.employee_no, r.name, r.branch, r.position, r.entity, r.cost_center].some((v) => String(v || "").toLowerCase().includes(q));
    });
    if (resetPage !== false) currentPage = 1;
    renderRows();
  }
  searchInput.addEventListener("input", () => applyFilter());
  areaFilter.addEventListener("change", () => applyFilter());
  periodeFilter.addEventListener("change", () => applyFilter());
  prevPageBtn.addEventListener("click", () => { currentPage--; renderRows(); });
  nextPageBtn.addEventListener("click", () => { currentPage++; renderRows(); });

  tbody.addEventListener("change", (e) => {
    const cb = e.target.closest(".pisdq-row-check");
    if (!cb) return;
    if (cb.checked) selectedIds.add(cb.dataset.id);
    else selectedIds.delete(cb.dataset.id);
    cb.closest("tr").classList.toggle("pisdq-row-selected", cb.checked);
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRows = filteredRows.slice(start, start + PAGE_SIZE);
    checkAllEl.checked = pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id));
    updateSelectionUI();
  });
  checkAllEl.addEventListener("change", () => {
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRows = filteredRows.slice(start, start + PAGE_SIZE);
    pageRows.forEach((r) => {
      if (checkAllEl.checked) selectedIds.add(r.id);
      else selectedIds.delete(r.id);
    });
    renderRows();
  });

  overlay.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (btn) {
      const act = btn.dataset.act;
      if (act === "close") closeOverlay();
      else if (act === "add") openForm(null);
      else if (act === "reset-filter") {
        searchInput.value = "";
        areaFilter.value = "";
        periodeFilter.value = "";
        applyFilter();
      }
      else if (act === "delete-selected") {
        if (!selectedIds.size) return;
        if (!confirm(`Hapus ${selectedIds.size} data yang ditandai? Tindakan tidak dapat dibatalkan.`)) return;
        btn.disabled = true;
        const ids = Array.from(selectedIds);
        let ok = 0, fail = 0;
        for (const id of ids) {
          const res = await apiDelete(id);
          if (res && res.success !== false) { ok++; selectedIds.delete(id); }
          else fail++;
        }
        toast(fail ? `${ok} data dihapus, ${fail} gagal dihapus.` : `${ok} data dihapus.`, fail ? "fail" : "ok");
        refresh();
      }
      else if (act === "template") {
        try { await downloadWithAuth("/api/data-query/template", "template_data_query.xlsx"); }
        catch (err) { toast(err.message, "fail"); }
      } else if (act === "export") {
        try { await downloadWithAuth("/api/data-query/export", "data_query_export.xlsx"); }
        catch (err) { toast(err.message, "fail"); }
      } else if (act === "sync") {
        btn.disabled = true;
        const originalLabel = btn.textContent;
        btn.textContent = "Menyinkronkan…";
        const res = await apiCallFunction("syncDataQueryWithEmployees");
        btn.disabled = false;
        btn.textContent = originalLabel;
        if (res && res.success) {
          toast(`Sinkron selesai: ${res.data.updated} dari ${res.data.total} data diperbarui.`, "ok");
          refresh();
        } else {
          toast((res && res.error) || "Gagal menyinkronkan data.", "fail");
        }
      } else if (act === "import") {
        const now = new Date();
        const defaultPeriode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const periodeInput = prompt(
          "Periode/Bulan default (format YYYY-MM) untuk baris yang kolom PERIODE-nya kosong di file Excel. Kosongkan jika tidak perlu:",
          defaultPeriode
        );
        if (periodeInput === null) return; // dibatalkan
        pendingImportPeriode = periodeInput.trim();
        fileInput.value = "";
        fileInput.click();
      }
      return;
    }
    const editBtn = e.target.closest(".pisdq-action-btn.edit");
    if (editBtn) {
      const rec = rows.find((r) => r.id === editBtn.dataset.id);
      if (rec) openForm(rec);
      return;
    }
    const delBtn = e.target.closest(".pisdq-action-btn.del");
    if (delBtn) {
      if (!confirm("Hapus data ini? Tindakan tidak dapat dibatalkan.")) return;
      const res = await apiDelete(delBtn.dataset.id);
      if (res && res.success !== false) {
        toast("Data dihapus.", "ok");
        refresh();
      } else {
        toast((res && res.error) || "Gagal menghapus data.", "fail");
      }
    }
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    toast("Mengunggah & memproses file…", "ok");
    try {
      const token = getToken();
      const fd = new FormData();
      fd.append("file", file);
      const upRes = await fetch("/api/uploads", { method: "POST", headers: token ? { "X-Employee-Token": token } : {}, body: fd });
      const upData = await upRes.json();
      if (!upData.file_url) throw new Error("Gagal mengunggah file.");
      const impRes = await fetch("/api/data-query/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "X-Employee-Token": token } : {}) },
        body: JSON.stringify({ file_url: upData.file_url, periode: pendingImportPeriode || undefined }),
      });
      const impData = await impRes.json();
      if (!impRes.ok || impData.success === false) throw new Error(impData.error || "Gagal mengimpor file.");
      const failedNote = impData.failed && impData.failed.length ? ` (${impData.failed.length} baris gagal)` : "";
      toast(`Impor selesai: ${impData.success_count} data berhasil disimpan${failedNote}.`, impData.failed && impData.failed.length ? "fail" : "ok");
      refresh();
    } catch (err) {
      toast(err.message, "fail");
    }
  });

  function openOverlay() {
    overlay.classList.add("show");
    refresh();
  }
  function closeOverlay() {
    overlay.classList.remove("show");
  }

  // ============================================================
  // Modal form tambah/edit
  // ============================================================
  const modalOverlay = document.createElement("div");
  modalOverlay.className = "pisdq-modal-overlay";
  document.body.appendChild(modalOverlay);

  function fieldInput(key, label, type, value) {
    const val = value === undefined || value === null ? "" : value;
    const inputType = type === "number" ? "number" : type === "date" ? "date" : type === "month" ? "month" : "text";
    return `
      <div class="pisdq-field">
        <label>${escapeHtml(label)}</label>
        <input type="${inputType}" data-key="${key}" value="${escapeHtml(val)}" ${type === "number" ? 'step="any"' : ""} />
        ${key === "employee_no" ? '<div class="pisdq-hint" data-hint="employee_no"></div>' : ""}
      </div>`;
  }

  function openForm(record) {
    const isEdit = !!record;
    modalOverlay.innerHTML = `
      <div class="pisdq-modal">
        <h2>${isEdit ? "Edit Data Query" : "Tambah Data Query"}</h2>
        <p class="pisdq-modal-sub">Isi EMPLOYEE NO (NIK Karyawan) terlebih dahulu — data karyawan (nama, jabatan, branch, dst) akan otomatis dilengkapi.</p>
        <form data-form="pisdq">
          ${FIELD_GROUPS.map(
            (g) => `
            <div class="pisdq-group">
              <h3>${escapeHtml(g.title)}</h3>
              <div class="pisdq-grid">
                ${g.fields.map(([key, label, type]) => fieldInput(key, label, type, record ? record[key] : "")).join("")}
              </div>
            </div>`
          ).join("")}
          <div class="pisdq-modal-actions">
            <button type="button" class="pisdq-btn pisdq-btn-outline" data-act="cancel">Batal</button>
            <button type="submit" class="pisdq-btn pisdq-btn-primary">${isEdit ? "Simpan Perubahan" : "Simpan"}</button>
          </div>
        </form>
      </div>
    `;
    modalOverlay.classList.add("show");

    const form = modalOverlay.querySelector('[data-form="pisdq"]');
    const empInput = form.querySelector('input[data-key="employee_no"]');
    const hintEl = form.querySelector('[data-hint="employee_no"]');

    async function runLookup() {
      const nik = empInput.value.trim();
      if (!nik) { hintEl.textContent = ""; return; }
      hintEl.className = "pisdq-hint";
      hintEl.textContent = "Mencari data karyawan…";
      const res = await apiLookupEmployee(nik);
      const emp = res && res.data && res.data.employee;
      if (emp) {
        hintEl.className = "pisdq-hint ok";
        hintEl.textContent = `✓ Ditemukan: ${emp.nama_lengkap || "-"} (${emp.jabatan || "-"})`;
        const map = { name: emp.nama_lengkap, position: emp.jabatan, entity: emp.entity_pt, branch: emp.branch, cost_center: emp.area_tugas, join_date: emp.tanggal_join || emp.join_date, bank_name: emp.bank_karyawan, bank_account: emp.no_rekening };
        EMPLOYEE_AUTOFILL_KEYS.forEach((key) => {
          const inp = form.querySelector(`input[data-key="${key}"]`);
          if (inp && !inp.value && map[key]) inp.value = map[key];
        });
      } else {
        hintEl.className = "pisdq-hint warn";
        hintEl.textContent = "⚠ NIK tidak ditemukan di Data Karyawan. Data akan tetap tersimpan, lengkapi kolom lain secara manual.";
      }
    }
    empInput.addEventListener("blur", runLookup);
    if (isEdit && empInput.value) runLookup();

    modalOverlay.querySelector('[data-act="cancel"]').addEventListener("click", closeForm);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = {};
      ALL_FIELDS.forEach(([key, , type]) => {
        const inp = form.querySelector(`input[data-key="${key}"]`);
        let v = inp ? inp.value : "";
        if (type === "number" && v !== "") v = Number(v);
        body[key] = v;
      });
      if (!body.employee_no) { toast("EMPLOYEE NO wajib diisi.", "fail"); return; }
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = "Menyimpan…";
      const res = isEdit ? await apiUpdate(record.id, body) : await apiCreate(body);
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? "Simpan Perubahan" : "Simpan";
      if (res && res.id) {
        toast(isEdit ? "Perubahan disimpan." : "Data baru ditambahkan.", "ok");
        closeForm();
        refresh();
      } else {
        toast((res && res.error) || "Gagal menyimpan data.", "fail");
      }
    });
  }
  function closeForm() {
    modalOverlay.classList.remove("show");
    modalOverlay.innerHTML = "";
  }
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeForm();
  });

  // ============================================================
  // Sematkan "Data Query" sebagai tab tambahan DI DALAM halaman
  // "Kontrak & Invoice", persis setelah tab "Ringkasan Keuangan", dengan
  // visual yang sama persis (di-clone dari tab aslinya). Tidak lagi
  // disuntik sebagai item sidebar terpisah — cukup satu titik akses ini.
  // ============================================================
  function findRingkasanKeuanganTab() {
    const candidates = Array.from(document.querySelectorAll("button, div, span, a"));
    return (
      candidates.find(
        (el) => el.children.length === 0 && (el.textContent || "").trim() === "Ringkasan Keuangan"
      ) || null
    );
  }

  function injectDataQueryTab() {
    if (!canUseFeature()) return;
    const ringkasanTab = findRingkasanKeuanganTab();
    if (!ringkasanTab) return;
    const parent = ringkasanTab.parentElement;
    if (!parent) return;
    if (parent.querySelector('[data-pisdq-tab="1"]')) return; // sudah disuntik

    const clone = ringkasanTab.cloneNode(true);
    clone.setAttribute("data-pisdq-tab", "1");
    clone.classList.add("pisdq-nav-item");
    clone.textContent = "📊 Data Query";
    clone.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openOverlay();
    });

    ringkasanTab.insertAdjacentElement("afterend", clone);
  }

  // Halaman Kontrak & Invoice bisa re-render kapan saja (navigasi, refresh
  // token, ganti tab, dst), jadi tab kita bisa ikut terhapus — cek ulang
  // secara berkala.
  function injectAll() {
    injectDataQueryTab();
  }
  injectAll();
  setInterval(injectAll, 1200);
  const mo = new MutationObserver(() => injectAll());
  mo.observe(document.body, { childList: true, subtree: true });

  // ESC untuk menutup panel/modal
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (modalOverlay.classList.contains("show")) closeForm();
    else if (overlay.classList.contains("show")) closeOverlay();
  });
})();
