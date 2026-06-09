import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';

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

async function callWithRetry(client, body, useSearch, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      if (useSearch) {
        try {
          return await client.beta.messages.create({
            ...body,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            betas: ['web-search-2025-03-05'],
          });
        } catch {
          return await client.messages.create(body);
        }
      }
      return await client.messages.create(body);
    } catch (err) {
      if (err.status === 429 && i < retries - 1) {
        const wait = (i + 1) * 8000; // 8s, 16s backoff
        console.log(`Rate limited, retrying in ${wait}ms...`);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await verifyAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { system, userContent, useSearch } = req.body || {};
  if (!system || !userContent) return res.status(400).json({ error: 'Missing system or userContent' });

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const body = { model: MODEL, max_tokens: 1000, system, messages: [{ role: 'user', content: userContent }] };
    const response = await callWithRetry(client, body, useSearch);
    const text = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    return res.status(200).json({ text });
  } catch (err) {
    console.error('runAgent error:', err.status, err.message);
    return res.status(500).json({ error: err.message });
  }
}
