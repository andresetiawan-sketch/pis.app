/**
 * PIS — Panel "Rapel" (Tahap 4): kelola koreksi selisih gaji antar periode.
 * Tab tambahan di halaman "Kontrak & Invoice" (setelah tab "📑 Kontrak Kerja"),
 * pola injeksi sama dengan pis-data-query.js & pis-area-contract.js.
 *
 * Hak akses:
 *  - Buat/Edit/Setujui/Tandai Dibayarkan : Master Admin + Admin Head Office
 *  - Hapus                                : Master Admin saja
 *  - Lihat (read-only)                    : Admin area biasa (filter areanya)
 *  - Karyawan biasa                       : tidak ada akses ke tab ini
 *
 * Alur rapel:
 *  Diajukan → Disetujui → Dibayarkan (dibayarkan via komponen di Payslip
 *  bulan berikutnya — pencatatan manual di sini, bukan otomatis buka slip).
 *
 * Rapel bisa dibuat manual oleh Head Office/Master Admin, ATAU otomatis
 * oleh sistem (sumber="otomatis-dataquery") saat Data Query bulan yang
 * sudah punya Payslip terbit diubah.
 */
(function () {
  "use strict";

  const ADMIN_ROLES = ["Master Admin", "master_admin", "Admin"];
  const MASTER_ADMIN_ROLES = ["Master Admin", "master_admin"];
  const HO_AREA = ["head office", "kantor pusat"];
  const JENIS_OPTIONS = ["Kurang Bayar", "Lebih Bayar", "Koreksi Absensi", "Koreksi Kontrak", "Lainnya"];
  const STATUS_OPTIONS = ["Diajukan", "Disetujui", "Dibayarkan"];

  function getEmployee() {
    try { return JSON.parse(localStorage.getItem("pis_employee") || sessionStorage.getItem("pis_employee")); } catch { return null; }
  }
  function getToken() {
    try { return localStorage.getItem("token") || sessionStorage.getItem("token"); } catch { return null; }
  }
  function role() { var e = getEmployee(); return (e && e.role) || ""; }
  function isMasterAdmin() { return MASTER_ADMIN_ROLES.includes(role()); }
  function isHO() {
    var e = getEmployee();
    return isMasterAdmin() || HO_AREA.includes(String((e && e.area_tugas) || "").trim().toLowerCase());
  }
  function canView() { return ADMIN_ROLES.includes(role()); }

  async function api(method, path, body) {
    var token = getToken();
    try {
      var res = await fetch(path, {
        method: method,
        headers: Object.assign({ "Content-Type": "application/json" }, token ? { "X-Employee-Token": token } : {}),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      var data = await res.json().catch(function() { return null; });
      return { ok: res.ok, data: data };
    } catch (e) { return { ok: false, data: { error: String(e) } }; }
  }
  var ENT = function(n, id) { return "/api/apps/entities/" + n + (id ? "/" + id : ""); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtRp(v) { return "Rp " + (Math.round(Math.abs(Number(v) || 0))).toLocaleString("id-ID"); }
  function fmtBulan(p) {
    if (!p) return "-";
    var BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    var m = String(p).match(/^(\d{4})-(\d{2})$/);
    return m ? (BULAN[parseInt(m[2],10)-1] || m[2]) + " " + m[1] : p;
  }
  function fmtDate(s) { if (!s) return "-"; try { return new Date(s).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}); } catch { return s; } }
  function toast(msg, kind) {
    var el = document.createElement("div"); el.className = "pisrp-toast " + (kind || "ok"); el.textContent = msg;
    document.body.appendChild(el); setTimeout(function() { el.remove(); }, 5000);
  }

  // ── Styles ──
  var style = document.createElement("style");
  style.textContent = [
    ".pisrp-toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:100001;",
    "  padding:12px 18px;border-radius:10px;font:600 13px system-ui,sans-serif;",
    "  box-shadow:0 6px 18px rgba(0,0,0,.25);max-width:90vw;text-align:center;}",
    ".pisrp-toast.ok{background:#1a7b2c;color:#fff;} .pisrp-toast.fail{background:#7b1a1a;color:#fff;}",
    ".pisrp-ov{position:fixed;inset:0;background:#f3f4f6;z-index:9950;display:none;flex-direction:column;",
    "  font:400 13.5px system-ui,sans-serif;color:#1f2937;}",
    ".pisrp-ov.show{display:flex;}",
    ".pisrp-hdr{background:#fff;border-bottom:1px solid #e5e7eb;padding:14px 20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;}",
    ".pisrp-hdr h1{font-size:17px;font-weight:800;color:#7B1A2C;margin:0;}",
    ".pisrp-hdr .pisrp-sub{font-size:12px;color:#6b7280;margin:2px 0 0;}",
    ".pisrp-hdr-title{margin-right:auto;}",
    ".pisrp-btn{font:700 12.5px system-ui,sans-serif;border-radius:9px;padding:9px 14px;cursor:pointer;border:1px solid transparent;white-space:nowrap;}",
    ".pisrp-btn-primary{background:linear-gradient(135deg,#7B1A2C,#a12238);color:#fff;box-shadow:0 3px 10px rgba(123,26,44,.25);}",
    ".pisrp-btn-outline{background:#fff;color:#374151;border-color:#d1d5db;}",
    ".pisrp-btn-close{background:#fff;color:#b91c1c;border-color:#fecaca;}",
    ".pisrp-btn:disabled{opacity:.45;cursor:not-allowed;}",
    ".pisrp-toolbar{padding:12px 20px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;",
    "  background:#fff;border-bottom:1px solid #f0f0f0;}",
    ".pisrp-search{flex:1;min-width:180px;max-width:300px;padding:9px 12px;",
    "  border:1px solid #d1d5db;border-radius:9px;font-size:13px;}",
    ".pisrp-filter{padding:9px 10px;border:1px solid #d1d5db;border-radius:9px;",
    "  font-size:12.5px;font-family:inherit;background:#fff;color:#374151;}",
    ".pisrp-count{font-size:12px;color:#6b7280;}",
    ".pisrp-body{flex:1;overflow:auto;padding:16px 20px;}",
    ".pisrp-tbl-wrap{background:#fff;border-radius:12px;border:1px solid #eee;overflow:auto;}",
    "table.pisrp-tbl{border-collapse:collapse;width:100%;font-size:12.5px;}",
    "table.pisrp-tbl th,table.pisrp-tbl td{padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:left;white-space:nowrap;}",
    "table.pisrp-tbl th{background:#faf7f7;color:#7B1A2C;font-weight:700;position:sticky;top:0;z-index:1;}",
    "table.pisrp-tbl tbody tr:hover{background:#fdf6f7;}",
    ".pisrp-badge{font:700 10.5px system-ui,sans-serif;border-radius:999px;padding:3px 9px;display:inline-block;}",
    ".pisrp-badge.diajukan{background:#fef3c7;color:#92400e;}",
    ".pisrp-badge.disetujui{background:#dbeafe;color:#1d4ed8;}",
    ".pisrp-badge.dibayarkan{background:#dcfce7;color:#166534;}",
    ".pisrp-badge.otomatis{background:#f3f4f6;color:#6b7280;font-weight:400;}",
    ".pisrp-badge.plus{background:#dcfce7;color:#166534;} .pisrp-badge.minus{background:#fee2e2;color:#991b1b;}",
    ".pisrp-ab{border:none;background:none;cursor:pointer;font-size:12.5px;padding:3px 6px;border-radius:6px;}",
    ".pisrp-ab:hover{background:#f3f4f6;}",
    ".pisrp-empty{padding:40px;text-align:center;color:#9ca3af;font-size:13px;}",
    ".pisrp-modal-ov{position:fixed;inset:0;background:rgba(17,17,20,.5);z-index:9960;",
    "  display:none;align-items:flex-start;justify-content:center;padding:24px 16px;overflow-y:auto;}",
    ".pisrp-modal-ov.show{display:flex;}",
    ".pisrp-modal{background:#fff;border-radius:16px;width:100%;max-width:680px;",
    "  padding:22px 24px 24px;box-shadow:0 20px 50px rgba(0,0,0,.25);}",
    ".pisrp-modal h2{font-size:16px;font-weight:800;color:#7B1A2C;margin:0 0 4px;}",
    ".pisrp-modal .pisrp-msub{color:#6b7280;font-size:12px;margin-bottom:14px;}",
    ".pisrp-grp{margin-bottom:12px;border:1px solid #f0f0f0;border-radius:10px;padding:12px 14px;}",
    ".pisrp-grp h3{font-size:12px;font-weight:700;color:#a12238;margin:0 0 10px;text-transform:uppercase;letter-spacing:.02em;}",
    ".pisrp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;}",
    ".pisrp-f label{display:block;font-weight:600;font-size:11.5px;margin-bottom:4px;color:#374151;}",
    ".pisrp-f input,.pisrp-f select,.pisrp-f textarea{width:100%;box-sizing:border-box;",
    "  padding:7px 9px;border:1px solid #d1d5db;border-radius:7px;font-size:12.5px;font-family:inherit;}",
    ".pisrp-f input:disabled,.pisrp-f select:disabled,.pisrp-f textarea:disabled{background:#f9fafb;color:#9ca3af;}",
    ".pisrp-selisih-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;",
    "  padding:10px 14px;margin-top:8px;font-size:12.5px;}",
    ".pisrp-selisih-box .pisrp-selisih-val{font:700 16px system-ui,sans-serif;}",
    ".pisrp-selisih-box .pisrp-selisih-val.plus{color:#166534;} .pisrp-selisih-box .pisrp-selisih-val.minus{color:#991b1b;}",
    ".pisrp-status-trail{font-size:11px;color:#6b7280;margin-top:10px;line-height:1.7;}",
    ".pisrp-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;",
    "  position:sticky;bottom:0;background:#fff;padding-top:10px;}",
  ].join("\n");
  document.head.appendChild(style);

  // ── Overlay utama (daftar rapel) ──
  var overlay = document.createElement("div");
  overlay.className = "pisrp-ov";
  overlay.innerHTML =
    "<div class=\"pisrp-hdr\">" +
      "<div class=\"pisrp-hdr-title\"><h1>\uD83D\uDCB8 Rapel</h1>" +
        "<p class=\"pisrp-sub\">Koreksi selisih gaji antar periode. Bisa dibuat manual atau otomatis dari perubahan Data Query.</p></div>" +
      (function() { return isHO() ? "<button class=\"pisrp-btn pisrp-btn-primary\" data-act=\"add\">+ Rapel Baru</button>" : ""; })() +
      "<button class=\"pisrp-btn pisrp-btn-close\" data-act=\"close\">\u2715 Tutup</button>" +
    "</div>" +
    "<div class=\"pisrp-toolbar\">" +
      "<input type=\"text\" class=\"pisrp-search\" placeholder=\"Cari NIK / Nama / Periode\u2026\" />" +
      "<select class=\"pisrp-filter\" data-f=\"status\">" +
        "<option value=\"\">Semua Status</option>" +
        STATUS_OPTIONS.map(function(s) { return "<option value=\"" + s + "\">" + s + "</option>"; }).join("") +
      "</select>" +
      "<select class=\"pisrp-filter\" data-f=\"jenis\">" +
        "<option value=\"\">Semua Jenis</option>" +
        JENIS_OPTIONS.map(function(s) { return "<option value=\"" + s + "\">" + s + "</option>"; }).join("") +
      "</select>" +
      "<span class=\"pisrp-count\"></span>" +
    "</div>" +
    "<div class=\"pisrp-body\"><div class=\"pisrp-tbl-wrap\">" +
      "<table class=\"pisrp-tbl\"><thead><tr>" +
        "<th>NIK</th><th>Nama</th><th>Area</th><th>Periode Rapel</th>" +
        "<th>Jenis</th><th>Selisih</th><th>Status</th><th>Sumber</th><th>Aksi</th>" +
      "</tr></thead><tbody id=\"pisrp-tbody\"></tbody></table>" +
    "</div></div>";
  document.body.appendChild(overlay);

  var tbody = overlay.querySelector("#pisrp-tbody");
  var searchEl = overlay.querySelector(".pisrp-search");
  var countEl = overlay.querySelector(".pisrp-count");
  var filterEls = overlay.querySelectorAll(".pisrp-filter");
  var rows = [], filtered = [];

  if (overlay.querySelector("[data-act=\"close\"]"))
    overlay.querySelector("[data-act=\"close\"]").addEventListener("click", closeOverlay);
  if (overlay.querySelector("[data-act=\"add\"]"))
    overlay.querySelector("[data-act=\"add\"]").addEventListener("click", function() { openForm(null); });

  function applyFilter() {
    var q = (searchEl.value || "").toLowerCase().trim();
    var fStatus = overlay.querySelector("[data-f=\"status\"]").value;
    var fJenis = overlay.querySelector("[data-f=\"jenis\"]").value;
    filtered = rows.filter(function(r) {
      if (fStatus && r.status !== fStatus) return false;
      if (fJenis && r.jenis_selisih !== fJenis) return false;
      if (!q) return true;
      return (r.nik_karyawan || "").toLowerCase().includes(q) ||
             (r.nama_karyawan || "").toLowerCase().includes(q) ||
             (r.periode_rapel || "").includes(q);
    });
    renderRows();
  }
  searchEl.addEventListener("input", applyFilter);
  filterEls.forEach(function(el) { el.addEventListener("change", applyFilter); });

  function statusBadge(s) {
    var cls = { "Diajukan": "diajukan", "Disetujui": "disetujui", "Dibayarkan": "dibayarkan" }[s] || "diajukan";
    return "<span class=\"pisrp-badge " + cls + "\">" + esc(s) + "</span>";
  }
  function selisihBadge(v) {
    var n = Number(v) || 0;
    var cls = n >= 0 ? "plus" : "minus";
    var sign = n >= 0 ? "+" : "-";
    return "<span class=\"pisrp-badge " + cls + "\">" + sign + "Rp " + Math.round(Math.abs(n)).toLocaleString("id-ID") + "</span>";
  }

  function renderRows() {
    if (!filtered.length) {
      tbody.innerHTML = "<tr><td colspan=\"9\"><div class=\"pisrp-empty\">" +
        (rows.length ? "Tidak ada rapel yang cocok dengan filter." : "Belum ada data rapel.") +
        "</div></td></tr>";
    } else {
      tbody.innerHTML = filtered.map(function(r) {
        var otomatis = r.sumber === "otomatis-dataquery"
          ? "<span class=\"pisrp-badge otomatis\">\uD83E\uDD16 Otomatis</span>" : "Manual";
        var actions = "<button class=\"pisrp-ab\" data-id=\"" + r.id + "\" data-act=\"view\" title=\"Lihat/Edit\">" +
          (isHO() ? "\u270F\uFE0F" : "\uD83D\uDC41\uFE0F") + "</button>";
        if (isMasterAdmin() && r.status !== "Dibayarkan") {
          actions += " <button class=\"pisrp-ab\" data-id=\"" + r.id + "\" data-act=\"del\" title=\"Hapus\" style=\"color:#b91c1c;\">\uD83D\uDDD1\uFE0F</button>";
        }
        return "<tr>" +
          "<td>" + esc(r.nik_karyawan || "-") + "</td>" +
          "<td>" + esc(r.nama_karyawan || "-") + "</td>" +
          "<td>" + esc(r.area_tugas || "-") + "</td>" +
          "<td>" + esc(fmtBulan(r.periode_rapel)) + "</td>" +
          "<td>" + esc(r.jenis_selisih || "-") + "</td>" +
          "<td>" + selisihBadge(r.nominal_selisih) + "</td>" +
          "<td>" + statusBadge(r.status) + "</td>" +
          "<td>" + otomatis + "</td>" +
          "<td>" + actions + "</td>" +
        "</tr>";
      }).join("");
      tbody.querySelectorAll("[data-act=\"view\"]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var rec = rows.find(function(r) { return String(r.id) === btn.dataset.id; });
          if (rec) openForm(rec);
        });
      });
      tbody.querySelectorAll("[data-act=\"del\"]").forEach(function(btn) {
        btn.addEventListener("click", async function() {
          var rec = rows.find(function(r) { return String(r.id) === btn.dataset.id; });
          if (!rec) return;
          if (!window.confirm("Hapus rapel ini?\n\nNIK: " + (rec.nik_karyawan || "-") + "\nPeriode: " + fmtBulan(rec.periode_rapel) + "\nSelisih: " + fmtRp(rec.nominal_selisih))) return;
          var res = await api("DELETE", ENT("PayrollRapel", btn.dataset.id));
          if (!res.ok) { toast((res.data && res.data.error) || "Gagal menghapus.", "fail"); return; }
          toast("Rapel dihapus.", "ok");
          refresh();
        });
      });
    }
    countEl.textContent = filtered.length + " dari " + rows.length + " rapel";
  }

  async function refresh() {
    tbody.innerHTML = "<tr><td colspan=\"9\"><div class=\"pisrp-empty\">Memuat\u2026</div></td></tr>";
    var r = await api("GET", ENT("PayrollRapel") + "?limit=2000&sort=-created_date");
    rows = (r.ok && Array.isArray(r.data)) ? r.data : [];
    applyFilter();
  }

  function openOverlay() {
    if (!canView()) return;
    overlay.classList.add("show");
    refresh();
  }
  function closeOverlay() { overlay.classList.remove("show"); }

  // ── Modal form ──
  var modalOv = document.createElement("div");
  modalOv.className = "pisrp-modal-ov";
  document.body.appendChild(modalOv);
  modalOv.addEventListener("click", function(e) { if (e.target === modalOv) closeForm(); });

  var editing = null;

  function closeForm() { modalOv.classList.remove("show"); editing = null; modalOv.innerHTML = ""; }

  function openForm(rec) {
    editing = rec;
    var isNew = !rec;
    var locked = rec && rec.status === "Dibayarkan";
    var canApprove = isHO() && rec && rec.status === "Diajukan";
    var canPay = isHO() && rec && rec.status === "Disetujui";

    var trail = "";
    if (rec) {
      if (rec.dibuat_oleh) trail += "Dibuat oleh: " + esc(rec.dibuat_oleh) + "<br>";
      if (rec.disetujui_oleh) trail += "Disetujui oleh: " + esc(rec.disetujui_oleh) + " (" + fmtDate(rec.tanggal_disetujui) + ")<br>";
      if (rec.dibayarkan_oleh) trail += "Dibayarkan oleh: " + esc(rec.dibayarkan_oleh) + " (" + fmtDate(rec.tanggal_dibayarkan) + ")<br>";
    }

    var selisihVal = rec ? Number(rec.nominal_selisih) || 0 : 0;
    var selisihCls = selisihVal >= 0 ? "plus" : "minus";
    var selisihSign = selisihVal >= 0 ? "Kurang Bayar +" : "Lebih Bayar -";

    modalOv.innerHTML =
      "<div class=\"pisrp-modal\">" +
        "<h2>" + (isNew ? "+ Rapel Baru" : "\uD83D\uDCB8 Detail Rapel") + "</h2>" +
        "<p class=\"pisrp-msub\">Koreksi selisih gaji antar periode. Status: " +
          (rec ? statusBadge(rec.status) : statusBadge("Diajukan")) + "</p>" +

        "<div class=\"pisrp-grp\">" +
          "<h3>Data Karyawan</h3>" +
          "<div class=\"pisrp-grid\">" +
            "<div class=\"pisrp-f\"><label>NIK Karyawan</label>" +
              "<input id=\"pisrp-nik\" type=\"text\" value=\"" + esc(rec && rec.nik_karyawan || "") + "\" " + (locked ? "disabled" : "") + " placeholder=\"Ketik NIK\" /></div>" +
            "<div class=\"pisrp-f\"><label>Nama Karyawan</label>" +
              "<input id=\"pisrp-nama\" type=\"text\" value=\"" + esc(rec && rec.nama_karyawan || "") + "\" " + (locked ? "disabled" : "") + " /></div>" +
            "<div class=\"pisrp-f\"><label>Area Tugas</label>" +
              "<input id=\"pisrp-area\" type=\"text\" value=\"" + esc(rec && rec.area_tugas || "") + "\" " + (locked ? "disabled" : "") + " /></div>" +
            "<div class=\"pisrp-f\"><label>Jabatan</label>" +
              "<input id=\"pisrp-jab\" type=\"text\" value=\"" + esc(rec && rec.jabatan || "") + "\" " + (locked ? "disabled" : "") + " /></div>" +
          "</div>" +
        "</div>" +

        "<div class=\"pisrp-grp\">" +
          "<h3>Rincian Rapel</h3>" +
          "<div class=\"pisrp-grid\">" +
            "<div class=\"pisrp-f\"><label>Periode Rapel (bulan slip yang dikoreksi)</label>" +
              "<input id=\"pisrp-periode\" type=\"month\" value=\"" + esc(rec && rec.periode_rapel || "") + "\" " + (locked ? "disabled" : "") + " /></div>" +
            "<div class=\"pisrp-f\"><label>Jenis Selisih</label>" +
              "<select id=\"pisrp-jenis\" " + (locked ? "disabled" : "") + ">" +
                JENIS_OPTIONS.map(function(j) { return "<option value=\"" + j + "\"" + (rec && rec.jenis_selisih === j ? " selected" : "") + ">" + j + "</option>"; }).join("") +
              "</select></div>" +
            "<div class=\"pisrp-f\"><label>Nominal Selisih (Rp, negatif = lebih bayar)</label>" +
              "<input id=\"pisrp-nominal\" type=\"number\" value=\"" + esc(rec && rec.nominal_selisih || "") + "\" " + (locked ? "disabled" : "") + " /></div>" +
            "<div class=\"pisrp-f\"><label>Dibayarkan Pada Periode</label>" +
              "<input id=\"pisrp-bayar-pd\" type=\"month\" value=\"" + esc(rec && rec.dibayarkan_pada_periode || "") + "\" " + (locked ? "disabled" : "") + " /></div>" +
          "</div>" +

          (rec && rec.gaji_lama != null ? ("<div class=\"pisrp-selisih-box\">" +
            "Gaji Lama: <strong>" + fmtRp(rec.gaji_lama) + "</strong> &nbsp;→&nbsp; " +
            "Gaji Baru: <strong>" + fmtRp(rec.gaji_baru) + "</strong><br>" +
            "<span class=\"pisrp-selisih-val " + selisihCls + "\">" + selisihSign + fmtRp(Math.abs(selisihVal)) + "</span>" +
          "</div>") : "") +

          "<div class=\"pisrp-f\" style=\"margin-top:10px;\"><label>Keterangan</label>" +
            "<textarea id=\"pisrp-ket\" rows=\"3\" " + (locked ? "disabled" : "") + ">" + esc(rec && rec.keterangan || "") + "</textarea></div>" +
        "</div>" +

        (trail ? "<div class=\"pisrp-status-trail\">" + trail + "</div>" : "") +

        "<div class=\"pisrp-modal-actions\">" +
          "<button class=\"pisrp-btn pisrp-btn-outline\" id=\"pisrp-modal-batal\">Tutup</button>" +
          (canApprove ? "<button class=\"pisrp-btn\" id=\"pisrp-setujui\" style=\"background:#1d4ed8;\">✅ Setujui</button>" : "") +
          (canPay ? "<button class=\"pisrp-btn\" id=\"pisrp-bayarkan\" style=\"background:#166534;\">💰 Tandai Dibayarkan</button>" : "") +
          (isHO() && !locked ? "<button class=\"pisrp-btn pisrp-btn-primary\" id=\"pisrp-simpan\">" + (isNew ? "Simpan" : "Simpan Perubahan") + "</button>" : "") +
        "</div>" +
      "</div>";

    modalOv.classList.add("show");
    modalOv.querySelector("#pisrp-modal-batal").addEventListener("click", closeForm);
    var simpanBtn = modalOv.querySelector("#pisrp-simpan");
    if (simpanBtn) simpanBtn.addEventListener("click", saveForm);
    var setujuiBtn = modalOv.querySelector("#pisrp-setujui");
    if (setujuiBtn) setujuiBtn.addEventListener("click", function() { changeStatus("Disetujui"); });
    var bayarBtn = modalOv.querySelector("#pisrp-bayarkan");
    if (bayarBtn) bayarBtn.addEventListener("click", function() { changeStatus("Dibayarkan"); });
  }

  async function saveForm() {
    var payload = {
      nik_karyawan: modalOv.querySelector("#pisrp-nik").value.trim(),
      nama_karyawan: modalOv.querySelector("#pisrp-nama").value.trim(),
      area_tugas: modalOv.querySelector("#pisrp-area").value.trim(),
      jabatan: modalOv.querySelector("#pisrp-jab").value.trim(),
      periode_rapel: modalOv.querySelector("#pisrp-periode").value,
      jenis_selisih: modalOv.querySelector("#pisrp-jenis").value,
      nominal_selisih: Number(modalOv.querySelector("#pisrp-nominal").value) || 0,
      dibayarkan_pada_periode: modalOv.querySelector("#pisrp-bayar-pd").value,
      keterangan: modalOv.querySelector("#pisrp-ket").value.trim(),
    };
    if (!payload.nik_karyawan) return toast("NIK Karyawan wajib diisi.", "fail");
    if (!payload.periode_rapel) return toast("Periode Rapel wajib diisi.", "fail");
    if (!payload.nominal_selisih) return toast("Nominal Selisih wajib diisi (boleh negatif).", "fail");

    var simpanBtn = modalOv.querySelector("#pisrp-simpan");
    if (simpanBtn) { simpanBtn.disabled = true; simpanBtn.textContent = "Menyimpan\u2026"; }
    var res = editing
      ? await api("PUT", ENT("PayrollRapel", editing.id), payload)
      : await api("POST", ENT("PayrollRapel"), payload);
    if (simpanBtn) { simpanBtn.disabled = false; simpanBtn.textContent = editing ? "Simpan Perubahan" : "Simpan"; }
    if (!res.ok || (res.data && res.data.error)) { toast((res.data && res.data.error) || "Gagal menyimpan.", "fail"); return; }
    toast(editing ? "Rapel diperbarui." : "Rapel baru ditambahkan.", "ok");
    closeForm(); refresh();
  }

  async function changeStatus(newStatus) {
    if (!editing) return;
    var konfirmasi = newStatus === "Dibayarkan"
      ? "Tandai rapel ini sebagai Dibayarkan?\n\nSetelah Dibayarkan, rapel tidak bisa dihapus untuk menjaga jejak audit."
      : "Setujui rapel ini?";
    if (!window.confirm(konfirmasi)) return;
    var res = await api("PUT", ENT("PayrollRapel", editing.id), { status: newStatus });
    if (!res.ok || (res.data && res.data.error)) { toast((res.data && res.data.error) || "Gagal mengubah status.", "fail"); return; }
    toast("Status rapel diubah ke " + newStatus + ".", "ok");
    closeForm(); refresh();
  }

  document.addEventListener("keydown", function(e) {
    if (e.key !== "Escape") return;
    if (modalOv.classList.contains("show")) closeForm();
    else if (overlay.classList.contains("show")) closeOverlay();
  });

  // ── Injeksi tab "📊 Rapel" setelah tab "📑 Kontrak Kerja" ──
  function findAnchorTab() {
    return document.querySelector("[data-pisac-tab=\"1\"]") ||
           document.querySelector("[data-pisdq-tab=\"1\"]") ||
           (function() {
             var candidates = Array.from(document.querySelectorAll("button,div,span,a"));
             return candidates.find(function(el) {
               return el.children.length === 0 && (el.textContent || "").trim() === "Ringkasan Keuangan";
             }) || null;
           })();
  }

  function injectTab() {
    if (!canView()) return;
    var anchor = findAnchorTab();
    if (!anchor) return;
    var parent = anchor.parentElement;
    if (!parent || parent.querySelector("[data-pisrp-tab=\"1\"]")) return;
    var clone = anchor.cloneNode(true);
    clone.removeAttribute("data-pisac-tab");
    clone.removeAttribute("data-pisdq-tab");
    clone.setAttribute("data-pisrp-tab", "1");
    clone.textContent = "\uD83D\uDCB8 Rapel";
    clone.style.cursor = "pointer";
    clone.addEventListener("click", function(e) { e.preventDefault(); e.stopPropagation(); openOverlay(); });
    anchor.insertAdjacentElement("afterend", clone);
  }

  injectTab();
  setInterval(injectTab, 1200);
  new MutationObserver(function() { injectTab(); }).observe(document.body, { childList: true, subtree: true });
})();
