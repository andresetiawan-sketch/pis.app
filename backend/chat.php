<?php
if (!defined('PIS_APP')) { http_response_code(403); exit('Forbidden'); }
require_once __DIR__ . '/payroll.php';

/**
 * Balasan otomatis berbasis pola kata kunci (bukan AI generatif — persis
 * logika rule-based di worker.js). Mengembalikan null kalau tidak ada
 * pola yang cocok (supaya admin manusia yang menjawab).
 */
function generate_auto_reply(string $pesan, string $namaUser, ?array $auth): ?string {
    $text = mb_strtolower(trim($pesan));
    $nama = $namaUser ?: 'Kak';

    if (preg_match('/^(halo|hai|hi|hello|pagi|siang|sore|malam|assalamualaikum|assalam|p)\b/iu', $text)) {
        return "Halo $nama! 👋 Ada yang bisa aku bantu? Kamu bisa tanya soal absensi, jadwal shift, slip gaji, cuti, patroli, tiket fasilitas, PKWT, laporan, atau fitur lain di PIS. Ketik aja pertanyaan kamu! 😊";
    }
    if (mb_strlen($text) < 60 && preg_match('/^(help|bantu|tolong|cara|gimana|bagaimana|mau|ingin|tanya|info)\b/iu', $text)) {
        return "Halo $nama! 👋 Aku bisa bantu jawab soal: absensi, jadwal shift, slip gaji, cuti & izin, e-patroli, tiket fasilitas, PKWT & surat tugas, laporan harian/PDF, data karyawan, dan area/proyek. Ketik aja yang mau kamu tanya! 😊";
    }
    if (preg_match('/absen|absensi|e-absen|check.?in|check.?out|masuk kerja|pulang kerja/u', $text)) {
        return "Halo $nama! 👋 Untuk absensi:\n1. Buka menu \"E-Absensi\"\n2. Pastikan GPS aktif — sistem cek lokasi kamu\n3. Tekan \"Absen Masuk\" saat mulai kerja\n4. Tekan \"Absen Pulang\" saat selesai\n\nKalau ditolak, mungkin kamu di luar radius area. Ada yang lain? 😊";
    }
    if (preg_match('/jadwal|shift|roster|regu|jadwal kerja/u', $text)) {
        $today = date('Y-m-d');
        $mySchedule = null;
        try {
            $schedules = list_entity('ShiftSchedule', ['tanggal' => $today, 'limit' => 2000]);
            foreach ($schedules as $s) {
                if (in_array($auth['nik'] ?? null, $s['karyawan_ids'] ?? [], true)) { $mySchedule = $s; break; }
            }
        } catch (Throwable $e) { /* abaikan, fallback ke pesan generik di bawah */ }
        if ($mySchedule) {
            $jam = !empty($mySchedule['jam_mulai']) ? " jam {$mySchedule['jam_mulai']}-{$mySchedule['jam_selesai']}" : '';
            $tipeShift = $mySchedule['tipe_shift'] ?? $mySchedule['shift'] ?? 'Tidak ada';
            $area = $mySchedule['area_tugas'] ?? '-';
            return "Halo $nama! 👋 Jadwal kamu hari ini: $tipeShift$jam di area $area. Mau tukar shift? Bisa lewat menu \"Tukar Shift\" ya! 😊";
        }
        return "Halo $nama! 👋 Kayaknya belum ada jadwal shift untuk kamu hari ini. Cek menu \"Jadwal Shift\" untuk jadwal bulan ini ya. Ada yang lain? 😊";
    }
    if (preg_match('/gaji|slip|payslip|gajian|upah|terbilang/u', $text)) {
        return "Halo $nama! 👋 Slip gaji bisa dilihat di menu \"Slip Gaji\". Slip muncul setelah HR memproses gaji bulan ini. Kalau belum ada, mungkin belum diproses. Hubungi HR kalau urgent ya! Ada yang lain? 😊";
    }
    if (preg_match('/cuti|izin|sakit|libur|leave|tidak masuk/u', $text)) {
        return "Halo $nama! 👋 Untuk cuti/izin:\n1. Buka menu \"Cuti & Izin\"\n2. Klik \"Ajukan Cuti/Izin\"\n3. Pilih jenis (Cuti/Sakit/Izin)\n4. Isi tanggal & alasan\n5. Submit\n\nSisa cuti bisa dicek di halaman yang sama. Ada yang lain? 😊";
    }
    if (preg_match('/password|lupa|sandi|akun|login|ganti password/u', $text)) {
        return "Halo $nama! 👋 Kalau lupa password:\n1. Klik \"Lupa Password\" di halaman login\n2. Masukkan NIK kamu\n3. Tunggu persetujuan Admin Head Office\n4. Password baru dikirim ke email kamu\n\nKalau mau ganti password (sudah login), buka menu \"Ganti Password\". Ada yang lain? 😊";
    }
    if (preg_match('/patroli|patrol|epatrol|e-patrol|scan patroli/u', $text)) {
        return "Halo $nama! 👋 Untuk patroli:\n1. Buka menu \"E-Patroli\"\n2. Pilih template patroli\n3. Mulai patroli\n4. Scan tiap titik sesuai urutan\n5. Foto di tiap titik\n6. Selesai setelah semua titik discan\n\nAda yang lain? 😊";
    }
    if (preg_match('/tiket|facility|fasilitas|kerusakan|rusak|perbaikan|lapor/u', $text)) {
        return "Halo $nama! 👋 Untuk lapor kerusakan:\n1. Buka menu \"Ticketing Fasilitas\"\n2. Klik \"Buat Tiket\"\n3. Jelaskan kerusakan\n4. Sertakan foto kalau ada\n5. Submit\n\nTiket diteruskan ke tim maintenance. Ada yang lain? 😊";
    }
    if (preg_match('/pkwt|kontrak|surat tugas|kontrak kerja/u', $text)) {
        return "Halo $nama! 👋 PKWT & Surat Tugas bisa dilihat di menu \"PKWT Karyawan\". Kalau belum ada, hubungi HR/Admin untuk generate. Dokumen bisa diunduh .docx. Ada yang lain? 😊";
    }
    if (preg_match('/laporan|report|harian|pdf|lapor harian/u', $text)) {
        return "Halo $nama! 👋 Laporan harian bisa dibuat lewat menu \"Laporan Harian\". Untuk laporan PDF, buka menu \"Laporan PDF\" dan pilih periode. Setelah kirim, notifikasi \"laporan berhasil terkirim\" akan muncul. Ada yang lain? 😊";
    }
    if (preg_match('/karyawan|data diri|profil|foto|identitas|nik/u', $text)) {
        return "Halo $nama! 👋 Data diri bisa dilihat di menu \"Profil\". Kalau ada data yang perlu diperbarui, edit di sana atau minta bantuan Admin. Ada yang lain? 😊";
    }
    if (preg_match('/area|proyek|project|lokasi|tempat kerja|penempatan/u', $text)) {
        return "Halo $nama! 👋 Info area/proyek tempat kamu bekerja ada di menu \"Area/Proyek\". Di sana ada alamat, radius absensi, dan jabatan tersedia. Ada yang lain? 😊";
    }
    if (preg_match('/inventaris|barang|asset|sarana|prasarana/u', $text)) {
        return "Halo $nama! 👋 Inventaris bisa dilihat di menu \"Inventaris\". Kalau mau lapor barang rusak/hilang, bisa lewat \"Ticketing Fasilitas\". Ada yang lain? 😊";
    }
    if (preg_match('/serah terima|handover|shift handover/u', $text)) {
        return "Halo $nama! 👋 Serah terima shift bisa lewat menu \"Serah Terima Shift\". Pastikan sudah absen pulang sebelum serah terima ya! Ada yang lain? 😊";
    }
    if (preg_match('/buku tamu|tamu|guest|visitor/u', $text)) {
        return "Halo $nama! 👋 Untuk catat tamu, buka menu \"Buku Tamu\" lalu isi data tamu (nama, no HP, tujuan, waktu masuk). Jangan lupa catat waktu keluar juga ya! Ada yang lain? 😊";
    }

    return null; // tidak ada pola cocok → biarkan admin manusia yang menjawab
}

