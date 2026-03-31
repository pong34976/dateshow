/**
 * ฟังก์ชันสำหรับดึงวันหยุดจาก Google Calendar มาลงใน Google Sheet
 */
function importThaiHolidays() {
    // 1. กำหนดค่าเริ่มต้น
    var calendarId = 'th.th#holiday@group.v.calendar.google.com';
    var sheetName = 'วันหยุด'; // ชื่อแผ่นงานของคุณ
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);

    // ถ้าไม่มีแผ่นงานชื่อนี้ ให้สร้างใหม่
    if (!sheet) {
        sheet = ss.insertSheet(sheetName);
    }

    // 2. ล้างข้อมูลเก่าออกก่อน (ถ้าต้องการ)
    sheet.clear();
    sheet.appendRow(['วันที่', 'รายการวันหยุด']);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#f3f3f3');

    // 3. กำหนดช่วงเวลาที่ต้องการดึง (ตัวอย่าง: ปีปัจจุบัน และ ปีหน้า)
    var now = new Date();
    var startDate = new Date(now.getFullYear(), 0, 1); // เริ่มต้น 1 ม.ค. ปีนี้
    var endDate = new Date(now.getFullYear() + 1, 11, 31); // สิ้นสุด 31 ธ.ค. ปีหน้า

    // 4. ดึงข้อมูลปฏิทิน
    var cal = CalendarApp.getCalendarById(calendarId);
    if (!cal) {
        SpreadsheetApp.getUi().alert('ไม่พบปฏิทิน! กรุณาตรวจสอบ Calendar ID');
        return;
    }

    var events = cal.getEvents(startDate, endDate);
    var data = [];

    // 5. จัดการข้อมูลเหตุการณ์
    for (var i = 0; i < events.length; i++) {
        var event = events[i];
        data.push([
            event.getStartTime(), // วันที่
            event.getTitle()      // ชื่อวันหยุด
        ]);
    }

    // 6. เรียงลำดับข้อมูลตามวันที่
    data.sort(function (a, b) {
        return a[0].getTime() - b[0].getTime();
    });

    // 7. เขียนข้อมูลลงใน Sheet
    if (data.length > 0) {
        sheet.getRange(2, 1, data.length, 2).setValues(data);
        // จัดรูปแบบคอลัมน์วันที่ (Column A)
        sheet.getRange(2, 1, data.length, 1).setNumberFormat('dd/mm/yyyy');
        sheet.autoResizeColumns(1, 2);
    }

    SpreadsheetApp.getUi().alert('ดึงข้อมูลวันหยุดสำเร็จแล้ว!');
}

/**
 * สร้างเมนูบน Google Sheet เพื่อให้กดรันโค้ดได้ง่ายขึ้น
 */
function onOpen() {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('เมนูเพิ่มเติม')
        .addItem('อัปเดตวันหยุด', 'importThaiHolidays')
        .addToUi();
}