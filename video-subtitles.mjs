import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function fetchYouTubeTranscript(videoId) {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const html = await res.text();

  // Extract ytInitialPlayerResponse by counting braces (more reliable than regex for large JSON)
  const marker = 'ytInitialPlayerResponse = ';
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) throw new Error('ไม่พบข้อมูลวีดิโอ อาจเป็นวีดิโอส่วนตัวหรือถูกจำกัดการเข้าถึง');

  let braceCount = 0;
  let jsonStart = startIdx + marker.length;
  let jsonEnd = jsonStart;
  for (let i = jsonStart; i < html.length; i++) {
    if (html[i] === '{') braceCount++;
    else if (html[i] === '}') braceCount--;
    if (braceCount === 0 && i > jsonStart) { jsonEnd = i + 1; break; }
  }

  const playerResponse = JSON.parse(html.slice(jsonStart, jsonEnd));
  const title = playerResponse?.videoDetails?.title || '';
  const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!captions || captions.length === 0) {
    throw new Error('วีดิโอนี้ไม่มีคำบรรยาย (subtitle) ในระบบของ YouTube');
  }

  // Prefer English → any Latin → first available
  const track =
    captions.find(c => c.languageCode === 'en') ||
    captions.find(c => /^(en|es|fr|de|it|pt|ja|ko|zh)/.test(c.languageCode)) ||
    captions[0];

  const captionRes = await fetch(track.baseUrl + '&fmt=json3');
  const captionData = await captionRes.json();

  const events = (captionData.events || [])
    .filter(e => e.segs)
    .map(e => ({
      start: e.tStartMs / 1000,
      end: (e.tStartMs + (e.dDurationMs || 3000)) / 1000,
      text: e.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim(),
    }))
    .filter(e => e.text);

  return { events, title, sourceLang: track.languageCode };
}

async function translateToThai(chunks) {
  const BATCH = 50;
  const result = [];

  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const prompt = batch.map((c, j) => `[${j}]${c.text}`).join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `แปลข้อความต่อไปนี้เป็นภาษาไทย ให้เป็นธรรมชาติ สั้นกระชับ รักษา format [0] [1] [2]... ทุกบรรทัด:\n${prompt}`,
      }],
    });

    const text = response.content[0].text;
    for (let j = 0; j < batch.length; j++) {
      const re = new RegExp(`\\[${j}\\]([^\\[]*)`);
      const m = text.match(re);
      result.push({ ...batch[j], text: m ? m[1].trim() : batch[j].text });
    }
  }

  return result;
}

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const { url, translate } = await req.json();
    if (!url) throw new Error('กรุณาใส่ลิ๊งวีดิโอ');

    const videoId = extractYouTubeId(url);
    if (!videoId) throw new Error('ลิ๊งไม่ถูกต้อง รองรับเฉพาะ YouTube เท่านั้น');

    const { events, title, sourceLang } = await fetchYouTubeTranscript(videoId);

    const needsTranslation = translate !== false && sourceLang !== 'th';
    const subtitles = needsTranslation ? await translateToThai(events) : events;

    return new Response(JSON.stringify({ subtitles, videoId, title, sourceLang }), {
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
}

export const config = { path: '/api/video-subtitles' };
