<?php
if (!defined('PIS_APP')) { http_response_code(403); exit('Forbidden'); }
require_once __DIR__ . '/doc_helpers.php';

const PKWT_MANAGER_ROLES = ["Master Admin", "Admin Pos", "Chief Security", "Supervisor Facility"];
function can_manage_pkwt(?array $auth): bool {
    return is_admin($auth) || ($auth && in_array($auth['role'] ?? '', PKWT_MANAGER_ROLES, true));
}

function find_applicant_for_employee(array $employee): ?array {
    if (!empty($employee['applicant_id'])) {
        $byId = get_entity('Applicant', $employee['applicant_id']);
        if ($byId) return $byId;
    }
    $stmt = db()->prepare("SELECT id FROM records WHERE entity='Applicant' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.employee_id')) = ? LIMIT 1");
    $stmt->execute([$employee['id']]);
    $row = $stmt->fetch();
    return $row ? get_entity('Applicant', $row['id']) : null;
}

function get_salary_from_data_query(?string $areaTugas, ?string $jabatan): ?array {
    $area = trim((string)$areaTugas);
    $jab = trim((string)$jabatan);
    if (!$area || !$jab) return null;
    $stmt = db()->prepare(
        "SELECT JSON_UNQUOTE(JSON_EXTRACT(data,'$.basic_salary')) AS basic_salary,
                JSON_UNQUOTE(JSON_EXTRACT(data,'$.allowance_jabatan')) AS allowance_jabatan,
                JSON_UNQUOTE(JSON_EXTRACT(data,'$.total_allowance')) AS total_allowance,
                JSON_UNQUOTE(JSON_EXTRACT(data,'$.periode')) AS periode
         FROM records WHERE entity='DataQuery'
           AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.cost_center')) = ?
           AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.position')) = ?
         ORDER BY JSON_EXTRACT(data,'$.periode') DESC, created_date DESC LIMIT 1"
    );
    $stmt->execute([$area, $jab]);
    $row = $stmt->fetch();
    if (!$row) return null;
    $gajiPokok = (float)($row['basic_salary'] ?? 0);
    $tunjJabatan = (float)($row['allowance_jabatan'] ?? 0);
    $totalAllowance = (float)($row['total_allowance'] ?? 0);
    $tunjLain = max(0, $totalAllowance - $gajiPokok - $tunjJabatan);
    return [
        'gaji_pokok' => $gajiPokok, 'tunjangan_jabatan' => $tunjJabatan,
        'tunjangan_lain' => $tunjLain, 'sumber_periode_gaji' => $row['periode'] ?? '',
    ];
}

/** Isi ulang gaji tiap item "Jabatan" di item_pekerjaan Kontrak Kerja Area/Project dari Data Query. Memodifikasi $body secara langsung (by reference). */
function apply_area_contract_auto_fill(array &$body): void {
    if (empty($body['item_pekerjaan']) || !is_array($body['item_pekerjaan'])) return;
    foreach ($body['item_pekerjaan'] as &$item) {
        if (!is_array($item) || ($item['tipe'] ?? '') !== 'Jabatan' || empty($item['jabatan'])) continue;
        $salary = get_salary_from_data_query($body['area_tugas'] ?? null, $item['jabatan']);
        if ($salary) {
            $item['gaji_pokok'] = $salary['gaji_pokok'];
            $item['tunjangan_jabatan'] = $salary['tunjangan_jabatan'];
            $item['tunjangan_lain'] = $salary['tunjangan_lain'];
            $item['sumber_periode_gaji'] = $salary['sumber_periode_gaji'];
        }
    }
    unset($item);
    $total = 0;
    foreach ($body['item_pekerjaan'] as $it) {
        if (!is_array($it)) continue;
        if (($it['tipe'] ?? '') === 'Jabatan') {
            $total += (float)($it['gaji_pokok'] ?? 0) + (float)($it['tunjangan_jabatan'] ?? 0) + (float)($it['tunjangan_lain'] ?? 0);
        } elseif (($it['tipe'] ?? '') === 'Barang') {
            $total += (float)($it['harga_satuan'] ?? 0) * (float)($it['jumlah'] ?? 1);
        }
    }
    $body['total_nilai_kontrak'] = $total;
}

