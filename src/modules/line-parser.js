/**
 * LINE_PARSER — ถอดรหัสข้อความจากกลุ่ม LINE เป็นข้อมูลอุณหภูมิ PP-601
 * ฟังก์ชันล้วน (Pure Function) ทดสอบได้ง่ายและแม่นยำ
 */
import { nearestSlot, calcDiff, formatTime, readingId, shiftOf } from './shift-logic.js';

const HOUR = 3600 * 1000;
const BKK_OFFSET = 7 * HOUR;

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

/**
 * วิเคราะห์และแยกแยะข้อความจากแชต LINE
 * @param {string} text - ข้อความที่ผู้ใช้พิมพ์ในกลุ่ม
 * @param {number} refDateMs - เวลาที่ได้รับข้อความ (ms)
 * @returns {object} ผลการสกัดข้อมูล
 */
export function parseLineMessage(text, refDateMs = Date.now()) {
  if (typeof text !== 'string') return { isPumpReport: false };
  const cleaned = text.trim();
  if (!cleaned) return { isPumpReport: false };

  // ตรวจสอบเบื้องต้น: ต้องมีรูปแบบตัวเลขคู่ เช่น 108/65 หรือคำว่า temp gauge
  const tempPairRegex = /\b(\d{2,3}(?:\.\d+)?)\s*[/]\s*(\d{2,3}(?:\.\d+)?)\b/;
  if (!tempPairRegex.test(cleaned)) {
    return { isPumpReport: false };
  }

  // 1. สกัดเวลาจากข้อความ (เช่น 22:00, 07:00, 19.30)
  const timeMatch = /(?:^|\s)(\d{1,2})[:.](\d{2})(?:\s*(?:น\.?|hrs?))?/i.exec(cleaned);
  let slotTime;

  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10);
    const mi = parseInt(timeMatch[2], 10);
    const bp = bkkParts(refDateMs);

    // สร้างเวลาไทย แล้วแปลงเป็น UTC
    let targetMs = Date.UTC(bp.y, bp.mo - 1, bp.d, h - 7, mi);
    // หากเวลาที่ระบุต่างจากเวลาปัจจุบันเกิน 12 ชม. (เช่น ส่งตอน 00:30 แต่ระบุ 22:00)
    if (targetMs - refDateMs > 12 * HOUR) targetMs -= 24 * HOUR;
    else if (refDateMs - targetMs > 12 * HOUR) targetMs += 24 * HOUR;

    slotTime = nearestSlot(targetMs);
  } else {
    slotTime = nearestSlot(refDateMs);
  }

  // 2. สกัดข้อมูลแยกตามปั๊ม A, B, C
  // รองรับรูปแบบ:
  //   A \n Temp 125/77
  //   A \n Temp gauge = 108/65
  //   PP-601A: 115/88 (หมายเหตุ)
  //   C 128/105
  const pumpPattern = /(?:PP[- ]?601\s*|\b)([ABC])\b[\s:=]*(?:\d{1,2}[:.]\d{2}(?:\s*(?:น\.?|hrs?))?)?[\s:=]*(?:(?:temp(?:\s*gauge)?|TG(?:-\d{4})?)\s*[:=]?\s*|\s*)(\d{2,3}(?:\.\d+)?)\s*[/]\s*(\d{2,3}(?:\.\d+)?)(?:[^\n()]*\(([^)]+)\))?/gi;

  const readings = [];
  let match;

  while ((match = pumpPattern.exec(cleaned)) !== null) {
    const pump = match[1].toUpperCase();
    const tg3602 = parseFloat(match[2]);
    const tg3603 = parseFloat(match[3]);
    const note = (match[4] ?? '').trim().slice(0, 200);

    // ตรวจสอบช่วงอุณหภูมิที่สมเหตุสมผล
    if (tg3602 >= 0 && tg3602 <= 300 && tg3603 >= 0 && tg3603 <= 300) {
      readings.push({
        id: readingId(pump, slotTime),
        pump,
        slotTime,
        shiftId: shiftOf(slotTime),
        tg3602,
        tg3603,
        diff: calcDiff(tg3602, tg3603),
        note,
      });
    }
  }

  if (readings.length === 0) {
    return { isPumpReport: false };
  }

  // เรียงตามปั๊ม A, B, C
  readings.sort((a, b) => a.pump.localeCompare(b.pump));

  // 3. ร่างข้อความตอบกลับยืนยัน (Confirmation Reply)
  const timeStr = formatTime(slotTime);
  const lines = [
    `✓ บันทึกค่า PP-601 รอบ ${timeStr} เรียบร้อย`,
    ...readings.map((r) => {
      const noteStr = r.note ? ` (${r.note})` : '';
      return `• PP-601${r.pump}: ${r.tg3602}/${r.tg3603} (Diff ${r.diff})${noteStr}`;
    }),
  ];

  // ตรวจเตือนเกณฑ์ (TG-3603 < 70 หรือ Diff < 20)
  const alarms = [];
  for (const r of readings) {
    if (r.tg3603 < 70) alarms.push(`⚠ PP-601${r.pump} TG-3603 ต่ำกว่าเกณฑ์ (${r.tg3603} < 70 °C)`);
    if (r.diff != null && r.diff < 20) alarms.push(`⚠ PP-601${r.pump} Diff ต่ำกว่าเกณฑ์ (${r.diff} < 20 °C)`);
  }

  if (alarms.length > 0) {
    lines.push('', ...alarms);
  }

  return {
    isPumpReport: true,
    ok: true,
    slotTime,
    readings,
    replyText: lines.join('\n'),
  };
}

/**
 * ตรวจสอบลายเซ็น HMAC-SHA256 จาก LINE Webhook
 * @param {string} body - Request body แบบ Raw Text
 * @param {string} signature - ค่าจาก Header x-line-signature
 * @param {string} channelSecret - Channel Secret จาก LINE Console
 */
export async function verifyLineSignature(body, signature, channelSecret) {
  if (!signature || !channelSecret) return false;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(channelSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sigBytes = await crypto.subtle.sign('HMAC', key, enc.encode(body));
    const computed = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
    return computed === signature;
  } catch {
    return false;
  }
}

