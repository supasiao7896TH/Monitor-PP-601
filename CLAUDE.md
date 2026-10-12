# CLAUDE.md — PP-601 Monitor

## Project Context
- แอป: บันทึกอุณหภูมิ PP-601A/B/C (hot oil loop) ทุก 3 ชม. + สลับ pump + งานล้าง + รายงานกะ
- Stack: Multi-File (Vite + ES Modules) · Firebase Firestore real-time + Anonymous Auth · Chart.js · Vitest
- Deploy: Cloudflare Workers (static assets) ผ่าน GitHub Actions · Branch: main
- ผู้ใช้: พี่ A (Process Engineer GC-M PTA) — ตอบภาษาไทย หนู/ค่ะ · เสนอ Blueprint ก่อนเขียนโค้ดเสมอ

## Commands
- `npm test` — unit test (Vitest) · `npm run check` — test + build (CI ใช้ชุดนี้) · `npm run dev` — dev server
- ยังไม่ตั้ง Firebase → แอปรัน "โหมดทดลองในเครื่อง" (localStorage) อัตโนมัติ

## Architecture
- `src/modules/shift-logic.js` ฟังก์ชันล้วน (slot/กะ/Diff/ธง/สถานะ pump/ข้อความ LINE/ซีรีส์กราฟ) — เวลาไทย UTC+7 offset คงที่
- `cloud-sync-manager.js` (Firestore) กับ `repo-local.js` มี interface เดียวกัน · view ใน `src/views/*` ใช้ผ่าน `repo`
- DOM สร้างด้วย `h()` ใน `ui-renderer.js` เท่านั้น ห้าม innerHTML กับข้อมูลผู้ใช้
- Firestore: `readings/{PUMP_YYYYMMDDHHmm}` · `events` · `pumpStatus/current` · `config/limits` (rules ใน `firestore.rules`, ห้ามลบ doc)

## Domain (ยืนยันกับพี่ A แล้ว)
- slot 22/01/04/07/10/13/16/19 น. · กะเช้า 07:30–19:30 / กะดึก 19:30–07:30 · RUN 2 STANDBY 1
- TG-3602 = oil in · TG-3603 = oil out · Diff = 3602−3603 · TG-3603 ต้อง > 70
- ยังไม่ยืนยัน: Diff ≥ 20 (พี่ A "คิดว่าใช่") — ห้ามเดาเกณฑ์เพิ่มเอง

## DO NOT
- ❌ ห้าม hardcode secret · ❌ ห้ามอนุญาต delete ใน firestore.rules · ❌ ห้ามแปลงช่องว่างในกราฟเป็น 0
- ❌ ห้าม deploy ถ้า `npm run check` ไม่เขียว · ❌ ห้ามเขียนโค้ดฟีเจอร์ใหม่ก่อนได้ "อนุมัติ" Blueprint
