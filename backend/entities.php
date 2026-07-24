<?php
if (!defined('PIS_APP')) { http_response_code(403); exit('Forbidden'); }
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/auth.php';

// Daftar entity yang dikenali sistem (identik dengan Set ENTITIES di worker.js)
const ENTITIES = [
    "Applicant","Archive","AreaContract","AreaProject","AssetMaintenance","Assignment",
    "Attendance","BankTransaction","ChecklistEmergency","ChecklistHydrant","ChecklistKR",
    "ChecklistToilet","DailyChecklist","DashboardConfig","EFacility","Employee","EPatrol",
    "EPatrolCustom","EPatrolTemplate","FacilityTicket","GuestBook","Inventory","LaporanHarian",
    "LeaveQuota","LeaveRequest","LoanRecord","NikCounter","OvertimeClaim","PanicAlert","Payslip",
    "PerformanceReview","PKWTContract","Regu","ShiftHandover","ShiftNotification","ShiftRequirement",
    "ShiftSchedule","ShiftSwap","SOPAudit","SOPChecklist","StockMutation","TaskBoard",
    "TenantPackage","TenantReport","TicketComment","AdminChat","AdminMenu",
    "PasswordResetRequest","SystemNotification","DataQuery","PayrollRapel",
];

function row_to_record(array $row): array {
    $data = json_decode($row['data'], true);
    if (!is_array($data)) $data = [];
    $data['id'] = $row['id'];
    $data['created_date'] = $row['created_date'];
    $data['updated_date'] = $row['updated_date'];
    return $data;
}

function list_entity(string $entity, array $query): array {
    $sort = $query['sort'] ?? '';
    $limit = min((int)($query['limit'] ?? 500) ?: 500, 100000);
    $skip = (int)($query['skip'] ?? 0);

    $filters = [];
    $binds = [$entity];
    foreach ($query as $k => $v) {
        if (in_array($k, ['sort', 'limit', 'skip'], true)) continue;
        if (!is_safe_field($k) || $v === '') continue;
        if ($k === 'id') {
            $filters[] = 'id = ?';
        } elseif ($k === 'created_date' || $k === 'updated_date') {
            $filters[] = "$k = ?";
        } else {
            $filters[] = "CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.$k')) AS CHAR) = ?";
        }
        $binds[] = $v;
    }

    $orderBy = 'created_date DESC';
    if ($sort) {
        $desc = str_starts_with($sort, '-');
        $field = $desc ? substr($sort, 1) : $sort;
        if (is_safe_field($field)) {
            if (in_array($field, ['created_date', 'updated_date'], true)) {
                $orderBy = "$field " . ($desc ? 'DESC' : 'ASC');
            } else {
                $orderBy = "JSON_EXTRACT(data, '$.$field') " . ($desc ? 'DESC' : 'ASC');
            }
        }
    }

    $where = implode(' AND ', array_merge(['entity = ?'], $filters));
    $sql = "SELECT id, data, created_date, updated_date FROM records WHERE $where ORDER BY $orderBy LIMIT ? OFFSET ?";
    $binds[] = $limit;
    $binds[] = $skip;

    $stmt = db()->prepare($sql);
    $stmt->execute($binds);
    return array_map('row_to_record', $stmt->fetchAll());
}

function get_entity(string $entity, string $id): ?array {
    $stmt = db()->prepare('SELECT id, data, created_date, updated_date FROM records WHERE entity = ? AND id = ? LIMIT 1');
    $stmt->execute([$entity, $id]);
    $row = $stmt->fetch();
    return $row ? row_to_record($row) : null;
}

function create_entity(string $entity, array $body, ?string $createdBy = null, ?string $explicitId = null): array {
    $id = $explicitId ?: new_id();
    $stmt = db()->prepare('INSERT INTO records (id, entity, data, created_by) VALUES (?, ?, ?, ?)');
    $stmt->execute([$id, $entity, json_encode($body ?: new stdClass()), $createdBy]);
    return get_entity($entity, $id);
}

function update_entity(string $entity, string $id, array $patch): ?array {
    $existing = get_entity($entity, $id);
    if (!$existing) return null;
    unset($existing['id'], $existing['created_date'], $existing['updated_date']);
    $merged = array_merge($existing, $patch);
    $stmt = db()->prepare('UPDATE records SET data = ? WHERE entity = ? AND id = ?');
    $stmt->execute([json_encode($merged), $entity, $id]);
    return get_entity($entity, $id);
}

