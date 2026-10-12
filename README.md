# PP-601 Monitor

เว็บแอปบันทึกอุณหภูมิ PP-601A/B/C (hot oil loop) ทุก 3 ชม. · สลับ pump · งานล้าง pump/oil cooler · รายงานกะ (ตาราง + กราฟ)

- Stack: Vite + ES Modules + Firebase (Firestore real-time, Anonymous Auth) + Chart.js + Vitest · deploy Cloudflare Workers
- โมดูลหลัก: `src/modules/shift-logic.js` (ฟังก์ชันล้วน ทดสอบด้วย Vitest) · `cloud-sync-manager.js` (Firestore) · `repo-local.js` (โหมดทดลอง)

## รันในเครื่อง

```bash
npm ci
npm run dev        # เปิดแอป (ถ้ายังไม่ตั้ง Firebase จะเป็น "โหมดทดลองในเครื่อง")
npm test           # unit test
npm run check      # test + build (เหมือน CI)
```

## ตั้งค่า Firebase (ครั้งเดียว)

1. console.firebase.google.com → สร้าง project → เพิ่ม **Web app** → คัดลอก `firebaseConfig` ไปวางใน `src/firebase-config.js`
2. เปิด **Firestore Database** (production mode)
3. เปิด **Authentication → Sign-in method → Anonymous**
4. deploy กฎความปลอดภัย: `npx firebase-tools deploy --only firestore:rules --project <PROJECT_ID>` (หรือวางเนื้อหา `firestore.rules` ในหน้า Rules ของ console)

## Deploy (Cloudflare Workers)

1. สร้าง API Token สิทธิ์ "Edit Cloudflare Workers" เท่านั้น → ตั้งเป็น GitHub Secret ชื่อ `CLOUDFLARE_API_TOKEN`
2. ถ้าบัญชี Cloudflare มีหลาย account ให้เพิ่ม `account_id` ใน `wrangler.jsonc`
3. push/merge เข้า `main` → workflow `CI` รัน test + build แล้ว deploy อัตโนมัติ

## ข้อควรรู้

- ไม่มีหน้า login: ใช้ Anonymous Auth เบื้องหลัง + ชื่อผู้จด ใครมีลิงก์ก็เขียนข้อมูลได้ ห้ามลบข้อมูล (ยกเลิกรายการแทน)
- เกณฑ์เตือนตั้งในหน้า "ตั้งค่า": TG-3603 ต้อง > 70 (ยืนยันแล้ว) · Diff ≥ 20 เป็นข้อสันนิษฐานที่ยังไม่ได้ยืนยันกับหน้างาน
- slot: 22/01/04/07/10/13/16/19 น. · กะเช้า 07:30–19:30 · กะดึก 19:30–07:30
