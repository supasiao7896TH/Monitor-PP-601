/**
 * ROUTE_LOGIC — PC Desktop-First Routing & Navigation metadata
 */

export const DEFAULT_TAB = 'report';

export const TABS = [
  { id: 'report', label: 'รายงานกะ / มอนิเตอร์' },
  { id: 'record', label: 'จดค่า' },
  { id: 'history', label: 'ประวัติ' },
  { id: 'settings', label: 'ตั้งค่า' },
];

/**
 * แปลง hash บน URL เป็น tabId ที่ถูกต้อง
 * ถ้าไม่มี hash หรือเป็นค่าที่ไม่ถูกต้อง จะคืนค่า DEFAULT_TAB ('report') สำหรับ PC
 * @param {string|null|undefined} hash
 * @returns {string}
 */
export function resolveTab(hash) {
  if (!hash || typeof hash !== 'string') return DEFAULT_TAB;
  const clean = hash.replace(/^#\/?/, '').split('?')[0].trim();
  const found = TABS.find((t) => t.id === clean);
  return found ? found.id : DEFAULT_TAB;
}
