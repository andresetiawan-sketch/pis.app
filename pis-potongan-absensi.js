/**
 * PIS — "Rule Potongan Gaji" (Tahap 5): panel untuk Admin/Master Admin
 * mengatur aturan potongan gaji otomatis berdasarkan Absensi, TANPA perlu
 * developer deploy ulang kode. Lapisan tambahan (FAB — tombol mengambang
 * di kanan bawah), pola & gaya visual disamakan dengan panel "💰 Data Gaji
 * PKWT" (pis-pkwt-gaji.js) supaya konsisten, ditumpuk di atasnya.
 *
 * Entity: DashboardConfig, tipe = "Rule Potongan Gaji":
 *   { tipe, nama_rule, area_tugas ("Semua" atau nama area spesifik),
 *     kriteria_status: ["Alfa","Ijin",...], nominal_potongan, 
 *     satuan: "per_hari" | "flat", aktif: true|false }
 *
 * Dipakai oleh computeAttendanceDeduction() di worker.js — dipanggil
 * otomatis tiap generatePayslipBulanan() jalan (cron tanggal 1). Rule baru
 * atau yang diubah berlaku untuk perhitungan bulan BERIKUTNYA, tidak
 * mengubah slip yang sudah terbit.
 */
(function () {
  "use strict";

  const ADMIN_ROLES = ["Master Admin", "master_admin", "Admin"];
  const STATUS_OPTIONS = ["Alfa", "Ijin", "Sakit", "Cuti", "Off"];

  function getEmployee() {
    try {
      const s = localStorage.getItem("pis_employee") || sessionStorage.getItem("pis_employee");
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  }
  function getToken() {
    try { return localStorage.getItem("token") || sessionStorage.getItem("token"); } catch { return null; }
  }
  function isAdminEmployee() {
    const emp = getEmployee();
    return ADMIN_ROLES.includes((emp && emp.role) || "");
  }

  async function api(method, path, body) {
    const token = getToken();
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { "X-Employee-Token": token } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: { error: e.message || String(e) } };
    }
  }
  const ENT = (name, id) => "/api/apps/entities/" + name + (id ? "/" + id : "");

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(message, kind) {
    var el = document.createElement("div");
    el.className = "pispa-toast " + (kind || "ok");
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(function() { el.remove(); }, 5000);
  }

  var style = document.createElement("style");
  style.textContent = [
    ".pispa-toast { position:fixed; top:16px; right:16px; z-index:100000; padding:12px 16px;",
    "  border-radius:10px; font:600 13px system-ui,sans-serif; box-shadow:0 6px 18px rgba(0,0,0,.25); max-width:320px; }",
    ".pispa-toast.ok { background:#1a7b2c; color:#fff; }",
    ".pispa-toast.fail { background:#7b1a1a; color:#fff; }",
    ".pispa-tab-item { cursor:pointer; }",
    ".pispa-ov { display:none; position:fixed; inset:0; z-index:99998; background:rgba(0,0,0,.45);",
    "  align-items:center; justify-content:center; padding:16px; }",
    ".pispa-ov.show { display:flex; }",
    ".pispa-box { background:#fff; border-radius:14px; width:100%; max-width:700px; max-height:90vh;",
    "  overflow-y:auto; padding:22px; font:13px system-ui,sans-serif; color:#222; position:relative; }",
    ".pispa-box h2 { color:#7B1A2C; font-size:17px; margin:0 0 4px; }",
    ".pispa-sub { color:#777; font-size:12px; margin-bottom:14px; line-height:1.5; }",
    ".pispa-lbl { display:block; font-size:12px; font-weight:600; color:#444; margin:10px 0 3px; }",
    ".pispa-box select, .pispa-box input[type=text], .pispa-box input[type=number] {",
    "  width:100%; padding:8px; border:1px solid #ddd; border-radius:8px; font-size:13px;",
    "  box-sizing:border-box; font-family:inherit; }",
    ".pispa-row { display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap; }",
    ".pispa-row > * { flex:1; min-width:140px; }",
    ".pispa-checks { display:flex; gap:14px; flex-wrap:wrap; margin-top:4px; }",
    ".pispa-checks label { display:flex; align-items:center; gap:5px; font-size:13px; font-weight:500; }",
    ".pispa-checks input { width:auto; }",
    ".pispa-toggle { display:flex; align-items:center; gap:8px; margin-top:12px; font-size:13px; }",
    ".pispa-toggle input { width:auto; }",
    ".pispa-btn { background:#7B1A2C; color:#fff; border:none; border-radius:8px;",
    "  padding:9px 14px; font:700 13px system-ui,sans-serif; cursor:pointer; }",
    ".pispa-btn.sec { background:#eee; color:#333; }",
    ".pispa-btn.del { background:#7b1a1a; }",
    ".pispa-btn:disabled { opacity:.5; cursor:not-allowed; }",
    ".pispa-tbl-wrap { margin-top:16px; border:1px solid #eee; border-radius:10px; overflow:auto; }",
    ".pispa-tbl { width:100%; border-collapse:collapse; font-size:12.5px; }",
    ".pispa-tbl th, .pispa-tbl td { padding:8px 9px; border-bottom:1px solid #f2f2f2; text-align:left; }",
    ".pispa-tbl th { background:#fdf2f3; color:#7B1A2C; font-weight:700; position:sticky; top:0; }",
    ".pispa-empty { padding:14px; color:#999; font-style:italic; }",
    ".pispa-close { position:absolute; top:14px; right:16px; background:none; border:none;",
    "  font-size:20px; cursor:pointer; color:#999; line-height:1; }",
    ".pispa-badge { font:700 10.5px system-ui,sans-serif; border-radius:999px; padding:2px 8px; }",
    ".pispa-badge.on { background:#dcfce7; color:#166534; }",
    ".pispa-badge.off { background:#f3f4f6; color:#6b7280; }",
  ].join("\n");
  document.head.appendChild(style);

  // ============================================================
  // Sematkan "Rule Potongan Gaji" sebagai TAB tambahan (bukan tombol
  // mengambang lagi), tepat SETELAH tab "💸 Rapel" di baris tab yang sama
  // dengan Kontrak & Invoice / Transaksi Bank / dst. Kalau tab "Rapel"
  // belum sempat terpasang (mis. urutan load script/halaman lain), pasang
  // setelah "📑 Kontrak Kerja" sebagai fallback.
  // ============================================================
  function findLeafTabByText(text) {
    var candidates = Array.prototype.slice.call(document.querySelectorAll("button, div, span, a"));
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.children.length === 0 && (el.textContent || "").trim().indexOf(text) !== -1) return el;
    }
    return null;
  }
  function findRapelTab() { return findLeafTabByText("Rapel"); }
  function findKontrakKerjaTab() { return document.querySelector('[data-pisac-tab="1"]') || findLeafTabByText("Kontrak Kerja"); }

  function injectPotonganTab() {
    if (!isAdminEmployee()) return;
    var anchorTab = findRapelTab() || findKontrakKerjaTab();
    if (!anchorTab) return;
    var parent = anchorTab.parentElement;
    if (!parent) return;
    if (parent.querySelector('[data-pispa-tab="1"]')) return; // sudah disuntik

    var clone = anchorTab.cloneNode(true);
    clone.removeAttribute("data-pisac-tab");
    clone.setAttribute("data-pispa-tab", "1");
    clone.classList.add("pispa-tab-item");
    clone.textContent = "✂️ Rule Potongan Gaji";
    clone.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });

    anchorTab.insertAdjacentElement("afterend", clone);
  }

  var overlay = null;
  var areasCache = null;
  var editingId = null;

  async function loadAreas() {
    if (areasCache) return areasCache;
    var r = await api("GET", ENT("AreaProject") + "?limit=1000");
    areasCache = (r.ok && Array.isArray(r.data)) ? r.data : [];
    return areasCache;
  }

  async function openModal() {
    if (!overlay) {
      var areas = await loadAreas();
      var areaOpts = areas
        .map(function(a) { return a.nama_area || a.nama_proyek || ""; })
        .filter(Boolean)
        .map(function(a) { return "<option value=\"" + escapeHtml(a) + "\">" + escapeHtml(a) + "</option>"; })
        .join("");

      overlay = document.createElement("div");
      overlay.className = "pispa-ov";
      overlay.innerHTML =
        "<div class=\"pispa-box\">" +
          "<button class=\"pispa-close\" id=\"pispa-x\">\xD7</button>" +
          "<h2>\u2702\uFE0F Rule Potongan Gaji</h2>" +
          "<p class=\"pispa-sub\">Atur potongan gaji otomatis dari Absensi. Berlaku mulai generate slip bulan <strong>berikutnya</strong> " +
            "&mdash; tidak mengubah slip yang sudah terbit.</p>" +
          "<label class=\"pispa-lbl\">Nama Rule</label>" +
          "<input type=\"text\" id=\"pispa-nama\" placeholder=\"mis. Potongan Alfa Harian\" />" +
          "<div class=\"pispa-row\" style=\"margin-top:2px;\">" +
            "<div><label class=\"pispa-lbl\">Area Tugas</label>" +
              "<select id=\"pispa-area\"><option value=\"Semua\">Semua Area</option>" + areaOpts + "</select></div>" +
            "<div><label class=\"pispa-lbl\">Nominal Potongan (Rp)</label>" +
              "<input type=\"number\" id=\"pispa-nominal\" min=\"0\" placeholder=\"mis. 100000\" /></div>" +
            "<div><label class=\"pispa-lbl\">Satuan</label>" +
              "<select id=\"pispa-satuan\">" +
                "<option value=\"per_hari\">Per kejadian (nominal \xD7 jml hari)</option>" +
                "<option value=\"flat\">Flat (sekali potong jika ada \u22651 kejadian)</option>" +
              "</select></div>" +
          "</div>" +
          "<label class=\"pispa-lbl\">Status Absensi yang Dihitung</label>" +
          "<div class=\"pispa-checks\" id=\"pispa-status-checks\">" +
            STATUS_OPTIONS.map(function(s) {
              return "<label><input type=\"checkbox\" value=\"" + s + "\" /> " + s + "</label>";
            }).join("") +
          "</div>" +
          "<div class=\"pispa-toggle\">" +
            "<input type=\"checkbox\" id=\"pispa-aktif\" checked />" +
            "<span>Rule aktif (dipakai saat generate gaji otomatis)</span>" +
          "</div>" +
          "<div class=\"pispa-row\" style=\"margin-top:14px;\">" +
            "<button class=\"pispa-btn\" id=\"pispa-save\">+ Tambah Rule</button>" +
            "<button class=\"pispa-btn sec\" id=\"pispa-batal\" style=\"display:none;\">Batal Edit</button>" +
          "</div>" +
          "<div class=\"pispa-tbl-wrap\"><table class=\"pispa-tbl\">" +
            "<thead><tr><th>Nama Rule</th><th>Area</th><th>Kriteria</th><th>Nominal</th><th>Satuan</th><th>Status</th><th>Aksi</th></tr></thead>" +
            "<tbody id=\"pispa-tbody\"><tr><td colspan=\"7\" class=\"pispa-empty\">Memuat\u2026</td></tr></tbody>" +
          "</table></div>" +
        "</div>";
      document.body.appendChild(overlay);

      overlay.addEventListener("click", function(e) { if (e.target === overlay) closeModal(); });
      overlay.querySelector("#pispa-x").addEventListener("click", closeModal);
      overlay.querySelector("#pispa-batal").addEventListener("click", resetForm);
      overlay.querySelector("#pispa-save").addEventListener("click", saveRule);
    }
    overlay.classList.add("show");
    refreshList();
  }

  function closeModal() {
    if (overlay) overlay.classList.remove("show");
  }

  function resetForm() {
    editingId = null;
    overlay.querySelector("#pispa-nama").value = "";
    overlay.querySelector("#pispa-nominal").value = "";
    overlay.querySelector("#pispa-satuan").value = "per_hari";
    overlay.querySelector("#pispa-area").value = "Semua";
    overlay.querySelector("#pispa-aktif").checked = true;
    overlay.querySelectorAll("#pispa-status-checks input").forEach(function(cb) { cb.checked = false; });
    overlay.querySelector("#pispa-save").textContent = "+ Tambah Rule";
    overlay.querySelector("#pispa-batal").style.display = "none";
  }

  async function refreshList() {
    var tbody = overlay.querySelector("#pispa-tbody");
    tbody.innerHTML = "<tr><td colspan=\"7\" class=\"pispa-empty\">Memuat\u2026</td></tr>";
    var r = await api("GET", ENT("DashboardConfig") + "?limit=500");
    var all = (r.ok && Array.isArray(r.data)) ? r.data : [];
    var rows = all.filter(function(x) { return x.tipe === "Rule Potongan Gaji"; });

    if (!rows.length) {
      tbody.innerHTML = "<tr><td colspan=\"7\" class=\"pispa-empty\">Belum ada rule. Tambahkan lewat form di atas.</td></tr>";
      return;
    }
    tbody.innerHTML = rows.map(function(row) {
      var aktifClass = row.aktif !== false ? "on" : "off";
      var aktifLabel = row.aktif !== false ? "Aktif" : "Nonaktif";
      var kriteria = Array.isArray(row.kriteria_status) ? row.kriteria_status.join(", ") : "-";
      var nominal = "Rp " + Number(row.nominal_potongan || 0).toLocaleString("id-ID");
      var satuan = row.satuan === "flat" ? "Flat" : "Per kejadian";
      return "<tr data-id=\"" + row.id + "\">" +
        "<td>" + escapeHtml(row.nama_rule || "-") + "</td>" +
        "<td>" + escapeHtml(row.area_tugas || "Semua") + "</td>" +
        "<td>" + escapeHtml(kriteria) + "</td>" +
        "<td>" + nominal + "</td>" +
        "<td>" + satuan + "</td>" +
        "<td><span class=\"pispa-badge " + aktifClass + "\">" + aktifLabel + "</span></td>" +
        "<td style=\"display:flex;gap:4px;\">" +
          "<button class=\"pispa-btn sec pispa-e\" data-id=\"" + row.id + "\" style=\"padding:4px 9px;font-size:11.5px;\">✏️</button>" +
          "<button class=\"pispa-btn del pispa-d\" data-id=\"" + row.id + "\" style=\"padding:4px 9px;font-size:11.5px;\">🗑️</button>" +
        "</td></tr>";
    }).join("");

    tbody.querySelectorAll(".pispa-e").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var row = rows.find(function(x) { return String(x.id) === btn.dataset.id; });
        if (row) fillEdit(row);
      });
    });
    tbody.querySelectorAll(".pispa-d").forEach(function(btn) {
      btn.addEventListener("click", async function() {
        if (!window.confirm("Hapus rule potongan ini? Slip gaji yang sudah terbit tidak berubah.")) return;
        var res = await api("DELETE", ENT("DashboardConfig", btn.dataset.id));
        if (!res.ok) { toast((res.data && res.data.error) || "Gagal menghapus.", "fail"); return; }
        toast("Rule dihapus.", "ok");
        refreshList();
      });
    });
  }

  function fillEdit(row) {
    editingId = row.id;
    overlay.querySelector("#pispa-nama").value = row.nama_rule || "";
    overlay.querySelector("#pispa-area").value = row.area_tugas || "Semua";
    overlay.querySelector("#pispa-nominal").value = row.nominal_potongan || "";
    overlay.querySelector("#pispa-satuan").value = row.satuan === "flat" ? "flat" : "per_hari";
    overlay.querySelector("#pispa-aktif").checked = row.aktif !== false;
    var kriteria = Array.isArray(row.kriteria_status) ? row.kriteria_status : [];
    overlay.querySelectorAll("#pispa-status-checks input").forEach(function(cb) {
      cb.checked = kriteria.indexOf(cb.value) >= 0;
    });
    overlay.querySelector("#pispa-save").textContent = "💾 Simpan Perubahan";
    overlay.querySelector("#pispa-batal").style.display = "";
    overlay.querySelector(".pispa-box").scrollTop = 0;
  }

  async function saveRule() {
    var nama_rule = overlay.querySelector("#pispa-nama").value.trim();
    var area_tugas = overlay.querySelector("#pispa-area").value;
    var nominal_potongan = Number(overlay.querySelector("#pispa-nominal").value) || 0;
    var satuan = overlay.querySelector("#pispa-satuan").value;
    var aktif = overlay.querySelector("#pispa-aktif").checked;
    var kriteria_status = Array.from(
      overlay.querySelectorAll("#pispa-status-checks input:checked")
    ).map(function(cb) { return cb.value; });

    if (!nama_rule) return toast("Nama Rule wajib diisi.", "fail");
    if (!kriteria_status.length) return toast("Pilih minimal 1 status absensi.", "fail");
    if (nominal_potongan <= 0) return toast("Nominal Potongan harus lebih dari 0.", "fail");

    var payload = {
      tipe: "Rule Potongan Gaji", nama_rule: nama_rule, area_tugas: area_tugas,
      nominal_potongan: nominal_potongan, satuan: satuan, aktif: aktif,
      kriteria_status: kriteria_status
    };
    var saveBtn = overlay.querySelector("#pispa-save");
    saveBtn.disabled = true;
    var res = editingId
      ? await api("PUT", ENT("DashboardConfig", editingId), payload)
      : await api("POST", ENT("DashboardConfig"), payload);
    saveBtn.disabled = false;

    if (!res.ok || (res.data && res.data.error)) {
      toast((res.data && res.data.error) || "Gagal menyimpan rule.", "fail");
      return;
    }
    toast(editingId ? "Perubahan disimpan." : "Rule baru ditambahkan.", "ok");
    resetForm();
    refreshList();
  }

  injectPotonganTab();
  setInterval(injectPotonganTab, 1200);
  var mo = new MutationObserver(function() { injectPotonganTab(); });
  mo.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape" && overlay && overlay.classList.contains("show")) closeModal();
  });
})();