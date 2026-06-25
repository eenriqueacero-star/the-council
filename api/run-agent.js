import Groq from 'groq-sdk';

const MODEL_BASE       = 'openai/gpt-oss-120b';
const MODEL_SEARCH     = 'groq/compound'; // Groq compound model with live web search
const GROQ_SYNTH_MODEL = 'openai/gpt-oss-120b';
const GROQ_API_URL     = 'https://api.groq.com/openai/v1/chat/completions';

// groq/compound accepts far less input than plain models; trim prompts aggressively before sending
const COMPOUND_SEARCH_CAP = 600; // combined system + userContent character limit for groq/compound
const COMPOUND_SYS_MAX    = 250; // max chars kept from system prompt when hard-trimming
const HISTORY_END_MARKER  = '\nReference this history to calibrate confidence — do not anchor to prior stance.';

// Returns { system, userContent } trimmed to fit within COMPOUND_SEARCH_CAP.
// Priority kept: ticker, live price, core instruction, agent role definition.
// Dropped in order: history block, round context, agent/profile suffixes, account details, system tail.
function trimForCompound(system, userContent) {
  // Step 1: strip COUNCIL HISTORY block — biggest payload, not needed for a live web search
  const histStart = userContent.indexOf('\nCOUNCIL HISTORY ON');
  const histEnd   = userContent.indexOf(HISTORY_END_MARKER);
  if (histStart !== -1 && histEnd !== -1) {
    const after = userContent.slice(histEnd + HISTORY_END_MARKER.length);
    userContent = userContent.slice(0, histStart) + after;
  }

  // Step 2: strip multi-round prior context blocks — irrelevant to a focused search call
  for (const marker of ['\n\nEARLIER IN THIS ROUND:', '\n\nCOUNCIL ROUND 1 SUMMARY:', '\n\nCOUNCIL ROUNDS 1-2 SUMMARY:']) {
    const idx = userContent.indexOf(marker);
    if (idx !== -1) userContent = userContent.slice(0, idx);
  }

  // Step 3: strip agent/profile context suffixes (sector tape, macro tape, domain intel, lessons)
  for (const marker of ['\nSECTOR CONTEXT TODAY:', '\nMARKET TAPE TODAY:', '\nINTRADAY CONTEXT:', '\nYOUR LATEST DOMAIN INTEL:', '\nYOUR TRACK RECORD:', '\nYOUR RECENT LESSONS:']) {
    const idx = userContent.indexOf(marker);
    if (idx !== -1) userContent = userContent.slice(0, idx);
  }

  // Restore the minimal instruction if it was stripped
  if (!userContent.includes('Return ONLY the JSON')) userContent += ' Return ONLY the JSON.';

  // Fast-exit if already under cap
  if (system.length + userContent.length <= COMPOUND_SEARCH_CAP) {
    console.error(`[compound] prompt OK after content trim: ${system.length + userContent.length} chars (sys=${system.length} user=${userContent.length})`);
    return { system, userContent };
  }

  // Step 4: trim system prompt to COMPOUND_SYS_MAX (keeps role definition, drops protocols/examples)
  const trimmedSys = system.slice(0, COMPOUND_SYS_MAX);
  if (trimmedSys.length + userContent.length <= COMPOUND_SEARCH_CAP) {
    console.error(`[compound] prompt OK after sys trim: ${trimmedSys.length + userContent.length} chars (sys=${trimmedSys.length} user=${userContent.length})`);
    return { system: trimmedSys, userContent };
  }

  // Step 5: hard-truncate userContent to fill remaining budget
  const budget = COMPOUND_SEARCH_CAP - trimmedSys.length;
  userContent = userContent.slice(0, Math.max(budget, 0));
  console.error(`[compound] hard-truncated: ${trimmedSys.length + userContent.length} chars (sys=${trimmedSys.length} user=${userContent.length})`);
  return { system: trimmedSys, userContent };
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

// groq/compound (non-reasoning) via SDK — returns { text, finishReason }
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
  const choice = completion.choices[0];
  const text = choice?.message?.content || '';
  const finishReason = choice?.finish_reason || 'unknown';
  if (!text) console.error(`[empty response] model=${model} finish_reason=${finishReason} max_tokens=${maxTokens}`);
  return { text, finishReason };
}

