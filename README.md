# PP-601 Monitor

ระบบติดตามและบันทึกอุณหภูมิน้ำมันร้อน Hot Oil Pump PP-601A/B/C อัตโนมัติครบวงจร (GC-M PTA นิคมฯ มาบตาพุด)

**URL ใช้งานจริง:** [https://monitor-pp-601.supasiao.workers.dev](https://monitor-pp-601.supasiao.workers.dev)  
**LINE Bot:** `@964jzoqe` (ชื่อ: `Monitor PP-601`)  
**Excel ปลายทาง:** `K:\PE1\Daily report PTA1\Monitor temp pump PP-601.xlsx`  
**Excel Hyperlink Formula:** `=HYPERLINK("https://monitor-pp-601.supasiao.workers.dev", "🌐 เปิดระบบ Monitor PP-601")`  
**Skill ต้นแบบ:** [LINE Bot Edge & Excel Sync (docs/skills/line-bot-edge-sync.md)](docs/skills/line-bot-edge-sync.md)

---

## 🏛️ สถาปัตยกรรม 4 ประสาน (4-Tier Architecture)

1. **LINE Messaging API:** Field Operator (F/O) พิมพ์ค่าในกลุ่ม LINE (เช่น `22:00 A 125/77 C 128/94`) บอทคำนวณ Diff แจ้งเตือน และตอบกลับยืนยันทันที
2. **Cloudflare Workers & D1:** Cloudflare Edge ตรวจสอบ HMAC-SHA256 Signature และบันทึกข้อมูลลง D1 Serverless SQL พร้อมให้บริการ REST API (`/api/readings`) ตลอด 24 ชม.
3. **Web Dashboard:** แสดงผลกราฟความละเอียดสูง Dual Y-Axis (Chart.js), สรุปรายงานกะเช้า/กะดึก, และ Export ภาพรายงานส่งเข้า LINE
4. **Office Shared PC Automation:** Windows Task Scheduler บนเครื่อง B/M รันสคริปต์ PowerShell COM ดึงข้อมูลจาก Cloudflare API ไปหยอดลงไฟล์ Excel บนไดรฟ์เครือข่าย `K:` อัตโนมัติทุก 30 นาที (รองรับผู้ใช้ผลัดเวร 4 คน ผ่าน `C:\ProgramData\PP601-Monitor`)

---

## 💻 การติดตั้งบนเครื่อง PC ใหม่ (1-Click Setup)

เมื่อเปลี่ยนเครื่องคอมพิวเตอร์ใหม่ ให้เปิด Terminal หรือคลิกขวาที่ไฟล์:
```powershell
powershell -ExecutionPolicy Bypass -File "./scripts/setup-new-pc.ps1"
```
สคริปต์จะตั้งค่าโฟลเดอร์กลาง `C:\ProgramData\PP601-Monitor`, ตรวจสอบไดรฟ์ `K:`, ลงทะเบียน Task Scheduler และสร้าง Shortcuts บน Desktop ให้เสร็จสิ้นอัตโนมัติ

> ⚠️ **กฎความปลอดภัยเครือข่ายองค์กร (FSRM Policy):**  
> ห้ามคัดลอกโฟลเดอร์ `scripts` หรือไฟล์ `.ps1` ไปวางบนไดรฟ์เครือข่าย `K:\` หรือ File Server เด็ดขาด (ระบบ Windows Server FSRM จะบล็อกเป็น Executable File และส่ง Alert ความปลอดภัย) สคริปต์และตัวติดตั้งทั้งหมดต้องรันและจัดเก็บบนไดรฟ์เครื่อง Local `C:\` เท่านั้น โดยตัวสคริปต์จะเชื่อมต่อเปิดไฟล์ Excel จากไดรฟ์ `K:\` เองอัตโนมัติ

---

## 🧪 การทดสอบและรันในเครื่อง (Local Development)

```bash
npm ci
npm test        # รัน 81 unit tests (Vitest)
npm run check   # รัน tests + build production
npm run dev     # รัน Vite dev server สำหรับแก้ไข UI
```

---

## 📋 ข้อกำหนดทางวิศวกรรม (Engineering Specifications)

- **เกณฑ์อุณหภูมิ:** TG-3602 (Inlet) / TG-3603 (Outlet ต้อง > 70°C) / Diff = TG-3602 − TG-3603 (เกณฑ์เตือน ≥ 20°C)
- **รอบการจดบันทึก:** ทุก 3 ชั่วโมง (22:00, 01:00, 04:00, 07:00, 10:00, 13:00, 16:00, 19:00 น.)
- **กะการทำงาน:** กะเช้า 07:30–19:30 น. / กะดึก 19:30–07:30 น. (เวลาไทย UTC+7)
