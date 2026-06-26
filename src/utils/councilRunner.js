/**
 * Lightweight single-round council runner for Scout Mode.
 * Reuses the same agent prompts, key rotation, and liveDataBlock assembly
 * as CouncilTab — without duplicating that logic.
 */
import { AGENTS, PROTOCOLS } from '../constants/agents.js';
import { callAgent, getQuotes, getNews } from '../api.js';
import { extractJSON } from '../utils.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Build the LIVE DATA block for a ticker — same format used in CouncilTab.
 */
async function buildLiveDataBlock(ticker) {
  let rawQuote = null;
  let livePrice = null;

  try {
    const quotes = await getQuotes([ticker]);
    rawQuote = quotes[ticker] || null;
    livePrice = rawQuote?.price > 0 ? rawQuote.price : rawQuote?.prevClose || null;
  } catch {}

  const now = new Date();
  const timeStr = now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  const priceStr = livePrice ? `$${livePrice.toFixed(2)}` : 'N/A';
  const changeStr = rawQuote?.changePct != null ? `${rawQuote.changePct >= 0 ? '+' : ''}${rawQuote.changePct.toFixed(2)}% today` : '';
  const rangeStr = rawQuote?.low && rawQuote?.high ? ` range $${rawQuote.low.toFixed(2)}-$${rawQuote.high.toFixed(2)}` : '';

  let newsText = '';
  let earningsLine = 'Next earnings: unavailable';
  try {
    const { articles, nextEarnings, earningsEstimated } = await getNews(ticker);
    if (articles?.length > 0) {
      newsText = articles.map(a => `- [${a.date}] ${a.headline} (${a.source})`).join('\n');
    }
    if (nextEarnings) {
      const daysAway = Math.round((new Date(nextEarnings) - new Date(new Date().toISOString().slice(0, 10))) / 864e5);
      const estFlag = earningsEstimated ? ', est.' : '';
      earningsLine = `Next earnings: ${nextEarnings}${estFlag} (in ${daysAway} day${daysAway !== 1 ? 's' : ''}${earningsEstimated ? ' — date estimated' : ''})`;
    } else {
      earningsLine = 'Next earnings: none scheduled within 90 days';
    }
  } catch {}

  const liveDataBlock = `\nLIVE DATA (as of ${timeStr}): ${ticker} ${priceStr}${changeStr ? ', ' + changeStr : ''}${rangeStr}. ${earningsLine}.${newsText ? ' Recent news (last 5 days, via Finnhub):\n' + newsText : ' Recent news: no recent news available.'}\n`;
  return { liveDataBlock, livePrice, rawQuote, changePct: rawQuote?.changePct ?? null };
}

/**
 * Run a single-round scout on one ticker.
 * Returns { verdict, conviction, headline, rationale, price, changePct, agents, debugData }
 */
export async function scoutTicker(ticker, { onProgress, debugMode } = {}) {
  onProgress?.(`Scouting ${ticker}…`);

  const { liveDataBlock, livePrice, changePct } = await buildLiveDataBlock(ticker);

  const baseContent = `Ticker: ${ticker}. Investor considering BUYING. ${liveDataBlock}
IMPORTANT: Use ONLY the LIVE DATA block for current prices, news, and earnings dates.`;

  const agentResults = {};
  const debugAgents = {};

  for (let i = 0; i < AGENTS.length; i++) {
    const ag = AGENTS[i];
    const userMsg = baseContent + ' Return ONLY the JSON.';
    const t0 = Date.now();
    try {
      const { text } = await callAgent(ag.system, userMsg, false, 512, null, null, i);
      const ms = Date.now() - t0;
      const parsed = extractJSON(text) || { stance: 'CAUTION', score: 5, headline: 'No parse', points: [] };
      agentResults[ag.id] = { stance: parsed.stance, score: parsed.score, headline: parsed.headline };
      if (debugMode) debugAgents[ag.id] = { rawResponse: text, parsed, ms, keyIndex: i % 5 };
    } catch (err) {
      agentResults[ag.id] = { stance: 'CAUTION', score: 5, headline: 'Error' };
      if (debugMode) debugAgents[ag.id] = { rawResponse: null, error: err?.message, ms: Date.now() - t0 };
    }
    if (i < AGENTS.length - 1) await sleep(1500);
  }

  // AXIOM single-round synthesis
  const councilSummary = AGENTS.map(ag => {
    const r = agentResults[ag.id] || {};
    return `${ag.name} (${ag.role}): stance=${r.stance || '?'} score=${r.score ?? '?'} — ${r.headline || ''}`;
  }).join('\n');

  const synthSys = `You are AXIOM, delivering a quick scout verdict on ${ticker}. ${PROTOCOLS}
This is a single-round lightweight scan — not a full council. Synthesize the agent stances into a quick verdict.
Output ONLY raw JSON: {"verdict":"BUY"|"WATCH"|"SKIP","conviction":<0-10>,"headline":"<one bold line>","rationale":"<1-2 sentences>"}
BUY = strong opportunity worth acting on (conviction 7+). WATCH = interesting but not ready. SKIP = pass.`;

  const synthMsg = `Single-round agent results:\n${councilSummary}\nLive price: ${livePrice ? '$' + livePrice.toFixed(2) : 'unknown'}. Deliver scout verdict.`;

  let verdict = 'WATCH', conviction = 5, headline = 'Scout complete', rationale = '';
  let debugSynthesis = null;
  const st0 = Date.now();
  try {
    const { text } = await callAgent(synthSys, synthMsg, false, 512, null, 'openai/gpt-oss-120b');
    const parsed = extractJSON(text);
    if (parsed) { verdict = parsed.verdict || 'WATCH'; conviction = parsed.conviction ?? 5; headline = parsed.headline || ''; rationale = parsed.rationale || ''; }
    if (debugMode) debugSynthesis = { systemPrompt: synthSys, userPrompt: synthMsg, rawResponse: text, parsed, ms: Date.now() - st0 };
  } catch (err) {
    if (debugMode) debugSynthesis = { systemPrompt: synthSys, userPrompt: synthMsg, rawResponse: null, error: err?.message, ms: Date.now() - st0 };
  }

  return {
    verdict,
    conviction,
    headline,
    rationale,
    price: livePrice,
    changePct,
    agents: agentResults,
    debugData: debugMode ? { liveDataBlock, agents: debugAgents, synthesis: debugSynthesis, ts: Date.now() } : null,
  };
}
