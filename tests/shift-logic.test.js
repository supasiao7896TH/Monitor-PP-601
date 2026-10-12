import { describe, it, expect } from 'vitest';
import {
  SLOT_HOURS,
  slotKey,
  nearestSlot,
  isSlotOpen,
  slotHint,
  runStartOf,
  runWindowOf,
  buildLongSeries,
  formatDateTime,
  shiftOf,
  shiftRange,
  shiftSlots,
  readingId,
  calcDiff,
  validateReading,
  evaluate,
  validateStatus,
  recordablePumps,
  applySwitch,
  startCleaning,
  finishCleaning,
  formatLineMessage,
  buildSeries,
  summarize,
  escapeCsv,
} from '../src/modules/shift-logic.js';

// helper: เวลาไทย (UTC+7) → epoch ms ไม่ขึ้นกับ timezone ของเครื่องที่รันเทสต์
const bkk = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h - 7, mi);

const LIMITS = { tg3603Target: 70, tg3603Direction: 'below', diffTarget: 20, diffDirection: 'above' };

describe('slot และกะ', () => {
  it('slot ทุก 3 ชม. ตาม Excel: 22,01,04,07,10,13,16,19', () => {
    expect([...SLOT_HOURS].sort((a, b) => a - b)).toEqual([1, 4, 7, 10, 13, 16, 19, 22]);
  });

  it('nearestSlot ปัดเวลาจริงเข้า slot ที่ใกล้ที่สุด', () => {
    expect(nearestSlot(bkk(2026, 10, 12, 10, 20))).toBe(bkk(2026, 10, 12, 10));
    expect(nearestSlot(bkk(2026, 10, 12, 9, 40))).toBe(bkk(2026, 10, 12, 10));
    expect(nearestSlot(bkk(2026, 10, 12, 12, 0))).toBe(bkk(2026, 10, 12, 13));
  });

  it('nearestSlot ข้ามเที่ยงคืน: 23:50 → 01:00 วันถัดไป', () => {
    expect(nearestSlot(bkk(2026, 10, 12, 23, 50))).toBe(bkk(2026, 10, 13, 1));
  });

  it('isSlotOpen: จด slot ได้ก่อนเวลาไม่เกิน 120 นาที และย้อนหลังได้เสมอ', () => {
    const s19 = bkk(2026, 10, 12, 19);
    expect(isSlotOpen(s19, bkk(2026, 10, 12, 18, 47))).toBe(true); // ก่อน 13 นาที
    expect(isSlotOpen(s19, bkk(2026, 10, 12, 17, 10))).toBe(true); // เคสจริงที่พี่ A เจอ
    expect(isSlotOpen(s19, bkk(2026, 10, 12, 17, 0))).toBe(true); // ขอบ 120 นาทีพอดี
    expect(isSlotOpen(s19, bkk(2026, 10, 12, 16, 59))).toBe(false);
    expect(isSlotOpen(s19, bkk(2026, 10, 12, 19, 45))).toBe(true); // หลังเวลา
  });

  it('slotHint: บอกว่าเวลาจริงจะถูกจดเป็น slot ไหน', () => {
    const s19 = bkk(2026, 10, 12, 19);
    expect(slotHint(s19, bkk(2026, 10, 12, 18, 47))).toBe('ตอนนี้ 18:47 → จดเป็น slot 19:00 (ก่อนเวลา 13 นาที)');
    expect(slotHint(s19, bkk(2026, 10, 12, 19, 5))).toBe('ตอนนี้ 19:05 → จดเป็น slot 19:00 (หลังเวลา 5 นาที)');
    expect(slotHint(s19, bkk(2026, 10, 12, 19, 0))).toBe('ตอนนี้ 19:00 → จดเป็น slot 19:00 (ตรงเวลา)');
  });

  it('slotHint: slot ที่ยังไม่เปิดต้องบอกเวลาที่จะเปิด', () => {
    const s19 = bkk(2026, 10, 12, 19);
    expect(slotHint(s19, bkk(2026, 10, 12, 16, 40))).toBe('slot 19:00 ยังไม่เปิดให้จด — เปิดเวลา 17:00');
  });

  it('slotKey เป็น YYYYMMDDHHmm เวลาไทย', () => {
    expect(slotKey(bkk(2026, 10, 12, 1))).toBe('202610120100');
  });

  it('shiftOf: กะเช้า 07:30–19:30 มี slot 10,13,16,19', () => {
    for (const h of [10, 13, 16, 19]) expect(shiftOf(bkk(2026, 10, 12, h))).toBe('2026-10-12_D');
  });

  it('shiftOf: slot 07:00 เป็นของกะดึกที่กำลังจะออก (07:30)', () => {
    expect(shiftOf(bkk(2026, 10, 12, 7))).toBe('2026-10-11_N');
  });

  it('shiftOf: กะดึกข้ามวัน — 22:00 และ 01:00 อยู่กะเดียวกัน ตั้งชื่อตามวันที่เริ่มกะ', () => {
    expect(shiftOf(bkk(2026, 10, 11, 22))).toBe('2026-10-11_N');
    expect(shiftOf(bkk(2026, 10, 12, 1))).toBe('2026-10-11_N');
    expect(shiftOf(bkk(2026, 10, 12, 4))).toBe('2026-10-11_N');
  });

  it('shiftRange ให้ช่วงเวลากะ', () => {
    expect(shiftRange('2026-10-12_D')).toEqual({ start: bkk(2026, 10, 12, 7, 30), end: bkk(2026, 10, 12, 19, 30) });
    expect(shiftRange('2026-10-11_N')).toEqual({ start: bkk(2026, 10, 11, 19, 30), end: bkk(2026, 10, 12, 7, 30) });
  });

  it('shiftSlots ให้ 4 slot เรียงตามเวลา (กะดึก: 22,01,04,07)', () => {
    expect(shiftSlots('2026-10-11_N')).toEqual([
      bkk(2026, 10, 11, 22),
      bkk(2026, 10, 12, 1),
      bkk(2026, 10, 12, 4),
      bkk(2026, 10, 12, 7),
    ]);
    expect(shiftSlots('2026-10-12_D')).toHaveLength(4);
  });

  it('readingId ผูก pump + slot จึงจดซ้ำ slot เดิมได้ id เดิม (ทับ ไม่เกิด doc ซ้ำ)', () => {
    const t = bkk(2026, 10, 12, 10);
    expect(readingId('A', t)).toBe('A_202610121000');
    expect(readingId('A', t)).toBe(readingId('A', t));
    expect(readingId('C', t)).not.toBe(readingId('A', t));
  });
});

