/**
 * PIS PKWT & GAJI — lapisan tambahan (tidak menyentuh bundle React index-*.js).
 *
 * Sama seperti pis-fixes.js / pis-enhancements.js: source React asli tidak
 * tersedia (hanya hasil build yang sudah diminify), jadi fitur berikut
 * dikerjakan di atas DOM yang sudah dirender + panggil API backend langsung.
 *
 * Berisi:
 *  A) Menu "Data Gaji PKWT" (per Area & Jabatan + tunjangan-tunjangan),
 *     dikelola lewat tombol mengambang. Data disimpan di entity SalaryConfig
 *     dan dipakai untuk auto-connect gaji saat Buat PKWT.
 *  B) Auto-fill form "Buat PKWT Baru" / "Edit PKWT":
 *     - Tanggal Mulai realtime (hari dibuat)
 *     - Tanggal Selesai otomatis dari Tanggal Mulai + Durasi (Bulan)
 *     - Hari & Tanggal Tanda Tangan realtime (hari ini)
 *     - Alamat Perusahaan otomatis dari alamat Head Office
 *     - Gaji Pokok otomatis dari Data Gaji PKWT (Area + Jabatan karyawan)
 *     - Ganti label "Nama Direktur / Pimpinan" -> "Nama Direktur / Pimpinan / Hrd"
 *       dan "Jabatan Direktur" -> "Jabatan penanggung jawab"
 */
