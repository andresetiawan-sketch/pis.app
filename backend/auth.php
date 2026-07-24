<?php
if (!defined('PIS_APP')) { http_response_code(403); exit('Forbidden'); }
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/config.php';

const ADMIN_ROLES = ['Master Admin', 'Admin', 'admin', 'master_admin'];
const MASTER_ADMIN_ROLES = ['Master Admin', 'master_admin'];

function create_session(array $payload): string {
    $token = bin2hex(random_bytes(20)) . bin2hex(random_bytes(20));
    $expires = date('Y-m-d H:i:s', time() + SESSION_TTL_SECONDS);
    $stmt = db()->prepare('INSERT INTO sessions (token, payload, expires_at) VALUES (?, ?, ?)');
    $stmt->execute([$token, json_encode($payload), $expires]);
    return $token;
}

function read_session(string $token): ?array {
    $stmt = db()->prepare('SELECT payload FROM sessions WHERE token = ? AND expires_at > NOW() LIMIT 1');
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    if (!$row) return null;
    $data = json_decode($row['payload'], true);
    return is_array($data) ? $data : null;
}

function revoke_session(string $token): void {
    $stmt = db()->prepare('DELETE FROM sessions WHERE token = ?');
    $stmt->execute([$token]);
}

/** Ambil data auth (sesi login) dari header X-Employee-Token atau Authorization: Bearer */
function get_auth(): ?array {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $token = $headers['X-Employee-Token'] ?? $headers['x-employee-token'] ?? null;
    if (!$token) {
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        if (str_starts_with($authHeader, 'Bearer ')) {
            $token = substr($authHeader, 7);
        }
    }
    if (!$token) return null;
    return read_session($token);
}

function is_admin(?array $auth): bool {
    return $auth && in_array($auth['role'] ?? '', ADMIN_ROLES, true);
}
function is_master_admin(?array $auth): bool {
    return $auth && in_array($auth['role'] ?? '', MASTER_ADMIN_ROLES, true);
}
function is_head_office_auth(?array $auth): bool {
    if (!$auth) return false;
    if (is_admin($auth)) return true;
    $area = strtolower(trim($auth['area_tugas'] ?? ''));
    return in_array($area, ['head office', 'kantor pusat'], true);
}

// ── Brute-force protection (pengganti KV loginfail:{nik}) ──
function is_login_locked(string $nik): bool {
    $stmt = db()->prepare('SELECT attempts, locked_until FROM login_fails WHERE nik = ? LIMIT 1');
    $stmt->execute([$nik]);
    $row = $stmt->fetch();
    if (!$row) return false;
    if ($row['locked_until'] && strtotime($row['locked_until']) < time()) return false; // sudah kadaluarsa
    return ((int)$row['attempts']) >= LOGIN_MAX_ATTEMPTS;
}

function register_login_failure(string $nik): void {
    $lockedUntil = date('Y-m-d H:i:s', time() + LOGIN_LOCK_SECONDS);
    $stmt = db()->prepare(
        'INSERT INTO login_fails (nik, attempts, locked_until) VALUES (?, 1, ?)
         ON DUPLICATE KEY UPDATE attempts = attempts + 1, locked_until = VALUES(locked_until)'
    );
    $stmt->execute([$nik, $lockedUntil]);
}

function clear_login_failure(string $nik): void {
    $stmt = db()->prepare('DELETE FROM login_fails WHERE nik = ?');
    $stmt->execute([$nik]);
}
