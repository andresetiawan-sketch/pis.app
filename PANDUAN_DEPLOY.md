# PANDUAN DEPLOY — PIS Integrated System di XAMPP (Windows)

Paket ini mengonversi backend aplikasi dari **Cloudflare Worker** (worker.js + D1 + R2 + KV)
menjadi **PHP + MySQL (XAMPP)**, dengan semua file upload/dokumen disimpan realtime di **drive D:**.

---

## 0. Ringkasan Jujur Soal Cakupan (baca dulu)

Aplikasi asli punya ±150 fungsi bisnis (worker.js, 4.400+ baris): karyawan, absensi GPS,
jadwal shift, PKWT/Surat Tugas (generate .docx), payroll & rapel, e-patrol, chat internal,
notifikasi, import/export Excel, dll.

Yang **SUDAH** diport penuh & bisa langsung dipakai di paket ini:
- Login karyawan (NIK + password), sesi, kunci brute-force 5x gagal → lock 15 menit
- CRUD generik untuk **semua 46 entity** (Employee, Attendance, ShiftSchedule, dst) — ini "mesin"
  utama yang dipakai hampir seluruh halaman di frontend
- Validasi NIK karyawan unik, lock GPS e-absensi (radius meter), bentrok jadwal shift
- Upload/download file ke drive D: (pengganti R2)
- Menu admin per role, aturan notifikasi, hak akses area, e-patrol dasar
- Branding (nama aplikasi/logo/favicon)
- **Generate PKWT & Surat Tugas (.docx)** — termasuk penomoran dokumen otomatis, isi
  placeholder dari data karyawan/pelamar, dan perbaikan placeholder yang terpecah oleh
  Microsoft Word — memakai ekstensi `zip` bawaan PHP, **tidak perlu Composer/library
  tambahan** (lihat bagian 9.1)
- **Payroll**: hitung potongan absensi custom per rule, generate Payslip bulanan otomatis
  (acuan: Kontrak Area Final → fallback Data Query), auto-buat Rapel saat Data Query
  bulan yang sudah terbit slip diubah lagi
- **Chat internal** dengan asisten balasan otomatis "Acha" (rule-based, bukan AI generatif)
  untuk pertanyaan umum seputar aplikasi (absensi, jadwal, gaji, cuti, dst)
- 3 lapis caching supaya request ke XAMPP tidak berlebihan (lihat bagian 5)
- PWA + tombol "Pasang Aplikasi" otomatis

Yang **BELUM** diport (butuh waktu tambahan):
import/export Excel massal (bulk import karyawan, Data Query dari .xlsx), notifikasi
shift massal (bulk notify), reset password via approval, generate jadwal bulanan otomatis,
serah terima shift lanjutan, arsip data lama. Semua nama fungsi ini tetap terdaftar di
`backend/functions.php` supaya tidak error 500 di frontend — cukup mengembalikan pesan
"belum diport". Lihat bagian 8 (Roadmap) untuk cara melanjutkannya.

**Catatan penting soal Payroll & PKWT:** kedua fitur ini menyentuh uang gaji dan dokumen
resmi karyawan. Sebelum dipakai untuk data sungguhan, **uji dulu di server staging**
dengan beberapa data contoh, dan bandingkan hasilnya dengan versi Cloudflare asli (kalau
masih bisa diakses) atau dengan perhitungan manual.

---

## 1. Yang Perlu Disiapkan Dulu

| Aplikasi | Kegunaan | Wajib? |
|---|---|---|
| **XAMPP (PHP 8.1 atau 8.2)** | Apache + MySQL/MariaDB + PHP | Wajib. **Jangan pakai PHP 7.4** — kode ini pakai fungsi `str_starts_with`/`str_contains` yang baru ada di PHP 8.0+ |
| **phpMyAdmin** | Sudah termasuk di XAMPP, untuk import database | Wajib |
| **Composer** | Manajer library PHP | Wajib kalau nanti mau lanjutkan fitur .docx/.xlsx/email (lihat bagian 9) |
| **Windows Task Scheduler** | Pengganti "cron" Cloudflare | Wajib untuk fitur berkala (bagian 7) |

Unduh XAMPP versi PHP 8.2 di apachefriends.org bila belum ada.

---

## 2. Salin File ke htdocs

