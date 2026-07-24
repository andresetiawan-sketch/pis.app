/**
 * PIS AREA/PROYEK — BULK DELETE (pilih semua + hapus yang dipilih)
 * ------------------------------------------------------------------
 * Kenapa panel terpisah, bukan disisipkan ke tabel React asli?
 * Source React asli (folder src/, file .jsx) TIDAK tersedia di paket ini —
 * hanya hasil build yang sudah diminify (index-*.js). Menyisipkan
 * checkbox langsung ke baris tabel bawaan React berisiko rusak/hilang
 * setiap kali komponen itu re-render, dan struktur DOM persisnya tidak
 * bisa dipastikan tanpa source aslinya.
 *
 * Pendekatan di file ini sama seperti pis-fixes.js / pis-enhancements.js
 * yang sudah ada: panel mandiri yang memanggil API backend (entity
 * AreaProject) langsung — tidak menyentuh bundle React.
 *
 * Fitur:
 *  - Tombol mengambang "🗑️ Kelola & Hapus Area/Proyek" yang muncul di
 *    halaman Area/Proyek.
 *  - Modal berisi daftar Area/Proyek dengan checkbox per baris.
 *  - Checkbox header "Pilih Semua" untuk menandai/melepas semua baris.
 *  - Tombol "Hapus Terpilih (N)" — konfirmasi lalu hapus satu per satu
 *    lewat DELETE /api/apps/entities/AreaProject/:id (server yang
 *    menentukan hak akses hapus, sesuai role Master Admin/Admin/jabatan
 *    yang diizinkan).
 */
