import { h, openDialog, toast } from './ui-renderer.js';
import { applySwitch, PUMPS } from './shift-logic.js';
import { STATE_LABEL } from './app-config.js';

/** กล่องสลับ pump — ใช้ทั้งหน้า "จด" และ "ประวัติ" */
export function openSwitchDialog({ repo, store }) {
  const status = store.get('status');
  const running = PUMPS.filter((p) => status[p] === 'RUN');
  const standby = PUMPS.filter((p) => status[p] === 'STANDBY');
  if (standby.length === 0) {
    toast('ไม่มี pump STANDBY ให้สลับ (ตัวที่ 3 อาจกำลังล้างอยู่)', 'warn');
    return;
  }
  openDialog('สลับ pump', (close) => {
    const stopSel = h('select', { id: 'sw-stop', class: 'input' }, running.map((p) => h('option', { value: p }, `PP-601${p} (หยุด)`)));
    const startSel = h('select', { id: 'sw-start', class: 'input' }, standby.map((p) => h('option', { value: p }, `PP-601${p} (เดิน)`)));
    const reason = h('input', { id: 'sw-reason', class: 'input', maxLength: 120, placeholder: 'เช่น temp สูง ล้าง oil cooler' });
    const err = h('p', { class: 'form-error', role: 'alert' });
    const save = async () => {
      const by = store.get('name');
      if (!by) return void (err.textContent = 'กรอกชื่อผู้จดก่อน (หน้า "จด" หรือ "ตั้งค่า")');
      const res = applySwitch(status, { stop: stopSel.value, start: startSel.value });
      if (!res.ok) return void (err.textContent = res.error);
      await repo.saveStatus(res.status, by);
      await repo.addEvent({
        type: 'switch',
        at: Date.now(),
        stop: stopSel.value,
        start: startSel.value,
        before: status,
        after: res.status,
        reason: reason.value.trim().slice(0, 120),
        by,
      });
      toast(`สลับแล้ว: หยุด ${stopSel.value} → เดิน ${startSel.value}`, 'ok');
      close();
    };
    return h(
      'div',
      { class: 'stack' },
      h('p', { class: 'caption' }, `ตอนนี้: ${PUMPS.map((p) => `${p}=${STATE_LABEL[status[p]]}`).join(' · ')}`),
      h('label', { for: 'sw-stop' }, 'pump ที่หยุด'),
      stopSel,
      h('label', { for: 'sw-start' }, 'pump ที่เดินแทน'),
      startSel,
      h('label', { for: 'sw-reason' }, 'เหตุผล (ไม่บังคับ)'),
      reason,
      err,
      h('button', { class: 'btn btn-primary', type: 'button', onclick: save }, 'ยืนยันสลับ pump'),
    );
  });
}
