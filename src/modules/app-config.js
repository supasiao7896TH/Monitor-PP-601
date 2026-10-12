export const APP_VERSION = '0.1.0';

/** ค่าเริ่มต้นของเกณฑ์ — TG-3603 ต้อง "มากกว่า" 70 (พี่ A ยืนยัน 2026-10-12) · Diff ≥ 20 ยังเป็นข้อสันนิษฐาน */
export const DEFAULT_LIMITS = Object.freeze({
  tg3603Target: 70,
  tg3603Direction: 'above',
  diffTarget: 20,
  diffDirection: 'above',
});

/** สถานะเริ่มต้นเมื่อยังไม่เคยตั้ง (A, C เดิน / B standby ตามข้อมูล Excel) */
export const DEFAULT_STATUS = Object.freeze({ A: 'RUN', B: 'STANDBY', C: 'RUN' });

export const STATE_LABEL = Object.freeze({ RUN: 'RUN', STANDBY: 'STANDBY', CLEANING: 'กำลังล้าง' });
export const TARGET_LABEL = Object.freeze({ pump: 'ตัว pump', oil_cooler: 'oil cooler', both: 'pump + oil cooler' });

export const POINT_LABEL = Object.freeze({
  tg3602: 'TG-3602 (oil in)',
  tg3603: 'TG-3603 (oil out)',
});
