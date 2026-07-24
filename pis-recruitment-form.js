/**
 * PIS RECRUITMENT FORM — lapisan tambahan untuk "E-RECRUITMENT PIS /
 * Formulir Lamaran Kerja" (tidak menyentuh bundle React index-*.js).
 *
 * Kenapa lapisan terpisah, bukan edit langsung ke komponen form asli?
 * Source React asli (folder src/, file .jsx) TIDAK tersedia di paket ini —
 * yang ada hanya hasil build yang sudah diminify (index-*.js). Pendekatan
 * di file ini sama seperti pis-enhancements.js: bekerja di atas DOM yang
 * sudah dirender React, tanpa mengubah bundle-nya.
 *
 * Berisi:
 *  A) Keterangan/petunjuk + contoh isian di bawah setiap kolom form lamaran.
 *  B) Auto-format & validasi real-time: NIK E-KTP (16 digit valid),
 *     No. KK (16 digit valid), RT/RW (3 digit angka), Email (wajib @gmail.com),
 *     Alamat (maks 4 kata).
 *  C) Pengecekan NIK E-KTP sudah terdaftar (real-time, via API) supaya
 *     pelamar tahu sejak awal sebelum mengirim ulang.
 *  D) Kolom pendukung/dokumen yang bukan wajib diberi keterangan: "Kosongkan
 *     bila tidak ada — otomatis akan diisi 'Tidak Ada' agar lamaran tetap
 *     bisa dikirim."
 *  E) Tombol "Kembali ke Halaman Utama" di atas judul E-RECRUITMENT PIS.
 *
 * PENTING: overlay ini hanya membantu dari sisi UI (highlight, keterangan,
 * auto-format nilai input). Validasi WAJIB & final yang benar-benar tidak
 * bisa dilewati tetap ditegakkan di server (worker.js) — lihat
 * validateApplicantForm(). Ini konsisten dengan pendekatan pis-enhancements.js
 * yang sudah ada di project ini.
 */
