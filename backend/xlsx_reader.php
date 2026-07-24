<?php
if (!defined('PIS_APP')) { http_response_code(403); exit('Forbidden'); }

/**
 * ============================================================
 *  Pembaca file .xlsx native PHP (ZipArchive + SimpleXML)
 * ============================================================
 *  File .xlsx sebenarnya adalah arsip ZIP berisi beberapa file XML.
 *  Fungsi di bawah membaca SHEET PERTAMA saja (cukup untuk semua
 *  template impor di aplikasi ini: Data Karyawan, Data Pelamar, dst),
 *  baris pertama dianggap header kolom.
 *
 *  Sengaja tidak memakai PhpSpreadsheet (Composer) supaya tidak perlu
 *  instalasi tambahan di server — hanya butuh ekstensi PHP "zip" dan
 *  "simplexml" yang sudah aktif secara default di XAMPP.
 */

function xlsx_col_to_index(string $col): int {
    $col = strtoupper($col);
    $idx = 0;
    for ($i = 0; $i < strlen($col); $i++) {
        $idx = $idx * 26 + (ord($col[$i]) - ord('A') + 1);
    }
    return $idx - 1;
}

/** Baca sheet pertama .xlsx -> array baris (masing-masing array asosiatif header=>nilai). */
function read_xlsx_first_sheet(string $path): array {
    if (!is_file($path)) throw new RuntimeException('File tidak ditemukan di penyimpanan.');

    $zip = new ZipArchive();
    if ($zip->open($path) !== true) {
        throw new RuntimeException('File bukan .xlsx yang valid (gagal dibuka sebagai arsip).');
    }

    // ── Shared strings: semua teks (bukan angka) disimpan terpisah di xlsx ──
    $sharedStrings = [];
    $ssXml = $zip->getFromName('xl/sharedStrings.xml');
    if ($ssXml !== false) {
        $prev = libxml_use_internal_errors(true);
        $ssDoc = simplexml_load_string($ssXml);
        libxml_use_internal_errors($prev);
        if ($ssDoc !== false) {
            foreach ($ssDoc->si as $si) {
                if (isset($si->t)) {
                    $sharedStrings[] = (string)$si->t;
                } else {
                    $text = '';
                    foreach ($si->r as $r) $text .= (string)$r->t;
                    $sharedStrings[] = $text;
                }
            }
        }
    }

    // ── Tentukan path XML sheet pertama lewat workbook.xml + workbook.xml.rels ──
    $sheetPath = 'xl/worksheets/sheet1.xml'; // fallback paling umum
    $wbXml = $zip->getFromName('xl/workbook.xml');
    $relsXml = $zip->getFromName('xl/_rels/workbook.xml.rels');
    if ($wbXml !== false && $relsXml !== false) {
        $prev = libxml_use_internal_errors(true);
        $wbDoc = simplexml_load_string($wbXml);
        $relsDoc = simplexml_load_string($relsXml);
        libxml_use_internal_errors($prev);
        if ($wbDoc !== false && $relsDoc !== false && isset($wbDoc->sheets->sheet[0])) {
            $rAttrs = $wbDoc->sheets->sheet[0]->attributes('r', true);
            $rId = isset($rAttrs['id']) ? (string)$rAttrs['id'] : '';
            foreach ($relsDoc->Relationship as $rel) {
                if ((string)$rel['Id'] === $rId) {
                    $target = ltrim((string)$rel['Target'], '/');
                    $sheetPath = str_starts_with($target, 'worksheets/') ? "xl/$target" : $target;
                    break;
                }
            }
        }
    }

    $sheetXml = $zip->getFromName($sheetPath);
    $zip->close();
    if ($sheetXml === false) {
        throw new RuntimeException('Sheet pertama tidak ditemukan di dalam file Excel.');
    }

    $prev = libxml_use_internal_errors(true);
    $sheetDoc = simplexml_load_string($sheetXml);
    libxml_use_internal_errors($prev);
    if ($sheetDoc === false) {
        throw new RuntimeException('Gagal membaca isi sheet Excel (format tidak dikenali).');
    }

    $rows = [];
    foreach ($sheetDoc->sheetData->row as $rowXml) {
        $rowData = [];
        foreach ($rowXml->c as $cellXml) {
            $ref = (string)$cellXml['r'];
            preg_match('/^([A-Z]+)/', $ref, $m);
            $colIdx = xlsx_col_to_index($m[1] ?? 'A');

            $type = (string)$cellXml['t'];
            if ($type === 's') {
                $raw = isset($cellXml->v) ? (int)(string)$cellXml->v : -1;
                $val = $sharedStrings[$raw] ?? '';
            } elseif ($type === 'inlineStr') {
                $val = (string)($cellXml->is->t ?? '');
            } else {
                $val = isset($cellXml->v) ? (string)$cellXml->v : '';
            }
            $rowData[$colIdx] = $val;
        }
        $rows[] = $rowData;
    }

    if (!count($rows)) return [];

    $headerRow = array_shift($rows);
    if (!count($headerRow)) return [];
    $maxCol = max(array_keys($headerRow));
    $headers = [];
    for ($i = 0; $i <= $maxCol; $i++) $headers[$i] = trim($headerRow[$i] ?? '');

    $result = [];
    foreach ($rows as $rowData) {
        $assoc = [];
        $hasValue = false;
        foreach ($headers as $i => $h) {
            if ($h === '') continue;
            $v = $rowData[$i] ?? '';
            $assoc[$h] = $v;
            if (trim((string)$v) !== '') $hasValue = true;
        }
        if ($hasValue) $result[] = $assoc; // buang baris yang seluruh kolomnya kosong
    }
    return $result;
}

