/**
 * LOCAL REPO — โหมดทดลองในเครื่อง (ไม่มี Firebase) เก็บใน localStorage ไม่ sync ข้ามเครื่อง
 * หน้าตา interface เหมือน repo-firebase.js ทุกอย่าง เพื่อให้ view ไม่ต้องรู้ว่าใช้ตัวไหน
 */
const KEY = 'pp601-local-v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

export function createLocalRepo() {
  let db = { readings: {}, events: {}, status: null, limits: null, ...load() };
  const listeners = new Set();
  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* storage เต็ม/ถูกบล็อก — ใช้ใน memory ต่อได้ */
    }
    listeners.forEach((fn) => fn());
  };
  const watch = (compute, cb) => {
    const run = () => cb(compute());
    listeners.add(run);
    run();
    return () => listeners.delete(run);
  };
  const inRange = (from, to) =>
    Object.entries(db.readings)
      .filter(([, r]) => r.slotTime >= from && r.slotTime <= to)
      .map(([id, r]) => ({ id, ...r }));

  return {
    mode: 'local',
    async init() {},
    watchReadings: (from, to, cb) => watch(() => inRange(from, to), cb),
    async getReadings(from, to) {
      return inRange(from, to);
    },
    async saveReading(r) {
      const { id, ...data } = r;
      const prev = db.readings[id];
      db.readings[id] = { ...prev, ...data, voided: false, createdAt: prev?.createdAt ?? Date.now(), updatedAt: Date.now() };
      persist();
      return 'synced';
    },
    async voidReading(id, by) {
      if (db.readings[id]) db.readings[id] = { ...db.readings[id], voided: true, voidedBy: by, updatedAt: Date.now() };
      persist();
      return 'synced';
    },
    watchStatus: (cb) => watch(() => db.status, cb),
    async saveStatus(status, by) {
      db.status = { ...status, updatedAt: Date.now(), by };
      persist();
      return 'synced';
    },
    watchEvents: (cb) =>
      watch(
        () =>
          Object.entries(db.events)
            .map(([id, e]) => ({ id, ...e }))
            .sort((a, b) => b.at - a.at),
        cb,
      ),
    async addEvent(ev) {
      const id = `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      db.events[id] = { ...ev, createdAt: Date.now() };
      persist();
      return id;
    },
    async updateEvent(id, patch) {
      if (db.events[id]) db.events[id] = { ...db.events[id], ...patch };
      persist();
      return 'synced';
    },
    watchLimits: (cb) => watch(() => db.limits, cb),
    async saveLimits(limits) {
      db.limits = { ...limits, updatedAt: Date.now() };
      persist();
      return 'synced';
    },
  };
}