describe('ค่า temp', () => {
  it('calcDiff = TG-3602 − TG-3603 (108/65 → 43)', () => {
    expect(calcDiff(108, 65)).toBe(43);
    expect(calcDiff(128, 105)).toBe(23);
  });

  it('calcDiff ปัดทศนิยมไม่ให้เพี้ยนแบบ floating point', () => {
    expect(calcDiff(100.3, 60.1)).toBe(40.2);
  });

  it('calcDiff คืน null ถ้าขาดค่า', () => {
    expect(calcDiff(null, 65)).toBeNull();
    expect(calcDiff(108, undefined)).toBeNull();
  });

  it('validateReading รับค่าปกติ รวมสตริงตัวเลขจากฟอร์ม', () => {
    expect(validateReading({ tg3602: '108', tg3603: '65' })).toEqual({ ok: true, tg3602: 108, tg3603: 65 });
  });

  it('validateReading ปฏิเสธค่าว่าง / ไม่ใช่ตัวเลข / นอกช่วง 0–300', () => {
    expect(validateReading({ tg3602: '', tg3603: '65' }).ok).toBe(false);
    expect(validateReading({ tg3602: 'abc', tg3603: '65' }).ok).toBe(false);
    expect(validateReading({ tg3602: '108', tg3603: '-5' }).ok).toBe(false);
    expect(validateReading({ tg3602: '1080', tg3603: '65' }).ok).toBe(false);
  });

  it('evaluate: TG-3603 ทิศ below → เกิน target เป็น alarm, ไม่เกินเป็น ok', () => {
    expect(evaluate({ tg3602: 108, tg3603: 65 }, LIMITS).tg3603).toBe('ok');
    expect(evaluate({ tg3602: 128, tg3603: 105 }, LIMITS).tg3603).toBe('alarm');
  });

  it('evaluate: ถ้ากลับทิศเป็น above ผลต้องกลับด้วย', () => {
    const flipped = { ...LIMITS, tg3603Direction: 'above' };
    expect(evaluate({ tg3602: 108, tg3603: 65 }, flipped).tg3603).toBe('alarm');
    expect(evaluate({ tg3602: 128, tg3603: 105 }, flipped).tg3603).toBe('ok');
  });

  it('evaluate: Diff ทิศ above → ต่ำกว่า 20 เป็น alarm, เท่ากับ 20 ผ่าน', () => {
    expect(evaluate({ tg3602: 100, tg3603: 85 }, LIMITS).diff).toBe('alarm');
    expect(evaluate({ tg3602: 100, tg3603: 80 }, LIMITS).diff).toBe('ok');
  });

  it('evaluate: ไม่มี limit (null) → ไม่ติดธง (ไม่เดาเกณฑ์)', () => {
    const none = { tg3603Target: null, tg3603Direction: 'below', diffTarget: null, diffDirection: 'above' };
    expect(evaluate({ tg3602: 300, tg3603: 299 }, none)).toEqual({ tg3603: 'none', diff: 'none' });
  });
});

