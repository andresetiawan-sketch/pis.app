/**
 * PIS — Menu "Kontrak Kerja Area/Project" (disematkan sebagai TAB tambahan
 * di dalam halaman "Kontrak & Invoice", tepat setelah tab "📊 Data Query" —
 * lihat pis-data-query.js. Kalau tab Data Query belum sempat terpasang,
 * jatuh ke setelah tab "Ringkasan Keuangan" langsung).
 *
 * Kenapa lapisan terpisah (bukan komponen React baru di dalam bundle)?
 * Sama seperti pis-data-query.js / pis-pkwt-generator.js: source .jsx asli
 * tidak tersedia di paket ini — jadi tab ini disuntikkan ke halaman yang
 * sudah dirender React (di-clone dari tab yang sudah ada supaya visualnya
 * identik), dan saat diklik membuka panel penuh di atas halaman.
 *
 * Fungsi:
 *  - CRUD entity "AreaContract": kontrak kerja per Area/Project, berisi
 *    daftar item_pekerjaan yang bisa bertipe "Jabatan" (posisi yang
 *    dikontrakkan) dan/atau "Barang" (barang/alat yang disewakan ke
 *    klien) — boleh campuran keduanya dalam satu kontrak.
 *  - Item bertipe "Jabatan": Gaji Pokok, Tunjangan Jabatan, Tunjangan
 *    Lain-lain TIDAK diinput manual — otomatis dibaca dari menu "Data
 *    Query" (grup ALLOWANCE, kombinasi Area = COST CENTER + Jabatan =
 *    POSITION) lewat fungsi backend previewSalaryFromDataQuery, dan
 *    dihitung ulang otomatis oleh server tiap kali kontrak disimpan
 *    selama masih berstatus "Draft".
 *  - Item bertipe "Barang": harga_satuan & jumlah diisi manual (harga
 *    sewa barang/alat, bukan komponen gaji).
 *  - Status Finishing: "Draft" (masih bisa diedit bebas, gaji Jabatan
 *    selalu ikut update mengikuti Data Query terbaru) → "Final" (harga
 *    terkunci, hanya Master Admin yang bisa mengubah lagi — ditegakkan
 *    di server, panel ini hanya mencerminkan kuncinya di sisi tampilan).
 *
 * Endpoint backend:
 *  - CRUD  : /api/apps/entities/AreaContract
 *  - Preview gaji: POST /api/apps/functions/previewSalaryFromDataQuery { area_tugas, jabatan }
 *  - Daftar Area: GET  /api/apps/entities/AreaProject
 */
