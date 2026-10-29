# แนวทางการตอบอีเมล IT / Security Response Guide

> **หัวข้อเหตุการณ์:** ระบบ File Screening (FSRM) แจ้งเตือนการบันทึกไฟล์ประเภท "Executable Files" (`scripts\sync-excel.ps1`) บน Server Share (`D:\GCMSection\PE1\Daily report PTA1\...`)  
> **ผู้ใช้งาน:** PTTGC\26007294 (Supasit.A - Process/Production Engineer, PE1 GC-M PTA)  
> **วันที่บันทึก:** 29 ตุลาคม 2026  
> **สถานะปัจจุบัน:** ✅ ดำเนินการตรวจสอบและแก้ไขเรียบร้อยแล้ว ไม่มีไฟล์ Script บน Server Share

---

## 1. ข้อความตอบกลับอีเมล IT (Email Response Template)

หากทีม IT Security / IT Helpdesk มีการติดต่อสอบถามเกี่ยวกับ Alert ดังกล่าว พี่ A สามารถ Copy ข้อความด้านล่างนี้ตอบกลับได้ทันทีค่ะ:

### แบบที่ 1: ภาษาไทย (ทางการและกระชับ - แนะนำ)

```text
เรียน ทีม IT / IT Security

ได้รับทราบการแจ้งเตือนจากระบบ File Screening เรียบร้อยแล้วครับ

ขอเรียนชี้แจงรายละเอียดดังนี้ครับ:
1. วัตถุประสงค์ของไฟล์:
   ไฟล์ sync-excel.ps1 เป็น PowerShell Script ที่พัฒนาขึ้นสำหรับงาน Operational Automation ภายในหน่วยงาน PE1 เพื่อดึงค่าอุณหภูมิเครื่องจักร Hot Oil Pump (PP-601) จาก Cloudflare API มาบันทึกลงไฟล์ Excel สรุปประจำวัน (Monitor temp pump PP-601.xlsx) โดยอัตโนมัติ

2. สาเหตุที่เกิดการแจ้งเตือน:
   เกิดจากความเข้าใจผิดระหว่างการสำรองโฟลเดอร์โปรเจกต์งาน แล้วเผลอคัดลอกโฟลเดอร์ scripts ที่มีไฟล์ .ps1 ติดขึ้นไปบน Network Share (D:\GCMSection\PE1\Daily report PTA1\) ระบบจึงตรวจจับและบล็อกตามนโยบาย Executable Files

3. การดำเนินการแก้ไขและป้องกัน (CAPA):
   - ตรวจสอบ Network Share เรียบร้อยแล้ว: ยืนยันว่าไม่มีไฟล์ .ps1 หลงเหลือหรือถูกบันทึกค้างไว้บน Server Share
   - ปรับปรุงโครงสร้างการทำงาน: ย้ายการจัดเก็บและรันสคริปต์ทั้งหมดมาไว้บน Local Drive (C:\ProgramData\PP601-Monitor\) ของเครื่องไคลเอนต์เท่านั้น โดยให้สคริปต์อ่าน/เขียนเฉพาะไฟล์ข้อมูล (.xlsx) บนไดรฟ์ K: ผ่าน Excel COM Object
   - เพิ่ม Security Guard ในตัวสคริปต์: หากมีการเรียกสั่งรันจาก Network Share สคริปต์จะปฏิเสธการทำงานและ Terminate ทันที

ขออภัยในความไม่สะดวกที่เกิดขึ้น และขอบคุณทีมงาน IT ที่ช่วยดูแลความปลอดภัยของระบบครับ

ขอแสดงความนับถือ
ศุภสิทธิ์ (PE1 GC-M PTA)
โทร: [เบอร์ติดต่อภายใน]
```

---

### แบบที่ 2: ภาษาอังกฤษ (Formal English - สำหรับระบบ Ticket หรือ Global IT)

```text
Dear IT / Security Team,

Thank you for bringing this alert to my attention.

Regarding the alert on "Executable Files" detection (sync-excel.ps1) under D:\GCMSection\PE1\Daily report PTA1\:

1. Purpose of the Script:
   The script is an internal automation tool for the PE1 production unit (GC-M PTA). It is designed to automatically fetch hourly temperature telemetry data for hot oil pumps (PP-601) via an HTTPS REST API and update the department daily Excel report (Monitor temp pump PP-601.xlsx) via local Excel COM automation.

2. Incident Root Cause:
   During project folder synchronization, the "scripts" folder containing the PowerShell script was inadvertently copied toward the departmental shared drive, which rightly triggered the Windows Server FSRM File Screening policy.

3. Corrective & Preventive Actions:
   - Verified that no .ps1 or executable files reside on the network share (the write operation was blocked and cleared).
   - The automation architecture has been strictly isolated: the script is installed and executed solely on the local client machine (under C:\ProgramData\PP601-Monitor\), updating only the target .xlsx file over the network.
   - Implemented an internal execution guard within the script to immediately abort if executed from any mapped or UNC network drive.

Please let me know if you require any further information or code inspection.

Best regards,
Supasit A.
Process Engineer, PE1 (GC-M PTA)
PTT Global Chemical PLC
```

---

## 2. ข้อมูลเชิงเทคนิคสำหรับตอบข้อซักถาม (Technical White-Paper for IT Audit)

หาก IT ขอตรวจสอบโค้ดหรือสอบถามความปลอดภัยเชิงลึก:

| หัวข้อ | รายละเอียดทางเทคนิค |
| :--- | :--- |
| **ชื่อไฟล์** | `sync-excel.ps1` |
| **เทคโนโลยี** | Windows PowerShell 5.1+ / Microsoft Excel COM Interop |
| **เครื่องที่รัน** | Local Client PC ของวิศวกร / Boardman (ไม่ใช่ Server) |
| **การเชื่อมต่อภายนอก (Outbound)** | เฉพาะ HTTPS GET ไปยัง Endpoint ที่กำหนดไว้เท่านั้น: `https://monitor-pp-601.supasiao.workers.dev/api/readings` (TLS 1.3) เพื่อดึง JSON data |
| **การเชื่อมต่อเครือข่ายภายใน** | เข้าถึงเฉพาะไฟล์ปลายทาง `K:\PE1\Daily report PTA1\Monitor temp pump PP-601.xlsx` (เปิด, แก้ไขเซลล์, บันทึก, และ Quit COM Object) |
| **สิทธิ์ที่ใช้รัน (Privilege)** | สิทธิ์ Standard User / Local Scheduled Task — ไม่ต้องการ Admin หรือสิทธิ์ยกระดับ (Elevation) |
| **การจัดการความปลอดภัย** | - มี Checksum / Verification<br>- ปิดกั้นการรันบน Network Share ด้วย `$PSScriptRoot` Regex Guard |

---

## 3. สรุปผลการตรวจสอบหน้างานจริง (Inspection Checklist)

- [x] ตรวจสอบไดรฟ์ `K:\PE1\Daily report PTA1\`: ไม่พบโฟลเดอร์ `scripts` หรือไฟล์ `.ps1` ใดๆ
- [x] ตรวจสอบ `C:\ProgramData\PP601-Monitor\sync-excel.ps1`: ติดตั้งบนเครื่อง Local เรียบร้อย
- [x] ตรวจสอบ Windows Task Scheduler `PP601-Excel-Sync`: รันจาก Local Path `C:\ProgramData\...`
- [x] เพิ่ม Security Guard ใน `sync-excel.ps1` และ `setup-new-pc.ps1`
- [x] อัปเดตคู่มือติดตั้งและ README ป้องกันการคัดลอกไฟล์ขึ้น Server Share ซ้ำ
