import { describe, it, expect } from 'vitest';
import { parseLineMessage, verifyLineSignature } from '../src/modules/line-parser.js';

const bkk = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h - 7, mi);

describe('line-parser: ตรวจจับและแยกแยะข้อความรายงานค่า', () => {
  it('กรองข้อความคุยเล่นทั่วไป ไม่ประมวลผล (isPumpReport = false)', () => {
    expect(parseLineMessage('สวัสดีครับพี่ A').isPumpReport).toBe(false);
    expect(parseLineMessage('รับทราบครับผม').isPumpReport).toBe(false);
    expect(parseLineMessage('OK').isPumpReport).toBe(false);
    expect(parseLineMessage('ฝนตกหนักมากที่หน้างาน').isPumpReport).toBe(false);
  });

  it('สกัดข้อความรูปแบบมาตรฐานเดิมของ F/O ได้ถูกต้อง 100%', () => {
    const text = `22:00
A
Temp gauge = 108/65

C
Temp gauge = 128/105`;

    const refDate = bkk(2026, 10, 28, 22, 5); // วันที่ 28 ต.ค. เวลา 22:05
    const res = parseLineMessage(text, refDate);

    expect(res.isPumpReport).toBe(true);
    expect(res.ok).toBe(true);
    expect(res.readings.length).toBe(2);

    const a = res.readings.find((r) => r.pump === 'A');
    expect(a).toBeDefined();
    expect(a.tg3602).toBe(108);
    expect(a.tg3603).toBe(65);
    expect(a.diff).toBe(43);

    const c = res.readings.find((r) => r.pump === 'C');
    expect(c).toBeDefined();
    expect(c.tg3602).toBe(128);
    expect(c.tg3603).toBe(105);
    expect(c.diff).toBe(23);
  });

  it('รองรับรูปแบบย่อและมีเว้นวรรค เช่น "A 115/88" หรือ "PP-601C: 120/95"', () => {
    const text = `07:00
PP-601A: 115 / 88
PP-601B: 120 / 95`;

    const refDate = bkk(2026, 10, 28, 7, 10);
    const res = parseLineMessage(text, refDate);

    expect(res.isPumpReport).toBe(true);
    expect(res.ok).toBe(true);
    expect(res.readings.length).toBe(2);

    const a = res.readings.find((r) => r.pump === 'A');
    expect(a.tg3602).toBe(115);
    expect(a.tg3603).toBe(88);
  });

  it('สกัดข้อความรูปแบบหน้างานจริง "A Temp 125/77" (ไม่มีคำว่า gauge)', () => {
    const text = `22:00
A
Temp 125/77

C
Temp 128/94`;
    const res = parseLineMessage(text);
    expect(res.isPumpReport).toBe(true);
    expect(res.readings.length).toBe(2);
    expect(res.readings[0].pump).toBe('A');
    expect(res.readings[0].tg3602).toBe(125);
    expect(res.readings[0].tg3603).toBe(77);
    expect(res.readings[0].diff).toBe(48);
    expect(res.readings[1].pump).toBe('C');
    expect(res.readings[1].tg3602).toBe(128);
    expect(res.readings[1].tg3603).toBe(94);
    expect(res.readings[1].diff).toBe(34);
    expect(res.replyText).toContain('✓ บันทึกค่า PP-601 รอบ 22:00 เรียบร้อย');
    expect(res.replyText).toContain('• PP-601A: 125/77 (Diff 48)');
    expect(res.replyText).toContain('• PP-601C: 128/94 (Diff 34)');
  });

  it('ดึงหมายเหตุในวงเล็บได้ เช่น "(ใช้ temp gun)"', () => {
    const text = `10:00
A
Temp gauge = 105/98 (ใช้ temp gun วัดแทน gauge error)
C
Temp gauge = 104/89`;

    const refDate = bkk(2026, 10, 28, 10, 5);
    const res = parseLineMessage(text, refDate);

    expect(res.isPumpReport).toBe(true);
    const a = res.readings.find((r) => r.pump === 'A');
    expect(a.note).toContain('temp gun');
  });

  it('สร้างข้อความตอบกลับสรุปยืนยัน (Reply confirmation summary)', () => {
    const text = `19:00
A
Temp gauge = 128/94
C
Temp gauge = 125/92`;

    const refDate = bkk(2026, 10, 28, 19, 2);
    const res = parseLineMessage(text, refDate);
    expect(res.replyText).toContain('รอบ 19:00');
    expect(res.replyText).toContain('PP-601A: 128/94 (Diff 34)');
    expect(res.replyText).toContain('PP-601C: 125/92 (Diff 33)');
  });

  it('verifyLineSignature: ตรวจสอบ HMAC-SHA256 ถูกต้อง และปฏิเสธลายเซ็นปลอม', async () => {
    const body = JSON.stringify({ events: [] });
    const secret = 'test-channel-secret-12345';

    // คำนวณ valid signature
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sigBytes = await crypto.subtle.sign('HMAC', key, enc.encode(body));
    const validSig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

    expect(await verifyLineSignature(body, validSig, secret)).toBe(true);
    expect(await verifyLineSignature(body, 'invalid-signature', secret)).toBe(false);
    expect(await verifyLineSignature(body, validSig, 'wrong-secret')).toBe(false);
  });

  it('ตรวจจับคำสั่งบอท status, สถานะ, สรุป, help', () => {
    const s1 = parseLineMessage('status');
    expect(s1.isCommand).toBe(true);
    expect(s1.command).toBe('status');

    const s2 = parseLineMessage('สรุป');
    expect(s2.isCommand).toBe(true);
    expect(s2.command).toBe('status');

    const h = parseLineMessage('help');
    expect(h.isCommand).toBe(true);
    expect(h.command).toBe('help');
    expect(h.replyText).toBeDefined();
    expect(h.replyText).toContain('วิธีใช้งานบอท');
  });
});
