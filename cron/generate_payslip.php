<?php
/**
 * PENGGANTI cron Cloudflare "0 0 1 * *" (tanggal 1 tiap bulan) — membuat
 * Payslip + baris Data Query otomatis untuk semua Employee aktif.
 * Logika sama persis dengan generatePayslipBulanan() di worker.js.
 *
 * PENTING: uji dulu di server staging dengan data contoh sebelum dipakai
 * untuk payroll sungguhan — perhitungan menyentuh uang gaji karyawan.
 *
 * Jadwalkan lewat Windows Task Scheduler, tanggal 1 tiap bulan jam 00:05:
 *   C:\xampp\php\php.exe C:\xampp\htdocs\pis\cron\generate_payslip.php
 */
define('PIS_APP', true);
require_once __DIR__ . '/../backend/config.php';
require_once __DIR__ . '/../backend/db.php';
require_once __DIR__ . '/../backend/helpers.php';
require_once __DIR__ . '/../backend/auth.php';
require_once __DIR__ . '/../backend/entities.php';
require_once __DIR__ . '/../backend/functions.php';
require_once __DIR__ . '/../backend/doc_helpers.php';
require_once __DIR__ . '/../backend/pkwt.php';
require_once __DIR__ . '/../backend/payroll.php';

$result = generate_payslip_bulanan();
echo "Selesai periode {$result['periode']}: {$result['created']} dibuat, {$result['skipped']} dilewati, {$result['failed']} gagal.\n";
if ($result['errors']) {
    echo "Error:\n" . implode("\n", $result['errors']) . "\n";
}
