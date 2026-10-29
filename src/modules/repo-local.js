/**
 * LOCAL REPO — โหมดทดลองในเครื่อง + ซิงก์ Cloudflare D1 (Edge SQL)
 * หน้าตา interface เหมือน cloud-sync-manager.js ทุกอย่าง เพื่อให้ view ไม่ต้องรู้ว่าใช้ตัวไหน
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

  // ซิงก์ข้อมูลจาก Cloudflare D1 (readings, app_state, events)
  async function syncD1() {
    let changed = false;

    // 1. ซิงก์ Readings
    try {
      const res = await fetch('/api/readings?limit=300');
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.readings)) {
          hasD1 = true;
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
        }
      }
    } catch {}

    // 2. ซิงก์ app_state (status, limits)
    try {
      const stateRes = await fetch('/api/state');
      if (stateRes.ok) {
        const stateData = await stateRes.json();
        if (stateData.ok && stateData.state) {
          hasD1 = true;
          if (stateData.state.status) {
            const stRow = stateData.state.status;
            if (!db.status || (stRow.updatedAt && stRow.updatedAt > (db.status.updatedAt || 0))) {
              try {
                const parsedStatus = JSON.parse(stRow.value);
                db.status = { ...parsedStatus, updatedAt: stRow.updatedAt, by: stRow.updatedBy };
                changed = true;
              } catch {}
            }
          }
          if (stateData.state.limits) {
            const limRow = stateData.state.limits;
            if (!db.limits || (limRow.updatedAt && limRow.updatedAt > (db.limits.updatedAt || 0))) {
              try {
                const parsedLimits = JSON.parse(limRow.value);
                db.limits = { ...parsedLimits, updatedAt: limRow.updatedAt };
                changed = true;
              } catch {}
            }
          }
        }
      }
    } catch {}

    // 3. ซิงก์ events
    try {
      const evRes = await fetch('/api/events');
      if (evRes.ok) {
        const evData = await evRes.json();
        if (evData.ok && Array.isArray(evData.events)) {
          hasD1 = true;
          for (const e of evData.events) {
            const prev = db.events[e.id];
            if (!prev || (e.endAt && !prev.endAt)) {
              db.events[e.id] = {
                ...prev,
                ...e,
                at: Number(e.at),
                endAt: e.endAt != null ? Number(e.endAt) : null,
                createdAt: Number(e.createdAt || e.at),
              };
              changed = true;
            }
          }
        }
      }
    } catch {}

    if (changed) persist();
    return hasD1;
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
        // Auto-polling ทุก 60 วินาที สำหรับหน้าจอ Control Room PC ที่เปิดค้างไว้
        setInterval(() => {
          if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            syncD1();
          }
        }, 60000);
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
      try {
        fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'status', value: JSON.stringify(status), updatedBy: by }),
        }).catch(() => {});
      } catch {}
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
      const doc = { ...ev, id, createdAt: Date.now() };
      db.events[id] = doc;
      persist();
      try {
        fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(doc),
        }).catch(() => {});
      } catch {}
      return id;
    },
    async updateEvent(id, patch) {
      if (db.events[id]) {
        db.events[id] = { ...db.events[id], ...patch };
        persist();
        try {
          fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(db.events[id]),
          }).catch(() => {});
        } catch {}
      }
      return 'synced';
    },
    watchLimits: (cb) => watch(() => db.limits, cb),
    async saveLimits(limits) {
      db.limits = { ...limits, updatedAt: Date.now() };
      persist();
      try {
        fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'limits', value: JSON.stringify(limits) }),
        }).catch(() => {});
      } catch {}
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
