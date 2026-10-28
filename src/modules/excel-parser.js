/**
 * EXCEL_PARSER — แปลงข้อมูลจาก Sheet2 ใน Monitor temp pump PP-601.xlsx เป็น Firestore Readings & Events
 * ทำงานเป็น Pure Functions ไม่มี DOM dependency เพื่อให้ทดสอบได้ง่ายและแม่นยำ
 */
import { readingId, shiftOf } from './shift-logic.js';

const HOUR = 3600 * 1000;

/**
 * แปลง Excel serial date และ time fraction เป็น Epoch MS เวลาไทย (UTC+7)
 * @param {number|string} rawDate - วันที่ Excel (เช่น 46255)
 * @param {number|string} rawTime - เวลา Excel (เช่น 0.666667)
 */
export function parseExcelDateTime(rawDate, rawTime) {
  let dNum = Number(rawDate);
  // แก้ไขปีที่พิมพ์ผิดใน Excel (เช่น 42606 คือปี 2016 → 46258 คือ 2026-08-24)
  if (dNum > 0 && dNum < 45000) {
    dNum += 3652;
  }

  // 25569 = จำนวนวันระหว่าง 1899-12-30 ถึง 1970-01-01
  const utcDayStartMs = (dNum - 25569) * 86400 * 1000;
  const d = new Date(utcDayStartMs);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth(); // 0-indexed
  const day = d.getUTCDate();

  // เวลาใน Excel: 1 วัน = 1.0, 1 ชม. = 1/24
  const tNum = Number(rawTime);
  const hour = Math.round(tNum * 24) % 24;

  // เวลาไทย (UTC+7) → UTC คือ hour - 7
  return Date.UTC(y, mo, day, hour - 7, 0);
}

const isNum = (v) => v !== '' && v != null && Number.isFinite(Number(v));

/**
 * แปลงข้อมูล 1 แถวของ Excel เป็นรายการ Reading Documents
 */
export function parseRowToReadings(row, prevDate) {
  let dateVal = row.A ? Number(row.A) : prevDate;
  if (dateVal > 0 && dateVal < 45000) dateVal += 3652;

  if (!dateVal || !row.B) {
    return { readings: [], nextDate: dateVal };
  }

  const slotMs = parseExcelDateTime(dateVal, row.B);
  const shiftId = shiftOf(slotMs);
  const note = String(row.N ?? '').trim().slice(0, 200);

  const readings = [];
  const pumpCols = [
    { pump: 'A', inCol: 'C', outCol: 'D' },
    { pump: 'B', inCol: 'E', outCol: 'F' },
    { pump: 'C', inCol: 'G', outCol: 'H' },
  ];

  for (const { pump, inCol, outCol } of pumpCols) {
    const rawIn = row[inCol];
    const rawOut = row[outCol];
    if (isNum(rawIn) && isNum(rawOut)) {
      readings.push({
        id: readingId(pump, slotMs),
        pump,
        slotTime: slotMs,
        shiftId,
        tg3602: Number(rawIn),
        tg3603: Number(rawOut),
        note,
        recordedBy: 'Excel Import',
        voided: false,
        updatedAt: Date.now(),
      });
    }
  }

  return { readings, nextDate: dateVal };
}

/**
 * ตรวจสอบความถูกต้องของ Reading ตามข้อกำหนด firestore.rules
 */
export function validateSeedReading(d) {
  if (!d || typeof d !== 'object') return false;
  if (typeof d.id !== 'string' || !/^[ABC]_[0-9]{12}$/.test(d.id)) return false;

  const allowedKeys = [
    'id',
    'pump',
    'slotTime',
    'shiftId',
    'tg3602',
    'tg3603',
    'note',
    'recordedBy',
    'voided',
    'voidedBy',
    'updatedAt',
  ];
  for (const k of Object.keys(d)) {
    if (!allowedKeys.includes(k)) return false;
  }

  if (!['A', 'B', 'C'].includes(d.pump)) return false;
  if (typeof d.slotTime !== 'number') return false;
  if (typeof d.tg3602 !== 'number' || d.tg3602 < 0 || d.tg3602 > 300) return false;
  if (typeof d.tg3603 !== 'number' || d.tg3603 < 0 || d.tg3603 > 300) return false;
  if (typeof d.recordedBy !== 'string' || d.recordedBy.length > 40) return false;
  if (d.note != null && (typeof d.note !== 'string' || d.note.length > 200)) return false;
  if (d.voided != null && typeof d.voided !== 'boolean') return false;

  return true;
}

/**
 * สกัด Switch Events จากการเปลี่ยนชุดปั๊มที่เดินในแต่ละ Slot
 */
export function detectSwitchEvents(allReadings) {
  const bySlot = new Map();
  for (const r of allReadings) {
    if (r.voided) continue;
    if (!bySlot.has(r.slotTime)) bySlot.set(r.slotTime, new Set());
    bySlot.get(r.slotTime).add(r.pump);
  }

  const sortedSlots = [...bySlot.keys()].sort((a, b) => a - b);
  const events = [];
  let prevRunning = null;

  for (const slot of sortedSlots) {
    const running = bySlot.get(slot);
    if (prevRunning) {
      const stopped = [...prevRunning].filter((p) => !running.has(p));
      const started = [...running].filter((p) => !prevRunning.has(p));

      if (stopped.length === 1 && started.length === 1) {
        events.push({
          type: 'switch',
          at: slot,
          stop: stopped[0],
          start: started[0],
          reason: 'สลับเดินตามประวัติ Excel',
          by: 'Excel Import',
          createdAt: Date.now(),
        });
      }
    }
    prevRunning = running;
  }

  return events;
}