/**
 * POST /api/apps/integrations/Core/ExtractDataFromUploadedFile
 * Body JSON: { file_url: "/files/2026-07-22/xxxx.xlsx", json_schema: {...} }
 *
 * BUGFIX: endpoint ini dipanggil oleh SEMUA fitur "Impor dari Excel" di aplikasi
 * (Data Karyawan, Data Pelamar, dll — lihat bundle React & pis-applicant-import.js),
 * tapi sebelumnya TIDAK PERNAH diimplementasikan di backend versi XAMPP — hanya ada
 * komentar di functions.php yang menyebutnya sebagai "belum diporting". Akibatnya:
 * file Excel berhasil ter-upload ke drive D: (langkah UploadFile berhasil), tapi
 * proses parsing baris Excel -> data karyawan gagal total (fetch ke endpoint yang
 * tidak ada), sehingga Employee.bulkCreate() tidak pernah dipanggil dan data tidak
 * pernah muncul di halaman — walau file mentahnya sudah tersimpan di D:\pis-storage.
 * Sekarang diimplementasikan native (tanpa Composer) lewat read_xlsx_first_sheet().
 */
function handle_extract_data_from_uploaded_file(): void {
    $body = get_json_body();
    $fileUrl = $body['file_url'] ?? null;
    if (!$fileUrl) { json_out(['status' => 'error', 'message' => 'file_url wajib diisi']); return; }

    // Ambil key relatif dari file_url, terima format "/files/xxx" maupun URL penuh "https://domain/files/xxx"
    $key = preg_replace('#^.*?/files/#', '', (string)$fileUrl);
    $key = str_replace('\\', '/', $key);
    if ($key === '' || str_contains($key, '..')) {
        json_out(['status' => 'error', 'message' => 'file_url tidak valid.']);
        return;
    }

    $path = rtrim(STORAGE_ROOT, '/\\') . '/' . $key;

    try {
        $rows = read_xlsx_first_sheet($path);
    } catch (Throwable $e) {
        json_out(['status' => 'error', 'message' => 'Gagal membaca file Excel: ' . $e->getMessage()]);
        return;
    }

    // Kalau ada json_schema, saring hanya kolom yang dikenali (buang kolom di luar skema)
    $allowedKeys = $body['json_schema']['items']['properties'] ?? null;
    if (is_array($allowedKeys)) {
        $allowedKeys = array_keys($allowedKeys);
        $rows = array_map(function ($row) use ($allowedKeys) {
            $filtered = [];
            foreach ($allowedKeys as $k) if (array_key_exists($k, $row)) $filtered[$k] = $row[$k];
            return $filtered;
        }, $rows);
    }

    if (!count($rows)) {
        json_out(['status' => 'error', 'message' => 'Tidak ada data terbaca. Pastikan header kolom sama persis dengan template (baris pertama).']);
        return;
    }

    json_out(['status' => 'success', 'output' => $rows]);
}
