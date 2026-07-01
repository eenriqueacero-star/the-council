/**
 * Vercel Cron: Daily scout run at 9 AM ET (13:00 UTC, weekdays)
 * Reads all users' watchlists from Firestore, runs lightweight council on each ticker,
 * and writes results back. Uses Firestore REST API (no firebase-admin dependency needed).
 *
 * Required Vercel env vars (server-side, no VITE_ prefix):
 *   GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3, GROQ_API_KEY_4, GROQ_API_KEY_5
 *   FINNHUB_KEY
 *   FIREBASE_WEB_API_KEY
 *   FIREBASE_PROJECT_ID  (e.g. "the-council-89570")
 *   CRON_SECRET          (optional, set in vercel.json cron header for auth)
 */

import Groq from 'groq-sdk';

const DISCOVERY_POOL = [
  'TSLA','AAPL','MSFT','GOOGL','AMZN','META','SMCI','ARM','MRVL','AVGO',
  'TSM','ASML','LRCX','KLAC','SNOW','NET','DDOG','PANW','COIN','MSTR',
  'RKLB','IONQ','RGTI','QBTS','LLY','ISRG','DXCM','ENPH','FSLR','CEG',
];

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-120b';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function getApiKeys() {
  return [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5,
  ].filter(Boolean);
}

async function callGroq(system, userContent, keyIndex = 0, maxTokens = 512) {
  const keys = getApiKeys();
  const key = keys[keyIndex % keys.length];
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
      max_tokens: maxTokens,
      reasoning_effort: 'low',
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callGroqSynth(system, userContent, maxTokens = 512) {
  const keys = getApiKeys();
  const key = keys[keys.length - 1]; // synthesis key is last
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
      max_tokens: maxTokens,
      reasoning_effort: 'medium',
    }),
  });
  if (!res.ok) throw new Error(`Groq synth ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function extractJSON(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1];
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}

async function fetchQuote(ticker) {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${process.env.FINNHUB_KEY}`);
  if (!res.ok) return null;
  const q = await res.json();
  return q?.c > 0 ? q : null;
}

async function fetchNews(ticker) {
  const today = new Date().toISOString().slice(0, 10);
  const from  = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
  const res = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${today}&token=${process.env.FINNHUB_KEY}`);
  if (!res.ok) return [];
  const items = await res.json();
  return (Array.isArray(items) ? items : []).slice(0, 5).map(a => `- [${new Date(a.datetime * 1000).toISOString().slice(0,10)}] ${a.headline}`);
}

// Firestore REST helpers
function fsBaseUrl() {
  const project = process.env.FIREBASE_PROJECT_ID || 'the-council-89570';
  return `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
}

async function fsGet(path) {
  const res = await fetch(`${fsBaseUrl()}/${path}?key=${process.env.FIREBASE_WEB_API_KEY}`);
  if (!res.ok) return null;
  return res.json();
}

