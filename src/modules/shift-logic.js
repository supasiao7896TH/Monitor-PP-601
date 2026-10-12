/**
 * SHIFT_LOGIC — ฟังก์ชันล้วน (ไม่แตะ DOM/Firebase) เพื่อให้เทสต์ง่าย
 *
 * เวลาทั้งหมดคำนวณเป็น "เวลาไทย (UTC+7)" ด้วย offset คงที่ ไม่พึ่ง timezone ของเครื่อง
 * เพราะประเทศไทยไม่มี DST และผลต้องเหมือนกันทั้งบนมือถือ/เซิร์ฟเวอร์ CI
 */

const HOUR = 3600 * 1000;
const BKK_OFFSET = 7 * HOUR;

/** slot การจดค่า (ชม. เวลาไทย) — ตามตาราง Excel เดิม: ทุก 3 ชม. */
export const SLOT_HOURS = [1, 4, 7, 10, 13, 16, 19, 22];
export const PUMPS = ['A', 'B', 'C'];

/** กะเช้า 07:30–19:30 · กะดึก 19:30–07:30 (นาทีนับจาก 00:00) */
const DAY_START_MIN = 7 * 60 + 30;
const DAY_END_MIN = 19 * 60 + 30;

const TEMP_MIN = 0;
const TEMP_MAX = 300;

const pad = (n, len = 2) => String(n).padStart(len, '0');

function bkkParts(ms) {
  const d = new Date(ms + BKK_OFFSET);
  return {
    y: d.getUTCFullYear(),
    mo: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
  };
}

function fromBkk(y, mo, d, h = 0, mi = 0) {
  return Date.UTC(y, mo - 1, d, h - 7, mi);
}

/** 'YYYYMMDDHHmm' ของ slot (เวลาไทย) */
export function slotKey(ms) {
  const p = bkkParts(ms);
  return `${p.y}${pad(p.mo)}${pad(p.d)}${pad(p.h)}${pad(p.mi)}`;
}

/** ปัดเวลาจริงเข้า slot ที่ใกล้ที่สุด (grid 3 ชม. เริ่มที่ 01:00) */
export function nearestSlot(ms) {
  const local = ms + BKK_OFFSET;
  const anchor = HOUR;
  const step = 3 * HOUR;
  const snapped = Math.round((local - anchor) / step) * step + anchor;
  return snapped - BKK_OFFSET;
}

/** 'HH:MM' ของเวลา (เวลาไทย) */
export function formatTime(ms) {
  const p = bkkParts(ms);
  return `${pad(p.h)}:${pad(p.mi)}`;
}

/** จด slot ล่วงหน้าได้ไม่เกินกี่นาทีก่อนถึงเวลา slot (ย้อนหลังจดได้เสมอ) */
export const SLOT_LEAD_MIN = 120;

/** slot นี้เปิดให้จดตอนนี้หรือยัง */
export function isSlotOpen(slotMs, nowMs) {
  return slotMs - nowMs <= SLOT_LEAD_MIN * 60 * 1000;
}

/** ข้อความบอกว่าเวลาจริงตอนนี้จะถูกจดเป็น slot ไหน (หรือ slot นี้จะเปิดเมื่อไร) */
export function slotHint(slotMs, nowMs) {
  if (!isSlotOpen(slotMs, nowMs)) {
    return `slot ${formatTime(slotMs)} ยังไม่เปิดให้จด — เปิดเวลา ${formatTime(slotMs - SLOT_LEAD_MIN * 60 * 1000)}`;
  }
  const diffMin = Math.round((slotMs - nowMs) / 60000);
  const span = (m) => (m >= 60 ? `${Math.floor(m / 60)} ชม.${m % 60 ? ` ${m % 60} นาที` : ''}` : `${m} นาที`);
  const rel = diffMin === 0 ? 'ตรงเวลา' : diffMin > 0 ? `ก่อนเวลา ${span(diffMin)}` : `หลังเวลา ${span(-diffMin)}`;
  return `ตอนนี้ ${formatTime(nowMs)} → จดเป็น slot ${formatTime(slotMs)} (${rel})`;
}

const dateStr = (y, mo, d) => `${y}-${pad(mo)}-${pad(d)}`;

/** id ของกะ เช่น '2026-10-12_D' · กะดึกตั้งชื่อตามวันที่เริ่มกะ */
export function shiftOf(ms) {
  const p = bkkParts(ms);
  const min = p.h * 60 + p.mi;
  if (min >= DAY_START_MIN && min < DAY_END_MIN) return `${dateStr(p.y, p.mo, p.d)}_D`;
  if (min >= DAY_END_MIN) return `${dateStr(p.y, p.mo, p.d)}_N`;
  const prev = bkkParts(ms - 24 * HOUR);
  return `${dateStr(prev.y, prev.mo, prev.d)}_N`;
}

function parseShift(id) {
  const m = /^(\d{4})-(\d{2})-(\d{2})_([DN])$/.exec(id);
  if (!m) throw new Error(`รูปแบบ shift id ไม่ถูกต้อง: ${id}`);
  return { y: +m[1], mo: +m[2], d: +m[3], kind: m[4] };
}

