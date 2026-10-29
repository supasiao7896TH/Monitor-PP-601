import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker, { saveToD1 } from '../src/worker.js';
import { createLocalRepo } from '../src/modules/repo-local.js';

describe('Cloudflare D1 Integration & Sync', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('saveToD1: สร้าง Batch Statement และ Bind ค่าครบถ้วน', async () => {
    const executed = [];
    const mockDb = {
      prepare: vi.fn((sql) => ({
        bind: vi.fn((...args) => ({ sql, args })),
      })),
      batch: vi.fn(async (statements) => {
        executed.push(...statements);
        return statements.map(() => ({ success: true }));
      }),
    };

    const mockReadings = [
      {
        id: '2026-10-28_22-00_A',
        pump: 'A',
        slotTime: 1793209200000,
        shiftId: '2026-10-28-N',
        tg3602: 125,
        tg3603: 77,
        diff: 48,
        note: 'ปกติ',
        recordedBy: 'LINE Bot',
      },
      {
        id: '2026-10-28_22-00_C',
        pump: 'C',
        slotTime: 1793209200000,
        shiftId: '2026-10-28-N',
        tg3602: 128,
        tg3603: 94,
        diff: 34,
        note: '',
        recordedBy: 'LINE Bot',
      },
    ];

    await saveToD1(mockReadings, mockDb);

    expect(mockDb.prepare).toHaveBeenCalledTimes(1);
    expect(mockDb.batch).toHaveBeenCalledTimes(1);
    expect(executed.length).toBe(2);
    expect(executed[0].args[0]).toBe('2026-10-28_22-00_A');
    expect(executed[0].args[1]).toBe('A');
    expect(executed[0].args[4]).toBe(125);
    expect(executed[0].args[5]).toBe(77);
    expect(executed[0].args[6]).toBe(48);
  });

  it('repo-local syncD1: ดึงข้อมูลจาก /api/readings แล้วผสานเข้า IndexedDB/LocalStorage สำเร็จ', async () => {
    const mockApiResponse = {
      ok: true,
      count: 2,
      readings: [
        {
          id: '2026-10-28_22-00_A',
          pump: 'A',
          slotTime: 1793209200000,
          shiftId: '2026-10-28-N',
          tg3602: 125,
          tg3603: 77,
          diff: 48,
          note: '',
          recordedBy: 'LINE Bot',
          updatedAt: 1793209210000,
        },
      ],
    };

    // จำลอง fetch API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    const repo = createLocalRepo();
    const synced = await repo.syncD1();

    expect(synced).toBe(true);
    expect(repo.hasD1).toBe(true);

    const readings = await repo.getReadings(1793200000000, 1793300000000);
    expect(readings.length).toBe(1);
    expect(readings[0].id).toBe('2026-10-28_22-00_A');
    expect(readings[0].tg3602).toBe(125);
    expect(readings[0].tg3603).toBe(77);
    expect(readings[0].diff).toBe(48);
  });

  it('worker fetch: จัดการ /api/state GET และ POST ลง D1 สำเร็จ', async () => {
    let savedState = null;
    const mockDb = {
      prepare: vi.fn((sql) => ({
        bind: vi.fn((...args) => ({
          run: vi.fn(async () => {
            savedState = { key: args[0], value: args[1], updatedBy: args[2], updatedAt: args[3] };
            return { success: true };
          }),
        })),
        all: vi.fn(async () => ({
          results: savedState ? [savedState] : [],
        })),
      })),
    };

    // 1. POST /api/state
    const postReq = new Request('https://test.workers.dev/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'status', value: JSON.stringify({ A: 'RUN', B: 'STANDBY', C: 'RUN' }), updatedBy: 'Supasit' }),
    });
    const postRes = await worker.fetch(postReq, { DB: mockDb }, {});
    expect(postRes.status).toBe(200);
    const postJson = await postRes.json();
    expect(postJson.ok).toBe(true);
    expect(savedState.key).toBe('status');
    expect(savedState.updatedBy).toBe('Supasit');

    // 2. GET /api/state
    const getReq = new Request('https://test.workers.dev/api/state', { method: 'GET' });
    const getRes = await worker.fetch(getReq, { DB: mockDb }, {});
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.ok).toBe(true);
    expect(getJson.state.status).toBeDefined();
    expect(JSON.parse(getJson.state.status.value).B).toBe('STANDBY');
  });

  it('worker fetch: จัดการ /api/events GET และ POST ลง D1 สำเร็จ', async () => {
    let savedEvent = null;
    const mockDb = {
      prepare: vi.fn((sql) => ({
        bind: vi.fn((...args) => ({
          run: vi.fn(async () => {
            savedEvent = { id: args[0], type: args[1], at: args[2], pump: args[3], target: args[4], endAt: args[5], note: args[6], by: args[7], endedBy: args[8], createdAt: args[9] };
            return { success: true };
          }),
        })),
        all: vi.fn(async () => ({
          results: savedEvent ? [savedEvent] : [],
        })),
      })),
    };

    // 1. POST /api/events
    const postReq = new Request('https://test.workers.dev/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'ev_123', type: 'switch', at: 1793200000000, pump: 'B', by: 'Supasit' }),
    });
    const postRes = await worker.fetch(postReq, { DB: mockDb }, {});
    expect(postRes.status).toBe(200);
    const postJson = await postRes.json();
    expect(postJson.ok).toBe(true);
    expect(savedEvent.id).toBe('ev_123');

    // 2. GET /api/events
    const getReq = new Request('https://test.workers.dev/api/events', { method: 'GET' });
    const getRes = await worker.fetch(getReq, { DB: mockDb }, {});
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.ok).toBe(true);
    expect(getJson.events.length).toBe(1);
    expect(getJson.events[0].id).toBe('ev_123');
  });
});
