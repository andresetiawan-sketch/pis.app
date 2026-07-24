/**
 * PIS FIXES — lapisan tambahan (tidak menyentuh bundle React index-*.js).
 *
 * Kenapa lapisan terpisah, bukan edit langsung ke tombol asli?
 * Source React asli (folder src/, file .jsx) TIDAK tersedia di paket ini —
 * yang ada hanya hasil build yang sudah diminify (index-*.js, 1 baris
 * per chunk, nama variabel diacak). Mengedit file itu langsung berisiko
 * tinggi merusak seluruh aplikasi karena tidak ada cara aman untuk
 * memverifikasi perubahan tanpa source map/source asli.
 *
 * Pendekatan di file ini sama seperti pis-enhancements.js yang sudah ada:
 * bekerja di atas DOM yang sudah dirender + panggil API backend langsung.
 *
 * Berisi:
 *  A) Perbaikan tombol "Generate Jadwal Bulanan Otomatis" (macet / tidak
 *     melakukan apa-apa) + perbaikan scroll halaman Jadwal Shift.
 *  B) Tambahan pilihan "Regu Acak" pada alat Generate.
 *  C) Filter jadwal berbasis PERIODE (tanggal mulai–selesai), pengganti
 *     filter bulan/tahun.
 *  D) Alat "Kelola Template Patroli" (untuk halaman Template Patroli yang
 *     tombol input-nya tidak tampak / kosong).
 */
