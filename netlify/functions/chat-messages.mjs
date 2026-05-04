import { getDatabase } from '@netlify/database'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })

const cleanText = (value, max = 240) => String(value || '').slice(0, max)
const cleanPayload = (message) => {
  if (!message || typeof message !== 'object') return {}
  const payload = { ...message }
  if (typeof payload.text === 'string') payload.text = payload.text.slice(0, 5000)
  if (typeof payload.photo === 'string') payload.photo = payload.photo.slice(0, 650000)
  if (typeof payload.data === 'string') payload.data = payload.data.slice(0, 650000)
  if (typeof payload.audio === 'string') payload.audio = payload.audio.slice(0, 900000)
  return payload
}

const rowToMessage = (row) => {
  const payload = row.payload_json && typeof row.payload_json === 'object' ? row.payload_json : {}
  return {
    source: row.source || '',
    roomId: row.room_id || '',
    roomName: row.room_name || '',
    ...payload,
    id: row.id,
    ts: Number(row.created_at_ms) || payload.ts || Date.now(),
    sender: payload.sender || row.sender || '',
    email: payload.email || row.sender_email || '',
    senderEmail: payload.senderEmail || row.sender_email || '',
    id4: payload.id4 || row.applicant_id || '',
    level: payload.level || Number(row.level) || 0,
    text: payload.text || row.text || '',
  }
}

async function handleGet(req) {
  const url = new URL(req.url)
  const source = cleanText(url.searchParams.get('source'), 80)
  const roomId = cleanText(url.searchParams.get('roomId'), 120)
  const code = cleanText(url.searchParams.get('code'), 40)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 500, 1), 1000)
  const db = getDatabase()

  let rows
  if (source && roomId) {
    rows = await db.sql`
      SELECT * FROM chat_messages
      WHERE source = ${source} AND room_id = ${roomId}
      ORDER BY created_at_ms DESC
      LIMIT ${limit}
    `
  } else if (source) {
    rows = await db.sql`
      SELECT * FROM chat_messages
      WHERE source = ${source}
      ORDER BY created_at_ms DESC
      LIMIT ${limit}
    `
  } else {
    if (code !== 'SS1234') return json({ ok: false, error: 'archive code required' }, 403)
    rows = await db.sql`
      SELECT * FROM chat_messages
      ORDER BY created_at_ms DESC
      LIMIT ${limit}
    `
  }

  return json({ ok: true, messages: rows.map(rowToMessage).reverse() })
}

async function handlePost(req) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'invalid body' }, 400)

  const message = body.message && typeof body.message === 'object' ? body.message : body
  const ts = Number(message.ts || body.ts || Date.now())
  const source = cleanText(body.source || message.source, 80)
  const roomId = cleanText(body.roomId || message.roomId || message.room_id, 120)
  const id = cleanText(message.id || body.id || `${source || 'chat'}_${roomId || 'main'}_${ts}`, 160)

  if (!source || !id || !Number.isFinite(ts)) return json({ ok: false, error: 'invalid chat message' }, 400)

  const payload = cleanPayload({ ...message, id, source, roomId, ts })
  const kind = cleanText(
    body.kind || message.kind || (message.audio ? 'voice' : message.photo || message.data ? 'image' : message.sticker ? 'sticker' : 'text'),
    40,
  )

  const db = getDatabase()
  await db.sql`
    INSERT INTO chat_messages (
      id,
      source,
      room_id,
      room_name,
      message_kind,
      sender,
      sender_email,
      applicant_id,
      level,
      text,
      payload_json,
      created_at_ms
    )
    VALUES (
      ${id},
      ${source},
      ${roomId},
      ${cleanText(body.roomName || message.roomName, 160)},
      ${kind},
      ${cleanText(message.sender, 160)},
      ${cleanText(message.email || message.senderEmail, 200)},
      ${cleanText(message.id4, 40)},
      ${cleanText(message.level, 20)},
      ${cleanText(message.text, 5000)},
      ${JSON.stringify(payload)}::jsonb,
      ${Math.trunc(ts)}
    )
    ON CONFLICT (id) DO UPDATE SET
      source = EXCLUDED.source,
      room_id = EXCLUDED.room_id,
      room_name = EXCLUDED.room_name,
      message_kind = EXCLUDED.message_kind,
      sender = EXCLUDED.sender,
      sender_email = EXCLUDED.sender_email,
      applicant_id = EXCLUDED.applicant_id,
      level = EXCLUDED.level,
      text = EXCLUDED.text,
      payload_json = EXCLUDED.payload_json,
      created_at_ms = EXCLUDED.created_at_ms
  `

  return json({ ok: true, message: rowToMessage({
    id,
    source,
    room_id: roomId,
    room_name: cleanText(body.roomName || message.roomName, 160),
    sender: cleanText(message.sender, 160),
    sender_email: cleanText(message.email || message.senderEmail, 200),
    applicant_id: cleanText(message.id4, 40),
    level: cleanText(message.level, 20),
    text: cleanText(message.text, 5000),
    payload_json: payload,
    created_at_ms: Math.trunc(ts),
  }) })
}

async function handleDelete(req) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'invalid body' }, 400)
  const id = cleanText(body.id, 180)
  const adminCode = cleanText(body.adminCode, 80)
  if (!id) return json({ ok: false, error: 'message id required' }, 400)
  if (adminCode !== 'Somsod12345') return json({ ok: false, error: 'admin required' }, 403)

  const db = getDatabase()
  await db.sql`
    DELETE FROM chat_messages
    WHERE id = ${id}
  `

  return json({ ok: true, id })
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true })

  try {
    if (req.method === 'GET') return handleGet(req)
    if (req.method === 'POST') return handlePost(req)
    if (req.method === 'DELETE') return handleDelete(req)
    return json({ ok: false, error: 'method not allowed' }, 405)
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err) }, 500)
  }
}

export const config = {
  path: '/api/chat-messages',
}
