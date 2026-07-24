/**
 * PIS — Impor Data Pelamar (menu Data Pelamar / Applicants)
 * Lapisan overlay tambahan (tidak menyentuh bundle React), mengikuti pola
 * yang sama seperti pis-enhancements.js / pis-fixes.js / pis-recruitment-form.js.
 *
 * Menambahkan tombol "Impor Data Pelamar" tepat di sebelah tombol "Template XLSX"
 * yang sudah ada di halaman Data Pelamar, dengan gaya visual yang disamakan
 * (kelas CSS di-kloning langsung dari tombol Template XLSX supaya identik).
 *
 * Alur: pilih file .xlsx -> upload ke /api/uploads -> kirim file_url ke
 * /api/applicant/import (endpoint baru di worker.js) -> tampilkan hasil
 * (berhasil/gagal per baris) -> refresh daftar.
 */
(function () {
  "use strict";

  function isApplicantsPage() {
    return /applicants|data-pelamar|pelamar/i.test(window.location.pathname);
  }

  function getToken() {
    try { return localStorage.getItem("token") || sessionStorage.getItem("token"); } catch { return null; }
  }

  // ============================================================
  // Toast (style sama seperti pis-enhancements.js / pis-fixes.js)
  // ============================================================
  const style = document.createElement("style");
  style.textContent = `
    .pisai-toast {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      z-index: 99998; padding: 12px 18px; border-radius: 10px; font-size: 13px;
      font-family: system-ui, sans-serif; box-shadow: 0 6px 20px rgba(0,0,0,.18);
      max-width: 90vw; text-align: center;
    }
    .pisai-toast.ok { background: #1a7b2c; color: #fff; }
    .pisai-toast.fail { background: #7b1a1a; color: #fff; }
    #pisai-modal {
      display: none; position: fixed; inset: 0; z-index: 99999; background: rgba(0,0,0,.5);
      align-items: center; justify-content: center; padding: 16px;
      font-family: system-ui, sans-serif;
    }
    #pisai-modal.show { display: flex; }
    #pisai-modal .pisai-card {
      background: #fff; border-radius: 14px; max-width: 480px; width: 100%;
      max-height: 82vh; overflow-y: auto; padding: 22px;
    }
    #pisai-modal h3 { color: #7B1A2C; margin: 0 0 10px; font-size: 16px; }
    #pisai-modal .pisai-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
    #pisai-modal .pisai-fail-item { font-size: 12px; color: #7b1a1a; padding: 4px 0; }
    #pisai-modal .pisai-close-btn { margin-top: 16px; width: 100%; padding: 10px; border-radius: 8px; border: none; background: #7B1A2C; color: #fff; font-weight: 700; cursor: pointer; }
  `;
  document.head.appendChild(style);

  function showToast(message, kind) {
    const el = document.createElement("div");
    el.className = "pisai-toast " + kind;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  // ============================================================
  // Cari tombol "Template XLSX" yang sudah ada di halaman Data Pelamar
  // ============================================================
  function findTemplateButton() {
    const candidates = document.querySelectorAll('button, a, [role="button"]');
    for (const el of candidates) {
      const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (/template\s*xlsx/i.test(txt)) return el;
    }
    return null;
  }

  let importBtnBuilt = false;
  let fileInput = null;

  function buildImportButton() {
    if (!isApplicantsPage()) {
      const existing = document.getElementById("pisai-import-btn");
      if (existing) { existing.remove(); importBtnBuilt = false; }
      return;
    }
    const templateBtn = findTemplateButton();
    if (!templateBtn) return;
    if (document.getElementById("pisai-import-btn")) return; // sudah ada

    const btn = document.createElement("button");
    btn.id = "pisai-import-btn";
    btn.type = "button";
    // Samakan visual persis dengan tombol Template XLSX di sebelahnya
    btn.className = templateBtn.className;
    btn.style.marginLeft = "8px";
    btn.innerHTML = "⬆️ Impor Data Pelamar";
    templateBtn.insertAdjacentElement("afterend", btn);
    importBtnBuilt = true;

    if (!fileInput) {
      fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".xlsx,.xls";
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);
      fileInput.addEventListener("change", onFileSelected);
    }
    btn.addEventListener("click", () => fileInput.click());
  }

  async function onFileSelected() {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (!file) return;

    const btn = document.getElementById("pisai-import-btn");
    const originalText = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = "⏳ Mengunggah..."; }

    try {
      const token = getToken();
      // 1) Upload file mentah ke R2 lewat endpoint upload yang sudah ada
      const fd = new FormData();
      fd.append("file", file);
      const upRes = await fetch("/api/uploads", {
        method: "POST",
        headers: token ? { "X-Employee-Token": token } : {},
        body: fd,
      });
      const upData = await upRes.json();
      if (!upRes.ok || !upData.file_url) {
        showToast(upData.error || "Gagal mengunggah file.", "fail");
        return;
      }

      if (btn) btn.innerHTML = "⏳ Memproses data...";

      // 2) Kirim file_url ke endpoint impor khusus Data Pelamar
      const impRes = await fetch("/api/applicant/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "X-Employee-Token": token } : {}) },
        body: JSON.stringify({ file_url: upData.file_url }),
      });
      const impData = await impRes.json();
      if (!impRes.ok || !impData.success) {
        showToast(impData.error || "Gagal mengimpor data pelamar.", "fail");
        return;
      }

      showResultModal(impData);
      const failCount = (impData.failed || []).length;
      if (impData.success_count > 0 && failCount === 0) {
        showToast(`Berhasil impor ${impData.success_count} data pelamar.`, "ok");
      } else if (impData.success_count > 0 && failCount > 0) {
        showToast(`${impData.success_count} berhasil, ${failCount} gagal — lihat rincian.`, "ok");
      } else {
        showToast(`Semua baris gagal diimpor (${failCount}). Lihat rincian.`, "fail");
      }
    } catch (e) {
      showToast("Gagal terhubung ke server: " + e.message, "fail");
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
  }

  function showResultModal(result) {
    let modal = document.getElementById("pisai-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "pisai-modal";
      document.body.appendChild(modal);
      modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("show"); });
    }
    const failed = result.failed || [];
    modal.innerHTML = `
      <div class="pisai-card">
        <h3>📋 Hasil Impor Data Pelamar</h3>
        <div class="pisai-row"><span>Berhasil disimpan</span><b style="color:#1a7b2c">${result.success_count || 0}</b></div>
        <div class="pisai-row"><span>Gagal</span><b style="color:#7b1a1a">${failed.length}</b></div>
        ${failed.length ? `<div style="margin-top:10px;">${failed.map(f => `<div class="pisai-fail-item">Baris ${f.row}: ${escapeHtml(f.reason)}</div>`).join("")}</div>` : ""}
        <button class="pisai-close-btn" id="pisai-modal-close">Tutup &amp; Muat Ulang Daftar</button>
      </div>`;
    modal.classList.add("show");
    document.getElementById("pisai-modal-close").addEventListener("click", () => {
      modal.classList.remove("show");
      if ((result.success_count || 0) > 0) window.location.reload();
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const observer = new MutationObserver(() => buildImportButton());
  observer.observe(document.body, { childList: true, subtree: true });
  buildImportButton();
})();