1. Salin **seluruh isi folder `htdocs_pis/`** dari paket ini ke:
   ```
   C:\xampp\htdocs\pis\
   ```
   Struktur akhirnya:
   ```
   C:\xampp\htdocs\pis\
   ├── index.html, assets\, icons\, manifest.json, sw.js, pis-*.js  (frontend)
   ├── .htaccess
   ├── api.php                 ← front controller baru (pengganti stub lama)
   ├── backend\                ← seluruh logika backend PHP
   ├── cron\                   ← script Task Scheduler
   ├── database\schema.mysql.sql
   └── templates_source\       ← template .docx/.xlsx asli (utk lanjut porting nanti)
   ```

2. Pastikan modul Apache `mod_rewrite` aktif (default XAMPP sudah aktif).
   Cek `C:\xampp\apache\conf\httpd.conf` — baris `LoadModule rewrite_module modules/mod_rewrite.so`
   tidak boleh diberi tanda `#` di depannya. Juga pastikan folder `htdocs` punya
   `AllowOverride All` supaya `.htaccess` dibaca.

---

## 3. Siapkan Database

1. Jalankan **XAMPP Control Panel** → Start **Apache** & **MySQL**.
2. Buka `http://localhost/phpmyadmin`
3. Klik tab **Import** → pilih file `database/schema.mysql.sql` dari paket ini → **Go**.
   Ini akan otomatis:
   - Membuat database `pis_db`
   - Membuat tabel `records`, `settings`, `sessions`, `login_fails`
   - Membuat akun **Master Admin default: NIK `001`, password `admin123`**

   > Jika MySQL Anda sudah diberi password root, sesuaikan di langkah 4.

---

## 4. Konfigurasi Aplikasi

Edit `C:\xampp\htdocs\pis\backend\config.php`:

```php
define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'pis_db');
define('DB_USER', 'root');
define('DB_PASS', '');   // isi kalau root MySQL Anda pakai password
```

**Penyimpanan file di drive D: (realtime, bukan di dalam htdocs):**
```php
define('STORAGE_ROOT', 'D:/pis-storage/uploads');
define('TEMPLATE_ROOT', 'D:/pis-storage/templates');
define('BACKUP_ROOT',   'D:/pis-storage/backup');
define('CACHE_ROOT',    'D:/pis-storage/cache');
```
Buat folder-folder ini secara manual dulu:
```
D:\pis-storage\uploads
D:\pis-storage\templates
D:\pis-storage\backup
D:\pis-storage\cache
```
Klik kanan tiap folder → **Properties → Security** → pastikan user yang menjalankan
Apache (biasanya semua user / `Everyone` di instalasi XAMPP standar) punya izin
**Write/Modify**. Tanpa ini, upload foto/dokumen karyawan akan gagal.

> Kenapa di drive D: dan bukan di `htdocs`? Supaya file karyawan tidak ikut
> terhapus saat Anda update/timpa source code aplikasi, dan supaya lebih mudah
> di-backup terpisah (drive data vs drive aplikasi).

---

## 5. Cara Kerja 3 Lapis Cache (mengurangi beban XAMPP)

Sesuai permintaan: **data dibaca dari cache, request ke server hanya benar-benar
terjadi saat upload/download file** atau saat cache kedaluwarsa/data berubah.

| Lapis | File | Cara kerja |
|---|---|---|
| 1. Browser (fetch patch) | `pis-request-cache.js` | Menyatukan request yang sama yang menumpuk dari banyak timer polling (de-dupe), simpan hasil GET 8 detik di memori |
| 2. Service Worker (PWA) | `sw.js` | Cache singkat (8 detik) untuk data yang sama walau tab di-reload/offline sebentar |
| 3. Server (XAMPP) | `backend/cache.php` | Cache file 60 detik per query, versi global — sekali data berubah (POST/PUT/DELETE), versi naik dan cache lama otomatis basi (bukan hapus satu-satu, supaya ringan) |

**Yang SELALU tembus ke jaringan tanpa cache sama sekali** (sesuai permintaan Anda):
- Upload file: `POST /api/uploads`
- Download file: `GET /files/*`
- Data personal/realtime: chat, notifikasi pribadi, absensi, login (supaya tidak pernah basi)

