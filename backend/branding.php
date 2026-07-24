<?php
if (!defined('PIS_APP')) { http_response_code(403); exit('Forbidden'); }
require_once __DIR__ . '/functions.php';

function handle_branding_get(): void {
    $logoKey = get_setting('logo_key');
    $faviconKey = get_setting('favicon_key');
    $appName = get_setting('app_name') ?: APP_NAME_DEFAULT;
    json_out([
        'success' => true,
        'app_name' => $appName,
        'logo_url' => $logoKey ? FILES_BASE_URL . '/' . $logoKey : null,
        'favicon_url' => $faviconKey ? FILES_BASE_URL . '/' . $faviconKey : null,
    ]);
}

function handle_branding_post(): void {
    $auth = get_auth();
    if (!is_master_admin($auth)) bad('Hanya Master Admin yang bisa mengubah branding', 403);

    // BUGFIX: form "Ganti Logo & Favicon" di index.html mengirim multipart/form-data
    // berisi file mentah (field "logo" / "favicon"), BUKAN JSON {logo_key, favicon_key}.
    // Kode lama hanya membaca JSON lewat get_json_body(), sehingga upload logo/favicon
    // dari UI selalu tidak tersimpan (silent no-op). Sekarang dua cara didukung:
    //  1) multipart/form-data dengan file mentah (dipakai oleh index.html) → disimpan
    //     langsung ke STORAGE_ROOT/branding lalu key-nya disimpan ke settings.
    //  2) JSON {app_name, logo_key, favicon_key} (kalau file sudah diupload lebih dulu
    //     lewat /api/uploads) → tetap didukung untuk kompatibilitas.
    $isMultipart = stripos($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data') !== false;

    $appName = null; $logoKey = null; $faviconKey = null;
    if ($isMultipart) {
        $appName = isset($_POST['app_name']) ? (string)$_POST['app_name'] : null;
        if (!empty($_FILES['logo']['name'])) $logoKey = save_branding_file($_FILES['logo']);
        if (!empty($_FILES['favicon']['name'])) $faviconKey = save_branding_file($_FILES['favicon']);
    } else {
        $body = get_json_body();
        $appName = isset($body['app_name']) ? (string)$body['app_name'] : null;
        $logoKey = isset($body['logo_key']) ? (string)$body['logo_key'] : null;
        $faviconKey = isset($body['favicon_key']) ? (string)$body['favicon_key'] : null;
    }

    if ($appName !== null && $appName !== '') set_setting('app_name', $appName);
    if ($logoKey) set_setting('logo_key', $logoKey);
    if ($faviconKey) set_setting('favicon_key', $faviconKey);

    json_out(['success' => true, 'app_name' => get_setting('app_name') ?: APP_NAME_DEFAULT]);
}

/** Simpan file logo/favicon yang diupload ke STORAGE_ROOT/branding, kembalikan key relatifnya. */
function save_branding_file(array $file): ?string {
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) return null;
    $ext = 'bin';
    if (str_contains($file['name'], '.')) $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $dir = rtrim(STORAGE_ROOT, '/\\') . '/branding';
    if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
    $key = 'branding/' . new_id() . '.' . $ext;
    $dest = rtrim(STORAGE_ROOT, '/\\') . '/' . $key;
    if (!move_uploaded_file($file['tmp_name'], $dest)) return null;
    return $key;
}

/** GET /branding/favicon — dipakai langsung oleh <link rel="icon"> di index.html.
 *  BUGFIX: sebelumnya route ini tidak terdaftar sama sekali di api.php, sehingga
 *  browser meminta /branding/favicon dan (lewat SPA fallback) malah menerima isi
 *  index.html sebagai "favicon" (favicon custom tidak pernah tampil). Sekarang
 *  redirect ke file favicon custom (drive D:) jika ada, atau fallback ke favicon
 *  bawaan aplikasi (/icons/favicon.ico) yang dilayani nginx/Apache secara statis. */
function handle_branding_favicon(): void {
    $faviconKey = get_setting('favicon_key');
    if ($faviconKey) {
        header('Location: ' . FILES_BASE_URL . '/' . $faviconKey);
    } else {
        header('Location: /icons/favicon.ico');
    }
    http_response_code(302);
    exit;
}