export function shiftRange(id) {
  const { y, mo, d, kind } = parseShift(id);
  if (kind === 'D') {
    return { start: fromBkk(y, mo, d, 7, 30), end: fromBkk(y, mo, d, 19, 30) };
  }
  const start = fromBkk(y, mo, d, 19, 30);
  return { start, end: start + 12 * HOUR };
}

/** 4 slot ของกะ เรียงตามเวลา */
export function shiftSlots(id) {
  const { y, mo, d, kind } = parseShift(id);
  if (kind === 'D') return [10, 13, 16, 19].map((h) => fromBkk(y, mo, d, h));
  const first = fromBkk(y, mo, d, 22);
  return [first, first + 3 * HOUR, first + 6 * HOUR, first + 9 * HOUR];
}

/** id ของกะก่อนหน้า/ถัดไป (ใช้เลื่อนดูรายงาน) */
export function adjacentShift(id, dir) {
  const { start } = shiftRange(id);
  return shiftOf(start + (dir > 0 ? 13 * HOUR : -1 * HOUR));
}

/** ชื่อกะสำหรับแสดงผล เช่น 'กะเช้า 12/10/2026 07:30–19:30' */
export function shiftLabel(id) {
  const { y, mo, d, kind } = parseShift(id);
  const date = `${pad(d)}/${pad(mo)}/${y}`;
  return kind === 'D' ? `กะเช้า ${date} 07:30–19:30` : `กะดึก ${date} 19:30–07:30`;
}

/** 1 doc ต่อ pump ต่อ slot — จดซ้ำ slot เดิม = ทับ doc เดิม */
export function readingId(pump, slotMs) {
  return `${pump}_${slotKey(slotMs)}`;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Diff = TG-3602 (oil in) − TG-3603 (oil out) ปัด 1 ตำแหน่งกัน floating point */
export function calcDiff(tg3602, tg3603) {
  if (!isNum(tg3602) || !isNum(tg3603)) return null;
  return Math.round((tg3602 - tg3603) * 10) / 10;
}

function parseTemp(raw) {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return NaN;
  const s = raw.trim().replace(',', '.');
  if (s === '') return NaN;
  return Number(s);
}

export function validateReading({ tg3602, tg3603 }) {
  const a = parseTemp(tg3602);
  const b = parseTemp(tg3603);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { ok: false, error: 'กรอกค่า TG-3602 และ TG-3603 เป็นตัวเลข' };
  }
  if (a < TEMP_MIN || a > TEMP_MAX || b < TEMP_MIN || b > TEMP_MAX) {
    return { ok: false, error: `ค่าต้องอยู่ระหว่าง ${TEMP_MIN}–${TEMP_MAX} °C` };
  }
  return { ok: true, tg3602: a, tg3603: b };
}

function flag(value, target, direction) {
  if (!isNum(value) || !isNum(target)) return 'none';
  const bad = direction === 'below' ? value > target : value < target;
  return bad ? 'alarm' : 'ok';
}

/**
 * ติดธงตาม limit — direction คือ "ค่าควรอยู่ฝั่งไหนของ target"
 *   'below' = ควรไม่เกิน target · 'above' = ควรไม่ต่ำกว่า target
 * ไม่มี limit (null) = ไม่ติดธง (ไม่เดาเกณฑ์เอง)
 */
export function evaluate({ tg3602, tg3603 }, limits) {
  return {
    tg3603: flag(tg3603, limits.tg3603Target, limits.tg3603Direction),
    diff: flag(calcDiff(tg3602, tg3603), limits.diffTarget, limits.diffDirection),
  };
}

const STATES = ['RUN', 'STANDBY', 'CLEANING'];

/** ต้อง RUN 2 ตัว ตัวที่เหลือเป็น STANDBY หรือ CLEANING */
export function validateStatus(status) {
  const values = PUMPS.map((p) => status?.[p]);
  if (values.some((v) => !STATES.includes(v))) return { ok: false, error: 'สถานะ pump ไม่ถูกต้อง' };
  if (values.filter((v) => v === 'RUN').length !== 2) {
    return { ok: false, error: 'ต้อง RUN 2 ตัวพอดี' };
  }
  return { ok: true };
}

export function recordablePumps(status) {
  return PUMPS.filter((p) => status?.[p] === 'RUN');
}

function checked(next) {
  const v = validateStatus(next);
  return v.ok ? { ok: true, status: next } : v;
}

export function applySwitch(status, { stop, start }) {
  if (status[stop] !== 'RUN') return { ok: false, error: `PP-601${stop} ไม่ได้ RUN` };
  if (status[start] !== 'STANDBY') return { ok: false, error: `PP-601${start} ไม่ได้ STANDBY` };
  return checked({ ...status, [stop]: 'STANDBY', [start]: 'RUN' });
}

export function startCleaning(status, pump) {
  if (status[pump] !== 'STANDBY') return { ok: false, error: `PP-601${pump} ต้องเป็น STANDBY ก่อนเริ่มล้าง` };
  return checked({ ...status, [pump]: 'CLEANING' });
}