(function () {
  "use strict";

  // ============================================================
  // Helpers
  // ============================================================
  function getToken() {
    try { return localStorage.getItem("token") || sessionStorage.getItem("token"); } catch { return null; }
  }
  function getEmployee() {
    try {
      const s = localStorage.getItem("pis_employee") || sessionStorage.getItem("pis_employee");
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  }
  async function api(method, path, body) {
    const token = getToken();
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { "X-Employee-Token": token } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data };
  }
  const ENT = (path) => `/api/apps/entities/${path}`;

  function showToast(message, kind) {
    const el = document.createElement("div");
    el.className = "pisabd-toast " + (kind || "ok");
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  // ============================================================
  // Styles
  // ============================================================
  const style = document.createElement("style");
  style.textContent = `
    .pisabd-toast {
      position: fixed; top: 16px; right: 16px; z-index: 100000;
      padding: 12px 16px; border-radius: 10px; font: 600 13px system-ui, sans-serif;
      box-shadow: 0 6px 18px rgba(0,0,0,.25); max-width: 320px;
    }
    .pisabd-toast.ok { background: #1a7b2c; color: #fff; }
    .pisabd-toast.fail { background: #7b1a1a; color: #fff; }

    .pisabd-tab-item { cursor: pointer; }
    #pis-abd-modal {
      position: fixed; inset: 0; z-index: 99998; background: rgba(0,0,0,.45);
      display: none; align-items: center; justify-content: center; padding: 16px;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    #pis-abd-modal.show { display: flex; }
    .pisabd-card {
      background: #fff; border-radius: 14px; width: 100%; max-width: 640px;
      max-height: 84vh; display: flex; flex-direction: column; overflow: hidden;
      box-shadow: 0 12px 32px rgba(0,0,0,.3);
    }
    .pisabd-head {
      padding: 18px 20px 12px; border-bottom: 1px solid #eee;
      display: flex; align-items: center; justify-content: space-between;
    }
    .pisabd-head h3 { margin: 0; color: #7B1A2C; font-size: 16px; }
    .pisabd-close { background: none; border: none; font-size: 20px; cursor: pointer; color: #888; line-height: 1; }
    .pisabd-toolbar {
      padding: 10px 20px; display: flex; align-items: center; gap: 10px;
      border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #444;
    }
    .pisabd-toolbar label { display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 600; }
    .pisabd-toolbar .pisabd-count { margin-left: auto; color: #888; font-weight: 500; }
    .pisabd-list { overflow-y: auto; padding: 4px 20px 8px; flex: 1; }
    .pisabd-row {
      display: flex; align-items: center; gap: 10px; padding: 9px 4px;
      border-bottom: 1px solid #f5f5f5; font-size: 13px; color: #333;
    }
    .pisabd-row:last-child { border-bottom: none; }
    .pisabd-row .nm { font-weight: 600; }
    .pisabd-row .ad { color: #888; font-size: 12px; }
    .pisabd-empty, .pisabd-loading { padding: 24px 4px; text-align: center; color: #999; font-size: 13px; }
    .pisabd-actions { padding: 12px 20px 18px; display: flex; gap: 10px; border-top: 1px solid #eee; }
    .pisabd-actions button {
      flex: 1; padding: 11px; border-radius: 8px; border: none;
      font-weight: 700; font-size: 13px; cursor: pointer;
    }
    #pis-abd-delete-btn { background: #b91c2b; color: #fff; }
    #pis-abd-delete-btn:disabled { background: #e2a2a8; cursor: not-allowed; }
    #pis-abd-cancel-btn { background: #eee; color: #333; }
  `;
  document.head.appendChild(style);

  // ============================================================
  // Sematkan "Kelola & Hapus Area/Proyek" sebagai TAB tambahan (bukan
  // tombol mengambang lagi), tepat SETELAH tab "✂️ Rule Potongan Gaji"
  // (pis-potongan-absensi.js) supaya urutannya konsisten. Kalau tab itu
  // belum sempat terpasang, sisipkan setelah "💸 Rapel" sebagai fallback.
  // ============================================================
  function findLeafTabByText(text) {
    const candidates = Array.from(document.querySelectorAll("button, div, span, a"));
    return candidates.find((el) => el.children.length === 0 && (el.textContent || "").trim().includes(text)) || null;
  }
  function findPotonganTab() { return document.querySelector('[data-pispa-tab="1"]'); }
  function findRapelTab() { return findLeafTabByText("Rapel"); }

  function injectAbdTab() {
    const anchorTab = findPotonganTab() || findRapelTab();
    if (!anchorTab) return;
    const parent = anchorTab.parentElement;
    if (!parent) return;
    if (parent.querySelector('[data-pisabd-tab="1"]')) return; // sudah disuntik

    const clone = anchorTab.cloneNode(true);
    clone.removeAttribute("data-pispa-tab");
    clone.setAttribute("data-pisabd-tab", "1");
    clone.classList.add("pisabd-tab-item");
    clone.textContent = "🗑️ Kelola & Hapus Area/Proyek";
    clone.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });

    anchorTab.insertAdjacentElement("afterend", clone);
  }

  injectAbdTab();
  setInterval(injectAbdTab, 1200);
  const abdTabObserver = new MutationObserver(() => injectAbdTab());
  abdTabObserver.observe(document.body, { childList: true, subtree: true });

  // ============================================================
  // Modal
  // ============================================================
  const modal = document.createElement("div");
  modal.id = "pis-abd-modal";
  modal.innerHTML = `
    <div class="pisabd-card">
      <div class="pisabd-head">
        <h3>🗑️ Kelola &amp; Hapus Area/Proyek</h3>
        <button class="pisabd-close" id="pis-abd-close">✕</button>
      </div>
      <div class="pisabd-toolbar">
        <label><input type="checkbox" id="pis-abd-select-all" /> Pilih Semua</label>
        <span class="pisabd-count" id="pis-abd-count">0 dipilih</span>
      </div>
      <div class="pisabd-list" id="pis-abd-list">
        <div class="pisabd-loading">Memuat data Area/Proyek…</div>
      </div>
      <div class="pisabd-actions">
        <button id="pis-abd-cancel-btn">Tutup</button>
        <button id="pis-abd-delete-btn" disabled>Hapus Terpilih (0)</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const listEl = modal.querySelector("#pis-abd-list");
  const selectAllEl = modal.querySelector("#pis-abd-select-all");
  const countEl = modal.querySelector("#pis-abd-count");
  const deleteBtn = modal.querySelector("#pis-abd-delete-btn");

  modal.querySelector("#pis-abd-close").addEventListener("click", closeModal);
  modal.querySelector("#pis-abd-cancel-btn").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  let currentItems = [];

  function closeModal() {
    modal.classList.remove("show");
  }

  async function openModal() {
    modal.classList.add("show");
    selectAllEl.checked = false;
    await loadList();
  }

  async function loadList() {
    listEl.innerHTML = `<div class="pisabd-loading">Memuat data Area/Proyek…</div>`;
    updateCount();
    const res = await api("GET", ENT("AreaProject?limit=1000"));
    if (!res.ok) {
      listEl.innerHTML = `<div class="pisabd-empty">Gagal memuat data (${res.status}).</div>`;
      return;
    }
    currentItems = Array.isArray(res.data) ? res.data : (res.data?.items || res.data?.data || []);
    if (!currentItems.length) {
      listEl.innerHTML = `<div class="pisabd-empty">Belum ada data Area/Proyek.</div>`;
      updateCount();
      return;
    }
    listEl.innerHTML = currentItems.map((item) => {
      const nama = item.nama_area || item.nama_proyek || item.nama || "(tanpa nama)";
      const alamat = item.alamat || "";
      return `
        <label class="pisabd-row">
          <input type="checkbox" class="pisabd-row-check" data-id="${item.id}" />
          <span>
            <div class="nm">${escapeHtml(nama)}</div>
            ${alamat ? `<div class="ad">${escapeHtml(alamat)}</div>` : ""}
          </span>
        </label>
      `;
    }).join("");
    listEl.querySelectorAll(".pisabd-row-check").forEach((cb) => {
      cb.addEventListener("change", () => {
        syncSelectAllState();
        updateCount();
      });
    });
    updateCount();
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function getRowChecks() {
    return Array.from(listEl.querySelectorAll(".pisabd-row-check"));
  }

  function syncSelectAllState() {
    const checks = getRowChecks();
    selectAllEl.checked = checks.length > 0 && checks.every((c) => c.checked);
  }

  function updateCount() {
    const n = getRowChecks().filter((c) => c.checked).length;
    countEl.textContent = `${n} dipilih`;
    deleteBtn.textContent = `Hapus Terpilih (${n})`;
    deleteBtn.disabled = n === 0;
  }

  selectAllEl.addEventListener("change", () => {
    getRowChecks().forEach((c) => { c.checked = selectAllEl.checked; });
    updateCount();
  });

  deleteBtn.addEventListener("click", async () => {
    const selectedIds = getRowChecks().filter((c) => c.checked).map((c) => c.dataset.id);
    if (!selectedIds.length) return;

    const ok = window.confirm(
      `Hapus ${selectedIds.length} data Area/Proyek yang dipilih? Tindakan ini tidak bisa dibatalkan.`
    );
    if (!ok) return;

    deleteBtn.disabled = true;
    deleteBtn.textContent = "Menghapus…";

    let success = 0;
    let failed = 0;
    let lastError = "";
    for (const id of selectedIds) {
      const res = await api("DELETE", ENT(`AreaProject/${id}`));
      if (res.ok) {
        success++;
      } else {
        failed++;
        lastError = res.data?.error || res.data?.message || `HTTP ${res.status}`;
      }
    }

    if (success) showToast(`${success} data Area/Proyek berhasil dihapus.`, "ok");
    if (failed) showToast(`${failed} data gagal dihapus. ${lastError || ""}`.trim(), "fail");

    await loadList();
    selectAllEl.checked = false;
  });
})();