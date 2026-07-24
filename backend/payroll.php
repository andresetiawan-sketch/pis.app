<?php
if (!defined('PIS_APP')) { http_response_code(403); exit('Forbidden'); }
require_once __DIR__ . '/pkwt.php';

const TIPE_JADWAL_FLEKSIBEL = "Non-Shift - Jadwal Tak Tentu";

function is_weekend_date(string $tanggalStr): bool {
    $ts = strtotime($tanggalStr . 'T00:00:00');
    if ($ts === false) return false;
    $day = (int)date('w', $ts); // 0 = Minggu, 6 = Sabtu
    return $day === 0 || $day === 6;
}

/**
 * Potongan absensi custom dari rule aktif DashboardConfig (tipe "Rule Potongan
 * Gaji"), dicocokkan dengan Attendance NIK tsb selama bulan `periode` ("YYYY-MM").
 */
function compute_attendance_deduction(string $nik, ?string $areaTugas, string $periode): int {
    if (!$nik || !$periode) return 0;

    $allRules = list_entity('DashboardConfig', ['limit' => 500]);
    $rules = array_values(array_filter($allRules, fn($r) => ($r['tipe'] ?? '') === 'Rule Potongan Gaji' && ($r['aktif'] ?? true) !== false));
    if (!count($rules)) return 0;

    $attendance = list_entity('Attendance', ['nik_karyawan' => $nik, 'limit' => 2000]);
    $bulanIni = array_values(array_filter($attendance, fn($a) => str_starts_with((string)($a['tanggal'] ?? ''), $periode)));

    $total = 0;
    foreach ($rules as $rule) {
        $ruleArea = trim((string)($rule['area_tugas'] ?? 'Semua'));
        if ($ruleArea !== 'Semua' && $ruleArea !== trim((string)$areaTugas)) continue;

        $kriteria = is_array($rule['kriteria_status'] ?? null) ? $rule['kriteria_status'] : [];
        if (!count($kriteria)) continue;

        $jumlahKejadian = count(array_filter($bulanIni, fn($a) => in_array($a['status'] ?? null, $kriteria, true)));
        if (!$jumlahKejadian) continue;

        $nominal = (float)($rule['nominal_potongan'] ?? 0);
        $total += ($rule['satuan'] ?? '') === 'flat' ? $nominal : $nominal * $jumlahKejadian;
    }
    return (int)round($total);
}

/**
 * Dipanggil oleh cron/generate_payslip.php (tanggal 1 tiap bulan). Membuat
 * Payslip + baris Data Query otomatis untuk semua Employee aktif. Acuan gaji:
 *  1) AreaContract berstatus "Final" (item "Jabatan" yang cocok Area+Jabatan)
 *  2) fallback ke Data Query terbaru
 * Idempotent: NIK+periode yang sudah punya Payslip dilewati.
 */