function fn_preview_salary_from_data_query(array $body): array {
    $salary = get_salary_from_data_query($body['area_tugas'] ?? null, $body['jabatan'] ?? null);
    if (!$salary) {
        return ['success' => true, 'found' => false, 'gaji_pokok' => 0, 'tunjangan_jabatan' => 0, 'tunjangan_lain' => 0, 'sumber_periode_gaji' => ''];
    }
    return array_merge(['success' => true, 'found' => true], $salary);
}

/** Rapel otomatis saat Data Query bulan yang sudah punya Payslip diubah lagi. */
function auto_create_rapel_if_needed(array $dqBody, string $dqId): void {
    $nik = trim((string)($dqBody['employee_no'] ?? ''));
    $periode = trim((string)($dqBody['periode'] ?? ''));
    if (!$nik || !$periode) return;

    $stmt = db()->prepare("SELECT id, data FROM records WHERE entity='Payslip' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.nik_karyawan')) = ? AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.periode')) = ? LIMIT 1");
    $stmt->execute([$nik, $periode]);
    $existingSlip = $stmt->fetch();
    if (!$existingSlip) return;

    $slip = json_decode($existingSlip['data'], true) ?: [];
    $gajiLama = (float)($slip['gaji_diterima'] ?? 0);
    $totalAllowance = (float)($dqBody['total_allowance'] ?? 0);
    $totalDeduction = (float)($dqBody['total_deduction'] ?? 0);
    $gajiBaru = max(0, $totalAllowance - $totalDeduction);
    $selisih = $gajiBaru - $gajiLama;
    if (abs($selisih) < 1) return;

    $stmt2 = db()->prepare("SELECT id FROM records WHERE entity='PayrollRapel' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.payslip_id')) = ? AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.sumber')) = 'otomatis-dataquery' LIMIT 1");
    $stmt2->execute([(string)$existingSlip['id']]);
    $existingRapel = $stmt2->fetch();

    if ($existingRapel) {
        $rapelData = get_entity('PayrollRapel', $existingRapel['id']);
        if ($rapelData && ($rapelData['status'] ?? '') !== 'Dibayarkan') {
            update_entity('PayrollRapel', $existingRapel['id'], [
                'nominal_selisih' => $selisih, 'gaji_lama' => $gajiLama, 'gaji_baru' => $gajiBaru,
                'updated_reason' => 'Data Query diperbarui — selisih dihitung ulang',
            ]);
        }
        return;
    }

    $jenis = $selisih > 0 ? 'Kurang Bayar' : 'Lebih Bayar';
    create_entity('PayrollRapel', [
        'nik_karyawan' => $nik,
        'nama_karyawan' => $dqBody['name'] ?? $slip['nama_karyawan'] ?? '',
        'area_tugas' => $dqBody['cost_center'] ?? $slip['area_tugas'] ?? '',
        'jabatan' => $dqBody['position'] ?? $slip['jabatan'] ?? '',
        'payslip_id' => (string)$existingSlip['id'],
        'periode_rapel' => $periode,
        'jenis_selisih' => $jenis,
        'nominal_selisih' => $selisih,
        'gaji_lama' => $gajiLama,
        'gaji_baru' => $gajiBaru,
        'keterangan' => "Perubahan Data Query setelah slip $periode sudah terbit (" . strtolower($jenis) . ").",
        'status' => 'Diajukan',
        'sumber' => 'otomatis-dataquery',
        'dibuat_oleh' => 'system',
    ], 'system');
}

