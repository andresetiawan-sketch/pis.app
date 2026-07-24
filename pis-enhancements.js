/**
 * PIS Enhancements — lapisan tambahan murni HTML/CSS/JS.
 * TIDAK menyentuh bundle React (index-*.js) sama sekali, sehingga
 * tampilan & fungsi yang sudah ada tetap seperti semula.
 *
 * Mencakup:
 *  #3  Splash screen animasi logo saat aplikasi pertama dibuka
 *  #8  Ganti avatar inisial (SVG) dengan foto profil user yang login
 *  #10 Status gagal login + salam saat berhasil masuk dashboard
 *  #14 Perbaikan warna visual tombol (nama hitam bold, dsb)
 *  #15/#16 Menu tutorial + panduan otomatis untuk user baru
 */
(function () {
  "use strict";

  // ============================================================
  // #14 — Warna tombol: nama hitam bold, latar putih-abu,
  // hover hijau muda, klik/aktif biru muda
  // ============================================================
  const styleTag = document.createElement("style");
  styleTag.textContent = `
    button:not(.pis-enh-ignore), .btn:not(.pis-enh-ignore) {
      color: #000 !important;
      font-weight: 700 !important;
      background-color: #f2f2f2 !important;
      border-color: #d9d9d9 !important;
      transition: background-color .15s ease, color .15s ease;
    }
    button:not(.pis-enh-ignore):hover, .btn:not(.pis-enh-ignore):hover {
      background-color: #c9f5d1 !important;
    }
    button:not(.pis-enh-ignore):active, .btn:not(.pis-enh-ignore):active,
    button:not(.pis-enh-ignore).active, .btn:not(.pis-enh-ignore).active {
      background-color: #bfe2ff !important;
    }
    button:disabled, .btn:disabled { opacity: .55 !important; }

    /* ── #3 Splash screen ── */
    #pis-splash {
      position: fixed; inset: 0; z-index: 99999; background: #ffffff;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      transition: opacity .5s ease;
    }
    #pis-splash img {
      width: 96px; height: 96px; object-fit: contain;
      animation: pis-logo-grow 1.1s cubic-bezier(.34,1.56,.64,1) forwards;
    }
    #pis-splash .pis-splash-title {
      margin-top: 18px; font-weight: 800; font-size: 15px; letter-spacing: .5px;
      color: #1e3fae; text-align: center; opacity: 0;
      animation: pis-fade-in .6s ease .5s forwards;
    }
    @keyframes pis-logo-grow {
      0%   { transform: scale(.2); opacity: 0; }
      60%  { transform: scale(1.15); opacity: 1; }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes pis-fade-in { to { opacity: 1; } }
    #pis-splash.pis-hide { opacity: 0; pointer-events: none; }

    /* ── #10 toast status login ── */
    .pis-toast {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      z-index: 99998; padding: 12px 18px; border-radius: 10px; font-size: 13px;
      font-family: system-ui, sans-serif; box-shadow: 0 6px 20px rgba(0,0,0,.18);
      max-width: 90vw; text-align: center;
    }
    .pis-toast.ok { background: #1a7b2c; color: #fff; }
    .pis-toast.fail { background: #7b1a1a; color: #fff; }

    /* ── #15/16 tombol tutorial ── */
    #pis-tutorial-btn {
      position: fixed; left: 18px; bottom: 18px; z-index: 9996;
      width: 46px; height: 46px; border-radius: 50%; background: #7B1A2C; color: #fff;
      border: none; font-size: 20px; box-shadow: 0 6px 16px rgba(0,0,0,.25); cursor: pointer;
    }
    #pis-tutorial-modal {
      display: none; position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.45);
      align-items: center; justify-content: center; padding: 16px;
    }
    #pis-tutorial-modal.show { display: flex; }
    #pis-tutorial-card {
      background: #fff; border-radius: 14px; max-width: 480px; width: 100%;
      max-height: 82vh; overflow-y: auto; padding: 24px; font-family: system-ui, sans-serif;
    }
    #pis-tutorial-card h2 { color: #7B1A2C; font-size: 18px; margin: 0 0 12px; }
    #pis-tutorial-card .pis-step { padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13.5px; color: #333; }
    #pis-tutorial-card .pis-step b { color: #7B1A2C; }
    #pis-tutorial-close { margin-top: 16px; width: 100%; padding: 10px; border-radius: 8px; border: none; background: #7B1A2C; color: #fff; font-weight: 700; }
  `;
  document.head.appendChild(styleTag);

  // ============================================================
  // Helpers
  // ============================================================
  function getEmployee() {
    try {
      const s = localStorage.getItem("pis_employee") || sessionStorage.getItem("pis_employee");
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  }
  function showToast(message, kind) {
    const el = document.createElement("div");
    el.className = "pis-toast " + kind;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  // ============================================================
  // #3 — Splash screen (logo membesar + "INTEGRATED FACILITY SERVICES")
  // ============================================================
  async function showSplash() {
    if (sessionStorage.getItem("pis_splash_shown")) return; // hanya sekali per sesi tab
    let logoUrl = "/icons/icon-512.png";
    try {
      const r = await fetch("/api/settings/branding");
      const b = await r.json();
      if (b?.logo_url) logoUrl = b.logo_url;
    } catch {}

    const splash = document.createElement("div");
    splash.id = "pis-splash";
    splash.innerHTML = `
      <img src="${logoUrl}" alt="Logo" />
      <div class="pis-splash-title">INTEGRATED FACILITY SERVICES</div>
    `;
    document.body.appendChild(splash);
    sessionStorage.setItem("pis_splash_shown", "1");

    setTimeout(() => {
      splash.classList.add("pis-hide");
      setTimeout(() => splash.remove(), 550);
    }, 1700);
  }
  showSplash();

    // ============================================================
   // ============================================================
  // #8 — Ganti avatar inisial (SVG) dengan foto profil user
  // ============================================================
  function applyProfilePhoto() {
    const emp = getEmployee();
    const photoUrl = emp?.foto_profil || emp?.foto_setengah_badan;
    if (!photoUrl) return;

    const candidates = document.querySelectorAll(
      '[data-avatar], .avatar, [class*="avatar" i]'
    );
    candidates.forEach((node) => {
      if (node.getAttribute("data-pis-photo-applied")) return;
      const svg = node.querySelector("svg");
      const hasInitialsText = /^[A-Z]{1,2}$/.test((node.textContent || "").trim());
      if (svg || hasInitialsText) {
        node.innerHTML = "";
        const img = document.createElement("img");
        let finalUrl = photoUrl;
        if (photoUrl.startsWith("http://localhost") || photoUrl.startsWith("https://localhost")) {
          const match = photoUrl.match(/\/(files|branding)\/(.+)/);
          if (match) finalUrl = "/" + match[1] + "/" + match[2];
          else finalUrl = "/files/" + photoUrl.split("/").pop();
        } else if (!photoUrl.startsWith("http") && !photoUrl.startsWith("/")) {
          finalUrl = "/files/" + photoUrl;
        }
        img.src = finalUrl;
        img.alt = emp?.nama_lengkap || "Foto Profil";
        img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:inherit;";
        img.onerror = function() { this.style.display = "none"; };
        node.appendChild(img);
        node.setAttribute("data-pis-photo-applied", "1");
      }
    });
  }

  const avatarObserver = new MutationObserver(() => applyProfilePhoto());
  avatarObserver.observe(document.body, { childList: true, subtree: true });
  applyProfilePhoto();


  // ============================================================
  // #10 — Status gagal login (keterangan sebab) + salam saat berhasil
  // ============================================================
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (...args) {
    const response = await originalFetch(...args);
    try {
      const urlStr = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      if (urlStr.includes("/api/apps/functions/employeeLogin")) {
        const clone = response.clone();
        clone.json().then((data) => {
          if (data?.success && data?.employee) {
            const nama = data.employee.nama_lengkap || "Karyawan";
            showToast(`👋 Selamat datang, ${nama}!`, "ok");
          } else if (data && data.success === false) {
            showToast(`Gagal masuk: ${data.error || "Terjadi kesalahan"}`, "fail");
          }
        }).catch(() => {});
      }
    } catch {}
    return response;
  };

  // ============================================================
  // #15 / #16 — Menu tutorial + panduan otomatis untuk user baru
  // ============================================================
  const TUTORIAL_STEPS = [
    { title: "Dashboard", body: "Halaman utama menampilkan ringkasan kehadiran, jadwal, dan notifikasi terbaru Anda." },
    { title: "Jadwal Shift", body: "Lihat jadwal Regu A/B/D/C bulan berjalan. Tombol Tukar Shift hanya muncul saat status jadwal Anda OFF." },
    { title: "Absensi", body: "Lakukan absen masuk & pulang lewat QR Code. Tombol Lembur muncul setelah Anda absen pulang." },
    { title: "E-Patrol", body: "Gunakan menu E-Patrol untuk memindai titik patroli sesuai rute yang ditentukan." },
    { title: "Pengaturan", body: "Master Admin dapat mengubah logo, favicon, dan hak akses menu di halaman Pengaturan." },
    { title: "Chat Admin", body: "Gunakan ikon chat di pojok kanan bawah untuk menghubungi Administrator Head Office." },
  ];

  function buildTutorialModal() {
    const modal = document.createElement("div");
    modal.id = "pis-tutorial-modal";
    modal.innerHTML = `
      <div id="pis-tutorial-card">
        <h2>📘 Tutorial Penggunaan Aplikasi</h2>
        ${TUTORIAL_STEPS.map((s, i) => `<div class="pis-step"><b>${i + 1}. ${s.title}</b><br>${s.body}</div>`).join("")}
        <button id="pis-tutorial-close">Mengerti</button>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("show"); });
    modal.querySelector("#pis-tutorial-close").addEventListener("click", () => modal.classList.remove("show"));
    return modal;
  }

  function initTutorial() {
    if (document.getElementById("pis-tutorial-btn")) return;
    const btn = document.createElement("button");
    btn.id = "pis-tutorial-btn";
    btn.title = "Tutorial";
    btn.textContent = "?";
    document.body.appendChild(btn);
    const modal = buildTutorialModal();
    btn.addEventListener("click", () => modal.classList.add("show"));

    // Tampilkan otomatis untuk user yang baru pertama kali masuk
    const emp = getEmployee();
    if (emp?.nik_karyawan) {
      const seenKey = `pis_tutorial_seen_${emp.nik_karyawan}`;
      if (!localStorage.getItem(seenKey)) {
        setTimeout(() => modal.classList.add("show"), 900);
        localStorage.setItem(seenKey, "1");
      }
    }
  }
  // Tunggu sampai user login (root ter-render dengan dashboard), lalu pasang tombol tutorial
  const tutorialObserver = new MutationObserver(() => {
    if (getEmployee()) initTutorial();
  });
  tutorialObserver.observe(document.body, { childList: true, subtree: true });
  initTutorial();

  // ============================================================
  // #7 + Jadwal Non-Shift — Widget Absensi & Tukar Shift
  // Widget terpisah (bukan disisipkan ke tombol asli, karena struktur
  // DOM halaman e-absensi React tidak diketahui). Tampil di halaman yang
  // path-nya mengandung "absensi"/"attendance".
  // ============================================================
  function getToken() {
    try { return localStorage.getItem("token") || sessionStorage.getItem("token"); } catch { return null; }
  }
  async function apiCall(fnName, body = {}) {
    const token = getToken();
    const res = await fetch(`/api/apps/functions/${fnName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { "X-Employee-Token": token } : {}) },
      body: JSON.stringify(body),
    });
    return res.json();
  }
  function isAttendancePage() {
    return /absensi|attendance|e-absensi/i.test(window.location.pathname);
  }

  let shiftWidgetBuilt = false;
  async function buildShiftWidget() {
    if (shiftWidgetBuilt || !getEmployee()) return;
    shiftWidgetBuilt = true;

    const box = document.createElement("div");
    box.id = "pis-shift-widget";
    box.style.cssText = "position:fixed;right:18px;bottom:80px;z-index:9995;background:#fff;border-radius:14px;box-shadow:0 6px 20px rgba(0,0,0,.2);padding:14px;width:230px;font-family:system-ui,sans-serif;font-size:13px;";
    box.innerHTML = `<div style="font-weight:700;color:#7B1A2C;margin-bottom:8px;">Status Absensi Hari Ini</div><div id="pis-shift-info">Memuat...</div>`;
    document.body.appendChild(box);

    const data = await apiCall("getAttendanceButtons", {}).catch(() => null);
    const info = document.getElementById("pis-shift-info");
    if (!data?.success) { info.textContent = "Gagal memuat status."; return; }

    let html = `<div>Jadwal: <b>${data.jadwal_status}</b></div>`;
    if (data.tampilkan_tukar_shift) {
      html += `<button id="pis-btn-tukar" style="width:100%;margin-top:8px;">🔁 Tukar Shift</button>`;
    }
    if (data.tampilkan_lembur) {
      html += `<button id="pis-btn-lembur" style="width:100%;margin-top:8px;">⏱️ Ajukan Lembur</button>`;
    }
    info.innerHTML = html;

    const tukarBtn = document.getElementById("pis-btn-tukar");
    if (tukarBtn) tukarBtn.addEventListener("click", async () => {
      const nikPengganti = prompt("Masukkan NIK karyawan pengganti:");
      if (!nikPengganti) return;
      const r = await apiCall("requestShiftSwapV2", { nik_pengganti: nikPengganti, tanggal: data.tanggal });
      showToast(r.success ? "Permintaan tukar shift terkirim." : (r.error || "Gagal mengirim permintaan"), r.success ? "ok" : "fail");
    });
    const lemburBtn = document.getElementById("pis-btn-lembur");
    if (lemburBtn) lemburBtn.addEventListener("click", async () => {
      showToast("Fitur pengajuan lembur menggunakan menu Overtime yang sudah ada.", "ok");
    });
  }

  const shiftPageObserver = new MutationObserver(() => {
    if (isAttendancePage()) buildShiftWidget();
    else if (document.getElementById("pis-shift-widget") && !isAttendancePage()) {
      document.getElementById("pis-shift-widget").remove();
      shiftWidgetBuilt = false;
    }
  });
  shiftPageObserver.observe(document.body, { childList: true, subtree: true });
  if (isAttendancePage()) buildShiftWidget();

  // ============================================================
  // #9 — Peringatan kolom wajib formulir lamaran belum diisi (best-effort)
  // Catatan: overlay hanya bisa MEMPERINGATKAN (highlight & pesan), tidak bisa
  // membatalkan submit form React secara andal tanpa source. Validasi WAJIB
  // & final tetap ditegakkan di server (worker.js) sehingga tetap aman.
  // ============================================================
  function isApplicationFormPage() {
    return /lamaran|apply|recruitment|karir/i.test(window.location.pathname);
  }
  function checkRequiredFieldsHint() {
    if (!isApplicationFormPage()) return;
    const inputs = document.querySelectorAll("input[required], textarea[required], select[required], [aria-required='true']");
    const empty = Array.from(inputs).filter((el) => !el.value || !String(el.value).trim());
    const existing = document.getElementById("pis-form-warning");
    if (!empty.length) { if (existing) existing.remove(); return; }
    if (!existing) {
      const warn = document.createElement("div");
      warn.id = "pis-form-warning";
      warn.className = "pis-toast fail";
      warn.style.top = "auto";
      warn.style.bottom = "16px";
      document.body.appendChild(warn);
    }
    document.getElementById("pis-form-warning").textContent = `Masih ada ${empty.length} kolom wajib yang belum diisi.`;
  }
  document.addEventListener("input", checkRequiredFieldsHint, true);
  document.addEventListener("change", checkRequiredFieldsHint, true);

  // ============================================================
  // #11 — Bunyi notifikasi alarm keras, per jenis notifikasi
  // Suara dibuat langsung via Web Audio API (tanpa file audio eksternal)
  // agar tidak bergantung pada aset yang mungkin belum ada.
  // ============================================================
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }
  function beep(freq, duration, delay = 0, gainVal = 0.5) {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.value = gainVal;
    osc.connect(gain).connect(ctx.destination);
    const startAt = ctx.currentTime + delay;
    osc.start(startAt);
    osc.stop(startAt + duration);
  }
  const ALARM_SOUND_PLAYERS = {
    silent: () => {},
    beep: () => beep(880, 0.18),
    siren: () => { for (let i = 0; i < 4; i++) beep(i % 2 ? 600 : 1000, 0.25, i * 0.25, 0.5); },
    triple_ding: () => { beep(1200, 0.12, 0); beep(1200, 0.12, 0.18); beep(1200, 0.12, 0.36); },
    long_alarm: () => { for (let i = 0; i < 6; i++) beep(1400, 0.35, i * 0.4, 0.55); },
  };
  function playAlarmSound(key) {
    (ALARM_SOUND_PLAYERS[key] || ALARM_SOUND_PLAYERS.beep)();
  }

  let notifSoundMapping = null;
  async function loadNotifSoundMapping() {
    const r = await apiCall("getNotificationSounds", {}).catch(() => null);
    notifSoundMapping = r?.mapping || {};
  }

  let lastSeenNotifIds = new Set();
  async function pollNotifications() {
    if (!getEmployee()) return;
    if (!notifSoundMapping) await loadNotifSoundMapping();
    const r = await apiCall("getMyNotifications", {}).catch(() => null);
    if (!r?.success) return;
    for (const n of r.notifications) {
      if (n.dibaca || lastSeenNotifIds.has(n.id)) continue;
      lastSeenNotifIds.add(n.id);
      const soundKey = notifSoundMapping?.[n.tipe] || notifSoundMapping?.default || "beep";
      playAlarmSound(soundKey);
    }
  }
  let notifPollTimer = setInterval(pollNotifications, 20000);
  // Hemat request: hentikan polling saat tab tidak aktif, lanjut+poll sekali saat aktif lagi
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInterval(notifPollTimer);
      notifPollTimer = null;
    } else {
      pollNotifications();
      notifPollTimer = setInterval(pollNotifications, 20000);
    }
  });
  document.addEventListener("click", () => { if (!audioCtx) getAudioCtx(); }, { once: true }); // unlock audio autoplay

  // Panel pengaturan bunyi notifikasi — hanya untuk Master Admin, di halaman Pengaturan
  function isSettingsPage() {
    return window.location.pathname.replace(/\/+$/, "").toLowerCase() === "/appsettings";
  }

  // Cari elemen teks "Tentang Aplikasi" di halaman Pengaturan (React), lalu tempatkan
  // panel kita TEPAT DI BAWAHNYA secara visual — tanpa memindahkan panel ke dalam
  // DOM React (supaya tidak ikut terhapus saat React me-render ulang halaman).
  function findAboutAppAnchor() {
    const all = document.querySelectorAll("h1,h2,h3,h4,h5,strong,b,span,div,p,label");
    for (const el of all) {
      if (el.children.length === 0 && /^tentang aplikasi$/i.test((el.textContent || "").trim())) {
        let anchor = el;
        for (let i = 0; i < 4 && anchor.parentElement && anchor.parentElement !== document.body; i++) {
          anchor = anchor.parentElement;
        }
        return anchor;
      }
    }
    return null;
  }
  function repositionSettingsFlex() {
    const panelWrap = document.getElementById("pis-settings-panel-wrap");
    if (!panelWrap) return;
    if (!isSettingsPage()) { panelWrap.classList.remove("show"); return; }
    const anchor = findAboutAppAnchor();
    if (!anchor) { panelWrap.classList.remove("show"); return; }
    const rect = anchor.getBoundingClientRect();
    panelWrap.style.position = "absolute";
    panelWrap.style.top = Math.round(window.scrollY + rect.bottom + 14) + "px";
    panelWrap.style.left = "0";
    panelWrap.style.right = "0";
    panelWrap.classList.add("show");
  }
  window.addEventListener("resize", repositionSettingsFlex);
  window.addEventListener("scroll", repositionSettingsFlex, { passive: true });
  setInterval(repositionSettingsFlex, 1200); // jaga posisi tetap benar saat navigasi SPA
  const SOUND_LABELS = {
    silent: "Tanpa Suara", beep: "Beep Pendek", siren: "Sirine",
    triple_ding: "Denting 3x", long_alarm: "Alarm Panjang (Keras)",
  };
  const NOTIF_TYPE_LABELS = {
    "PasswordResetRequest.created": "Permintaan Reset Password",
    "ShiftSwap.created": "Permintaan Tukar Shift",
    "FacilityTicket.created": "Tiket Fasilitas Baru",
    "Employee.updated": "Data Karyawan Diperbarui",
    "ShiftSchedule.updated": "Jadwal Shift Diperbarui",
    "PKWTContract.updated": "Kontrak PKWT Diperbarui",
    "default": "Notifikasi Lainnya (Default)",
  };

  let soundPanelBuilt = false;
  function moveBrandCardInline() {
    const brandCard = document.getElementById("pis-brand-card");
    const flexWrap = document.getElementById("pis-settings-flex");
    if (!brandCard || !flexWrap) return;
    brandCard.classList.add("show", "pis-inline");
    flexWrap.appendChild(brandCard); // urutan: Bunyi Notifikasi (kiri) -> Ganti Logo & Favicon (kanan)
  }
  async function buildSoundSettingsPanel() {
    const emp = getEmployee();
    if (!emp || emp.role !== "Master Admin" || soundPanelBuilt || !isSettingsPage()) return;
    soundPanelBuilt = true;

    const r = await apiCall("getNotificationSounds", {}).catch(() => null);
    if (!r?.success) { soundPanelBuilt = false; return; }

    const panel = document.createElement("div");
    panel.id = "pis-sound-settings";
    panel.style.cssText = "max-width:480px;margin:20px auto;background:#fff;border-radius:14px;padding:20px;box-shadow:0 4px 14px rgba(0,0,0,.1);font-family:system-ui,sans-serif;";
    let rows = "";
    for (const [tipe, label] of Object.entries(NOTIF_TYPE_LABELS)) {
            const current = (r.mapping && r.mapping[tipe]) || (r.mapping && r.mapping.default) || "beep";
      rows += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f0f0;">
        <span style="font-size:13px;">${label}</span>
        <select data-tipe="${tipe}" style="padding:4px 8px;border-radius:6px;border:1px solid #ddd;">
          ${r.available_sounds.map((s) => `<option value="${s}" ${s === current ? "selected" : ""}>${SOUND_LABELS[s] || s}</option>`).join("")}
        </select>
      </div>`;
    }
    panel.innerHTML = `<h3 style="color:#7B1A2C;margin:0 0 12px;font-size:16px;">🔔 Pengaturan Bunyi Notifikasi</h3>${rows}
      <button id="pis-save-sounds" style="width:100%;margin-top:14px;">Simpan Pengaturan Suara</button>`;

    // sisipkan ke wadah bersama halaman Pengaturan (berdampingan dgn kartu Ganti Logo & Favicon)
    const flexWrap = document.getElementById("pis-settings-flex") || document.body;
    flexWrap.appendChild(panel);
    moveBrandCardInline();
    repositionSettingsFlex();

    panel.querySelectorAll("select").forEach((sel) => {
      sel.addEventListener("change", () => playAlarmSound(sel.value)); // preview suara
    });
    panel.querySelector("#pis-save-sounds").addEventListener("click", async () => {
      const mapping = {};
      panel.querySelectorAll("select[data-tipe]").forEach((sel) => { mapping[sel.dataset.tipe] = sel.value; });
      const res = await apiCall("setNotificationSounds", { mapping });
      showToast(res.success ? "Pengaturan bunyi notifikasi disimpan." : (res.error || "Gagal menyimpan"), res.success ? "ok" : "fail");
      if (res.success) notifSoundMapping = mapping;
    });

    buildSourceBackupCard(flexWrap);
    buildEmployeeAreaAccessPanel(flexWrap);
  }

  // ============================================================
  // Akses Data Karyawan Antar Area — Master Admin, di halaman Pengaturan
  // "Data Karyawan" sudah otomatis tampil per area tugas sesi login (server-side).
  // Panel ini untuk mengatur pengecualian: jabatan tertentu boleh melihat data
  // karyawan LENGKAP dari area tertentu di luar area tugasnya sendiri.
  // ============================================================
  async function buildEmployeeAreaAccessPanel(container) {
    if (document.getElementById("pis-emp-area-access-card")) return;
    const emp = getEmployee();
    if (!emp || emp.role !== "Master Admin") return;

    const [ruleRes, nikRuleRes, areas] = await Promise.all([
      apiCall("getEmployeeAreaAccessRule", {}).catch(() => null),
      apiCall("getEmployeeAreaAccessNikRule", {}).catch(() => null),
      entityList("AreaProject").catch(() => []),
    ]);
    let rules = (ruleRes && ruleRes.success && Array.isArray(ruleRes.rules)) ? ruleRes.rules.slice() : [];
    let nikRules = (nikRuleRes && nikRuleRes.success && Array.isArray(nikRuleRes.rules)) ? nikRuleRes.rules.slice() : [];
    const areaList = Array.isArray(areas) ? areas : [];
    const areaOptionsHtml = areaList.map((a) => {
      const nama = a.nama_area || a.nama_proyek || a.id;
      return `<option value="${String(nama).replace(/"/g, "&quot;")}">${nama}</option>`;
    }).join("");

    const card = document.createElement("div");
    card.id = "pis-emp-area-access-card";
    card.style.cssText = "max-width:480px;background:#fff;border-radius:14px;padding:20px;box-shadow:0 4px 14px rgba(0,0,0,.1);font-family:system-ui,sans-serif;";
    card.innerHTML = `
      <h3 style="color:#7B1A2C;margin:0 0 8px;font-size:16px;">🗂️ Akses Data Karyawan Antar Area</h3>
      <p style="font-size:12.5px;color:#666;margin:0 0 14px;">
        "Data Karyawan" otomatis tampil sesuai area tugas masing-masing saat login.
        Gunakan pengaturan ini untuk mengizinkan jabatan tertentu, atau NIK karyawan
        tertentu, melihat &amp; MENGEDIT data karyawan LENGKAP dari area lain
        (mis. NIK PU072020001 Area A juga boleh melihat &amp; mengedit data karyawan Area B).
      </p>

      <h4 style="color:#7B1A2C;margin:14px 0 6px;font-size:13.5px;">Berdasarkan Jabatan</h4>
      <div id="pis-emp-area-rule-list" style="margin-bottom:12px;"></div>
      <input id="pis-emp-area-jabatan" type="text" placeholder="Nama Jabatan (mis. Supervisor)" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;margin-bottom:10px;box-sizing:border-box;" />
      <select id="pis-emp-area-target" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;margin-bottom:10px;box-sizing:border-box;">
        <option value="">Pilih Area yang boleh dilihat...</option>
        ${areaOptionsHtml}
      </select>
      <button id="pis-emp-area-add" style="width:100%;margin-bottom:6px;">+ Tambah Aturan Jabatan</button>
      <button id="pis-emp-area-save" style="width:100%;margin-bottom:18px;">Simpan Aturan Jabatan</button>

      <h4 style="color:#7B1A2C;margin:14px 0 6px;font-size:13.5px;border-top:1px solid #f0f0f0;padding-top:14px;">Berdasarkan NIK Karyawan</h4>
      <p style="font-size:12px;color:#888;margin:0 0 10px;">Untuk mengizinkan satu karyawan tertentu (bukan seluruh jabatannya) melihat data area lain.</p>
      <div id="pis-emp-area-nik-rule-list" style="margin-bottom:12px;"></div>
      <input id="pis-emp-area-nik" type="text" placeholder="NIK Karyawan (mis. PU072020001)" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;margin-bottom:10px;box-sizing:border-box;" />
      <select id="pis-emp-area-nik-target" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;margin-bottom:10px;box-sizing:border-box;">
        <option value="">Pilih Area yang boleh dilihat...</option>
        ${areaOptionsHtml}
      </select>
      <button id="pis-emp-area-nik-add" style="width:100%;margin-bottom:6px;">+ Tambah Aturan NIK</button>
      <button id="pis-emp-area-nik-save" style="width:100%;">Simpan Aturan NIK</button>
    `;
    container.appendChild(card);

    function renderRuleList() {
      const wrap = card.querySelector("#pis-emp-area-rule-list");
      if (!rules.length) {
        wrap.innerHTML = `<div style="font-size:12.5px;color:#999;">Belum ada aturan tambahan. Setiap jabatan hanya melihat data karyawan area tugasnya sendiri.</div>`;
        return;
      }
      wrap.innerHTML = rules.map((r, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">
          <span><b>${r.jabatan}</b> &rarr; ${r.area_target}</span>
          <button data-idx="${i}" class="pis-emp-area-remove" style="padding:2px 8px;">Hapus</button>
        </div>`).join("");
      wrap.querySelectorAll(".pis-emp-area-remove").forEach((btn) => {
        btn.addEventListener("click", () => {
          rules.splice(parseInt(btn.dataset.idx, 10), 1);
          renderRuleList();
        });
      });
    }
    renderRuleList();

    function renderNikRuleList() {
      const wrap = card.querySelector("#pis-emp-area-nik-rule-list");
      if (!nikRules.length) {
        wrap.innerHTML = `<div style="font-size:12.5px;color:#999;">Belum ada karyawan dengan akses lintas area.</div>`;
        return;
      }
      wrap.innerHTML = nikRules.map((r, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">
          <span><b>${r.nik}</b> &rarr; ${r.area_target}</span>
          <button data-idx="${i}" class="pis-emp-area-nik-remove" style="padding:2px 8px;">Hapus</button>
        </div>`).join("");
      wrap.querySelectorAll(".pis-emp-area-nik-remove").forEach((btn) => {
        btn.addEventListener("click", () => {
          nikRules.splice(parseInt(btn.dataset.idx, 10), 1);
          renderNikRuleList();
        });
      });
    }
    renderNikRuleList();

    card.querySelector("#pis-emp-area-add").addEventListener("click", () => {
      const jabatanInput = card.querySelector("#pis-emp-area-jabatan");
      const targetSelect = card.querySelector("#pis-emp-area-target");
      const jabatan = jabatanInput.value.trim();
      const areaTarget = targetSelect.value;
      if (!jabatan) return showToast("Isi nama jabatan terlebih dahulu.", "fail");
      if (!areaTarget) return showToast("Pilih area yang boleh dilihat.", "fail");
      rules.push({ jabatan, area_target: areaTarget });
      jabatanInput.value = "";
      targetSelect.value = "";
      renderRuleList();
    });

    card.querySelector("#pis-emp-area-save").addEventListener("click", async () => {
      const btn = card.querySelector("#pis-emp-area-save");
      btn.disabled = true;
      const res = await apiCall("setEmployeeAreaAccessRule", { rules }).catch((e) => ({ success: false, error: e.message }));
      btn.disabled = false;
      showToast(res.success ? "Aturan jabatan disimpan." : (res.error || "Gagal menyimpan"), res.success ? "ok" : "fail");
      if (res.success && Array.isArray(res.rules)) rules = res.rules.slice();
    });

    card.querySelector("#pis-emp-area-nik-add").addEventListener("click", () => {
      const nikInput = card.querySelector("#pis-emp-area-nik");
      const targetSelect = card.querySelector("#pis-emp-area-nik-target");
      const nik = nikInput.value.trim();
      const areaTarget = targetSelect.value;
      if (!nik) return showToast("Isi NIK karyawan terlebih dahulu.", "fail");
      if (!areaTarget) return showToast("Pilih area yang boleh dilihat.", "fail");
      nikRules.push({ nik, area_target: areaTarget });
      nikInput.value = "";
      targetSelect.value = "";
      renderNikRuleList();
    });

    card.querySelector("#pis-emp-area-nik-save").addEventListener("click", async () => {
      const btn = card.querySelector("#pis-emp-area-nik-save");
      btn.disabled = true;
      const res = await apiCall("setEmployeeAreaAccessNikRule", { rules: nikRules }).catch((e) => ({ success: false, error: e.message }));
      btn.disabled = false;
      showToast(res.success ? "Aturan NIK disimpan." : (res.error || "Gagal menyimpan"), res.success ? "ok" : "fail");
      if (res.success && Array.isArray(res.rules)) nikRules = res.rules.slice();
    });
  }

  // ============================================================
  // Download Source Project (ZIP) — Master Admin, di halaman Pengaturan
  // ============================================================
  function buildSourceBackupCard(container) {
    if (document.getElementById("pis-source-backup-card")) return;
    const card = document.createElement("div");
    card.id = "pis-source-backup-card";
    card.style.cssText = "max-width:480px;background:#fff;border-radius:14px;padding:20px;box-shadow:0 4px 14px rgba(0,0,0,.1);font-family:system-ui,sans-serif;";
    card.innerHTML = `
      <h3 style="color:#7B1A2C;margin:0 0 8px;font-size:16px;">📦 Download Source Project</h3>
      <p style="font-size:12.5px;color:#666;margin:0 0 14px;">
        Unduh seluruh source (worker.js, wrangler.jsonc, public/, schema.sql, dll) dalam satu file ZIP,
        untuk diperbaiki atau di-deploy ulang ke Cloudflare.
      </p>
      <button id="pis-download-source-btn" style="width:100%;">⬇️ Download Source Project (ZIP)</button>
    `;
    container.appendChild(card);

    card.querySelector("#pis-download-source-btn").addEventListener("click", async () => {
      const btn = card.querySelector("#pis-download-source-btn");
      btn.disabled = true;
      btn.textContent = "Menyiapkan file...";
      try {
        const token = getToken();
        const res = await fetch("/api/admin/download-source", {
          headers: token ? { "X-Employee-Token": token } : {},
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          showToast(err.error || "Gagal mengunduh source project.", "fail");
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "pis_project_source.zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast("Download dimulai.", "ok");
      } catch (e) {
        showToast("Gagal mengunduh: " + e.message, "fail");
      } finally {
        btn.disabled = false;
        btn.textContent = "⬇️ Download Source Project (ZIP)";
      }
    });
  }
  const soundPanelObserver = new MutationObserver(() => buildSoundSettingsPanel());
  soundPanelObserver.observe(document.body, { childList: true, subtree: true });
  buildSoundSettingsPanel();

  // ============================================================
  // Lock GPS e-absensi untuk Area/Proyek (radius 5 meter - 1 km)
  // Karena form tambah/edit Area/Proyek asli ada di dalam bundle React
  // yang tidak bisa disisipi field baru dengan aman, disediakan panel
  // terpisah yang memanggil API entity AreaProject yang sama.
  // ============================================================
  function isAreaProjectPage() {
    return /area|proyek|project/i.test(window.location.pathname);
  }

  async function entityList(entity) {
    const token = getToken();
    const res = await fetch(`/api/apps/entities/${entity}?limit=500`, {
      headers: token ? { "X-Employee-Token": token } : {},
    });
    return res.json().catch(() => []);
  }
  async function entityUpdate(entity, id, body) {
    const token = getToken();
    const res = await fetch(`/api/apps/entities/${entity}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(token ? { "X-Employee-Token": token } : {}) },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  function findTemplateXlsxAnchor() {
    const candidates = document.querySelectorAll('button, a, [role="button"]');
    for (const el of candidates) {
      const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (/template\s*xlsx/i.test(txt)) return el;
    }
    return null;
  }

  // Sisipkan "Lock GPS Absensi" sungguhan ke dalam toolbar, tepat di
  // sebelah kiri tombol "Template XLSX" — dengan meng-clone tombol
  // tersebut (supaya kelas/gaya CSS-nya identik dengan tombol asli di
  // toolbar itu), bukan lagi elemen lepas yang posisinya dihitung ulang
  // terus-menerus dengan position:absolute (itu sebabnya dulu tampilannya
  // beda sendiri, seperti widget mengambang).
  function injectGpsLockButton() {
    const emp = getEmployee();
    if (!emp) return;
    if (!isAreaProjectPage()) return;

    const anchor = findTemplateXlsxAnchor();
    if (!anchor) return;
    const parent = anchor.parentElement;
    if (!parent) return;
    if (parent.querySelector('[data-pisgpslock-btn="1"]')) return; // sudah disuntik

    const clone = anchor.cloneNode(true);
    clone.removeAttribute("id");
    clone.setAttribute("data-pisgpslock-btn", "1");
    clone.textContent = "📍 Lock GPS Absensi";
    clone.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openGpsLockModal();
    });

    anchor.insertAdjacentElement("beforebegin", clone);
  }

  async function openGpsLockModal() {
    let existing = document.getElementById("pis-gpslock-modal");
    if (existing) { existing.style.display = "flex"; return; }

    const modal = document.createElement("div");
    modal.id = "pis-gpslock-modal";
    modal.className = "show";
    modal.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;";
    modal.innerHTML = `
      <div style="background:#fff;border-radius:14px;max-width:420px;width:100%;padding:22px;font-family:system-ui,sans-serif;">
        <h3 style="color:#7B1A2C;margin:0 0 14px;font-size:16px;">📍 Lock GPS E-Absensi</h3>
        <label style="display:block;font-size:12px;color:#555;margin-bottom:4px;">Pilih Area/Proyek</label>
        <select id="pis-gps-area" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;margin-bottom:12px;"><option>Memuat...</option></select>

        <label style="display:block;font-size:12px;color:#555;margin-bottom:4px;">Latitude</label>
        <input id="pis-gps-lat" type="number" step="any" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;margin-bottom:12px;" placeholder="-6.200000" />

        <label style="display:block;font-size:12px;color:#555;margin-bottom:4px;">Longitude</label>
        <input id="pis-gps-lng" type="number" step="any" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;margin-bottom:12px;" placeholder="106.816666" />

        <button id="pis-gps-usecurrent" style="width:100%;margin-bottom:12px;">📌 Ambil Lokasi Saat Ini</button>

        <label style="display:block;font-size:12px;color:#555;margin-bottom:4px;">Radius Absensi (meter, 5 - 1000)</label>
        <input id="pis-gps-radius" type="number" min="5" max="1000" value="100" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;margin-bottom:16px;" />

        <div style="display:flex;gap:8px;">
          <button id="pis-gps-close" style="flex:1;">Tutup</button>
          <button id="pis-gps-save" style="flex:1;">Simpan</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const select = document.getElementById("pis-gps-area");
    const areas = await entityList("AreaProject").catch(() => []);
    select.innerHTML = (Array.isArray(areas) ? areas : []).map(
      (a) => `<option value="${a.id}">${a.nama_area || a.nama_proyek || a.id}</option>`
    ).join("") || "<option>Tidak ada data Area/Proyek</option>";

    function fillFromSelected() {
      const a = (areas || []).find((x) => x.id === select.value);
      document.getElementById("pis-gps-lat").value = a?.latitude ?? "";
      document.getElementById("pis-gps-lng").value = a?.longitude ?? "";
      document.getElementById("pis-gps-radius").value = a?.radius_absensi_meter ?? 100;
    }
    select.addEventListener("change", fillFromSelected);
    fillFromSelected();

    document.getElementById("pis-gps-usecurrent").addEventListener("click", () => {
      if (!navigator.geolocation) return showToast("Geolocation tidak didukung browser ini.", "fail");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          document.getElementById("pis-gps-lat").value = pos.coords.latitude.toFixed(6);
          document.getElementById("pis-gps-lng").value = pos.coords.longitude.toFixed(6);
        },
        () => showToast("Gagal mengambil lokasi. Izinkan akses lokasi di browser.", "fail")
      );
    });

    modal.querySelector("#pis-gps-close").addEventListener("click", () => { modal.style.display = "none"; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });

    document.getElementById("pis-gps-save").addEventListener("click", async () => {
      const id = select.value;
      const lat = parseFloat(document.getElementById("pis-gps-lat").value);
      const lng = parseFloat(document.getElementById("pis-gps-lng").value);
      const radius = parseInt(document.getElementById("pis-gps-radius").value, 10);
      if (!id) return showToast("Pilih Area/Proyek terlebih dahulu.", "fail");
      if (isNaN(lat) || isNaN(lng)) return showToast("Latitude/Longitude wajib diisi.", "fail");
      if (isNaN(radius) || radius < 5 || radius > 1000) return showToast("Radius harus antara 5 - 1000 meter.", "fail");

      const res = await entityUpdate("AreaProject", id, { latitude: lat, longitude: lng, radius_absensi_meter: radius });
      if (res?.error) showToast(res.error, "fail");
      else { showToast("Lock GPS e-absensi berhasil disimpan.", "ok"); modal.style.display = "none"; }
    });
  }
  // ============================================================
  // #17 — Jadwal Shift Visual (Excel-Style) sinkron dengan regu karyawan
  // ============================================================
  async function loadShiftMatrix() {
    const emp = getEmployee();
    if (!emp) return;

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const areaId = emp.area_tugas || '';
    if (!areaId) return;

    try {
      const res = await fetch(`/api/apps/functions/getShiftMatrix?area_id=${encodeURIComponent(areaId)}&month=${month}&year=${year}`);
      const data = await res.json();
      if (!data?.success) return;

      renderShiftMatrix(data);
    } catch (e) { console.error('Shift matrix error:', e); }
  }

  function renderShiftMatrix(data) {
    const days = data.days_in_month;
    const monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    
    // Cari container jadwal shift
    let container = document.querySelector('[data-shift-matrix]') || document.querySelector('.shift-schedule-container');
    if (!container) {
      container = document.createElement('div');
      container.setAttribute('data-shift-matrix', '1');
      container.style.cssText = 'overflow-x:auto;margin-top:16px;';
      // Coba insert setelah elemen jadwal yang ada
      const shiftSection = document.querySelector('[class*="shift" i], [class*="jadwal" i]');
      if (shiftSection) shiftSection.parentElement.appendChild(container);
      else document.body.appendChild(container);
    }

    // Header info
    let html = `
      <div style="padding:12px;background:#f8f8f8;border-radius:8px;margin-bottom:12px;">
        <b>Jadwal Shift — ${monthNames[data.month - 1]} ${data.year}</b><br>
        <span style="font-size:12px;color:#666;">Area: ${data.area_id} | Karyawan: ${data.matrix.length} orang</span>
      </div>
    `;

    // Legend
    html += `
      <div style="display:flex;gap:12px;margin-bottom:10px;font-size:12px;flex-wrap:wrap;">
        <span style="background:#e8f5e9;padding:4px 10px;border-radius:4px;">KERJA</span>
        <span style="background:#ffebee;padding:4px 10px;border-radius:4px;">L = Libur</span>
        <span style="background:#e3f2fd;padding:4px 10px;border-radius:4px;">A/B/C/D = Regu</span>
      </div>
    `;

    // Table
    html += '<table style="border-collapse:collapse;font-size:11px;width:100%;min-width:800px;"><thead><tr style="background:#7B1A2C;color:#fff;">';
    html += '<th style="padding:6px 8px;text-align:left;position:sticky;left:0;background:#7B1A2C;z-index:2;">NIK</th>';
    html += '<th style="padding:6px 8px;text-align:left;position:sticky;left:60px;background:#7B1A2C;z-index:2;">Nama</th>';
    html += '<th style="padding:6px 8px;position:sticky;left:200px;background:#7B1A2C;z-index:2;">Regu</th>';
    
    for (let d = 1; d <= days; d++) {
      const date = new Date(data.year, data.month - 1, d);
      const dow = date.getDay();
      const isWeekend = dow === 0 || dow === 6;
      html += `<th style="padding:4px 6px;text-align:center;${isWeekend ? 'background:#5a0f1e;' : ''}">${d}</th>`;
    }
    html += '</tr></thead><tbody>';

    let currentRegu = '';
    data.matrix.forEach((row, idx) => {
      // Separator per regu
      if (row.regu !== currentRegu) {
        currentRegu = row.regu;
        html += `<tr style="background:#f0f0f0;"><td colspan="${days + 3}" style="padding:6px 8px;font-weight:700;color:#7B1A2C;">${row.regu_label} — ${row.jam_kerja} jam${row.ikatan_jam ? '' : ' (bebas, tidak ada ikatan)'}</td></tr>`;
      }

      const rowBg = idx % 2 === 0 ? '#fff' : '#fafafa';
      html += `<tr style="background:${rowBg};">`;
      html += `<td style="padding:4px 8px;position:sticky;left:0;background:${rowBg};z-index:1;font-family:monospace;">${row.nik}</td>`;
      html += `<td style="padding:4px 8px;position:sticky;left:60px;background:${rowBg};z-index:1;">${row.nama}</td>`;
      html += `<td style="padding:4px 8px;position:sticky;left:200px;background:${rowBg};z-index:1;text-align:center;font-weight:700;">${row.regu === 'NonShift' ? 'NS' : row.regu}</td>`;
      
      for (let d = 1; d <= days; d++) {
        const day = row.days[d];
        const cellStyle = day.status === 'OFF' 
          ? 'background:#ffebee;color:#c62828;text-align:center;padding:3px;'
          : 'background:#e8f5e9;color:#2e7d32;text-align:center;padding:3px;font-weight:600;';
        html += `<td style="${cellStyle}">${day.label}</td>`;
      }
      html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  // Auto-load saat halaman jadwal shift terbuka
  const shiftObserver = new MutationObserver(() => {
    const shiftPage = document.querySelector('[class*="shift" i], [class*="jadwal" i]');
    if (shiftPage && !document.querySelector('[data-shift-matrix]')) {
      loadShiftMatrix();
    }
  });
  shiftObserver.observe(document.body, { childList: true, subtree: true });

  const gpsPageObserver = new MutationObserver(() => {
    injectGpsLockButton();
  });
  gpsPageObserver.observe(document.body, { childList: true, subtree: true });
  injectGpsLockButton();
  setInterval(injectGpsLockButton, 1200);
    // ============================================================
  // #17 — Jadwal Shift Visual (Excel-Style) sinkron dengan regu
  // ============================================================
  async function loadShiftMatrix() {
    const emp = getEmployee();
    if (!emp) return;

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const areaId = emp.area_tugas || '';
    if (!areaId) return;

    try {
      const res = await fetch("/api/apps/functions/getShiftMatrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area_tugas: areaId, month, year }),
      });
      const data = await res.json();
      if (!data?.success) return;
      renderShiftMatrix(data);
    } catch (e) { console.error("Shift matrix error:", e); }
  }

  function renderShiftMatrix(data) {
    const days = data.days_in_month;
    const monthNames = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

    let container = document.querySelector("[data-shift-matrix]");
    if (!container) {
      container = document.createElement("div");
      container.setAttribute("data-shift-matrix", "1");
      container.style.cssText = "overflow-x:auto;margin-top:16px;";
      const shiftSection = document.querySelector('[class*="shift" i], [class*="jadwal" i]');
      if (shiftSection) shiftSection.parentElement.appendChild(container);
      else document.body.appendChild(container);
    }

    let html = `
      <div style="padding:12px;background:#f8f8f8;border-radius:8px;margin-bottom:12px;">
        <b>Jadwal Shift — ${monthNames[data.month - 1]} ${data.year}</b><br>
        <span style="font-size:12px;color:#666;">Area: ${data.area_tugas} | Karyawan: ${data.matrix.length} orang</span>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:10px;font-size:12px;flex-wrap:wrap;">
        <span style="background:#e8f5e9;padding:4px 10px;border-radius:4px;">KERJA</span>
        <span style="background:#ffebee;padding:4px 10px;border-radius:4px;">L = Libur</span>
        <span style="background:#e3f2fd;padding:4px 10px;border-radius:4px;">A/B/C/D = Regu</span>
        <span style="background:#fff3e0;padding:4px 10px;border-radius:4px;">N = Non Shift</span>
      </div>
    `;

    html += '<table style="border-collapse:collapse;font-size:11px;width:100%;min-width:800px;"><thead><tr style="background:#7B1A2C;color:#fff;">';
    html += '<th style="padding:6px 8px;text-align:left;position:sticky;left:0;background:#7B1A2C;z-index:2;">NIK</th>';
    html += '<th style="padding:6px 8px;text-align:left;position:sticky;left:80px;background:#7B1A2C;z-index:2;">Nama</th>';
    html += '<th style="padding:6px 8px;position:sticky;left:220px;background:#7B1A2C;z-index:2;">Regu</th>';

    for (let d = 1; d <= days; d++) {
      const date = new Date(data.year, data.month - 1, d);
      const dow = date.getDay();
      const isWeekend = dow === 0 || dow === 6;
      html += `<th style="padding:4px 6px;text-align:center;${isWeekend ? "background:#5a0f1e;" : ""}">${d}</th>`;
    }
    html += "</tr></thead><tbody>";

    let currentRegu = "";
    data.matrix.forEach((row, idx) => {
      if (row.regu !== currentRegu) {
        currentRegu = row.regu;
        html += `<tr style="background:#f0f0f0;"><td colspan="${days + 3}" style="padding:6px 8px;font-weight:700;color:#7B1A2C;">${row.regu_label} — ${row.jam_kerja} jam${row.ikatan_jam ? "" : " (bebas, tidak ada ikatan jam)"}</td></tr>`;
      }

      const rowBg = idx % 2 === 0 ? "#fff" : "#fafafa";
      html += `<tr style="background:${rowBg};">`;
      html += `<td style="padding:4px 8px;position:sticky;left:0;background:${rowBg};z-index:1;font-family:monospace;">${row.nik}</td>`;
      html += `<td style="padding:4px 8px;position:sticky;left:80px;background:${rowBg};z-index:1;">${row.nama}</td>`;
      html += `<td style="padding:4px 8px;position:sticky;left:220px;background:${rowBg};z-index:1;text-align:center;font-weight:700;">${row.regu === "Non Regu" || row.regu === "Non Shift" ? "NS" : row.regu.slice(-1)}</td>`;

      for (let d = 1; d <= days; d++) {
        const day = row.days[d];
        let cellStyle, cellText;
        if (day.status === "OFF") {
          cellStyle = "background:#ffebee;color:#c62828;text-align:center;padding:3px;";
          cellText = day.label;
        } else if (row.regu === "Non Regu" || row.regu === "Non Shift") {
          cellStyle = "background:#fff3e0;color:#e65100;text-align:center;padding:3px;font-weight:600;";
          cellText = day.label;
        } else {
          cellStyle = "background:#e8f5e9;color:#2e7d32;text-align:center;padding:3px;font-weight:600;";
          cellText = day.label;
        }
        html += `<td style="${cellStyle}">${cellText}</td>`;
      }
      html += "</tr>";
    });

    html += "</tbody></table>";
    container.innerHTML = html;
  }

  // Auto-load saat halaman jadwal shift terbuka
  const shiftMatrixObserver = new MutationObserver(() => {
    const shiftPage = document.querySelector('[class*="shift" i], [class*="jadwal" i]');
    if (shiftPage && !document.querySelector("[data-shift-matrix]")) {
      loadShiftMatrix();
    }
  });
  shiftMatrixObserver.observe(document.body, { childList: true, subtree: true });
})();