function delete_entity(string $entity, string $id): array {
    $stmt = db()->prepare('DELETE FROM records WHERE entity = ? AND id = ?');
    $stmt->execute([$entity, $id]);
    return ['success' => true];
}

// ── NIK karyawan harus unik (ported dari checkNikUnique) ──
function check_nik_unique(string $nik, ?string $excludeId = null): bool {
    $stmt = db()->prepare("SELECT id FROM records WHERE entity='Employee' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.nik_karyawan')) = ? LIMIT 1");
    $stmt->execute([$nik]);
    $row = $stmt->fetch();
    if (!$row) return true;
    if ($excludeId && $row['id'] === $excludeId) return true;
    return false;
}

function find_employee_by_nik(string $nik): ?array {
    $stmt = db()->prepare("SELECT id, data, created_date, updated_date FROM records WHERE entity='Employee' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.nik_karyawan')) = ? LIMIT 1");
    $stmt->execute([$nik]);
    $row = $stmt->fetch();
    return $row ? row_to_record($row) : null;
}

// ── Lock GPS e-absensi (ported dari haversineMeters + checkAttendanceGpsLock) ──
function haversine_meters(float $lat1, float $lon1, float $lat2, float $lon2): float {
    $R = 6371000;
    $toRad = fn($d) => $d * M_PI / 180;
    $dLat = $toRad($lat2 - $lat1);
    $dLon = $toRad($lon2 - $lon1);
    $a = sin($dLat / 2) ** 2 + cos($toRad($lat1)) * cos($toRad($lat2)) * sin($dLon / 2) ** 2;
    return $R * 2 * asin(sqrt($a));
}

function check_attendance_gps_lock(array $body): ?string {
    $areaTugas = $body['area_tugas'] ?? null;
    $lat = $body['latitude'] ?? null;
    $lon = $body['longitude'] ?? null;
    if (!$areaTugas) return null;

    $areas = list_entity('AreaProject', ['nama_area' => $areaTugas, 'limit' => 5]);
    $area = $areas[0] ?? null;
    if (!$area) {
        foreach (list_entity('AreaProject', ['limit' => 1000]) as $a) {
            $nama = strtolower(trim($a['nama_area'] ?? $a['nama_proyek'] ?? ''));
            if ($nama === strtolower(trim($areaTugas))) { $area = $a; break; }
        }
    }
    if (!$area || !isset($area['latitude']) || !isset($area['longitude']) || $area['latitude'] === null || $area['longitude'] === null) {
        return null; // area belum diset koordinat
    }
    $radius = (float)($area['radius_absensi_meter'] ?? 100) ?: 100;
    $distance = haversine_meters((float)$lat, (float)$lon, (float)$area['latitude'], (float)$area['longitude']);
    if ($distance > $radius) {
        return "Absen ditolak: Anda berada " . round($distance) . " meter dari titik area \"$areaTugas\" (maksimal $radius meter).";
    }
    return null;
}

// ── Cek bentrok jadwal shift antar regu (ported dari checkShiftScheduleConflict) ──
function check_shift_schedule_conflict(array $body, ?string $excludeId = null): ?string {
    $areaTugas = $body['area_tugas'] ?? null;
    $tanggal = $body['tanggal'] ?? null;
    $karyawanIds = $body['karyawan_ids'] ?? null;
    if (!$areaTugas || !$tanggal || !is_array($karyawanIds) || !count($karyawanIds)) return null;

    $stmt = db()->prepare("SELECT id, data FROM records WHERE entity='ShiftSchedule' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.area_tugas')) = ? AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.tanggal')) = ?");
    $stmt->execute([$areaTugas, $tanggal]);
    foreach ($stmt->fetchAll() as $row) {
        if ($excludeId && $row['id'] === $excludeId) continue;
        $data = json_decode($row['data'], true) ?: [];
        $existingIds = $data['karyawan_ids'] ?? [];
        $clash = array_values(array_intersect($karyawanIds, $existingIds));
        if (count($clash)) {
            return "Jadwal bentrok: karyawan (NIK " . implode(', ', $clash) . ") sudah dijadwalkan pada regu lain di area $areaTugas tanggal $tanggal.";
        }
    }
    return null;
}

/**
 * Sensor field password & data sensitif karyawan untuk yang bukan Head Office/Admin.
 * (Versi sederhana dari redactEmployee — silakan perluas sesuai kebutuhan area access.)
 *
 * $auth diisi supaya Admin/Master Admin (is_admin()) tetap bisa melihat password
 * karyawan — dipakai oleh halaman "Karyawan Area" (Data Karyawan Area) di frontend
 * untuk menampilkan password. Selain role Admin/Master Admin, password tetap disensor.
 */