/** Simpan file docx hasil generate ke STORAGE_ROOT (drive D:), kembalikan [key, url] */
function save_generated_docx(string $tmpPath, string $subfolder, string $baseName): array {
    $key = "$subfolder/$baseName";
    $dest = rtrim(STORAGE_ROOT, '/\\') . "/$key";
    $dir = dirname($dest);
    if (!is_dir($dir)) mkdir($dir, 0775, true);
    rename($tmpPath, $dest);
    return ['key' => $key, 'url' => FILES_BASE_URL . '/' . $key];
}

function delete_generated_file(?string $key): void {
    if (!$key) return;
    $path = rtrim(STORAGE_ROOT, '/\\') . '/' . $key;
    if (is_file($path)) @unlink($path);
}

/** POST /api/apps/functions/generatePKWTAndAssignment */
function fn_generate_pkwt_and_assignment(array $body, ?array $auth): array {
    if (!can_manage_pkwt($auth)) return ['success' => false, 'error' => 'Anda tidak memiliki akses untuk membuat PKWT & Surat Tugas.'];

    $pkwtId0 = $body['pkwt_id'] ?? null;
    $employeeId = $body['employee_id'] ?? null;
    $tanggalMulai = $body['tanggal_mulai'] ?? null;
    $tanggalSelesai = $body['tanggal_selesai'] ?? null;
    if (!$employeeId) return ['success' => false, 'error' => 'employee_id wajib diisi.'];
    if (!$tanggalMulai || !$tanggalSelesai) return ['success' => false, 'error' => 'Tanggal Mulai dan Tanggal Selesai PKWT wajib diisi.'];

    $employee = get_entity('Employee', $employeeId);
    if (!$employee) return ['success' => false, 'error' => 'Data karyawan tidak ditemukan.'];
    if (empty($employee['jabatan']) || empty($employee['area_tugas'])) {
        return ['success' => false, 'error' => 'Jabatan dan Area Tugas/Proyek karyawan belum lengkap. Lengkapi dulu di Data Karyawan sebelum membuat PKWT.'];
    }

    $existingPkwt = null; $existingAssignment = null;
    if ($pkwtId0) {
        $existingPkwt = get_entity('PKWTContract', $pkwtId0);
        if (!$existingPkwt) return ['success' => false, 'error' => 'Data PKWT yang ingin diedit tidak ditemukan.'];
        if (!empty($existingPkwt['assignment_id'])) {
            $existingAssignment = get_entity('Assignment', $existingPkwt['assignment_id']);
        }
    }

    $applicant = find_applicant_for_employee($employee);
    $area = find_area_project_by_name($employee['area_tugas']);

    $gajiPokokNum = (float)($body['gaji_pokok'] ?? 0);
    $tj = (float)($body['tunjangan_jabatan'] ?? 0);
    $tl = (float)($body['tunjangan_lain'] ?? 0);
    $totalGross = $gajiPokokNum + $tj + $tl;

    $noPkwt = $existingPkwt ? $existingPkwt['nomor_pkwt'] : format_doc_number('PKWT');
    $noSuratTugas = $existingAssignment ? $existingAssignment['nomor_surat_tugas'] : convert_pkwt_number_to_surat_tugas($noPkwt);
    $entityPt = $body['entity_pt'] ?? $employee['entity_pt'] ?? $area['entity_pt'] ?? DEFAULT_ENTITY_PT;
    $now = time();
    $durasiBulan = months_between($tanggalMulai, $tanggalSelesai) ?: 12;
    $pp35Text = trim((string)($body['pasal_9_ayat2_pp35'] ?? '')) ?: DEFAULT_PP35_TEXT;
    $tahunDokumen = (int)date('Y', strtotime($tanggalMulai)) ?: (int)date('Y');
    $actorId = $auth['nik'] ?? 'system';

    $pkwtId = $existingPkwt['id'] ?? new_id();
    $assignmentId = $existingAssignment['id'] ?? new_id();

    $pkwtMapping = [
        'No' => $noPkwt,
        'Hari Tanda Tangan' => indonesian_day_name($now),
        'Tanggal Tanda Tangan' => format_tanggal_indonesia($now),
        'entity_pt' => $entityPt,
        'entity_pt_upper' => mb_strtoupper($entityPt),
        'Nama Karyawan' => $employee['nama_lengkap'] ?? '',
        'NIK ID KARYAWAN' => $employee['nik_karyawan'] ?? '',
        'Tempat Lahir' => $applicant['tempat_lahir'] ?? '-',
        'Tanggal Lahir' => !empty($applicant['tanggal_lahir']) ? format_tanggal_indonesia($applicant['tanggal_lahir']) : '-',
        'Jenis Kelamin' => $applicant['jenis_kelamin'] ?? '-',
        'NIK E-KTP' => $applicant['nik_ektp'] ?? '-',
        'Alamat' => $applicant['alamat'] ?? $applicant['alamat_ektp'] ?? '-',
        'RT' => $applicant['rt'] ?? '-',
        'RW' => $applicant['rw'] ?? '-',
        'Kelurahan/Desa' => $applicant['kelurahan'] ?? '-',
        'Kecamatan' => $applicant['kecamatan'] ?? '-',
        'Kabupaten/Kota' => $applicant['kabupaten_kota'] ?? '-',
        'Provinsi' => $applicant['provinsi'] ?? '-',
        'Jabatan' => $employee['jabatan'],
        'Area / Proyek' => $employee['area_tugas'],
        'Alamat Area / Proyek' => $area['alamat'] ?? '-',
        'Tanggal Mulai' => format_tanggal_indonesia($tanggalMulai),
        'Tanggal Selesai' => format_tanggal_indonesia($tanggalSelesai),
        'Gaji Pokok' => format_rupiah($gajiPokokNum),
        'Tunjangan Jabatan' => format_rupiah($tj),
        'Tunjangan Lain- Lain' => format_rupiah($tl),
        'Total Gros' => format_rupiah($totalGross),
        'PP35' => $pp35Text,
        'Hari ini' => format_tanggal_indonesia($now),
    ];
    $stMapping = [
        'No' => $noSuratTugas,
        'Jabatan' => $employee['jabatan'],
        'entity_pt' => $entityPt,
        'Nama Karyawan' => $employee['nama_lengkap'] ?? '',
        'NIK ID KARYAWAN' => $employee['nik_karyawan'] ?? '',
        'Area / Proyek' => $employee['area_tugas'],
        'Tanggal Mulai' => format_tanggal_indonesia($tanggalMulai),
        'Hari ini' => format_tanggal_indonesia($now),
    ];

    $oldPkwtFileKey = $existingPkwt['file_key'] ?? null;
    $oldStFileKey = $existingAssignment['file_key'] ?? null;

    $pkwtTemplatePath = load_template_path(PKWT_TEMPLATE_FILE);
    if (!$pkwtTemplatePath) {
        return ['success' => false, 'error' => 'Template PKWT belum ada di ' . TEMPLATE_ROOT . '/' . PKWT_TEMPLATE_FILE . '. Salin file templates_source/pkwt_template.docx ke folder tersebut dulu.'];
    }
    try {
        $pkwtTmp = render_docx_template($pkwtTemplatePath, $pkwtMapping);
    } catch (Throwable $e) {
        return ['success' => false, 'error' => 'Gagal membuat dokumen PKWT: ' . $e->getMessage()];
    }
    $pkwtFileName = build_generated_doc_filename('PKWT', ['nik' => $employee['nik_karyawan'] ?? '', 'nama' => $employee['nama_lengkap'] ?? '', 'jabatan' => $employee['jabatan'], 'area' => $employee['area_tugas'], 'tahun' => $tahunDokumen]);
    $pkwtFile = save_generated_docx($pkwtTmp, 'generated/pkwt', $employee['id'] . '-' . new_id() . '.docx');
    $pkwtFile['filename'] = $pkwtFileName;

    $stFile = null;
    $stTemplatePath = load_template_path(SURAT_TUGAS_TEMPLATE_FILE);
    if ($stTemplatePath) {
        try {
            $stTmp = render_docx_template($stTemplatePath, $stMapping);
            $stFileName = build_generated_doc_filename('ST', ['nik' => $employee['nik_karyawan'] ?? '', 'nama' => $employee['nama_lengkap'] ?? '', 'jabatan' => $employee['jabatan'], 'area' => $employee['area_tugas'], 'tahun' => $tahunDokumen]);
            $stFile = save_generated_docx($stTmp, 'generated/surat-tugas', $employee['id'] . '-' . new_id() . '.docx');
            $stFile['filename'] = $stFileName;
        } catch (Throwable $e) {
            $stFile = null;
        }
    }

    $pkwtData = [
        'nomor_pkwt' => $noPkwt, 'employee_id' => $employee['id'], 'applicant_id' => $applicant['id'] ?? null,
        'nik_karyawan' => $employee['nik_karyawan'] ?? '', 'nama_karyawan' => $employee['nama_lengkap'] ?? '',
        'jabatan' => $employee['jabatan'], 'area_tugas' => $employee['area_tugas'], 'wilayah_penugasan' => $employee['area_tugas'],
        'entity_pt' => $entityPt, 'tanggal_mulai' => $tanggalMulai, 'tanggal_selesai' => $tanggalSelesai,
        'durasi_bulan' => $durasiBulan, 'durasi_terbilang' => "$durasiBulan Bulan",
        'status' => $existingPkwt['status'] ?? 'Aktif', 'catatan' => $body['catatan'] ?? '',
        'pasal_9_ayat2_pp35' => $pp35Text,
        'pasal_9_ayat' => is_array($body['pasal_9_ayat'] ?? null) ? $body['pasal_9_ayat'] : ($existingPkwt['pasal_9_ayat'] ?? []),
        'hari_tanda_tangan' => $pkwtMapping['Hari Tanda Tangan'], 'tanggal_tanda_tangan' => $pkwtMapping['Tanggal Tanda Tangan'],
        'kota_tanda_tangan' => $body['kota_tanda_tangan'] ?? 'Tangerang Selatan',
        'alamat_perusahaan' => $body['alamat_perusahaan'] ?? 'Jl. Bukit Nusa Indah No.61 Serua Ciputat Tangerang Selatan 15414',
        'nama_direktur' => $body['nama_direktur'] ?? 'Moch. A. Saptoadjie',
        'jabatan_direktur' => $body['jabatan_direktur'] ?? 'HRD',
        'nik_ektp' => $applicant['nik_ektp'] ?? '', 'tempat_lahir' => $applicant['tempat_lahir'] ?? '',
        'tanggal_lahir' => $applicant['tanggal_lahir'] ?? '', 'alamat_karyawan' => $applicant['alamat'] ?? $applicant['alamat_ektp'] ?? '',
        'gaji_pokok' => $gajiPokokNum, 'gaji_pokok_terbilang' => terbilang_rupiah($gajiPokokNum),
        'tunjangan_jabatan' => $tj, 'tunjangan_lain' => $tl, 'total_gross' => $totalGross,
        'tanggal_gajian' => $body['tanggal_gajian'] ?? '25', 'bank_karyawan' => $body['bank_karyawan'] ?? '',
        'no_rekening' => $body['no_rekening'] ?? '', 'kota_pengadilan' => $body['kota_pengadilan'] ?? 'Tangerang Selatan',
        'file_key' => $pkwtFile['key'], 'file_url' => $pkwtFile['url'],
        'assignment_id' => $stFile ? $assignmentId : ($existingPkwt['assignment_id'] ?? null),
    ];
    $assignmentData = $stFile ? [
        'pkwt_id' => $pkwtId, 'employee_id' => $employee['id'], 'nomor_surat_tugas' => $noSuratTugas,
        'nik_karyawan' => $employee['nik_karyawan'] ?? '', 'nama_karyawan' => $employee['nama_lengkap'] ?? '',
        'jabatan' => $employee['jabatan'], 'area_tugas' => $employee['area_tugas'], 'tanggal_mulai' => $tanggalMulai,
        'entity_pt' => $entityPt, 'status' => $existingAssignment['status'] ?? 'Aktif',
        'file_key' => $stFile['key'], 'file_url' => $stFile['url'],
    ] : null;

    $pkwtRecord = $existingPkwt
        ? update_entity('PKWTContract', $pkwtId, $pkwtData)
        : create_entity('PKWTContract', $pkwtData, $actorId, $pkwtId);
    $assignmentRecord = null;
    if ($assignmentData) {
        $assignmentRecord = $existingAssignment
            ? update_entity('Assignment', $assignmentId, $assignmentData)
            : create_entity('Assignment', $assignmentData, $actorId, $assignmentId);
    }

    if ($oldPkwtFileKey && $oldPkwtFileKey !== $pkwtFile['key']) delete_generated_file($oldPkwtFileKey);
    if ($oldStFileKey && $stFile && $oldStFileKey !== $stFile['key']) delete_generated_file($oldStFileKey);

    return [
        'success' => true,
        'message' => $assignmentRecord
            ? ($existingPkwt ? 'Perubahan PKWT & Surat Tugas berhasil disimpan & dokumen baru siap diunduh.' : 'PKWT & Surat Tugas berhasil dibuat sekaligus & siap diunduh.')
            : 'PKWT berhasil dibuat. Template Surat Tugas belum tersedia sehingga Surat Tugas belum ikut dibuat.',
        'pkwt' => $pkwtRecord,
        'assignment' => $assignmentRecord,
    ];
}

