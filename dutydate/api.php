<?php
header('Content-Type: application/json; charset=utf-8');

// ใช้ไฟล์เชื่อมต่อฐานข้อมูลตามที่ผู้ใช้ให้มา
require_once '../config/connect_db.php';

$method = $_SERVER['REQUEST_METHOD'];

function getHolidays() {
    $cacheFile = 'holidays_cache.json';
    $cacheTime = 86400; // 24 hours

    if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < $cacheTime)) {
        return json_decode(file_get_contents($cacheFile), true);
    }

    $url = 'https://calendar.google.com/calendar/ical/th.th%23holiday%40group.v.calendar.google.com/public/basic.ics';
    $ics = @file_get_contents($url);
    if (!$ics) return [];

    $holidays = [];
    // Simple ICS parser
    preg_match_all('/BEGIN:VEVENT.*?END:VEVENT/s', $ics, $matches);

    foreach ($matches[0] as $event) {
        if (preg_match('/DTSTART;VALUE=DATE:(\d{8})/', $event, $dateMatch) &&
            preg_match('/SUMMARY:(.*?)(\r|\n|$)/', $event, $summaryMatch)) {
            $dateStr = $dateMatch[1];
            $formattedDate = substr($dateStr, 0, 4) . '-' . substr($dateStr, 4, 2) . '-' . substr($dateStr, 6, 2);
            $holidays[$formattedDate] = trim($summaryMatch[1]);
        }
    }

    @file_put_contents($cacheFile, json_encode($holidays));
    return $holidays;
}

if ($method === 'GET') {
    $sql = "SELECT date, shift, slot, name FROM duty";
    $result = $conn->query($sql);
    
    $data = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $data[] = [
                'date'  => $row['date'],
                'shift' => $row['shift'],
                'slot'  => (int)$row['slot'],
                'name'  => $row['name']
            ];
        }
    } else {
        // ถ้า query error อาจเพราะยังไม่ได้สร้างตาราง ส่งกลับเป็น array ว่าง
        echo json_encode(['status' => 'error', 'message' => $conn->error]);
        exit;
    }
    
    $holidays = getHolidays();
    
    echo json_encode(['status' => 'ok', 'data' => $data, 'holidays' => $holidays]);
    $conn->close();
    exit;
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid JSON input']);
        exit;
    }

    // Save Theme
    if (isset($input['action']) && $input['action'] === 'save_theme') {
        $ip = $_SERVER['REMOTE_ADDR'];
        $theme = $conn->real_escape_string($input['theme']);
        
        // Auto-create table if not exists
        $conn->query("CREATE TABLE IF NOT EXISTS user_theme (
            ip_address VARCHAR(45) PRIMARY KEY,
            theme VARCHAR(20) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $sql = "INSERT INTO user_theme (ip_address, theme) VALUES ('$ip', '$theme') 
                ON DUPLICATE KEY UPDATE theme='$theme'";
                
        if ($conn->query($sql)) {
            echo json_encode(['status' => 'ok']);
        } else {
            echo json_encode(['status' => 'error', 'message' => $conn->error]);
        }
        $conn->close();
        exit;
    }

    $date  = $conn->real_escape_string($input['date']);
    $shift = $conn->real_escape_string($input['shift']);
    $slot  = (int)$input['slot'];
    $name  = $conn->real_escape_string($input['name']);

    if (empty($date) || empty($shift) || empty($slot)) {
        echo json_encode(['status' => 'error', 'message' => 'Missing required fields']);
        exit;
    }

    if ($name === '') {
        // Delete record ถ้าส่งชื่อว่างมา
        $sql = "DELETE FROM duty WHERE date='$date' AND shift='$shift' AND slot=$slot";
        if ($conn->query($sql)) {
            echo json_encode(['status' => 'ok', 'action' => 'deleted']);
        } else {
            echo json_encode(['status' => 'error', 'message' => $conn->error]);
        }
    } else {
        // Insert หรือ Update ถ้ามีข้อมูลซ้ำ
        // ต้องมี UNIQUE INDEX (date, shift, slot)
        $sql = "INSERT INTO duty (date, shift, slot, name) 
                VALUES ('$date', '$shift', $slot, '$name') 
                ON DUPLICATE KEY UPDATE name='$name'";
                
        if ($conn->query($sql)) {
            echo json_encode(['status' => 'ok', 'action' => 'saved']);
        } else {
            echo json_encode(['status' => 'error', 'message' => $conn->error]);
        }
    }
    
    $conn->close();
    exit;
}

echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
$conn->close();
