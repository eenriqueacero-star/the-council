import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-5';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await verifyAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { system, userContent, useSearch } = req.body;
  if (!system || !userContent) return res.status(400).json({ error: 'Missing system or userContent' });

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const body = {
      model: MODEL,
      max_tokens: 1000,
      system,
      messages: [{ role: 'user', content: userContent }],
    };

    let response;
    if (useSearch) {
      // Web search requires the beta API and betas header
      try {
        response = await client.beta.messages.create({
          ...body,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          betas: ['web-search-2025-03-05'],
        });
      } catch (searchErr) {
        // Fall back to base model if web search isn't available on this key
        console.warn('Web search unavailable, falling back:', searchErr.message);
        response = await client.messages.create(body);
      }
    } else {
      response = await client.messages.create(body);
    }

    const text = (response.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
    return res.status(200).json({ text });
  } catch (err) {
    console.error('runAgent error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
