<?php
if (!defined('PIS_APP')) { http_response_code(403); exit('Forbidden'); }

function json_out($data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function bad(string $msg, int $status = 400): void {
    json_out(['success' => false, 'error' => $msg], $status);
}

function new_id(): string {
    return bin2hex(random_bytes(16));
}

function get_json_body(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

/** field name yang aman dipakai sbg key JSON di query filter (mencegah SQL injection via nama kolom) */
function is_safe_field(string $k): bool {
    return (bool) preg_match('/^[a-zA-Z0-9_]+$/', $k);
}
