/**
 * PIS MOBILE RESPONSIVE — lapisan tambahan (tidak menyentuh bundle React index-*.js).
 *
 * Kenapa lapisan terpisah? Source React asli (folder src/, file .jsx) TIDAK
 * tersedia di paket ini — yang ada hanya hasil build yang sudah diminify
 * (index-*.js) dan CSS Tailwind yang sudah di-purge (index-*.css, hanya
 * berisi utility class yang benar-benar dipakai). Mengedit file itu
 * langsung berisiko tinggi merusak tampilan tanpa cara aman untuk
 * memverifikasi hasilnya (tidak ada source map).
 *
 * Pendekatan di sini sama seperti pis-fixes.js / pis-enhancements.js:
 * suntik CSS + sedikit JS di atas DOM yang sudah dirender, supaya tampilan
 * "merampingkan diri" otomatis mengikuti lebar layar (khususnya HP),
 * tanpa mengubah logika/fungsi apa pun di dalam aplikasi.
 *
 * Berisi:
 *  A) CSS global mobile-first: cegah scroll horizontal tak sengaja,
 *     rapatkan padding/font di layar sempit, grid multi-kolom otomatis
 *     jadi 1 kolom di HP, dialog/modal menyesuaikan lebar layar.
 *  B) Tabel yang lebar (kolom banyak) dibungkus otomatis supaya bisa
 *     digeser ke samping (scroll-x) alih-alih memepetkan seluruh isi
 *     tabel sampai tidak terbaca.
 *  C) Elemen mengambang milik kita sendiri (chat widget, FAB, dsb — lihat
 *     pis-chat-widget.js/pis-fixes.js/pis-enhancements.js) sudah punya
 *     max-width:calc(100vw - Npx) masing-masing; di sini hanya dirapikan
 *     ukuran/jarak supaya tidak saling tumpuk di layar sempit.
 */
(function () {
  "use strict";

  const MOBILE_BREAKPOINT = 640;  // px — setara breakpoint "sm" Tailwind
  const SMALL_PHONE_BREAKPOINT = 400; // px — HP layar sangat sempit

  // ============================================================
  // A) CSS global — mobile-first, hanya aktif di bawah breakpoint
  // ============================================================
  function injectStyle() {
    if (document.getElementById("pis-mobile-responsive-style")) return;
    const style = document.createElement("style");
    style.id = "pis-mobile-responsive-style";
    style.textContent = `
      /* ── Cegah body/halaman melebar ke samping gara-gara 1 elemen kelebaran ── */
      html { overflow-x: hidden; }
      body { overflow-x: hidden; max-width: 100vw; }
      #root { max-width: 100vw; overflow-x: hidden; }

      @media (max-width: ${MOBILE_BREAKPOINT}px) {
        html, body { font-size: 14.5px; }

        /* Rapatkan padding/margin besar khas layout desktop supaya tidak
           membuang ruang di layar sempit ("merampingkan" tampilan) */
        #root > div { padding-left: 0 !important; padding-right: 0 !important; }

        /* Grid multi-kolom (Tailwind grid-cols-2..6) otomatis jadi 1 kolom
           di HP supaya kartu/form tidak terpepet dan teks tetap terbaca */
        .grid-cols-2, .grid-cols-3, .grid-cols-4, .grid-cols-5, .grid-cols-6 {
          grid-template-columns: repeat(1, minmax(0, 1fr)) !important;
        }

        /* Form/tombol berjajar horizontal (flex-row) yang sempit dipaksa
           turun ke bawah supaya tidak terpotong */
        .flex-row.flex-wrap, .flex.flex-row:not(.pis-keep-row) {
          row-gap: 8px;
        }

        /* Kartu/panel: kurangi padding besar ala desktop */
        [class*="p-6"], [class*="p-8"] { padding: 14px !important; }
        [class*="px-6"], [class*="px-8"] { padding-left: 14px !important; padding-right: 14px !important; }
        [class*="py-6"], [class*="py-8"] { padding-top: 14px !important; padding-bottom: 14px !important; }
        [class*="gap-6"], [class*="gap-8"] { gap: 10px !important; }

        /* Dialog/modal (Radix/shadcn) menyesuaikan lebar layar, bukan lebar
           tetap ala desktop — supaya tidak overflow atau terpotong */
        [role="dialog"] {
          width: 94vw !important;
          max-width: 94vw !important;
          left: 3vw !important;
          right: 3vw !important;
          transform: translate(0, -50%) !important;
          max-height: 88vh !important;
          overflow-y: auto !important;
        }

        /* Judul/heading besar ala desktop diperkecil supaya tidak membungkus
           terlalu banyak baris di layar sempit */
        h1 { font-size: 1.25rem !important; }
        h2 { font-size: 1.1rem !important; }

        /* Elemen mengambang kita sendiri: rapatkan sedikit jaraknya supaya
           tidak saling menumpuk di layar sempit */
        #pis-chat-widget, #pisfx-shift-fab, #pisfx-patrol-inline-btn,
        #pispg-gaji-fab, #pis-brand-card, #pis-settings-panel-wrap {
          max-width: calc(100vw - 24px);
        }
      }

      @media (max-width: ${SMALL_PHONE_BREAKPOINT}px) {
        html, body { font-size: 13.5px; }
        [role="dialog"] { width: 96vw !important; max-width: 96vw !important; }
      }

      /* ── Tabel lebar: bungkus scroll horizontal (lihat wrapTablesForScroll) ── */
      .pis-table-scroll-wrap {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        max-width: 100%;
      }
      @media (max-width: ${MOBILE_BREAKPOINT}px) {
        .pis-table-scroll-wrap table { min-width: 620px; }
        .pis-table-scroll-wrap { border-radius: 8px; }
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================================
  // B) Bungkus tabel lebar supaya bisa digeser, bukan memepet
  // ============================================================
  function wrapTablesForScroll() {
    if (window.innerWidth > MOBILE_BREAKPOINT) return; // hanya perlu di HP
    document.querySelectorAll("table").forEach((table) => {
      if (table.closest(".pis-table-scroll-wrap")) return; // sudah dibungkus
      const wrap = document.createElement("div");
      wrap.className = "pis-table-scroll-wrap";
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  // ============================================================
  // Init — jalan begitu DOM siap, lalu pantau perubahan SPA/resize
  // ============================================================
  function watchDom() {
    // Konten SPA berganti tanpa reload (mis. pindah menu) → tabel baru perlu
    // dibungkus juga. Pakai MutationObserver (bukan polling ketat) supaya
    // hemat, plus jaga-jaga resize (rotasi layar HP / buka keyboard).
    const observer = new MutationObserver(() => wrapTablesForScroll());
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", wrapTablesForScroll);
  }

  function init() {
    injectStyle();
    wrapTablesForScroll();
    watchDom();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
