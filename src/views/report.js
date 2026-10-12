import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Legend, Tooltip } from 'chart.js';
import { h, clear, fmt, toast } from '../modules/ui-renderer.js';
import {
  shiftOf,
  shiftRange,
  shiftSlots,
  shiftLabel,
  adjacentShift,
  buildSeries,
  summarize,
  evaluate,
  calcDiff,
  formatTime,
  PUMPS,
} from '../modules/shift-logic.js';
import { TARGET_LABEL } from '../modules/app-config.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Legend, Tooltip);

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * หน้ารายงานกะ — ออกแบบให้พอดี 1 จอมือถือ (แนวตั้ง) เพื่อแคปส่ง LINE
 * pump ที่ไม่มีข้อมูล (standby) ไม่แสดง และช่องว่างในกราฟเป็น null ไม่ใช่ 0
 */
export function mount(root, { repo, store }) {
  let shiftId = shiftOf(Date.now());
  let readings = [];
  let events = [];
  let unwatch = () => {};
  const charts = [];
  const page = h('div', { class: 'stack report' });
  root.append(page);

  function destroyCharts() {
    charts.splice(0).forEach((c) => c.destroy());
  }

  function render() {
    destroyCharts();
    clear(page);
    const slots = shiftSlots(shiftId);
    const limits = store.get('limits');
    const live = readings.filter((r) => !r.voided);
    const pumps = PUMPS.filter((p) => live.some((r) => r.pump === p));
    const range = shiftRange(shiftId);
    const sw = events.filter((e) => e.at >= range.start && e.at <= range.end);

    page.append(
      h(
        'div',
        { class: 'row-between report-head' },
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', 'aria-label': 'กะก่อนหน้า', onclick: () => go(-1) }, '‹'),
        h('div', { class: 'center' }, h('h2', {}, 'PP-601 รายงานกะ'), h('p', { class: 'caption' }, shiftLabel(shiftId))),
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', 'aria-label': 'กะถัดไป', onclick: () => go(1) }, '›'),
      ),
    );

    page.append(
      h(
        'div',
        { 'data-html2canvas-ignore': 'true' },
        h('button', { class: 'btn btn-soft btn-sm btn-block', type: 'button', onclick: saveImage }, 'บันทึกรายงานเป็นรูป / ส่ง LINE'),
      ),
    );

    if (pumps.length === 0) {
      page.append(h('div', { class: 'card' }, h('p', { class: 'caption' }, 'ยังไม่มีข้อมูลในกะนี้')));
      return;
    }

    // ----- ตาราง: แถว = slot · คอลัมน์ = pump × (TG-3602, TG-3603, Diff)
    const head1 = h('tr', {}, h('th', { rowSpan: 2 }, 'เวลา'), pumps.map((p) => h('th', { colSpan: 3, class: 'grp' }, `PP-601${p}`)));
    const head2 = h('tr', {}, pumps.map(() => [h('th', {}, '3602'), h('th', {}, '3603'), h('th', {}, 'Diff')]));
    const body = slots.map((s) =>
      h(
        'tr',
        {},
        h('th', { scope: 'row' }, formatTime(s)),
        pumps.map((p) => {
          const r = live.find((x) => x.pump === p && x.slotTime === s);
          if (!r) return [h('td', { class: 'miss' }, '–'), h('td', { class: 'miss' }, '–'), h('td', { class: 'miss' }, '–')];
          const ev = evaluate(r, limits);
          return [
            h('td', { class: 'num' }, fmt(r.tg3602)),
            h('td', { class: `num ${ev.tg3603 === 'alarm' ? 'cell-crit' : ''}` }, fmt(r.tg3603)),
            h('td', { class: `num ${ev.diff === 'alarm' ? 'cell-crit' : ''}` }, fmt(calcDiff(r.tg3602, r.tg3603))),
          ];
        }),
      ),
    );
    page.append(h('div', { class: 'card tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', {}, head1, head2), h('tbody', {}, body))));

    // ----- กราฟต่อ pump + สถิติ
    const labels = slots.map(formatTime);
    for (const p of pumps) {
      const s = buildSeries(slots, live, p);
      const st3 = summarize(s.tg3603);
      const stD = summarize(s.diff);
      const canvas = h('canvas', { role: 'img', 'aria-label': `กราฟอุณหภูมิ PP-601${p}` });
      page.append(
        h(
          'div',
          { class: 'card chart-card' },
          h('div', { class: 'chart-title' }, h('h3', {}, `PP-601${p}`), h('span', { class: 'caption num' }, `3603 สูงสุด ${fmt(st3.max)} · เฉลี่ย ${fmt(st3.avg)} · Diff ต่ำสุด ${fmt(stD.count ? Math.min(...s.diff.filter((v) => v != null)) : null)}`)),
          h('div', { class: 'chart-box' }, canvas),
        ),
      );

      const target = (value, color) => ({
        data: slots.map(() => value),
        borderColor: color,
        borderDash: [5, 4],
        borderWidth: 1,
        pointRadius: 0,
        label: undefined,
      });
      const datasets = [
        { label: 'TG-3602', data: s.tg3602, borderColor: cssVar('--accent'), backgroundColor: cssVar('--accent'), tension: 0.25 },
        { label: 'TG-3603', data: s.tg3603, borderColor: cssVar('--accent-2'), backgroundColor: cssVar('--accent-2'), tension: 0.25 },
        { label: 'Diff', data: s.diff, borderColor: cssVar('--text-2'), backgroundColor: cssVar('--text-2'), tension: 0.25 },
      ].map((d) => ({ ...d, borderWidth: 2, pointRadius: 3, spanGaps: false }));
      if (limits.tg3603Target != null) datasets.push({ ...target(limits.tg3603Target, cssVar('--crit')), label: `Target ${limits.tg3603Target}` });
      if (limits.diffTarget != null) datasets.push({ ...target(limits.diffTarget, cssVar('--text-3')), label: `Diff ${limits.diffTarget}` });

      charts.push(
        new Chart(canvas, {
          type: 'line',
          data: { labels, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
              y: { beginAtZero: true, ticks: { color: cssVar('--text-3') }, grid: { color: cssVar('--border') } },
              x: { ticks: { color: cssVar('--text-3') }, grid: { display: false } },
            },
            plugins: { legend: { labels: { color: cssVar('--text-2'), usePointStyle: true, boxWidth: 8, font: { size: 11 }, filter: (item) => item.datasetIndex < 3 } } },
          },
        }),
      );
    }

    // ----- เหตุการณ์ในกะ (สลับ pump / ล้าง) เพื่อให้รายงานที่แคปมีบริบท
    if (sw.length > 0) {
      page.append(
        h(
          'div',
          { class: 'card' },
          h('h3', {}, 'เหตุการณ์ในกะ'),
          h('ul', { class: 'plain-list' }, sw.slice(0, 4).map((e) => h('li', {}, `${formatTime(e.at)} ${describeEvent(e)}`))),
        ),
      );
    }
    page.append(h('p', { class: 'caption center' }, `ออกรายงาน ${new Date().toLocaleString('th-TH-u-ca-gregory', { timeZone: 'Asia/Bangkok' })} · เกณฑ์: ${limitText(limits)}`));
  }

  /** แปลงหน้ารายงานเป็นรูป PNG → แชร์ (LINE ฯลฯ) ถ้าอุปกรณ์รองรับ ไม่งั้นดาวน์โหลดไฟล์ */
  async function saveImage() {
    toast('กำลังสร้างรูป…');
    try {
      const { default: html2canvas } = await import('html2canvas-pro');
      const canvas = await html2canvas(page, { backgroundColor: cssVar('--bg'), scale: 2, useCORS: false, logging: false });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('toBlob failed');
      const file = new File([blob], `PP601-report-${shiftId}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `PP-601 ${shiftLabel(shiftId)}` });
          return;
        } catch (err) {
          if (err?.name === 'AbortError') return; // ผู้ใช้ปิดหน้าต่างแชร์เอง
        }
      }
      const a = h('a', { href: URL.createObjectURL(blob), download: file.name });
      document.body.append(a);
      a.click();
      a.remove();
      toast('บันทึกรูปแล้ว', 'ok');
    } catch (err) {
      console.error(err);
      toast('สร้างรูปไม่สำเร็จ — ใช้การแคปหน้าจอแทน', 'error');
    }
  }

  function go(dir) {
    shiftId = adjacentShift(shiftId, dir);
    watch();
  }

  function watch() {
    unwatch();
    const r = shiftRange(shiftId);
    unwatch = repo.watchReadings(r.start, r.end, (rows) => {
      readings = rows;
      render();
    });
  }

  const subs = [
    store.on('limits', render),
    repo.watchEvents((rows) => {
      events = rows;
      render();
    }),
  ];
  watch();

  return () => {
    unwatch();
    subs.forEach((u) => u());
    destroyCharts();
  };
}

export function describeEvent(e) {
  if (e.type === 'switch') return `สลับ pump: หยุด ${e.stop} → เดิน ${e.start}${e.reason ? ` (${e.reason})` : ''}`;
  if (e.type === 'cleaning') return `ล้าง ${TARGET_LABEL[e.target] ?? ''} PP-601${e.pump}${e.endAt ? ' (เสร็จแล้ว)' : ' (กำลังล้าง)'}`;
  return e.type;
}

function limitText(l) {
  const dir = { below: '≤', above: '≥' };
  const parts = [];
  if (l.tg3603Target != null) parts.push(`TG-3603 ${dir[l.tg3603Direction]} ${l.tg3603Target}`);
  if (l.diffTarget != null) parts.push(`Diff ${dir[l.diffDirection]} ${l.diffTarget}`);
  return parts.join(' · ') || 'ไม่ได้ตั้ง';
}
