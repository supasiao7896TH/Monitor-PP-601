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

-- ตารางเก็บสถานะปั๊ม และเกณฑ์อุณหภูมิ (Key-Value)
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedBy TEXT DEFAULT '',
  updatedAt INTEGER NOT NULL
);

-- ตารางเก็บไทม์ไลน์การสลับปั๊ม / งานล้าง
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  at INTEGER NOT NULL,
  pump TEXT,
  target TEXT,
  endAt INTEGER,
  note TEXT DEFAULT '',
  by TEXT DEFAULT '',
  endedBy TEXT,
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_at ON events(at DESC);
