<?php
/**
 * PENGGANTI cron Cloudflare "0 * * * *" (tiap jam) — menandai karyawan
 * berjadwal fleksibel yang tidak absen dalam 1x24 jam sebagai "Alfa".
 * Logika sama persis dengan sweepAutoAlfa() di worker.js.
 *
 * Jadwalkan lewat Windows Task Scheduler tiap jam:
 *   C:\xampp\php\php.exe C:\xampp\htdocs\pis\cron\sweep_auto_alfa.php
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

$result = sweep_auto_alfa();
echo "Selesai. {$result['processed']} karyawan ditandai Alfa otomatis.\n";