(function () {
  "use strict";

  const ALLOWED_ROLES = ["Master Admin", "Admin"];
  const MASTER_ADMIN_ROLES = ["Master Admin", "master_admin"];
  const ITEM_TIPE_OPTIONS = ["Jabatan", "Barang"];

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
  function isMasterAdminUI() {
    const emp = getEmployee();
    const role = (emp && emp.role) || "";
    return MASTER_ADMIN_ROLES.includes(role);
  }

  async function apiList(path) {
    const token = getToken();
    const res = await fetch(path, { headers: token ? { "X-Employee-Token": token } : {} });
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : (data && data.data) || [];
  }
  async function apiCreate(body) {
    const token = getToken();
    const res = await fetch("/api/apps/entities/AreaContract", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { "X-Employee-Token": token } : {}) },
      body: JSON.stringify(body),
    });
    return res.json().catch(() => null);
  }
  async function apiUpdate(id, body) {
    const token = getToken();
    const res = await fetch(`/api/apps/entities/AreaContract/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(token ? { "X-Employee-Token": token } : {}) },
      body: JSON.stringify(body),
    });
    return res.json().catch(() => null);
  }
  async function apiDelete(id) {
    const token = getToken();
    const res = await fetch(`/api/apps/entities/AreaContract/${id}`, {
      method: "DELETE",
      headers: token ? { "X-Employee-Token": token } : {},
    });
    return res.json().catch(() => null);
  }
  async function apiPreviewSalary(area_tugas, jabatan) {
    const token = getToken();
    const res = await fetch("/api/apps/functions/previewSalaryFromDataQuery", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { "X-Employee-Token": token } : {}) },
      body: JSON.stringify({ area_tugas, jabatan }),
    });
    return res.json().catch(() => null);
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fmtNum(v) {
    if (v === "" || v === null || v === undefined) return "";
    const n = Number(v);
    return isNaN(n) ? String(v) : n.toLocaleString("id-ID");
  }
  function toast(message, kind) {
    const el = document.createElement("div");
    el.className = "pisac-toast " + (kind || "ok");
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  // ============================================================
  // Styles — palet & pola kelas disamakan dengan pis-data-query.js
  // (prefix "pisac-" supaya tidak bentrok)
  // ============================================================
  const style = document.createElement("style");
  style.textContent = `
    .pisac-nav-item { cursor: pointer; }
    .pisac-overlay {
      position: fixed; inset: 0; background: #f3f4f6; z-index: 9950;
      display: none; flex-direction: column;
      font: 400 13.5px system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #1f2937;
    }
    .pisac-overlay.show { display: flex; }
    .pisac-header { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 14px 20px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .pisac-header h1 { font-size: 17px; font-weight: 800; color: #7B1A2C; margin: 0; }
    .pisac-header .pisac-sub { font-size: 12px; color: #6b7280; margin: 2px 0 0; }
    .pisac-header-title { margin-right: auto; }
    .pisac-btn { font: 700 12.5px system-ui, sans-serif; border-radius: 9px; padding: 9px 14px; cursor: pointer; border: 1px solid transparent; white-space: nowrap; }
    .pisac-btn-primary { background: linear-gradient(135deg, #7B1A2C, #a12238); color: #fff; box-shadow: 0 3px 10px rgba(123,26,44,.25); }
    .pisac-btn-primary:hover { filter: brightness(1.08); }
    .pisac-btn-outline { background: #fff; color: #374151; border-color: #d1d5db; }
    .pisac-btn-outline:hover { background: #f9fafb; }
    .pisac-btn-close { background: #fff; color: #b91c1c; border-color: #fecaca; }
    .pisac-btn-close:hover { background: #fef2f2; }
    .pisac-btn:disabled { opacity: .45; cursor: not-allowed; }
    .pisac-toolbar { padding: 12px 20px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; background: #fff; border-bottom: 1px solid #f0f0f0; }
    .pisac-search { flex: 1; min-width: 200px; max-width: 340px; padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 9px; font-size: 13px; }
    .pisac-filter { padding: 9px 10px; border: 1px solid #d1d5db; border-radius: 9px; font-size: 12.5px; font-family: inherit; background: #fff; color: #374151; }
    .pisac-count { font-size: 12px; color: #6b7280; }
    .pisac-body { flex: 1; overflow: auto; padding: 16px 20px; }
    .pisac-table-wrap { background: #fff; border-radius: 12px; border: 1px solid #eee; overflow: auto; max-height: 100%; }
    table.pisac-table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
    table.pisac-table th, table.pisac-table td { padding: 9px 12px; border-bottom: 1px solid #f0f0f0; text-align: left; white-space: nowrap; }
    table.pisac-table th { background: #faf7f7; color: #7B1A2C; font-weight: 700; position: sticky; top: 0; z-index: 1; }
    table.pisac-table tbody tr:hover { background: #fdf6f7; }
    .pisac-badge { font: 700 10.5px system-ui, sans-serif; border-radius: 999px; padding: 3px 9px; display: inline-block; }
    .pisac-badge.draft { background: #fef3c7; color: #92400e; }
    .pisac-badge.final { background: #dcfce7; color: #166534; }
    .pisac-action-btn { border: none; background: none; cursor: pointer; font-size: 13px; padding: 4px 6px; border-radius: 6px; }
    .pisac-action-btn.edit { color: #2563eb; }
    .pisac-action-btn.del { color: #b91c1c; }
    .pisac-action-btn:hover { background: #f3f4f6; }
    .pisac-empty { padding: 40px; text-align: center; color: #9ca3af; font-size: 13px; }

    .pisac-modal-overlay { position: fixed; inset: 0; background: rgba(17,17,20,.5); z-index: 9960; display: none; align-items: flex-start; justify-content: center; padding: 24px 16px; overflow-y: auto; }
    .pisac-modal-overlay.show { display: flex; }
    .pisac-modal { background: #fff; border-radius: 16px; width: 100%; max-width: 780px; padding: 22px 24px 24px; box-shadow: 0 20px 50px rgba(0,0,0,.25); }
    .pisac-modal h2 { font-size: 16px; font-weight: 800; color: #7B1A2C; margin: 0 0 4px; }
    .pisac-modal .pisac-modal-sub { color: #6b7280; font-size: 12px; margin-bottom: 14px; }
    .pisac-locked-banner { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; font: 600 12px system-ui, sans-serif; border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; }
    .pisac-group { margin-bottom: 14px; border: 1px solid #f0f0f0; border-radius: 10px; padding: 12px 14px; }
    .pisac-group h3 { font-size: 12.5px; font-weight: 700; color: #a12238; margin: 0 0 10px; text-transform: uppercase; letter-spacing: .02em; }
    .pisac-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
    .pisac-field label { display: block; font-weight: 600; font-size: 11.5px; margin-bottom: 4px; color: #374151; }
    .pisac-field input, .pisac-field select { width: 100%; box-sizing: border-box; padding: 7px 9px; border: 1px solid #d1d5db; border-radius: 7px; font-size: 12.5px; font-family: inherit; }
    .pisac-field input:focus, .pisac-field select:focus { outline: none; border-color: #7B1A2C; box-shadow: 0 0 0 2px rgba(123,26,44,.12); }
    .pisac-field input:disabled, .pisac-field select:disabled { background: #f9fafb; color: #9ca3af; }

    .pisac-item-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; margin-bottom: 10px; background: #fafafa; }
    .pisac-item-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .pisac-item-head select { max-width: 160px; }
    .pisac-item-remove { margin-left: auto; font: 700 11px system-ui, sans-serif; color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 4px 9px; cursor: pointer; }
    .pisac-item-auto-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; margin-top: 8px; }
    .pisac-item-auto-field { flex: 1; min-width: 130px; }
    .pisac-item-auto-field label { display: block; font-size: 10.5px; color: #6b7280; margin-bottom: 3px; }
    .pisac-item-auto-field .pisac-auto-value { font: 700 13px system-ui, sans-serif; color: #166534; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 7px; padding: 7px 9px; }
    .pisac-item-auto-field .pisac-auto-value.empty { color: #b45309; background: #fffbeb; border-color: #fde68a; }
    .pisac-item-source { font-size: 10.5px; color: #9ca3af; margin-top: 4px; }
    .pisac-add-item-btn { font: 700 12px system-ui, sans-serif; color: #7B1A2C; background: #fdf2f3; border: 1.5px dashed #e5c9ce; border-radius: 9px; padding: 8px 12px; cursor: pointer; width: 100%; }
    .pisac-add-item-btn:hover { background: #fbe4e6; }
    .pisac-total-row { display: flex; justify-content: space-between; align-items: center; font: 700 13.5px system-ui, sans-serif; color: #7B1A2C; padding: 10px 4px 2px; }

    .pisac-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; position: sticky; bottom: 0; background: #fff; padding-top: 10px; }
    .pisac-toast { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 99999; padding: 12px 18px; border-radius: 10px; font-size: 13px; font-family: system-ui, sans-serif; box-shadow: 0 6px 20px rgba(0,0,0,.18); max-width: 90vw; text-align: center; }
    .pisac-toast.ok { background: #1a7b2c; color: #fff; }
    .pisac-toast.fail { background: #7b1a1a; color: #fff; }
  `;
  document.head.appendChild(style);

  // ============================================================
  // Overlay panel utama (daftar kontrak)
  // ============================================================
  let rows = [];
  let filteredRows = [];
  let areaProjectOptions = [];

  const overlay = document.createElement("div");
  overlay.className = "pisac-overlay";
  overlay.innerHTML = `
    <div class="pisac-header">
      <div class="pisac-header-title">
        <h1>📑 Kontrak Kerja Area/Project</h1>
        <p class="pisac-sub">Rekap harga finishing per Area/Project. Item "Jabatan" — gaji otomatis dari Data Query. Item "Barang" — harga sewa manual.</p>
      </div>
      <button class="pisac-btn pisac-btn-primary" data-act="add">+ Kontrak Baru</button>
      <button class="pisac-btn pisac-btn-close" data-act="close">✕ Tutup</button>
    </div>
    <div class="pisac-toolbar">
      <input type="text" class="pisac-search" placeholder="Cari Nomor Kontrak / Area…" />
      <select class="pisac-filter" data-filter="status_finishing">
        <option value="">Semua Status</option>
        <option value="Draft">Draft</option>
        <option value="Final">Final</option>
      </select>
      <span class="pisac-count"></span>
    </div>
    <div class="pisac-body">
      <div class="pisac-table-wrap">
        <table class="pisac-table">
          <thead>
            <tr>
              <th>Nomor Kontrak</th><th>Area/Project</th><th>Periode</th>
              <th>Jml Item</th><th>Total Nilai Kontrak</th><th>Status</th><th>Aksi</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const tbody = overlay.querySelector("tbody");
  const searchInput = overlay.querySelector(".pisac-search");
  const statusFilter = overlay.querySelector('[data-filter="status_finishing"]');
  const countEl = overlay.querySelector(".pisac-count");

  function renderRows() {
    if (!filteredRows.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="pisac-empty">${
        rows.length ? "Tidak ada data yang cocok dengan filter/pencarian." : 'Belum ada kontrak. Klik "+ Kontrak Baru" untuk mulai mengisi.'
      }</div></td></tr>`;
    } else {
      tbody.innerHTML = filteredRows
        .map((r) => {
          const items = Array.isArray(r.item_pekerjaan) ? r.item_pekerjaan : [];
          const isFinal = r.status_finishing === "Final";
          return `
        <tr data-id="${r.id}">
          <td>${escapeHtml(r.nomor_kontrak || "-")}</td>
          <td>${escapeHtml(r.area_tugas || "-")}</td>
          <td>${escapeHtml(r.periode_mulai || "-")} s/d ${escapeHtml(r.periode_selesai || "-")}</td>
          <td>${items.length}</td>
          <td>Rp ${fmtNum(r.total_nilai_kontrak || 0)}</td>
          <td><span class="pisac-badge ${isFinal ? "final" : "draft"}">${isFinal ? "✅ Final" : "📝 Draft"}</span></td>
          <td>
            <button class="pisac-action-btn edit" data-id="${r.id}" title="${isFinal ? "Lihat" : "Edit"}">${isFinal ? "👁️" : "✏️"}</button>
            <button class="pisac-action-btn del" data-id="${r.id}" title="Hapus">🗑️</button>
          </td>
        </tr>`;
        })
        .join("");
    }
    countEl.textContent = `${filteredRows.length} dari ${rows.length} kontrak`;
  }

  function applyFilters() {
    const q = (searchInput.value || "").trim().toLowerCase();
    const statusVal = statusFilter.value;
    filteredRows = rows.filter((r) => {
      if (statusVal && r.status_finishing !== statusVal) return false;
      if (!q) return true;
      return (
        String(r.nomor_kontrak || "").toLowerCase().includes(q) ||
        String(r.area_tugas || "").toLowerCase().includes(q)
      );
    });
    renderRows();
  }
  searchInput.addEventListener("input", applyFilters);
  statusFilter.addEventListener("change", applyFilters);

  async function refresh() {
    tbody.innerHTML = `<tr><td colspan="7"><div class="pisac-empty">Memuat data…</div></td></tr>`;
    const [contracts, areas] = await Promise.all([
      apiList("/api/apps/entities/AreaContract?limit=2000&sort=-created_date"),
      apiList("/api/apps/entities/AreaProject?limit=1000"),
    ]);
    rows = contracts;
    areaProjectOptions = areas.map((a) => a.nama_area || a.nama_proyek || "").filter(Boolean);
    applyFilters();
  }

  function openOverlay() {
    overlay.classList.add("show");
    refresh();
  }
  function closeOverlay() {
    overlay.classList.remove("show");
  }
  overlay.querySelector('[data-act="close"]').addEventListener("click", closeOverlay);
  overlay.querySelector('[data-act="add"]').addEventListener("click", () => openForm(null));

  tbody.addEventListener("click", async (e) => {
    const editBtn = e.target.closest(".pisac-action-btn.edit");
    const delBtn = e.target.closest(".pisac-action-btn.del");
    if (editBtn) {
      const rec = rows.find((r) => String(r.id) === editBtn.dataset.id);
      if (rec) openForm(rec);
    } else if (delBtn) {
      const rec = rows.find((r) => String(r.id) === delBtn.dataset.id);
      if (!rec) return;
      if (rec.status_finishing === "Final" && !isMasterAdminUI()) {
        toast("Kontrak Final terkunci — hanya Master Admin yang bisa menghapusnya.", "fail");
        return;
      }
      if (!window.confirm(`Hapus kontrak "${rec.nomor_kontrak || rec.id}"? Tindakan ini tidak bisa dibatalkan.`)) return;
      const res = await apiDelete(rec.id);
      if (!res || res.success === false) {
        toast((res && res.error) || "Gagal menghapus kontrak.", "fail");
        return;
      }
      toast("Kontrak dihapus.", "ok");
      refresh();
    }
  });

  // ============================================================
  // Modal form tambah/edit kontrak
  // ============================================================
  const modalOverlay = document.createElement("div");
  modalOverlay.className = "pisac-modal-overlay";
  document.body.appendChild(modalOverlay);
  modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeForm(); });

  let currentItems = [];
  let editingRecord = null;

  function closeForm() {
    modalOverlay.classList.remove("show");
    modalOverlay.innerHTML = "";
    currentItems = [];
    editingRecord = null;
  }

  function computeItemTotal(item) {
    if (item.tipe === "Jabatan") {
      return (Number(item.gaji_pokok) || 0) + (Number(item.tunjangan_jabatan) || 0) + (Number(item.tunjangan_lain) || 0);
    }
    if (item.tipe === "Barang") {
      return (Number(item.harga_satuan) || 0) * (Number(item.jumlah) || 1);
    }
    return 0;
  }
  function computeGrandTotal() {
    return currentItems.reduce((sum, it) => sum + computeItemTotal(it), 0);
  }

  function renderItemAutoBlock(item, idx) {
    if (item.tipe !== "Jabatan") return "";
    const hasValue = item.gaji_pokok !== undefined && item.gaji_pokok !== null;
    return `
      <div class="pisac-item-auto-row" data-auto-block="${idx}">
        <div class="pisac-item-auto-field">
          <label>Gaji Pokok (BASIC SALARY)</label>
          <div class="pisac-auto-value ${hasValue ? "" : "empty"}">Rp ${fmtNum(item.gaji_pokok || 0)}</div>
        </div>
        <div class="pisac-item-auto-field">
          <label>Tunjangan Jabatan</label>
          <div class="pisac-auto-value ${hasValue ? "" : "empty"}">Rp ${fmtNum(item.tunjangan_jabatan || 0)}</div>
        </div>
        <div class="pisac-item-auto-field">
          <label>Tunjangan Lain-lain (sisa ALLOWANCE)</label>
          <div class="pisac-auto-value ${hasValue ? "" : "empty"}">Rp ${fmtNum(item.tunjangan_lain || 0)}</div>
        </div>
      </div>
      <div class="pisac-item-source">
        ${item.sumber_periode_gaji
          ? `🔄 Otomatis dari Data Query periode ${escapeHtml(item.sumber_periode_gaji)}. Nilai final akan dihitung ulang lagi saat disimpan.`
          : "⚠️ Belum ditemukan data gaji untuk kombinasi Area + Jabatan ini di Data Query. Isi dulu Data Query untuk area/jabatan ini, atau nilainya akan 0."}
      </div>`;
  }

  function renderItemCard(item, idx, locked) {
    return `
      <div class="pisac-item-card" data-item-idx="${idx}">
        <div class="pisac-item-head">
          <select class="pisac-item-tipe" data-idx="${idx}" ${locked ? "disabled" : ""}>
            ${ITEM_TIPE_OPTIONS.map((t) => `<option value="${t}" ${item.tipe === t ? "selected" : ""}>${t === "Jabatan" ? "👤 Jabatan" : "📦 Barang"}</option>`).join("")}
          </select>
          ${item.tipe === "Jabatan"
            ? `<input type="text" class="pisac-item-jabatan" data-idx="${idx}" placeholder="Nama Jabatan, mis. Security" value="${escapeHtml(item.jabatan || "")}" ${locked ? "disabled" : ""} style="flex:1;padding:7px 9px;border:1px solid #d1d5db;border-radius:7px;font-size:12.5px;" />`
            : `<input type="text" class="pisac-item-nama-barang" data-idx="${idx}" placeholder="Nama Barang, mis. CCTV" value="${escapeHtml(item.nama_barang || "")}" ${locked ? "disabled" : ""} style="flex:1;padding:7px 9px;border:1px solid #d1d5db;border-radius:7px;font-size:12.5px;" />`
          }
          ${!locked ? `<button type="button" class="pisac-item-remove" data-idx="${idx}">🗑️ Hapus Item</button>` : ""}
        </div>
        ${item.tipe === "Jabatan"
          ? renderItemAutoBlock(item, idx)
          : `
          <div class="pisac-item-auto-row">
            <div class="pisac-item-auto-field">
              <label>Satuan</label>
              <input type="text" class="pisac-item-satuan" data-idx="${idx}" placeholder="mis. unit/bulan" value="${escapeHtml(item.satuan || "")}" ${locked ? "disabled" : ""} />
            </div>
            <div class="pisac-item-auto-field">
              <label>Jumlah</label>
              <input type="number" class="pisac-item-jumlah" data-idx="${idx}" min="1" value="${item.jumlah || 1}" ${locked ? "disabled" : ""} />
            </div>
            <div class="pisac-item-auto-field">
              <label>Harga Satuan (Rp)</label>
              <input type="number" class="pisac-item-harga" data-idx="${idx}" min="0" value="${item.harga_satuan || 0}" ${locked ? "disabled" : ""} />
            </div>
          </div>`
        }
        <div style="text-align:right;font-size:11.5px;color:#6b7280;margin-top:6px;">Subtotal item: <strong>Rp ${fmtNum(computeItemTotal(item))}</strong></div>
      </div>`;
  }

  function renderItemsList(locked) {
    const wrap = modalOverlay.querySelector("#pisac-items-wrap");
    if (!wrap) return;
    wrap.innerHTML = currentItems.map((item, idx) => renderItemCard(item, idx, locked)).join("");
    modalOverlay.querySelector("#pisac-grand-total").textContent = `Rp ${fmtNum(computeGrandTotal())}`;
    attachItemEvents(locked);
  }

  async function refreshItemAutoFill(idx) {
    const item = currentItems[idx];
    if (!item || item.tipe !== "Jabatan") return;
    const areaVal = modalOverlay.querySelector("#pisac-field-area").value;
    if (!areaVal || !item.jabatan) return;
    const res = await apiPreviewSalary(areaVal, item.jabatan);
    if (res && res.success) {
      item.gaji_pokok = res.gaji_pokok || 0;
      item.tunjangan_jabatan = res.tunjangan_jabatan || 0;
      item.tunjangan_lain = res.tunjangan_lain || 0;
      item.sumber_periode_gaji = res.sumber_periode_gaji || "";
      renderItemsList(false);
    }
  }

  let jabatanDebounceTimer = null;
  function attachItemEvents(locked) {
    const wrap = modalOverlay.querySelector("#pisac-items-wrap");
    if (!wrap) return;
    wrap.querySelectorAll(".pisac-item-tipe").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset.idx);
        currentItems[idx].tipe = el.value;
        if (el.value === "Jabatan") {
          currentItems[idx] = { tipe: "Jabatan", jabatan: "", gaji_pokok: 0, tunjangan_jabatan: 0, tunjangan_lain: 0, sumber_periode_gaji: "" };
        } else {
          currentItems[idx] = { tipe: "Barang", nama_barang: "", satuan: "", jumlah: 1, harga_satuan: 0 };
        }
        renderItemsList(locked);
      });
    });
    wrap.querySelectorAll(".pisac-item-jabatan").forEach((el) => {
      el.addEventListener("input", () => {
        const idx = Number(el.dataset.idx);
        currentItems[idx].jabatan = el.value;
        clearTimeout(jabatanDebounceTimer);
        jabatanDebounceTimer = setTimeout(() => refreshItemAutoFill(idx), 600);
      });
    });
    wrap.querySelectorAll(".pisac-item-nama-barang").forEach((el) => {
      el.addEventListener("input", () => { currentItems[Number(el.dataset.idx)].nama_barang = el.value; });
    });
    wrap.querySelectorAll(".pisac-item-satuan").forEach((el) => {
      el.addEventListener("input", () => { currentItems[Number(el.dataset.idx)].satuan = el.value; });
    });
    wrap.querySelectorAll(".pisac-item-jumlah").forEach((el) => {
      el.addEventListener("input", () => {
        currentItems[Number(el.dataset.idx)].jumlah = Number(el.value) || 1;
        renderItemsList(locked);
      });
    });
    wrap.querySelectorAll(".pisac-item-harga").forEach((el) => {
      el.addEventListener("input", () => {
        currentItems[Number(el.dataset.idx)].harga_satuan = Number(el.value) || 0;
        renderItemsList(locked);
      });
    });
    wrap.querySelectorAll(".pisac-item-remove").forEach((el) => {
      el.addEventListener("click", () => {
        currentItems.splice(Number(el.dataset.idx), 1);
        renderItemsList(locked);
      });
    });
  }

  function openForm(record) {
    editingRecord = record;
    const isEdit = !!record;
    const isFinal = isEdit && record.status_finishing === "Final";
    const locked = isFinal && !isMasterAdminUI();
    currentItems = isEdit && Array.isArray(record.item_pekerjaan)
      ? JSON.parse(JSON.stringify(record.item_pekerjaan))
      : [];

    modalOverlay.innerHTML = `
      <div class="pisac-modal">
        <h2>${isEdit ? "✏️ Edit Kontrak Kerja Area/Project" : "+ Kontrak Kerja Area/Project Baru"}</h2>
        <p class="pisac-modal-sub">Item "Jabatan" otomatis membaca gaji dari Data Query. Item "Barang" diisi manual.</p>
        ${isFinal ? `<div class="pisac-locked-banner">🔒 Kontrak ini berstatus <strong>Final</strong> dan terkunci.${isMasterAdminUI() ? " Anda login sebagai Master Admin sehingga tetap bisa mengubahnya." : " Hubungi Master Admin bila perlu perubahan."}</div>` : ""}
        <div class="pisac-group">
          <h3>Data Kontrak</h3>
          <div class="pisac-grid">
            <div class="pisac-field">
              <label>Area / Project</label>
              <select id="pisac-field-area" ${locked ? "disabled" : ""}>
                <option value="">— Pilih Area/Project —</option>
                ${areaProjectOptions.map((a) => `<option value="${escapeHtml(a)}" ${record && record.area_tugas === a ? "selected" : ""}>${escapeHtml(a)}</option>`).join("")}
              </select>
            </div>
            <div class="pisac-field">
              <label>Nomor Kontrak</label>
              <input type="text" id="pisac-field-nomor" value="${escapeHtml(record?.nomor_kontrak || "")}" placeholder="mis. 001/KTR/PIS/VII/2026" ${locked ? "disabled" : ""} />
            </div>
            <div class="pisac-field">
              <label>Periode Mulai</label>
              <input type="date" id="pisac-field-mulai" value="${escapeHtml(record?.periode_mulai || "")}" ${locked ? "disabled" : ""} />
            </div>
            <div class="pisac-field">
              <label>Periode Selesai</label>
              <input type="date" id="pisac-field-selesai" value="${escapeHtml(record?.periode_selesai || "")}" ${locked ? "disabled" : ""} />
            </div>
            <div class="pisac-field">
              <label>Status Finishing</label>
              <select id="pisac-field-status" ${isFinal && !isMasterAdminUI() ? "disabled" : ""}>
                <option value="Draft" ${(record?.status_finishing || "Draft") === "Draft" ? "selected" : ""}>📝 Draft (masih bisa diedit)</option>
                <option value="Final" ${record?.status_finishing === "Final" ? "selected" : ""}>✅ Final (kunci harga)</option>
              </select>
            </div>
          </div>
        </div>
        <div class="pisac-group">
          <h3>Item Pekerjaan (Jabatan / Barang)</h3>
          <div id="pisac-items-wrap"></div>
          ${!locked ? `<button type="button" class="pisac-add-item-btn" id="pisac-add-item">+ Tambah Item</button>` : ""}
          <div class="pisac-total-row"><span>Total Nilai Kontrak (perkiraan)</span><span id="pisac-grand-total">Rp 0</span></div>
        </div>
        <div class="pisac-modal-actions">
          <button type="button" class="pisac-btn pisac-btn-outline" id="pisac-form-cancel">Batal</button>
          <button type="button" class="pisac-btn pisac-btn-primary" id="pisac-form-save" ${locked ? "disabled" : ""}>${isEdit ? "Simpan Perubahan" : "Simpan"}</button>
        </div>
      </div>`;
    modalOverlay.classList.add("show");

    renderItemsList(locked);

    modalOverlay.querySelector("#pisac-add-item").addEventListener("click", () => {
      currentItems.push({ tipe: "Jabatan", jabatan: "", gaji_pokok: 0, tunjangan_jabatan: 0, tunjangan_lain: 0, sumber_periode_gaji: "" });
      renderItemsList(locked);
    });
    modalOverlay.querySelector("#pisac-form-cancel").addEventListener("click", closeForm);
    modalOverlay.querySelector("#pisac-form-save").addEventListener("click", saveForm);
  }

  async function saveForm() {
    const saveBtn = modalOverlay.querySelector("#pisac-form-save");
    const payload = {
      area_tugas: modalOverlay.querySelector("#pisac-field-area").value,
      nomor_kontrak: modalOverlay.querySelector("#pisac-field-nomor").value.trim(),
      periode_mulai: modalOverlay.querySelector("#pisac-field-mulai").value,
      periode_selesai: modalOverlay.querySelector("#pisac-field-selesai").value,
      status_finishing: modalOverlay.querySelector("#pisac-field-status").value,
      item_pekerjaan: currentItems,
    };
    if (!payload.area_tugas) return toast("Pilih Area/Project terlebih dahulu.", "fail");
    if (!payload.nomor_kontrak) return toast("Nomor Kontrak wajib diisi.", "fail");
    if (!payload.item_pekerjaan.length) return toast("Tambahkan minimal 1 item pekerjaan.", "fail");
    for (const it of payload.item_pekerjaan) {
      if (it.tipe === "Jabatan" && !it.jabatan) return toast("Semua item Jabatan wajib diisi nama jabatannya.", "fail");
      if (it.tipe === "Barang" && !it.nama_barang) return toast("Semua item Barang wajib diisi nama barangnya.", "fail");
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Menyimpan...";
    const res = editingRecord ? await apiUpdate(editingRecord.id, payload) : await apiCreate(payload);
    saveBtn.disabled = false;
    saveBtn.textContent = editingRecord ? "Simpan Perubahan" : "Simpan";

    if (!res || res.success === false || res.error) {
      toast((res && res.error) || "Gagal menyimpan kontrak.", "fail");
      return;
    }
    toast(editingRecord ? "Perubahan disimpan. Gaji item Jabatan sudah dihitung ulang dari Data Query terbaru." : "Kontrak baru ditambahkan.", "ok");
    closeForm();
    refresh();
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (modalOverlay.classList.contains("show")) closeForm();
    else if (overlay.classList.contains("show")) closeOverlay();
  });

  // ============================================================
  // Sematkan "Kontrak Kerja Area/Project" sebagai tab tambahan, tepat
  // setelah tab "📊 Data Query" (pis-data-query.js). Kalau tab itu belum
  // sempat terpasang (mis. urutan load script), pasang setelah
  // "Ringkasan Keuangan" langsung sebagai fallback.
  // ============================================================
  function findDataQueryTab() {
    return document.querySelector('[data-pisdq-tab="1"]');
  }
  function findRingkasanKeuanganTab() {
    const candidates = Array.from(document.querySelectorAll("button, div, span, a"));
    return candidates.find((el) => el.children.length === 0 && (el.textContent || "").trim() === "Ringkasan Keuangan") || null;
  }

  function injectAreaContractTab() {
    if (!canUseFeature()) return;
    const anchorTab = findDataQueryTab() || findRingkasanKeuanganTab();
    if (!anchorTab) return;
    const parent = anchorTab.parentElement;
    if (!parent) return;
    if (parent.querySelector('[data-pisac-tab="1"]')) return; // sudah disuntik

    const clone = anchorTab.cloneNode(true);
    clone.removeAttribute("data-pisdq-tab");
    clone.setAttribute("data-pisac-tab", "1");
    clone.classList.add("pisac-nav-item");
    clone.textContent = "📑 Kontrak Kerja";
    clone.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openOverlay();
    });

    anchorTab.insertAdjacentElement("afterend", clone);
  }

  function injectAll() {
    injectAreaContractTab();
  }
  injectAll();
  setInterval(injectAll, 1200);
  const mo = new MutationObserver(() => injectAll());
  mo.observe(document.body, { childList: true, subtree: true });
})();
