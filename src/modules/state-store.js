/** Reactive pub/sub เล็กๆ — get / set / on (on คืนฟังก์ชัน unsubscribe) */
export function createStore(initial = {}) {
  const data = { ...initial };
  const subs = new Map();
  return {
    get: (k) => data[k],
    set(k, v) {
      data[k] = v;
      (subs.get(k) ?? []).forEach((fn) => fn(v));
    },
    on(k, fn) {
      if (!subs.has(k)) subs.set(k, new Set());
      subs.get(k).add(fn);
      return () => subs.get(k).delete(fn);
    },
  };
}
