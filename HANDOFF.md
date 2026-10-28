# HANDOFF.md — PP-601 Monitor (ส่งต่องาน มือถือ → PC บ้าน / PC เครื่องใหม่)

อัปเดต: 2026-10-29 · Branch: `main` · Unit Tests 75 ข้อผ่าน 100%

## สถานะ
| ส่วน | สถานะ |
|---|---|
| หน้าจอ 4 แท็บ (จด / รายงานกะ / ประวัติ / ตั้งค่า) | ✅ เสร็จ ทดสอบใน Chromium มือถือ 390px |
| กราฟความละเอียดสูง (Dual Y-Axis, Dynamic Zoom, 220px) | ✅ เสร็จ มีปุ่มเลือก 24 ชม. (8 รอบ) / 48 ชม. / 7 วัน + แสดงค่าล่าสุด |
| `shift-logic`, `import-excel`, `line-parser`, `worker-d1` unit test | ✅ 75 ข้อผ่าน (เขียนแดงก่อน แล้วทำเขียว) |
| นำเข้าประวัติข้อมูลจาก Excel | ✅ เสร็จ สกัด 1,003 unique readings + 12 events จาก Excel รองรับทั้ง LocalStorage และ Firestore |
| LINE Bot Webhook Parser & Worker | ✅ เขียนแล้วและ Deploy ขึ้น Cloudflare Workers พร้อมตั้ง `LINE_CHANNEL_SECRET` + `LINE_CHANNEL_ACCESS_TOKEN` เรียบร้อย |
| Cloudflare D1 Database (`pp601-db`) | ✅ สร้างตาราง `readings` + Indexes + ผูก binding `env.DB` + มี API `/api/readings` (GET/POST) |
| ซิงก์อัตโนมัติ LINE ➔ D1 ➔ หน้าเว็บ | ✅ เสร็จสมบูรณ์ เมื่อ F/O ส่งใน LINE บอทเซฟลง D1 และหน้าเว็บดึงมาวาดกราฟอัตโนมัติ |
| กรอกค่าลง Excel ไดรฟ์ K: อัตโนมัติ | ✅ ทำงานผ่าน Windows Task Scheduler `PP601-Excel-Sync` (รันเบื้องหลังทุก 30 นาที) + Shortcut บน Desktop |
| ปุ่มบันทึกรายงานเป็นรูป | ✅ ทดสอบโหมดดาวน์โหลดแล้ว · ❌ ยังไม่ทดสอบแชร์เข้า LINE บนมือถือจริง |
| Firebase (Firestore + Anonymous Auth) | ⚠️ ทางเลือกสำรอง (ปัจจุบันใช้ Cloudflare D1 เป็นหลัก ฟรีและครบวงจรในตัว) |
| Deploy Cloudflare Workers | ✅ Deploy สำเร็จแล้วที่ `https://monitor-pp-601.supasiao.workers.dev` (Account ID: `e87e6b4e...`) |
| Excel Hyperlink Shortcut | ✅ สูตร `=HYPERLINK("https://monitor-pp-601.supasiao.workers.dev", "🌐 เปิดระบบ Monitor PP-601")` สำหรับเปิด Web App จากในชีต |
| Industrial Skill Documentation | ✅ สรุปและถอดองค์ความรู้เป็น Skill `line-bot-edge-sync` พร้อมสำเนาไว้ที่ `docs/skills/line-bot-edge-sync.md` |

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
     * ลงทะเบียน Windows Task Scheduler (`PP601-Excel-Sync`) ให้รันอัตโนมัติทุก 30 นาที
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
