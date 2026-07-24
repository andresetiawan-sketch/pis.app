-- ============================================================
--  PIS INTEGRATED SYSTEM — Skema MySQL (pengganti Cloudflare D1)
--  Import lewat phpMyAdmin atau: mysql -u root -p pis_db < schema.mysql.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS pis_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pis_db;

-- ─────────────────────────────────────────────
-- 1. RECORDS — menyimpan semua entity (schema-less, sama seperti D1 asli)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS records (
    id            VARCHAR(64) PRIMARY KEY,
    entity        VARCHAR(64) NOT NULL,
    data          LONGTEXT NOT NULL,
    created_date  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_date  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by    VARCHAR(128),
    nik_karyawan  VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(data, '$.nik_karyawan'))) STORED,
    INDEX idx_records_entity (entity),
    INDEX idx_records_entity_created (entity, created_date),
    INDEX idx_records_nik (entity, nik_karyawan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────
-- 2. SETTINGS — konfigurasi aplikasi (key-value)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    setting_key    VARCHAR(191) PRIMARY KEY,
    setting_value  LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────
-- 3. SESSIONS — pengganti Cloudflare KV (dulu env.CACHE) untuk token login
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    token         VARCHAR(80) PRIMARY KEY,
    payload       LONGTEXT NOT NULL,
    expires_at    DATETIME NOT NULL,
    INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────
-- 4. LOGIN_FAILS — pengganti KV loginfail:{nik} (kunci brute-force)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_fails (
    nik           VARCHAR(64) PRIMARY KEY,
    attempts      INT NOT NULL DEFAULT 0,
    locked_until  DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────
-- 5. SETTINGS default
-- ─────────────────────────────────────────────
INSERT IGNORE INTO settings (setting_key, setting_value) VALUES
    ('app_name', 'PIS Integrated System'),
    ('logo_key', ''),
    ('favicon_key', '');

INSERT IGNORE INTO settings (setting_key, setting_value) VALUES
    ('menu_config:Master Admin', '[]'),
    ('menu_config:Admin',        '[]'),
    ('menu_config:Staff',        '[]'),
    ('menu_config:Security',     '[]');

-- ─────────────────────────────────────────────
-- 6. SEED AKUN MASTER ADMIN DEFAULT
--    NIK: 001   Password: admin123
--    WAJIB ganti password ini setelah login pertama di server produksi.
-- ─────────────────────────────────────────────
INSERT IGNORE INTO records (id, entity, data, created_by)
SELECT REPLACE(UUID(), '-', ''), 'Employee',
    JSON_OBJECT(
        'nik_karyawan', '001',
        'nama_lengkap', 'Master Admin',
        'password', 'admin123',
        'role', 'Master Admin',
        'jabatan', 'Administrator',
        'area_tugas', 'Head Office',
        'status_aktif', 'Aktif'
    ),
    'system'
FROM DUAL
WHERE NOT EXISTS (
    SELECT 1 FROM records WHERE entity = 'Employee' AND nik_karyawan = '001'
);
