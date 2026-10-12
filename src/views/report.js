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
  formatDateTime,
  runWindowOf,
  isStoppedRunRecent,
  buildLongSeries,
  LONG_CHART_MAX_DAYS,
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
  let longReadings = []; // ข้อมูลย้อนหลังสำหรับกราฟยาว (ไม่ผูกกับกะที่เลือก)
  let longFrom = 0;
  let unwatchLong = () => {};
  const charts = [];
  const longCharts = []; // แยกจาก charts เพื่อวาดกราฟยาวใหม่ได้โดยไม่ต้องรื้อกราฟรายงานกะ
  let longActive = false; // listener กราฟยาวเปิดอยู่หรือไม่ (เปิดเฉพาะตอนดูกะปัจจุบัน)
  let capturing = false; // ระหว่างสร้างรูป ห้าม render ใหม่ ไม่งั้น element ที่กำลังแคปถูกรื้อ → รูปว่าง
  let dirty = false; // มีข้อมูลเข้ามาระหว่างสร้างรูป ต้อง render หลังเสร็จ
  const page = h('div', { class: 'stack report' });
  const longPage = h('div', { class: 'stack report' }); // กราฟยาว — แคปเป็นรูปแยกจากรายงานกะ
  root.append(page, longPage);

  function destroyCharts() {
    charts.splice(0).forEach((c) => c.destroy());
  }

  function destroyLongCharts() {
    longCharts.splice(0).forEach((c) => c.destroy());
  }

  function render() {
    if (capturing) return void (dirty = true);
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
        h('button', { class: 'btn btn-soft btn-sm btn-block', type: 'button', onclick: () => saveImage(page, `PP601-report-${shiftId}.png`, `PP-601 ${shiftLabel(shiftId)}`) }, 'บันทึกรายงานเป็นรูป / ส่ง LINE'),
      ),
    );

    if (pumps.length === 0) {
      page.append(h('div', { class: 'card' }, h('p', { class: 'caption' }, 'ยังไม่มีข้อมูลในกะนี้')));
      renderLong();
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
    renderLong();
  }

  /**
   * กราฟยาวต่อ pump ที่กำลัง RUN ตั้งแต่เริ่มรอบเดินปัจจุบัน (+ pump ที่หยุดไม่นาน) — อยู่ท้ายหน้า แคปเป็นรูปแยกจากรายงานกะ
   * (รูปรายงานกะออกแบบให้พอดี 1 จอ) · ช่วงที่ไม่มีข้อมูลเป็นช่องว่างในเส้น ไม่ใช่ 0
   * วาดแยกจาก render() เพื่อให้ข้อมูลกราฟยาวเข้ามาแล้วไม่ต้องรื้อกราฟรายงานกะทั้งหมด
   */
  function renderLong() {
    if (capturing) return void (dirty = true);
    destroyLongCharts();
    clear(longPage);
    const limits = store.get('limits');
    // กราฟยาวเป็นของ "รอบเดินปัจจุบัน" ไม่ผูกกับกะที่เลือก — แสดงเฉพาะตอนดูกะปัจจุบัน ไม่งั้นจะซ้ำชุดเดิมใต้ทุกกะ
    if (shiftId !== shiftOf(Date.now())) {
      longPage.append(h('p', { class: 'caption center' }, 'กราฟตั้งแต่เริ่มเดินแสดงเฉพาะกะปัจจุบัน — กด › เพื่อกลับไปกะปัจจุบัน'));
      return;
    }
    const status = store.get('status');
    const live = longReadings.filter((r) => !r.voided);
    // shot = ส่วนที่ถูกแคปเป็นรูป · ต้องต่อเข้า DOM ก่อนสร้าง Chart เพื่อให้วัดขนาดได้
    const shot = h('div', { class: 'stack report' });
    longPage.append(shot);
    let count = 0;
    // pump ที่กำลัง RUN ก่อน แล้วตามด้วยตัวที่หยุดแล้ว (แสดงรอบเดินล่าสุดก่อนหยุด)
    const order = [...PUMPS.filter((x) => status[x] === 'RUN'), ...PUMPS.filter((x) => status[x] !== 'RUN')];
    for (const p of order) {
      const running = status[p] === 'RUN';
      const win = runWindowOf(p, events, live, running);
      if (win == null) continue;
      const { start } = win;
      const s = buildLongSeries(live, p, start, win.end ?? Infinity);
      if (s.slots.length === 0) continue;
      // pump ที่หยุดไปนานแล้วไม่ต้องแสดง (กันการ์ดเก่าค้างเต็มหน้า/เต็มรูปที่ส่ง LINE)
      if (!running && !isStoppedRunRecent(s.slots[s.slots.length - 1], Date.now())) continue;

      const st3 = summarize(s.tg3603);
      const capped = start < longFrom ? ` · แสดงย้อนหลังสูงสุด ${LONG_CHART_MAX_DAYS} วัน` : '';
      const stopped = running ? '' : win.end != null ? ` · หยุดแล้ว ${formatDateTime(win.end)}` : ' · ไม่ได้เดินแล้ว';
      const canvas = h('canvas', { role: 'img', 'aria-label': `กราฟยาวอุณหภูมิ PP-601${p} ตั้งแต่เริ่มเดิน` });
      if (count++ === 0) shot.append(h('h2', { class: 'center' }, 'PP-601 กราฟตั้งแต่เริ่มเดิน'));
      shot.append(
        h(
          'div',
          { class: 'card chart-card' },
          h('div', { class: 'chart-title' }, h('h3', {}, `PP-601${p} · ${running ? 'ตั้งแต่เริ่มเดิน' : 'รอบเดินก่อนหยุด'}`), h('span', { class: 'caption num' }, `เริ่ม ${formatDateTime(start)}${stopped} · ${st3.count} ค่า · 3603 สูงสุด ${fmt(st3.max)} · เฉลี่ย ${fmt(st3.avg)}${capped}`)),
          h('div', { class: 'chart-box' }, canvas),
        ),
      );

      const line = (label, data, color) => ({ label, data, borderColor: color, backgroundColor: color, borderWidth: 1.5, pointRadius: 0, pointHitRadius: 8, tension: 0.15, spanGaps: false });
      const flat = (label, value, color) => ({ label, data: s.slots.map(() => value), borderColor: color, borderWidth: 1, borderDash: [5, 4], pointRadius: 0, pointHitRadius: 0 });
      const datasets = [line('TG-3602', s.tg3602, cssVar('--accent')), line('TG-3603', s.tg3603, cssVar('--accent-2')), line('Diff', s.diff, cssVar('--text-2'))];
      if (limits.tg3603Target != null) datasets.push(flat(`Target ${limits.tg3603Target}`, limits.tg3603Target, cssVar('--crit')));
      if (limits.diffTarget != null) datasets.push(flat(`Diff ${limits.diffTarget}`, limits.diffTarget, cssVar('--text-3')));

      longCharts.push(
        new Chart(canvas, {
          type: 'line',
          data: { labels: s.slots.map(formatDateTime), datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
              y: { beginAtZero: true, ticks: { color: cssVar('--text-3') }, grid: { color: cssVar('--border') } },
              x: { ticks: { color: cssVar('--text-3'), maxTicksLimit: 6, maxRotation: 0, autoSkip: true }, grid: { display: false } },
            },
            plugins: { legend: { labels: { color: cssVar('--text-2'), usePointStyle: true, boxWidth: 8, font: { size: 11 }, filter: (item) => item.datasetIndex < 3 } } },
          },
        }),
      );
    }

    if (count === 0) return void shot.remove();
    shot.append(h('p', { class: 'caption center' }, `ออกรายงาน ${new Date().toLocaleString('th-TH-u-ca-gregory', { timeZone: 'Asia/Bangkok' })} · เกณฑ์: ${limitText(limits)}`));
    longPage.prepend(
      h(
        'div',
        {},
        h('button', { class: 'btn btn-soft btn-sm btn-block', type: 'button', onclick: () => saveImage(shot, `PP601-longchart-${formatDateTime(Date.now()).slice(0, 5).replace('/', '-')}.png`, 'PP-601 กราฟตั้งแต่เริ่มเดิน') }, 'บันทึกกราฟยาวเป็นรูป / ส่ง LINE'),
      ),
    );
  }

  /** แปลงหน้ารายงานเป็นรูป PNG → แชร์ (LINE ฯลฯ) ถ้าอุปกรณ์รองรับ ไม่งั้นดาวน์โหลดไฟล์ */
  async function saveImage(el, fileName, title) {
    toast('กำลังสร้างรูป…');
    capturing = true; // กัน render() รื้อ element ที่กำลังแคป (ข้อมูลสดที่เข้ามาจะ render หลังเสร็จ)
    try {
      const blobPromise = (async () => {
        const { default: html2canvas } = await import('html2canvas-pro');
        const canvas = await html2canvas(el, { backgroundColor: cssVar('--bg'), scale: 2, useCORS: false, logging: false });
        const made = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!made) throw new Error('toBlob failed');
        return made;
      })();
      blobPromise.catch(() => {}); // กัน unhandled rejection — error จริงถูกจับตอน await ด้านล่าง

      // คอม: คัดลอกรูปลง clipboard ก่อน (Ctrl+V วางใน LINE PC ได้) · ส่ง Promise เข้า ClipboardItem เพื่อไม่ให้หมดสิทธิ์ user-activation ระหว่างสร้างรูป
      const mobile = isTouchDevice();
      let triedClipboard = false;
      if (!mobile && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        triedClipboard = true;
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
          toast('คัดลอกรูปแล้ว — กด Ctrl+V วางใน LINE ได้เลย', 'ok');
          return;
        } catch (err) {
          console.warn('clipboard image failed, fallback to download', err);
        }
      }

      const blob = await blobPromise;
      const file = new File([blob], fileName, { type: 'image/png' });
      if (mobile && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title });
          return;
        } catch (err) {
          if (err?.name === 'AbortError') return; // ผู้ใช้ปิดหน้าต่างแชร์เอง
        }
      }
      const a = h('a', { href: URL.createObjectURL(blob), download: file.name });
      document.body.append(a);
      a.click();
      a.remove();
      toast(triedClipboard ? 'บันทึกรูปเป็นไฟล์แล้ว (คัดลอกลง clipboard ไม่ได้) — แนบไฟล์ใน LINE เอง' : 'บันทึกรูปเป็นไฟล์แล้ว — แนบไฟล์ใน LINE เอง', 'ok');
    } catch (err) {
      console.error(err);
      toast('สร้างรูปไม่สำเร็จ — ใช้การแคปหน้าจอแทน', 'error');
    } finally {
      capturing = false;
      if (dirty) {
        dirty = false;
        render();
      }
    }
  }

  function go(dir) {
    shiftId = adjacentShift(shiftId, dir);
    syncLong();
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

  function watchLong() {
    unwatchLong();
    longFrom = Date.now() - LONG_CHART_MAX_DAYS * 24 * 3600 * 1000;
    unwatchLong = repo.watchReadings(longFrom, Date.now() + 24 * 3600 * 1000, (rows) => {
      longReadings = rows;
      renderLong();
    });
  }

  /** เปิด listener กราฟยาว (ดึงข้อมูลย้อนหลัง 90 วัน) เฉพาะตอนดูกะปัจจุบัน — ประหยัดโควต้า Firestore */
  function syncLong() {
    const wanted = shiftId === shiftOf(Date.now());
    if (wanted && !longActive) {
      longActive = true;
      watchLong();
    } else if (!wanted && longActive) {
      longActive = false;
      unwatchLong();
      unwatchLong = () => {};
      longReadings = [];
    }
  }

  const subs = [
    store.on('limits', render),
    store.on('status', render),
    repo.watchEvents((rows) => {
      events = rows;
      render();
    }),
  ];
  syncLong();
  watch();

  return () => {
    unwatch();
    unwatchLong();
    subs.forEach((u) => u());
    destroyCharts();
    destroyLongCharts();
  };
}

/** มือถือ/แท็บเล็ต (รวม iPadOS ที่ UA เป็น Macintosh) — ใช้เลือกว่าจะเปิดหน้าต่างแชร์หรือคัดลอกลง clipboard */
function isTouchDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
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
