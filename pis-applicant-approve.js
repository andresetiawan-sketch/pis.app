/**
 * PIS — PERBAIKAN ALUR PENERIMAAN PELAMAR KERJA (lapisan tambahan, tidak
 * menyentuh bundle React index-*.js — pola yang sama dengan
 * pis-enhancements.js / pis-recruitment-form.js / pis-pkwt-generator.js).
 *
 * Masalah yang diperbaiki di sini:
 *  1) Di halaman "Data Pelamar", mengubah status ke "Approved" langsung
 *     memanggil PUT /api/apps/entities/Applicant/:id (lihat worker.js).
 *     Sekarang server MEWAJIBKAN memilih PT (PT. Putra Indonesia Solusi /
 *     PT. Prestasi Indonesia Solusi) sebelum boleh menyetujui — supaya
 *     Admin tidak lupa memilih badan hukum yang menaungi karyawan baru.
 *     Bagian ini mencegat (intercept) permintaan PUT tsb SEBELUM terkirim:
 *     begitu Admin memilih "Approved" di dropdown status, sebuah panel
 *     pilihan PT langsung muncul, lalu baru permintaan asli dikirim ulang
 *     dengan "entity_pt" disertakan.
 *  2) Di halaman publik "Cek Status Lamaran" (ApplyJobStatus), teks
 *     panduan login sebelumnya menampilkan tulisan tetap/hard-coded
 *     "Password default: 123456" — padahal password yang sungguh-sungguh
 *     dibuatkan sistem untuk karyawan baru adalah PASSWORD ACAK (lihat
 *     generatePassword() di worker.js), bukan "123456". Bagian ini
 *     mengambil password acak yang sebenarnya (field password_assigned di
 *     data Applicant) lalu menimpa teks "123456" itu dengan nilai asli,
 *     supaya pelamar benar-benar bisa login memakai NIK & password yang
 *     ditampilkan.
 */