function chat_notify_master_admins(string $judul, string $pesan, string $refId): void {
    $employees = list_entity('Employee', ['status_aktif' => 'Aktif', 'limit' => 2000]);
    foreach ($employees as $admin) {
        if (!in_array($admin['role'] ?? '', MASTER_ADMIN_ROLES, true) || empty($admin['nik_karyawan'])) continue;
        create_entity('SystemNotification', [
            'nik_penerima' => $admin['nik_karyawan'], 'judul' => $judul, 'pesan' => $pesan,
            'tipe' => 'AdminChat', 'ref_entity' => 'AdminChat', 'ref_id' => $refId, 'dibaca' => false,
        ], 'system');
    }
}

function chat_cleanup_old(): void {
    // Auto-hapus chat karyawan lama (>30 hari); riwayat Admin/Master Admin/System tetap tersimpan.
    db()->exec(
        "DELETE FROM records WHERE entity='AdminChat' AND created_date < (NOW() - INTERVAL 30 DAY)
         AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.role_pengirim')) NOT IN ('Master Admin','Admin','System')"
    );
}

function fn_send_chat(array $body, ?array $auth): array {
    $pesan = trim((string)($body['pesan'] ?? ''));
    $toNik = $body['to_nik'] ?? null;
    $askAdmin = $body['ask_admin'] ?? false;
    if ($pesan === '') return ['success' => false, 'error' => 'Pesan tidak boleh kosong'];
    if (empty($auth['nik'])) return ['success' => false, 'error' => 'Harus login untuk mengirim pesan'];

    $sender = find_employee_by_nik($auth['nik']);
    $senderIsMasterAdmin = is_master_admin($auth);
    if ($senderIsMasterAdmin && !$toNik) {
        return ['success' => false, 'error' => 'to_nik (NIK user tujuan) wajib diisi saat Admin Master membalas'];
    }

    $namaPengirim = $sender['nama_lengkap'] ?? $auth['nama'] ?? 'Pengguna';
    $chat = [
        'pesan' => $pesan, 'nama_pengirim' => $namaPengirim, 'role_pengirim' => $sender['role'] ?? $auth['role'] ?? 'Staff',
        'nik_pengirim' => $auth['nik'], 'area_tugas_pengirim' => $sender['area_tugas'] ?? '-',
        'to_nik' => $senderIsMasterAdmin ? $toNik : null,
        'waktu' => date('c'), 'dibaca_admin' => $senderIsMasterAdmin, 'dibaca_user' => $senderIsMasterAdmin ? false : true,
        'ask_admin' => (bool)$askAdmin,
    ];
    $rec = create_entity('AdminChat', $chat, $auth['nik']);

    // ── User minta chat langsung dengan Admin Master ──
    if (!$senderIsMasterAdmin && $askAdmin) {
        chat_notify_master_admins('Chat Masuk dari User', "$namaPengirim (NIK {$auth['nik']}) ingin bertanya langsung kepada Anda. Pesan: \"" . mb_substr($pesan, 0, 100) . '"', $rec['id']);
        create_entity('AdminChat', [
            'pesan' => "Baik $namaPengirim! 📨 Pesan kamu sudah diteruskan ke Admin Master. Mohon tunggu sebentar ya, Admin akan segera menjawab. 😊",
            'nama_pengirim' => 'Acha', 'role_pengirim' => 'System', 'nik_pengirim' => 'system', 'area_tugas_pengirim' => '-',
            'to_nik' => $auth['nik'], 'waktu' => date('c'), 'dibaca_admin' => true, 'dibaca_user' => false, 'is_auto_reply' => true,
        ], 'system');
        chat_cleanup_old();
        return ['success' => true, 'chat' => $rec];
    }

    // ── Auto-reply "Acha" (hanya untuk user biasa, bukan ask_admin) ──
    if (!$senderIsMasterAdmin) {
        $autoReply = generate_auto_reply($pesan, $namaPengirim, $auth);

        $stmt = db()->prepare("SELECT id FROM records WHERE entity='AdminChat' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.nik_pengirim')) = ? AND created_date >= (NOW() - INTERVAL 24 HOUR) LIMIT 2");
        $stmt->execute([$auth['nik']]);
        $isFirstMessageToday = count($stmt->fetchAll()) <= 1;

        if ($isFirstMessageToday) {
            create_entity('AdminChat', [
                'pesan' => "Halo $namaPengirim! 👋 Aku Acha, asisten virtual PIS Integrated System. Senang bisa membantu kamu hari ini! 😊\n\nKamu bisa nanya soal absensi, jadwal shift, slip gaji, cuti, patroli, tiket fasilitas, PKWT, laporan, dan fitur lainnya. Pilih topik di bawah atau ketik pertanyaan kamu. Kalau mau tanya langsung ke Admin, pilih \"Chat dengan Admin\" ya!",
                'nama_pengirim' => 'Acha', 'role_pengirim' => 'System', 'nik_pengirim' => 'system', 'area_tugas_pengirim' => '-',
                'to_nik' => $auth['nik'], 'waktu' => date('c'), 'dibaca_admin' => true, 'dibaca_user' => false, 'is_auto_greeting' => true,
            ], 'system');
            if ($autoReply) {
                create_entity('AdminChat', [
                    'pesan' => $autoReply, 'nama_pengirim' => 'Acha', 'role_pengirim' => 'System', 'nik_pengirim' => 'system',
                    'area_tugas_pengirim' => '-', 'to_nik' => $auth['nik'], 'waktu' => date('c'),
                    'dibaca_admin' => true, 'dibaca_user' => false, 'is_auto_reply' => true,
                ], 'system');
            }
        } elseif ($autoReply) {
            create_entity('AdminChat', [
                'pesan' => $autoReply, 'nama_pengirim' => 'Acha', 'role_pengirim' => 'System', 'nik_pengirim' => 'system',
                'area_tugas_pengirim' => '-', 'to_nik' => $auth['nik'], 'waktu' => date('c'),
                'dibaca_admin' => true, 'dibaca_user' => false, 'is_auto_reply' => true,
            ], 'system');
        }

        chat_notify_master_admins('Chat Masuk', "$namaPengirim mengirim pesan chat. Acha sudah menjawab, tapi kamu bisa ikut menjawab jika perlu.", $rec['id']);
    }

    chat_cleanup_old();
    return ['success' => true, 'chat' => $rec];
}