async function fsList(path) {
  const res = await fetch(`${fsBaseUrl()}/${path}?key=${process.env.FIREBASE_WEB_API_KEY}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.documents || [];
}

async function fsPatch(path, fields) {
  // Build Firestore field mask and document body
  const fieldNames = Object.keys(fields).map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const body = { fields: {} };
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') body.fields[k] = { stringValue: v };
    else if (typeof v === 'number') body.fields[k] = { doubleValue: v };
    else if (typeof v === 'boolean') body.fields[k] = { booleanValue: v };
    else if (v === null) body.fields[k] = { nullValue: null };
    else body.fields[k] = { stringValue: JSON.stringify(v) };
  }
  const url = `${fsBaseUrl()}/${path}?${fieldNames}&key=${process.env.FIREBASE_WEB_API_KEY}`;
  const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.ok;
}

// Simplified PROTOCOLS for cron (no need for full version)
const PROTOCOLS_SHORT = `SELL PROTOCOL: Exit only on confirmed weekly downtrend (lower highs + lower lows). 4-GATE ENTRY: real catalyst, weekly uptrend, 7+ conviction, no macro headwind. Use ONLY the LIVE DATA provided. Never fabricate prices or news.`;

const AGENT_SYSTEMS = [
  { id: 'technical', name: 'REX', system: `You are REX, TECHNICAL ANALYST. ${PROTOCOLS_SHORT}\nJudge the chart and trend for the ticker. Output ONLY raw JSON: {"stance":"PASS"|"FAIL"|"CAUTION","score":<0-10>,"headline":"<8 words>","points":["<point>","<point>"]}` },
  { id: 'catalyst',  name: 'NOVA', system: `You are NOVA, CATALYST SCOUT. ${PROTOCOLS_SHORT}\nFind upcoming catalysts within 60 days. Output ONLY raw JSON: {"stance":"PASS"|"FAIL"|"CAUTION","score":<0-10>,"headline":"<8 words>","points":["<point>","<point>"]}` },
  { id: 'risk',      name: 'SAGE', system: `You are SAGE, RISK MANAGER. ${PROTOCOLS_SHORT}\nAssess concentration, dilution, and volatility risk. Output ONLY raw JSON: {"stance":"PASS"|"FAIL"|"CAUTION","score":<0-10>,"headline":"<8 words>","points":["<point>","<point>"]}` },
  { id: 'macro',     name: 'ATLAS', system: `You are ATLAS, MACRO AGENT. ${PROTOCOLS_SHORT}\nJudge today's macro tape. Output ONLY raw JSON: {"stance":"PASS"|"FAIL"|"CAUTION","score":<0-10>,"headline":"<8 words>","points":["<point>","<point>"]}` },
  { id: 'bear',      name: 'VEGA', system: `You are VEGA, DEVIL'S ADVOCATE. ${PROTOCOLS_SHORT}\nBuild the strongest honest bear case. Only cite events from LIVE DATA. Output ONLY raw JSON: {"stance":"BEARISH","score":<0-10>,"headline":"<8 words>","points":["<point>","<point>"]}` },
  { id: 'sizer',     name: 'ZEN', system: `You are ZEN, POSITION SIZER. ${PROTOCOLS_SHORT}\nTranslate to concrete sizing. Output ONLY raw JSON: {"stance":"PASS"|"FAIL"|"CAUTION","score":<0-10>,"headline":"<8 words>","points":["<point>","<point>"]}` },
];

async function scoutOne(ticker) {
  const [quote, newsLines] = await Promise.all([fetchQuote(ticker), fetchNews(ticker)]);
  const price = quote?.c || quote?.pc || null;
  const changePct = price && quote?.pc ? ((price - quote.pc) / quote.pc) * 100 : null;

  const timeStr = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  const priceStr = price ? `$${price.toFixed(2)}` : 'N/A';
  const changeStr = changePct != null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}% today` : '';
  const newsText = newsLines.length ? newsLines.join('\n') : 'No recent news.';

  const liveDataBlock = `\nLIVE DATA (as of ${timeStr}): ${ticker} ${priceStr}${changeStr ? ', ' + changeStr : ''}. Recent news:\n${newsText}\n`;
  const baseMsg = `Ticker: ${ticker}. Investor considering BUYING.${liveDataBlock} Return ONLY the JSON.`;

  const agentResults = {};
  for (let i = 0; i < AGENT_SYSTEMS.length; i++) {
    const ag = AGENT_SYSTEMS[i];
    try {
      const text = await callGroq(ag.system, baseMsg, i);
      const parsed = extractJSON(text) || { stance: 'CAUTION', score: 5, headline: 'No parse', points: [] };
      agentResults[ag.id] = { stance: parsed.stance, score: parsed.score, headline: parsed.headline };
    } catch {
      agentResults[ag.id] = { stance: 'CAUTION', score: 5, headline: 'Error' };
    }
    await sleep(1500);
  }

  const councilSummary = AGENT_SYSTEMS.map(ag => {
    const r = agentResults[ag.id] || {};
    return `${ag.name}: stance=${r.stance} score=${r.score} — ${r.headline}`;
  }).join('\n');

  const synthSys = `You are AXIOM delivering a quick scout verdict on ${ticker}. ${PROTOCOLS_SHORT}
Single-round lightweight scan. Synthesize agent stances into a quick verdict.
Output ONLY raw JSON: {"verdict":"BUY"|"WATCH"|"SKIP","conviction":<0-10>,"headline":"<one line>","rationale":"<1-2 sentences>"}`;

  let verdict = 'WATCH', conviction = 5, headline = '', rationale = '';
  try {
    const text = await callGroqSynth(synthSys, `Agent results:\n${councilSummary}\nPrice: ${priceStr}. Deliver scout verdict.`);
    const parsed = extractJSON(text);
    if (parsed) { verdict = parsed.verdict || 'WATCH'; conviction = parsed.conviction ?? 5; headline = parsed.headline || ''; rationale = parsed.rationale || ''; }
  } catch {}

  return { verdict, conviction, headline, rationale, price, changePct, agents: agentResults, scoutedAt: new Date().toISOString() };
}

export default async function handler(req, res) {
  // Log every incoming request unconditionally — before any auth check — so a scheduler
  // failing to hit this endpoint at all (vs. hitting it and getting rejected) is visible
  // in Vercel's function logs either way.
  console.error(`[scout-cron] incoming request: method=${req.method} authHeaderPresent=${!!req.headers.authorization} ua=${req.headers['user-agent'] || 'unknown'}`);

  // Vercel's own Cron Jobs feature sends `Authorization: Bearer <CRON_SECRET>` (same
  // convention as api/cron/agents.js) — NOT an `x-vercel-cron-secret` header. The previous
  // check here looked for the wrong header, so it silently 401'd every real Vercel Cron
  // invocation once CRON_SECRET was set, which is why scout stopped running.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    console.error('[scout-cron] rejected: missing/incorrect Authorization header');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[scout-cron] Starting daily scout run');
  const project = process.env.FIREBASE_PROJECT_ID || 'the-council-89570';

  // List all users (top-level collection listing requires service account in real setup;
  // for single-family use, fall back to a hardcoded approach or admin SDK)
  // Since we use Firestore REST API with web API key, we can only read public data.
  // This cron is best triggered client-side OR uses CRON_USER_IDS env var listing known UIDs.
  const userIdsEnv = process.env.CRON_USER_IDS || '';
  const userIds = userIdsEnv.split(',').map(s => s.trim()).filter(Boolean);

  if (!userIds.length) {
    console.log('[scout-cron] No CRON_USER_IDS configured — skipping. Set CRON_USER_IDS=uid1,uid2 in Vercel env vars.');
    return res.status(200).json({ ok: true, skipped: 'no user IDs configured' });
  }

  let totalScouted = 0;
  const errors = [];

  for (const uid of userIds) {
    try {
      // Read user's watchlist
      const wlDocs = await fsList(`users/${uid}/watchlist`);
      const wlTickers = wlDocs.map(d => d.fields?.ticker?.stringValue).filter(Boolean);

      // Pick discovery tickers
      const wlSet = new Set(wlTickers);
      const pool = DISCOVERY_POOL.filter(t => !wlSet.has(t));
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      const discoveryTickers = shuffled.slice(0, 6);

      const allTickers = [...wlTickers, ...discoveryTickers];
      console.log(`[scout-cron] User ${uid}: scouting ${allTickers.length} tickers`);

      for (const ticker of allTickers) {
        const isDiscovery = !wlTickers.includes(ticker);
        try {
          const result = await scoutOne(ticker);
          const path = isDiscovery ? `users/${uid}/scoutDiscovery/${ticker}` : `users/${uid}/watchlist/${ticker}`;
          await fsPatch(path, {
            ticker,
            lastScoutedAt: result.scoutedAt,
            lastResult: JSON.stringify(result),
          });
          totalScouted++;
          console.log(`[scout-cron] ${ticker}: ${result.verdict} ${result.conviction}/10`);
        } catch (err) {
          console.error(`[scout-cron] ${ticker} error:`, err?.message);
          errors.push(`${ticker}: ${err?.message}`);
        }
        await sleep(3000);
      }
    } catch (err) {
      console.error(`[scout-cron] User ${uid} error:`, err?.message);
      errors.push(`user ${uid}: ${err?.message}`);
    }
  }

  console.log(`[scout-cron] Done. Scouted ${totalScouted} tickers. Errors: ${errors.length}`);
  res.status(200).json({ ok: true, scouted: totalScouted, errors });
}