describe('สถานะ pump และการสลับ', () => {
  const base = { A: 'RUN', B: 'STANDBY', C: 'RUN' };

  it('validateStatus: ต้อง RUN 2 ตัว และตัวที่เหลือ STANDBY หรือ CLEANING', () => {
    expect(validateStatus(base).ok).toBe(true);
    expect(validateStatus({ A: 'RUN', B: 'CLEANING', C: 'RUN' }).ok).toBe(true);
    expect(validateStatus({ A: 'RUN', B: 'RUN', C: 'RUN' }).ok).toBe(false);
    expect(validateStatus({ A: 'RUN', B: 'STANDBY', C: 'STANDBY' }).ok).toBe(false);
    expect(validateStatus({ A: 'RUN', B: 'XYZ', C: 'RUN' }).ok).toBe(false);
  });

  it('recordablePumps คืนเฉพาะ pump ที่ RUN', () => {
    expect(recordablePumps(base)).toEqual(['A', 'C']);
    expect(recordablePumps({ A: 'STANDBY', B: 'RUN', C: 'RUN' })).toEqual(['B', 'C']);
  });

  it('applySwitch: หยุด C เดิน B → A,B RUN / C STANDBY', () => {
    expect(applySwitch(base, { stop: 'C', start: 'B' })).toEqual({
      ok: true,
      status: { A: 'RUN', B: 'RUN', C: 'STANDBY' },
    });
  });

  it('applySwitch ปฏิเสธ: หยุด pump ที่ไม่ได้ RUN / เดิน pump ที่ไม่ได้ STANDBY', () => {
    expect(applySwitch(base, { stop: 'B', start: 'A' }).ok).toBe(false);
    expect(applySwitch(base, { stop: 'A', start: 'C' }).ok).toBe(false);
  });

  it('applySwitch ปฏิเสธถ้าตัวที่ 3 ติด CLEANING (ไม่มี standby ให้สลับ)', () => {
    expect(applySwitch({ A: 'RUN', B: 'CLEANING', C: 'RUN' }, { stop: 'C', start: 'B' }).ok).toBe(false);
  });

  it('applySwitch ไม่แก้ object เดิม', () => {
    const s = { ...base };
    applySwitch(s, { stop: 'C', start: 'B' });
    expect(s).toEqual(base);
  });

  it('startCleaning: ทำได้เฉพาะ pump ที่ STANDBY → CLEANING', () => {
    expect(startCleaning(base, 'B')).toEqual({ ok: true, status: { A: 'RUN', B: 'CLEANING', C: 'RUN' } });
    expect(startCleaning(base, 'A').ok).toBe(false);
  });

  it('finishCleaning: CLEANING → STANDBY, pump อื่นปฏิเสธ', () => {
    const s = { A: 'RUN', B: 'CLEANING', C: 'RUN' };
    expect(finishCleaning(s, 'B')).toEqual({ ok: true, status: base });
    expect(finishCleaning(base, 'B').ok).toBe(false);
  });
});