function fn_get_chats(array $body, ?array $auth): array {
    if (!is_master_admin($auth)) return ['success' => false, 'error' => 'Hanya Master Admin yang bisa melihat semua chat'];
    $stmt = db()->query("SELECT id, data, created_date, updated_date FROM records WHERE entity='AdminChat' ORDER BY created_date ASC LIMIT 1000");
    return ['success' => true, 'chats' => array_map('row_to_record', $stmt->fetchAll())];
}

function fn_get_my_chat(array $body, ?array $auth): array {
    if (empty($auth['nik'])) return ['success' => false, 'error' => 'Harus login'];
    $stmt = db()->prepare(
        "SELECT id, data, created_date, updated_date FROM records WHERE entity='AdminChat'
         AND (JSON_UNQUOTE(JSON_EXTRACT(data,'$.nik_pengirim')) = ? OR JSON_UNQUOTE(JSON_EXTRACT(data,'$.to_nik')) = ?)
         ORDER BY created_date ASC LIMIT 500"
    );
    $stmt->execute([$auth['nik'], $auth['nik']]);
    $chats = array_map('row_to_record', $stmt->fetchAll());

    $upd = db()->prepare("UPDATE records SET data = JSON_SET(data, '$.dibaca_user', TRUE) WHERE entity='AdminChat' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.to_nik')) = ?");
    $upd->execute([$auth['nik']]);

    return ['success' => true, 'chats' => $chats];
}

