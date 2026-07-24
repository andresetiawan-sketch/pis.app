/**
 * PIS — HAPUS TOMBOL "Buat PKWT" (toolbar, pemicu dialog "Buat PKWT Baru")
 * ============================================================
 * Sesuai permintaan: tombol/input "Buat PKWT Baru" bawaan DIHAPUS dari
 * tampilan halaman "PKWT Karyawan". Pembuatan PKWT & Surat Tugas baru tetap
 * bisa dilakukan lewat tombol terkunci (sticky) "📄 Generate PKWT & Surat
 * Tugas" di ATAS halaman (lihat pis-pkwt-generator.js) — jadi fiturnya tidak
 * hilang, hanya pintu masuk toolbar bawaannya yang disembunyikan.
 *
 * Per-baris, tombol "Generate PDF" (jsPDF lama) & "Draft PKWT" bawaan tetap
 * disembunyikan (fungsinya sudah digantikan oleh Unduh/Edit/Hapus di
 * kolom Aksi — lihat pis-pkwt-aksi-buttons.js untuk tombol Edit & Hapus
 * PKWT + Surat Tugas yang baru).
 *
 * Kenapa lapisan terpisah, bukan edit langsung ke komponen React?
 * Source .jsx asli tidak tersedia di paket ini (hanya hasil build yang
 * sudah diminify) — jadi perubahan dilakukan di atas DOM yang sudah
 * dirender React, tanpa mengubah bundle-nya. Sama seperti pis-enhancements.js.
 *
 * Supaya tidak salah sasaran (mis. ikut menyembunyikan tombol "Generate
 * PDF" milik fitur lain seperti halaman Laporan, yang teksnya sama persis
 * tapi tidak ada hubungannya dengan PKWT), penghapusan tombol per-baris
 * HANYA dilakukan pada baris yang teksnya memuat nomor PKWT (pola
 * "xxx/PKWT/...").
 */
(function () {
  "use strict";

  const PKWT_NUMBER_RE = /\d{2,4}\s*\/\s*PKWT\s*\//i;

  // Cocok hanya untuk tombol TOOLBAR " Buat PKWT" (trigger, bukan tombol
  // submit dialog "✅ Buat PKWT" / "💾 Simpan Perubahan", dan bukan judul
  // dialog "Buat PKWT Baru"/"Edit PKWT"). Trigger toolbar teksnya PERSIS
  // "Buat PKWT" setelah di-trim (tanpa kata lain di sekitarnya).
  function isNativeCreateButton(el) {
    if (!el || el.tagName !== "BUTTON") return false;
    const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
    return txt === "Buat PKWT";
  }

  function hideCreateButton(btn) {
    if (btn.dataset.pisPkwtHidden === "1") return;
    btn.dataset.pisPkwtHidden = "1";
    btn.style.display = "none";
    btn.setAttribute("aria-hidden", "true");
    btn.title = "Dihapus — gunakan tombol \"Generate PKWT & Surat Tugas\" di bagian atas halaman untuk membuat PKWT baru.";
  }

  // Cari container/baris terdekat yang teksnya memuat nomor PKWT (mis.
  // "005/PKWT/PIS/VII/2026") — dipakai untuk memastikan penghapusan tombol
  // lama hanya menyasar baris PKWT, tidak menyentuh fitur lain yang
  // kebetulan pakai label sama ("Generate PDF" di halaman Laporan, dll).
  function closestPkwtRow(el) {
    let node = el;
    for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
      const txt = node.textContent || "";
      if (txt.length < 4000 && PKWT_NUMBER_RE.test(txt)) return node;
    }
    return null;
  }

  function hideLegacyRowButton(btn, reason) {
    if (btn.dataset.pisPkwtHidden === "1") return;
    btn.dataset.pisPkwtHidden = "1";
    btn.style.display = "none";
    btn.setAttribute("aria-hidden", "true");
    btn.title = `Digantikan oleh tombol Edit/Hapus di kolom Aksi (${reason})`;
  }

  // Hapus (sembunyikan) tombol "Generate PDF" (jsPDF lama) & "Draft PKWT"
  // bawaan yang masih ada per-baris di tabel/daftar PKWT, DAN ikon pensil
  // Edit + ikon tempat sampah Hapus bawaan (yang hanya mengedit/menghapus
  // data kontrak mentah, tidak ikut mengurus dokumen/Surat Tugas) — HANYA
  // di baris yang terbukti baris PKWT (lihat closestPkwtRow di atas).
  // Digantikan oleh tombol "✏️ Edit" & "🗑️ Hapus" permanen di kolom Aksi
  // yang sama (lihat pis-pkwt-aksi-buttons.js) — satu tombol untuk PKWT
  // & Surat Tugas sekaligus, termasuk hapus file .docx-nya di R2.
  function purgeLegacyRowActions() {
    document.querySelectorAll("button").forEach((btn) => {
      if (btn.dataset.pisPkwtHidden === "1" || isNativeCreateButton(btn)) return;
      const txt = (btn.textContent || "").replace(/\s+/g, " ").trim();
      if (txt !== "Generate PDF" && txt !== "Draft PKWT") return;
      const row = closestPkwtRow(btn);
      if (row) hideLegacyRowButton(btn, txt);
    });

    // Ikon pensil "Edit" & ikon tempat sampah "Hapus" bawaan (tombol ikon
    // tanpa teks, ukuran kecil khas ghost-icon-button) di dalam baris PKWT
    // yang sudah terbukti dari langkah di atas — supaya tidak salah sasaran
    // ikon lain di luar konteks PKWT, HANYA disisir di dalam baris yang
    // sudah dikonfirmasi sebagai baris PKWT (mengandung nomor PKWT, & bukan
    // kontainer besar seperti seluruh tabel — dibatasi maks 8 anak langsung
    // supaya scoped ke satu baris/kartu saja).
    document.querySelectorAll("div, tr, li").forEach((container) => {
      if (container.dataset.pisPkwtRowScanned === "1") return;
      const txt = container.textContent || "";
      if (txt.length > 1500 || txt.length < 4) return;
      if (container.children.length > 8) return; // terlalu besar untuk 1 baris
      if (!PKWT_NUMBER_RE.test(txt)) return;
      container.dataset.pisPkwtRowScanned = "1";
      container.querySelectorAll("button.w-7.h-7, button.h-7.w-7").forEach((iconBtn) => {
        if (iconBtn.dataset.pisPkwtHidden === "1" || isNativeCreateButton(iconBtn)) return;
        const iconTxt = (iconBtn.textContent || "").trim();
        if (iconTxt) return; // hanya target tombol ikon TANPA teks (mis. pensil Edit / tempat sampah Hapus)
        hideLegacyRowButton(iconBtn, "ikon Edit/Hapus PKWT bawaan");
      });
    });
  }

  // Cari & sembunyikan setiap kali DOM berubah (SPA React re-render).
  function scan() {
    document.querySelectorAll("button").forEach((btn) => {
      if (isNativeCreateButton(btn)) hideCreateButton(btn);
    });
    purgeLegacyRowActions();
  }

  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  scan();
})();
