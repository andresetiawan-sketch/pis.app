/**
 * PIS — Tambahan opsi "Generate Semua Regu (Rotasi A→B→C)" dengan pola
 * rolling 12 jam per regu, berkelanjutan (tidak menyentuh bundle React).
 *
 * KENAPA LAPISAN TERPISAH?
 * Sama seperti pis-fixes.js / pis-gps-button-fix.js dkk: source React asli
 * tidak tersedia (hanya bundle hasil build yang sudah diminify), jadi opsi
 * baru ini disisipkan ke DOM tepat di atas pilihan bawaan
 * "🔁 Generate Semua Regu (Rotasi A→B→C) — rolling 12 jam, berkelanjutan" pada modal
 * "Generate Jadwal Bulanan Otomatis", dan diproses lewat API backend
 * (/api/apps/entities/ShiftSchedule) langsung — persis seperti cara modal
 * aslinya menyimpan data.
 *
 * DETEKSI REGU OTOMATIS (tidak perlu pilih karyawan lagi):
 * Begitu Area Tugas dipilih & panel ini diaktifkan, karyawan pada area
 * tersebut otomatis dikelompokkan ke Regu A/B/C berdasarkan field
 * Employee.regu yang sudah ada. Karyawan yang belum pernah punya regu
 * dibagi rata otomatis (round-robin) supaya SEMUA karyawan area itu
 * langsung tercentang di kolom regunya masing-masing — admin tinggal
 * klik "Generate Rotasi 12 Jam", tidak perlu mencentang satu per satu.
 * Centang tetap bisa dilepas manual untuk kasus pengecualian.
 *
 * POLA ROTASI (3 regu, shift 12 jam, siklus 6 hari, berkelanjutan):
 *   Hari ke 1–2 siklus: Regu A = Siang(12 jam), Regu C = Malam(12 jam), Regu B = Off
 *   Hari ke 3–4 siklus: Regu B = Siang,          Regu A = Malam,          Regu C = Off
 *   Hari ke 5–6 siklus: Regu C = Siang,          Regu B = Malam,          Regu A = Off
 *   (lalu berulang dari awal, tanpa batas akhir — "berkelanjutan")
 * Urutan tugas Siang mengikuti A → B → C sesuai nama fiturnya. Setiap regu
 * selalu mendapat jeda ±24 jam saat pindah dari Siang ke Malam, dan 2 hari
 * penuh libur (Off) setelah 2 hari Malam — supaya tidak ada karyawan yang
 * "double shift" tanpa istirahat.
 *
 * ANTI-TIMPA & LANJUT BULAN BERIKUTNYA:
 * - Tanggal yang tanggal+area+karyawan-nya sudah punya jadwal akan ditolak
 *   backend (409 bentrok) — kita anggap "dilewati", BUKAN error, dan tidak
 *   pernah menimpa data lama.
 * - Titik awal siklus (anchor) disimpan di dalam field "catatan" tiap
 *   jadwal yang dibuat tool ini (format [RotasiABC12Jam anchor=YYYY-MM-DD]).
 *   Saat admin generate bulan berikutnya untuk area yang sama, tool ini
 *   membaca anchor dari jadwal lama yang sudah ada, sehingga pola rotasi
 *   otomatis nyambung dari bulan sebelumnya (bukan mulai dari nol lagi).
 *
 * BENTROK PER AREA (bukan global):
 * - Backend (check_shift_schedule_conflict di entities.php) hanya mengecek
 *   bentrok pada area_tugas + tanggal yang sama, bukan lintas area. Tool
 *   ini memakai endpoint yang sama sehingga otomatis mengikuti aturan itu.
 */