describe('รายงาน', () => {
  it('formatLineMessage ตรงรูปแบบข้อความ LINE เดิมของ F/O', () => {
    const msg = formatLineMessage(bkk(2026, 10, 11, 22), [
      { pump: 'A', tg3602: 108, tg3603: 65 },
      { pump: 'C', tg3602: 128, tg3603: 105 },
    ]);
    expect(msg).toBe('22:00\nA\nTemp gauge = 108/65\n\nC\nTemp gauge = 128/105');
  });

  it('formatLineMessage ข้าม reading ที่ voided', () => {
    const msg = formatLineMessage(bkk(2026, 10, 12, 1), [
      { pump: 'A', tg3602: 108, tg3603: 65 },
      { pump: 'C', tg3602: 1, tg3603: 1, voided: true },
    ]);
    expect(msg).toBe('01:00\nA\nTemp gauge = 108/65');
  });

  it('buildSeries: slot ที่ไม่มีข้อมูล (pump standby) = null ไม่ใช่ 0', () => {
    const slots = [bkk(2026, 10, 12, 10), bkk(2026, 10, 12, 13)];
    const rows = [{ pump: 'A', slotTime: slots[0], tg3602: 108, tg3603: 65 }];
    const s = buildSeries(slots, rows, 'A');
    expect(s.tg3602).toEqual([108, null]);
    expect(s.tg3603).toEqual([65, null]);
    expect(s.diff).toEqual([43, null]);
  });

  it('buildSeries ไม่เอา reading ที่ voided และไม่ปนข้าม pump', () => {
    const slots = [bkk(2026, 10, 12, 10)];
    const rows = [
      { pump: 'A', slotTime: slots[0], tg3602: 108, tg3603: 65, voided: true },
      { pump: 'C', slotTime: slots[0], tg3602: 128, tg3603: 105 },
    ];
    expect(buildSeries(slots, rows, 'A').tg3602).toEqual([null]);
    expect(buildSeries(slots, rows, 'C').tg3602).toEqual([128]);
  });

  it('summarize: max/avg ไม่นับ null', () => {
    expect(summarize([100, null, 110, 120])).toEqual({ max: 120, avg: 110, count: 3 });
    expect(summarize([null, null])).toEqual({ max: null, avg: null, count: 0 });
  });

  it('escapeCsv กันเครื่องหมายคำพูด/คอมมา/บรรทัดใหม่ และกัน CSV injection', () => {
    expect(escapeCsv('a,b')).toBe('"a,b"');
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsv('=SUM(A1)')).toBe("\"'=SUM(A1)\"");
    expect(escapeCsv(42)).toBe('42');
  });
});

