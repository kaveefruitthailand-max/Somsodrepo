import { getStore } from '@netlify/blobs'

const STORE = 'appsomsod-sync'
const CONFIG_KEY = 'gs_config'

export default async (req) => {
  const url = new URL(req.url)
  const op = url.searchParams.get('op') || ''

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })

  if (req.method === 'OPTIONS') return json({ ok: true })

  const store = getStore(STORE)

  if (op === 'config' && req.method === 'POST') {
    const body = await req.json().catch(() => ({}))
    const nextUrl = String(body.url || '').trim().replace(/\/$/, '')
    if (!nextUrl) {
      await store.delete(CONFIG_KEY)
      return json({ ok: true, configured: false })
    }
    if (!/^https:\/\/script\.google\.com\//.test(nextUrl)) {
      return json({ error: 'invalid Apps Script URL' }, 400)
    }
    await store.setJSON(CONFIG_KEY, { url: nextUrl, updatedAt: Date.now() })
    return json({ ok: true, configured: true })
  }

  if (op === 'config' && req.method === 'GET') {
    const cfg = await store.get(CONFIG_KEY, { type: 'json' })
    return json({ configured: Boolean(cfg?.url), url: cfg?.url || '', updatedAt: cfg?.updatedAt || null })
  }

  if (op === 'sync' && req.method === 'POST') {
    const cfg = await store.get(CONFIG_KEY, { type: 'json' })
    if (!cfg?.url) return json({ error: 'Apps Script URL not configured' }, 400)
    const payload = await req.text()
    try {
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: payload,
        redirect: 'follow',
      })
      const text = await res.text()
      let parsed
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = { raw: text }
      }
      return json({ ok: res.ok, status: res.status, result: parsed })
    } catch (err) {
      return json({ error: String(err?.message || err) }, 502)
    }
  }

  if (op === 'info' && req.method === 'GET') {
    const cfg = await store.get(CONFIG_KEY, { type: 'json' })
    if (!cfg?.url) return json({ error: 'Apps Script URL not configured' }, 400)
    try {
      const res = await fetch(cfg.url, { method: 'GET', redirect: 'follow' })
      const text = await res.text()
      let parsed
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = { raw: text }
      }
      return json({ ok: res.ok, status: res.status, info: parsed })
    } catch (err) {
      return json({ error: String(err?.message || err) }, 502)
    }
  }

  if (op === 'state' && req.method === 'GET') {
    const state = await store.get('app_state', { type: 'json' })
    return json({ state: state || null })
  }

  if (op === 'state' && req.method === 'POST') {
    const body = await req.json().catch(() => null)
    if (!body) return json({ error: 'invalid body' }, 400)
    await store.setJSON('app_state', { ...body, updatedAt: Date.now() })
    return json({ ok: true })
  }

  return json({ error: 'unknown operation' }, 404)
}

export const config = {
  path: '/api/sheets',
}