function fn_delete_pkwt_and_assignment(array $body, ?array $auth): array {
    if (!can_manage_pkwt($auth)) return ['success' => false, 'error' => 'Anda tidak memiliki akses untuk menghapus PKWT & Surat Tugas.'];
    $pkwtId = $body['pkwt_id'] ?? null;
    if (!$pkwtId) return ['success' => false, 'error' => 'pkwt_id wajib diisi.'];
    $pkwt = get_entity('PKWTContract', $pkwtId);
    if (!$pkwt) return ['success' => false, 'error' => 'Data PKWT tidak ditemukan (mungkin sudah terhapus).'];
    $assignment = !empty($pkwt['assignment_id']) ? get_entity('Assignment', $pkwt['assignment_id']) : null;

    delete_generated_file($pkwt['file_key'] ?? null);
    if ($assignment) delete_generated_file($assignment['file_key'] ?? null);
    delete_entity('PKWTContract', $pkwt['id']);
    if ($assignment) delete_entity('Assignment', $assignment['id']);

    return ['success' => true, 'message' => $assignment
        ? "PKWT " . ($pkwt['nomor_pkwt'] ?? '') . " & Surat Tugas " . ($assignment['nomor_surat_tugas'] ?? '') . " berhasil dihapus."
        : "PKWT " . ($pkwt['nomor_pkwt'] ?? '') . " berhasil dihapus."];
}

