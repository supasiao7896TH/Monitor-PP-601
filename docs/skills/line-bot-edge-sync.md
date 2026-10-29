---
name: line-bot-edge-sync
description: >
  Industrial Operations Automation Skill — ผสาน 4 ระบบ: LINE Messaging API Webhook
  + Cloudflare Workers & D1 (Serverless SQLite) + Real-Time Web Dashboard (Chart.js Dual Y-Axis / กะ)
  + Windows Background Excel Automation (PowerShell COM / Task Scheduler / ไดรฟ์เครือข่าย K:)
  รองรับเครื่อง Shared PC หลาย User (B/M 4 คน) และ 1-Click Setup สำหรับย้ายเครื่อง
  ใช้เมื่อพี่ A ต้องการสร้างระบบมอนิเตอร์เครื่องจักร, บอท LINE อ่านค่าหน้างานจาก F/O,
  เก็บสถิติลง D1/Firestore, หรือดึงข้อมูลคลาวด์ไปกรอก Excel ของโรงงานอัตโนมัติ
---

# LINE Bot Edge & Excel Sync — Supasit.A Skill

> **Scope:** Full-Stack Industrial IoT & Operations Automation Workflow
> **4 ประสาน:** LINE Messaging API ➔ Cloudflare Workers & D1 ➔ Web Dashboard ➔ Plant Excel File (Drive K:)
> **Brand:** A-Class WebCraft · Code • Share • Inspire · by Supasit.A
> **ต้นแบบ:** ระบบติดตามอุณหภูมิปั๊ม PP-601A/B/C (GC-M PTA นิคมฯ มาบตาพุด)

---

## ตัวอย่างประโยคสั่งงาน (Trigger Prompts)

```
"ช่วยสร้างระบบอ่านค่าจากกลุ่ม LINE ของหน้างาน แล้วคำนวณ Diff อัตโนมัติ บันทึกลง Cloudflare D1
และทำสคริปต์หยอดข้อมูลลง Excel กลางบนไดรฟ์ K: ให้หน่อยครับ"
```
```
"อยากตั้งค่า LINE Bot Webhook เชื่อมกับ Cloudflare Workers สำหรับอ่านข้อความจดค่าเครื่องจักร
พร้อมทำ Dashboard กราฟ 2 แกน และรองรับคอม B/M หลาย user ครับ"
```

---

## 🏛️ สถาปัตยกรรมภาพรวม (4-Tier Industrial Architecture)

```
[1. Field Operator หน้างาน]
      │
      │ พิมพ์ข้อความในกลุ่ม LINE (เช่น "22:00 A 125/77 C 128/94")
      ▼
[2. Cloudflare Edge (Worker + D1)]
      │ 1. ตรวจสอบ HMAC-SHA256 Signature ด้วย Web Crypto
      │ 2. ตัดคำด้วย Fault-Tolerant Regex แยก Slot, เครื่องจักร, อุณหภูมิ
      │ 3. คำนวณ Diff & ตรวจสอบ Alarm Threshold
      │ 4. บันทึกลง Cloudflare D1 (Serverless SQLite)
      │ 5. ตอบกลับยืนยันและแจ้งเตือนเข้ากลุ่ม LINE ทันที
      │
      ├─── REST API: GET/POST /api/readings
      │
      ▼
[3. Web Dashboard (B/M & วิศวกร)]
      │ • ดึงข้อมูลวาดกราฟ Dual Y-Axis (Chart.js) แสดง Temp & Diff
      │ • สรุปรายงานประจำกะ (เช้า 07:30–19:30 / ดึก 19:30–07:30)
      │ • ปุ่ม Export รูปรายงานส่งกลับเข้า LINE
      │
      ▼
[4. Office Shared PC (B/M 4 คน)]
        • Windows Task Scheduler รันทุก 30 นาทีในพื้นหลัง
        • ดึงข้อมูลจาก Cloudflare API หยอดลง Excel กลางบนไดรฟ์ K:\PE1\...
        • เขียนสูตร Diff, หยอดวันที่อัตโนมัติรอบ 01:00 น.
        • ติดตั้งใน C:\ProgramData\ เพื่อรองรับผู้ใช้หลายคน (Multi-User)
```

---

## § 1 · คู่มือตั้งค่า LINE Developers อย่างละเอียด (Step-by-Step)

> **ทำไมต้องใช้ LINE Developers Console?**
> LINE ทั่วไปทำได้แค่คุยแชต แต่เราต้องการให้โปรแกรม "อ่านข้อความดิบ ถอดรหัส แล้วคำนวณสูตร" จึงต้องเปิดโหมด **Messaging API**

