function doGet(e) {
    // Guard: ป้องกัน error ตอน test run ใน editor (ไม่มี event object)
    if (!e || !e.parameter) {
        return ContentService
            .createTextOutput(JSON.stringify({ status: 'ok', note: 'no params' }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    var p = e.parameter;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ─── กรณี 0: Sync ข้อมูลทั้งหมดกลับไปที่แอป (ดึงข้อมูล) ───
    if (p.action === 'sync') {
        var result = { duties: [], swaps: [], works: [], holidays: {}, sells: [], sellTransfers: [] };

        var dutySheet = ss.getSheets()[0];
        if (dutySheet && dutySheet.getLastRow() > 0) {
            result.duties = dutySheet.getDataRange().getDisplayValues();
        }

        var swapSheet = ss.getSheetByName('swap');
        if (swapSheet && swapSheet.getLastRow() > 0) {
            result.swaps = swapSheet.getDataRange().getDisplayValues();
        }

        var workSheet = ss.getSheetByName('work');
        if (workSheet && workSheet.getLastRow() > 0) {
            result.works = workSheet.getDataRange().getDisplayValues();
        }

        // ─── ดึงวันหยุดจาก sheet "วันหยุด" ───
        // คอลัมน์: A=วันที่ (Date หรือ string dd/mm/yyyy), B=รายการวันหยุด
        var holidaySheet = ss.getSheetByName('วันหยุด');
        if (holidaySheet && holidaySheet.getLastRow() > 1) {
            var hlRows = holidaySheet.getDataRange().getValues(); // ใช้ getValues เพื่อเอา Date object
            for (var hi = 1; hi < hlRows.length; hi++) {  // เริ่ม 1 เพื่อข้าม header
                var hRow = hlRows[hi];
                var rawDate = hRow[0];
                var hlName = hRow[1] ? String(hRow[1]).trim() : '';
                if (!rawDate || !hlName) continue;

                var dateStr = '';
                if (rawDate instanceof Date) {
                    // แปลง Date → YYYY-MM-DD (ใช้ timezone ของ Spreadsheet)
                    var y = rawDate.getFullYear();
                    var mo = String(rawDate.getMonth() + 1).padStart(2, '0');
                    var d = String(rawDate.getDate()).padStart(2, '0');
                    dateStr = y + '-' + mo + '-' + d;
                } else {
                    // กรณี string format dd/mm/yyyy หรือ yyyy-mm-dd
                    var s = String(rawDate).trim();
                    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                        dateStr = s;
                    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
                        var parts = s.split('/');
                        dateStr = parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0');
                    }
                }

                if (dateStr && !result.holidays[dateStr]) {
                    result.holidays[dateStr] = hlName;
                }
            }
        }

        // ─── ดึงขายเวรจาก sheet "sell" ───
        var sellSheet = ss.getSheetByName('sell');
        if (sellSheet && sellSheet.getLastRow() > 0) {
            result.sells = sellSheet.getDataRange().getDisplayValues();
        }

        // ─── ดึง sellTransfer log ───
        var stSheet = ss.getSheetByName('sellTransfer');
        if (stSheet && stSheet.getLastRow() > 0) {
            result.sellTransfers = stSheet.getDataRange().getDisplayValues();
        }

        return ContentService
            .createTextOutput(JSON.stringify({ status: 'ok', data: result }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // ─── กรณีประกาศขายเวร (sell.html) ───
    if (p.action === 'sell') {
        var sellSheet = ss.getSheetByName('sell') || ss.insertSheet('sell');
        if (sellSheet.getLastRow() === 0) {
            sellSheet.appendRow(['timestamp', 'วันที่', 'กะ', 'ช่อง', 'ชื่อผู้ขาย']);
        }
        sellSheet.appendRow([
            new Date(),
            p.date || '',
            p.shift || '',
            p.slot || '',
            p.name || ''
        ]);
        return ContentService
            .createTextOutput(JSON.stringify({ status: 'ok', action: 'sell' }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // ─── กรณียกเลิกขายเวร ───
    if (p.action === 'cancelSell') {
        var sellSheet = ss.getSheetByName('sell');
        if (sellSheet && sellSheet.getLastRow() > 1) {
            var data = sellSheet.getDataRange().getDisplayValues();
            for (var i = data.length - 1; i >= 1; i--) {
                var r = data[i];
                if (r.length >= 5 && r[1] === p.date && r[2] === p.shift && r[3] === p.slot && r[4] === p.name) {
                    sellSheet.deleteRow(i + 1);
                    break;
                }
            }
        }
        return ContentService
            .createTextOutput(JSON.stringify({ status: 'ok', action: 'cancelSell' }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // ─── บันทึก sellTransfer log (sell.html ตอนโอนเวรสำเร็จ) ───
    if (p.action === 'sellTransfer') {
        var stSheet = ss.getSheetByName('sellTransfer') || ss.insertSheet('sellTransfer');
        if (stSheet.getLastRow() === 0) {
            stSheet.appendRow(['timestamp', 'วันที่', 'กะ', 'ช่อง', 'ผู้ขาย', 'ผู้ซื้อ']);
        }
        stSheet.appendRow([
            new Date(),
            p.date || '',
            p.shift || '',
            p.slot || '',
            p.seller || '',
            p.buyer || ''
        ]);
        return ContentService
            .createTextOutput(JSON.stringify({ status: 'ok', action: 'sellTransfer' }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // ─── ยกเลิก sellTransfer (คืนเวรให้ผู้ขายเดิม) ───
    if (p.action === 'cancelSellTransfer') {
        // ลบออกจาก sellTransfer sheet
        var stSheet = ss.getSheetByName('sellTransfer');
        if (stSheet && stSheet.getLastRow() > 1) {
            var data = stSheet.getDataRange().getDisplayValues();
            for (var i = data.length - 1; i >= 1; i--) {
                var r = data[i];
                if (r.length >= 5 && r[1] === p.date && r[2] === p.shift && r[3] === p.slot && r[4] === p.seller) {
                    stSheet.deleteRow(i + 1);
                    break;
                }
            }
        }
        return ContentService
            .createTextOutput(JSON.stringify({ status: 'ok', action: 'cancelSellTransfer' }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // ─── กรณีบันทึกงานสำเร็จ ───
    if (p.action === 'completeWork') {
        var workSheet = ss.getSheetByName('work');
        if (workSheet && workSheet.getLastRow() > 1) {
            var data = workSheet.getDataRange().getDisplayValues();
            for (var i = data.length - 1; i >= 1; i--) {
                var r = data[i];
                if (r.length >= 5 && r[1] === p.date && r[2] === p.start && r[4] === p.task) {
                    workSheet.getRange(i + 1, 7).setValue('สำเร็จ'); // บันทึกในคอลัมน์ G (7)
                    break;
                }
            }
        }
        return ContentService
            .createTextOutput(JSON.stringify({ status: 'ok', action: 'completeWork' }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // ─── กรณียกเลิกงานสำเร็จ ───
    if (p.action === 'cancelCompleteWork') {
        var workSheet = ss.getSheetByName('work');
        if (workSheet && workSheet.getLastRow() > 1) {
            var data = workSheet.getDataRange().getDisplayValues();
            for (var i = data.length - 1; i >= 1; i--) {
                var r = data[i];
                if (r.length >= 5 && r[1] === p.date && r[2] === p.start && r[4] === p.task) {
                    workSheet.getRange(i + 1, 7).clearContent(); // ลบค่าในคอลัมน์ G (7)
                    break;
                }
            }
        }
        return ContentService
            .createTextOutput(JSON.stringify({ status: 'ok', action: 'cancelCompleteWork' }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // ─── กรณี 1: ตารางงาน (qhd/work.html) → sheet=work ───
    if (p.sheet === 'work') {
        var workSheet = ss.getSheetByName('work') || ss.insertSheet('work');
        // ถ้าชีตใหม่ ใส่ header
        if (workSheet.getLastRow() === 0) {
            workSheet.appendRow(['timestamp', 'วันที่', 'เริ่ม', 'สิ้นสุด', 'งาน', 'ผู้ร่วมงาน']);
        }
        workSheet.appendRow([
            new Date(),
            p.date || '',
            p.start || '',
            p.end || '',
            p.task || '',
            p.people || ''
        ]);
        return ContentService
            .createTextOutput(JSON.stringify({ status: 'ok', sheet: 'work' }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // ─── กรณีลบงาน QHD ───
    if (p.action === 'deleteWork') {
        var workSheet = ss.getSheetByName('work');
        if (workSheet && workSheet.getLastRow() > 1) {
            var data = workSheet.getDataRange().getDisplayValues();
            // ลูปถอยหลังเพื่อลบแถว
            for (var i = data.length - 1; i >= 1; i--) {
                var r = data[i];
                if (r.length >= 5 && r[1] === p.date && r[2] === p.start && r[4] === p.task) {
                    workSheet.deleteRow(i + 1);
                    break; // ลบแค่อันเดียวที่เจออันแรก
                }
            }
        }
        return ContentService
            .createTextOutput(JSON.stringify({ status: 'ok', action: 'deleteWork' }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // ─── กรณียกเลิกแลกเวร ───
    if (p.action === 'cancelSwap') {
        var swapSheet = ss.getSheetByName('swap');
        if (swapSheet && swapSheet.getLastRow() > 1) {
            var dks = (p.dks || '').split('||'); // รูปแบบ: 2026-03-01|เช้า|1||2026-03-05|บ่าย|1
            var data = swapSheet.getDataRange().getDisplayValues();
            // ลูปถอยหลังเพื่อลบแถว (การลบแถวจากล่างขึ้นบนจะไม่ทำให้ Index แจ้งเตือนเคลื่อน)
            for (var i = data.length - 1; i >= 1; i--) {
                var r = data[i];
                if (r.length >= 4 && r[1]) {
                    var rowDk = r[1] + '|' + (r[2] || '') + '|' + (r[3] || '');
                    if (dks.indexOf(rowDk) !== -1) {
                        swapSheet.deleteRow(i + 1);
                    }
                }
            }
        }
        return ContentService
            .createTextOutput(JSON.stringify({ status: 'ok', action: 'cancelSwap' }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // ─── กรณี 2: แลกเวร (move.html) → action=swap ───
    if (p.action === 'swap') {
        var swapSheet = ss.getSheetByName('swap') || ss.insertSheet('swap');
        if (swapSheet.getLastRow() === 0) {
            swapSheet.appendRow(['timestamp', 'วันที่', 'กะ', 'ช่อง', 'ชื่อเดิม', 'ผู้ขอแลก']);
        }
        swapSheet.appendRow([
            new Date(),
            p.date || '',
            p.shift || '',
            p.slot || '',
            p.name || '',
            p.requester || ''
        ]);
        return ContentService
            .createTextOutput(JSON.stringify({ status: 'ok', action: 'swap' }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // ─── กรณี 3: บันทึกเวรปกติ (edit.html) ───
    if (p.date) {
        var sheet = ss.getActiveSheet();
        sheet.appendRow([
            new Date(),
            p.date,
            p.shift || '',
            p.slot || '',
            p.name || ''
        ]);
        return ContentService
            .createTextOutput(JSON.stringify({ status: 'ok' }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // ─── fallback ───
    return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', data: [] }))
        .setMimeType(ContentService.MimeType.JSON);
}