function fn_delete_assignment_only(array $body, ?array $auth): array {
    if (!can_manage_pkwt($auth)) return ['success' => false, 'error' => 'Anda tidak memiliki akses untuk menghapus Surat Tugas.'];
    $assignmentId = $body['assignment_id'] ?? null;
    if (!$assignmentId) return ['success' => false, 'error' => 'assignment_id wajib diisi.'];
    $assignment = get_entity('Assignment', $assignmentId);
    if (!$assignment) return ['success' => false, 'error' => 'Data Surat Tugas tidak ditemukan (mungkin sudah terhapus).'];

    delete_generated_file($assignment['file_key'] ?? null);
    delete_entity('Assignment', $assignment['id']);

    if (!empty($assignment['pkwt_id'])) {
        $linkedPkwt = get_entity('PKWTContract', $assignment['pkwt_id']);
        if ($linkedPkwt && ($linkedPkwt['assignment_id'] ?? null) === $assignment['id']) {
            update_entity('PKWTContract', $linkedPkwt['id'], ['assignment_id' => null]);
        }
    }
    return ['success' => true, 'message' => "Surat Tugas " . ($assignment['nomor_surat_tugas'] ?? '') . " berhasil dihapus."];
}

function fn_search_employees_for_pkwt(array $body): array {
    $q = mb_strtolower(trim((string)($body['q'] ?? '')));
    $employees = list_entity('Employee', ['limit' => 100000]);
    $active = array_values(array_filter($employees, fn($e) => ($e['status_aktif'] ?? 'Aktif') === 'Aktif'));

    $stmt = db()->query("SELECT JSON_UNQUOTE(JSON_EXTRACT(data,'$.employee_id')) AS employee_id, JSON_UNQUOTE(JSON_EXTRACT(data,'$.nik_ektp')) AS nik_ektp FROM records WHERE entity='Applicant' AND JSON_EXTRACT(data,'$.employee_id') IS NOT NULL");
    $ktpByEmployeeId = [];
    foreach ($stmt->fetchAll() as $row) $ktpByEmployeeId[$row['employee_id']] = $row['nik_ektp'];

    $enriched = array_map(fn($e) => [
        'id' => $e['id'], 'nik_karyawan' => $e['nik_karyawan'] ?? '', 'nama_lengkap' => $e['nama_lengkap'] ?? '',
        'jabatan' => $e['jabatan'] ?? '', 'area_tugas' => $e['area_tugas'] ?? '', 'nik_ektp' => $ktpByEmployeeId[$e['id']] ?? '',
    ], $active);

    $filtered = $q ? array_values(array_filter($enriched, fn($e) =>
        str_contains(mb_strtolower($e['nik_karyawan']), $q) ||
        str_contains(mb_strtolower($e['nama_lengkap']), $q) ||
        str_contains(mb_strtolower($e['nik_ektp']), $q)
    )) : $enriched;

    usort($filtered, fn($a, $b) => strcmp($a['nama_lengkap'], $b['nama_lengkap']));
    return ['success' => true, 'data' => array_slice($filtered, 0, 50)];
}