function fn_get_my_chat_unread_count(array $body, ?array $auth): array {
    if (empty($auth['nik'])) return ['success' => true, 'unread' => 0];
    $stmt = db()->prepare("SELECT COUNT(*) AS cnt FROM records WHERE entity='AdminChat' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.to_nik')) = ? AND JSON_EXTRACT(data,'$.dibaca_user') = false");
    $stmt->execute([$auth['nik']]);
    $row = $stmt->fetch();
    return ['success' => true, 'unread' => (int)($row['cnt'] ?? 0)];
}

function fn_mark_chat_read(array $body, ?array $auth): array {
    if (!is_master_admin($auth)) return ['success' => false, 'error' => 'Akses ditolak'];
    $chatId = $body['chat_id'] ?? null;
    $partnerNik = $body['partner_nik'] ?? null;
    if ($chatId) {
        update_entity('AdminChat', $chatId, ['dibaca_admin' => true]);
    } elseif ($partnerNik) {
        $stmt = db()->prepare("UPDATE records SET data = JSON_SET(data, '$.dibaca_admin', TRUE) WHERE entity='AdminChat' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.nik_pengirim')) = ?");
        $stmt->execute([$partnerNik]);
    } else {
        db()->exec("UPDATE records SET data = JSON_SET(data, '$.dibaca_admin', TRUE) WHERE entity='AdminChat'");
    }
    return ['success' => true];
}

function fn_get_chat_count(): array {
    $row = db()->query("SELECT COUNT(*) AS cnt FROM records WHERE entity='AdminChat' AND JSON_EXTRACT(data,'$.dibaca_admin') = false")->fetch();
    return ['success' => true, 'unread' => (int)($row['cnt'] ?? 0)];
}