function generate_payslip_bulanan(): array {
    $periode = date('Y-m'); // bulan berjalan
    $employees = list_entity('Employee', ['status_aktif' => 'Aktif', 'limit' => 5000]);
    $finalContracts = list_entity('AreaContract', ['status_finishing' => 'Final', 'limit' => 2000]);

    $created = 0; $skipped = 0; $failed = 0; $errors = [];

    foreach ($employees as $emp) {
        $nik = $emp['nik_karyawan'] ?? null;
        try {
            if (!$nik) { $skipped++; continue; }
            $areaTugas = trim((string)($emp['area_tugas'] ?? ''));
            $jabatan = trim((string)($emp['jabatan'] ?? ''));

            $stmt = db()->prepare("SELECT id FROM records WHERE entity='Payslip' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.nik_karyawan')) = ? AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.periode')) = ? LIMIT 1");
            $stmt->execute([$nik, $periode]);
            if ($stmt->fetch()) { $skipped++; continue; }

            $gajiPokok = 0; $tunjJabatan = 0; $tunjLain = 0; $sumberAcuan = 'Belum ada acuan gaji'; $areaContractId = null;
            $contract = null;
            foreach ($finalContracts as $c) {
                if (trim((string)($c['area_tugas'] ?? '')) === $areaTugas) { $contract = $c; break; }
            }
            $contractItem = null;
            if ($contract && is_array($contract['item_pekerjaan'] ?? null)) {
                foreach ($contract['item_pekerjaan'] as $it) {
                    if (is_array($it) && ($it['tipe'] ?? '') === 'Jabatan' && trim((string)($it['jabatan'] ?? '')) === $jabatan) { $contractItem = $it; break; }
                }
            }
            if ($contractItem) {
                $gajiPokok = (float)($contractItem['gaji_pokok'] ?? 0);
                $tunjJabatan = (float)($contractItem['tunjangan_jabatan'] ?? 0);
                $tunjLain = (float)($contractItem['tunjangan_lain'] ?? 0);
                $sumberAcuan = 'Kontrak ' . ($contract['nomor_kontrak'] ?? $contract['id']) . ' (Final)';
                $areaContractId = $contract['id'];
            } else {
                $liveSalary = get_salary_from_data_query($areaTugas, $jabatan);
                if ($liveSalary) {
                    $gajiPokok = $liveSalary['gaji_pokok']; $tunjJabatan = $liveSalary['tunjangan_jabatan']; $tunjLain = $liveSalary['tunjangan_lain'];
                    $sumberAcuan = 'Data Query periode ' . $liveSalary['sumber_periode_gaji'];
                }
            }
            $totalAllowance = $gajiPokok + $tunjJabatan + $tunjLain;
            $potonganAbsensi = compute_attendance_deduction($nik, $areaTugas, $periode);
            $totalDeduction = $potonganAbsensi;
            $gajiDiterima = max(0, $totalAllowance - $totalDeduction);

            $dqBody = [
                'employee_no' => $nik, 'periode' => $periode, 'position' => $jabatan, 'cost_center' => $areaTugas,
                'basic_salary' => $gajiPokok, 'allowance_jabatan' => $tunjJabatan, 'total_allowance' => $totalAllowance,
                'ketidakhadiran' => $potonganAbsensi, 'total_deduction' => $totalDeduction,
                'net_salary' => $gajiDiterima, 'full_salary' => $gajiDiterima,
            ];
            $stmt2 = db()->prepare("SELECT id FROM records WHERE entity='DataQuery' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.employee_no')) = ? AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.periode')) = ? LIMIT 1");
            $stmt2->execute([$nik, $periode]);
            $existingDq = $stmt2->fetch();
            if ($existingDq) {
                update_entity('DataQuery', $existingDq['id'], $dqBody);
            } else {
                create_entity('DataQuery', $dqBody, 'system-cron');
            }

            create_entity('Payslip', [
                'nik_karyawan' => $nik, 'nama_karyawan' => $emp['nama_lengkap'] ?? '',
                'area_tugas' => $areaTugas, 'jabatan' => $jabatan, 'periode' => $periode,
                'gaji_pokok' => $gajiPokok, 'tunjangan_jabatan' => $tunjJabatan, 'tunjangan_lain' => $tunjLain,
                'total_allowance' => $totalAllowance, 'potongan_absensi' => $potonganAbsensi,
                'total_deduction' => $totalDeduction, 'gaji_diterima' => $gajiDiterima,
                'terbilang' => terbilang_rupiah($gajiDiterima),
                'status_slip' => 'Terbit Otomatis', 'sumber_acuan' => $sumberAcuan, 'area_contract_id' => $areaContractId,
            ], 'system-cron');
            $created++;
        } catch (Throwable $e) {
            $failed++;
            $errors[] = ($nik ?: '?') . ': ' . $e->getMessage();
        }
    }

    return ['success' => true, 'periode' => $periode, 'created' => $created, 'skipped' => $skipped, 'failed' => $failed, 'errors' => array_slice($errors, 0, 20)];
}

/**
 * Dipanggil oleh cron/sweep_auto_alfa.php (tiap jam). Tandai "Alfa" otomatis
 * untuk karyawan berjadwal fleksibel yang tidak absen dalam 1x24 jam.
 */
function sweep_auto_alfa(): array {
    $cutoffDateStr = date('Y-m-d', time() - 24 * 3600);
    $schedules = list_entity('ShiftSchedule', ['tipe_jadwal' => TIPE_JADWAL_FLEKSIBEL, 'limit' => 2000]);

    $count = 0;
    foreach ($schedules as $sch) {
        if (empty($sch['tanggal']) || $sch['tanggal'] > $cutoffDateStr) continue;
        if (is_weekend_date($sch['tanggal'])) continue;
        if (!empty($sch['auto_alfa_processed'])) continue;

        foreach (($sch['karyawan_ids'] ?? []) as $nik) {
            $attend = list_entity('Attendance', ['nik_karyawan' => $nik, 'tanggal' => $sch['tanggal'], 'limit' => 5]);
            $sudahAbsen = false; $sudahIzin = false;
            foreach ($attend as $a) {
                if (!empty($a['jam_masuk']) || ($a['status'] ?? '') === 'Hadir') $sudahAbsen = true;
                if (in_array($a['status'] ?? '', ['Ijin', 'Sakit', 'Cuti', 'Off'], true)) $sudahIzin = true;
            }
            if (!$sudahAbsen && !$sudahIzin) {
                create_entity('Attendance', [
                    'nik_karyawan' => $nik, 'tanggal' => $sch['tanggal'], 'area_tugas' => $sch['area_tugas'] ?? '',
                    'status' => 'Alfa', 'catatan' => 'Otomatis oleh sistem — tidak absen dalam 1x24 jam',
                ], 'system');
                $count++;
            }
        }
        update_entity('ShiftSchedule', $sch['id'], ['auto_alfa_processed' => true]);
    }
    return ['success' => true, 'processed' => $count];
}
