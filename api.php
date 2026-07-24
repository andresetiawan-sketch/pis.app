<?php
/**
 * ============================================================
 *  PIS INTEGRATED SYSTEM — Front Controller (versi XAMPP/PHP)
 *  Menggantikan worker.js (Cloudflare Worker) — dipanggil oleh .htaccess
 *  untuk semua request /api/* dan /files/*.
 * ============================================================
 */
define('PIS_APP', true);

require_once __DIR__ . '/backend/config.php';
require_once __DIR__ . '/backend/helpers.php';
require_once __DIR__ . '/backend/db.php';
require_once __DIR__ . '/backend/auth.php';
require_once __DIR__ . '/backend/entities.php';
require_once __DIR__ . '/backend/functions.php';
require_once __DIR__ . '/backend/doc_helpers.php';
require_once __DIR__ . '/backend/pkwt.php';
require_once __DIR__ . '/backend/payroll.php';
require_once __DIR__ . '/backend/chat.php';
require_once __DIR__ . '/backend/upload.php';
require_once __DIR__ . '/backend/branding.php';
require_once __DIR__ . '/backend/cache.php';
require_once __DIR__ . '/backend/xlsx_reader.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Employee-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];
$query = $_GET;

try {
    // ── Layer cache (hanya untuk GET yang aman di-cache; upload/download selalu network) ──
    if (should_cache_get($method, $path)) {
        $auth = get_auth();
        $key = api_cache_key($path, http_build_query($query), $auth);
        $cached = get_cached_response($key);
        if ($cached !== null) {
            header('X-Cache: HIT');
            json_out($cached['body'], $cached['status']);
        }
        // json_out() di dalam route_request() SELALU memanggil exit(), jadi baris
        // kode setelah route_request() di bawah ini tidak pernah tercapai. Supaya
        // hasil response tetap bisa disimpan ke cache, tangkap outputnya lewat
        // output buffering + shutdown function (tetap berjalan walau ada exit()).
        header('X-Cache: MISS');
        ob_start();
        register_shutdown_function(function () use ($key) {
            $status = http_response_code();
            $content = ob_get_contents();
            if ($content !== false && $status === 200) {
                $decoded = json_decode($content, true);
                if ($decoded !== null) set_cached_response($key, $decoded, $status);
            }
        });
        route_request($method, $path, $query);
        exit; // tidak akan tercapai (route_request exit duluan), dijaga untuk keamanan
    }

    route_request($method, $path, $query);

    // ── Invalidasi cache versi setelah operasi tulis ──
    if (in_array($method, ['POST', 'PUT', 'DELETE'], true)) {
        bump_api_cache_version();
    }
} catch (Throwable $e) {
    json_out(['success' => false, 'error' => APP_DEBUG ? $e->getMessage() : 'Terjadi kesalahan di server'], 500);
}

/** Routing utama — persis struktur worker.js handleRequest() */
function route_request(string $method, string $path, array $query): void {
    if (str_starts_with($path, '/api/apps/entities/')) {
        handle_entities($method, substr($path, strlen('/api/apps/entities/')), $query);
        return;
    }
    if (str_starts_with($path, '/api/apps/functions/')) {
        handle_functions(substr($path, strlen('/api/apps/functions/')));
        return;
    }
    if ($path === '/api/uploads' && $method === 'POST') {
        handle_upload();
        return;
    }
    if (str_starts_with($path, '/files/')) {
        serve_file(substr($path, strlen('/files/')));
        return;
    }
    if ($path === '/api/settings/branding') {
        if ($method === 'GET') { handle_branding_get(); return; }
        if ($method === 'POST') { handle_branding_post(); return; }
    }
    // BUGFIX: route ini dipakai langsung oleh <link id="pis-favicon"> di index.html
    // tapi sebelumnya tidak pernah didaftarkan (favicon custom tidak pernah muncul).
    if ($path === '/branding/favicon' && $method === 'GET') {
        handle_branding_favicon();
        return;
    }
    if ($path === '/api/health') {
        json_out(['status' => 'ok', 'ts' => round(microtime(true) * 1000)]);
        return;
    }
    if ($path === '/api/apps/integrations/Core/InvokeLLM') {
        json_out(['error' => 'Fitur AI belum dikonfigurasi di server ini.'], 501);
        return;
    }
    // BUGFIX: dipakai oleh semua fitur "Impor dari Excel" (Data Karyawan, Data
    // Pelamar, dst) — sebelumnya route ini tidak pernah didaftarkan sama sekali,
    // sehingga import selalu gagal walau file mentahnya sudah tersimpan di D:\.
    if ($path === '/api/apps/integrations/Core/ExtractDataFromUploadedFile' && $method === 'POST') {
        handle_extract_data_from_uploaded_file();
        return;
    }
    if (str_starts_with($path, '/api/apps/analytics/') || str_starts_with($path, '/api/app-logs/')) {
        json_out(['success' => true]);
        return;
    }

    bad("Endpoint \"$path\" tidak ditemukan", 404);
}
