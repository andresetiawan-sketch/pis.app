<?php
if (!defined('PIS_APP')) { http_response_code(403); exit('Forbidden'); }
require_once __DIR__ . '/config.php';

/**
 * Cache versi (mirip skema KV di worker.js): satu angka versi global.
 * Naikkan versi = 1 operasi file write, BUKAN hapus ratusan file cache lama
 * satu-per-satu (itulah yang bikin versi Cloudflare lama "over limit").
 * Cache key menyertakan versi ini, jadi begitu versi naik, cache lama
 * otomatis tidak terpakai lagi dan akan tersapu oleh TTL/cron pembersih.
 */
const API_CACHE_TTL = 60; // detik — samakan dengan versi asli (worker.js)

const NO_CACHE_ENTITIES = [
    "AdminChat", "SystemNotification", "Attendance", "EPatrol",
    "PanicAlert", "ShiftNotification", "PasswordResetRequest",
];
const NO_CACHE_FUNCTIONS = [
    "getMyNotifications", "getMyChat", "getMyChatUnreadCount",
    "getChatCount", "getChats", "getAttendanceButtons",
    "employeeLogin", "employeeLogout", "getEmployeeByNik",
    "markChatRead", "markNotificationRead",
];

function cache_dir(): string {
    $dir = rtrim(CACHE_ROOT, '/\\');
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    return $dir;
}

function cache_version_file(): string {
    return cache_dir() . '/version.txt';
}

function get_cache_version(): string {
    $file = cache_version_file();
    if (!file_exists($file)) {
        file_put_contents($file, '0');
        return '0';
    }
    return trim(file_get_contents($file)) ?: '0';
}

function bump_api_cache_version(): void {
    @file_put_contents(cache_version_file(), (string) round(microtime(true) * 1000));
}

function should_cache_get(string $method, string $path): bool {
    if ($method !== 'GET') return false;
    if (str_starts_with($path, '/api/uploads') || str_starts_with($path, '/files/')) return false; // upload/download: JANGAN pernah cache
    if (str_starts_with($path, '/api/apps/entities/')) {
        $entity = urldecode(explode('/', substr($path, strlen('/api/apps/entities/')))[0]);
        return !in_array($entity, NO_CACHE_ENTITIES, true);
    }
    if (str_starts_with($path, '/api/apps/functions/')) {
        $fnName = substr($path, strlen('/api/apps/functions/'));
        return !in_array($fnName, NO_CACHE_FUNCTIONS, true);
    }
    if ($path === '/api/settings/branding') return true;
    return false;
}

function api_cache_key(string $path, string $query, ?array $auth): string {
    $userKey = $auth['nik'] ?? 'anon';
    $version = get_cache_version();
    return md5("v$version:$userKey:$path?$query");
}

function get_cached_response(string $key): ?array {
    $file = cache_dir() . "/$key.json";
    if (!file_exists($file)) return null;
    if (time() - filemtime($file) > API_CACHE_TTL) return null; // basi
    $raw = @file_get_contents($file);
    if (!$raw) return null;
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function set_cached_response(string $key, $body, int $status): void {
    $file = cache_dir() . "/$key.json";
    @file_put_contents($file, json_encode(['body' => $body, 'status' => $status]));
}

/** Panggil sekali-kali dari cron untuk buang file cache basi (opsional, lihat cron/clean_cache.php) */
function clean_expired_cache_files(): int {
    $dir = cache_dir();
    $removed = 0;
    foreach (glob("$dir/*.json") ?: [] as $file) {
        if (time() - filemtime($file) > API_CACHE_TTL * 5) {
            @unlink($file);
            $removed++;
        }
    }
    return $removed;
}
