<?php
// 1. Panggil autoload
require_once 'vendor/autoload.php';

// 2. Import class yang dibutuhkan
use PhpOffice\PhpWord\PhpWord;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PHPMailer\PHPMailer\PHPMailer;

echo "<h3>Pengecekan Pustaka di htdocs_pis:</h3>";

// Uji PHPWord
try {
    $word = new PhpWord();
    echo "✅ PHPWord siap digunakan!<br>";
} catch (\Exception $e) {
    echo "❌ PHPWord gagal: " . $e->getMessage() . "<br>";
}

// Uji PhpSpreadsheet
try {
    $spreadsheet = new Spreadsheet();
    echo "✅ PhpSpreadsheet siap digunakan!<br>";
} catch (\Exception $e) {
    echo "❌ PhpSpreadsheet gagal: " . $e->getMessage() . "<br>";
}

// Uji PHPMailer
try {
    $mail = new PHPMailer();
    echo "✅ PHPMailer siap digunakan!<br>";
} catch (\Exception $e) {
    echo "❌ PHPMailer gagal: " . $e->getMessage() . "<br>";
}