### 1.1 สร้าง Messaging API Channel
1. เข้าไปที่ [developers.line.biz](https://developers.line.biz) แล้วล็อกอินด้วยบัญชี LINE
2. สร้าง **Provider** (เช่น `PTA1-Automation`)
3. เลือกสร้าง Channel ชนิด **"Messaging API"**
4. กรอกข้อมูล:
   - **Channel name:** ชื่อบอทที่คนจะเห็นในกลุ่ม (เช่น `Monitor PP-601`)
   - **Channel description:** รายละเอียดสั้นๆ
   - **Category / Subcategory:** เลือกตามสะดวก (เช่น Utilities)
5. กดยอมรับเงื่อนไข แล้วสร้าง Channel ให้เสร็จสิ้น

### 1.2 เก็บกุญแจสำคัญ 2 ดอก (Credentials)
- **Channel Secret (กุญแจลับ):**
  - อยู่ที่แท็บ **"Basic settings"** ➔ เลื่อนลงมาที่หัวข้อ **Channel secret**
  - *หน้าที่:* ใช้สำหรับคำนวณลายเซ็น HMAC-SHA256 ป้องกันคนแปลกหน้าส่งข้อมูลปลอมเข้ามา
- **Channel Access Token (ตั๋วสั่งการระยะยาว):**
  - อยู่ที่แท็บ **"Messaging API"** ➔ เลื่อนลงมาล่างสุดที่หัวข้อ **Channel access token**
  - กดปุ่ม **"Issue"** เพื่อสร้าง Long-lived Access Token
  - *หน้าที่:* ใช้แนบใน Header (`Bearer <Token>`) เวลาสั่งให้บอทพิมพ์ข้อความตอบกลับเข้ากลุ่ม

### 1.3 ตั้งค่า Webhook URL ชี้ไปยัง Cloudflare Worker
1. ในแท็บ **Messaging API** ➔ เลื่อนไปที่หัวข้อ **Webhook settings**
2. ใส่ **Webhook URL:** `https://<your-worker>.<subdomain>.workers.dev/api/line-webhook`
3. เปิดสวิตช์ **"Use webhook"** เป็น **Enabled (สีเขียว)**
4. *(อย่าเพิ่งกดปุ่ม Verify จนกว่าจะ Deploy โค้ด Worker บน Cloudflare เสร็จ)*

### 1.4 การตั้งค่าสำคัญบน LINE Official Account Manager (ห้ามลืมเด็ดขาด!)
คลิกลิงก์ **"LINE Official Account Manager"** (หรือเข้า [manager.line.biz](https://manager.line.biz)):
1. ไปที่เมนู **ตั้งค่า (Settings)** ➔ **การตอบข้อความ (Response settings)**:
   - **โหมดการตอบกลับ (Response mode):** เลือก **บอต (Bot)**
   - **ข้อความตอบกลับอัตโนมัติ (Auto-response messages):** ⚠️ **ต้องปิด (Disabled)** เสมอ (ถ้าเปิด บอทจะตอบข้อความสำเร็จรูปมากวน)
   - **ข้อความทักทายเพื่อนใหม่ (Greeting message):** แนะนำให้ปิด (Disabled)
2. ไปที่เมนู **ตั้งค่าบัญชี (Account settings)**:
   - **การเข้าร่วมแชตกลุ่มหรือหลายคน (Allow bot to join group chats):** ⚠️ **ต้องเปิด (Enabled)** มิฉะนั้นจะเชิญบอทเข้ากลุ่มไลน์งานไม่ได้!
3. **เชิญบอทเข้ากลุ่มงาน:** ค้นหาบอทด้วย Basic ID (เช่น `@964jzoqe`) แล้วดึงเข้ากลุ่มไลน์ของหน้างาน (เช่น `PTA1 work follow up`)

---

## § 2 · Cloudflare Worker & Webhook Verification (HMAC-SHA256)

> ใช้ Web Crypto API มาตรฐาน (`crypto.subtle`) ของ Cloudflare Workers โดยไม่ต้องลง npm package เพิ่มเติม

```javascript
// src/modules/line-parser.js
export async function verifyLineSignature(bodyText, signatureHeader, channelSecret) {
  if (!signatureHeader || !channelSecret) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(bodyText));
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  const calculatedSignature = btoa(String.fromCharCode.apply(null, hashArray));
  return calculatedSignature === signatureHeader;
}
```

### การตั้งค่า Secret บน Cloudflare Workers
ห้าม Hardcode Secret ในโค้ดเด็ดขาด ให้รันคำสั่งผ่าน Wrangler CLI:
```bash
npx wrangler secret put LINE_CHANNEL_SECRET
# วาง Channel Secret แล้วกด Enter

npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
# วาง Channel Access Token แล้วกด Enter
```

---

## § 3 · Fault-Tolerant Regex สำหรับข้อความหน้างาน

หน้างานมักพิมพ์ด้วยความเร่งรีบ เช่น:
- `22:00 A 125/77 C 128/94`
- `รอบ 01:00 น. PP-601A temp 120/75 B 118/72`
- `TG 108/65` หรือ `A 125/77`

### Regex กลางที่รองรับทุกรูปแบบ:
```javascript
// จับคู่ Slot (A/B/C) + เวลาในบรรทัด (ถ้ามี) + อุณหภูมิเข้า/ออก (Inlet/Outlet)
const pumpPattern = /(?:PP[- ]?601\s*|\b)([ABC])\b[\s:=]*(?:\d{1,2}[:.]\d{2}(?:\s*(?:น\.?|hrs?))?)?[\s:=]*(?:(?:temp(?:\s*gauge)?|TG(?:-\d{4})?)\s*[:=]?\s*|\s*)(\d{2,3}(?:\.\d+)?)\s*[/]\s*(\d{2,3}(?:\.\d+)?)/gi;

// ตัวอย่างการสกัดค่า:
let match;
while ((match = pumpPattern.exec(cleanText)) !== null) {
  const slot = match[1].toUpperCase();     // 'A'
  const tgInlet = parseFloat(match[2]);    // 125.0
  const tgOutlet = parseFloat(match[3]);   // 77.0
  const diff = tgInlet - tgOutlet;         // 48.0
}
```

---

## § 4 · Cloudflare D1 Database (Edge SQLite)

### 4.1 สร้างฐานข้อมูล D1
```bash
npx wrangler d1 create pp601-db
# นำ database_id ไปใส่ใน wrangler.jsonc
```

### 4.2 โครงสร้างตาราง (`schema.sql`)
```sql
CREATE TABLE IF NOT EXISTS readings (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL,      -- เช่น PP-601A
  slot TEXT NOT NULL,              -- A, B, หรือ C
  status TEXT NOT NULL,            -- RUN, STANDBY, STOP
  tg3602 REAL NOT NULL,            -- Inlet Temp
  tg3603 REAL NOT NULL,            -- Outlet Temp
  diff REAL NOT NULL,              -- tg3602 - tg3603
  timestamp INTEGER NOT NULL,      -- Epoch ms
  slot_time TEXT NOT NULL,         -- '22:00', '01:00', etc.
  recorder TEXT,                   -- ชื่อผู้จด / F/O
  source TEXT DEFAULT 'line',      -- 'line' หรือ 'web'
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_readings_equip_time ON readings(equipment_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_readings_timestamp ON readings(timestamp);
```

รันสร้างตารางบน Cloudflare จริง:
```bash
npx wrangler d1 execute pp601-db --remote --file=./schema.sql
```

---

## § 5 · Windows PowerShell Background Automation (Excel COM)

> หัวใจของสคริปต์ Sync เข้า Excel กลางโรงงาน โดยไม่ทำให้ไฟล์ล็อกและไม่กวนหน้าจอผู้ใช้

### จุดตายสำคัญที่ต้องจำ (COM Object Clean Release):
หากไม่สั่ง Release COM Object เมื่อสคริปต์จบ โพรเซส `excel.exe` จะค้างอยู่ใน background และทิ้งไฟล์ `~$Monitor...xlsx` ไว้ ทำให้เปิดไฟล์ครั้งต่อไปติด Read-Only ทันที!

### โค้ดต้นแบบ `sync-excel.ps1`:
```powershell
# scripts/sync-excel.ps1
$ErrorActionPreference = "Stop"
$excelPath = "K:\PE1\Daily report PTA1\Monitor temp pump PP-601.xlsx"
$apiUrl = "https://monitor-pp-601.supasiao.workers.dev/api/readings"

# 1. สำรองไฟล์อัตโนมัติก่อนเขียน
Copy-Item $excelPath "$excelPath.bak_auto" -Force

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $null
$ws = $null

try {
    $wb = $excel.Workbooks.Open($excelPath, $false, $false)
    $ws = $wb.Sheets.Item(1)

    # ดึงข้อมูลจาก Cloudflare API
    $data = Invoke-RestMethod -Uri $apiUrl -Method Get

    # วนลูปกรอกค่าลงตาราง และใส่สูตร Diff
    # เช่น $ws.Cells.Item($row, 3).Value2 = $tg3602
    #     $ws.Cells.Item($row, 5).Formula = "=C$row-D$row"

    # บันทึกไฟล์
    $wb.Save()
}
finally {
    if ($ws) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws) | Out-Null; $ws = $null }
    if ($wb) { $wb.Close($false); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) | Out-Null; $wb = $null }
    if ($excel) { $excel.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null; $excel = $null }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
```

---

## § 6 · Multi-User & Shared PC Architecture

ในโรงงาน B/M มักผลัดเวรกันใช้งานเครื่องเดียวกัน (4 คน สลับกะ 4 User Domain):
1. **ห้ามวางสคริปต์ในโฟลเดอร์ User Profile:** ห้ามใช้ `C:\Users\Username\...` เพราะ User อื่นจะไม่มีสิทธิ์เปิด
2. **ใช้โฟลเดอร์ระบบกลาง `C:\ProgramData\<Project>`:**
   - เป็น Shared Space ที่ทุก Local/Domain User มีสิทธิ์อ่านและรันสคริปต์ได้โดยไม่ต้องมี Admin
3. **ตั้ง Task Scheduler ระดับระบบ:**
   - รันคำสั่ง PowerShell ทุก 30 นาที
   - ติ๊ก `StartWhenAvailable` และ `AllowStartIfOnBatteries`
4. **กฎความปลอดภัยเครือข่ายองค์กร (FSRM Policy):**
   - **ห้าม** วางไฟล์ Script (`.ps1`, `.bat`) บน Network Drive (`K:\`, `\\server\share`) เด็ดขาด เพราะระบบ File Screening Management (FSRM) ของ Windows Server จะจัดเป็น "Executable Files" และบล็อกพร้อมส่ง Alert อีเมล
   - วางเฉพาะไฟล์ `.xlsx` (Data) บน Network Drive และเก็บ Script ทั้งหมดไว้บน Local Disk `C:\` เสมอ

### 1-Click Setup Template (`scripts/setup-new-pc.ps1`)
เมื่อเปลี่ยนเครื่องใหม่ ให้รันสคริปต์นี้เพียงครั้งเดียว:
1. สร้างโฟลเดอร์ `C:\ProgramData\PP601-Monitor`
2. ก๊อปปี้ `sync-excel.ps1` เข้าโฟลเดอร์กลาง
3. ลงทะเบียน Task Scheduler `PP601-Excel-Sync` (Interval 30 นาที)
4. สร้าง Shortcut `Sync PP-601 Excel.bat` และ `PP-601 Monitor WebApp.url` บน Desktop

---

## § 7 · Common Pitfalls & Troubleshooting (ประสบการณ์จริง)

| ปัญหาที่พบ | สาเหตุ | วิธีแก้ไข |
|---|---|---|
| **LINE Webhook กด Verify ไม่ผ่าน** | Cloudflare Worker ยังไม่ได้ Return HTTP 200 ตอนเจอกรณี Body ว่าง หรือยังไม่ได้กรอก Secret | ให้ Return `200 OK` เสมอแม้ไม่มี event และตั้ง Secret ให้ครบก่อนกด Verify |
| **ไฟล์ Excel ติด Read-Only ตลอดเวลา** | มี Background `excel.exe` ค้างเปิดไฟล์ `~$...` ล็อกอยู่ | รัน `Stop-Process -Name excel -Force` และตรวจเช็คบล็อก `finally` ให้มี `ReleaseComObject` ครบ |
| **สคริปต์บนไดรฟ์ K:\ สั่งรันไม่ได้** | Network Share มี File Screening บล็อกไฟล์ `.ps1` และ `.bat` | รันสคริปต์จาก Local Drive `C:\ProgramData\` เท่านั้น โดยให้สคริปต์เปิดอ่านเขียนไฟล์ `.xlsx` ข้ามเน็ตเวิร์ก |
| **PowerShell 5.1 Syntax Error** | ใช้ Null-conditional operator (`?.`) ซึ่งยังไม่มีใน PS 5.1 | ใช้คำสั่งตรวจสอบแบบเดิม เช่น `if ($obj.ContainsKey('key'))` แทน |
| **วันที่ใน Excel ขึ้นตัวเลขประหลาด** | Excel เก็บวันที่เป็น OADate Serial Number | ใช้วิธีแปลงวันที่ผ่าน `[DateTime]::ToOADate()` พร้อมจัดรูปแบบคอลัมน์เป็น `dd/mm/yyyy` |