(function () {
  "use strict";

  const PT_OPTIONS = ["PT. PUTRA INDONESIA SOLUSI", "PT. PRESTASI INDONESIA SOLUSI"];

  // ============================================================
  // Bagian 1: Panel pilihan PT saat menyetujui pelamar
  // ============================================================
  const style = document.createElement("style");
  style.textContent = `
    .pisap-overlay {
      position: fixed; inset: 0; background: rgba(17,17,20,.5); z-index: 10000;
      display: flex; align-items: center; justify-content: center; padding: 16px;
      font: 400 13.5px system-ui, sans-serif;
    }
    .pisap-modal {
      background: #fff; border-radius: 16px; width: 100%; max-width: 440px;
      padding: 22px 24px; box-shadow: 0 20px 50px rgba(0,0,0,.25); color: #1f2937;
    }
    .pisap-modal h2 { font-size: 16px; font-weight: 800; color: #7B1A2C; margin: 0 0 6px; }
    .pisap-modal p.pisap-sub { color: #6b7280; font-size: 12.5px; margin: 0 0 16px; line-height: 1.5; }
    .pisap-pt-btn {
      display: block; width: 100%; text-align: left; font: 700 13.5px system-ui, sans-serif;
      color: #7B1A2C; background: #fdf2f3; border: 1.5px solid #e5c9ce; border-radius: 10px;
      padding: 12px 14px; margin-bottom: 10px; cursor: pointer;
    }
    .pisap-pt-btn:hover { background: #fbe4e6; }
    .pisap-actions { display: flex; justify-content: flex-end; margin-top: 6px; }
    .pisap-cancel {
      font: 600 12.5px system-ui, sans-serif; color: #6b7280; background: #fff;
      border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 14px; cursor: pointer;
    }
  `;
  document.head.appendChild(style);

  // Menampilkan panel pilihan PT, mengembalikan Promise<string|null>
  // (null jika Admin membatalkan).
  function askForEntityPt() {
    return new Promise((resolve) => {
      if (document.getElementById("pisap-overlay")) {
        document.getElementById("pisap-overlay").remove();
      }
      const overlay = document.createElement("div");
      overlay.id = "pisap-overlay";
      overlay.className = "pisap-overlay";
      overlay.innerHTML = `
        <div class="pisap-modal">
          <h2>✅ Setujui Lamaran — Pilih PT</h2>
          <p class="pisap-sub">Pelamar akan otomatis dibuatkan akun karyawan (NIK ID & password) begitu PT dipilih. Pilih badan hukum yang menaungi karyawan ini:</p>
          ${PT_OPTIONS.map((pt, i) => `<button type="button" class="pisap-pt-btn" data-pt-idx="${i}">${pt}</button>`).join("")}
          <div class="pisap-actions">
            <button type="button" class="pisap-cancel" id="pisap-cancel-btn">Batalkan</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      function cleanup(value) {
        overlay.remove();
        resolve(value);
      }
      overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(null); });
      overlay.querySelector("#pisap-cancel-btn").addEventListener("click", () => cleanup(null));
      overlay.querySelectorAll("[data-pt-idx]").forEach((btn) => {
        btn.addEventListener("click", () => cleanup(PT_OPTIONS[Number(btn.getAttribute("data-pt-idx"))]));
      });
    });
  }

  function parseBody(init) {
    if (!init || init.body == null) return null;
    if (typeof init.body !== "string") return null;
    try { return JSON.parse(init.body); } catch { return null; }
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (...args) {
    try {
      const input = args[0];
      const init = args[1] || {};
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const method = (init.method || (typeof input !== "string" && input && input.method) || "GET").toUpperCase();

      if (method === "PUT" && /\/api\/apps\/entities\/Applicant(s)?\/[^/?]+/.test(url)) {
        const bodyObj = parseBody(init);
        const isApproving = bodyObj && (bodyObj.status === "Approved" || bodyObj.status === "Diterima");
        if (isApproving && !bodyObj.entity_pt) {
          const chosenPt = await askForEntityPt();
          if (!chosenPt) {
            // Admin membatalkan pemilihan PT → jangan kirim permintaan sama sekali.
            return new Response(
              JSON.stringify({ success: false, error: "Dibatalkan: pilih PT terlebih dahulu untuk menyetujui lamaran." }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          bodyObj.entity_pt = chosenPt;
          const newInit = { ...init, body: JSON.stringify(bodyObj) };
          const res = await originalFetch(url, newInit);
          try {
            const clone = res.clone();
            clone.json().then((data) => {
              if (data && data.success !== false && data.nik_karyawan) {
                window.alert(
                  `Lamaran disetujui!\n\nAkun karyawan otomatis dibuat:\nNIK ID Karyawan: ${data.nik_karyawan}\nPassword: ${data.password_assigned || "-"}\n\nPelamar dapat melihat info ini kembali lewat "Cek Status Lamaran Kerja".`
                );
              }
            }).catch(() => {});
          } catch {}
          return res;
        }
      }
    } catch (e) {
      // Jika ada error tak terduga saat intersepsi, jangan sampai memblokir fetch asli.
    }
    return originalFetch(...args);
  };

  // ============================================================
  // Bagian 2: Perbaikan tampilan password di halaman "Cek Status Lamaran"
  // ============================================================
  function isApplyStatusPage() {
    return window.location.pathname.replace(/\/+$/, "") === "/ApplyJobStatus";
  }

  function findLabelInputs() {
    // Kolom "NIK E-KTP" & "No. Telepon/WA" di form Cek Status Lamaran.
    const labels = Array.from(document.querySelectorAll("label")).filter(
      (el) => el.textContent && el.textContent.trim().length > 0
    );
    let nikInput = null, phoneInput = null;
    for (const label of labels) {
      const text = label.textContent.trim();
      const container = label.parentElement;
      if (!container) continue;
      const input = container.querySelector("input");
      if (!input) continue;
      if (text === "NIK E-KTP") nikInput = input;
      if (/No\. Telepon/i.test(text)) phoneInput = input;
    }
    return { nikInput, phoneInput };
  }

  async function fetchApplicantRecord(nik, phone) {
    try {
      let url = null;
      if (nik) url = `/api/apps/entities/Applicant?nik_ektp=${encodeURIComponent(nik)}`;
      else if (phone) url = `/api/apps/entities/Applicant?no_telepon=${encodeURIComponent(phone)}`;
      if (!url) return null;
      const res = await originalFetch(url);
      const data = await res.json().catch(() => null);
      return Array.isArray(data) && data.length ? data[0] : null;
    } catch {
      return null;
    }
  }

  function patchPasswordDisplay(applicant) {
    if (!applicant) return;
    const password = applicant.password_assigned;
    if (!password) return;
    // Cari teks "123456" (nilai hard-coded lama) di dalam panduan login &
    // timpa dengan password acak yang sesungguhnya dibuatkan sistem.
    const candidates = document.querySelectorAll(".bg-emerald-50 strong, .bg-white strong");
    candidates.forEach((el) => {
      if (el.textContent.trim() === "123456" && el.dataset.pisapPatched !== "1") {
        el.textContent = password;
        el.dataset.pisapPatched = "1";
      }
    });
  }

  let lastNik = "", lastPhone = "";

  if (isApplyStatusPage()) {
    const qs = new URLSearchParams(window.location.search);
    lastNik = qs.get("nik") || "";
    lastPhone = qs.get("phone") || "";
  }

  function captureInputsOnClick() {
    document.addEventListener("click", (e) => {
      if (!isApplyStatusPage()) return;
      const btn = e.target.closest && e.target.closest("button");
      if (!btn) return;
      const txt = (btn.textContent || "").trim();
      if (!/Cek Status/i.test(txt)) return;
      const { nikInput, phoneInput } = findLabelInputs();
      lastNik = (nikInput && nikInput.value.trim()) || "";
      lastPhone = (phoneInput && phoneInput.value.trim()) || "";
    });
  }
  captureInputsOnClick();

  // ------------------------------------------------------------------
  // Cegah request API berturut-turut: statusObserver di bawah terpicu pada
  // HAMPIR SETIAP perubahan DOM di seluruh halaman (childList+subtree pada
  // document.body), yang bisa terjadi puluhan kali per detik saat React
  // re-render. Sebelumnya tryPatchResultPanel() memanggil fetchApplicantRecord
  // (request API sungguhan) di SETIAP pemicu itu tanpa cache/throttle sama
  // sekali, jadi ratusan request beruntun ke endpoint yang sama dalam
  // beberapa detik. Tiga pengaman dipasang:
  //  1) hasil fetch di-cache per nik/phone -> tidak fetch ulang kalau sudah dapat
  //  2) percobaan yang gagal (data belum ada) di-throttle, jeda 2 detik
  //  3) begitu password sudah berhasil ditimpa di DOM, observer berhenti total
  // ------------------------------------------------------------------
  let cachedApplicant = null;
  let cachedForKey = "";
  let lastFetchAttemptAt = 0;
  let fetchInFlight = false;
  let patchedDone = false;
  const FETCH_RETRY_MS = 2000;

  async function tryPatchResultPanel() {
    if (patchedDone) return;
    if (!isApplyStatusPage()) return;
    if (!lastNik && !lastPhone) return;
    // Hanya lanjut kalau kartu hasil "Informasi Akun Anda" sudah tampil di DOM.
    const hasResultCard = Array.from(document.querySelectorAll("p, h2")).some(
      (el) => el.textContent && /Informasi Akun Anda|Selamat!/i.test(el.textContent)
    );
    if (!hasResultCard) return;

    const key = `${lastNik}|${lastPhone}`;
    if (key !== cachedForKey) { cachedApplicant = null; cachedForKey = key; }

    if (!cachedApplicant) {
      if (fetchInFlight) return; // sudah ada request yang sedang berjalan
      const now = Date.now();
      if (now - lastFetchAttemptAt < FETCH_RETRY_MS) return; // throttle percobaan ulang
      lastFetchAttemptAt = now;
      fetchInFlight = true;
      try {
        cachedApplicant = await fetchApplicantRecord(lastNik, lastPhone);
      } finally {
        fetchInFlight = false;
      }
      if (!cachedApplicant) return; // belum ada datanya, coba lagi nanti (sudah di-throttle)
    }

    patchPasswordDisplay(cachedApplicant);

    // Kalau sudah tidak ada lagi placeholder "123456" tersisa, berarti sudah
    // sepenuhnya berhasil ditimpa -> hentikan observer/permanen, tidak perlu
    // request API lagi sama sekali untuk sesi ini.
    const stillHasPlaceholder = Array.from(
      document.querySelectorAll(".bg-emerald-50 strong, .bg-white strong")
    ).some((el) => el.textContent.trim() === "123456");
    if (!stillHasPlaceholder) {
      patchedDone = true;
      statusObserver.disconnect();
    }
  }

  const statusObserver = new MutationObserver(() => tryPatchResultPanel());
  statusObserver.observe(document.body, { childList: true, subtree: true });
})();