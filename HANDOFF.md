# HANDOFF.md — PP-601 Monitor (ส่งต่องาน มือถือ → PC บ้าน)

อัปเดต: 2026-10-12 · Branch: `ccr-47fd6ef2-ms36mm` · ยังไม่ merge เข้า `main` · ยังไม่ deploy

## สถานะ
| ส่วน | สถานะ |
|---|---|
| หน้าจอ 4 แท็บ (จด / รายงานกะ / ประวัติ / ตั้งค่า) | ✅ เสร็จ ทดสอบใน Chromium มือถือ 390px |
| `shift-logic` unit test | ✅ 33 ข้อผ่าน (เขียนแดงก่อน แล้วทำเขียว) |
| ปุ่มบันทึกรายงานเป็นรูป | ✅ ทดสอบโหมดดาวน์โหลดแล้ว · ❌ ยังไม่ทดสอบแชร์เข้า LINE บนมือถือจริง |
| Firebase (Firestore + Anonymous Auth) | ⚠️ เขียนแล้ว **ยังไม่เคยทดสอบกับ project จริง** รวมถึง `firestore.rules` และ CSP |
| Deploy Cloudflare Workers | ⚠️ เขียน workflow แล้ว ยังไม่เคยรัน |
| e2e / a11y (axe) ใน CI | ❌ ไม่มี (starter ไม่อยู่ใน environment ตอนทำ) |

ตอนนี้ไม่มี Firebase config แอปจึงรัน **โหมดทดลองในเครื่อง** (localStorage ไม่ sync)

## ข้อตกลงกับพี่ A (ยืนยันแล้ว)
- ใช้บนมือถือ · หลายคน real-time · **ไม่มี login** (ใช้ Anonymous Auth เบื้องหลัง + ชื่อผู้จด)
- slot 22/01/04/07/10/13/16/19 น. · กะเช้า 07:30–19:30 / กะดึก 19:30–07:30 · RUN 2 / STANDBY 1
- จุดจด: TG-3602 (oil in), TG-3603 (oil out) · Diff = 3602−3603
- **TG-3603 ต้องมากกว่า 70** (ยืนยัน) · **Diff ≥ 20 ยังไม่ยืนยัน** (พี่ A "คิดว่าใช่") — ตรวจกับหน้างาน
- F/O จดค่า, B/M ส่งรายงานเข้า LINE ตอนออกกะ · deploy ด้วย Cloudflare Workers

## ขั้นตอนต่อที่ PC บ้าน
```bash
git clone https://github.com/supasiao7896TH/Monitor-PP-601.git
cd Monitor-PP-601 && git checkout ccr-47fd6ef2-ms36mm
npm ci && npm test && npm run dev     # Node 22+
```

### สิ่งที่พี่ A ต้องทำเอง (AI ทำแทนไม่ได้)
1. **Firebase**: console.firebase.google.com → สร้าง project → เพิ่ม Web app → วาง `firebaseConfig` ใน `src/firebase-config.js` → เปิด Firestore → เปิด Authentication → Anonymous → deploy rules: `npx firebase-tools deploy --only firestore:rules --project <PROJECT_ID>`
2. **Cloudflare**: สร้าง API Token สิทธิ์ "Edit Cloudflare Workers" เท่านั้น → ตั้ง GitHub Secret `CLOUDFLARE_API_TOKEN` (ถ้ามีหลาย account ให้เพิ่ม `account_id` ใน `wrangler.jsonc`)
3. merge branch เข้า `main` → workflow `CI` รัน test + build แล้ว deploy เอง
4. ⚠️ ห้ามส่ง token / service account key ในแชต (ตัว `firebaseConfig` ไม่ใช่ความลับ)

### หลังตั้ง Firebase แล้ว ต้องทดสอบ (ยังไม่เคยทำ)
- [ ] เปิดแอป 2 เครื่อง จดค่าแล้วอีกเครื่องเห็นทันที
- [ ] จดตอนออฟไลน์ → ต่อเน็ตแล้ว sync
- [ ] `firestore.rules`: เขียนได้ปกติ, ลบไม่ได้, ค่าผิดรูปแบบถูกปฏิเสธ
- [ ] เปิดลิงก์ใน LINE ในแอป (WebView) — มี banner แนะนำเปิดเบราว์เซอร์
- [ ] ปุ่ม "บันทึกรายงานเป็นรูป" แชร์เข้า LINE ได้บนมือถือจริง
- [ ] CSP ใน `index.html` ไม่บล็อก Firebase (ดู console)

## ข้อจำกัด / ความเสี่ยงที่รู้
- ไม่มี login → ใครมีลิงก์ก็เขียนข้อมูลได้ (ห้ามลบ ยกเลิกรายการแทน) · ผูกชื่อกับ uid ไม่ได้เพราะใช้ `inMemoryPersistence` (uid เปลี่ยนทุกครั้งที่เปิดหน้า)
- รายงานกะสูง ~900px เกินจอมือถือเล็กน้อย (ใช้ปุ่มบันทึกรูปแทนแคปจอ)
- `npm audit` มี 4 high จาก dependency ฝั่ง server ของ firebase (แอปบนเบราว์เซอร์ไม่ได้ใช้ — ยังไม่ได้ตรวจเจาะลึก)
- bundle หลัก ~820 KB (Firebase) · รูปไอคอน PWA เป็นแบบ generate ง่ายๆ

## ไอเดียต่อ
- นำเข้า CSV ข้อมูลเก่าจาก Excel (ให้กราฟต่อเนื่อง)
- e2e + axe ใน CI · แจ้งเตือน slot ที่ยังไม่จด · เพิ่ม `account_id` ใน wrangler

## แผนที่โค้ด
- `src/modules/shift-logic.js` logic ล้วน (เวลาไทย UTC+7 คงที่) · `tests/shift-logic.test.js`
- `src/modules/cloud-sync-manager.js` Firestore · `repo-local.js` โหมดทดลอง (interface เดียวกัน)
- `src/views/` record · report · history · settings · `src/main.js` routing
- `firestore.rules` · `wrangler.jsonc` · `.github/workflows/ci.yml` · `CLAUDE.md` · `context.md` · `agents.md`
