import { h, clear, toast, copyText, flagChip } from '../modules/ui-renderer.js';
import {
  nearestSlot,
  isSlotOpen,
  slotHint,
  shiftOf,
  shiftRange,
  shiftSlots,
  shiftLabel,
  readingId,
  calcDiff,
  validateReading,
  evaluate,
  recordablePumps,
  formatLineMessage,
  formatTime,
  PUMPS,
} from '../modules/shift-logic.js';
import { STATE_LABEL, POINT_LABEL } from '../modules/app-config.js';
import { openSwitchDialog } from '../modules/dialogs.js';

const HOUR = 3600 * 1000;

const dayMonth = (ms) => {
  const d = new Date(ms + 7 * HOUR);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** slot ที่เลือกได้: ปัจจุบัน + ย้อนหลัง 24 ชม. (เผื่อจดย้อนหลัง/ลืมจด) */
function slotChoices(now) {
  const cur = nearestSlot(now);
  return Array.from({ length: 9 }, (_, i) => cur - i * 3 * HOUR);
}

export function mount(root, { repo, store }) {
  let slot = nearestSlot(Date.now());
  let manualSlot = false; // ผู้ใช้เลือก slot เอง → ไม่เลื่อนตามเวลาจริงอีก
  let openSig = '';
  const hintEl = h('p', { class: 'caption', id: 'rec-slot-hint', role: 'status' });
  let readings = [];
  let unwatch = () => {};
  const subs = [];
  const touched = new Set();

  const page = h('div', { class: 'stack' });
  root.append(page);

  const statusBox = h('section', { class: 'card' });
  const shiftBox = h('section', { class: 'card' });
  const formBox = h('section', { class: 'card' });
  const brandBanner = h(
    'div',
    { class: 'home-neon-brand', 'aria-label': 'A(i)CODER 2025 Branding' },
    h('img', {
      src: '/branding/d1-neon-arcade-bare.svg',
      class: 'neon-brand-light',
      alt: 'A(i)CODER 2025 Neon Arcade',
      loading: 'lazy',
    }),
    h('img', {
      src: '/branding/d2-crt-night-bare.svg',
      class: 'neon-brand-dark',
      alt: 'A(i)CODER 2025 Neon Arcade',
      loading: 'lazy',
    }),
  );

  page.append(brandBanner, statusBox, shiftBox, formBox);

  const nameInput = h('input', {
    id: 'rec-name',
    class: 'input',
    maxLength: 40,
    placeholder: 'ชื่อผู้จด',
    autocomplete: 'name',
    value: store.get('name') ?? '',
    oninput: (e) => store.set('name', e.target.value.trim()),
  });

  const existing = (pump) => readings.find((r) => r.pump === pump && r.slotTime === slot && !r.voided);

  // ---------- สถานะ pump ----------
  function renderStatus() {
    clear(statusBox);
    const status = store.get('status');
    statusBox.append(
      h('div', { class: 'row-between' }, h('h2', {}, 'สถานะ pump'), h('button', { class: 'btn btn-soft btn-sm', type: 'button', onclick: () => openSwitchDialog({ repo, store }) }, 'สลับ pump')),
      h(
        'div',
        { class: 'pump-grid' },
        PUMPS.map((p) =>
          h(
            'div',
            { class: `pump pump-${status[p].toLowerCase()}` },
            h('span', { class: 'pump-name' }, `PP-601${p}`),
            h('span', { class: 'pump-state' }, STATE_LABEL[status[p]]),
          ),
        ),
      ),
      store.get('statusIsDefault') ? h('p', { class: 'caption warn-text' }, 'ยังไม่เคยตั้งสถานะ — ใช้ค่าเริ่มต้น A,C เดิน / B standby ตรวจให้ตรงหน้างาน (ตั้งได้ที่ "ตั้งค่า")') : null,
    );
  }

  // ---------- ความครบของกะ ----------
  function renderShift() {
    clear(shiftBox);
    const sid = shiftOf(slot);
    const now = Date.now();
    const need = recordablePumps(store.get('status'));
    const slots = shiftSlots(sid);
    const options = slotChoices(now);
    if (!options.includes(slot)) options.push(slot);

    const select = h(
      'select',
      {
        id: 'rec-slot',
        class: 'input',
        onchange: (e) => {
          slot = Number(e.target.value);
          manualSlot = true;
          touched.clear();
          watch();
          renderAll();
        },
      },
      options.map((s) => h('option', { value: s, selected: s === slot }, `${dayMonth(s)} ${formatTime(s)}`)),
    );

    shiftBox.append(
      h('h2', {}, shiftLabel(sid)),
      h('div', { class: 'slot-chips', role: 'group', 'aria-label': 'slot ของกะนี้' }, slots.map((s) => {
        const done = need.length > 0 && need.every((p) => readings.some((r) => r.pump === p && r.slotTime === s && !r.voided));
        const future = !isSlotOpen(s, now);
        const cls = ['slot-chip', done ? 'slot-done' : '', future ? 'slot-future' : '', s === slot ? 'slot-current' : ''].join(' ');
        return h('button', { class: cls, type: 'button', disabled: future, onclick: () => ((slot = s), (manualSlot = true), touched.clear(), watch(), renderAll()) }, `${done ? '✓ ' : ''}${formatTime(s)}`);
      })),
      hintEl,
      h('label', { for: 'rec-slot' }, 'เวลา slot ที่จะจด'),
      select,
    );
    openSig = slots.map((s) => isSlotOpen(s, now)).join();
    updateHint();
  }

  function updateHint() {
    hintEl.textContent = slotHint(slot, Date.now());
  }

  /** ทุกนาที/เมื่อกลับมาที่หน้านี้: ถ้ายังไม่ได้เลือก slot เอง และยังไม่ได้พิมพ์อะไร → เลื่อน slot ตามเวลาจริง */
  function tick() {
    const now = Date.now();
    const next = nearestSlot(now);
    if (!manualSlot && touched.size === 0 && next !== slot) {
      slot = next;
      watch();
      renderAll();
      toast(`เลื่อนเป็น slot ${formatTime(next)} ตามเวลาปัจจุบัน`, 'warn'); // บอกชัดๆ กันเลื่อนเงียบตอนกำลังอ่านค่าจาก DCS
      return;
    }
    updateHint();
    // ปุ่ม slot เปิด/ปิดตามเวลา — วาดใหม่เฉพาะเมื่อสถานะเปลี่ยน (ไม่ปิด dropdown ที่กำลังเปิดอยู่ทุกนาที)
    if (shiftSlots(shiftOf(slot)).map((s) => isSlotOpen(s, now)).join() !== openSig) renderShift();
  }
  const timer = setInterval(tick, 30 * 1000);
  const onVisible = () => document.visibilityState === 'visible' && tick();
  document.addEventListener('visibilitychange', onVisible);

  // ---------- ฟอร์ม ----------
  const inputs = {}; // pump -> { a, b, note, diffOut }

  function renderForm() {
    clear(formBox);
    const status = store.get('status');
    const pumps = PUMPS.filter((p) => recordablePumps(status).includes(p) || existing(p));
    const limits = store.get('limits');

    formBox.append(h('h2', {}, `จดค่า ${formatTime(slot)}`));

    for (const p of pumps) {
      const ex = existing(p);
      const a = h('input', { id: `a-${p}`, class: 'input num', type: 'text', inputMode: 'decimal', autocomplete: 'off', placeholder: '°C', 'aria-label': `PP-601${p} ${POINT_LABEL.tg3602}`, value: ex?.tg3602 ?? '' });
      const b = h('input', { id: `b-${p}`, class: 'input num', type: 'text', inputMode: 'decimal', autocomplete: 'off', placeholder: '°C', 'aria-label': `PP-601${p} ${POINT_LABEL.tg3603}`, value: ex?.tg3603 ?? '' });
      const note = h('input', { id: `n-${p}`, class: 'input', maxLength: 200, placeholder: 'หมายเหตุ (เช่น gauge error วัดด้วย temp gun)', 'aria-label': `หมายเหตุ PP-601${p}`, value: ex?.note ?? '' });
      const diffOut = h('span', { class: 'diff-out' });
      const flags = h('span', { class: 'flags' });
      inputs[p] = { a, b, note, diffOut, flags };

      const refresh = () => {
        const va = validateReading({ tg3602: a.value, tg3603: b.value });
        clear(flags);
        if (!va.ok) {
          diffOut.textContent = 'Diff –';
          return;
        }
        diffOut.textContent = `Diff ${calcDiff(va.tg3602, va.tg3603)}`;
        const ev = evaluate(va, limits);
        flags.append(flagChip(ev.tg3603, `TG-3603`), flagChip(ev.diff, 'Diff'));
      };
      for (const el of [a, b, note]) el.addEventListener('input', () => (touched.add(p), refresh()));
      refresh();

      formBox.append(
        h(
          'fieldset',
          { class: 'pump-fieldset' },
          h('legend', {}, `PP-601${p}`, status[p] !== 'RUN' ? h('span', { class: 'caption' }, ` (${STATE_LABEL[status[p]]})`) : null),
          h('div', { class: 'two-col' }, h('div', {}, h('label', { for: `a-${p}` }, POINT_LABEL.tg3602), a), h('div', {}, h('label', { for: `b-${p}` }, POINT_LABEL.tg3603), b)),
          h('div', { class: 'row-between' }, diffOut, flags),
          note,
          ex
            ? h(
                'div',
                { class: 'row-between' },
                h('span', { class: 'caption' }, `จดโดย ${ex.recordedBy ?? '–'} ${formatTime(ex.updatedAt ?? ex.slotTime)}`),
                h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => voidOne(ex) }, 'ยกเลิกรายการ'),
              )
            : null,
        ),
      );
    }

    if (pumps.length === 0) formBox.append(h('p', { class: 'caption' }, 'ไม่มี pump ที่ RUN ให้จด'));

    const err = h('p', { class: 'form-error', role: 'alert', id: 'rec-error' });
    formBox.append(
      h('label', { for: 'rec-name' }, 'ผู้จด'),
      nameInput,
      err,
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => save(pumps, err) }, 'บันทึก'),
        h('button', { class: 'btn btn-outline', type: 'button', onclick: copyLine }, 'คัดลอกข้อความ LINE'),
      ),
    );
  }

  /** เติมค่าจากฐานข้อมูลเฉพาะช่องที่ผู้ใช้ยังไม่ได้แตะ — ไม่ทับสิ่งที่กำลังพิมพ์ */
  function prefill() {
    for (const [p, f] of Object.entries(inputs)) {
      if (!f.a.isConnected) continue;
      const ex = existing(p);
      if (ex && !touched.has(p)) {
        f.a.value = ex.tg3602;
        f.b.value = ex.tg3603;
        f.note.value = ex.note ?? '';
        f.a.dispatchEvent(new Event('input'));
        touched.delete(p);
      }
    }
  }

  async function save(pumps, errEl) {
    errEl.textContent = '';
    const by = (store.get('name') ?? '').trim();
    if (!by) return void (errEl.textContent = 'กรอกชื่อผู้จดก่อนบันทึก');

    const jobs = [];
    for (const p of pumps) {
      const f = inputs[p];
      const empty = f.a.value.trim() === '' && f.b.value.trim() === '';
      if (empty) continue;
      const v = validateReading({ tg3602: f.a.value, tg3603: f.b.value });
      if (!v.ok) return void (errEl.textContent = `PP-601${p}: ${v.error}`);
      jobs.push({
        id: readingId(p, slot),
        pump: p,
        slotTime: slot,
        shiftId: shiftOf(slot),
        tg3602: v.tg3602,
        tg3603: v.tg3603,
        note: f.note.value.trim().slice(0, 200),
        recordedBy: by.slice(0, 40),
      });
    }
    if (jobs.length === 0) return void (errEl.textContent = 'ยังไม่ได้กรอกค่า');

    const results = await Promise.all(jobs.map((j) => repo.saveReading(j)));
    touched.clear();
    toast(results.includes('pending') ? 'บันทึกแล้ว — รอซิงก์เมื่อมีสัญญาณ' : `บันทึก ${formatTime(slot)} แล้ว`, results.includes('pending') ? 'warn' : 'ok');
  }

  async function voidOne(r) {
    const by = (store.get('name') ?? '').trim();
    if (!by) return void toast('กรอกชื่อผู้จดก่อน', 'warn');
    if (!confirm(`ยกเลิกรายการ PP-601${r.pump} เวลา ${formatTime(r.slotTime)} ?`)) return;
    await repo.voidReading(r.id, by);
    toast('ยกเลิกรายการแล้ว (ข้อมูลยังเก็บเป็นประวัติ)');
  }

  async function copyLine() {
    const rows = readings.filter((r) => r.slotTime === slot && !r.voided);
    if (rows.length === 0) return void toast('ยังไม่มีข้อมูลที่บันทึกใน slot นี้ — กดบันทึกก่อน', 'warn');
    const ok = await copyText(formatLineMessage(slot, rows));
    toast(ok ? 'คัดลอกข้อความแล้ว วางใน LINE ได้เลย' : 'คัดลอกไม่สำเร็จ', ok ? 'ok' : 'error');
  }

  // ---------- ข้อมูลสด ----------
  function watch() {
    unwatch();
    const range = shiftRange(shiftOf(slot));
    unwatch = repo.watchReadings(range.start, range.end, (rows) => {
      readings = rows;
      renderShift();
      // ฟอร์มสร้างใหม่เฉพาะเมื่อชุด pump เปลี่ยน ไม่งั้นทับสิ่งที่กำลังพิมพ์
      const want = PUMPS.filter((p) => recordablePumps(store.get('status')).includes(p) || existing(p)).join('');
      if (want !== formBox.dataset.pumps) {
        formBox.dataset.pumps = want;
        renderForm();
      } else prefill();
    });
  }

  function renderAll() {
    renderStatus();
    renderShift();
    formBox.dataset.pumps = PUMPS.filter((p) => recordablePumps(store.get('status')).includes(p) || existing(p)).join('');
    renderForm();
  }

  subs.push(
    store.on('status', () => {
      renderStatus();
      renderShift();
      formBox.dataset.pumps = '';
      watch();
    }),
    store.on('limits', () => renderForm()),
  );
  renderAll();
  watch();

  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    unwatch();
    subs.forEach((u) => u());
  };
}
