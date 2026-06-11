import Groq from 'groq-sdk';

const MODEL = 'llama-3.3-70b-versatile';

async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return false;
  const idToken = authHeader.slice(7);
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_WEB_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data.users?.length);
  } catch { return false; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await verifyAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ code: 'ERR-CFG', error: 'GROQ_API_KEY not configured' });
  }

  const { system, userContent, maxTokens = 512 } = req.body || {};
  if (!system || !userContent) return res.status(400).json({ error: 'Missing system or userContent' });

  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  for (let i = 0; i < 3; i++) {
    try {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
      });
      const text = completion.choices[0]?.message?.content || '';
      return res.status(200).json({ text });
    } catch (err) {
      if (err.status === 429 && i < 2) {
        await sleep((i + 1) * 8000);
      } else {
        console.error('runAgent error:', err.status, err.message);
        return res.status(500).json({ error: err.message });
      }
    }
  }
}
