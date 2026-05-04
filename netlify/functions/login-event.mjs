import { getDatabase } from '@netlify/database'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })

const cleanText = (value, max = 160) => String(value || '').slice(0, max)
const cleanNumber = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return json({ error: 'invalid body' }, 400)

  const event = {
    id: cleanText(body.id || `login_${Date.now()}`, 80),
    loggedAt: new Date(body.at || body.ts || Date.now()),
    method: cleanText(body.method, 40),
    applicantId: cleanText(body.id4, 20),
    displayName: cleanText(body.name, 120),
    realName: cleanText(body.realName, 160),
    level: cleanText(body.level, 20),
    locationStatus: cleanText(body.status, 40),
    latitude: cleanNumber(body.lat),
    longitude: cleanNumber(body.lng),
    accuracy: cleanNumber(body.accuracy),
    altitude: cleanNumber(body.altitude),
    speed: cleanNumber(body.speed),
    heading: cleanNumber(body.heading),
    error: cleanText(body.error, 240),
  }

  if (!event.id || Number.isNaN(event.loggedAt.getTime())) {
    return json({ error: 'invalid login event' }, 400)
  }

  try {
    const db = getDatabase()
    await db.sql`
      INSERT INTO login_events (
        id,
        logged_at,
        method,
        applicant_id,
        display_name,
        real_name,
        level,
        location_status,
        latitude,
        longitude,
        accuracy,
        altitude,
        speed,
        heading,
        error
      )
      VALUES (
        ${event.id},
        ${event.loggedAt},
        ${event.method},
        ${event.applicantId},
        ${event.displayName},
        ${event.realName},
        ${event.level},
        ${event.locationStatus},
        ${event.latitude},
        ${event.longitude},
        ${event.accuracy},
        ${event.altitude},
        ${event.speed},
        ${event.heading},
        ${event.error}
      )
      ON CONFLICT (id) DO NOTHING
    `
    return json({ ok: true })
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err) }, 500)
  }
}

export const config = {
  path: '/api/login-event',
}
