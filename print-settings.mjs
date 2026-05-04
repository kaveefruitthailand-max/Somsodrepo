import { getStore } from '@netlify/blobs'

const STORE_NAME = 'app-settings'
const SETTINGS_KEY = 'print'

const json = (body, status = 200) => Response.json(body, {
  status,
  headers: {
    'Cache-Control': 'no-store',
  },
})

function cleanSettings(input) {
  const src = input && typeof input === 'object' ? input : {}
  const fontSize = Math.max(5, Math.min(100, Number(src.fontSize) || 13))
  const fontColor = /^#[0-9a-f]{6}$/i.test(String(src.fontColor || '')) ? String(src.fontColor) : '#000000'
  const fontWeight = Math.max(400, Math.min(900, Number(src.fontWeight) || 700))
  const lineHeight = Math.max(1, Math.min(2.2, Number(src.lineHeight) || 1.34))
  const textOffsetX = Math.max(-30, Math.min(30, Number(src.textOffsetX) || 0))
  const textOffsetY = Math.max(-30, Math.min(30, Number(src.textOffsetY) || 0))
  const vatRate = Math.max(0, Math.min(100, Number(src.vatRate) || 0))
  const discount = Math.max(0, Number(src.discount) || 0)
  const seenCustomForms = new Set()
  const customForms = Array.isArray(src.customForms)
    ? src.customForms.slice(0, 12).reduce((forms, form, index) => {
        const title = String(form?.title || 'ฟอร์มเพิ่มเติม').slice(0, 80)
        const body = String(form?.body || '').slice(0, 800)
        const key = `${title.trim()}|${body.trim()}`.toLowerCase()
        if (seenCustomForms.has(key)) return forms
        seenCustomForms.add(key)
        forms.push({
          id: /^custom_[a-z0-9_]+$/i.test(String(form?.id || '')) ? String(form.id) : `custom_${Date.now().toString(36)}_${index}`,
          title,
          body,
        })
        return forms
      }, [])
    : []
  const defaultLayout = {
    header: { x: 4, y: 3, w: 92, h: 14 },
    meta: { x: 4, y: 18, w: 92, h: 13 },
    items: { x: 4, y: 33, w: 92, h: 34 },
    totals: { x: 58, y: 68, w: 38, h: 12 },
    note: { x: 4, y: 80, w: 52, h: 7 },
    signatures: { x: 4, y: 89, w: 92, h: 8 },
  }
  const sourceLayout = src.layout && typeof src.layout === 'object' ? src.layout : {}
  const cleanBox = (box, fallback) => {
    const clamp = (value, min, max, fb) => {
      const n = Number(value)
      return Math.max(min, Math.min(max, Number.isFinite(n) ? n : fb))
    }
    const out = {
      x: clamp(box?.x, 0, 95, fallback.x),
      y: clamp(box?.y, 0, 96, fallback.y),
      w: clamp(box?.w, 5, 100, fallback.w),
      h: clamp(box?.h, 4, 100, fallback.h),
    }
    if (out.x + out.w > 100) out.w = 100 - out.x
    if (out.y + out.h > 100) out.h = 100 - out.y
    return out
  }
  const layout = Object.fromEntries(Object.entries(defaultLayout).map(([key, value]) => [key, cleanBox(sourceLayout[key], value)]))
  if (layout.note.y === 81 && layout.note.h === 8 && layout.signatures.y === 88 && layout.signatures.h === 9) {
    layout.note = { x: 4, y: 80, w: 52, h: 7 }
    layout.signatures = { x: 4, y: 89, w: 92, h: 8 }
  }
  const customDefaults = [
    { x: 4, y: 68, w: 52, h: 10 },
    { x: 58, y: 81, w: 38, h: 7 },
    { x: 4, y: 72, w: 52, h: 7 },
    { x: 58, y: 72, w: 38, h: 7 },
  ]
  customForms.forEach((form, index) => {
    const oldBox = sourceLayout[form.id]
    const fallback = customDefaults[index % customDefaults.length]
    layout[form.id] = cleanBox(oldBox, fallback)
    if (
      Math.abs(Number(layout[form.id].x) - 8) < 0.01 &&
      Math.abs(Number(layout[form.id].w) - 38) < 0.01 &&
      Math.abs(Number(layout[form.id].h) - 10) < 0.01 &&
      Math.abs(Number(layout[form.id].y) - (72 + (index * 3))) < 0.01
    ) {
      layout[form.id] = fallback
    }
  })
  return {
    companyName: String(src.companyName || '').slice(0, 120),
    companyAddress: String(src.companyAddress || '').slice(0, 500),
    companyTaxId: String(src.companyTaxId || '').slice(0, 60),
    companyContact: String(src.companyContact || '').slice(0, 160),
    logoData: String(src.logoData || '').slice(0, 900000),
    template: ['receipt', 'delivery', 'invoice'].includes(src.template) ? src.template : 'receipt',
    design: ['orange', 'violet', 'red'].includes(src.design) ? src.design : 'orange',
    fontFamily: ['formal', 'sarabun', 'kanit', 'prompt', 'serif'].includes(src.fontFamily) ? src.fontFamily : 'formal',
    fontSize,
    fontColor,
    fontWeight,
    lineHeight,
    textOffsetX,
    textOffsetY,
    vatRate,
    discount,
    layout,
    customForms,
  }
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })

  try {
    const store = getStore(STORE_NAME)

    if (req.method === 'GET') {
      const settings = await store.get(SETTINGS_KEY, { type: 'json' })
      return json({ settings: cleanSettings(settings) })
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const settings = cleanSettings(body)
      await store.setJSON(SETTINGS_KEY, settings)
      return json({ ok: true, settings })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (error) {
    return json({ error: 'Unable to save print settings' }, 500)
  }
}

export const config = {
  path: '/api/print-settings',
}