(function () {
  "use strict";
  console.log("[PIS] pis-shift-rotasi-abc.js v2 dimuat — auto-deteksi regu per Area Tugas (bukan per-karyawan manual)");


  // ============================================================
  // Helper mandiri (tidak bergantung pada file pis-*.js lain)
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
  function isAdminEmployee() {
    const emp = getEmployee();
    const role = String(emp?.role || emp?.jabatan || "").toLowerCase();
    return role.includes("master admin") || role.includes("admin");
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
    el.className = "pisrbc-toast " + (kind || "ok");
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  }

  const style = document.createElement("style");
  style.textContent = `
    .pisrbc-toast {
      position: fixed; top: 16px; right: 16px; z-index: 100000;
      padding: 12px 16px; border-radius: 10px; font: 600 13px system-ui, sans-serif;
      box-shadow: 0 6px 18px rgba(0,0,0,.25); max-width: 340px;
    }
    .pisrbc-toast.ok { background: #1a7b2c; color: #fff; }
    .pisrbc-toast.fail { background: #7b1a1a; color: #fff; }
    .pisrbc-panel { margin-top: 8px; padding: 10px; border: 1px dashed #93c5fd; border-radius: 10px; background: #eff6ff; }
    .pisrbc-panel label { display:block; font-size:12px; font-weight:600; color:#1e3a8a; margin: 8px 0 4px; }
    .pisrbc-panel input[type=date], .pisrbc-panel input[type=time] {
      width: 100%; padding: 7px 8px; border: 1px solid #bfdbfe; border-radius: 8px; font-size: 12.5px; box-sizing: border-box;
    }
    .pisrbc-row { display: flex; gap: 8px; }
    .pisrbc-row > * { flex: 1; min-width: 0; }
    .pisrbc-teams { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-top: 4px; }
    .pisrbc-team h4 { margin: 0 0 4px; font-size: 11.5px; color: #1e3a8a; }
    .pisrbc-checklist { max-height: 120px; overflow-y: auto; border: 1px solid #bfdbfe; border-radius: 8px; padding: 5px; background: #fff; }
    .pisrbc-preview-list { list-style: none; margin: 0; padding: 0; }
    .pisrbc-preview-list li { font-size: 11.5px; color: #1e3a8a; padding: 3px 4px; border-bottom: 1px dashed #eef2ff; }
    .pisrbc-preview-list li:last-child { border-bottom: none; }
    .pisrbc-refresh-row { display: flex; justify-content: flex-end; margin: 4px 0 2px; }
    .pisrbc-refresh-btn { background: none; border: 1px solid #93c5fd; color: #1e3a8a; border-radius: 7px; padding: 4px 9px; font: 700 11px system-ui, sans-serif; cursor: pointer; }
    .pisrbc-refresh-btn:hover { background: #eff6ff; }
    .pisrbc-checklist label { font-weight: 400; display:flex; align-items:center; gap:5px; margin:3px 0; font-size: 11.5px; color:#333; }
    .pisrbc-empty { color: #6b7280; font-style: italic; font-size: 11.5px; padding: 4px 0; }
    .pisrbc-btn {
      margin-top: 10px; width: 100%; background: #1e3a8a; color: #fff; border: none; border-radius: 8px;
      padding: 9px 12px; font-weight: 700; cursor: pointer; font-size: 12.5px;
    }
    .pisrbc-btn:disabled { opacity: .55; cursor: not-allowed; }
    .pisrbc-result { margin-top: 8px; font-size: 12px; color: #1e3a8a; }
    .pisrbc-toggle-row { display:flex; align-items:center; justify-content:space-between; gap: 8px; }
    .pisrbc-toggle-row label { display:flex; align-items:center; gap:6px; font-size:12.5px; color:#1e3a8a; font-weight:700; cursor:pointer; margin:0; }
  `;
  document.head.appendChild(style);

  // ============================================================
  // Pola rotasi 3 regu / 12 jam / siklus 6 hari (lihat penjelasan di atas)
  // ============================================================
  const SIKLUS_HARI = 6;
  const POLA_ROTASI = [
    { Siang: "A", Malam: "C", Off: "B" }, // hari ke-0 & 1 siklus
    { Siang: "A", Malam: "C", Off: "B" },
    { Siang: "B", Malam: "A", Off: "C" }, // hari ke-2 & 3 siklus
    { Siang: "B", Malam: "A", Off: "C" },
    { Siang: "C", Malam: "B", Off: "A" }, // hari ke-4 & 5 siklus
    { Siang: "C", Malam: "B", Off: "A" },
  ];
  const MARKER_PREFIX = "[RotasiABC12Jam";

  function toDateOnly(d) {
    const x = new Date(d + "T00:00:00");
    return x;
  }
  function diffHari(tanggal, anchor) {
    const ms = toDateOnly(tanggal).getTime() - toDateOnly(anchor).getTime();
    return Math.round(ms / 86400000);
  }
  function mod(n, m) { return ((n % m) + m) % m; }
  function tambahJam(jamStr, jam) {
    let [h, m] = jamStr.split(":").map(Number);
    h = (h + jam) % 24;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  function klasifikasiTipeShift(jamMulai) {
    // Sama seperti fungsi bawaan aplikasi: Malam 23:00–06:59, Siang/Sore
    // 15:00–22:59, selain itu Pagi.
    if (!jamMulai) return "Pagi";
    const [h] = jamMulai.split(":").map(Number);
    if (h >= 23 || h < 7) return "Malam";
    if (h >= 15) return "Siang/Sore";
    return "Pagi";
  }
  function tanggalPlus(tanggal, n) {
    const d = toDateOnly(tanggal);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // ============================================================
  // Deteksi & injeksi ke modal native "Generate Jadwal Bulanan Otomatis"
  // ============================================================
  let areaEmployeeCache = null; // { [area]: [{nik_karyawan,nama_lengkap}] }
  let lastLoadedArea = null;

  async function loadEmployeesForArea(area, force) {
    if (!force && areaEmployeeCache && lastLoadedArea === area) return areaEmployeeCache;
    const r = await api("GET", ENT("Employee?limit=1000"));
    const all = r.ok && Array.isArray(r.data) ? r.data : [];
    areaEmployeeCache = all.filter((e) => !area || e.area_tugas === area);
    lastLoadedArea = area;
    return areaEmployeeCache;
  }

  function findDialogRoot() {
    // Cari heading modal "Generate Jadwal Bulanan Otomatis", lalu naik ke
    // container dialog terdekat (role="dialog" dari Radix UI).
    const heading = Array.from(document.querySelectorAll("h2, h3, [class*='DialogTitle' i]"))
      .find((h) => /generate jadwal bulanan otomatis/i.test(h.textContent || ""));
    if (!heading) return null;
    return heading.closest("[role='dialog']") || heading.closest("div[data-state]") || heading.parentElement?.parentElement || null;
  }

  function findNativeSemuaReguRow(root) {
    // Baris berisi teks "🔁 Generate Semua Regu (Rotasi A→B→C) — rolling 12 jam, berkelanjutan" — kita
    // sisipkan panel kita tepat SEBELUM baris ini (sesuai permintaan:
    // "tambahkan pilihan di atas Generate Semua Regu ..."). Teksnya ada
    // di dalam <label> yang PUNYA child elemen (ikon, checkbox), jadi
    // dicocokkan lewat textContent gabungan, bukan elemen tanpa child.
    const label = Array.from(root.querySelectorAll("label")).find((el) =>
      /generate semua regu \(rotasi a→b→c→d\)/i.test((el.textContent || "").trim())
    );
    if (!label) return null;
    const flexRow = label.parentElement; // div "flex items-center justify-between mb-1"
    return flexRow ? flexRow.parentElement : null; // div pembungkus seluruh blok "Regu"
  }

  function findAreaSelectValue(root) {
    // Ambil area yang sedang dipilih pada dropdown "Area Tugas" native.
    // Radix Select menampilkan nilai terpilih sebagai teks di dalam tombol
    // trigger (bukan <select> asli), jadi kita cari trigger terdekat pada
    // blok yang labelnya "Area Tugas".
    const label = Array.from(root.querySelectorAll("label")).find((l) => /^area tugas$/i.test((l.textContent || "").trim()));
    if (!label) return "";
    const block = label.parentElement;
    if (!block) return "";
    const trigger = block.querySelector("[role='combobox'], button");
    if (trigger) {
      const txt = (trigger.textContent || "").trim();
      if (txt && !/pilih area/i.test(txt)) return txt;
    }
    const plain = block.querySelector("div.text-gray-700, div.bg-gray-50");
    if (plain) {
      const txt = (plain.textContent || "").trim();
      if (txt && txt !== "-") return txt;
    }
    return "";
  }

  // ============================================================
  // Deteksi regu otomatis dari data karyawan yang sudah ada
  // (field Employee.regu, misal "Regu A" / "A"). Karyawan yang belum
  // pernah punya regu dibagi rata otomatis (round-robin, regu paling
  // sedikit duluan) supaya admin TIDAK perlu memilih karyawan satu per
  // satu — cukup pastikan Area Tugas sudah dipilih di atas.
  // ============================================================
  function reguLetter(emp) {
    const r = String(emp.regu || "").trim().toUpperCase();
    const m = r.match(/^(?:REGU\s*)?([ABC])$/);
    return m ? m[1] : null;
  }

  function autoAssignTeams(employees) {
    const teams = { A: [], B: [], C: [] };
    const belumPunyaRegu = [];
    employees.forEach((e) => {
      const letter = reguLetter(e);
      if (letter) teams[letter].push(e);
      else belumPunyaRegu.push(e);
    });
    // Bagi rata karyawan yang belum punya regu ke regu yang paling sedikit
    // anggotanya dulu (round-robin seimbang), supaya semua karyawan Area
    // Tugas yang dipilih otomatis masuk salah satu regu tanpa perlu diklik.
    belumPunyaRegu.forEach((e) => {
      const letter = ["A", "B", "C"].reduce((min, l) => (teams[l].length < teams[min].length ? l : min), "A");
      teams[letter].push(e);
    });
    return teams;
  }

  function buildTeamChecklistHtml(letter, employeesForTeam) {
    if (!employeesForTeam.length) return `<div class="pisrbc-empty">Belum ada karyawan Regu ${letter} di area ini.</div>`;
    // TIDAK ADA checkbox di sini lagi — daftar ini murni informasi (read-only)
    // supaya admin bisa mengecek siapa saja yang otomatis terdeteksi.
    // Kunci penentuannya adalah kombinasi Area Tugas + Regu (bukan memilih
    // Ringkasan singkat saja (bukan daftar nama panjang) supaya modal tidak
    // jadi terlalu tinggi dan tombol Generate asli tetap mudah dijangkau.
    return `<div class="pisrbc-empty" style="font-style:normal;color:#1e3a8a;">${employeesForTeam.length} karyawan: ${employeesForTeam.map((e) => e.nama_lengkap || e.nik_karyawan).join(", ")}</div>`;
  }

  function ensureDialogScrollable(root) {
    // Dijalankan berulang (lihat refreshDialogInjection) supaya kalau React
    // sempat me-render ulang dialog dan menghapus inline style ini, modal
    // tetap dipaksa bisa discroll — tombol Generate asli tidak pernah
    // terjebak di luar area yang terlihat.
    if (root.style.overflowY !== "auto") root.style.overflowY = "auto";
    if (root.style.maxHeight !== "88vh") root.style.maxHeight = "88vh";
    root.style.overscrollBehavior = "contain";
  }

  function injectPanel(root) {
    if (!root || root.querySelector(".pisrbc-panel")) return;
    const anchorRow = findNativeSemuaReguRow(root);
    if (!anchorRow || !anchorRow.parentNode) return;

    // PENTING (perbaikan bug scroll): modal "Generate Jadwal Bulanan Otomatis"
    // bawaan tidak auto-scroll saat kontennya jadi lebih tinggi dari layar —
    // akibatnya tombol Generate asli & konten di bawahnya bisa terdorong
    // keluar dan tidak bisa dijangkau/diklik sama sekali. Paksa dialog ini
    // bisa discroll secara vertikal, apa pun konten tambahan yang disisipkan.
    ensureDialogScrollable(root);

    const wrap = document.createElement("div");
    wrap.className = "pisrbc-panel";
    wrap.innerHTML = `
      <div id="pisrbc-panel">
        <label><input type="checkbox" id="pisrbc-enable"> 🔁 Generate Semua Regu (Rotasi A→B→C) — rolling 12 jam, berkelanjutan</label>
        <div id="pisrbc-jam-input" style="display:none; margin-top:8px; gap:8px; align-items:center; flex-wrap:wrap;">
          <label style="font-size:12px; font-weight:600;">Jam Masuk (Pagi):</label>
          <input type="time" id="pisrbc-jam-masuk-pagi" value="07:00" style="padding:4px 8px; border:1px solid #ccc; border-radius:6px;" />
          <label style="font-size:12px; font-weight:600;">Jam Pulang (Pagi):</label>
          <input type="time" id="pisrbc-jam-pulang-pagi" value="19:00" style="padding:4px 8px; border:1px solid #ccc; border-radius:6px;" />
          <label style="font-size:12px; font-weight:600;">Jam Masuk (Malam):</label>
          <input type="time" id="pisrbc-jam-masuk-malam" value="19:00" style="padding:4px 8px; border:1px solid #ccc; border-radius:6px;" />
          <label style="font-size:12px; font-weight:600;">Jam Pulang (Malam):</label>
          <input type="time" id="pisrbc-jam-pulang-malam" value="07:00" style="padding:4px 8px; border:1px solid #ccc; border-radius:6px;" />
        </div>
      </div>
      <div id="pisrbc-body" style="display:none;">
        <p style="margin:6px 0 0;font-size:11.5px;color:#1e40af;">
          3 regu shift 12 jam (Siang/Malam) urut A→B→C, 2 hari Off setelah 2 hari Malam, berkelanjutan tanpa menimpa jadwal lama.
          Regu otomatis ikut Area Tugas yang dipilih di atas — tidak perlu pilih karyawan lagi.
        </p>
        <div class="pisrbc-row">
          <div>
            <label>Dari Tanggal</label>
            <input type="date" id="pisrbc-start">
          </div>
          <div>
            <label>Sampai Tanggal</label>
            <input type="date" id="pisrbc-end">
          </div>
        </div>
        <div class="pisrbc-refresh-row"><button type="button" class="pisrbc-refresh-btn" id="pisrbc-refresh">🔄 Muat Ulang Karyawan Sesuai Area Tugas</button></div>
        <div class="pisrbc-teams">
          <div class="pisrbc-team"><h4>Regu A</h4><div class="pisrbc-checklist" data-team-list="A"><div class="pisrbc-empty">Pilih Area Tugas dahulu di atas.</div></div></div>
          <div class="pisrbc-team"><h4>Regu B</h4><div class="pisrbc-checklist" data-team-list="B"><div class="pisrbc-empty">Pilih Area Tugas dahulu di atas.</div></div></div>
          <div class="pisrbc-team"><h4>Regu C</h4><div class="pisrbc-checklist" data-team-list="C"><div class="pisrbc-empty">Pilih Area Tugas dahulu di atas.</div></div></div>
        </div>
        <button type="button" class="pisrbc-btn" id="pisrbc-submit">Generate Rotasi 12 Jam (A→B→C)</button>
        <div class="pisrbc-result" id="pisrbc-result"></div>
      </div>
    `;
    anchorRow.parentNode.insertBefore(wrap, anchorRow);

    const enableBox = wrap.querySelector("#pisrbc-enable");
    const body = wrap.querySelector("#pisrbc-body");
    const jamInput = wrap.querySelector("#pisrbc-jam-input");

    async function refreshPreview() {
      const area = findAreaSelectValue(root);
      const employees = await loadEmployeesForArea(area, true); // selalu segar, kunci = Area Tugas ini
      const teams = autoAssignTeams(employees);
      ["A", "B", "C"].forEach((letter) => {
        const box = wrap.querySelector(`[data-team-list="${letter}"]`);
        box.innerHTML = buildTeamChecklistHtml(letter, teams[letter]);
      });
      const resultBox = wrap.querySelector("#pisrbc-result");
      if (!area) {
        resultBox.innerHTML = `<span style="color:#b45309;">⚠️ Pilih Area Tugas di atas dulu, lalu klik "Muat Ulang Karyawan".</span>`;
      } else if (!employees.length) {
        resultBox.innerHTML = `<span style="color:#b45309;">⚠️ Belum ada karyawan aktif di Area Tugas "${area}".</span>`;
      } else {
        resultBox.innerHTML = `<span style="color:#1e3a8a;">✓ ${employees.length} karyawan aktif di area "${area}" otomatis terbagi ke Regu A/B/C. Tidak perlu memilih karyawan — langsung klik Generate.</span>`;
      }
      return { area, employees, teams };
    }

    enableBox.addEventListener("change", async () => {
      body.style.display = enableBox.checked ? "block" : "none";
      jamInput.style.display = enableBox.checked ? "flex" : "none";
      if (!enableBox.checked) return;

      // Matikan opsi "Semua Regu (A→B→C→D)" bawaan supaya tidak dobel logika,
      // dan redupkan baris tersebut selagi mode rotasi kami aktif.
      const nativeCheckbox = anchorRow.querySelector("button[role='checkbox'][data-state='checked'], input[type='checkbox']:checked");
      if (nativeCheckbox) nativeCheckbox.click();
      anchorRow.style.opacity = "0.45";
      anchorRow.style.pointerEvents = "none";

      await refreshPreview();
    });

    wrap.querySelector("#pisrbc-refresh").addEventListener("click", refreshPreview);
    wrap.querySelector("#pisrbc-submit").addEventListener("click", () => submitRotasiABC(root, wrap));
  }

  function refreshDialogInjection() {
    const root = findDialogRoot();
    if (!root) return;
    if (!isAdminEmployee()) return;
    ensureDialogScrollable(root);
    injectPanel(root);
  }
  new MutationObserver(refreshDialogInjection).observe(document.body, { childList: true, subtree: true });
  setInterval(refreshDialogInjection, 1200);

  // ============================================================
  // Cari anchor siklus dari jadwal yang sudah ada di area ini (supaya
  // bulan berikutnya otomatis melanjutkan, bukan mengulang dari awal).
  // ============================================================
  async function cariAnchorSiklus(area, fallbackTanggalMulai) {
    const r = await api("GET", ENT(`ShiftSchedule?area_tugas=${encodeURIComponent(area)}&limit=2000`));
    if (r.ok && Array.isArray(r.data)) {
      for (const row of r.data) {
        const catatan = row.catatan || "";
        if (catatan.startsWith(MARKER_PREFIX)) {
          const m = catatan.match(/anchor=(\d{4}-\d{2}-\d{2})/);
          if (m) return m[1];
        }
      }
    }
    return fallbackTanggalMulai; // belum pernah generate di area ini -> mulai siklus baru dari sini
  }

  async function syncEmployeeRegu(nikList, reguValue) {
    for (const nik of nikList) {
      const emp = (areaEmployeeCache || []).find((e) => e.nik_karyawan === nik);
      if (emp && emp.regu !== reguValue) {
        await api("PUT", ENT(`Employee/${emp.id}`), { regu: reguValue }).catch(() => {});
        emp.regu = reguValue;
      }
    }
  }

  async function submitRotasiABC(root, wrap) {
    const area = findAreaSelectValue(root);
    const start = wrap.querySelector("#pisrbc-start").value;
    const end = wrap.querySelector("#pisrbc-end").value;
    const jamMasukPagi = document.getElementById("pisrbc-jam-masuk-pagi")?.value || "07:00";
    const jamPulangPagi = document.getElementById("pisrbc-jam-pulang-pagi")?.value || "19:00";
    const jamMasukMalam = document.getElementById("pisrbc-jam-masuk-malam")?.value || "19:00";
    const jamPulangMalam = document.getElementById("pisrbc-jam-pulang-malam")?.value || "07:00";
    const resultBox = wrap.querySelector("#pisrbc-result");
    const submitBtn = wrap.querySelector("#pisrbc-submit");

    if (!area) { showToast("Pilih Area Tugas terlebih dahulu.", "fail"); return; }
    if (!start || !end) { showToast("Isi periode Dari Tanggal & Sampai Tanggal.", "fail"); return; }
    if (end < start) { showToast("Sampai Tanggal tidak boleh sebelum Dari Tanggal.", "fail"); return; }

    submitBtn.disabled = true;
    resultBox.textContent = "Mendeteksi karyawan aktif per Regu di Area Tugas ini...";

    // Kunci pengelompokan = Area Tugas + Regu (bukan pilihan orang satu-satu):
    // muat ulang data karyawan yang aktif di area ini persis sebelum
    // generate, supaya selalu sesuai kondisi terbaru.
    const employeesArea = await loadEmployeesForArea(area, true);
    const teamsAuto = autoAssignTeams(employeesArea);
    const team = {
      A: teamsAuto.A.map((e) => e.nik_karyawan),
      B: teamsAuto.B.map((e) => e.nik_karyawan),
      C: teamsAuto.C.map((e) => e.nik_karyawan),
    };
    // Perbarui juga tampilan preview supaya sinkron dengan yang dipakai generate.
    ["A", "B", "C"].forEach((letter) => {
      const box = wrap.querySelector(`[data-team-list="${letter}"]`);
      if (box) box.innerHTML = buildTeamChecklistHtml(letter, teamsAuto[letter]);
    });

    if (!team.A.length && !team.B.length && !team.C.length) {
      submitBtn.disabled = false;
      showToast("Tidak ada karyawan aktif di Area Tugas ini.", "fail");
      resultBox.innerHTML = `<span style="color:#b45309;">⚠️ Tidak ada karyawan aktif di Area Tugas "${area}".</span>`;
      return;
    }

    submitBtn.disabled = true;
    resultBox.textContent = "Mencari kelanjutan pola dari jadwal sebelumnya...";
    const anchor = await cariAnchorSiklus(area, start);

    await syncEmployeeRegu(team.A, "Regu A");
    await syncEmployeeRegu(team.B, "Regu B");
    await syncEmployeeRegu(team.C, "Regu C");

    let dibuat = 0, dilewati = 0, gagalLain = 0;
    const pesanGagal = [];
    const pesanBentrokContoh = [];

    let tgl = start;
    while (tgl <= end) {
      const idxSiklus = mod(diffHari(tgl, anchor), SIKLUS_HARI);
      const pola = POLA_ROTASI[idxSiklus];
      const shiftHariIni = [
        { peran: "Siang", regu: pola.Siang, jam_mulai: jamMasukPagi, jam_selesai: jamPulangPagi },
        { peran: "Malam", regu: pola.Malam, jam_mulai: jamMasukMalam, jam_selesai: jamPulangMalam },
      ];
      for (const s of shiftHariIni) {
        const karyawanIds = team[s.regu];
        if (!karyawanIds || !karyawanIds.length) continue; // regu ini belum diisi karyawan -> lewati
        const payload = {
          area_tugas: area,
          regu: `Regu ${s.regu}`,
          tanggal: tgl,
          jam_mulai: s.jam_mulai,
          jam_selesai: s.jam_selesai,
          // PENTING (perbaikan "Keterangan Pola Shift tidak sesuai"):
          // klasifikasiTipeShift() dirancang untuk skema 3-shift bawaan
          // aplikasi (Pagi/Siang-Sore/Malam berdasarkan jam mulai). Untuk
          // rotasi 12 jam ini hanya ada 2 peran (Siang/Malam) — jam
          // mulainya bisa berapa saja sesuai input admin, jadi keterangan
          // tipe shift HARUS langsung ikut peran rotasi (s.peran), bukan
          // ditebak ulang dari jam, supaya tidak salah label (mis. shift
          // Siang jam 07:00 malah tertulis "Pagi").
          tipe_shift: s.peran === "Malam" ? "Malam" : "Siang/Sore",
          karyawan_ids: karyawanIds,
          catatan: `${MARKER_PREFIX} anchor=${anchor}] Rotasi 12 Jam - Regu ${s.regu} (${s.peran})`,
          jam_mulai_pagi: jamMasukPagi,
          jam_selesai_pagi: jamPulangPagi,
          jam_mulai_malam: jamMasukMalam,
          jam_selesai_malam: jamPulangMalam,
        };
        const r = await api("POST", ENT("ShiftSchedule"), payload);
        if (r.ok && r.data && r.data.id) {
          dibuat++;
        } else if (r.status === 409) {
          dilewati++; // sudah ada jadwal (anti-timpa) -> bukan error
          // Tangkap pesan ASLI dari backend (bukan asumsi kita) supaya
          // kalau ternyata bukan "sudah ada jadwal" beneran, kelihatan jelas.
          if (pesanBentrokContoh.length < 3) {
            pesanBentrokContoh.push(`${tgl} (${s.peran}, Regu ${s.regu}): ${r.data?.error || r.data?.message || "(tanpa pesan dari server)"}`);
          }
        } else {
          gagalLain++;
          pesanGagal.push(r.data?.error || `Gagal untuk ${tgl} (${s.peran})`);
        }
      }
      tgl = tanggalPlus(tgl, 1);
    }

    submitBtn.disabled = false;
    if (dibuat === 0 && dilewati > 0) {
      // 0 jadwal terbuat sama sekali biasanya BUKAN anti-timpa normal
      // (anti-timpa normal hanya melewati tanggal yang MEMANG sudah ada
      // jadwalnya) — kalau area ini benar-benar baru/kosong tapi tetap
      // 100% "bentrok", tampilkan pesan asli dari server supaya jelas
      // penyebabnya, bukan langsung dianggap berhasil.
      resultBox.innerHTML = `⚠️ 0 jadwal baru dibuat — ${dilewati} tanggal ditolak server sebagai "sudah ada jadwal".` +
        `<br>Kalau area/periode ini sebenarnya masih kosong, ini kemungkinan bug di pengecekan bentrok pada server, bukan beneran bentrok. Pesan asli dari server:<br>` +
        pesanBentrokContoh.map((m) => `- ${m}`).join("<br>");
      showToast(`Gagal: 0 jadwal dibuat, ${dilewati} ditolak server.`, "fail");
      return;
    }
    resultBox.innerHTML = `✅ ${dibuat} jadwal baru dibuat.` +
      (dilewati ? `<br>ℹ️ ${dilewati} tanggal dilewati (sudah ada jadwal, tidak ditimpa).` : "") +
      (gagalLain ? `<br>⚠️ ${gagalLain} gagal:<br>` + pesanGagal.slice(0, 6).map((m) => `- ${m}`).join("<br>") : "");
    showToast(gagalLain ? `Selesai dengan ${gagalLain} kegagalan (lihat detail di panel)` : "Jadwal rotasi 12 jam berhasil dibuat.", gagalLain ? "fail" : "ok");
  }
})();
