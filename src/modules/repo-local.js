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
  let hasD1 = false;
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

  // ซิงก์ข้อมูลจาก Cloudflare D1
  async function syncD1() {
    try {
      const res = await fetch('/api/readings?limit=300');
      if (!res.ok) return false;
      const data = await res.json();
      if (data.ok && Array.isArray(data.readings)) {
        hasD1 = true;
        let changed = false;
        for (const r of data.readings) {
          const prev = db.readings[r.id];
          if (!prev || (r.updatedAt && r.updatedAt > (prev.updatedAt || 0))) {
            db.readings[r.id] = {
              ...prev,
              ...r,
              slotTime: Number(r.slotTime),
              tg3602: Number(r.tg3602),
              tg3603: Number(r.tg3603),
              diff: r.diff != null ? Number(r.diff) : null,
              voided: !!r.voided,
            };
            changed = true;
          }
        }
        if (changed) persist();
        return true;
      }
    } catch {
      // ออฟไลน์หรือรัน dev standalone
    }
    return false;
  }

  return {
    mode: 'local',
    get hasD1() {
      return hasD1;
    },
    async init() {
      await syncD1();
      if (typeof window !== 'undefined') {
        window.addEventListener('focus', () => syncD1());
        window.addEventListener('online', () => syncD1());
      }
    },
    syncD1,
    watchReadings: (from, to, cb) => watch(() => inRange(from, to), cb),
    async getReadings(from, to) {
      return inRange(from, to);
    },
    async saveReading(r) {
      const { id, ...data } = r;
      const prev = db.readings[id];
      const doc = { ...prev, ...data, id, voided: false, createdAt: prev?.createdAt ?? Date.now(), updatedAt: Date.now() };
      db.readings[id] = doc;
      persist();

      // บันทึกลง D1 ถ้าเชื่อมต่อเครือข่ายอยู่
      try {
        fetch('/api/readings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(doc),
        }).catch(() => {});
      } catch {}

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
    async importSeed({ readings = [], events = [] }, onProgress = () => {}) {
      let importedReadings = 0;
      let importedEvents = 0;
      const now = Date.now();
      for (const r of readings) {
        if (!db.readings[r.id]) {
          db.readings[r.id] = { ...r, createdAt: now, updatedAt: now };
          importedReadings++;
        }
      }
      for (const e of events) {
        if (!db.events[e.id]) {
          db.events[e.id] = { ...e, createdAt: e.createdAt ?? now };
          importedEvents++;
        }
      }
      persist();
      onProgress(readings.length, readings.length);
      return { readings: importedReadings, events: importedEvents };
    },
  };
}
