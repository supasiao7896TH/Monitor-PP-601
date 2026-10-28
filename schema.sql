-- Schema สำหรับ Cloudflare D1 (pp601-db)
CREATE TABLE IF NOT EXISTS readings (
  id TEXT PRIMARY KEY,
  pump TEXT NOT NULL,
  slotTime INTEGER NOT NULL,
  shiftId TEXT NOT NULL,
  tg3602 REAL NOT NULL,
  tg3603 REAL NOT NULL,
  diff REAL,
  note TEXT DEFAULT '',
  recordedBy TEXT DEFAULT 'LINE Bot',
  updatedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_readings_slotTime ON readings(slotTime DESC);
CREATE INDEX IF NOT EXISTS idx_readings_shiftId ON readings(shiftId);
