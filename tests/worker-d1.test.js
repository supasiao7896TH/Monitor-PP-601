import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveToD1 } from '../src/worker.js';
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
});
