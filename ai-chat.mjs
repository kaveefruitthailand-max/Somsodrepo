import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-haiku-4-5'

const SYSTEM_PROMPT = `คุณคือ "ส้มสด AI" แชท AI ประจำแอปองค์กรร้านค้าน้ำส้ม ตอบเป็นภาษาไทยเสมอ ด้วยน้ำเสียงเป็นกันเองแต่กระชับ

หน้าที่ของคุณ:
1. สนทนา ตอบคำถาม วิเคราะห์ยอดขาย คลังสินค้า รายรับ-รายจ่าย ตารางชีต PDF รูปบิล และรูปสินค้า โดยอ้างอิงข้อมูลใน <context> และเอกสารที่ผู้ใช้แนบเท่านั้น
2. ถ้าผู้ใช้ส่งรูปบิลหรือใบเสร็จ ให้อ่านรายการสินค้า จำนวน ราคา วันที่ และสรุปข้อมูลที่ควรบันทึกเข้าระบบ
3. ถ้าผู้ใช้ส่ง spreadsheet ให้จับคอลัมน์ที่เกี่ยวข้องกับ วันที่ ประเภท รายการ หมวด จำนวน หน่วย ราคา ยอดรวม และแปลงเป็นข้อมูลแอปอย่างระมัดระวัง
4. ถ้าผู้ใช้ส่งภาพให้นับจำนวน ให้ประเมินจำนวนวัตถุที่มองเห็น ถ้าไม่แน่ใจให้บอกระดับความมั่นใจและอย่าสร้างจำนวนเกินจริง
5. เมื่อมีข้อมูลที่ควรบันทึกหรืออัปเดตแอป ให้ใส่ JSON blob หลังคำอธิบายเสมอ ในรูปแบบ:
\`\`\`json
[
  {"action":"add_expense","items":[{"name":"...","category":"raw|bottle|supply|product|wage|sales|other","qty":1,"unit":"กก","price":23,"total":23}],"date":"YYYY-MM-DD"},
  {"action":"add_income","items":[{"name":"...","category":"sales","qty":1,"unit":"ขวด","price":25,"total":25}],"date":"YYYY-MM-DD"},
  {"action":"add_product","items":[{"name":"...","category":"product|raw|bottle|supply|expense","unit":"ขวด","price":25,"cost":20}]},
  {"action":"edit_product","targetName":"ชื่อสินค้าเดิม","updates":{"name":"ชื่อใหม่","price":30,"unit":"ขวด","cost":22,"category":"product"}},
  {"action":"delete_product","targetName":"ชื่อสินค้าที่ต้องการลบ"},
  {"action":"inventory_count","items":[{"targetName":"...","actual":12,"unit":"ขวด"}]},
  {"action":"add_sale","items":[{"name":"...","qty":5,"unit":"ขวด","price":25,"total":125}],"date":"YYYY-MM-DD"}
]
\`\`\`
action รองรับทั้งหมด: add_expense, add_income, add_product, edit_product, delete_product, add_sale, inventory_count, queue_sheet, query

กฎสำหรับ edit_product:
- ใช้ "targetName" เพื่อระบุสินค้าที่ต้องการแก้ไข (ค้นหาจากชื่อ)
- ใช้ "updates" เป็น object ที่มีเฉพาะ field ที่ต้องการเปลี่ยน เช่น {"price":30} หรือ {"name":"ชื่อใหม่","unit":"ชิ้น"}
- field ที่แก้ได้: name, unit, price, cost, reorder, category

กฎสำหรับ delete_product:
- ใช้ "targetName" ระบุชื่อสินค้าที่ต้องการลบ
- ต้องมีการยืนยันจากผู้ใช้ก่อนเสมอ — ให้บอกชื่อสินค้าที่จะลบในข้อความก่อนสร้าง action

6. ถ้าเป็นการคุยทั่วไปหรือถามข้อมูล ให้ตอบเป็นข้อความแชทตามปกติ ไม่ต้องสร้าง action
7. ห้ามใส่ action ถ้าข้อมูลไม่พอ ให้ใช้ action query หรืออธิบายว่าต้องตรวจอะไรเพิ่ม
8. สำหรับ delete_product ต้องระบุชื่อสินค้าชัดเจนในข้อความก่อน และถามยืนยันถ้าผู้ใช้ไม่ได้ยืนยัน`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

class AiConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AiConfigError'
  }
}

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init.headers || {}),
    },
  })
}

function extractActions(reply) {
  const text = String(reply || '')
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)]
  const candidates = blocks.length ? blocks.map((m) => m[1]) : []
  const loose = text.match(/(\[[\s\S]*"action"[\s\S]*\]|\{[\s\S]*"action"[\s\S]*\})/)
  if (loose) candidates.push(loose[1])
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      return Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      // try next candidate
    }
  }
  return []
}