(function () {
  "use strict";

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
  async function callFn(name, body) {
    const r = await api("POST", `/api/apps/functions/${name}`, body || {});
    return r.data;
  }
  function showToast(message, kind) {
    const el = document.createElement("div");
    el.className = "pispg-toast " + (kind || "ok");
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  const style = document.createElement("style");
  style.textContent = `
    .pispg-toast { position: fixed; top: 16px; right: 16px; z-index: 100000; padding: 12px 16px;
      border-radius: 10px; font: 600 13px system-ui, sans-serif; box-shadow: 0 6px 18px rgba(0,0,0,.25); max-width: 320px; }
    .pispg-toast.ok { background: #1a7b2c; color: #fff; }
    .pispg-toast.fail { background: #7b1a1a; color: #fff; }
    #pispg-gaji-fab { position: fixed; z-index: 9990; right: 18px; bottom: 100px; background: #0f5132; color: #fff;
      border: none; border-radius: 24px; padding: 12px 16px; font: 700 13px system-ui, sans-serif;
      box-shadow: 0 6px 16px rgba(0,0,0,.25); cursor: pointer; }
    .pispg-modal-overlay { display:none; position:fixed; inset:0; z-index:99998; background:rgba(0,0,0,.45);
      align-items:center; justify-content:center; padding:16px; }
    .pispg-modal-overlay.show { display:flex; }
    .pispg-modal { background:#fff; border-radius:14px; width:100%; max-width:640px; max-height:88vh;
      overflow-y:auto; padding:20px; font:13px system-ui, sans-serif; color:#222; position:relative; }
    .pispg-modal h2 { color:#0f5132; font-size:17px; margin:0 0 4px; }
    .pispg-modal .pispg-sub { color:#777; font-size:12px; margin-bottom:14px; }
    .pispg-modal label { display:block; font-size:12px; font-weight:600; color:#444; margin:10px 0 4px; }
    .pispg-modal select, .pispg-modal input[type=text], .pispg-modal input[type=number] {
      width:100%; padding:8px; border:1px solid #ddd; border-radius:8px; font-size:13px; box-sizing:border-box; }
    .pispg-row { display:flex; gap:8px; align-items:end; }
    .pispg-row > * { flex:1; }
    .pispg-btn { background:#0f5132; color:#fff; border:none; border-radius:8px; padding:9px 14px;
      font-weight:700; cursor:pointer; font-size:13px; }
    .pispg-btn.secondary { background:#eee; color:#333; }
    .pispg-btn.danger { background:#7b1a1a; }
    .pispg-list { margin-top:10px; border:1px solid #eee; border-radius:8px; overflow:hidden; }
    .pispg-list table { width:100%; border-collapse:collapse; font-size:12.5px; }
    .pispg-list th, .pispg-list td { padding:7px 8px; border-bottom:1px solid #f2f2f2; text-align:left; }
    .pispg-list th { background:#f4f9f6; color:#0f5132; }
    .pispg-empty { color:#999; font-style:italic; padding:10px 0; }
    .pispg-close { position:absolute; top:14px; right:16px; background:none; border:none; font-size:18px; cursor:pointer; color:#999; }
    .pispg-tunjangan-row { display:flex; gap:6px; margin-bottom:6px; align-items:center; }
  `;
  document.head.appendChild(style);

  // ============================================================
  // A) Data Gaji PKWT — CRUD SalaryConfig per Area & Jabatan + tunjangan
  // ============================================================
  let areasCache = null;
  async function loadAreas() {
    if (areasCache) return areasCache;
    const r = await api("GET", ENT("AreaProject"));
    areasCache = (r.ok && Array.isArray(r.data)) ? r.data : [];
    return areasCache;
  }

  function buildGajiFab() {
    if (document.getElementById("pispg-gaji-fab")) return;
    if (!isAdminEmployee()) return;
    const btn = document.createElement("button");
    btn.id = "pispg-gaji-fab";
    btn.textContent = "💰 Data Gaji PKWT";
    btn.addEventListener("click", openGajiModal);
    document.body.appendChild(btn);
  }

  let gajiOverlay = null;
  let currentTunjangan = [];

  async function openGajiModal() {
    if (!gajiOverlay) {
      gajiOverlay = document.createElement("div");
      gajiOverlay.className = "pispg-modal-overlay";
      gajiOverlay.innerHTML = `
        <div class="pispg-modal">
          <button class="pispg-close" id="pispg-gaji-close">&times;</button>
          <h2>💰 Data Gaji PKWT</h2>
          <div class="pispg-sub">Atur gaji pokok & tunjangan berdasarkan Area dan Jabatan. Data ini otomatis
            terhubung saat membuat PKWT baru (isi Area + Jabatan karyawan yang sama).</div>
          <div class="pispg-row">
            <div>
              <label>Area Tugas</label>
              <select id="pispg-gaji-area"></select>
            </div>
            <div>
              <label>Jabatan</label>
              <input type="text" id="pispg-gaji-jabatan" placeholder="mis. Security" />
            </div>
          </div>
          <label>Gaji Pokok (Rp)</label>
          <input type="number" id="pispg-gaji-pokok" placeholder="mis. 4500000" />
          <label>Tunjangan-tunjangan (opsional)</label>
          <div id="pispg-tunjangan-list"></div>
          <button type="button" class="pispg-btn secondary" id="pispg-tunjangan-add" style="margin-top:4px;">+ Tunjangan</button>
          <div style="margin-top:16px; display:flex; gap:8px; justify-content:flex-end;">
            <button class="pispg-btn secondary" id="pispg-gaji-cancel">Batal</button>
            <button class="pispg-btn" id="pispg-gaji-save">Simpan</button>
          </div>
          <h3 style="margin-top:20px;color:#0f5132;font-size:14px;">Daftar Data Gaji Tersimpan</h3>
          <div class="pispg-list" id="pispg-gaji-list"></div>
        </div>`;
      document.body.appendChild(gajiOverlay);
      gajiOverlay.querySelector("#pispg-gaji-close").addEventListener("click", closeGajiModal);
      gajiOverlay.querySelector("#pispg-gaji-cancel").addEventListener("click", closeGajiModal);
      gajiOverlay.addEventListener("click", (e) => { if (e.target === gajiOverlay) closeGajiModal(); });
      gajiOverlay.querySelector("#pispg-tunjangan-add").addEventListener("click", () => {
        currentTunjangan.push({ nama: "", nominal: "" });
        renderTunjanganRows();
      });
      gajiOverlay.querySelector("#pispg-gaji-save").addEventListener("click", saveSalaryConfig);
    }
    currentTunjangan = [];
    renderTunjanganRows();
    gajiOverlay.querySelector("#pispg-gaji-pokok").value = "";
    gajiOverlay.querySelector("#pispg-gaji-jabatan").value = "";
    const areas = await loadAreas();
    const areaSelect = gajiOverlay.querySelector("#pispg-gaji-area");
    areaSelect.innerHTML = areas.map((a) => {
      const nama = a.nama_area || a.nama_proyek || a.id;
      return `<option value="${String(nama).replace(/"/g, "&quot;")}">${nama}</option>`;
    }).join("") || `<option value="">(belum ada area)</option>`;
    await renderGajiList();
    gajiOverlay.classList.add("show");
  }
  function closeGajiModal() { if (gajiOverlay) gajiOverlay.classList.remove("show"); }

  function renderTunjanganRows() {
    const wrap = gajiOverlay.querySelector("#pispg-tunjangan-list");
    if (!currentTunjangan.length) {
      wrap.innerHTML = `<div class="pispg-empty">Belum ada tunjangan ditambahkan.</div>`;
      return;
    }
    wrap.innerHTML = currentTunjangan.map((t, i) => `
      <div class="pispg-tunjangan-row">
        <input type="text" data-i="${i}" data-f="nama" placeholder="Nama tunjangan (mis. Transport)" value="${(t.nama || "").replace(/"/g, "&quot;")}" />
        <input type="number" data-i="${i}" data-f="nominal" placeholder="Nominal" value="${t.nominal || ""}" style="max-width:140px;" />
        <button type="button" data-i="${i}" class="pispg-btn danger pispg-tunjangan-remove" style="padding:6px 10px;">✕</button>
      </div>`).join("");
    wrap.querySelectorAll("input").forEach((inp) => {
      inp.addEventListener("input", () => {
        const i = parseInt(inp.dataset.i, 10);
        currentTunjangan[i][inp.dataset.f] = inp.value;
      });
    });
    wrap.querySelectorAll(".pispg-tunjangan-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentTunjangan.splice(parseInt(btn.dataset.i, 10), 1);
        renderTunjanganRows();
      });
    });
  }

  async function saveSalaryConfig() {
    const area_tugas = gajiOverlay.querySelector("#pispg-gaji-area").value;
    const jabatan = gajiOverlay.querySelector("#pispg-gaji-jabatan").value.trim();
    const gaji_pokok = gajiOverlay.querySelector("#pispg-gaji-pokok").value;
    if (!area_tugas) return showToast("Pilih area terlebih dahulu.", "fail");
    if (!jabatan) return showToast("Isi jabatan terlebih dahulu.", "fail");
    if (!gaji_pokok) return showToast("Isi gaji pokok terlebih dahulu.", "fail");
    const tunjangan_list = currentTunjangan.filter((t) => t.nama && t.nominal);
    const btn = gajiOverlay.querySelector("#pispg-gaji-save");
    btn.disabled = true;
    // Cek apakah sudah ada data untuk area+jabatan ini -> update, bukan duplikat
    const existing = await api("GET", ENT("SalaryConfig"));
    const list = (existing.ok && Array.isArray(existing.data)) ? existing.data : [];
    const found = list.find((s) =>
      String(s.area_tugas || "").toLowerCase() === area_tugas.toLowerCase() &&
      String(s.jabatan || "").toLowerCase() === jabatan.toLowerCase());
    const payload = { area_tugas, jabatan, gaji_pokok: Number(gaji_pokok), tunjangan_list };
    const res = found
      ? await api("PUT", ENT(`SalaryConfig/${found.id}`), payload)
      : await api("POST", ENT("SalaryConfig"), payload);
    btn.disabled = false;
    if (!res.ok) return showToast("Gagal menyimpan data gaji.", "fail");
    showToast("Data Gaji PKWT disimpan.", "ok");
    currentTunjangan = [];
    renderTunjanganRows();
    gajiOverlay.querySelector("#pispg-gaji-jabatan").value = "";
    gajiOverlay.querySelector("#pispg-gaji-pokok").value = "";
    await renderGajiList();
  }

  async function renderGajiList() {
    const wrap = gajiOverlay.querySelector("#pispg-gaji-list");
    const r = await api("GET", ENT("SalaryConfig"));
    const list = (r.ok && Array.isArray(r.data)) ? r.data : [];
    if (!list.length) {
      wrap.innerHTML = `<div class="pispg-empty" style="padding:10px;">Belum ada data gaji PKWT.</div>`;
      return;
    }
    wrap.innerHTML = `<table><thead><tr><th>Area</th><th>Jabatan</th><th>Gaji Pokok</th><th>Tunjangan</th><th></th></tr></thead>
      <tbody>${list.map((s) => `
        <tr>
          <td>${s.area_tugas || "-"}</td>
          <td>${s.jabatan || "-"}</td>
          <td>Rp ${Number(s.gaji_pokok || 0).toLocaleString("id-ID")}</td>
          <td>${(s.tunjangan_list || []).map((t) => `${t.nama}: Rp ${Number(t.nominal || 0).toLocaleString("id-ID")}`).join(", ") || "-"}</td>
          <td><button data-id="${s.id}" class="pispg-btn danger pispg-gaji-del" style="padding:4px 8px;">Hapus</button></td>
        </tr>`).join("")}</tbody></table>`;
    wrap.querySelectorAll(".pispg-gaji-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Hapus data gaji ini?")) return;
        await api("DELETE", ENT(`SalaryConfig/${btn.dataset.id}`));
        await renderGajiList();
      });
    });
  }

  async function findSalaryConfig(areaTugas, jabatan) {
    if (!areaTugas || !jabatan) return null;
    const r = await api("GET", ENT("SalaryConfig"));
    const list = (r.ok && Array.isArray(r.data)) ? r.data : [];
    return list.find((s) =>
      String(s.area_tugas || "").toLowerCase() === String(areaTugas).toLowerCase() &&
      String(s.jabatan || "").toLowerCase() === String(jabatan).toLowerCase()) || null;
  }

  // ============================================================
  // B) Auto-fill form Buat/Edit PKWT
  // ============================================================
  const HARI_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const BULAN_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const SATUAN = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
  function terbilangAngka(n) {
    n = Math.floor(n);
    if (n < 12) return SATUAN[n];
    if (n < 20) return terbilangAngka(n - 10) + " Belas";
    if (n < 100) return (terbilangAngka(Math.floor(n / 10)) + " Puluh" + (n % 10 ? " " + terbilangAngka(n % 10) : "")).trim();
    if (n < 200) return ("Seratus" + (n % 100 ? " " + terbilangAngka(n % 100) : "")).trim();
    if (n < 1000) return (terbilangAngka(Math.floor(n / 100)) + " Ratus" + (n % 100 ? " " + terbilangAngka(n % 100) : "")).trim();
    if (n < 2000) return ("Seribu" + (n % 1000 ? " " + terbilangAngka(n % 1000) : "")).trim();
    if (n < 1000000) return (terbilangAngka(Math.floor(n / 1000)) + " Ribu" + (n % 1000 ? " " + terbilangAngka(n % 1000) : "")).trim();
    return (terbilangAngka(Math.floor(n / 1000000)) + " Juta" + (n % 1000000 ? " " + terbilangAngka(n % 1000000) : "")).trim();
  }

  function setNativeValue(el, value) {
    if (!el) return;
    const tag = el.tagName;
    const proto = tag === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Cari elemen input/textarea/button (trigger Select) untuk field dengan teks label tertentu,
  // dibatasi ke dalam node `root` (dialog PKWT).
  function findFieldByLabel(root, labelText) {
    const labels = root.querySelectorAll("label");
    for (const lbl of labels) {
      if (lbl.textContent.trim() === labelText) {
        const parent = lbl.parentElement;
        if (!parent) continue;
        const input = parent.querySelector("input, textarea");
        if (input) return input;
        const btn = parent.querySelector("button");
        if (btn) return btn;
      }
    }
    return null;
  }

  // Ganti teks label persis (aman, hanya textContent, tidak menyentuh React state)
  function renameLabel(root, oldText, newText) {
    const labels = root.querySelectorAll("label");
    for (const lbl of labels) {
      if (lbl.textContent.trim() === oldText) lbl.textContent = newText;
    }
  }

  // Best-effort: pilih opsi pada komponen Radix Select (trigger berupa <button>)
  // dengan mensimulasikan klik lalu memilih opsi yang cocok teksnya di listbox portal.
  function trySelectRadixOption(triggerBtn, optionText) {
    if (!triggerBtn || triggerBtn.tagName !== "BUTTON") return;
    // Jika sudah terisi (bukan placeholder), jangan timpa
    const current = triggerBtn.textContent.trim();
    if (current && current.toLowerCase() !== "pilih hari...".toLowerCase() && !/pilih/i.test(current)) return;
    triggerBtn.click();
    setTimeout(() => {
      const options = document.querySelectorAll('[role="option"]');
      for (const opt of options) {
        if (opt.textContent.trim() === optionText) {
          opt.click();
          return;
        }
      }
      // Tidak ketemu -> tutup listbox dengan Escape agar tidak mengganggu
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }, 120);
  }

  function isPkwtDialog(node) {
    if (!node || node.nodeType !== 1) return false;
    const text = node.textContent || "";
    return text.includes("Data Pihak Kedua (Karyawan)") && text.includes("Data Penandatanganan");
  }

  let headOfficeAddressCache = null;
  async function getHeadOfficeAddress() {
    if (headOfficeAddressCache !== null) return headOfficeAddressCache;
    const res = await callFn("getHeadOfficeAddress", {}).catch(() => null);
    headOfficeAddressCache = (res && res.success && res.alamat) ? res.alamat : "";
    return headOfficeAddressCache;
  }

  const processedDialogs = new WeakSet();

  async function autofillPkwtDialog(dialog) {
    if (processedDialogs.has(dialog)) return;
    processedDialogs.add(dialog);

    // Ganti label sesuai permintaan
    renameLabel(dialog, "Nama Direktur / Pimpinan", "Nama Direktur / Pimpinan / Hrd");
    renameLabel(dialog, "Jabatan Direktur", "Jabatan penanggung jawab");

    const today = new Date();
    const isoDate = today.toISOString().slice(0, 10);
    const hariIni = HARI_ID[today.getDay()];
    const tanggalIndo = `${today.getDate()} ${BULAN_ID[today.getMonth()]} ${today.getFullYear()}`;

    // --- Tanggal Mulai realtime (hanya jika masih kosong, mis. saat Buat PKWT Baru) ---
    const tglMulaiInput = findFieldByLabel(dialog, "Tanggal Mulai");
    if (tglMulaiInput && tglMulaiInput.tagName === "INPUT" && !tglMulaiInput.value) {
      setNativeValue(tglMulaiInput, isoDate);
    }

    // --- Tanggal Tanda Tangan & Kota realtime (jika kosong) ---
    const tglTtdInput = findFieldByLabel(dialog, "Tanggal Tanda Tangan");
    if (tglTtdInput && tglTtdInput.tagName === "INPUT" && !tglTtdInput.value) {
      setNativeValue(tglTtdInput, tanggalIndo);
    }
    // --- Hari Tanda Tangan realtime (Radix Select) ---
    const hariBtn = findFieldByLabel(dialog, "Hari Tanda Tangan");
    if (hariBtn) trySelectRadixOption(hariBtn, hariIni);

    // --- Alamat Perusahaan otomatis dari Head Office (jika kosong) ---
    const alamatInput = findFieldByLabel(dialog, "Alamat Perusahaan");
    if (alamatInput && alamatInput.tagName === "INPUT" && !alamatInput.value) {
      const alamat = await getHeadOfficeAddress();
      if (alamat) setNativeValue(alamatInput, alamat);
    }

    // --- Fungsi untuk menghitung ulang Tanggal Selesai = Tanggal Mulai + Durasi (Bulan) ---
    function recomputeTanggalSelesai() {
      const mulaiEl = findFieldByLabel(dialog, "Tanggal Mulai");
      const durasiEl = findFieldByLabel(dialog, "Durasi (Bulan)");
      const selesaiEl = findFieldByLabel(dialog, "Tanggal Selesai");
      if (!mulaiEl || !durasiEl || !selesaiEl || !mulaiEl.value || !durasiEl.value) return;
      const start = new Date(mulaiEl.value + "T00:00:00");
      if (isNaN(start.getTime())) return;
      const bulan = parseInt(durasiEl.value, 10) || 0;
      const end = new Date(start);
      end.setMonth(end.getMonth() + bulan);
      end.setDate(end.getDate() - 1); // durasi N bulan penuh, berakhir sehari sebelum tanggal mulai bulan berikutnya
      const endIso = end.toISOString().slice(0, 10);
      if (selesaiEl.value !== endIso) setNativeValue(selesaiEl, endIso);
    }
    recomputeTanggalSelesai();
    const mulaiEl = findFieldByLabel(dialog, "Tanggal Mulai");
    const durasiEl = findFieldByLabel(dialog, "Durasi (Bulan)");
    if (mulaiEl) mulaiEl.addEventListener("change", recomputeTanggalSelesai);
    if (durasiEl) durasiEl.addEventListener("input", recomputeTanggalSelesai);

    // --- Gaji Pokok otomatis dari Data Gaji PKWT (Area + Jabatan karyawan terpilih) ---
    async function autofillGaji() {
      const infoBox = dialog.querySelector(".bg-blue-50, .bg-blue-100");
      let area = "", jabatan = "";
      dialog.querySelectorAll("div").forEach((d) => {
        const t = d.textContent || "";
        if (/^Area:/.test(t.trim())) area = t.replace(/^Area:\s*/, "").trim();
        if (/^Jabatan:/.test(t.trim())) jabatan = t.replace(/^Jabatan:\s*/, "").trim();
      });
      if (!area || !jabatan) return;
      const cfg = await findSalaryConfig(area, jabatan);
      if (!cfg) return;
      const gajiInput = findFieldByLabel(dialog, "Gaji Pokok (Nominal)");
      const terbilangInput = findFieldByLabel(dialog, "Gaji Pokok (Terbilang)");
      if (gajiInput && gajiInput.tagName === "INPUT" && !gajiInput.value) {
        setNativeValue(gajiInput, String(cfg.gaji_pokok || ""));
      }
      if (terbilangInput && terbilangInput.tagName === "INPUT" && !terbilangInput.value && cfg.gaji_pokok) {
        setNativeValue(terbilangInput, terbilangAngka(Number(cfg.gaji_pokok)));
      }
    }
    // Coba beberapa kali karena data karyawan/area muncul async setelah dropdown karyawan dipilih
    let tries = 0;
    const gajiInterval = setInterval(() => {
      tries++;
      autofillGaji();
      if (tries > 10 || !document.body.contains(dialog)) clearInterval(gajiInterval);
    }, 1000);
  }

  const pkwtObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (isPkwtDialog(node)) { autofillPkwtDialog(node); continue; }
        const found = node.querySelector && Array.from(node.querySelectorAll("div")).find(isPkwtDialog);
        if (found) autofillPkwtDialog(found);
      }
    }
  });
  pkwtObserver.observe(document.body, { childList: true, subtree: true });

  // FAB Data Gaji PKWT hanya untuk Admin/Master Admin
  function tryInitFab() {
    if (getEmployee()) buildGajiFab();
  }
  tryInitFab();
  setInterval(tryInitFab, 2000);
})();