Jalankan `cron/clean_cache.php` secara berkala (lihat bagian 7) supaya folder
`D:\pis-storage\cache` tidak menumpuk file basi selamanya.

---

## 6. PWA — "Install Aplikasi" Otomatis

`pis-pwa-install.js` akan menampilkan banner **"Pasang Aplikasi"** otomatis begitu
browser mengizinkan instalasi (Chrome/Edge Android & desktop). Catatan penting:
semua browser modern **mewajibkan satu klik tombol** dari pengguna untuk memicu
instalasi — ini proteksi keamanan bawaan browser, tidak bisa benar-benar
"auto-install" tanpa sentuhan pengguna sama sekali. Banner ini membuat prosesnya
semudah mungkin: begitu link dibuka, tombol instal langsung tampil di layar.

Safari/iOS tidak mendukung `beforeinstallprompt` — pengguna iPhone tetap harus
pakai menu Share → "Add to Home Screen" secara manual (batasan Apple, bukan bug).

---

## 7. Jadwal Berkala (pengganti "cron" Cloudflare) via Task Scheduler

Buka **Task Scheduler** Windows → **Create Task** untuk masing-masing:

| Script | Jadwal | Perintah |
|---|---|---|
| `cron\clean_cache.php` | Tiap 1 jam | `C:\xampp\php\php.exe C:\xampp\htdocs\pis\cron\clean_cache.php` |
| `cron\sweep_auto_alfa.php` | Tiap 1 jam | `C:\xampp\php\php.exe C:\xampp\htdocs\pis\cron\sweep_auto_alfa.php` |
| `cron\generate_payslip.php` | Tanggal 1 tiap bulan, 00:05 | `C:\xampp\php\php.exe C:\xampp\htdocs\pis\cron\generate_payslip.php` |

Ketiganya sekarang **sudah diimplementasikan penuh** (bukan stub lagi). Sebelum
mengaktifkan `generate_payslip.php` di jadwal produksi, jalankan dulu manual sekali
(`php cron\generate_payslip.php` lewat Command Prompt) di server staging dan periksa
hasilnya di menu Slip Gaji, karena fungsi ini langsung membuat data gaji karyawan.

---

## 8. Roadmap Porting Lanjutan

Semua fungsi yang belum diport terdaftar di `backend/functions.php` bagian bawah
(`fn_not_yet_ported`) — sekarang tersisa: `fixApplicantBranches`, `syncDataQueryWithEmployees`,
`approveShiftSwap`, `cancelShiftSwap`, `notifyBulkShift`, `notifyShiftChange`,
`weeklyAreaReport`, `archiveOldData`, `restoreArchivedData`, `updateApplicantStatus`,
`bulkImportEmployees`, alur approval `requestPasswordReset`/`requestPasswordChange`/
`approvePasswordRequest`/`rejectPasswordRequest`, `getAttendanceButtons`,
`requestShiftSwapV2`/`confirmShiftSwapStatus`, dan `generateJadwalBulananOtomatis`.

Untuk melanjutkan satu fungsi:

1. Buka `worker.js` (source code asli, ada di paket upload Anda) dan cari nama fungsi
   yang sama, misalnya `fnBulkImportEmployees`.
2. Tulis ulang query `env.DB.prepare(...)` (D1/SQLite) menjadi PDO (`db()->prepare(...)`)
   — pola CRUD generik sudah tersedia di `backend/entities.php`
   (`list_entity`, `get_entity`, `create_entity`, `update_entity`).
3. Ganti pemakaian `env.UPLOADS` (R2) dengan fungsi di `backend/upload.php`.
4. Daftarkan nama fungsinya kembali di `functions_table()` (`backend/functions.php`),
   ganti dari `fn_not_yet_ported(...)` ke fungsi PHP baru Anda.
5. Uji di server staging dengan data contoh dulu sebelum dipakai untuk data karyawan asli.

Disarankan memakai **Claude Code** untuk melanjutkan porting ini secara bertahap,
karena prosesnya panjang (±20 fungsi tersisa) dan perlu pengujian tiap langkah.

---

## 9. Saran Aplikasi Tambahan (di luar XAMPP saja)

### 9.1 Setup untuk fitur PKWT & Surat Tugas (docx) — sudah bisa jalan tanpa Composer

