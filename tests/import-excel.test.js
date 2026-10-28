import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseExcelDateTime,
  parseRowToReadings,
  validateSeedReading,
  detectSwitchEvents,
} from '../src/modules/excel-parser.js';
import { createLocalRepo } from '../src/modules/repo-local.js';

const bkk = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h - 7, mi);

describe('excel-parser: วันที่และเวลา', () => {
  it('แปลง Excel serial date 46255 และ time 0.66667 เป็นเวลาไทย 2026-08-21 16:00', () => {
    const ms = parseExcelDateTime(46255, 0.66666666666666663);
    expect(ms).toBe(bkk(2026, 8, 21, 16, 0));
  });

  it('แก้ไขปีที่พิมพ์ผิด เช่น 42606 (2016) ให้เป็น 46258 (2026-08-24)', () => {
    const ms = parseExcelDateTime(42606, 0.0416666666666667);
    expect(ms).toBe(bkk(2026, 8, 24, 1, 0));
  });

  it('ปัดเวลาเข้า slot 3 ชม. มาตรฐาน (1, 4, 7, 10, 13, 16, 19, 22)', () => {
    // 0.79166666666666663 = 19:00
    const ms = parseExcelDateTime(46255, 0.79166666666666663);
    const d = new Date(ms + 7 * 3600 * 1000);
    expect(d.getUTCHours()).toBe(19);
  });
});

describe('excel-parser: แปลงแถว Excel เป็น Readings', () => {
  it('แถวที่มีปั๊ม A และ B เดิน จะได้ 2 readings ที่มี ID ตามข้อกำหนด Firestore', () => {
    const row = {
      A: 46255,
      B: 0.66666666666666663,
      C: '117',
      D: '92',
      E: '130',
      F: '92',
      G: '',
      H: '',
      N: '',
    };
    const { readings, nextDate } = parseRowToReadings(row, null);
    expect(nextDate).toBe(46255);
    expect(readings.length).toBe(2);

    const a = readings.find((r) => r.pump === 'A');
    expect(a).toBeDefined();
    expect(a.id).toBe('A_202608211600');
    expect(a.tg3602).toBe(117);
    expect(a.tg3603).toBe(92);
    expect(a.recordedBy).toBe('Excel Import');
    expect(a.voided).toBe(false);

    const b = readings.find((r) => r.pump === 'B');
    expect(b).toBeDefined();
    expect(b.id).toBe('B_202608211600');
    expect(b.tg3602).toBe(130);
    expect(b.tg3603).toBe(92);
  });

  it('ดึง note จากคอลัมน์ N เข้า reading', () => {
    const row = {
      A: '',
      B: 0.4166666666666667, // 10:00
      C: '105',
      D: '98',
      E: '',
      F: '',
      G: '104',
      H: '89',
      N: 'Eng. Confirm ลงค่า temp gauge',
    };
    const { readings } = parseRowToReadings(row, 46259); // 2026-08-25
    expect(readings.length).toBe(2);
    expect(readings[0].note).toBe('Eng. Confirm ลงค่า temp gauge');
    expect(readings[1].note).toBe('Eng. Confirm ลงค่า temp gauge');
  });
});

describe('excel-parser: Firestore Rules Whitelist Validation', () => {
  it('reading ที่สกัดได้ต้องผ่าน Whitelist Keys และ Types ทั้งหมดของ firestore.rules', () => {
    const reading = {
      id: 'A_202608211600',
      pump: 'A',
      slotTime: bkk(2026, 8, 21, 16, 0),
      shiftId: '2026-08-21_D',
      tg3602: 117,
      tg3603: 92,
      note: 'test note',
      recordedBy: 'Excel Import',
      voided: false,
      updatedAt: Date.now(),
    };
    expect(validateSeedReading(reading)).toBe(true);
  });

  it('ปฏิเสธ reading ที่มี ID ผิดรูปแบบ หรือค่าอุณหภูมิเกินช่วง 0–300 °C', () => {
    expect(
      validateSeedReading({
        id: 'INVALID_ID',
        pump: 'A',
        slotTime: Date.now(),
        shiftId: '2026-08-21_D',
        tg3602: 117,
        tg3603: 92,
        recordedBy: 'Excel Import',
      }),
    ).toBe(false);

    expect(
      validateSeedReading({
        id: 'A_202608211600',
        pump: 'A',
        slotTime: Date.now(),
        shiftId: '2026-08-21_D',
        tg3602: 350, // เกิน 300
        tg3603: 92,
        recordedBy: 'Excel Import',
      }),
    ).toBe(false);
  });
});

describe('excel-parser: สกัด Events การสลับ Pump', () => {
  it('ดักจับการสลับปั๊มจาก A+B เป็น A+C ได้ถูกต้อง', () => {
    const slot1 = bkk(2026, 8, 24, 4, 0);
    const slot2 = bkk(2026, 8, 24, 7, 0);
    const readings = [
      { id: 'A_1', pump: 'A', slotTime: slot1 },
      { id: 'B_1', pump: 'B', slotTime: slot1 },
      { id: 'A_2', pump: 'A', slotTime: slot2 },
      { id: 'C_2', pump: 'C', slotTime: slot2 },
    ];
    const events = detectSwitchEvents(readings);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('switch');
    expect(events[0].stop).toBe('B');
    expect(events[0].start).toBe('C');
    expect(events[0].at).toBe(slot2);
  });
});

describe('excel-parser: ตรวจสอบความถูกต้องของ seed-data.json', () => {
  it('ทุก reading ใน seed-data.json ต้องผ่าน Whitelist Schema 100%', async () => {
    const seed = await import('../src/data/seed-data.json');
    expect(seed.readings.length).toBe(1003);
    expect(seed.events.length).toBeGreaterThanOrEqual(10);

    for (const r of seed.readings) {
      expect(validateSeedReading(r)).toBe(true);
    }
  });

  it('repo-local สามารถ importSeed ข้อมูล 1003 รายการได้ครบถ้วนโดยไม่ error', async () => {
    localStorage.clear();
    const repo = createLocalRepo();
    const seed = await import('../src/data/seed-data.json');
    const res = await repo.importSeed(seed);
    expect(res.readings).toBe(1003);
    expect(res.events).toBe(seed.events.length);

    // ดึงข้อมูลย้อนหลังดูว่ามีข้อมูลจริง
    const rows = await repo.getReadings(0, Date.now() + 86400000);
    expect(rows.length).toBe(1003);
  });
});