function redact_employee(array $emp, ?array $auth = null): array {
    if (is_admin($auth)) return $emp;
    unset($emp['password']);
    return $emp;
}

/**
 * Router utama untuk /api/apps/entities/{entity}[/{id}]
 * Meniru handleEntities() di worker.js: CRUD generik + aturan bisnis inti.
 */
function handle_entities(string $method, string $pathAfter, array $query): void {
    $parts = explode('/', $pathAfter, 2);
    $entityRaw = $parts[0] ?? '';
    $id = $parts[1] ?? null;
    $entity = urldecode($entityRaw);

    if (!in_array($entity, ENTITIES, true)) {
        $singular = str_ends_with($entity, 's') ? substr($entity, 0, -1) : $entity;
        if (in_array($singular, ENTITIES, true)) {
            $entity = $singular;
        } else {
            bad("Entity \"$entityRaw\" tidak dikenal", 404);
        }
    }

    $auth = get_auth();

    // Hak akses edit/hapus Area/Proyek (versi dasar: hanya admin boleh)
    if (in_array($entity, ['AreaProject', 'AreaContract'], true) && in_array($method, ['PUT', 'DELETE'], true) && $id) {
        if (!is_admin($auth)) {
            bad('Anda tidak memiliki hak akses untuk mengubah/menghapus data ini. Hubungi Administrator.', 403);
        }
    }

    if ($method === 'GET' && !$id) {
        $listQuery = $query;
        if ($entity === 'Employee') $listQuery['limit'] = '100000';
        $list = list_entity($entity, $listQuery);
        if ($entity === 'Employee' && !is_head_office_auth($auth)) {
            if (!$auth) {
                $list = [];
            } else {
                $areaLower = strtolower(trim($auth['area_tugas'] ?? ''));
                $list = array_values(array_filter($list, fn($e) => strtolower(trim($e['area_tugas'] ?? '')) === $areaLower));
            }
        }
        if ($entity === 'Employee') $list = array_map(fn($e) => redact_employee($e, $auth), $list);
        json_out($list);
    }

    if ($method === 'GET' && $id) {
        $rec = get_entity($entity, $id);
        if (!$rec) bad('Data tidak ditemukan', 404);
        if ($entity === 'Employee') $rec = redact_employee($rec, $auth);
        json_out($rec);
    }

    if ($method === 'POST') {
        $body = get_json_body();

        if ($entity === 'Employee' && !empty($body['nik_karyawan'])) {
            if (!check_nik_unique((string)$body['nik_karyawan'])) {
                bad("NIK karyawan \"{$body['nik_karyawan']}\" sudah terdaftar.", 409);
            }
        }
        if ($entity === 'ShiftSchedule') {
            $conflict = check_shift_schedule_conflict($body);
            if ($conflict) bad($conflict, 409);
        }
        if ($entity === 'Attendance' && isset($body['latitude']) && isset($body['longitude'])) {
            $gpsError = check_attendance_gps_lock($body);
            if ($gpsError) bad($gpsError, 403);
        }
        if ($entity === 'DashboardConfig' && ($body['tipe'] ?? '') === 'Rule Potongan Gaji' && !is_admin($auth)) {
            bad('Hanya Admin/Master Admin yang bisa mengatur Rule Potongan Gaji.', 403);
        }
        if ($entity === 'PayrollRapel') {
            if (!is_master_admin($auth) && !is_head_office_auth($auth)) {
                bad('Hanya Master Admin atau Admin Head Office yang bisa mengelola data Rapel.', 403);
            }
            $body['dibuat_oleh'] = $auth['nik'] ?? '';
            if (empty($body['status'])) $body['status'] = 'Diajukan';
        }

        $rec = create_entity($entity, $body, $auth['nik'] ?? null);
        json_out($rec);
    }

    if ($method === 'PUT' && $id) {
        $body = get_json_body();
        if ($entity === 'Employee' && !empty($body['nik_karyawan'])) {
            if (!check_nik_unique((string)$body['nik_karyawan'], $id)) {
                bad("NIK karyawan \"{$body['nik_karyawan']}\" sudah dipakai data lain.", 409);
            }
        }
        $rec = update_entity($entity, $id, $body);
        if (!$rec) bad('Data tidak ditemukan', 404);
        json_out($rec);
    }

    if ($method === 'DELETE' && $id) {
        json_out(delete_entity($entity, $id));
    }

    bad('Metode/permintaan tidak didukung', 405);
}