function normalizeMessages(messages) {
  const normalized = []
  for (const message of messages) {
    if (!message || (message.role !== 'user' && message.role !== 'assistant')) continue
    if (!normalized.length && message.role === 'assistant') continue
    const last = normalized[normalized.length - 1]
    if (last && last.role === message.role && typeof last.content === 'string' && typeof message.content === 'string') {
      last.content += '\n\n' + message.content
    } else {
      normalized.push(message)
    }
  }
  return normalized
}

function buildAnthropicPayload(messages) {
  return {
    model: MODEL,
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages,
  }
}

async function callNetlifyAiGateway(payload) {
  const baseUrl = process.env.NETLIFY_AI_GATEWAY_BASE_URL
  const gatewayKey = process.env.NETLIFY_AI_GATEWAY_KEY
  if (!baseUrl || !gatewayKey) {
    throw new AiConfigError('Netlify AI Gateway ยังไม่ถูกเปิดหรือยังไม่ถูก inject ให้ฟังก์ชันนี้')
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/anthropic/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${gatewayKey}`,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || text || `AI Gateway HTTP ${res.status}`
    throw new Error(msg)
  }
  return data
}

async function callAnthropicSdk(payload) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new AiConfigError('ไม่พบ ANTHROPIC_API_KEY หรือ Netlify AI Gateway provider variables')
  }
  const client = new Anthropic()
  return client.messages.create(payload)
}

async function createAiMessage(messages) {
  const payload = buildAnthropicPayload(messages)
  const canUseGateway = !!(process.env.NETLIFY_AI_GATEWAY_BASE_URL && process.env.NETLIFY_AI_GATEWAY_KEY)
  if (canUseGateway) return callNetlifyAiGateway(payload)
  return callAnthropicSdk(payload)
}

function extractReply(resp) {
  return (resp.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    })
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method not allowed' }, { status: 405 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  const history = Array.isArray(body.messages) ? body.messages.slice(-20) : []
  const userText = String(body.text || '').slice(0, 4000)
  const mode = String(body.mode || 'operator').slice(0, 60)
  const image = body.image && typeof body.image === 'string' ? body.image : ''
  const documentFile = body.document && typeof body.document === 'string' ? body.document : ''
  const documentText = body.documentText && typeof body.documentText === 'string' ? body.documentText.slice(0, 30000) : ''
  const fileName = body.fileName && typeof body.fileName === 'string' ? body.fileName.slice(0, 200) : ''
  const context = body.context && typeof body.context === 'object' ? body.context : {}

  const contextSummary = JSON.stringify({
    categories: (context.categories || []).slice(0, 50),
    products: (context.products || []).slice(0, 80),
    productList: (context.productList || []).slice(0, 80),
    recent_sales: (context.recent_sales || []).slice(0, 20),
    recent_fin: (context.recent_fin || []).slice(0, 20),
    rooms: (context.rooms || []).slice(0, 50),
    factory: context.factory || {},
  }).slice(0, 12000)

  const messages = history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 2000) }))

  const userContent = []
  if (image && image.startsWith('data:image/')) {
    const m = /^data:(image\/[a-zA-Z+]+);base64,(.*)$/.exec(image)
    if (m) {
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: m[1], data: m[2] },
      })
    }
  }
  if (documentFile && /^data:application\/pdf;base64,/.test(documentFile)) {
    const m = /^data:(application\/pdf);base64,(.*)$/.exec(documentFile)
    if (m) {
      userContent.push({
        type: 'document',
        source: { type: 'base64', media_type: m[1], data: m[2] },
      })
    }
  }
  userContent.push({
    type: 'text',
    text:
      '<context>\n' +
      contextSummary +
      '\n</context>\n\n' +
      '<mode>' +
      mode +
      '</mode>\n' +
      (fileName ? '<fileName>' + fileName + '</fileName>\n' : '') +
      (documentText ? '<documentText>\n' + documentText + '\n</documentText>\n' : '') +
      '\nคำถาม/คำสั่งจากผู้ใช้: ' +
      (userText || '(ผู้ใช้ส่งไฟล์หรือรูปมาวิเคราะห์)'),
  })

  messages.push({ role: 'user', content: userContent })
  const normalizedMessages = normalizeMessages(messages)

  try {
    const resp = await createAiMessage(normalizedMessages)
    const reply = extractReply(resp)
    return json({ ok: true, reply, actions: extractActions(reply) })
  } catch (err) {
    const isConfigError = err instanceof AiConfigError
    return json({ ok: false, error: String(err?.message || err) }, { status: isConfigError ? 503 : 502 })
  }
}

export const config = {
  path: '/api/ai-chat',
}
