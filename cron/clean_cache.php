<?php
/**
 * Jalankan berkala (mis. tiap jam) lewat Windows Task Scheduler:
 *   C:\xampp\php\php.exe C:\xampp\htdocs\pis\cron\clean_cache.php
 * Tujuan: membuang file cache API yang sudah basi supaya folder cache
 * tidak menumpuk terus di drive D:.
 */
define('PIS_APP', true);
require_once __DIR__ . '/../backend/config.php';
require_once __DIR__ . '/../backend/cache.php';

$removed = clean_expired_cache_files();
echo "Selesai. $removed file cache basi dihapus.\n";
