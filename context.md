# context.md — PP-601 Monitor

**เป้าหมาย:** แทนขั้นตอนเดิม (F/O ส่งค่าใน LINE → B/M พิมพ์ซ้ำลง Excel) ด้วยแอปเดียว กรอกครั้งเดียว ทุกคนเห็นแบบ real-time และออกรายงานกะ (ตาราง+กราฟ) ส่งใน LINE กลุ่ม

**ข้อเท็จจริงจากหน้างาน (จากรูป Excel/LINE ที่พี่ A ส่งมา)**
- Pump PP-601A/B/C ใน loop hot oil: เดิน 2 สำรอง 1 สลับบ่อยเพื่อล้าง pump และ oil cooler
- จด 2 จุดต่อ pump ทุก 3 ชม.: TG-3602 (oil in), TG-3603 (oil out) · Diff = 3602−3603 · Target 70 และ Diff 20
- ข้อความ LINE เดิม: `22:00\nA\nTemp gauge = 108/65\n\nC\nTemp gauge = 128/105`
- gauge PP-601A/B/C เคย error → ใช้ temp gun วัดแทน (มีช่องหมายเหตุ)

**ข้อตกลงกับพี่ A:** ใช้บนมือถือ · หลายคน real-time · ไม่มี login · F/O จดค่า, B/M ส่งรายงานตอนออกกะ · deploy Cloudflare Workers · TG-3603 ต้องมากกว่า 70

**สถานะ (2026-10-12):** โค้ดครบ Phase 1–3 + ปุ่มบันทึกรายงานเป็นรูป · unit test 33 ข้อผ่าน · ยังไม่ทดสอบกับ Firebase จริง (พี่ A ยังไม่ได้สร้าง project) · ยังไม่ merge เข้า main/ยังไม่ deploy

**ถัดไป:** พี่ A สร้าง Firebase + วาง config + deploy rules → ทดสอบ sync สองเครื่อง → ตั้ง `CLOUDFLARE_API_TOKEN` → merge main · ยืนยัน Diff ≥ 20 กับหน้างาน · (ตัวเลือก) นำเข้า CSV ข้อมูลเก่าจาก Excel
