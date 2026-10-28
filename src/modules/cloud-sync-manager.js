/**
 * CLOUD_SYNC_MANAGER — Firestore real-time (onSnapshot) + Anonymous Auth
 * interface เดียวกับ repo-local.js
 *
 * ตัดสินใจสำคัญ:
 *  - Auth ใช้ inMemoryPersistence: LINE/FB WebView บล็อก IndexedDB (ตาม vibe-coding-firebase §20)
 *    ผลข้างเคียง: uid เปลี่ยนทุกครั้งที่เปิดหน้า → ความเป็นเจ้าของ doc ผูกกับ uid ไม่ได้
 *    จึงใช้ชื่อผู้จด (recordedBy) แทน และ rules อนุญาตให้ทีมแก้ไขกันได้ แต่ลบไม่ได้
 *  - ไม่ await การยืนยันจากเซิร์ฟเวอร์เกิน 3 วินาที: ออฟไลน์ setDoc จะค้างจนต่อเน็ตได้ คืน 'pending' ให้ UI
 */
import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, inMemoryPersistence, signInAnonymously } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  memoryLocalCache,
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
} from 'firebase/firestore';

const SYNC_TIMEOUT_MS = 3000;

function withTimeout(promise) {
  return Promise.race([
    promise.then(() => 'synced'),
    new Promise((resolve) => setTimeout(() => resolve('pending'), SYNC_TIMEOUT_MS)),
  ]);
}

function createCache() {
  // แคชบนดิสก์ใช้ได้เมื่อมี IndexedDB — WebView ที่บล็อกจะใช้แคชในหน่วยความจำแทน
  try {
    if (typeof indexedDB !== 'undefined') return persistentLocalCache();
  } catch {
    /* ตกไปใช้ memory */
  }
  return memoryLocalCache();
}

const mapDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

export function createFirebaseRepo(firebaseConfig) {
  let db;
  const readingsRef = () => collection(db, 'readings');
  const rangeQuery = (from, to) =>
    query(readingsRef(), where('slotTime', '>=', from), where('slotTime', '<=', to), orderBy('slotTime'));

  return {
    mode: 'firebase',

    async init() {
      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);
      await setPersistence(auth, inMemoryPersistence); // ต้องตั้งก่อน signIn เสมอ
      await signInAnonymously(auth);
      db = initializeFirestore(app, {
        localCache: createCache(),
        experimentalAutoDetectLongPolling: true, // เครือข่ายโรงงาน/proxy ที่บล็อก streaming
      });
    },

    watchReadings(from, to, cb) {
      return onSnapshot(rangeQuery(from, to), (snap) => cb(mapDocs(snap)), (err) => console.error('readings', err));
    },

    async getReadings(from, to) {
      return mapDocs(await getDocs(rangeQuery(from, to)));
    },

    saveReading({ id, ...data }) {
      const now = Date.now();
      // merge: จดซ้ำ slot เดิมทับ doc เดิม · createdAt ตั้งครั้งแรกเท่านั้นไม่ได้ (ไม่อ่านก่อนเขียน) จึงเก็บเฉพาะ updatedAt
      return withTimeout(setDoc(doc(db, 'readings', id), { ...data, voided: false, updatedAt: now }, { merge: true }));
    },

    voidReading(id, by) {
      return withTimeout(updateDoc(doc(db, 'readings', id), { voided: true, voidedBy: by, updatedAt: Date.now() }));
    },

    watchStatus(cb) {
      return onSnapshot(doc(db, 'pumpStatus', 'current'), (s) => cb(s.exists() ? s.data() : null));
    },

    saveStatus(status, by) {
      return withTimeout(setDoc(doc(db, 'pumpStatus', 'current'), { ...status, updatedAt: Date.now(), by }));
    },

    watchEvents(cb) {
      const q = query(collection(db, 'events'), orderBy('at', 'desc'), limit(100));
      return onSnapshot(q, (snap) => cb(mapDocs(snap)));
    },

    async addEvent(ev) {
      // สร้าง id ฝั่ง client แล้ว setDoc — addDoc จะค้างตอนออฟไลน์
      const ref = doc(collection(db, 'events'));
      await withTimeout(setDoc(ref, { ...ev, createdAt: Date.now() }));
      return ref.id;
    },

    updateEvent(id, patch) {
      return withTimeout(updateDoc(doc(db, 'events', id), patch));
    },

    watchLimits(cb) {
      return onSnapshot(doc(db, 'config', 'limits'), (s) => cb(s.exists() ? s.data() : null));
    },

    saveLimits(limits) {
      return withTimeout(setDoc(doc(db, 'config', 'limits'), { ...limits, updatedAt: Date.now() }));
    },

    async importSeed({ readings = [], events = [] }, onProgress = () => {}) {
      let count = 0;
      const total = readings.length + events.length;
      const now = Date.now();

      // Chunk readings in batches of 300 to stay well under Firestore's 500 batch limit
      for (let i = 0; i < readings.length; i += 300) {
        const batch = writeBatch(db);
        const chunk = readings.slice(i, i + 300);
        for (const r of chunk) {
          const { id, ...data } = r;
          const ref = doc(db, 'readings', id);
          batch.set(ref, { ...data, updatedAt: now }, { merge: true });
        }
        await batch.commit();
        count += chunk.length;
        onProgress(count, total);
      }

      // Chunk events
      for (let i = 0; i < events.length; i += 300) {
        const batch = writeBatch(db);
        const chunk = events.slice(i, i + 300);
        for (const e of chunk) {
          const { id, ...data } = e;
          const ref = doc(db, 'events', id);
          batch.set(ref, { ...data, createdAt: data.createdAt ?? now }, { merge: true });
        }
        await batch.commit();
        count += chunk.length;
        onProgress(count, total);
      }

      return { readings: readings.length, events: events.length };
    },
  };
}
