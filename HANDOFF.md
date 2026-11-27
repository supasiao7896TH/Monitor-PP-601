# HANDOFF.md — PP-601 Monitor (ส่งต่องาน มือถือ → PC บ้าน / PC เครื่องใหม่)

อัปเดต: 2026-11-27 (แก้ sync เงียบ/PI หาย/Excel ไม่เติม + Per-User Task สำหรับ PC ใช้ร่วม) · Branch: `main` · Unit Tests 97 ข้อผ่าน 100%

## 🆕 2026-11-27 — แก้ปัญหา "หน้าเว็บไม่มีค่า B · Excel ไม่เติม · หน้าต่างกระพริบ"
**Root cause:** โฟลเดอร์เก่า `C:\PP601-Monitor\` (สคริปต์ 4 พ.ย. ไม่มี PI auto-pull) ยังค้างอยู่ และ `Setup-PP601-For-My-Login.bat`/`setup-user.ps1` เลือกโฟลเดอร์นี้ก่อน → กด setup เมื่อ 2026-11-26 18:41 ได้ task แบบเก่า (`powershell -WindowStyle Hidden` → กระพริบทุก 5 นาที, TI-2610B ไม่ขึ้น D1) + Auto-Extend ใน `sync-excel.ps1` ตัวใหม่ crash (`$null` → COM) ทำให้ Excel ไม่ถูกเขียนเมื่อ template เหลือ <7 วัน

| Commit | สิ่งที่แก้ |
|---|---|
| `af7a6c9` | setup ใช้ `C:\ProgramData\PP601-Monitor` อย่างเดียว + copy ทับทุกครั้ง · Auto-Extend ใช้ `ClearContents()` · แก้ `"A${newRow}:M${newRow}"` · แถวที่งอกใหม่เว้น Diff ว่าง (ไม่ใช่ `=C-D` ที่โชว์ 0) |
| `57cdec5` | `CLAUDE.md` Domain: PP-601B in = TG-2602B (LINE), out = TI-2610B (PI) — ปั๊มคนละ type, Diff ติดลบเป็นปกติ ห้ามแก้สูตร |
| `4bc7f9f` | **Per-User Task** `PP601-Excel-Sync (<username>)` (logon + ทุก 5 นาที) ผ่าน helper `scripts/pp601-task.ps1` + mutex `Global\PP601-Excel-Sync` กันหลาย session เปิด Excel พร้อมกัน |
| `c65a493` | `scripts/Sync-PP601-Excel.bat` ใน ProgramData สำหรับ Hyperlink จาก Excel logbook |
| `62e6bcb` | แก้ตามผล `/code-review 069a0fc..c65a493` (session ใหม่): exit code 0/1/2 + bat แสดง `[OK]`/`[NOT SYNCED]`/`[FAILED]` · Auto-Extend เขียนสูตร Diff `=IF(AND(ISNUMBER..)),..,"")` (เติมให้แถว 787–1034 ในไฟล์จริงแล้ว) · `Install-PP601SharedFiles` รวมรายชื่อไฟล์จุดเดียว copy เฉพาะที่เปลี่ยน · bat บน Desktop เรียก bat กลาง (แก้ `echo … -> K:\…` ที่ redirect สร้างไฟล์ขยะบน K:) |

**ผล code review (8 ข้อ):** แก้แล้ว 7 ข้อ · ข้อ "AtLogOn ต้องใช้ admin" **ไม่จริง** (พิสูจน์ด้วย account non-admin ของ 26007294) · **ปฏิเสธ** ข้อเสนอให้ `BUILTIN\Users` สิทธิ์ Modify บน `C:\ProgramData\PP601-Monitor` เพราะ user ใดก็แก้สคริปต์ที่รันในชื่อ user อื่นได้ (คงไว้ที่ Users = RX) · ไม่เปลี่ยน `run-silent.vbs` เป็นรอผล เพราะ mutex กันรันซ้อนอยู่แล้ว

**ทำบนเครื่อง Control Room แล้ว:** rename `C:\PP601-Monitor` → `C:\PP601-Monitor.old` (ยังไม่ลบ) · ลบ task ชื่อเก่า `PP601-Excel-Sync` · backfill TI-2610B 2026-11-26 19:00 → 2026-11-27 07:00 ขึ้น D1 + Excel · Template งอกถึง 2026-12-31 (Row 1034)

**Hyperlink สำหรับ Excel logbook (ใช้ได้เฉพาะ PC Control Room):**
- `=HYPERLINK("C:\ProgramData\PP601-Monitor\Setup-PP601-For-My-Login.bat", "⚙️ Setup PP-601 Auto-Sync (กดครั้งเดียวต่อ user · เฉพาะ PC Control Room)")`
- `=HYPERLINK("C:\ProgramData\PP601-Monitor\Sync-PP601-Excel.bat", "🔄 Sync PP-601 → Excel ทันที (เฉพาะ PC Control Room)")`
- `=HYPERLINK("C:\ProgramData\PP601-Monitor\", "📁 เปิดโฟลเดอร์ PP-601 Monitor (เฉพาะ PC Control Room)")`

### ⏳ งานค้าง
- [ ] B/M คนอื่น (26007490, 26007495, 26009291) กด `Setup-PP601-For-My-Login.bat` คนละ 1 ครั้ง แล้วกด `Sync-PP601-Excel.bat` เช็คว่าขึ้น `Connected to PI Server` และเข้า K: ได้ (ยังไม่ยืนยันสิทธิ์ PI/K: ของแต่ละคน)
- [x] `/code-review 069a0fc..c65a493` ใน session ใหม่ — เสร็จ 2026-11-27 แก้ใน `62e6bcb`
- [ ] (ไม่บังคับ) `/code-review 411d8ef..62e6bcb` ใน session ใหม่ เพื่อตรวจรอบแก้
- [ ] B/M คนอื่นทดสอบจริง: setup ผ่านด้วย account ตัวเอง (ส่วน copy ไฟล์/สิทธิ์ยังไม่ได้ทดสอบกับ user อื่น)
- [ ] ข้อจำกัด: ไม่มีใคร login = ไม่มี sync (พอมีคน login จะ backfill เอง) · Excel Bridge (Plant Log Analyzer) ยัง auto-start เฉพาะ 26007294
- [ ] ลบ `C:\PP601-Monitor.old` เมื่อมั่นใจว่าไม่ต้องใช้แล้ว
- [ ] ตรวจหน้างาน: ตำแหน่ง TG-2602B เทียบ TI-2610B บน P&ID ของ PP-601B (Diff ติดลบ) — ห้ามแก้สูตรจนกว่าพี่ A สั่ง

## สถานะ
| ส่วน | สถานะ |
|---|---|
| Zero-Flash Background Sync Runner | ✅ Task Scheduler รัน `run-silent.vbs` (wscript.exe) ทุก 5 นาที เงียบสนิท — ⚠️ ถ้ากลับมากระพริบ ให้เช็ค Action ของ task ว่าไม่ใช่ `powershell.exe` ตรงๆ (แก้ 2026-11-27) |
| Multi-User Shared PC (Per-User Task) | ✅ 2026-11-27 แต่ละ login มี task ของตัวเอง `PP601-Excel-Sync (<username>)` + mutex กันชน — ตอนนี้ setup แล้วเฉพาะ 26007294 |
| Auto-Void on Clear & Cloud Sync | ✅ เสร็จสมบูรณ์ เมื่อลบค่าออกและกดบันทึก ระบบจะ Auto-Void และซิงก์สถานะ `voided` ขึ้น D1 ทันที หน้าจอมอนิเตอร์ตัดค่าออก Real-time |
| Shift Batch Grid Entry (กรอกทั้งกะ) | ✅ เพิ่มโหมด "📋 กรอกทั้งกะ" พร้อมปุ่มเลื่อนกะ ‹ › ย้อนหลังได้อิสระไม่จำกัด กรอกรวดเดียว 4-8 ค่าแบบ Excel แล้วเซฟครั้งเดียว |
| PP-601B Dual-Source & PI Auto-Pull | ✅ **Decoupled Cloud-First & Smart Backfill** ดึงค่า `TI-2610B` จาก PI `\\gcmppisvr\1-pTA.2M.1TI2610B.PV` ขึ้น D1 ก่อนเสมอแม้ Excel ติด Lock + Smart Backfill อัตโนมัติทุก Slot ที่ค่าว่าง |
| หน้าจอ Dashboard สำหรับ PC (Control Room Widescreen) | ✅ เสร็จ 3-Column Header Grid + ตาราง Full-Width + กราฟแนวโน้มเต็มจอ + **Auto-Polling ทุก 60 วินาที** (อัปเดตเองไม่ง้อเมาส์) |
| Web Bundle Optimization | ✅ **ลดขนาด Bundle จาก 838 kB เหลือ 214 kB (-74%)** ด้วย Dynamic Import Firebase |
| กราฟความละเอียดสูง (Dual Y-Axis, Dynamic Zoom, 320px) | ✅ เสร็จ กราฟ Widescreen บน PC พร้อมปุ่มเลือก 24 ชม. (8 รอบ) / 48 ชม. / 7 วัน + แสดงค่าล่าสุด |
| Unit Tests (Vitest) | ✅ **97 ข้อผ่าน 100%** (เพิ่ม 3 เทสต์ใหม่สำหรับ D1 voided sync & local-repo) |
| Cloudflare D1 Database (`pp601-db`) | ✅ ครบ 3 ตาราง: `readings`, `app_state` (status/limits), และ `events` (ไทม์ไลน์สลับปั๊ม/งานล้าง) ซิงก์ข้ามเครื่อง 100% |
| LINE Bot Webhook & Interactive Commands | ✅ รองรับบันทึกอุณหภูมิ + **คำสั่งพิเศษ `status`, `สรุป`, `help`** ตอบสถานะปั๊ม 3 ตัวทันทีใน LINE |
| ซิงก์อัตโนมัติ LINE ➔ D1 ➔ หน้าเว็บ | ✅ เสร็จสมบูรณ์ เมื่อ F/O ส่งใน LINE บอทเซฟลง D1 และหน้าเว็บดึงมาวาดกราฟอัตโนมัติ |
| กรอกค่าลง Excel ไดรฟ์ K: อัตโนมัติ | ✅ ทำงานผ่าน Task Scheduler + **Auto-Extend Template Engine (งอกเดือนถัดไปอัตโนมัติเมื่อเหลือ <7 วัน)** + Zero-Maintenance ไม่ต้องลากแถวมืออีกต่อไป |
| Deploy Cloudflare Workers | ✅ Deploy เวอร์ชันใหม่สำเร็จแล้วที่ `https://monitor-pp-601.supasiao.workers.dev` (Version ID: `a45b202a...`) |
| Excel Hyperlink Shortcut | ✅ สูตร `=HYPERLINK("https://monitor-pp-601.supasiao.workers.dev", "🌐 เปิดระบบ Monitor PP-601")` สำหรับเปิด Web App จากในชีต |
| Industrial Skill Documentation | ✅ สรุปและถอดองค์ความรู้เป็น Skill `line-bot-edge-sync` พร้อมสำเนาไว้ที่ `docs/skills/line-bot-edge-sync.md` |
| DCS & PI AF SDK Automation Guide | ✅ บันทึกคู่มือและแม่แบบโค้ดมาตรฐานสำหรับดึงค่า DCS ผ่าน PI AF SDK ไว้ที่ [`docs/dcs-pi-monitoring-guide.md`](file:///C:/Users/26007294/A(i)CODER2025TH/Monitor-PP-601/docs/dcs-pi-monitoring-guide.md) สำหรับใช้ต่อยอดโปรเจกต์มอนิเตอร์ในอนาคต |

---

## 💻 คู่มือย้ายไป PC เครื่องใหม่ (Transition Checklist for New PC — 30 ต.ค. 2569)

### ข่าวดี: ระบบส่วนใหญ่รันอยู่บน Cloud 100% (ไม่หายเมื่อเปลี่ยนเครื่อง)
1. **LINE Bot + Cloudflare Worker + D1 Database:** ทำงานอยู่บน Cloudflare Edge 24 ชม. ตลอดชีพ F/O ส่งค่าใน LINE ระบบก็ยังอ่านและเซฟลงฐานข้อมูลได้ตามปกติ แม้ยังไม่ได้เปิด PC เครื่องใหม่
2. **หน้าเว็บ PP-601 Monitor:** เปิดใช้งานได้ทันทีจากเครื่องใหม่หรือมือถือที่ [https://monitor-pp-601.supasiao.workers.dev](https://monitor-pp-601.supasiao.workers.dev)
3. **ไฟล์ Excel ไดรฟ์ K:** `K:\PE1\Daily report PTA1\Monitor temp pump PP-601.xlsx` อยู่บน Server กลางของ GC-M PTA ไม่หายไปกับเครื่องเดิม

### ขั้นตอนตั้งค่าบน PC เครื่องใหม่ (ใช้เวลาเพียง 1 นาที):
1. **นำโฟลเดอร์โปรเจกต์มาวางที่เครื่องใหม่:**
   ```bash
   git clone https://github.com/supasiao7896TH/Monitor-PP-601.git
   ```
   (หรือก๊อปปี้โฟลเดอร์ `Monitior PP-601` จาก OneDrive มาวางในเครื่องใหม่)
2. **รันสคริปต์ 1-Click Setup:**
   * คลิกขวาที่ไฟล์ [`scripts/setup-new-pc.ps1`](file:///C:/Users/26007294/A(i)CODER2025TH/Monitior%20PP-601/scripts/setup-new-pc.ps1) แล้วเลือก **"Run with PowerShell"**
   * สคริปต์จะ:
     * ตรวจสอบการเชื่อมต่อไดรฟ์ `K:` และ Cloudflare API
     * ลงทะเบียน Windows Task Scheduler **รายคน** (`PP601-Excel-Sync (<username>)`) รันตอน login + ทุก 5 นาที (ทันใจก่อนออกกะ 07:30 / 19:30)
     * **PC ใช้ร่วมหลาย login:** B/M แต่ละคนต้องกด `C:\ProgramData\PP601-Monitor\Setup-PP601-For-My-Login.bat` คนละ 1 ครั้ง (task รันเฉพาะตอนเจ้าของ login อยู่ · หลาย session รันพร้อมกันกันด้วย mutex `Global\PP601-Excel-Sync`) — แก้ 2026-11-27 จากเดิมชื่อ task เดียวกันทุกคน ใครกด setup คนสุดท้ายได้ใช้คนเดียว
     * สร้าง Shortcut `Sync PP-601 Excel.bat` บนหน้าจอ Desktop ของเครื่องใหม่ให้ทันที!
3. **เสร็จสิ้น 100%!** ระบบจะกลับมาทำงานอัตโนมัติเหมือนเครื่องเดิมทุกประการค่ะ

## ข้อตกลงกับพี่ A (ยืนยันแล้ว)
- ใช้บนมือถือ · หลายคน real-time · **ไม่มี login** (ใช้ Anonymous Auth เบื้องหลัง + ชื่อผู้จด)
- slot 22/01/04/07/10/13/16/19 น. · กะเช้า 07:30–19:30 / กะดึก 19:30–07:30 · RUN 2 / STANDBY 1
- จุดจด: TG-3602 (oil in), TG-3603 (oil out) · Diff = 3602−3603
- **TG-3603 ต้องมากกว่า 70** (ยืนยัน) · **Diff ≥ 20 ยืนยันจากเส้นกราฟ Excel แล้ว**
- F/O จดค่า (หรือพิมพ์ใน LINE กลุ่ม), B/M ส่งรายงานเข้า LINE ตอนออกกะ · deploy ด้วย Cloudflare Workers

## ขั้นตอนต่อที่ PC บ้าน
```bash
git clone https://github.com/supasiao7896TH/Monitor-PP-601.git
cd Monitor-PP-601 && git checkout ccr-47fd6ef2-ms36mm
npm ci && npm test && npm run dev     # Node 22+
```

### สิ่งที่พี่ A ต้องทำเอง (AI ทำแทนไม่ได้)
1. **Firebase**: console.firebase.google.com → สร้าง project → เพิ่ม Web app → วาง `firebaseConfig` ใน `src/firebase-config.js` → เปิด Firestore → เปิด Authentication → Anonymous → deploy rules: `npx firebase-tools deploy --only firestore:rules --project <PROJECT_ID>`
2. **Cloudflare**: สร้าง API Token สิทธิ์ "Edit Cloudflare Workers" เท่านั้น → ตั้ง GitHub Secret `CLOUDFLARE_API_TOKEN` (ถ้ามีหลาย account ให้เพิ่ม `account_id` ใน `wrangler.jsonc`)
3. **LINE Official Account (Bot)**:
   - เข้า [developers.line.biz](https://developers.line.biz) → สร้าง Messaging API Channel
   - เปิดสิทธิ์ "Allow bot to join group chats"
   - นำ Webhook URL: `https://<WORKER_NAME>.<SUBDOMAIN>.workers.dev/api/line-webhook` ไปใส่ใน LINE Developers Console
   - ตั้ง Secret บน Cloudflare Dashboard หรือ wrangler: `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`
   - เชิญบอทเข้ากลุ่ม `PTA1 work follow up`

## แผนที่โค้ด
- `src/modules/shift-logic.js` logic ล้วน (เวลาไทย UTC+7 คงที่) · `tests/shift-logic.test.js`
- `src/modules/excel-parser.js` สกัด/ตรวจข้อมูล Excel · `tests/import-excel.test.js`
- `src/modules/line-parser.js` ถอดรหัสข้อความแชต LINE + ยืนยัน HMAC-SHA256 · `tests/line-parser.test.js`
- `src/worker.js` Cloudflare Worker ให้บริการ SPA + LINE Webhook API
- `src/views/` record · report · history · settings · `src/main.js` routing
- `firestore.rules` · `wrangler.jsonc` · `.github/workflows/ci.yml` · `CLAUDE.md` · `context.md` · `agents.md`
