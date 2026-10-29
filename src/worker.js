/**
 * CLOUDFLARE WORKER ENTRYPOINT — ให้บริการ Static Assets (Frontend) + LINE Webhook API
 */
import { parseLineMessage, verifyLineSignature } from './modules/line-parser.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. LINE Webhook Endpoint สำหรับรับข้อความจากกลุ่ม LINE
    if (url.pathname === '/api/line-webhook') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }

      const signature = request.headers.get('x-line-signature');
      const body = await request.text();

      // ตรวจสอบความถูกต้องของลายเซ็น LINE
      if (env.LINE_CHANNEL_SECRET) {
        const isValid = await verifyLineSignature(body, signature, env.LINE_CHANNEL_SECRET);
        if (!isValid) {
          return new Response('Invalid signature', { status: 401 });
        }
      }

      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return new Response('Bad Request', { status: 400 });
      }

      const events = payload.events ?? [];
      for (const event of events) {
        if (event.type === 'message' && event.message?.type === 'text') {
          const parsed = parseLineMessage(event.message.text, event.timestamp);
          if (parsed.isPumpReport) {
            // บันทึกลง Cloudflare D1 Database (SQLite)
            if (env.DB) {
              ctx.waitUntil(saveToD1(parsed.readings, env.DB));
            }

            // บันทึกลง Firestore (ถ้ามีการกำหนด FIREBASE_PROJECT_ID)
            if (env.FIREBASE_PROJECT_ID) {
              ctx.waitUntil(saveToFirestore(parsed.readings, env));
            }

            // ตอบกลับยืนยันในแชต LINE ทันที (ฟรีด้วย replyToken)
            if (env.LINE_CHANNEL_ACCESS_TOKEN && event.replyToken) {
              ctx.waitUntil(sendLineReply(event.replyToken, parsed.replyText, env.LINE_CHANNEL_ACCESS_TOKEN));
            }
          } else if (parsed.isCommand) {
            if (parsed.command === 'status' && env.DB && env.LINE_CHANNEL_ACCESS_TOKEN && event.replyToken) {
              ctx.waitUntil(handleStatusCommand(event.replyToken, env));
            } else if (env.LINE_CHANNEL_ACCESS_TOKEN && event.replyToken && parsed.replyText) {
              ctx.waitUntil(sendLineReply(event.replyToken, parsed.replyText, env.LINE_CHANNEL_ACCESS_TOKEN));
            }
          }
        }
      }

      return new Response('OK', { status: 200 });
    }

    // 2. /api/readings — ซิงก์ข้อมูลอุณหภูมิระหว่างหน้าเว็บกับ D1 Database
    if (url.pathname === '/api/readings') {
      if (!env.DB) {
        return new Response(JSON.stringify({ ok: false, error: 'Database not configured' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      // รองรับ OPTIONS สำหรับ CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }

      // POST: บันทึก readings จากหน้าเว็บลง D1
      if (request.method === 'POST') {
        try {
          const body = await request.json();
          const items = Array.isArray(body) ? body : [body];
          await saveToD1(items, env.DB);
          return new Response(JSON.stringify({ ok: true, count: items.length }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        } catch (err) {
          return new Response(JSON.stringify({ ok: false, error: err.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }

      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405 });
      }

      const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 1000);
      const since = parseInt(url.searchParams.get('since') || '0', 10);
      const shiftId = url.searchParams.get('shiftId');

      let query = 'SELECT * FROM readings WHERE 1=1';
      const params = [];

      if (since > 0) {
        query += ' AND slotTime >= ?';
        params.push(since);
      }
      if (shiftId) {
        query += ' AND shiftId = ?';
        params.push(shiftId);
      }

      query += ' ORDER BY slotTime DESC LIMIT ?';
      params.push(limit);

      try {
        const { results } = await env.DB.prepare(query).bind(...params).all();
        return new Response(JSON.stringify({ ok: true, count: (results ?? []).length, readings: results ?? [] }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache',
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // 3. /api/state — ซิงก์สถานะปั๊ม และเกณฑ์อุณหภูมิ (Key-Value)
    if (url.pathname === '/api/state') {
      if (!env.DB) {
        return new Response(JSON.stringify({ ok: false, error: 'Database not configured' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }

      if (request.method === 'POST') {
        try {
          const body = await request.json();
          const { key, value, updatedBy } = body;
          if (!key || value === undefined) {
            return new Response(JSON.stringify({ ok: false, error: 'Missing key or value' }), { status: 400 });
          }
          await env.DB.prepare(`
            INSERT INTO app_state (key, value, updatedBy, updatedAt)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updatedBy=excluded.updatedBy, updatedAt=excluded.updatedAt
          `).bind(key, typeof value === 'string' ? value : JSON.stringify(value), updatedBy || '', Date.now()).run();

          return new Response(JSON.stringify({ ok: true, key }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        } catch (err) {
          return new Response(JSON.stringify({ ok: false, error: err.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }

      if (request.method === 'GET') {
        try {
          const { results } = await env.DB.prepare('SELECT * FROM app_state').all();
          const state = {};
          (results ?? []).forEach((row) => {
            state[row.key] = row;
          });
          return new Response(JSON.stringify({ ok: true, state }), {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-cache',
            },
          });
        } catch (err) {
          return new Response(JSON.stringify({ ok: false, error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }

      return new Response('Method Not Allowed', { status: 405 });
    }

    // 4. /api/events — ไทม์ไลน์งานสลับปั๊ม / งานล้าง
    if (url.pathname === '/api/events') {
      if (!env.DB) {
        return new Response(JSON.stringify({ ok: false, error: 'Database not configured' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }

      if (request.method === 'POST') {
        try {
          const e = await request.json();
          await env.DB.prepare(`
            INSERT INTO events (id, type, at, pump, target, endAt, note, by, endedBy, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              type=excluded.type, at=excluded.at, pump=excluded.pump, target=excluded.target,
              endAt=excluded.endAt, note=excluded.note, by=excluded.by, endedBy=excluded.endedBy
          `).bind(
            e.id,
            e.type,
            Number(e.at),
            e.pump || '',
            e.target || '',
            e.endAt != null ? Number(e.endAt) : null,
            e.note || '',
            e.by || '',
            e.endedBy || null,
            Number(e.createdAt || Date.now())
          ).run();

          return new Response(JSON.stringify({ ok: true, id: e.id }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        } catch (err) {
          return new Response(JSON.stringify({ ok: false, error: err.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }

      if (request.method === 'GET') {
        try {
          const { results } = await env.DB.prepare('SELECT * FROM events ORDER BY at DESC LIMIT 100').all();
          return new Response(JSON.stringify({ ok: true, count: (results ?? []).length, events: results ?? [] }), {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-cache',
            },
          });
        } catch (err) {
          return new Response(JSON.stringify({ ok: false, error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }

      return new Response('Method Not Allowed', { status: 405 });
    }

    // 5. Health check
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ status: 'ok', worker: 'PP-601 LINE Bot', d1: !!env.DB, time: Date.now() }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 6. Static Assets Fallback สำหรับหน้าเว็บ SPA
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};

/**
 * บันทึก Readings เข้า Cloudflare D1
 */
export async function saveToD1(readings, db) {
  if (!db || !readings || readings.length === 0) return;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO readings (
      id, pump, slotTime, shiftId, tg3602, tg3603, diff, note, recordedBy, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const batch = readings.map((r) =>
    stmt.bind(
      r.id,
      r.pump,
      Number(r.slotTime),
      r.shiftId,
      Number(r.tg3602),
      Number(r.tg3603),
      r.diff != null ? Number(r.diff) : null,
      r.note || '',
      r.recordedBy || 'LINE Bot',
      Date.now()
    )
  );

  try {
    await db.batch(batch);
  } catch (err) {
    console.error('saveToD1 error:', err);
  }
}

/**
 * บันทึก Readings เข้า Firestore REST API
 */
async function saveToFirestore(readings, env) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/readings`;

  for (const r of readings) {
    try {
      const docUrl = `${baseUrl}/${r.id}`;
      const docPayload = {
        fields: {
          pump: { stringValue: r.pump },
          slotTime: { integerValue: String(r.slotTime) },
          shiftId: { stringValue: r.shiftId },
          tg3602: { doubleValue: Number(r.tg3602) },
          tg3603: { doubleValue: Number(r.tg3603) },
          note: { stringValue: r.note || '' },
          recordedBy: { stringValue: 'LINE Bot' },
          voided: { booleanValue: false },
          updatedAt: { integerValue: String(Date.now()) },
        },
      };

      await fetch(docUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docPayload),
      });
    } catch (err) {
      console.error(`Firestore save error for ${r.id}:`, err);
    }
  }
}

/**
 * ส่งข้อความตอบกลับในห้องแชต LINE
 */
async function sendLineReply(replyToken, text, token) {
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: 'text', text }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`sendLineReply error [${res.status}]:`, errText);
    }
  } catch (err) {
    console.error('sendLineReply exception:', err);
  }
}

/**
 * ดึงข้อมูลล่าสุดจาก D1 แล้วสรุปตอบกลับคำสั่ง status ในแชต LINE
 */
async function handleStatusCommand(replyToken, env) {
  try {
    const { results } = await env.DB.prepare('SELECT * FROM readings ORDER BY slotTime DESC LIMIT 6').all();
    let reply = '📊 สรุปสถานะ PP-601 ล่าสุด:\n';
    if (results && results.length > 0) {
      const latest = {};
      results.forEach((r) => {
        if (!latest[r.pump]) latest[r.pump] = r;
      });
      ['A', 'B', 'C'].forEach((p) => {
        const r = latest[p];
        if (r) {
          const isWarn = r.tg3603 < 70 || (r.diff != null && r.diff < 20);
          reply += `• PP-601${p}: In ${r.tg3602}° / Out ${r.tg3603}° (Diff ${r.diff}°) ${isWarn ? '⚠️' : '🟢'}\n`;
        } else {
          reply += `• PP-601${p}: สแตนด์บาย (ยังไม่มีค่าเดินเครื่อง)\n`;
        }
      });
      reply += '\n🌐 ดูรายละเอียด: https://monitor-pp-601.supasiao.workers.dev';
    } else {
      reply = 'ยังไม่มีข้อมูลในระบบ D1 ค่ะ';
    }
    await sendLineReply(replyToken, reply.trim(), env.LINE_CHANNEL_ACCESS_TOKEN);
  } catch (err) {
    console.error('handleStatusCommand error:', err);
  }
}
