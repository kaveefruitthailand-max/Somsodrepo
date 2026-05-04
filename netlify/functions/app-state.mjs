import { getDatabase } from '@netlify/database'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })

const cleanText = (value, max = 160) => String(value || '').slice(0, max)

function safeState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value
}

function rowToState(row) {
  return {
    ok: true,
    state: row?.data || null,
    revision: Number(row?.revision || 0),
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    updatedBy: row?.updated_by || '',
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function mergeById(base, next, idKey, updatedKeys = ['updatedAt', 'approvedAt', 'createdAt', 'ts']) {
  const out = new Map()
  const score = (item) => Math.max(
    ...updatedKeys.map((key) => Number(item?.[key] || 0)),
    0,
  )
  for (const item of asArray(base)) {
    const id = item?.[idKey]
    if (id) out.set(String(id), item)
  }
  for (const item of asArray(next)) {
    const id = item?.[idKey]
    if (!id) continue
    const key = String(id)
    const current = out.get(key)
    out.set(key, !current || score(item) >= score(current) ? { ...(current || {}), ...item } : { ...item, ...current })
  }
  return [...out.values()]
}

function mergeChatMessages(base, next, deletedIds = []) {
  const deleted = new Set(asArray(deletedIds))
  const byId = new Map()
  for (const item of asArray(base).concat(asArray(next))) {
    if (!item) continue
    const id = item.id || [item.source || '', item.roomId || '', item.ts || '', item.sender || '', item.text || ''].join('|')
    if (!id) continue
    byId.set(String(id), { ...(byId.get(String(id)) || {}), ...item })
  }
  return [...byId.values()].filter((m) => !deleted.has(m.id)).sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0)).slice(-500)
}

function mergeChatRooms(base, next, deletedIds = []) {
  const rooms = mergeById(base, next, 'id', ['updatedAt', 'ts'])
  const oldById = new Map(asArray(base).filter((r) => r?.id).map((r) => [String(r.id), r]))
  const newById = new Map(asArray(next).filter((r) => r?.id).map((r) => [String(r.id), r]))
  return rooms.map((room) => {
    const id = String(room.id)
    return {
      ...room,
      messages: mergeChatMessages(oldById.get(id)?.messages, newById.get(id)?.messages, deletedIds),
    }
  })
}

function mergeDeletes(base, next) {
  return { ...(base && typeof base === 'object' ? base : {}), ...(next && typeof next === 'object' ? next : {}) }
}

function mergeProducts(base, next, deletedIds = {}) {
  const merged = mergeById(base, next, 'id', ['updatedAt', 'ts', 'createdAt'])
  const deleted = deletedIds && typeof deletedIds === 'object' ? deletedIds : {}
  return merged.filter((product) => {
    const id = product?.id
    if (!id || !deleted[id]) return true
    return Number(deleted[id] || 0) < Number(product.updatedAt || product.ts || product.createdAt || 0)
  })
}

function mergeMovements(base, next) {
  const byId = new Map()
  for (const item of asArray(base).concat(asArray(next))) {
    if (!item) continue
    const id = [
      item.movementId || '',
      item.ts || '',
      item.id || '',
      item.kind || '',
      item.qty || '',
      item.before || '',
      item.after || '',
    ].join('|')
    if (!id.trim()) continue
    byId.set(String(id), { ...(byId.get(String(id)) || {}), ...item })
  }
  return [...byId.values()].sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0)).slice(0, 300)
}

function mergeRegistrationDeletes(base, next) {
  return mergeDeletes(base, next)
}

function mergeRegistrations(base, next, deletes) {
  const merged = mergeById(base, next, 'id4')
  const deleted = deletes && typeof deletes === 'object' ? deletes : {}
  return merged.filter((user) => {
    const id = user?.id4
    if (!id || !deleted[id]) return true
    const changedAt = Math.max(Number(user.updatedAt || 0), Number(user.approvedAt || 0), Number(user.createdAt || 0), Number(user.pendingSince || 0))
    return Number(deleted[id] || 0) < changedAt
  })
}

function mergeAppState(current, incoming) {
  const merged = { ...safeState(current), ...safeState(incoming) }
  const registrationDeletes = mergeRegistrationDeletes(current?.registrationDeletes, incoming?.registrationDeletes)
  merged.registrationDeletes = registrationDeletes
  merged.registrations = mergeRegistrations(current?.registrations, incoming?.registrations, registrationDeletes)
  merged.productDeletedIds = mergeDeletes(current?.productDeletedIds, incoming?.productDeletedIds)
  merged.products = mergeProducts(current?.products, incoming?.products, merged.productDeletedIds)
  merged.movements = mergeMovements(current?.movements, incoming?.movements)
  merged.chatDeletedIds = [...new Set(asArray(current?.chatDeletedIds).concat(asArray(incoming?.chatDeletedIds)))].slice(-1000)
  merged.chatRooms = mergeChatRooms(current?.chatRooms, incoming?.chatRooms, merged.chatDeletedIds)
  merged.feedChat = mergeChatMessages(current?.feedChat, incoming?.feedChat, merged.chatDeletedIds)
  merged.auditLog = mergeChatMessages(current?.auditLog, incoming?.auditLog).slice(-500)
  merged.roles = mergeById(current?.roles, incoming?.roles, 'id')
  merged.userRoles = mergeById(current?.userRoles, incoming?.userRoles, 'email')
  return merged
}

async function getState(key) {
  const db = getDatabase()
  const rows = await db.sql`
    SELECT key, data, revision, updated_by, updated_at
    FROM app_state
    WHERE key = ${key}
    LIMIT 1
  `
  if (!rows.length) return json({ ok: true, state: null, revision: 0, updatedAt: null, updatedBy: '' })
  return json(rowToState(rows[0]))
}

async function saveState(key, body) {
  const db = getDatabase()
  const incomingState = safeState(body.state || body.data || body)
  const updatedBy = cleanText(body.updatedBy || body.by || body.clientId || '')
  const currentRows = await db.sql`
    SELECT data
    FROM app_state
    WHERE key = ${key}
    LIMIT 1
  `
  const state = mergeAppState(currentRows[0]?.data || {}, incomingState)

  const rows = await db.sql`
    INSERT INTO app_state (key, data, revision, updated_by, updated_at)
    VALUES (${key}, ${JSON.stringify(state)}::jsonb, 1, ${updatedBy}, NOW())
    ON CONFLICT (key) DO UPDATE SET
      data = EXCLUDED.data,
      revision = app_state.revision + 1,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING key, data, revision, updated_by, updated_at
  `

  return json(rowToState(rows[0]))
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true })

  try {
    const url = new URL(req.url)
    const key = cleanText(url.searchParams.get('key') || 'main', 80)

    if (req.method === 'GET') return getState(key)
    if (req.method === 'POST') {
      const body = await req.json().catch(() => null)
      if (!body || typeof body !== 'object') return json({ ok: false, error: 'invalid body' }, 400)
      return saveState(key, body)
    }

    return json({ ok: false, error: 'method not allowed' }, 405)
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err) }, 500)
  }
}

export const config = {
  path: '/api/app-state',
}
