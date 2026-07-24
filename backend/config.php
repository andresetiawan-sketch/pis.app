<?php
/**
 * ============================================================
 *  KONFIGURASI UTAMA — PIS INTEGRATED SYSTEM (versi XAMPP/PHP)
 * ============================================================
 *  Edit file ini sesuai environment server Anda.
 */

// ── Database MySQL (XAMPP default: user root, tanpa password) ──
define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'pis_db');
define('DB_USER', 'root');
define('DB_PASS', '');          // isi jika MySQL Anda sudah diberi password
define('DB_PORT', 3306);

// ── Penyimpanan file (upload foto, dokumen, dsb) di drive D: ──
// Semua file upload TIDAK disimpan di dalam folder htdocs, tapi langsung
// ke drive D: agar aman dari kehapus saat update source code, dan supaya
// bisa dipindahkan / di-backup terpisah dari aplikasi.
define('STORAGE_ROOT', 'D:/pis-storage/uploads');   // folder upload umum
define('TEMPLATE_ROOT', 'D:/pis-storage/templates'); // folder template PKWT/Surat Tugas (.docx/.xlsx)
define('BACKUP_ROOT', 'D:/pis-storage/backup');      // folder backup database berkala
define('CACHE_ROOT', 'D:/pis-storage/cache');        // folder cache API sisi server (lihat backend/cache.php)

// URL publik untuk mengakses file yang sudah diupload (lihat backend/files.php)
define('FILES_BASE_URL', '/files');

// ── Sesi login ──
define('SESSION_TTL_SECONDS', 86400);   // 24 jam, sama seperti versi Cloudflare asli
define('LOGIN_MAX_ATTEMPTS', 5);
define('LOGIN_LOCK_SECONDS', 15 * 60);

// ── Nama aplikasi default (bisa diubah lewat menu Branding di UI) ──
define('APP_NAME_DEFAULT', 'PIS Integrated System');

// ── Timezone ──
date_default_timezone_set('Asia/Jakarta');

// ── Mode debug (set false di server produksi!) ──
define('APP_DEBUG', true);
