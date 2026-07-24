<?php
if (!defined('PIS_APP')) { http_response_code(403); exit('Forbidden'); }
require_once __DIR__ . '/functions.php';

const BULAN_INDO = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const HARI_INDO = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const TERBILANG_SATUAN = ["","Satu","Dua","Tiga","Empat","Lima","Enam","Tujuh","Delapan","Sembilan","Sepuluh","Sebelas"];
const DEFAULT_ENTITY_PT = "PT. PUTRA INDONESIA SOLUSI";
const DEFAULT_PP35_TEXT = "Peraturan Pemerintah No. 35 Tahun 2021 tentang Perjanjian Kerja Waktu Tertentu";
const PKWT_TEMPLATE_FILE = "pkwt_template.docx";
const SURAT_TUGAS_TEMPLATE_FILE = "surat_tugas_template.docx";

function format_tanggal_indonesia($input): string {
    if (!$input) return '-';
    $ts = is_numeric($input) ? (int)$input : strtotime((string)$input);
    if ($ts === false) return (string)$input;
    return date('j', $ts) . ' ' . BULAN_INDO[(int)date('n', $ts) - 1] . ' ' . date('Y', $ts);
}
function indonesian_day_name($input = null): string {
    $ts = $input ? strtotime((string)$input) : time();
    if ($ts === false) return '-';
    return HARI_INDO[(int)date('w', $ts)];
}
function format_rupiah($n): string {
    $num = (float)($n ?: 0);
    return 'Rp ' . number_format($num, 0, ',', '.');
}
function months_between($startStr, $endStr): ?int {
    $s = strtotime((string)$startStr);
    $e = strtotime((string)$endStr);
    if ($s === false || $e === false) return null;
    return max(1, (int)round(($e - $s) / (60 * 60 * 24 * 30.44)));
}
function romawi_bulan(int $monthIndex0): string {
    $romawi = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];
    return $romawi[$monthIndex0] ?? '';
}
function next_sequence_number(string $key): int {
    $cur = (int)(get_setting($key) ?: '0');
    $next = $cur + 1;
    set_setting($key, (string)$next);
    return $next;
}
function format_doc_number(string $tipe): string {
    $year = date('Y');
    $monthIdx0 = (int)date('n') - 1;
    $seq = next_sequence_number("doc_seq:$tipe:$year");
    return str_pad((string)$seq, 3, '0', STR_PAD_LEFT) . "/$tipe/PIS/" . romawi_bulan($monthIdx0) . "/$year";
}
/** Nomor Surat Tugas memakai urutan & tanggal yang SAMA dengan nomor PKWT (005/PKWT/PIS/VII/2026 → 005/ST/PIS/VII/2026) */
function convert_pkwt_number_to_surat_tugas(string $noPkwt): string {
    return preg_replace('#/PKWT/#', '/ST/', $noPkwt);
}
function sanitize_filename_part($s): string {
    $s = trim((string)($s ?? ''));
    $s = mb_strtoupper($s);
    $s = preg_replace('/[\\\\\/:*?"<>|]/', '-', $s);
    $s = preg_replace('/\s+/', ' ', $s);
    return trim($s);
}
function build_generated_doc_filename(string $jenis, array $p): string {
    $parts = array_map('sanitize_filename_part', [$jenis, $p['nik'] ?? '', $p['nama'] ?? '', $p['jabatan'] ?? '', $p['area'] ?? '', (string)($p['tahun'] ?? '')]);
    return implode('_', $parts) . '.docx';
}
function escape_xml_text($s): string {
    return htmlspecialchars((string)($s ?? ''), ENT_QUOTES | ENT_XML1, 'UTF-8');
}

function terbilang_angka(float $n): string {
    $n = (int)floor($n);
    if ($n < 12) return TERBILANG_SATUAN[$n];
    if ($n < 20) return terbilang_angka($n - 10) . ' Belas';
    if ($n < 100) return trim(terbilang_angka((int)floor($n / 10)) . ' Puluh' . ($n % 10 ? ' ' . terbilang_angka($n % 10) : ''));
    if ($n < 200) return trim('Seratus' . ($n % 100 ? ' ' . terbilang_angka($n % 100) : ''));
    if ($n < 1000) return trim(terbilang_angka((int)floor($n / 100)) . ' Ratus' . ($n % 100 ? ' ' . terbilang_angka($n % 100) : ''));
    if ($n < 2000) return trim('Seribu' . ($n % 1000 ? ' ' . terbilang_angka($n % 1000) : ''));
    if ($n < 1000000) return trim(terbilang_angka((int)floor($n / 1000)) . ' Ribu' . ($n % 1000 ? ' ' . terbilang_angka($n % 1000) : ''));
    if ($n < 1000000000) return trim(terbilang_angka((int)floor($n / 1000000)) . ' Juta' . ($n % 1000000 ? ' ' . terbilang_angka($n % 1000000) : ''));
    if ($n < 1000000000000) return trim(terbilang_angka((int)floor($n / 1000000000)) . ' Miliar' . ($n % 1000000000 ? ' ' . terbilang_angka($n % 1000000000) : ''));
    return trim(terbilang_angka((int)floor($n / 1000000000000)) . ' Triliun' . ($n % 1000000000000 ? ' ' . terbilang_angka($n % 1000000000000) : ''));
}
function terbilang_rupiah($nominal): string {
    $n = (int)floor(abs((float)($nominal ?: 0)));
    if ($n === 0) return 'Nol Rupiah';
    return trim(preg_replace('/\s+/', ' ', terbilang_angka($n) . ' Rupiah'));
}

