import Groq from 'groq-sdk';

const MODEL_BASE   = 'openai/gpt-oss-120b';
const MODEL_SEARCH = 'groq/compound'; // Groq compound model with live web search
const GROQ_SYNTH_MODEL = 'openai/gpt-oss-120b';
const GROQ_SYNTH_URL   = 'https://api.groq.com/openai/v1/chat/completions';

// groq/compound accepts far less input than plain models; trim prompts before sending
const COMPOUND_SEARCH_CAP = 6000;
const HISTORY_END_MARKER  = '\nReference this history to calibrate confidence — do not anchor to prior stance.';

function trimForCompound(system, userContent) {
  if (system.length + userContent.length <= COMPOUND_SEARCH_CAP) return userContent;

  // Strip the COUNCIL HISTORY block first — biggest payload, least essential for a live search call
  const histStart = userContent.indexOf('\nCOUNCIL HISTORY ON');
  const histEnd   = userContent.indexOf(HISTORY_END_MARKER);
  if (histStart !== -1 && histEnd !== -1) {
    const after = userContent.slice(histEnd + HISTORY_END_MARKER.length);
    userContent = userContent.slice(0, histStart) + after;
  }

  // Hard-truncate to budget if still over cap
  const budget = COMPOUND_SEARCH_CAP - system.length;
  if (userContent.length > budget) userContent = userContent.slice(0, budget);
  return userContent;
}

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

// Collect all API keys defined in env (GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3, ...)
function getApiKeys() {
  const keys = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5,
  ].filter(Boolean);
  return keys;
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function callGroq(apiKey, model, system, userContent, maxTokens) {
  const client = new Groq({ apiKey });
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

async function callGroqSynthesis(system, userContent, maxTokens) {
  const res = await fetch(GROQ_SYNTH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_SYNTH_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: userContent },
      ],
      max_tokens: Math.max(maxTokens || 700, 1500),
      reasoning_effort: 'high',
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq synthesis error ${res.status}`);
  }
  const data = await res.json();
  // Parse final answer only — reasoning traces are separate and not in content
  return data.choices?.[0]?.message?.content || '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await verifyAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const keys = getApiKeys();
  if (keys.length === 0) {
    return res.status(500).json({ code: 'ERR-CFG', error: 'No GROQ_API_KEY configured' });
  }

  const { system, userContent, useSearch = false, maxTokens = 700, model: requestedModel } = req.body || {};
  if (!system || !userContent) return res.status(400).json({ error: 'Missing system or userContent' });
  if (system.length + userContent.length > 20_000) {
    return res.status(400).json({ code: 'ERR-SIZE', error: 'Prompt exceeds maximum allowed length' });
  }

  // Synthesis-only path: gpt-oss-120b with high reasoning effort, bypasses key rotation
  if (requestedModel === GROQ_SYNTH_MODEL) {
    try {
      const text = await callGroqSynthesis(system, userContent, maxTokens);
      return res.status(200).json({ text });
    } catch (err) {
      console.error('synthesis error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  const model = useSearch ? MODEL_SEARCH : MODEL_BASE;

  // For groq/compound, strip the history block and hard-cap so we stay under its input limit
  const sendContent = useSearch ? trimForCompound(system, userContent) : userContent;

  // Shuffle keys so load is distributed randomly across invocations
  const keyOrder = shuffled(keys);
  let lastErr;

  for (let k = 0; k < keyOrder.length; k++) {
    const apiKey = keyOrder[k];
    try {
      const text = await callGroq(apiKey, model, system, sendContent, maxTokens);
      return res.status(200).json({ text, grounded: useSearch });
    } catch (err) {
      // groq/compound unavailable or still too large — fall back to base model, signal ungrounded
      if (useSearch && (err.status === 404 || err.status === 400 || err.status === 413) && k === 0) {
        try {
          const text = await callGroq(apiKey, MODEL_BASE, system, sendContent, maxTokens);
          return res.status(200).json({ text, grounded: false, warning: 'Live web search unavailable — answer is from model memory, not live data' });
        } catch (fe) {
          return res.status(500).json({ error: fe.message });
        }
      }

      if (err.status === 429) {
        lastErr = err;
        // Still have more keys to try — rotate immediately, no sleep needed
        if (k < keyOrder.length - 1) continue;
        // All keys exhausted — wait before giving up
        await sleep(8000);
        continue;
      }

      console.error('runAgent error:', err.status, err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // All keys hit 429 — one final retry on a random key after backoff
  try {
    const text = await callGroq(keyOrder[0], model, system, sendContent, maxTokens);
    return res.status(200).json({ text, grounded: useSearch });
  } catch (err) {
    console.error('runAgent: all keys exhausted', err.status, err.message);
    return res.status(429).json({ code: 'ERR-429', error: 'Rate limited on all keys' });
  }
}