function fn_pkwt_salary_options(array $body): array {
    $jabatan = trim((string)($body['jabatan'] ?? ''));
    $areaTugas = trim((string)($body['area_tugas'] ?? ''));
    if (!$jabatan) return ['success' => true, 'gaji_pokok' => [], 'tunjangan_jabatan' => [], 'tunjangan_lain' => []];

    $sql = "SELECT JSON_UNQUOTE(JSON_EXTRACT(data,'$.gaji_pokok')) AS gaji_pokok,
                    JSON_UNQUOTE(JSON_EXTRACT(data,'$.tunjangan_jabatan')) AS tunjangan_jabatan,
                    JSON_UNQUOTE(JSON_EXTRACT(data,'$.tunjangan_lain')) AS tunjangan_lain
             FROM records WHERE entity='PKWTContract' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.jabatan')) = ?";
    $binds = [$jabatan];
    if ($areaTugas) { $sql .= " AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.area_tugas')) = ?"; $binds[] = $areaTugas; }
    $sql .= " ORDER BY created_date DESC LIMIT 500";
    $stmt = db()->prepare($sql);
    $stmt->execute($binds);
    $results = $stmt->fetchAll();

    $uniqSorted = function (string $key) use ($results): array {
        $nums = array_values(array_filter(array_map(fn($r) => (float)($r[$key] ?? 0), $results), fn($n) => $n > 0));
        $nums = array_values(array_unique($nums));
        rsort($nums);
        return $nums;
    };
    return ['success' => true, 'gaji_pokok' => $uniqSorted('gaji_pokok'), 'tunjangan_jabatan' => $uniqSorted('tunjangan_jabatan'), 'tunjangan_lain' => $uniqSorted('tunjangan_lain')];
}