(function () {
  "use strict";

  // ============================================================
  // Helpers (mandiri, tidak bergantung pada pis-enhancements.js)
  // ============================================================
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
    const role = String(emp?.role || emp?.jabatan || "").toLowerCase();
    return role.includes("master admin") || role.includes("admin");
  }
  async function api(method, path, body) {
    const token = getToken();
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { "X-Employee-Token": token } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let data = null;
      try { data = await res.json(); } catch {}
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      console.error("PIS FIXES: gagal menghubungi server", method, path, err);
      return { ok: false, status: 0, data: { error: "Tidak bisa menghubungi server (jaringan bermasalah atau diblokir sementara). Coba lagi beberapa saat lagi." }, networkError: true };
    }
  }
  const ENT = (path) => `/api/apps/entities/${path}`;

  // Jeda kecil antar-request saat mengirim banyak panggilan API berturut-turut
  // (generate jadwal, rotasi otomatis, hapus semua, dsb), supaya tidak
  // terkirim rentetan cepat yang bisa kena rate-limit (mis. Cloudflare Error 1015).
  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
  const API_THROTTLE_MS = 180;

  function showToast(message, kind) {
    const el = document.createElement("div");
    el.className = "pisfx-toast " + (kind || "ok");
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  // ============================================================
  // Styles
  // ============================================================
  const style = document.createElement("style");
  style.textContent = `
    .pisfx-toast {
      position: fixed; top: 16px; right: 16px; z-index: 100000;
      padding: 12px 16px; border-radius: 10px; font: 600 13px system-ui, sans-serif;
      box-shadow: 0 6px 18px rgba(0,0,0,.25); max-width: 320px;
    }
    .pisfx-toast.ok { background: #1a7b2c; color: #fff; }
    .pisfx-toast.fail { background: #7b1a1a; color: #fff; }

    .pisfx-fab {
      position: fixed; z-index: 9990; right: 18px; background: #7B1A2C; color: #fff;
      border: none; border-radius: 24px; padding: 12px 16px; font: 700 13px system-ui, sans-serif;
      box-shadow: 0 6px 16px rgba(0,0,0,.25); cursor: pointer;
    }
    #pisfx-shift-fab { bottom: 160px; }

    /* Tombol "Kelola Template Patroli" — ditanam sebaris tepat setelah tombol
       "Kembali" di halaman Template E-Patroli (bukan lagi tombol mengambang). */
    .pisfx-inline-btn {
      display: inline-flex; align-items: center; gap: 6px; vertical-align: middle;
      margin-left: 8px; height: 34px; padding: 0 12px; box-sizing: border-box;
      border-radius: 8px; border: 1px solid #d9a441; background: #fff8ec; color: #92640c;
      font: 600 12.5px system-ui, sans-serif; line-height: 1; cursor: pointer;
      transition: background .15s ease, box-shadow .15s ease; white-space: nowrap;
    }
    .pisfx-inline-btn:hover { background: #fdecc8; }
    .pisfx-inline-btn:active { background: #fbe2ab; }
    .pisfx-inline-btn svg { flex-shrink: 0; }

    .pisfx-modal-overlay {
      display: none; position: fixed; inset: 0; z-index: 99998;
      background: rgba(0,0,0,.45); align-items: center; justify-content: center; padding: 16px;
    }
    .pisfx-modal-overlay.show { display: flex; }
    .pisfx-modal {
      background: #fff; border-radius: 14px; width: 100%; max-width: 640px;
      max-height: 88vh; overflow-y: auto; padding: 20px; font: 13px system-ui, sans-serif; color: #222;
    }
    .pisfx-modal h2 { color: #7B1A2C; font-size: 17px; margin: 0 0 4px; }
    .pisfx-modal h3 { color: #7B1A2C; font-size: 14px; margin: 18px 0 8px; }
    .pisfx-modal .pisfx-sub { color: #777; font-size: 12px; margin-bottom: 14px; }
    .pisfx-modal label { display:block; font-size:12px; font-weight:600; color:#444; margin: 10px 0 4px; }
    .pisfx-modal select, .pisfx-modal input[type=text], .pisfx-modal input[type=number],
    .pisfx-modal input[type=date], .pisfx-modal textarea {
      width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; box-sizing: border-box;
    }
    .pisfx-row { display: flex; gap: 10px; }
    .pisfx-row > * { flex: 1; }
    .pisfx-tabs { display: flex; gap: 6px; margin-bottom: 10px; border-bottom: 1px solid #eee; }
    .pisfx-tab { padding: 8px 12px; cursor: pointer; font-weight: 700; color: #999; border-bottom: 3px solid transparent; }
    .pisfx-tab.active { color: #7B1A2C; border-color: #7B1A2C; }
    .pisfx-pane { display: none; }
    .pisfx-pane.active { display: block; }
    .pisfx-btn {
      background: #7B1A2C; color: #fff; border: none; border-radius: 8px; padding: 10px 14px;
      font-weight: 700; cursor: pointer; font-size: 13px;
    }
    .pisfx-btn.secondary { background: #eee; color: #333; }
    .pisfx-btn.danger { background: #7b1a1a; }
    .pisfx-actions { display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end; }
    .pisfx-list { margin-top: 10px; border: 1px solid #eee; border-radius: 8px; overflow: hidden; }
    .pisfx-list table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .pisfx-list th, .pisfx-list td { padding: 7px 8px; border-bottom: 1px solid #f2f2f2; text-align: left; }
    .pisfx-list th { background: #faf5f6; color: #7B1A2C; }
    .pisfx-checklist { max-height: 160px; overflow-y: auto; border: 1px solid #ddd; border-radius: 8px; padding: 6px; }
    .pisfx-checklist label { font-weight: 400; display:flex; align-items:center; gap:6px; margin:4px 0; }
    .pisfx-empty { color: #999; font-style: italic; padding: 10px 0; }
    .pisfx-close { position: absolute; top: 14px; right: 16px; background: none; border: none; font-size: 18px; cursor: pointer; color:#999; }
  `;
  document.head.appendChild(style);

  // ============================================================
  // A) Perbaikan scroll — jaga agar konten selalu bisa discroll.
  // Berlaku umum (bukan cuma halaman jadwal) karena bug "layar tidak bisa
  // discroll" biasanya berasal dari container global yang overflow:hidden.
  // ============================================================
  function fixStuckScrolling() {
    const html = document.documentElement, body = document.body;
    if (getComputedStyle(html).overflowY === "hidden") html.style.overflowY = "auto";
    if (getComputedStyle(body).overflowY === "hidden") body.style.overflowY = "auto";
    html.style.height = "auto";
    body.style.minHeight = "100vh";

    // Cari container besar (kemungkinan wrapper halaman) yang overflow:hidden
    // padahal isinya lebih tinggi dari tingginya sendiri -> buka overflow-nya.
    const candidates = document.querySelectorAll('#root, #root > div, [class*="layout" i], [class*="content" i], main');
    candidates.forEach((el) => {
      const cs = getComputedStyle(el);
      if ((cs.overflowY === "hidden" || cs.overflow === "hidden") && el.scrollHeight > el.clientHeight + 4) {
        el.style.overflowY = "auto";
      }
    });
  }
  setInterval(fixStuckScrolling, 1200);
  fixStuckScrolling();

  // ============================================================
  // Deteksi halaman
  // ============================================================
  function isShiftPage() {
    return /jadwal|shift/i.test(window.location.pathname) ||
      /jadwal shift/i.test(document.title) ||
      !!Array.from(document.querySelectorAll("h1,h2,h3")).find((h) => /jadwal shift/i.test(h.textContent || ""));
  }
  function isPatrolTemplateAdminPage() {
    return /EPatrolTemplateAdmin/i.test(window.location.pathname) ||
      !!Array.from(document.querySelectorAll("h1,h2,h3")).find((h) => /template e-?patroli/i.test(h.textContent || ""));
  }
  function findKembaliButton() {
    return Array.from(document.querySelectorAll("button")).find((b) => /^\s*kembali\s*$/i.test((b.textContent || "").trim()));
  }

  // ============================================================
  // Intersep tombol asli "Generate ... Otomatis" yang macet — dialihkan
  // untuk membuka alat Generate kami (yang benar-benar berfungsi).
  // ============================================================
  document.addEventListener("click", function (e) {
    const btn = e.target.closest && e.target.closest("button, .btn, [role='button']");
    if (!btn) return;
    const txt = (btn.textContent || "").toLowerCase();
    if (txt.includes("generate") && (txt.includes("jadwal") || txt.includes("otomatis"))) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openShiftTool("generate");
    }
  }, true); // capture: intersep sebelum handler asli (yang macet) sempat jalan

  // ============================================================
  // Tombol mengambang
  // ============================================================
  function ensureFab(id, label, onClick) {
    let fab = document.getElementById(id);
    if (fab) return fab;
    fab = document.createElement("button");
    fab.id = id;
    fab.className = "pisfx-fab";
    fab.textContent = label;
    fab.addEventListener("click", onClick);
    document.body.appendChild(fab);
    return fab;
  }
  function removeEl(id) { const el = document.getElementById(id); if (el) el.remove(); }

  function refreshFabs() {
    if (isAdminEmployee() && isShiftPage()) {
      ensureFab("pisfx-shift-fab", "🗓️ Alat Jadwal Shift", () => openShiftTool());
    } else {
      removeEl("pisfx-shift-fab");
    }
  }

  // Tombol "Kelola Template Patroli" ditanam sebaris tepat setelah tombol
  // "Kembali" di halaman Template E-Patroli — bukan lagi tombol mengambang.
  // Dipanggil ulang berkala karena React me-render ulang DOM halaman ini
  // (elemen yang kita sisipkan bisa hilang saat itu terjadi).
  function injectPatrolInlineButton() {
    if (!isAdminEmployee() || !isPatrolTemplateAdminPage()) {
      removeEl("pisfx-patrol-inline-btn");
      return;
    }
    const kembali = findKembaliButton();
    if (!kembali || !kembali.parentNode) return;

    let btn = document.getElementById("pisfx-patrol-inline-btn");
    if (btn) {
      if (btn.previousElementSibling !== kembali) kembali.insertAdjacentElement("afterend", btn);
      return;
    }

    btn = document.createElement("button");
    btn.id = "pisfx-patrol-inline-btn";
    btn.type = "button";
    btn.className = "pisfx-inline-btn";
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4.5 8-11V5l-8-3-8 3v6c0 6.5 8 11 8 11Z"/></svg>Kelola Template (Alat Cadangan)`;
    btn.addEventListener("click", openPatrolTool);
    kembali.insertAdjacentElement("afterend", btn);
  }

  function refreshAll() {
    refreshFabs();
    injectPatrolInlineButton();
  }
  new MutationObserver(refreshAll).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", refreshAll);
  setInterval(refreshAll, 1500);
  refreshAll();

  // ============================================================
  // Modal generik
  // ============================================================
  function buildModalShell(id, titleHtml) {
    let overlay = document.getElementById(id);
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "pisfx-modal-overlay";
    overlay.innerHTML = `<div class="pisfx-modal" style="position:relative;">
      <button class="pisfx-close" data-close>✕</button>
      ${titleHtml}
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("show"); });
    overlay.querySelector("[data-close]").addEventListener("click", () => overlay.classList.remove("show"));
    return overlay;
  }

  // ============================================================
  // B/C) ALAT JADWAL SHIFT — Generate Otomatis (+ Regu Acak) & Lihat per Periode
  // ============================================================
  const SIKLUS_6_2 = ["P", "P", "S", "S", "M", "M", "L", "L"];
  const JAM_SESI = { P: { mulai: "07:00", selesai: "15:00" }, S: { mulai: "15:00", selesai: "23:00" }, M: { mulai: "23:00", selesai: "07:00" } };

  function tanggalDalamBulan(tahun, bulan) {
    return new Date(tahun, bulan, 0).getDate();
  }
  function generateTanggalSiklus(tahun, bulan, offset) {
    const jumlah = tanggalDalamBulan(tahun, bulan);
    const out = [];
    for (let day = 1; day <= jumlah; day++) {
      const sesi = SIKLUS_6_2[(offset + day - 1) % 8];
      if (sesi === "L") continue;
      out.push({
        tanggal: `${tahun}-${String(bulan).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        jam_mulai: JAM_SESI[sesi].mulai, jam_selesai: JAM_SESI[sesi].selesai,
      });
    }
    return out;
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  let shiftToolBuilt = false;
  let areaListCache = null, employeeListCache = null;

  async function loadAreaAndEmployeeOptions(force) {
    if (!force && areaListCache && employeeListCache) return;
    const [areaRes, empRes] = await Promise.all([
      api("GET", ENT("AreaProject?limit=500")),
      api("GET", ENT("Employee?limit=1000")),
    ]);
    areaListCache = areaRes.ok && Array.isArray(areaRes.data) ? areaRes.data : [];
    employeeListCache = empRes.ok && Array.isArray(empRes.data) ? empRes.data : [];
  }

  function areaOptionsHtml() {
    return (areaListCache || []).map((a) => {
      const nama = a.nama_area || a.nama_proyek || a.nama || "(tanpa nama)";
      return `<option value="${nama}">${nama}</option>`;
    }).join("") || `<option value="">(Belum ada data Area/Proyek)</option>`;
  }

  function refreshEmployeeChecklist(container, areaValue) {
    const list = (employeeListCache || []).filter((e) => !areaValue || e.area_tugas === areaValue);
    if (!list.length) { container.innerHTML = `<div class="pisfx-empty">Tidak ada karyawan pada area ini.</div>`; return; }
    container.innerHTML = list.map((e) => `
      <label><input type="checkbox" value="${e.nik_karyawan}"> ${e.nama_lengkap || e.nik_karyawan} (${e.nik_karyawan})</label>
    `).join("");
  }

  async function openShiftTool(initialTab) {
    const overlay = buildModalShell("pisfx-shift-modal", shiftToolBuilt ? "" : `
        <h2>🗓️ Alat Bantu Jadwal Shift</h2>
        <div class="pisfx-sub">Perbaikan tombol Generate Otomatis yang sebelumnya macet, tambahan pilihan "Regu Acak", dan filter berbasis periode tanggal.</div>
        <div class="pisfx-tabs">
          <div class="pisfx-tab active" data-tab="generate">Generate Otomatis</div>
          <div class="pisfx-tab" data-tab="rotasi">Rotasi Otomatis (Semua Regu)</div>
          <div class="pisfx-tab" data-tab="lihat">Lihat Jadwal (Periode)</div>
        </div>

        <div class="pisfx-pane active" data-pane="generate">
          <label>Area / Proyek</label>
          <select id="pisfx-gen-area"></select>

          <label>Regu</label>
          <select id="pisfx-gen-regu">
            <option value="Regu A">Regu A</option>
            <option value="Regu B">Regu B</option>
            <option value="Regu C">Regu C</option>
            <option value="Regu D">Regu D</option>
            <option value="Non Regu">Non Regu</option>
            <option value="Regu Acak">🎲 Regu Acak (rotasi diacak per karyawan)</option>
          </select>

          <div class="pisfx-row">
            <div>
              <label>Bulan</label>
              <select id="pisfx-gen-bulan">
                ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}
              </select>
            </div>
            <div>
              <label>Tahun</label>
              <input type="number" id="pisfx-gen-tahun" value="${new Date().getFullYear()}">
            </div>
            <div>
              <label>Mulai Siklus (hari ke-)</label>
              <select id="pisfx-gen-offset">
                ${Array.from({ length: 8 }, (_, i) => `<option value="${i}">${i}</option>`).join("")}
              </select>
            </div>
          </div>

          <label>Pilih Karyawan</label>
          <div id="pisfx-gen-employees" class="pisfx-checklist"><div class="pisfx-empty">Memuat...</div></div>

          <label style="margin-top:10px;">Catatan (opsional)</label>
          <input type="text" id="pisfx-gen-catatan" placeholder="Catatan jadwal">

          <div id="pisfx-gen-result" style="margin-top:10px;font-size:12.5px;"></div>
          <div class="pisfx-actions">
            <button class="pisfx-btn secondary" data-close>Tutup</button>
            <button class="pisfx-btn" id="pisfx-gen-submit">Generate &amp; Simpan</button>
          </div>
        </div>

        <div class="pisfx-pane" data-pane="rotasi">
          <div class="pisfx-sub">Generate jadwal untuk SEMUA Regu di satu Area sekaligus, saling bergantian (rotasi), berdasarkan data Regu yang sudah diatur di "Kelola Regu". Shift 12 jam: Pagi 06:00–18:00, Malam 18:00–06:00.</div>
          <label>Area / Proyek</label>
          <select id="pisfx-rot-area"></select>

          <div class="pisfx-row">
            <div>
              <label>Periode Mulai</label>
              <input type="date" id="pisfx-rot-start">
            </div>
            <div>
              <label>Jumlah Hari</label>
              <input type="number" id="pisfx-rot-hari" value="30" min="1" max="90">
            </div>
          </div>

          <div id="pisfx-rot-regu-info" style="margin-top:10px;font-size:12.5px;color:#555;"></div>

          <label style="margin-top:10px;">Catatan (opsional)</label>
          <input type="text" id="pisfx-rot-catatan" placeholder="Catatan jadwal">

          <div id="pisfx-rot-result" style="margin-top:10px;font-size:12.5px;"></div>
          <div class="pisfx-actions">
            <button class="pisfx-btn secondary" data-close>Tutup</button>
            <button class="pisfx-btn" id="pisfx-rot-submit">Generate Rotasi &amp; Simpan</button>
          </div>
        </div>

        <div class="pisfx-pane" data-pane="lihat">
          <label>Area / Proyek</label>
          <select id="pisfx-view-area"></select>
          <label>Regu (opsional)</label>
          <select id="pisfx-view-regu">
            <option value="">Semua Regu</option>
            <option value="Regu A">Regu A</option>
            <option value="Regu B">Regu B</option>
            <option value="Regu C">Regu C</option>
            <option value="Regu D">Regu D</option>
            <option value="Non Regu">Non Regu</option>
            <option value="Regu Acak">Regu Acak</option>
          </select>
          <div class="pisfx-row">
            <div><label>Periode Mulai</label><input type="date" id="pisfx-view-start"></div>
            <div><label>Periode Selesai</label><input type="date" id="pisfx-view-end"></div>
          </div>
          <div class="pisfx-actions" style="justify-content:flex-start;">
            <button class="pisfx-btn" id="pisfx-view-submit">Tampilkan</button>
          </div>
          <div id="pisfx-view-list" class="pisfx-list"></div>
        </div>
      `);

    // Selalu tampilkan modal duluan (bahkan kalau langkah di bawah gagal),
    // supaya pengguna selalu dapat feedback visual — tidak pernah "diam saja".
    overlay.classList.add("show");
    if (initialTab) {
      overlay.querySelectorAll(".pisfx-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === initialTab));
      overlay.querySelectorAll(".pisfx-pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === initialTab));
    }

    try {
      if (!shiftToolBuilt) {
        shiftToolBuilt = true;

        overlay.querySelectorAll(".pisfx-tab").forEach((tab) => {
          tab.addEventListener("click", () => {
            overlay.querySelectorAll(".pisfx-tab").forEach((t) => t.classList.remove("active"));
            overlay.querySelectorAll(".pisfx-pane").forEach((p) => p.classList.remove("active"));
            tab.classList.add("active");
            overlay.querySelector(`.pisfx-pane[data-pane="${tab.dataset.tab}"]`).classList.add("active");
          });
        });

        await loadAreaAndEmployeeOptions(true);
        const genArea = overlay.querySelector("#pisfx-gen-area");
        const viewArea = overlay.querySelector("#pisfx-view-area");
        const rotArea = overlay.querySelector("#pisfx-rot-area");
        genArea.innerHTML = areaOptionsHtml();
        viewArea.innerHTML = `<option value="">Semua Area</option>` + areaOptionsHtml();
        rotArea.innerHTML = areaOptionsHtml();
        refreshEmployeeChecklist(overlay.querySelector("#pisfx-gen-employees"), genArea.value);
        genArea.addEventListener("change", () => refreshEmployeeChecklist(overlay.querySelector("#pisfx-gen-employees"), genArea.value));
        rotArea.addEventListener("change", () => refreshRotasiReguInfo(rotArea.value));

        overlay.querySelector("#pisfx-gen-submit").addEventListener("click", submitGenerate);
        overlay.querySelector("#pisfx-view-submit").addEventListener("click", submitViewPeriode);
        overlay.querySelector("#pisfx-rot-submit").addEventListener("click", submitRotasiOtomatis);
        if (rotArea.value) refreshRotasiReguInfo(rotArea.value);
      } else {
        await loadAreaAndEmployeeOptions(false);
        const rotArea = overlay.querySelector("#pisfx-rot-area");
        if (rotArea && rotArea.value) refreshRotasiReguInfo(rotArea.value);
      }
    } catch (err) {
      console.error("PIS FIXES: gagal membuka Alat Jadwal Shift", err);
      showToast("Sebagian data gagal dimuat (jaringan bermasalah). Coba tutup lalu buka lagi alat ini.", "fail");
    }
  }

  // Menyamakan field "regu" pada profil karyawan dengan regu yang dipilih saat
  // generate, supaya kolom REGU, filter Regu, dan urutan alfabet di halaman
  // "Jadwal Shift Visual (Excel-Style)" (yang membaca Employee.regu, bukan
  // ShiftSchedule.regu) ikut ter-update — sebelumnya alat ini hanya menulis ke
  // ShiftSchedule sehingga tidak pernah terlihat tersambung ke tampilan visual.
  async function syncEmployeeRegu(karyawanIds, reguValue) {
    for (const nik of karyawanIds) {
      const emp = (employeeListCache || []).find((e) => e.nik_karyawan === nik);
      if (emp && emp.regu !== reguValue) {
        await api("PUT", ENT(`Employee/${emp.id}`), { regu: reguValue }).catch(() => {});
        emp.regu = reguValue;
        await sleep(API_THROTTLE_MS);
      }
    }
  }

  async function submitGenerate() {
    const overlay = document.getElementById("pisfx-shift-modal");
    const area = overlay.querySelector("#pisfx-gen-area").value;
    const regu = overlay.querySelector("#pisfx-gen-regu").value;
    const bulan = parseInt(overlay.querySelector("#pisfx-gen-bulan").value, 10);
    const tahun = parseInt(overlay.querySelector("#pisfx-gen-tahun").value, 10);
    const offsetDasar = parseInt(overlay.querySelector("#pisfx-gen-offset").value, 10);
    const catatan = overlay.querySelector("#pisfx-gen-catatan").value.trim();
    const karyawanIds = Array.from(overlay.querySelectorAll("#pisfx-gen-employees input:checked")).map((c) => c.value);
    const resultBox = overlay.querySelector("#pisfx-gen-result");

    if (!area) { showToast("Pilih Area/Proyek terlebih dahulu.", "fail"); return; }
    if (!karyawanIds.length) { showToast("Pilih minimal 1 karyawan.", "fail"); return; }

    resultBox.textContent = "Sedang membuat jadwal...";
    let sukses = 0, gagal = 0; const pesanGagal = [];

    await syncEmployeeRegu(karyawanIds, regu);

    if (regu === "Regu Acak") {
      // Setiap karyawan mendapat offset rotasi acak sendiri (rotasi tim diacak)
      for (const nik of karyawanIds) {
        const offsetAcak = Math.floor(Math.random() * 8);
        const tanggalList = generateTanggalSiklus(tahun, bulan, offsetAcak);
        for (const t of tanggalList) {
          const r = await api("POST", ENT("ShiftSchedule"), {
            area_tugas: area, regu: "Regu Acak", tanggal: t.tanggal,
            jam_mulai: t.jam_mulai, jam_selesai: t.jam_selesai, tipe_shift: "6-2",
            karyawan_ids: [nik], catatan: catatan || "Dibuat via Regu Acak",
          });
          if (r.ok && r.data && r.data.id) sukses++; else { gagal++; pesanGagal.push(r.data?.error || `Gagal untuk NIK ${nik} (${t.tanggal})`); }
          await sleep(API_THROTTLE_MS);
        }
      }
    } else {
      const tanggalList = generateTanggalSiklus(tahun, bulan, offsetDasar);
      for (const t of tanggalList) {
        const r = await api("POST", ENT("ShiftSchedule"), {
          area_tugas: area, regu, tanggal: t.tanggal,
          jam_mulai: t.jam_mulai, jam_selesai: t.jam_selesai, tipe_shift: "6-2",
          karyawan_ids: karyawanIds, catatan: catatan || "",
        });
        if (r.ok && r.data && r.data.id) sukses++; else { gagal++; pesanGagal.push(r.data?.error || `Gagal untuk tanggal ${t.tanggal}`); }
        await sleep(API_THROTTLE_MS);
      }
    }

    resultBox.innerHTML = `✅ ${sukses} jadwal berhasil dibuat.` + (gagal ? `<br>⚠️ ${gagal} gagal/bentrok:<br>` + pesanGagal.slice(0, 8).map((m) => `- ${m}`).join("<br>") : "");
    showToast(gagal ? `Selesai dengan ${gagal} bentrok jadwal (lihat detail di alat)` : "Jadwal bulan ini berhasil dibuat.", gagal ? "fail" : "ok");
  }

  // ============================================================
  // E) ROTASI OTOMATIS (SEMUA REGU) — memakai data Regu dari
  //    pis-regu-management.js (window.PISRegu). Pola:
  //    - ABCD (4 regu): siklus 4 hari, tiap hari 1 regu Pagi (06-18),
  //      1 regu Malam (18-06), 2 regu Off, bergiliran.
  //    - ABC (3 regu): siklus 3 hari, tiap hari 1 regu Pagi, 1 regu
  //      Malam, 1 regu Off, bergiliran.
  // ============================================================
  function reguHelperReady() {
    return typeof window.PISRegu !== "undefined" && typeof window.PISRegu.list === "function";
  }

  async function refreshRotasiReguInfo(area) {
    const box = document.getElementById("pisfx-rot-regu-info");
    if (!box) return;
    if (!reguHelperReady()) {
      box.innerHTML = `<span style="color:#7b1a1a;">Alat "Kelola Regu" belum termuat. Muat ulang halaman lalu coba lagi.</span>`;
      return;
    }
    const regus = (await window.PISRegu.list(false)).filter((r) => r.area_tugas === area);
    if (!regus.length) {
      box.innerHTML = `<span style="color:#7b1a1a;">Belum ada Regu untuk area ini. Tambahkan dulu lewat tombol "👥 Kelola Regu".</span>`;
      return;
    }
    const pola = regus[0].pola_rotasi === "ABC" ? "ABC" : "ABCD";
    const minRegu = pola === "ABC" ? 3 : 4;
    const warn = regus.length < minRegu
      ? ` — ⚠️ pola ${pola} idealnya butuh ${minRegu} regu, saat ini baru ${regus.length}.`
      : "";
    box.innerHTML = `Regu terdeteksi (${pola}): ${regus.map((r) => r.nama_regu).join(", ")}${warn}`;
  }

  function tanggalRentang(startStr, jumlahHari) {
    const out = [];
    const start = new Date(startStr + "T00:00:00");
    for (let i = 0; i < jumlahHari; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    return out;
  }

  // Status regu pada hari ke-`dayIndex` (0-based) untuk regu di posisi `posIndex`
  // (0-based, sesuai urutan array regus). Siklus panjang = jumlah regu.
  function statusRegu(posIndex, dayIndex, jumlahRegu) {
    const slot = (dayIndex + posIndex) % jumlahRegu;
    if (slot === 0) return "Pagi";
    if (slot === 1) return "Malam";
    return "Off";
  }

  async function submitRotasiOtomatis() {
    const overlay = document.getElementById("pisfx-shift-modal");
    const area = overlay.querySelector("#pisfx-rot-area").value;
    const start = overlay.querySelector("#pisfx-rot-start").value;
    const jumlahHari = parseInt(overlay.querySelector("#pisfx-rot-hari").value, 10) || 30;
    const catatan = overlay.querySelector("#pisfx-rot-catatan").value.trim();
    const resultBox = overlay.querySelector("#pisfx-rot-result");

    if (!area) { showToast("Pilih Area/Proyek terlebih dahulu.", "fail"); return; }
    if (!start) { showToast("Pilih Periode Mulai terlebih dahulu.", "fail"); return; }
    if (!reguHelperReady()) { showToast('Alat "Kelola Regu" belum termuat. Muat ulang halaman.', "fail"); return; }

    const regus = (await window.PISRegu.list(true)).filter((r) => r.area_tugas === area);
    if (!regus.length) { showToast("Belum ada Regu untuk area ini. Tambahkan dulu lewat Kelola Regu.", "fail"); return; }

    await loadAreaAndEmployeeOptions(false);
    resultBox.textContent = "Sedang membuat jadwal rotasi...";
    let sukses = 0, gagal = 0; const pesanGagal = [];
    const tanggalList = tanggalRentang(start, jumlahHari);
    const jumlahRegu = regus.length;

    for (let dayIndex = 0; dayIndex < tanggalList.length; dayIndex++) {
      const tanggal = tanggalList[dayIndex];
      for (let posIndex = 0; posIndex < jumlahRegu; posIndex++) {
        const regu = regus[posIndex];
        const status = statusRegu(posIndex, dayIndex, jumlahRegu);
        if (status === "Off") continue; // regu libur hari ini, tidak perlu buat jadwal

        const durasi = regu.durasi_shift_jam || 12;
        const jamMulai = status === "Pagi" ? "06:00" : "18:00";
        const jamSelesai = status === "Pagi" ? "18:00" : "06:00";

        const anggota = (employeeListCache || []).filter((e) => e.area_tugas === area && e.regu === regu.nama_regu).map((e) => e.nik_karyawan);
        if (!anggota.length) { continue; } // regu belum ada anggota, lewati (bukan error fatal)

        const r = await api("POST", ENT("ShiftSchedule"), {
          area_tugas: area, regu: regu.nama_regu, tanggal,
          jam_mulai: jamMulai, jam_selesai: jamSelesai, tipe_shift: `${durasi} jam (${status})`,
          karyawan_ids: anggota, catatan: catatan || `Rotasi otomatis ${status}`,
        });
        if (r.ok && r.data && r.data.id) sukses++; else { gagal++; pesanGagal.push(r.data?.error || `Gagal untuk ${regu.nama_regu} (${tanggal})`); }
        resultBox.textContent = `Sedang membuat jadwal... (${sukses + gagal} diproses: ${sukses} sukses, ${gagal} gagal)`;
        await sleep(API_THROTTLE_MS);
      }
    }

    resultBox.innerHTML = `✅ ${sukses} jadwal berhasil dibuat.` + (gagal ? `<br>⚠️ ${gagal} gagal/bentrok:<br>` + pesanGagal.slice(0, 8).map((m) => `- ${m}`).join("<br>") : "");
    showToast(gagal ? `Selesai dengan ${gagal} bentrok/kendala (lihat detail)` : "Jadwal rotasi berhasil dibuat untuk semua regu.", gagal ? "fail" : "ok");
  }

  async function submitViewPeriode() {
    const overlay = document.getElementById("pisfx-shift-modal");
    const area = overlay.querySelector("#pisfx-view-area").value;
    const regu = overlay.querySelector("#pisfx-view-regu").value;
    const start = overlay.querySelector("#pisfx-view-start").value;
    const end = overlay.querySelector("#pisfx-view-end").value;
    const listBox = overlay.querySelector("#pisfx-view-list");
    listBox.innerHTML = `<div class="pisfx-empty">Memuat...</div>`;

    const qs = new URLSearchParams({ limit: "2000" });
    if (area) qs.set("area_tugas", area);
    if (regu) qs.set("regu", regu);
    const r = await api("GET", ENT(`ShiftSchedule?${qs.toString()}`));
    if (!r.ok || !Array.isArray(r.data)) { listBox.innerHTML = `<div class="pisfx-empty">Gagal memuat data.</div>`; return; }

    let rows = r.data;
    if (start) rows = rows.filter((x) => x.tanggal >= start);
    if (end) rows = rows.filter((x) => x.tanggal <= end);
    rows.sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || ""));

    if (!rows.length) { listBox.innerHTML = `<div class="pisfx-empty">Tidak ada jadwal pada periode ini.</div>`; return; }

    listBox.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 8px 0;">
        <span style="font-size:12px;color:#555;">${rows.length} jadwal ditemukan.</span>
        <button class="pisfx-btn danger" id="pisfx-view-hapus-semua" style="padding:6px 10px;font-size:12px;">🗑️ Hapus Semua (Periode Ini)</button>
      </div>
      <table>
      <thead><tr><th>Tanggal</th><th>Regu</th><th>Jam</th><th>Jml. Karyawan</th><th>Catatan</th><th></th></tr></thead>
      <tbody>${rows.map((x) => `
        <tr data-id="${x.id}">
          <td>${x.tanggal || "-"}</td><td>${x.regu || "-"}</td>
          <td>${x.jam_mulai || "-"}–${x.jam_selesai || "-"}</td>
          <td>${(x.karyawan_ids || []).length}</td>
          <td>${x.catatan || ""}</td>
          <td><button class="pisfx-btn danger" data-del="${x.id}" style="padding:4px 8px;font-size:11px;">Hapus</button></td>
        </tr>`).join("")}</tbody>
    </table>`;

    listBox.querySelector("#pisfx-view-hapus-semua").addEventListener("click", async () => {
      const areaLabel = area || "Semua Area";
      const reguLabel = regu || "Semua Regu";
      const periodeLabel = (start || "?") + " s/d " + (end || "?");
      if (!confirm(`Hapus SEMUA ${rows.length} jadwal untuk ${areaLabel} / ${reguLabel} / periode ${periodeLabel}? Tindakan ini tidak bisa dibatalkan.`)) return;
      const btn = listBox.querySelector("#pisfx-view-hapus-semua");
      btn.disabled = true;
      btn.textContent = "Menghapus...";
      let sukses = 0, gagal = 0;
      for (const x of rows) {
        const r2 = await api("DELETE", ENT(`ShiftSchedule/${x.id}`));
        if (r2.ok) sukses++; else gagal++;
        btn.textContent = `Menghapus... (${sukses + gagal}/${rows.length})`;
        await sleep(API_THROTTLE_MS);
      }
      showToast(gagal ? `${sukses} jadwal terhapus, ${gagal} gagal.` : `${sukses} jadwal berhasil dihapus.`, gagal ? "fail" : "ok");
      submitViewPeriode();
    });


    listBox.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Hapus jadwal ini?")) return;
        await api("DELETE", ENT(`ShiftSchedule/${btn.dataset.del}`));
        submitViewPeriode();
      });
    });
  }

  // ============================================================
  // D) ALAT KELOLA TEMPLATE PATROLI
  // ============================================================
  let patrolToolBuilt = false;

  async function openPatrolTool() {
    if (!patrolToolBuilt) {
      patrolToolBuilt = true;
      buildModalShell("pisfx-patrol-modal", `
        <h2>🛡️ Kelola Template Patroli</h2>
        <div class="pisfx-sub">Alat cadangan untuk kelola Template E-Patroli (tambah, ubah, hapus) langsung dari sini.</div>

        <h3>Daftar Template</h3>
        <div id="pisfx-patrol-list" class="pisfx-list"><div class="pisfx-empty">Memuat...</div></div>

        <h3>Tambah / Ubah Template</h3>
        <input type="hidden" id="pisfx-patrol-id">
        <label>Nama Template</label>
        <input type="text" id="pisfx-patrol-nama" placeholder="Contoh: Patroli Malam Area A">
        <div class="pisfx-row">
          <div>
            <label>Jumlah Foto (1–5)</label>
            <input type="number" id="pisfx-patrol-jumlahfoto" min="1" max="5" value="1">
          </div>
          <div>
            <label>Status</label>
            <select id="pisfx-patrol-status">
              <option value="Aktif">Aktif</option>
              <option value="Non-Aktif">Non-Aktif</option>
            </select>
          </div>
        </div>
        <label>Area / Proyek</label>
        <select id="pisfx-patrol-area"></select>
        <label>Label Checkpoint / Foto (pisahkan dengan koma, sesuai jumlah foto)</label>
        <input type="text" id="pisfx-patrol-labels" placeholder="Contoh: Pos Depan, Lobi, Parkiran">

        <div class="pisfx-actions">
          <button class="pisfx-btn secondary" id="pisfx-patrol-reset">Form Baru</button>
          <button class="pisfx-btn" id="pisfx-patrol-submit">Simpan Template</button>
        </div>
      `);

      const overlay = document.getElementById("pisfx-patrol-modal");
      await loadAreaAndEmployeeOptions(false);
      overlay.querySelector("#pisfx-patrol-area").innerHTML = areaOptionsHtml();
      overlay.querySelector("#pisfx-patrol-submit").addEventListener("click", submitPatrolTemplate);
      overlay.querySelector("#pisfx-patrol-reset").addEventListener("click", resetPatrolForm);
      await refreshPatrolList();
    } else {
      await refreshPatrolList();
    }
    document.getElementById("pisfx-patrol-modal").classList.add("show");
  }

  function resetPatrolForm() {
    const overlay = document.getElementById("pisfx-patrol-modal");
    overlay.querySelector("#pisfx-patrol-id").value = "";
    overlay.querySelector("#pisfx-patrol-nama").value = "";
    overlay.querySelector("#pisfx-patrol-jumlahfoto").value = "1";
    overlay.querySelector("#pisfx-patrol-status").value = "Aktif";
    overlay.querySelector("#pisfx-patrol-labels").value = "";
  }

  async function refreshPatrolList() {
    const overlay = document.getElementById("pisfx-patrol-modal");
    const listBox = overlay.querySelector("#pisfx-patrol-list");
    listBox.innerHTML = `<div class="pisfx-empty">Memuat...</div>`;
    const r = await api("GET", ENT("EPatrolTemplate?limit=500"));
    if (!r.ok || !Array.isArray(r.data)) { listBox.innerHTML = `<div class="pisfx-empty">Gagal memuat template.</div>`; return; }
    if (!r.data.length) { listBox.innerHTML = `<div class="pisfx-empty">Belum ada template patroli.</div>`; return; }

    listBox.innerHTML = `<table>
      <thead><tr><th>Nama</th><th>Area</th><th>Jml Foto</th><th>Status</th><th></th></tr></thead>
      <tbody>${r.data.map((t) => `
        <tr>
          <td>${t.nama_template || "-"}</td><td>${t.area_tugas || "-"}</td>
          <td>${t.jumlah_foto ?? "-"}</td><td>${t.status || "-"}</td>
          <td>
            <button class="pisfx-btn secondary" data-edit="${t.id}" style="padding:4px 8px;font-size:11px;">Edit</button>
            <button class="pisfx-btn danger" data-del="${t.id}" style="padding:4px 8px;font-size:11px;">Hapus</button>
          </td>
        </tr>`).join("")}</tbody>
    </table>`;

    listBox.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tpl = r.data.find((x) => x.id === btn.dataset.edit);
        if (!tpl) return;
        overlay.querySelector("#pisfx-patrol-id").value = tpl.id;
        overlay.querySelector("#pisfx-patrol-nama").value = tpl.nama_template || "";
        overlay.querySelector("#pisfx-patrol-jumlahfoto").value = tpl.jumlah_foto || 1;
        overlay.querySelector("#pisfx-patrol-status").value = tpl.status || "Aktif";
        overlay.querySelector("#pisfx-patrol-area").value = tpl.area_tugas || "";
        overlay.querySelector("#pisfx-patrol-labels").value = (tpl.foto_configs || []).map((f) => f.label).join(", ");
      });
    });
    listBox.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Hapus template ini?")) return;
        await api("DELETE", ENT(`EPatrolTemplate/${btn.dataset.del}`));
        refreshPatrolList();
      });
    });
  }

  async function submitPatrolTemplate() {
    const overlay = document.getElementById("pisfx-patrol-modal");
    const id = overlay.querySelector("#pisfx-patrol-id").value;
    const nama_template = overlay.querySelector("#pisfx-patrol-nama").value.trim();
    const jumlah_foto = parseInt(overlay.querySelector("#pisfx-patrol-jumlahfoto").value, 10) || 1;
    const status = overlay.querySelector("#pisfx-patrol-status").value;
    const area_tugas = overlay.querySelector("#pisfx-patrol-area").value;
    const labels = overlay.querySelector("#pisfx-patrol-labels").value.split(",").map((s) => s.trim()).filter(Boolean);

    if (!nama_template) { showToast("Nama template wajib diisi.", "fail"); return; }
    if (!area_tugas) { showToast("Pilih Area/Proyek.", "fail"); return; }

    const foto_configs = Array.from({ length: jumlah_foto }, (_, i) => ({
      label: labels[i] || `Checkpoint ${i + 1}`, riwayat_keterangan: [],
    }));

    const payload = { nama_template, jumlah_foto, area_tugas, status, foto_configs };
    const r = id ? await api("PUT", ENT(`EPatrolTemplate/${id}`), payload) : await api("POST", ENT("EPatrolTemplate"), payload);

    if (r.ok && r.data && (r.data.id || r.data.success !== false)) {
      showToast(id ? "Template berhasil diperbarui." : "Template baru berhasil ditambahkan.", "ok");
      resetPatrolForm();
      refreshPatrolList();
    } else {
      showToast(r.data?.error || "Gagal menyimpan template.", "fail");
    }
  }
})();
