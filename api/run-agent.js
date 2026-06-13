import Groq from 'groq-sdk';

const MODEL_BASE   = 'llama-3.3-70b-versatile';
const MODEL_SEARCH = 'compound-beta';         // Groq compound model with live web search

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

async function callGroq(client, model, system, userContent, maxTokens) {
  const completion = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: userContent },
    ],
  });
  return completion.choices[0]?.message?.content || '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await verifyAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ code: 'ERR-CFG', error: 'GROQ_API_KEY not configured' });
  }

  const { system, userContent, useSearch = false, maxTokens = 700 } = req.body || {};
  if (!system || !userContent) return res.status(400).json({ error: 'Missing system or userContent' });
  if (system.length + userContent.length > 20_000) {
    return res.status(400).json({ code: 'ERR-SIZE', error: 'Prompt exceeds maximum allowed length' });
  }

  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const model  = useSearch ? MODEL_SEARCH : MODEL_BASE;

  for (let i = 0; i < 3; i++) {
    try {
      const text = await callGroq(client, model, system, userContent, maxTokens);
      return res.status(200).json({ text });
    } catch (err) {
      // compound-beta unavailable — fall back to base model
      if (useSearch && (err.status === 404 || err.status === 400) && i === 0) {
        try {
          const text = await callGroq(client, MODEL_BASE, system, userContent, maxTokens);
          return res.status(200).json({ text });
        } catch (fe) {
          return res.status(500).json({ error: fe.message });
        }
      }
      if (err.status === 429 && i < 2) {
        await sleep((i + 1) * 8000);
        continue;
      }
      console.error('runAgent error:', err.status, err.message);
      return res.status(500).json({ error: err.message });
    }
  }
}
