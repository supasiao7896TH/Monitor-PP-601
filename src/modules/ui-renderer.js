/**
 * UI_RENDERER — helper สร้าง DOM แบบปลอดภัย (ข้อความทุกชนิดเข้าผ่าน textContent เท่านั้น
 * ห้ามใช้ innerHTML กับข้อมูลผู้ใช้ — กัน XSS ตาม vibe-coding-core §8)
 */

/** h('div', { class: 'card', onclick: fn, 'aria-label': 'x' }, 'text', childNode, ...) */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && k !== 'list' && k !== 'form') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  el.replaceChildren();
}

let toastTimer;
export function toast(message, kind = 'info') {
  const region = document.getElementById('toast');
  if (!region) return;
  clear(region);
  region.append(h('div', { class: `toast toast-${kind}` }, message));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => clear(region), 3500);
}

/** dialog แบบ modal (ใช้ <dialog> — โฟกัส/Esc จัดการโดยเบราว์เซอร์) */
export function openDialog(title, buildBody) {
  const dlg = h('dialog', { class: 'dialog', 'aria-label': title });
  const close = () => {
    dlg.close();
    dlg.remove();
  };
  const body = buildBody(close);
  dlg.append(
    h('div', { class: 'dialog-head' }, h('h2', {}, title), h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: close, 'aria-label': 'ปิด' }, '✕')),
    body,
  );
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close();
  });
  dlg.addEventListener('cancel', () => setTimeout(() => dlg.remove(), 0));
  document.body.append(dlg);
  dlg.showModal();
  return close;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback สำหรับ WebView/เบราว์เซอร์ที่ไม่มี clipboard API
    const ta = h('textarea', { value: text, style: 'position:fixed;opacity:0' });
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** chip สถานะ: kind = ok | alarm | none */
export function flagChip(kind, text) {
  const map = { ok: 'chip-ok', alarm: 'chip-crit', none: 'chip-neutral' };
  const icon = { ok: '✓ ', alarm: '⚠ ', none: '' };
  return h('span', { class: `chip ${map[kind] ?? 'chip-neutral'}` }, `${icon[kind] ?? ''}${text}`);
}

export const fmt = (v) => (v == null ? '–' : String(v));