Fitur generate PKWT/Surat Tugas memakai ekstensi **`zip`** bawaan PHP untuk mengisi
template `.docx` langsung — **tidak perlu Composer atau library eksternal apa pun**.
Yang perlu disiapkan:

1. Pastikan ekstensi `zip` aktif: buka `C:\xampp\php\php.ini`, cari baris
   `;extension=zip` dan hapus tanda `;` di depannya (jadi `extension=zip`), lalu
   **restart Apache** lewat XAMPP Control Panel.
2. Salin 2 file template dari `templates_source/` (sudah ada di paket ini) ke:
   ```
   D:\pis-storage\templates\pkwt_template.docx
   D:\pis-storage\templates\surat_tugas_template.docx
   ```
   (folder `TEMPLATE_ROOT` yang sudah diatur di `backend/config.php`)
3. Placeholder di dalam template ditulis dengan format `[Nama Placeholder]`, misalnya
   `[Nama Karyawan]`, `[NIK ID KARYAWAN]`, `[Gaji Pokok]`, dst — daftar lengkap ada di
   `backend/pkwt.php` (variabel `$pkwtMapping` dan `$stMapping`). Kalau template diedit
   ulang di Microsoft Word dan sebagian placeholder "pecah" jadi beberapa run, sistem
   sudah otomatis menyatukannya kembali sebelum mengisi data (tidak perlu dirapikan manual).

XAMPP saja **sudah cukup** untuk fitur ini. Kalau nanti Anda juga butuh **import/export
massal ke Excel** (fitur yang belum diport — lihat bagian 0), barulah perlu Composer +
`phpoffice/phpspreadsheet` seperti di tabel bawah ini.

### 9.2 Kebutuhan lain

XAMPP (Apache+MySQL+PHP) cukup untuk fondasi yang sudah diport di paket ini. Tapi
untuk fitur-fitur yang **belum** diport, Anda akan butuh alat tambahan berikut:

| Kebutuhan | Kenapa XAMPP saja tidak cukup | Saran |
|---|---|---|
| Import/export Data Karyawan & Payslip (.xlsx) | Perlu library baca/tulis Excel | **Composer + `phpoffice/phpspreadsheet`** |
| Email notifikasi status lamaran | PHP `mail()` bawaan XAMPP butuh SMTP relay eksternal, sering diblokir ISP | **Composer + `phpmailer/phpmailer`**, pakai SMTP Gmail/Zoho/dsb |
| Chat/notifikasi benar-benar instan (push, bukan polling) | HTTP biasa tidak bisa push dari server ke browser | Opsional: **Node.js kecil + Socket.IO** berjalan terpisah di port lain, atau cukup polling+cache yang sudah dibangun (biasanya cukup untuk aplikasi internal) |
| Backup otomatis database terjadwal | XAMPP tidak punya backup bawaan | **mysqldump** dijadwalkan via Task Scheduler ke folder `D:\pis-storage\backup` |
| Akses dari luar jaringan kantor / HTTPS | XAMPP default hanya untuk jaringan lokal, tanpa SSL | **Reverse proxy** (mis. Caddy/Nginx) + sertifikat **Let's Encrypt**, atau tunnel seperti **Cloudflare Tunnel** khusus untuk expose XAMPP lokal ke internet dengan aman |

Untuk kebutuhan internal kantor (semua user di jaringan yang sama), XAMPP + folder
D: yang sudah dikonfigurasi di panduan ini **sudah cukup** tanpa tambahan apa pun.

---

## 10. Uji Coba & Keamanan Setelah Instal

1. Buka `http://localhost/pis` di browser.
2. Login dengan **NIK `001`** / password **`admin123`**.
3. **Segera ganti password Master Admin default ini** setelah login pertama
   (lewat fitur ganti password yang ada di menu profil).
4. Set `APP_DEBUG` menjadi `false` di `backend/config.php` sebelum server ini
   dipakai sungguhan (supaya pesan error teknis tidak bocor ke pengguna).
5. Jika XAMPP ini akan diakses banyak orang di kantor, cek juga folder
   `htdocs\pis\backend\` tidak bisa diakses langsung lewat browser
   (coba buka `http://localhost/pis/backend/config.php` — harus muncul
   "Forbidden" karena guard `PIS_APP` di tiap file, bukan isi konfigurasi).
