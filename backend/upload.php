<?php
if (!defined('PIS_APP')) { http_response_code(403); exit('Forbidden'); }
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

/** POST /api/uploads — multipart/form-data field "file", simpan ke STORAGE_ROOT (drive D:) */
function handle_upload(): void {
    if (!isset($_FILES['file'])) bad('File tidak ditemukan');
    $file = $_FILES['file'];
    if ($file['error'] !== UPLOAD_ERR_OK) bad('Upload gagal (kode error: ' . $file['error'] . ')');

    $ext = 'bin';
    if (str_contains($file['name'], '.')) {
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    }
    $datePart = date('Y-m-d');
    $dir = rtrim(STORAGE_ROOT, '/\\') . "/$datePart";
    if (!is_dir($dir)) {
        if (!mkdir($dir, 0775, true) && !is_dir($dir)) {
            bad('Tidak bisa membuat folder penyimpanan di ' . STORAGE_ROOT . '. Pastikan drive D: ada dan folder tersebut writable oleh Apache.', 500);
        }
    }
    $key = "$datePart/" . new_id() . ".$ext";
    $dest = rtrim(STORAGE_ROOT, '/\\') . "/$key";
    if (!move_uploaded_file($file['tmp_name'], $dest)) {
        bad('Gagal menyimpan file ke ' . $dest, 500);
    }
    json_out(['file_url' => FILES_BASE_URL . '/' . $key]);
}

/** GET /files/{key...} — layani file yang tersimpan di drive D: */
function serve_file(string $key): void {
    // cegah path traversal (../) keluar dari STORAGE_ROOT
    $key = str_replace('\\', '/', $key);
    if (str_contains($key, '..')) { http_response_code(400); exit('Bad request'); }

    $path = rtrim(STORAGE_ROOT, '/\\') . '/' . ltrim($key, '/');
    if (!is_file($path)) { http_response_code(404); exit('Not found'); }

    $mime = mime_content_type($path) ?: 'application/octet-stream';
    header('Content-Type: ' . $mime);
    header('Cache-Control: public, max-age=31536000, immutable');
    header('Content-Length: ' . filesize($path));
    readfile($path);
    exit;
}
