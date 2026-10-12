/** APP_CORE — init · routing แท็บ · สถานะสด · error boundary */
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';
import { createFirebaseRepo } from './modules/cloud-sync-manager.js';
import { createLocalRepo } from './modules/repo-local.js';
import { createStore } from './modules/state-store.js';
import { DEFAULT_LIMITS, DEFAULT_STATUS } from './modules/app-config.js';
import { validateStatus } from './modules/shift-logic.js';
import { h, clear, toast } from './modules/ui-renderer.js';
import * as recordView from './views/record.js';
import * as reportView from './views/report.js';
import * as historyView from './views/history.js';
import * as settingsView from './views/settings.js';

const TABS = [
  { id: 'record', label: 'จด', view: recordView },
  { id: 'report', label: 'รายงานกะ', view: reportView },
  { id: 'history', label: 'ประวัติ', view: historyView },
  { id: 'settings', label: 'ตั้งค่า', view: settingsView },
];

const lsGet = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ใช้ต่อได้แม้จำค่าไม่ได้ */
  }
};

function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.dataset.theme = mode;
  else delete root.dataset.theme;
  lsSet('pp601-theme', mode);
  store.set('theme', mode);
  if (store.get('tab') === 'report') route(); // กราฟอ่านสีจาก token ตอนสร้าง ต้องวาดใหม่
}

const store = createStore({
  status: { ...DEFAULT_STATUS },
  statusIsDefault: true,
  limits: { ...DEFAULT_LIMITS },
  name: lsGet('pp601-name') ?? '',
  theme: lsGet('pp601-theme') ?? 'auto',
  tab: 'record',
});
store.on('name', (v) => lsSet('pp601-name', v));

const app = document.getElementById('app');
let repo;
let unmount = () => {};

function renderShell() {
  clear(app);
  const nav = h(
    'nav',
    { class: 'bottom-nav', 'aria-label': 'เมนูหลัก' },
    TABS.map((t) => h('a', { href: `#/${t.id}`, id: `tab-${t.id}`, class: 'nav-item' }, t.label)),
  );
  app.append(
    h('header', { class: 'topbar' }, h('span', { class: 'brand' }, 'PP-601'), h('span', { class: 'caption' }, 'Hot oil pump temp'), h('span', { id: 'net', class: 'chip chip-neutral' }, '')),
    h('div', { id: 'webview' }),
    h('main', { id: 'view', class: 'view' }),
    nav,
  );
  updateNet();
}

function updateNet() {
  const el = document.getElementById('net');
  if (!el) return;
  const offline = !navigator.onLine;
  el.className = `chip ${offline ? 'chip-crit' : repo?.mode === 'firebase' ? 'chip-ok' : 'chip-warn'}`;
  el.textContent = offline ? 'ออฟไลน์' : repo?.mode === 'firebase' ? '● ออนไลน์' : 'โหมดทดลอง';
}

function webViewBanner() {
  const ua = navigator.userAgent;
  if (!/Line\/|FBAN|FBAV|Instagram/i.test(ua)) return;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  document.getElementById('webview')?.append(
    h(
      'div',
      { class: 'banner', role: 'status' },
      `เปิดในเบราว์เซอร์ ${isIOS ? 'Safari' : 'Chrome'} จะเสถียรกว่า (LINE อาจบล็อกการเก็บข้อมูลในเครื่อง) `,
      h('button', { class: 'btn btn-soft btn-sm', type: 'button', onclick: () => navigator.clipboard?.writeText(location.href).then(() => toast('คัดลอกลิงก์แล้ว')) }, 'คัดลอกลิงก์'),
    ),
  );
}

function route() {
  unmount();
  const id = (location.hash.replace('#/', '') || 'record').split('?')[0];
  const tab = TABS.find((t) => t.id === id) ?? TABS[0];
  store.set('tab', tab.id);
  TABS.forEach((t) => document.getElementById(`tab-${t.id}`)?.toggleAttribute('aria-current', t.id === tab.id));
  document.getElementById(`tab-${tab.id}`)?.setAttribute('aria-current', 'page');
  const view = document.getElementById('view');
  clear(view);
  try {
    unmount = tab.view.mount(view, { repo, store, applyTheme });
  } catch (err) {
    console.error(err);
    unmount = () => {};
    view.append(h('div', { class: 'card' }, h('p', { class: 'form-error' }, 'หน้านี้ทำงานผิดพลาด ลองรีเฟรช')));
  }
}

function showFatal(message) {
  clear(app);
  app.append(h('div', { class: 'card fatal', role: 'alert' }, h('h1', {}, 'เริ่มระบบไม่สำเร็จ'), h('p', {}, message), h('button', { class: 'btn btn-primary', type: 'button', onclick: () => location.reload() }, 'ลองใหม่')));
}

async function init() {
  applyTheme(store.get('theme'));
  repo = isFirebaseConfigured ? createFirebaseRepo(firebaseConfig) : createLocalRepo();
  try {
    await repo.init();
  } catch (err) {
    console.error(err);
    showFatal(`เชื่อมต่อ Firebase ไม่สำเร็จ (${err?.code ?? err?.message ?? 'unknown'}) — ตรวจว่าเปิด Anonymous sign-in แล้ว และมีสัญญาณอินเทอร์เน็ต`);
    return;
  }

  repo.watchStatus((doc) => {
    const next = doc ? { A: doc.A, B: doc.B, C: doc.C } : null;
    const ok = next && validateStatus(next).ok;
    store.set('statusIsDefault', !ok);
    store.set('status', ok ? next : { ...DEFAULT_STATUS });
  });
  repo.watchLimits((doc) => store.set('limits', { ...DEFAULT_LIMITS, ...(doc ?? {}) }));

  renderShell();
  webViewBanner();
  window.addEventListener('hashchange', route);
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);
  route();
}

window.addEventListener('error', (e) => console.error('uncaught', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => console.error('unhandled', e.reason));

registerSW({ immediate: true });
init();