export function finishCleaning(status, pump) {
  if (status[pump] !== 'CLEANING') return { ok: false, error: `PP-601${pump} ไม่ได้อยู่ระหว่างล้าง` };
  return checked({ ...status, [pump]: 'STANDBY' });
}

/** ข้อความ LINE รูปแบบเดิมของ F/O: '22:00\nA\nTemp gauge = 108/65\n\nC\n...' */
export function formatLineMessage(slotMs, readings) {
  const blocks = readings
    .filter((r) => !r.voided)
    .sort((a, b) => a.pump.localeCompare(b.pump))
    .map((r) => `${r.pump}\nTemp gauge = ${r.tg3602}/${r.tg3603}`);
  return [formatTime(slotMs), blocks.join('\n\n')].filter(Boolean).join('\n');
}

/** ซีรีส์สำหรับกราฟ — slot ที่ไม่มีข้อมูลเป็น null (ไม่ใช่ 0) */
export function buildSeries(slots, readings, pump) {
  const tg3602 = [];
  const tg3603 = [];
  const diff = [];
  for (const slot of slots) {
    const r = readings.find((x) => x.pump === pump && x.slotTime === slot && !x.voided);
    tg3602.push(r ? r.tg3602 : null);
    tg3603.push(r ? r.tg3603 : null);
    diff.push(r ? calcDiff(r.tg3602, r.tg3603) : null);
  }
  return { tg3602, tg3603, diff };
}

/** ดึงข้อมูลย้อนหลังสูงสุดกี่วันสำหรับกราฟยาว (คุมโควต้า Firestore) */
export const LONG_CHART_MAX_DAYS = 90;
/** slot ที่จดคาบเกี่ยวก่อนเวลาสลับ pump (จดช้า) ยังนับเป็นรอบเดินนี้ได้ไม่เกินเท่านี้ */
const RUN_START_TOLERANCE_MS = 90 * 60 * 1000;

/**
 * เวลาเริ่มรอบเดินปัจจุบันของ pump (ms) — ใช้ event 'switch' ล่าสุดที่ให้ pump นี้เดิน
 * ถ้า pump ถูกสั่งหยุดทีหลัง/ไม่มี event → ใช้ค่าที่จดตัวแรกหลังจุดนั้น · ไม่มีข้อมูลเลย = null
 */
export function runStartOf(pump, events, readings) {
  const sw = events.filter((e) => e.type === 'switch');
  const lastStart = Math.max(-Infinity, ...sw.filter((e) => e.start === pump).map((e) => e.at));
  const lastStop = Math.max(-Infinity, ...sw.filter((e) => e.stop === pump).map((e) => e.at));
  if (lastStart > -Infinity && lastStart >= lastStop) return lastStart;
  const mine = readings.filter((r) => r.pump === pump && !r.voided && r.slotTime > lastStop).map((r) => r.slotTime);
  return mine.length > 0 ? Math.min(...mine) : null;
}

/**
 * ซีรีส์กราฟยาวตั้งแต่ fromMs ถึงค่าสุดท้ายที่จด — ทุก slot 3 ชม. ต่อเนื่อง
 * slot ที่ไม่มีข้อมูลเป็น null เพื่อให้เส้นขาด (ห้ามเป็น 0)
 */
export function buildLongSeries(readings, pump, fromMs) {
  const bySlot = new Map();
  for (const r of readings) {
    if (r.pump === pump && !r.voided && r.slotTime >= fromMs - RUN_START_TOLERANCE_MS) bySlot.set(r.slotTime, r);
  }
  const out = { slots: [], tg3602: [], tg3603: [], diff: [] };
  if (bySlot.size === 0) return out;
  const keys = [...bySlot.keys()];
  const last = Math.max(...keys);
  for (let t = Math.min(...keys); t <= last; t += 3 * HOUR) {
    const r = bySlot.get(t);
    out.slots.push(t);
    out.tg3602.push(r ? r.tg3602 : null);
    out.tg3603.push(r ? r.tg3603 : null);
    out.diff.push(r ? calcDiff(r.tg3602, r.tg3603) : null);
  }
  return out;
}

/** 'dd/MM HH:mm' (เวลาไทย) */
export function formatDateTime(ms) {
  const p = bkkParts(ms);
  return `${pad(p.d)}/${pad(p.mo)} ${pad(p.h)}:${pad(p.mi)}`;
}

export function summarize(values) {
  const nums = values.filter(isNum);
  if (nums.length === 0) return { max: null, avg: null, count: 0 };
  const sum = nums.reduce((a, b) => a + b, 0);
  return {
    max: Math.max(...nums),
    avg: Math.round((sum / nums.length) * 10) / 10,
    count: nums.length,
  };
}

/** escape ช่อง CSV + กัน formula injection (= + - @) เมื่อเปิดใน Excel */
export function escapeCsv(value) {
  if (typeof value === 'number') return String(value);
  let s = value == null ? '' : String(value);
  let forceQuote = false;
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
    forceQuote = true;
  }
  if (forceQuote || /[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
