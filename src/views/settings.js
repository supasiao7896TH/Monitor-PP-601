import { h, toast } from '../modules/ui-renderer.js';
import { validateStatus, escapeCsv, calcDiff, formatTime, PUMPS } from '../modules/shift-logic.js';
import { STATE_LABEL, APP_VERSION } from '../modules/app-config.js';

const num = (v) => {
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

export function mount(root, { repo, store, applyTheme }) {
  const limits = store.get('limits');
  const status = store.get('status');

  const name = h('input', { id: 'st-name', class: 'input', maxLength: 40, value: store.get('name') ?? '', oninput: (e) => store.set('name', e.target.value.trim()) });
  const t3603 = h('input', { id: 'st-t3603', class: 'input num', inputMode: 'decimal', value: limits.tg3603Target ?? '' });
  const d3603 = h('select', { id: 'st-d3603', class: 'input' }, [['above', 'ไม่ต่ำกว่า (≥)'], ['below', 'ไม่เกิน (≤)']].map(([v, l]) => h('option', { value: v, selected: limits.tg3603Direction === v }, l)));
  const tDiff = h('input', { id: 'st-tdiff', class: 'input num', inputMode: 'decimal', value: limits.diffTarget ?? '' });
  const dDiff = h('select', { id: 'st-ddiff', class: 'input' }, [['above', 'ไม่ต่ำกว่า (≥)'], ['below', 'ไม่เกิน (≤)']].map(([v, l]) => h('option', { value: v, selected: limits.diffDirection === v }, l)));
  const limErr = h('p', { class: 'form-error', role: 'alert' });

  const saveLimits = async () => {
    const a = num(t3603.value);
    const b = num(tDiff.value);
    if (Number.isNaN(a) || Number.isNaN(b)) return void (limErr.textContent = 'ค่า target ต้องเป็นตัวเลข หรือเว้นว่างถ้ายังไม่ตั้ง');
    limErr.textContent = '';
    const next = { tg3603Target: a, tg3603Direction: d3603.value, diffTarget: b, diffDirection: dDiff.value };
    await repo.saveLimits(next);
    toast('บันทึกเกณฑ์แล้ว', 'ok');
  };

  const stSelects = Object.fromEntries(
    PUMPS.map((p) => [p, h('select', { id: `st-${p}`, class: 'input', 'aria-label': `สถานะ PP-601${p}` }, Object.entries(STATE_LABEL).map(([v, l]) => h('option', { value: v, selected: status[p] === v }, l)))]),
  );
  const stErr = h('p', { class: 'form-error', role: 'alert' });
  const saveStatus = async () => {
    const next = Object.fromEntries(PUMPS.map((p) => [p, stSelects[p].value]));
    const v = validateStatus(next);
    if (!v.ok) return void (stErr.textContent = v.error);
    if (!store.get('name')) return void (stErr.textContent = 'กรอกชื่อก่อน');
    stErr.textContent = '';
    await repo.saveStatus(next, store.get('name'));
    toast('ตั้งสถานะแล้ว', 'ok');
  };

  const theme = h('select', { id: 'st-theme', class: 'input', onchange: (e) => applyTheme(e.target.value) }, [['auto', 'ตามเครื่อง'], ['light', 'สว่าง'], ['dark', 'มืด']].map(([v, l]) => h('option', { value: v, selected: (store.get('theme') ?? 'auto') === v }, l)));

  async function exportCsv() {
    const to = Date.now() + 24 * 3600 * 1000;
    const rows = (await repo.getReadings(to - 31 * 24 * 3600 * 1000, to)).filter((r) => !r.voided).sort((a, b) => a.slotTime - b.slotTime || a.pump.localeCompare(b.pump));
    const head = ['วันที่-เวลา', 'pump', 'TG-3602', 'TG-3603', 'Diff', 'ผู้จด', 'หมายเหตุ'];
    const lines = [head, ...rows.map((r) => [`${new Date(r.slotTime + 7 * 3600e3).toISOString().slice(0, 10)} ${formatTime(r.slotTime)}`, r.pump, r.tg3602, r.tg3603, calcDiff(r.tg3602, r.tg3603), r.recordedBy, r.note])];
    const csv = '﻿' + lines.map((l) => l.map(escapeCsv).join(',')).join('\r\n');
    const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: 'pp601-readings.csv' });
    document.body.append(a);
    a.click();
    a.remove();
    toast(`ส่งออก ${rows.length} รายการ (ย้อนหลัง 31 วัน)`, 'ok');
  }

  // ---------- นำเข้าข้อมูลเริ่มต้นจาก Excel ----------
  const seedStatusEl = h('p', { class: 'caption', role: 'status' }, 'กำลังตรวจสอบประวัติ…');
  const seedBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'นำเข้าข้อมูลย้อนหลัง (1,003 รายการ)');

  repo.getReadings(0, Date.now() + 24 * 3600 * 1000).then((existing) => {
    const valid = (existing ?? []).filter((r) => !r.voided);
    if (valid.length > 0) {
      seedStatusEl.textContent = `ปัจจุบันมีข้อมูลในระบบแล้ว ${valid.length} รายการ (กดปุ่มเพื่ออัปเดตหรือนำเข้าซ้ำได้)`;
    } else {
      seedStatusEl.textContent = 'ยังไม่มีข้อมูลในระบบ — กดปุ่มเพื่อนำเข้าประวัติย้อนหลัง 68 วันจาก Excel';
    }
  }).catch(() => {
    seedStatusEl.textContent = 'กดปุ่มด้านล่างเพื่อนำเข้าข้อมูลย้อนหลังจาก Excel';
  });

  seedBtn.onclick = async () => {
    seedBtn.disabled = true;
    seedStatusEl.textContent = 'กำลังโหลดไฟล์ข้อมูลย้อนหลัง…';
    try {
      const seedMod = await import('../data/seed-data.json');
      const seedData = seedMod.default ?? seedMod;
      seedStatusEl.textContent = `กำลังนำเข้า ${seedData.readings.length} รายการ…`;
      const res = await repo.importSeed(seedData, (done, total) => {
        seedStatusEl.textContent = `กำลังนำเข้า ${done}/${total} รายการ…`;
      });
      toast(`นำเข้าสำเร็จ: ${res.readings} readings, ${res.events} events`, 'ok');
      seedStatusEl.textContent = `✓ นำเข้าข้อมูลประวัติเรียบร้อย (${res.readings} ค่า, ${res.events} เหตุการณ์)`;
    } catch (err) {
      console.error(err);
      toast('นำเข้าข้อมูลไม่สำเร็จ', 'error');
      seedStatusEl.textContent = `เกิดข้อผิดพลาด: ${err?.message ?? 'unknown'}`;
      seedBtn.disabled = false;
    }
  };

  root.append(
    h(
      'div',
      { class: 'stack' },
      h('section', { class: 'card stack' }, h('h2', {}, 'ผู้ใช้'), h('label', { for: 'st-name' }, 'ชื่อผู้จด (จำไว้ในเครื่องนี้)'), name),
      h(
        'section',
        { class: 'card stack' },
        h('h2', {}, 'เกณฑ์เตือน'),
        h('p', { class: 'caption warn-text' }, 'ค่าเริ่มต้น: TG-3603 ต้องมากกว่า 70 (ยืนยันแล้ว) · Diff ต่ำกว่า 20 เป็นข้อสันนิษฐานที่ยังไม่ได้ยืนยันกับหน้างาน · เว้นค่าว่างถ้าไม่ต้องการให้ติดธง'),
        h('label', { for: 'st-t3603' }, 'TG-3603 (oil out) target °C'),
        t3603,
        h('label', { for: 'st-d3603' }, 'TG-3603 ควรอยู่'),
        d3603,
        h('label', { for: 'st-tdiff' }, 'Diff (3602−3603) target °C'),
        tDiff,
        h('label', { for: 'st-ddiff' }, 'Diff ควรอยู่'),
        dDiff,
        limErr,
        h('button', { class: 'btn btn-primary', type: 'button', onclick: saveLimits }, 'บันทึกเกณฑ์'),
      ),
      h(
        'section',
        { class: 'card stack' },
        h('h2', {}, 'ตั้งสถานะ pump เอง'),
        h('p', { class: 'caption' }, 'ใช้เมื่อสถานะในแอปไม่ตรงหน้างาน (ต้อง RUN 2 ตัวพอดี) — การสลับปกติให้ใช้ปุ่ม "สลับ pump"'),
        PUMPS.map((p) => h('div', { class: 'row-between' }, h('label', { for: `st-${p}` }, `PP-601${p}`), stSelects[p])),
        stErr,
        h('button', { class: 'btn btn-outline', type: 'button', onclick: saveStatus }, 'บันทึกสถานะ'),
      ),
      h(
        'section',
        { class: 'card stack' },
        h('h2', {}, 'ข้อมูลเริ่มต้นจาก Excel (Seed Data)'),
        h('p', { class: 'caption' }, 'นำเข้าข้อมูลย้อนหลัง 503 ช่วงเวลา (1,003 ค่า) ระหว่าง 21/08/2569 – 28/10/2569 จากไฟล์ Monitor temp pump PP-601.xlsx'),
        seedStatusEl,
        seedBtn,
      ),
      h('section', { class: 'card stack' }, h('h2', {}, 'ทั่วไป'), h('label', { for: 'st-theme' }, 'ธีม'), theme, h('button', { class: 'btn btn-outline', type: 'button', onclick: exportCsv }, 'ส่งออก CSV (ย้อนหลัง 31 วัน)')),
      h(
        'section',
        { class: 'card brand-card' },
        h(
          'div',
          { class: 'brand-card-row' },
          h(
            'div',
            {},
            h('h3', {}, 'A(i)CODER 2025 Studio'),
            h('p', { class: 'caption' }, 'A-Class WebCraft | Code • Share • Inspire | by Supasit.A'),
            h('p', { class: 'caption' }, 'GC-M PTA (PTTGC Group) · Map Ta Phut, Rayong'),
          ),
          h('img', { src: '/branding/aicoder-badge-2025.png', class: 'brand-card-img', alt: 'A(i)CODER' }),
        ),
      ),
      h('p', { class: 'caption center' }, `v${APP_VERSION} · ${repo.mode === 'firebase' ? 'เชื่อมต่อ Firebase (real-time)' : 'โหมดทดลองในเครื่อง — ยังไม่ sync'} · A-Class WebCraft · by Supasit.A`),
    ),
  );
  return () => {};
}