/**
 * Menyatukan kembali potongan placeholder "[Nama]" yang terpecah jadi
 * beberapa <w:t> run oleh Microsoft Word, PERSIS logika mergeSplitPlaceholders
 * di worker.js — supaya penggantian tetap berhasil walau template diedit ulang.
 */
function merge_split_placeholders(string $xml): string {
    if (!preg_match_all('/<w:t\b[^>]*>[\s\S]*?<\/w:t>/', $xml, $m, PREG_OFFSET_CAPTURE)) return $xml;
    $runs = [];
    foreach ($m[0] as $match) {
        [$full, $start] = $match;
        preg_match('/^<w:t\b[^>]*>/', $full, $om);
        $openTag = $om[0];
        $text = substr($full, strlen($openTag), strlen($full) - strlen($openTag) - strlen('</w:t>'));
        $runs[] = ['start' => $start, 'end' => $start + strlen($full), 'openTag' => $openTag, 'text' => $text];
    }
    if (!count($runs)) return $xml;

    $concat = '';
    $charMap = [];
    foreach ($runs as $idx => $r) {
        $len = mb_strlen($r['text']);
        for ($i = 0; $i < $len; $i++) $charMap[] = ['runIdx' => $idx, 'localOffset' => $i];
        $concat .= $r['text'];
    }

    $newTextByRun = array_map(fn($r) => $r['text'], $runs);
    if (preg_match_all('/\[[^\[\]\r\n]{1,80}\]/u', $concat, $pm, PREG_OFFSET_CAPTURE)) {
        foreach ($pm[0] as $match) {
            [$full, $byteStart] = $match;
            // Konversi offset byte ke offset karakter (mb) supaya konsisten dengan charMap
            $matchStart = mb_strlen(substr($concat, 0, $byteStart));
            $matchEnd = $matchStart + mb_strlen($full);
            $startInfo = $charMap[$matchStart] ?? null;
            $endInfo = $charMap[$matchEnd - 1] ?? null;
            if (!$startInfo || !$endInfo || $startInfo['runIdx'] === $endInfo['runIdx']) continue;

            $startRun = $startInfo['runIdx'];
            $endRun = $endInfo['runIdx'];
            $prefix = mb_substr($runs[$startRun]['text'], 0, $startInfo['localOffset']);
            $suffix = mb_substr($runs[$endRun]['text'], $endInfo['localOffset'] + 1);
            $newTextByRun[$startRun] = $prefix . $full;
            for ($i = $startRun + 1; $i < $endRun; $i++) $newTextByRun[$i] = '';
            $newTextByRun[$endRun] = $suffix;
        }
    }

    $result = $xml;
    for ($i = count($runs) - 1; $i >= 0; $i--) {
        if ($newTextByRun[$i] === $runs[$i]['text']) continue;
        $r = $runs[$i];
        $result = substr($result, 0, $r['start']) . $r['openTag'] . $newTextByRun[$i] . '</w:t>' . substr($result, $r['end']);
    }
    return $result;
}

/**
 * Isi template .docx dengan mengganti "[Nama Placeholder]" dengan nilainya.
 * Memakai ZipArchive bawaan PHP — TIDAK butuh Composer/library tambahan.
 * Mengembalikan path file .docx hasil (file sementara), atau melempar Exception.
 */
function render_docx_template(string $templatePath, array $mapping): string {
    if (!class_exists('ZipArchive')) {
        throw new Exception('Ekstensi PHP "zip" belum aktif. Aktifkan extension=zip di php.ini lalu restart Apache.');
    }
    $tmpOut = tempnam(sys_get_temp_dir(), 'pisdocx_');
    copy($templatePath, $tmpOut);

    $zip = new ZipArchive();
    if ($zip->open($tmpOut) !== true) {
        throw new Exception('Template .docx tidak bisa dibuka (file rusak atau bukan .docx yang valid).');
    }
    $xml = $zip->getFromName('word/document.xml');
    if ($xml === false) {
        $zip->close();
        throw new Exception('Template .docx tidak valid (word/document.xml tidak ditemukan).');
    }
    $xml = merge_split_placeholders($xml);
    foreach ($mapping as $key => $value) {
        $xml = str_replace("[$key]", escape_xml_text($value), $xml);
    }
    $zip->addFromString('word/document.xml', $xml);
    $zip->close();

    return $tmpOut;
}

/** Ambil path template dari drive D: (TEMPLATE_ROOT), pengganti loadTemplateFromR2 */
function load_template_path(string $filename): ?string {
    $path = rtrim(TEMPLATE_ROOT, '/\\') . '/' . $filename;
    return is_file($path) ? $path : null;
}

function find_area_project_by_name(?string $namaArea): ?array {
    if (!$namaArea) return null;
    foreach (list_entity('AreaProject', ['limit' => 1000]) as $a) {
        $nama = strtolower(trim($a['nama_area'] ?? $a['nama_proyek'] ?? ''));
        if ($nama === strtolower(trim($namaArea))) return $a;
    }
    return null;
}
