import { h, clear, toast } from '../modules/ui-renderer.js';
import { startCleaning, finishCleaning, PUMPS } from '../modules/shift-logic.js';
import { TARGET_LABEL } from '../modules/app-config.js';
import { openSwitchDialog } from '../modules/dialogs.js';
import { describeEvent } from './report.js';

const fmtDateTime = (ms) =>
  new Date(ms).toLocaleString('th-TH-u-ca-gregory', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

export function mount(root, { repo, store }) {
  let events = [];
  const page = h('div', { class: 'stack' });
  root.append(page);

  async function beginClean(pump, target, note, errEl) {
    const by = store.get('name');
    if (!by) return void (errEl.textContent = 'กรอกชื่อผู้จดก่อน (หน้า "ตั้งค่า")');
    const res = startCleaning(store.get('status'), pump);
    if (!res.ok) return void (errEl.textContent = res.error);
    await repo.saveStatus(res.status, by);
    await repo.addEvent({ type: 'cleaning', at: Date.now(), pump, target, endAt: null, note: note.slice(0, 200), by });
    toast(`เริ่มล้าง PP-601${pump}`, 'ok');
  }

  async function endClean(ev) {
    const by = store.get('name');
    if (!by) return void toast('กรอกชื่อผู้จดก่อน (หน้า "ตั้งค่า")', 'warn');
    const res = finishCleaning(store.get('status'), ev.pump);
    if (!res.ok) return void toast(res.error, 'error');
    await repo.saveStatus(res.status, by);
    await repo.updateEvent(ev.id, { endAt: Date.now(), endedBy: by });
    toast(`ล้าง PP-601${ev.pump} เสร็จแล้ว → STANDBY`, 'ok');
  }

  function render() {
    clear(page);
    const status = store.get('status');
    const standby = PUMPS.filter((p) => status[p] === 'STANDBY');
    const pumpSel = h('select', { id: 'cl-pump', class: 'input' }, standby.map((p) => h('option', { value: p }, `PP-601${p}`)));
    const targetSel = h('select', { id: 'cl-target', class: 'input' }, Object.entries(TARGET_LABEL).map(([v, l]) => h('option', { value: v }, l)));
    const note = h('input', { id: 'cl-note', class: 'input', maxLength: 200, placeholder: 'หมายเหตุ (ไม่บังคับ)' });
    const err = h('p', { class: 'form-error', role: 'alert' });

    page.append(
      h(
        'section',
        { class: 'card stack' },
        h('div', { class: 'row-between' }, h('h2', {}, 'เริ่มงานล้าง'), h('button', { class: 'btn btn-soft btn-sm', type: 'button', onclick: () => openSwitchDialog({ repo, store }) }, 'สลับ pump')),
        standby.length === 0
          ? h('p', { class: 'caption' }, 'ไม่มี pump STANDBY — ต้องสลับ pump ให้มีตัวหยุดก่อนจึงเริ่มล้างได้')
          : [
              h('label', { for: 'cl-pump' }, 'pump (ต้อง STANDBY)'),
              pumpSel,
              h('label', { for: 'cl-target' }, 'ล้างอะไร'),
              targetSel,
              h('label', { for: 'cl-note' }, 'หมายเหตุ'),
              note,
              err,
              h('button', { class: 'btn btn-primary', type: 'button', onclick: () => beginClean(pumpSel.value, targetSel.value, note.value.trim(), err) }, 'เริ่มล้าง'),
            ],
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'ไทม์ไลน์'),
        events.length === 0
          ? h('p', { class: 'caption' }, 'ยังไม่มีเหตุการณ์')
          : h(
              'ul',
              { class: 'timeline' },
              events.map((e) =>
                h(
                  'li',
                  {},
                  h('span', { class: 'caption num' }, fmtDateTime(e.at)),
                  h('span', {}, describeEvent(e)),
                  e.note ? h('span', { class: 'caption' }, e.note) : null,
                  e.endAt ? h('span', { class: 'caption' }, `เสร็จ ${fmtDateTime(e.endAt)}`) : null,
                  e.type === 'cleaning' && !e.endAt ? h('button', { class: 'btn btn-soft btn-sm', type: 'button', onclick: () => endClean(e) }, 'ล้างเสร็จแล้ว') : null,
                  h('span', { class: 'caption' }, `โดย ${e.by ?? '–'}`),
                ),
              ),
            ),
      ),
    );
  }

  const subs = [store.on('status', render), repo.watchEvents((rows) => ((events = rows), render()))];
  render();
  return () => subs.forEach((u) => u());
}