// gpt-oss-120b agent calls — raw fetch so we can set reasoning_effort: 'low'.
// Low effort keeps thinking brief, leaving output-token budget for the JSON answer.
// Returns { text, finishReason }; throws with .status on HTTP error.
async function callGroqBase(apiKey, system, userContent, maxTokens) {
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL_BASE,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: userContent },
      ],
      max_tokens: maxTokens,
      reasoning_effort: 'low',
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.error?.message || `Groq base error ${res.status}`);
    e.status = res.status;
    e.error  = err.error;
    throw e;
  }
  const data = await res.json();
  const choice = data.choices?.[0];
  const text = choice?.message?.content || '';
  const finishReason = choice?.finish_reason || 'unknown';
  if (!text) console.error(`[empty response] model=${MODEL_BASE} finish_reason=${finishReason} max_tokens=${maxTokens}`);
  return { text, finishReason };
}

// Synthesis: gpt-oss-120b with reasoning_effort: 'medium', primary key only.
// 'medium' gives quality deliberation while keeping latency well inside the 60s function limit.
async function callGroqSynthesis(system, userContent, maxTokens) {
  const effectiveMax = Math.max(maxTokens || 2000, 2000);
  const t0 = Date.now();
  let httpStatus = 0;
  try {
    const res = await fetch(GROQ_API_URL, {
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
        max_tokens: effectiveMax,
        reasoning_effort: 'medium',
      }),
    });
    httpStatus = res.status;
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody.error?.message || `Groq synthesis HTTP ${res.status}`;
      console.error(`[synthesis] FAILED ${res.status} after ${Date.now() - t0}ms: ${msg}`);
      const e = new Error(msg);
      e.status = res.status;
      throw e;
    }
    const data = await res.json();
    const choice = data.choices?.[0];
    const text = choice?.message?.content || '';
    const finishReason = choice?.finish_reason || 'unknown';
    console.error(`[synthesis] ${Date.now() - t0}ms finish_reason=${finishReason} max_tokens=${effectiveMax} text_len=${text.length}`);
    if (!text) {
      // Empty content — throw so the caller can retry
      const e = new Error(`Empty synthesis response (finish_reason=${finishReason})`);
      e.status = null;
      throw e;
    }
    return text;
  } catch (err) {
    if (err.status !== undefined) throw err; // already annotated — re-throw
    // Network/abort error
    console.error(`[synthesis] network error after ${Date.now() - t0}ms:`, err.message);
    throw err;
  }
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

  // Synthesis path: medium-effort reasoning for final verdict, bypasses key rotation.
  // Retries once on any failure before returning a warning so the UI can still display something.
  if (requestedModel === GROQ_SYNTH_MODEL) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await callGroqSynthesis(system, userContent, maxTokens);
        return res.status(200).json({ text });
      } catch (err) {
        const isTimeout = err.name === 'AbortError' || Boolean(err.message?.toLowerCase().includes('timeout'));
        console.error(`[synthesis] attempt ${attempt + 1} error: status=${err.status ?? 'none'} timeout=${isTimeout} msg=${err.message}`);
        if (attempt === 0) {
          // 429 = TPM rate limit — need the 60s window to partially reset before retrying
          await sleep(err.status === 429 ? 20000 : 2000);
          continue;
        }
        // Both attempts failed — return 200+warning so the frontend can show the error
        const warnMsg = isTimeout
          ? 'Synthesis timed out after retry — try convening again'
          : `Synthesis error [${err.status ?? 'unknown'}]: ${(err.message || 'unknown').slice(0, 200)}`;
        return res.status(200).json({ text: '', warning: warnMsg });
      }
    }
  }

  // Prepare prompt (compound trims heavily; base model uses full prompt)
  let sendSystem = system;
  let sendContent = userContent;
  if (useSearch) {
    const trimmed = trimForCompound(system, userContent);
    sendSystem  = trimmed.system;
    sendContent = trimmed.userContent;
    console.error(`[compound] sending ${sendSystem.length + sendContent.length} chars (sys=${sendSystem.length} user=${sendContent.length}) — cap=${COMPOUND_SEARCH_CAP}`);
  }

  // ── Search path ──────────────────────────────────────────────────────────────
  // Single compound attempt; any failure falls back to MODEL_BASE immediately.
  // Key rotation cannot help compound — rate limits are per-model, not per-key.
  if (useSearch) {
    const apiKey = shuffled(keys)[0];
    try {
      const { text } = await callGroq(apiKey, MODEL_SEARCH, sendSystem, sendContent, maxTokens);
      return res.status(200).json({ text, grounded: true });
    } catch (err) {
      const isTimeout = err.name === 'AbortError' || Boolean(err.message?.toLowerCase().includes('timeout'));
      const statusStr = err.status != null ? String(err.status) : 'unknown';
      const msgStr    = (err.error?.message || err.message || 'unknown error').slice(0, 200);
      const warning   = isTimeout
        ? 'Ungrounded — compound timed out'
        : err.status === 429
          ? 'Ungrounded — compound rate-limited [429]'
          : `Ungrounded — compound failed [${statusStr}]: ${msgStr}`;
      console.error('groq/compound error (falling back):', statusStr, err.message);
      try {
        // Use original (untrimmed) system for fallback quality; sendContent already trimmed
        let { text } = await callGroqBase(apiKey, system, sendContent, maxTokens);
        if (!text) {
          await sleep(500);
          ({ text } = await callGroqBase(apiKey, system, sendContent, maxTokens));
        }
        return res.status(200).json({ text, grounded: false, warning });
      } catch (fe) {
        console.error('runAgent: base model fallback also failed:', fe.status, fe.message);
        return res.status(200).json({ text: '', grounded: false, warning: 'Ungrounded — agent failed, no data' });
      }
    }
  }

  // ── Non-search path ──────────────────────────────────────────────────────────
  // MODEL_BASE (gpt-oss-120b) with key rotation for 429 handling.
  // reasoning_effort: 'low' keeps thinking brief so agents don't exhaust token budget on reasoning.
  const keyOrder = shuffled(keys);

  for (let k = 0; k < keyOrder.length; k++) {
    const apiKey = keyOrder[k];
    try {
      let { text } = await callGroqBase(apiKey, sendSystem, sendContent, maxTokens);
      if (!text) {
        // Single retry — reasoning models sometimes exhaust tokens on first pass and succeed on retry
        await sleep(500);
        ({ text } = await callGroqBase(apiKey, sendSystem, sendContent, maxTokens));
      }
      return res.status(200).json({ text, grounded: false });
    } catch (err) {
      if (err.status === 429) {
        // Still have more keys to try — rotate immediately
        if (k < keyOrder.length - 1) continue;
        // All keys exhausted — wait before final attempt
        await sleep(8000);
        continue;
      }
      // Non-429 error — return empty result rather than hard error
      console.error('runAgent error:', err.status, err.message);
      return res.status(200).json({ text: '', grounded: false, warning: `Agent error [${err.status || 'unknown'}]: ${(err.message || '').slice(0, 150)}` });
    }
  }

  // All keys hit 429 — one final attempt after backoff
  try {
    let { text } = await callGroqBase(keyOrder[0], sendSystem, sendContent, maxTokens);
    if (!text) {
      await sleep(500);
      ({ text } = await callGroqBase(keyOrder[0], sendSystem, sendContent, maxTokens));
    }
    return res.status(200).json({ text, grounded: false });
  } catch (err) {
    console.error('runAgent: all keys exhausted', err.status, err.message);
    return res.status(200).json({ text: '', grounded: false, warning: 'Rate-limited on all keys — try again shortly' });
  }
}
