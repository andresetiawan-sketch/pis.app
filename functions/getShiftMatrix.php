<?php
header('Content-Type: application/json');

function getShiftMatrix($area_id, $month, $year) {
  $db = getDB();
  
  // Ambil semua karyawan di area ini, group by regu
  $employees = $db->query("
    SELECT nik_karyawan, nama_lengkap, regu, area_tugas 
    FROM employees 
    WHERE area_tugas = ? AND status_aktif = 1
    ORDER BY regu, nama_lengkap
  ", [$area_id])->fetchAll();

  if (!$employees) return ['success' => false, 'error' => 'Tidak ada karyawan di area ini'];

  // Group karyawan by regu
  $byRegu = [];
  foreach ($employees as $emp) {
    $regu = $emp['regu'] ?: 'NonShift';
    if (!isset($byRegu[$regu])) $byRegu[$regu] = [];
    $byRegu[$regu][] = $emp;
  }

  // Ambil konfigurasi shift per regu untuk area ini
  $configs = $db->query("SELECT * FROM shift_config WHERE area_id = ?", [$area_id])->fetchAll();
  $configMap = [];
  foreach ($configs as $c) {
    $configMap[$c['regu_type']] = $c;
  }

  $daysInMonth = cal_days_in_month(CAL_GREGORIAN, $month, $year);
  
  // Build matrix: regu -> karyawan -> hari -> shift
  $matrix = [];
  $reguOrder = ['A', 'B', 'C', 'D', 'NonShift'];
  
  foreach ($reguOrder as $regu) {
    if (!isset($byRegu[$regu])) continue;
    
    $cfg = $configMap[$regu] ?? null;
    $reguLabel = $regu === 'NonShift' ? 'Non Shift' : 'Regu ' . $regu;
    
    foreach ($byRegu[$regu] as $emp) {
      $row = [
        'nik' => $emp['nik_karyawan'],
        'nama' => $emp['nama_lengkap'],
        'regu' => $regu,
        'regu_label' => $reguLabel,
        'jam_kerja' => $cfg ? (int)$cfg['jam_kerja'] : 0,
        'ikatan_jam' => $cfg ? (bool)$cfg['ikatan_jam'] : false,
        'days' => []
      ];
      
      for ($day = 1; $day <= $daysInMonth; $day++) {
        $date = sprintf('%04d-%02d-%02d', $year, $month, $day);
        $dayOfWeek = date('N', strtotime($date));
        
        if (!$cfg) {
          $row['days'][$day] = ['status' => 'OFF', 'label' => '-'];
          continue;
        }
        
        // Cek hari libur
        $isSabtuLibur = ($dayOfWeek == 6 && $cfg['sabtu_libur']);
        $isMingguLibur = ($dayOfWeek == 7 && $cfg['minggu_libur']);
        
        if ($isSabtuLibur || $isMingguLibur) {
          $row['days'][$day] = ['status' => 'OFF', 'label' => 'L'];
        } else {
          // Rotasi shift untuk regu bergilir (A/B/C/D)
          $shiftIndex = ($day - 1) % max(1, count(array_filter($reguOrder, fn($r) => $r !== 'NonShift' && isset($byRegu[$r]))));
          $row['days'][$day] = [
            'status' => 'KERJA',
            'label' => $regu,
            'jam_masuk' => $cfg['jam_masuk'],
            'jam_pulang' => $cfg['jam_pulang']
          ];
        }
      }
      
      $matrix[] = $row;
    }
  }
  
  return [
    'success' => true,
    'area_id' => $area_id,
    'month' => $month,
    'year' => $year,
    'days_in_month' => $daysInMonth,
    'matrix' => $matrix
  ];
}

// Endpoint
$area_id = $_GET['area_id'] ?? '';
$month = (int)($_GET['month'] ?? date('n'));
$year = (int)($_GET['year'] ?? date('Y'));

if (!$area_id) {
  echo json_encode(['success' => false, 'error' => 'area_id wajib diisi']);
  exit;
}

echo json_encode(getShiftMatrix($area_id, $month, $year));
