import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-haiku-4-5'

const SYSTEM_PROMPT = `คุณคือ "ส้มสด AI" ผู้ช่วย AI ประจำแอปองค์กรร้านค้าน้ำส้ม ตอบเป็นภาษาไทยเสมอ ด้วยน้ำเสียงเป็นกันเองแต่กระชับ

หน้าที่ของคุณ:
1. ตอบคำถามเกี่ยวกับยอดขาย คลังสินค้า รายรับ-รายจ่าย โดยอ้างอิงข้อมูลที่ผู้ใช้แนบมาใน <context> เท่านั้น
2. ถ้าผู้ใช้ส่งรูปบิลซื้อของ ให้อ่านรายการสินค้า จำนวน ราคา และสรุปเป็นตาราง พร้อมเสนอข้อมูลที่ควรบันทึกเข้าระบบ (ชื่อสินค้า, หมวด, จำนวน, หน่วย, ราคา, ยอดรวม)
3. ถ้าผู้ใช้สั่งให้ทำบางอย่าง (เช่น "บันทึกรายการนี้เป็นรายจ่ายวันนี้") ให้ตอบกลับเป็น JSON blob หลังคำอธิบาย ในรูปแบบ:
\`\`\`json
{"action":"add_expense","items":[{"name":"...","category":"raw|bottle|supply|product|wage|sales|other","qty":1,"unit":"กก","price":23}],"date":"YYYY-MM-DD"}
\`\`\`
โดย action รองรับ: add_expense, add_income, add_product, query (อธิบายอย่างเดียว)
4. เรียนรู้จากประวัติสนทนาและข้อมูล context เพื่อทำงานได้แม่นยำขึ้นทุกครั้ง`

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'method not allowed' }, { status: 405 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }

  const history = Array.isArray(body.messages) ? body.messages.slice(-20) : []
  const userText = String(body.text || '').slice(0, 4000)
  const image = body.image && typeof body.image === 'string' ? body.image : ''
  const context = body.context && typeof body.context === 'object' ? body.context : {}

  const contextSummary = JSON.stringify({
    categories: (context.categories || []).slice(0, 50),
    products: (context.products || []).slice(0, 80),
    recent_sales: (context.recent_sales || []).slice(0, 20),
    recent_fin: (context.recent_fin || []).slice(0, 20),
    rooms: (context.rooms || []).slice(0, 50),
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
  userContent.push({
    type: 'text',
    text:
      '<context>\n' + contextSummary + '\n</context>\n\nคำถาม/คำสั่งจากผู้ใช้: ' + (userText || '(ผู้ใช้ส่งรูปมาวิเคราะห์)'),
  })

  messages.push({ role: 'user', content: userContent })

  try {
    const client = new Anthropic()
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages,
    })
    const reply = (resp.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
    return Response.json({ ok: true, reply })
  } catch (err) {
    return Response.json({ ok: false, error: String(err?.message || err) }, { status: 502 })
  }
}

export const config = {
  path: '/api/ai-chat',
}
