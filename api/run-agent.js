import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-claude-sonnet-4-5';

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

    // No web search for now — plain message to confirm basic flow works
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      system,
      messages: [{ role: 'user', content: userContent }],
    });

    const text = (response.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
    return res.status(200).json({ text });
  } catch (err) {
    // Log the full error so we can see exactly what Anthropic says
    console.error('runAgent error status:', err.status);
    console.error('runAgent error body:', JSON.stringify(err.error ?? err.message));
    return res.status(500).json({ error: err.message });
  }
}