(function () {
  "use strict";

  function isRecruitmentFormPage() {
    return /lamaran|apply|recruitment|karir/i.test(window.location.pathname);
  }

  // ============================================================
  // Styles
  // ============================================================
  const style = document.createElement("style");
  style.textContent = `
    .pisrf-hint {
      font-size: 11.5px; line-height: 1.35; margin-top: 4px; color: #6b7280;
      font: 500 11.5px system-ui, sans-serif;
    }
    .pisrf-hint.pisrf-ok { color: #15803d; }
    .pisrf-hint.pisrf-err { color: #b91c1c; }
    .pisrf-field-err { border-color: #dc2626 !important; box-shadow: 0 0 0 1px #dc2626 !important; }
    .pisrf-back-btn {
      display: inline-flex; align-items: center; gap: 6px;
      font: 600 13px system-ui, sans-serif; color: #7B1A2C;
      background: #fff; border: 1px solid #e5c9ce; border-radius: 10px;
      padding: 8px 14px; cursor: pointer; margin-bottom: 14px;
      box-shadow: 0 2px 6px rgba(0,0,0,.06);
    }
    .pisrf-back-btn:hover { background: #fdf2f3; }
    .pisrf-unit-wrap { position: relative; }
    .pisrf-unit-badge {
      position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
      font: 600 12px system-ui, sans-serif; color: #6b7280;
      background: #f3f4f6; border-radius: 6px; padding: 1px 7px;
      pointer-events: none; user-select: none;
    }
    .pisrf-unit-padded { padding-right: 44px !important; }
  `;
  document.head.appendChild(style);

  // ============================================================
  // Definisi keterangan & contoh untuk setiap kolom formulir lamaran.
  // Key = label kolom persis seperti yang tampil di form (dicocokkan via
  // pencarian teks label pada DOM).
  // ============================================================
  const FIELD_HINTS = {
    "Nama Lengkap": "Wajib diisi. Contoh: BUDI SANTOSA (sesuai E-KTP).",
    "Jenis Kelamin": "Wajib dipilih. Contoh: Laki-laki / Perempuan.",
    "NIK E-KTP": "Wajib diisi, 16 digit angka valid & belum pernah dipakai melamar sebelumnya. Contoh: 3273010101990001.",
    "No. KK": "Wajib diisi, 16 digit angka sesuai Kartu Keluarga. Contoh: 3273010101990002.",
    "No. NPWP": "Opsional, isi manual jika ada. Kosongkan bila tidak ada — otomatis diisi \"Tidak Ada\".",
    "SIM Type": "Kosongkan/pilih \"Tidak Ada\" jika tidak memiliki SIM.",
    "Tempat Lahir": "Wajib diisi. Contoh: JAKARTA.",
    "Tanggal Lahir": "Wajib diisi. Contoh: 01-01-1999.",
    "Alamat": "Wajib diisi, maksimal 4 kata. Contoh: Jl. Melati No 5.",
    "RT": "Wajib diisi, 3 digit angka. Contoh: 001.",
    "RW": "Wajib diisi, 3 digit angka. Contoh: 002.",
    "Kelurahan/Desa": "Kosongkan bila tidak ada — otomatis diisi \"Tidak Ada\" agar lamaran tetap bisa dikirim.",
    "Kecamatan": "Kosongkan bila tidak ada — otomatis diisi \"Tidak Ada\" agar lamaran tetap bisa dikirim.",
    "Kabupaten/Kota": "Kosongkan bila tidak ada — otomatis diisi \"Tidak Ada\" agar lamaran tetap bisa dikirim.",
    "Provinsi": "Kosongkan bila tidak ada — otomatis diisi \"Tidak Ada\" agar lamaran tetap bisa dikirim.",
    "Email": "Wajib diisi, harus domain @gmail.com. Contoh: nama.anda@gmail.com.",
    "No. Telepon": "Wajib diisi. Contoh: 081234567890.",
    "Posisi yang Diinginkan": "Wajib dipilih sesuai lowongan yang tersedia.",
    "Tinggi Badan (cm)": "Kosongkan bila tidak ingin diisi — otomatis diisi \"Tidak Ada\". Isi angka saja, satuan \"cm\" otomatis ditampilkan.",
    "Berat Badan (kg)": "Kosongkan bila tidak ingin diisi — otomatis diisi \"Tidak Ada\". Isi angka saja, satuan \"kg\" otomatis ditampilkan.",
    "Ukuran Baju": "Kosongkan bila tidak ingin diisi — otomatis diisi \"Tidak Ada\". Huruf otomatis menjadi KAPITAL.",
    "Ukuran Sepatu": "Kosongkan bila tidak ingin diisi — otomatis diisi \"Tidak Ada\". Huruf otomatis menjadi KAPITAL.",
    "Ijazah Terakhir": "Wajib diisi sesuai jenjang pendidikan terakhir. Contoh: SMA/SMK.",
    "Pendidikan SD": "Kosongkan bila tidak ada — otomatis diisi \"Tidak Ada\". Contoh: 1999-2006 di SDN 1 Tangerang Selatan.",
    "Pendidikan SMP": "Kosongkan bila tidak ada — otomatis diisi \"Tidak Ada\". Contoh: 2006-2009 di SMP N 1 Tangerang Selatan.",
    "Pendidikan SMA/SMK/Sederajat": "Kosongkan bila tidak ada — otomatis diisi \"Tidak Ada\". Contoh: 2009-2012 di SMA N 1 Tangerang Selatan.",
    "Pendidikan D3": "Kosongkan bila tidak ada — otomatis diisi \"Tidak Ada\".",
    "Pendidikan S1": "Kosongkan bila tidak ada — otomatis diisi \"Tidak Ada\".",
    "Pendidikan S2": "Kosongkan bila tidak ada — otomatis diisi \"Tidak Ada\".",
    "Nama Ibu Kandung": "Wajib diisi. Contoh: SITI AMINAH.",
    "No. Telp Ibu": "Kosongkan bila tidak ada — otomatis diisi \"Tidak Ada\".",
    "Alamat Ibu": "Kosongkan bila tidak ada — otomatis diisi \"Tidak Ada\".",
    "Upload E-KTP": "Wajib diunggah — foto/scan E-KTP yang jelas dan terbaca.",
    "Foto Setengah Badan": "Wajib diunggah — foto terbaru, latar polos.",
    "Foto SKCK": "Kosongkan bila belum ada — otomatis diisi \"Tidak Ada\".",
    "Foto KK": "Kosongkan bila belum ada — otomatis diisi \"Tidak Ada\".",
    "Foto NPWP": "Kosongkan bila belum ada — otomatis diisi \"Tidak Ada\".",
    "Foto SIM": "Kosongkan bila belum ada — otomatis diisi \"Tidak Ada\".",
    "Foto CV": "Kosongkan bila belum ada — otomatis diisi \"Tidak Ada\".",
    "Foto Surat Sehat": "Kosongkan bila belum ada — otomatis diisi \"Tidak Ada\".",
  };

  // ============================================================
  // Helper: cari elemen label persis dengan teks tertentu (mengabaikan "*")
  // ============================================================
  function findLabelElements() {
    return Array.from(document.querySelectorAll("label, span, div")).filter(
      (el) => el.children.length === 0 && el.textContent && el.textContent.trim().length > 0
    );
  }

  function normalizeLabel(text) {
    return text.replace(/\*/g, "").trim();
  }

  function injectHints() {
    if (!isRecruitmentFormPage()) return;
    const labels = findLabelElements();
    for (const labelEl of labels) {
      const text = normalizeLabel(labelEl.textContent);
      const hintText = FIELD_HINTS[text];
      if (!hintText) continue;
      const container = labelEl.parentElement;
      if (!container || container.querySelector(":scope > .pisrf-hint")) continue;
      const hint = document.createElement("div");
      hint.className = "pisrf-hint";
      hint.textContent = hintText;
      hint.dataset.pisrfField = text;
      container.appendChild(hint);
    }
  }

  function updateHint(fieldLabel, message, kind) {
    const hint = document.querySelector(`.pisrf-hint[data-pisrf-field="${CSS.escape(fieldLabel)}"]`);
    if (!hint) return;
    hint.textContent = message;
    hint.classList.remove("pisrf-ok", "pisrf-err");
    if (kind) hint.classList.add(kind === "ok" ? "pisrf-ok" : "pisrf-err");
  }

  // ============================================================
  // Set nilai pada input React-controlled dari luar React, lalu memicu
  // event "input" native supaya listener onChange React membaca nilai baru.
  // ============================================================
  function setReactInputValue(input, value) {
    const proto = input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function findInputNearLabel(text) {
    const labels = findLabelElements().filter((el) => normalizeLabel(el.textContent) === text);
    for (const labelEl of labels) {
      const container = labelEl.parentElement;
      if (!container) continue;
      const input = container.querySelector("input, textarea");
      if (input) return input;
      // Field berupa dropdown pilihan (Radix Select) tidak punya <input> asli —
      // arahkan ke tombol trigger-nya supaya highlight/scroll tetap berfungsi.
      const comboTrigger = container.querySelector('button[role="combobox"], [data-radix-select-trigger]');
      if (comboTrigger) return comboTrigger;
    }
    return null;
  }

  // ============================================================
  // Validasi NIK E-KTP (struktur resmi 16 digit) — sama seperti server.
  // ============================================================
  function validateNikStructure(nik) {
    const s = String(nik || "").trim();
    if (!/^\d{16}$/.test(s)) return "NIK E-KTP harus 16 digit angka.";
    const provinsi = parseInt(s.slice(0, 2), 10);
    const kabkota = s.slice(2, 4);
    const kecamatan = s.slice(4, 6);
    let tanggal = parseInt(s.slice(6, 8), 10);
    const bulan = parseInt(s.slice(8, 10), 10);
    const urut = s.slice(12, 16);
    if (provinsi < 11 || provinsi > 96) return "Kode provinsi (2 digit awal) tidak valid.";
    if (kabkota === "00") return "Kode kabupaten/kota (digit ke-3-4) tidak boleh 00.";
    if (kecamatan === "00") return "Kode kecamatan (digit ke-5-6) tidak boleh 00.";
    if (tanggal > 40) tanggal -= 40;
    if (tanggal < 1 || tanggal > 31) return "Tanggal lahir pada NIK (digit ke-7-8) tidak valid.";
    if (bulan < 1 || bulan > 12) return "Bulan lahir pada NIK (digit ke-9-10) tidak valid.";
    if (urut === "0000") return "4 digit terakhir NIK tidak boleh 0000.";
    return null;
  }

  function validateKKStructure(kk) {
    const s = String(kk || "").trim();
    if (!/^\d{16}$/.test(s)) return "No. KK harus 16 digit angka.";
    const provinsi = parseInt(s.slice(0, 2), 10);
    const kabkota = s.slice(2, 4);
    const kecamatan = s.slice(4, 6);
    const tanggal = parseInt(s.slice(6, 8), 10);
    const bulan = parseInt(s.slice(8, 10), 10);
    if (provinsi < 11 || provinsi > 96) return "Kode provinsi (2 digit awal) tidak valid.";
    if (kabkota === "00") return "Kode kabupaten/kota (digit ke-3-4) tidak boleh 00.";
    if (kecamatan === "00") return "Kode kecamatan (digit ke-5-6) tidak boleh 00.";
    if (tanggal < 1 || tanggal > 31) return "Tanggal terbit pada No. KK (digit ke-7-8) tidak valid.";
    if (bulan < 1 || bulan > 12) return "Bulan terbit pada No. KK (digit ke-9-10) tidak valid.";
    return null;
  }

  // Debounce sederhana untuk pengecekan NIK ke server (cek duplikat)
  let nikCheckTimer = null;
  async function checkNikRegistered(nik) {
    try {
      const res = await fetch(`/api/apps/entities/Applicant?nik_ektp=${encodeURIComponent(nik)}`);
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      const list = Array.isArray(data) ? data : (data && data.data) || [];
      return list.some((r) => String(r.nik_ektp) === String(nik));
    } catch {
      return null; // gagal cek (offline dsb) — jangan blokir UI, server tetap jadi validasi akhir
    }
  }

  function wireNikField() {
    const input = findInputNearLabel("NIK E-KTP");
    if (!input || input.dataset.pisrfWired) return;
    input.dataset.pisrfWired = "1";
    input.maxLength = 16;
    input.addEventListener("input", () => {
      const digitsOnly = input.value.replace(/\D/g, "").slice(0, 16);
      if (digitsOnly !== input.value) setReactInputValue(input, digitsOnly);

      const structErr = digitsOnly ? validateNikStructure(digitsOnly) : null;
      if (structErr) {
        updateHint("NIK E-KTP", structErr, "err");
        input.classList.add("pisrf-field-err");
        return;
      }
      input.classList.remove("pisrf-field-err");
      if (digitsOnly.length === 16) {
        updateHint("NIK E-KTP", "Mengecek apakah NIK sudah terdaftar...", null);
        clearTimeout(nikCheckTimer);
        nikCheckTimer = setTimeout(async () => {
          const dup = await checkNikRegistered(digitsOnly);
          if (dup === true) {
            updateHint("NIK E-KTP", "NIK ini sudah terdaftar pada lamaran lain — tidak bisa digunakan lagi.", "err");
            input.classList.add("pisrf-field-err");
          } else if (dup === false) {
            updateHint("NIK E-KTP", "Format valid & NIK belum terdaftar.", "ok");
          } else {
            updateHint("NIK E-KTP", "Format NIK valid.", "ok");
          }
        }, 500);
      } else {
        updateHint("NIK E-KTP", FIELD_HINTS["NIK E-KTP"], null);
      }
    });
  }

  function wireKKField() {
    const input = findInputNearLabel("No. KK");
    if (!input || input.dataset.pisrfWired) return;
    input.dataset.pisrfWired = "1";
    input.maxLength = 16;
    input.addEventListener("input", () => {
      const digitsOnly = input.value.replace(/\D/g, "").slice(0, 16);
      if (digitsOnly !== input.value) setReactInputValue(input, digitsOnly);
      if (!digitsOnly) { updateHint("No. KK", FIELD_HINTS["No. KK"], null); input.classList.remove("pisrf-field-err"); return; }
      const err = validateKKStructure(digitsOnly);
      if (err) {
        updateHint("No. KK", err, "err");
        input.classList.add("pisrf-field-err");
      } else {
        updateHint("No. KK", "Format No. KK valid.", "ok");
        input.classList.remove("pisrf-field-err");
      }
    });
  }

  function wireRtRwField(label) {
    const input = findInputNearLabel(label);
    if (!input || input.dataset.pisrfWired) return;
    input.dataset.pisrfWired = "1";
    input.maxLength = 3;
    input.addEventListener("input", () => {
      const digitsOnly = input.value.replace(/\D/g, "").slice(0, 3);
      if (digitsOnly !== input.value) setReactInputValue(input, digitsOnly);
      if (digitsOnly.length === 3) {
        updateHint(label, `${label} valid.`, "ok");
        input.classList.remove("pisrf-field-err");
      } else if (digitsOnly.length > 0) {
        updateHint(label, `${label} harus tepat 3 digit angka.`, "err");
        input.classList.add("pisrf-field-err");
      } else {
        updateHint(label, FIELD_HINTS[label], null);
        input.classList.remove("pisrf-field-err");
      }
    });
  }

  function wireEmailField() {
    const input = findInputNearLabel("Email");
    if (!input || input.dataset.pisrfWired) return;
    input.dataset.pisrfWired = "1";
    input.addEventListener("blur", () => {
      const v = input.value.trim();
      if (!v) { updateHint("Email", FIELD_HINTS["Email"], null); return; }
      const ok = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(v);
      if (ok) {
        updateHint("Email", "Email valid.", "ok");
        input.classList.remove("pisrf-field-err");
      } else {
        updateHint("Email", "Email wajib menggunakan domain @gmail.com. Contoh: nama.anda@gmail.com.", "err");
        input.classList.add("pisrf-field-err");
      }
    });
  }

  // Ubah teks jadi "Proper Case" (Huruf Awal Kapital Tiap Kata) — dipakai untuk
  // Alamat, Kelurahan/Desa, Kecamatan, Kabupaten/Kota, Provinsi.
  function toProperCase(str) {
    return str
      .toLowerCase()
      .replace(/(^|[\s/.-])([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase());
  }

  function wireAlamatField() {
    const input = findInputNearLabel("Alamat");
    if (!input || input.dataset.pisrfWired) return;
    input.dataset.pisrfWired = "1";
    input.addEventListener("input", () => {
      const words = input.value.trim().split(/\s+/).filter(Boolean);
      if (words.length > 4) {
        const trimmed = words.slice(0, 4).join(" ");
        setReactInputValue(input, trimmed);
        updateHint("Alamat", "Alamat dipotong otomatis, maksimal 4 kata.", "err");
      } else {
        updateHint("Alamat", FIELD_HINTS["Alamat"], words.length ? "ok" : null);
        input.classList.remove("pisrf-field-err");
      }
    });
    // Rapikan jadi Proper Case begitu selesai mengetik (blur), bukan tiap huruf,
    // supaya tidak mengganggu saat pengguna masih mengetik.
    input.addEventListener("blur", () => {
      if (!input.value.trim()) return;
      const proper = toProperCase(input.value);
      if (proper !== input.value) setReactInputValue(input, proper);
    });
  }

  // Field alamat administratif lain: format Proper Case otomatis saat blur.
  function wireProperCaseField(label) {
    const input = findInputNearLabel(label);
    if (!input || input.dataset.pisrfProperWired) return;
    input.dataset.pisrfProperWired = "1";
    input.addEventListener("blur", () => {
      if (!input.value.trim()) return;
      const proper = toProperCase(input.value);
      if (proper !== input.value) setReactInputValue(input, proper);
    });
  }

  // Ukuran Baju: paksa huruf KAPITAL semua secara real-time.
  function wireUppercaseField(label) {
    const input = findInputNearLabel(label);
    if (!input || input.dataset.pisrfUpperWired) return;
    input.dataset.pisrfUpperWired = "1";
    input.addEventListener("input", () => {
      const upper = input.value.toUpperCase();
      if (upper !== input.value) setReactInputValue(input, upper);
    });
  }

  // ============================================================
  // Tinggi Badan (cm) & Berat Badan (kg): tampilkan satuan secara otomatis
  // di sebelah kolom begitu pelamar selesai mengisi angka.
  //
  // PENTING: kolom ini adalah <input type="number"> yang React simpan
  // sebagai angka murni (Number(...)) — lihat validateApplicantForm() &
  // tampilan "Tinggi/Berat" di Detail Pelamar yang SUDAH menambahkan
  // " cm"/" kg" sendiri saat menampilkan nilai. Karena itu satuan di sini
  // TIDAK ditulis ke dalam nilai input (kalau ditulis, nilainya akan
  // rusak jadi NaN saat dikirim, dan tampil dobel "cm cm" / "kg kg" di
  // halaman Data Pelamar & Detail Pelamar). Satuan hanya ditampilkan
  // sebagai label kecil di sebelah kolom — otomatis muncul begitu ada
  // angka, otomatis hilang lagi kalau kolom dikosongkan.
  // ============================================================
  function wireUnitSuffixField(label, unit) {
    const input = findInputNearLabel(label);
    if (!input || input.dataset.pisrfUnitWired) return;
    input.dataset.pisrfUnitWired = "1";

    let wrap = input.parentElement;
    if (!wrap || !wrap.classList.contains("pisrf-unit-wrap")) {
      wrap = document.createElement("div");
      wrap.className = "pisrf-unit-wrap";
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
    }

    const badge = document.createElement("span");
    badge.className = "pisrf-unit-badge";
    badge.textContent = unit;
    badge.style.display = "none";
    wrap.appendChild(badge);

    function refresh() {
      const hasValue = String(input.value || "").trim() !== "";
      badge.style.display = hasValue ? "inline" : "none";
      input.classList.toggle("pisrf-unit-padded", hasValue);
      if (hasValue) updateHint(label, `${input.value} ${unit}`, "ok");
      else updateHint(label, FIELD_HINTS[label], null);
    }

    input.addEventListener("input", refresh);
    input.addEventListener("blur", refresh);
    refresh();
  }

  // Placeholder contoh format langsung di dalam kolom input.
  function wirePlaceholder(label, placeholder) {
    const input = findInputNearLabel(label);
    if (!input || input.dataset.pisrfPlaceholderWired) return;
    input.dataset.pisrfPlaceholderWired = "1";
    if (!input.placeholder) input.placeholder = placeholder;
  }

  // ============================================================
  // Tombol "Kembali ke Halaman Utama" — disisipkan di atas judul
  // "E-RECRUITMENT PIS" pada halaman formulir lamaran.
  // ============================================================
  function injectBackButton() {
    if (!isRecruitmentFormPage()) return;
    if (document.getElementById("pisrf-back-btn")) return;
    const heading = Array.from(document.querySelectorAll("h1")).find(
      (el) => el.textContent && /E-RECRUITMENT PIS/i.test(el.textContent)
    );
    if (!heading) return;
    // Kontainer judul (biasanya div "text-center mb-8" pembungkus h1 & subjudul)
    const titleContainer = heading.parentElement || heading;
    const wrapper = titleContainer.parentElement || titleContainer;

    const btn = document.createElement("button");
    btn.id = "pisrf-back-btn";
    btn.type = "button";
    btn.className = "pisrf-back-btn";
    btn.textContent = "← Kembali ke Halaman Utama";
    btn.addEventListener("click", () => {
      window.location.href = "/";
    });

    wrapper.insertBefore(btn, titleContainer);
  }

  // ============================================================
  // Tampilkan konfirmasi Area Tugas & Jabatan yang dipilih pelamar, supaya
  // jelas terlihat bahwa pilihan ini akan langsung tersambung ke Data
  // Karyawan begitu lamaran diterima Admin.
  // ============================================================
  function wireAreaJabatanConfirmation() {
    const labels = findLabelElements().filter((el) => normalizeLabel(el.textContent) === "Posisi yang Diinginkan");
    const labelEl = labels[0];
    const container = labelEl && labelEl.parentElement;
    const trigger = container && container.querySelector('button[role="combobox"], [data-radix-select-trigger]');
    if (!container || !trigger) return;
    let note = container.querySelector(":scope > .pisrf-connect-note");
    if (!note) {
      note = document.createElement("div");
      note.className = "pisrf-connect-note";
      note.style.cssText = "font-size:11.5px;line-height:1.35;margin-top:4px;color:#7B1A2C;font-weight:600;";
      container.appendChild(note);
    }
    const valueText = trigger.textContent && trigger.textContent.trim();
    const placeholderLike = !valueText || /pilih/i.test(valueText);
    note.textContent = placeholderLike
      ? "Area Tugas & Jabatan yang Anda pilih akan otomatis tersambung ke Data Karyawan saat lamaran diterima."
      : `✓ Anda melamar sebagai "${valueText}". Pilihan ini akan otomatis tersambung ke Data Karyawan saat lamaran diterima.`;
  }

  function wireAllFields() {
    if (!isRecruitmentFormPage()) return;
    injectBackButton();
    injectHints();
    wireNikField();
    wireKKField();
    wireRtRwField("RT");
    wireRtRwField("RW");
    wireEmailField();
    wireAlamatField();
    wireAreaJabatanConfirmation();
    // 1) Proper Case otomatis untuk kolom alamat administratif
    wireProperCaseField("Kelurahan/Desa");
    wireProperCaseField("Kecamatan");
    wireProperCaseField("Kabupaten/Kota");
    wireProperCaseField("Provinsi");
    // 2) Ukuran Baju & Ukuran Sepatu otomatis KAPITAL semua
    wireUppercaseField("Ukuran Baju");
    wireUppercaseField("Ukuran Sepatu");
    // 2b) Tinggi Badan (cm) & Berat Badan (kg): satuan otomatis tampil
    // begitu selesai diisi angka
    wireUnitSuffixField("Tinggi Badan (cm)", "cm");
    wireUnitSuffixField("Berat Badan (kg)", "kg");
    // 3-5) Contoh format riwayat pendidikan langsung di kolom input
    wirePlaceholder("Pendidikan SD", "Contoh: 1999-2006 di SDN 1 Tangerang Selatan");
    wirePlaceholder("Pendidikan SMP", "Contoh: 2006-2009 di SMP N 1 Tangerang Selatan");
    wirePlaceholder("Pendidikan SMA/SMK/Sederajat", "Contoh: 2009-2012 di SMA N 1 Tangerang Selatan");
  }

  // ============================================================
  // Poin 9: jika pengiriman lamaran gagal, otomatis arahkan (scroll & fokus)
  // ke kolom yang bermasalah, supaya pelamar langsung tahu apa yang perlu
  // diperbaiki — dan setelah diperbaiki, formulir bisa dikirim ulang seperti
  // biasa (tombol kirim otomatis aktif kembali, lihat patch pada bundle).
  // ============================================================
  // Terjemahan label pesan error server -> label yang benar-benar tampil di
  // form (beberapa field punya nama berbeda antara backend & UI).
  const ERROR_LABEL_TO_DOM_LABEL = [
    ["Alamat Sesuai E-KTP", "Alamat"], // form hanya punya satu kolom alamat
    ["Alamat Domisili", "Alamat"],
    ["Foto E-KTP", "Upload E-KTP"],
    ["Area Tugas / Proyek yang Dilamar", "Pilih Area Tugas"],
    // Urutan dari yang paling spesifik ke paling umum supaya pencocokan teks tidak salah sasaran
    ["NIK E-KTP", "NIK E-KTP"],
    ["No. KK", "No. KK"],
    ["No. Telepon", "No. Telepon"],
    ["Pendidikan Terakhir", "Ijazah Terakhir"], // nama field di server beda dengan label yang tampil
    ["Posisi yang Diinginkan", "Posisi yang Diinginkan"],
    ["Nama Ibu Kandung", "Nama Ibu Kandung"],
    ["Jenis Kelamin", "Jenis Kelamin"],
    ["Tempat Lahir", "Tempat Lahir"],
    ["Tanggal Lahir", "Tanggal Lahir"],
    ["Foto Setengah Badan", "Foto Setengah Badan"],
    ["Nama Lengkap", "Nama Lengkap"],
    ["Email", "Email"],
    ["RT", "RT"],
    ["RW", "RW"],
    ["Alamat", "Alamat"],
  ];

  function scrollToField(domLabel) {
    const input = findInputNearLabel(domLabel);
    if (!input) return false;
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    input.classList.add("pisrf-field-err");
    setTimeout(() => input.focus(), 350);
    updateHint(domLabel, `⚠️ ${FIELD_HINTS[domLabel] || "Mohon periksa kembali kolom ini."}`, "err");
    return true;
  }

  function handleSubmitError(message) {
    if (!message) return;
    // Cari field pertama yang namanya disebut dalam pesan error, dari yang paling spesifik.
    for (const [errorLabel, domLabel] of ERROR_LABEL_TO_DOM_LABEL) {
      if (message.includes(errorLabel)) {
        if (scrollToField(domLabel)) return;
      }
    }
    // Tidak ditemukan field spesifik (mis. error jaringan) — cukup scroll ke atas form
    // supaya pesan toast dari server terlihat oleh pengguna.
    const heading = Array.from(document.querySelectorAll("h1")).find(
      (el) => el.textContent && /E-RECRUITMENT PIS/i.test(el.textContent)
    );
    if (heading) heading.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  window.addEventListener("pis-applicant-submit-error", (e) => {
    if (!isRecruitmentFormPage()) return;
    handleSubmitError((e.detail && e.detail.message) || "");
  });

  const observer = new MutationObserver(() => wireAllFields());
  observer.observe(document.body, { childList: true, subtree: true });
  wireAllFields();
})();