describe('กราฟยาวตามรอบเดิน pump', () => {
  const rd = (pump, h, tg3602 = 100, tg3603 = 80, day = 12) => ({ pump, slotTime: bkk(2026, 10, day, h), tg3602, tg3603, voided: false });

  it('runStartOf: ใช้เวลาที่สลับให้ pump นี้เดินล่าสุด', () => {
    const events = [
      { type: 'switch', start: 'A', stop: 'B', at: bkk(2026, 10, 8, 9, 15) },
      { type: 'switch', start: 'A', stop: 'C', at: bkk(2026, 10, 11, 16, 20) },
    ];
    expect(runStartOf('A', events, [rd('A', 10, 100, 80, 7)])).toBe(bkk(2026, 10, 11, 16, 20));
  });

  it('runStartOf: เคยถูกสลับให้หยุดทีหลัง → เริ่มนับจากค่าแรกหลังหยุด', () => {
    const events = [
      { type: 'switch', start: 'A', stop: 'B', at: bkk(2026, 10, 8, 9) },
      { type: 'switch', start: 'C', stop: 'A', at: bkk(2026, 10, 10, 9) },
    ];
    const readings = [rd('A', 4, 100, 80, 9), rd('A', 13, 100, 80, 11), rd('A', 16, 100, 80, 11)];
    expect(runStartOf('A', events, readings)).toBe(bkk(2026, 10, 11, 13));
    expect(runStartOf('A', events, [rd('A', 4, 100, 80, 9)])).toBeNull();
  });

  it('runStartOf: ไม่มี event เลย → ค่าที่จดครั้งแรก (ไม่นับที่ยกเลิก) · ไม่มีข้อมูล → null', () => {
    const readings = [{ ...rd('A', 1, 100, 80, 6), voided: true }, rd('A', 4, 100, 80, 7), rd('A', 7, 100, 80, 7), rd('B', 1, 100, 80, 3)];
    expect(runStartOf('A', [], readings)).toBe(bkk(2026, 10, 7, 4));
    expect(runStartOf('C', [], readings)).toBeNull();
  });

  it('buildLongSeries: slot ที่ขาดเป็น null (ไม่ใช่ 0) และไม่ต่อท้ายด้วยช่องว่างหลังค่าสุดท้าย', () => {
    const readings = [rd('A', 16, 110, 70), rd('A', 22, 112, 68), rd('B', 19, 1, 1)];
    const s = buildLongSeries(readings, 'A', bkk(2026, 10, 12, 16));
    expect(s.slots).toEqual([bkk(2026, 10, 12, 16), bkk(2026, 10, 12, 19), bkk(2026, 10, 12, 22)]);
    expect(s.tg3602).toEqual([110, null, 112]);
    expect(s.tg3603).toEqual([70, null, 68]);
    expect(s.diff).toEqual([40, null, 44]);
  });

  it('buildLongSeries: slot ก่อนจุดเริ่มเกิน 90 นาทีไม่ถูกรวม แต่ slot ที่จดคาบเกี่ยวถูกรวม', () => {
    const readings = [rd('A', 13), rd('A', 16), rd('A', 19)];
    const s = buildLongSeries(readings, 'A', bkk(2026, 10, 12, 16, 20)); // สลับ 16:20 · slot 16:00 อยู่ภายใน 90 นาที
    expect(s.slots).toEqual([bkk(2026, 10, 12, 16), bkk(2026, 10, 12, 19)]);
  });

  it('buildLongSeries: ไม่มีข้อมูล → ซีรีส์ว่าง', () => {
    expect(buildLongSeries([], 'A', 0)).toEqual({ slots: [], tg3602: [], tg3603: [], diff: [] });
  });

  it('runWindowOf: pump ที่กำลัง RUN → เริ่มจากจุดเริ่มรอบ ปลายเปิด', () => {
    const events = [{ type: 'switch', start: 'A', stop: 'B', at: bkk(2026, 10, 8, 9) }];
    expect(runWindowOf('A', events, [], true)).toEqual({ start: bkk(2026, 10, 8, 9), end: null });
    expect(runWindowOf('A', [], [], true)).toBeNull();
  });

  it('runWindowOf: pump ที่หยุดแล้ว → รอบเดินก่อนหยุด (เริ่มตอนสลับเข้า จบตอนสลับออก)', () => {
    const events = [
      { type: 'switch', start: 'A', stop: 'B', at: bkk(2026, 10, 2, 9) },
      { type: 'switch', start: 'B', stop: 'A', at: bkk(2026, 10, 12, 9) },
    ];
    expect(runWindowOf('A', events, [], false)).toEqual({ start: bkk(2026, 10, 2, 9), end: bkk(2026, 10, 12, 9) });
  });

  it('runWindowOf: หยุดแล้วแต่ไม่มี event เริ่ม → ใช้ค่าที่จดแรกสุดก่อนหยุด · ไม่มีค่าเลย = null', () => {
    const events = [{ type: 'switch', start: 'B', stop: 'A', at: bkk(2026, 10, 12, 9) }];
    const readings = [rd('A', 4, 100, 80, 5), rd('A', 7, 100, 80, 11), rd('A', 13, 100, 80, 13)]; // ตัวหลังสุดจดหลังหยุดไปไกล
    expect(runWindowOf('A', events, readings, false)).toEqual({ start: bkk(2026, 10, 5, 4), end: bkk(2026, 10, 12, 9) });
    expect(runWindowOf('A', events, [], false)).toBeNull();
  });

  it('runWindowOf: ไม่ RUN แต่ไม่มี event หยุด → ปลายเปิด (จบที่ค่าสุดท้ายที่จด)', () => {
    expect(runWindowOf('A', [], [rd('A', 7, 100, 80, 5), rd('A', 10, 100, 80, 6)], false)).toEqual({ start: bkk(2026, 10, 5, 7), end: null });
    const events = [{ type: 'switch', start: 'A', stop: 'B', at: bkk(2026, 10, 8, 9) }];
    expect(runWindowOf('A', events, [], false)).toEqual({ start: bkk(2026, 10, 8, 9), end: null });
  });

  it('buildLongSeries: toMs ตัดค่าหลังหยุด แต่ slot ที่จดก่อนเวลาสลับเล็กน้อยยังรวม', () => {
    const readings = [rd('A', 7), rd('A', 10), rd('A', 13), rd('A', 16)];
    const s = buildLongSeries(readings, 'A', bkk(2026, 10, 12, 0), bkk(2026, 10, 12, 9, 55)); // สลับ 09:55 · slot 10:00 จดไว้ก่อน
    expect(s.slots).toEqual([bkk(2026, 10, 12, 7), bkk(2026, 10, 12, 10)]);
  });

  it('formatDateTime เป็น dd/MM HH:mm เวลาไทย', () => {
    expect(formatDateTime(bkk(2026, 10, 7, 22))).toBe('07/10 22:00');
  });
});
