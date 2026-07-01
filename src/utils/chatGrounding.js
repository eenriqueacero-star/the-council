import { lookupCompany } from '../constants/companyInfo.js';

/**
 * Anti-hallucination + concision rules shared by every AXIOM/specialist prompt in the
 * chat. These exist because the chat was previously observed inventing company names
 * (ALAB -> "Alabama", NBIS -> "Neurocrine", FLY -> "Flywire"), inventing a sector for
 * CRDO ("blockchain company"), and inventing a price for MU (~$1,156 vs. the real ~$100-110).
 */
export const ANTI_HALLUCINATION_RULES = `CRITICAL GROUNDING RULES:
- NEVER guess or invent a stock price. Use ONLY the real-time prices provided in CURRENT HOLDINGS / LIVE DATA blocks below.
- NEVER guess a company name or sector/description. Use ONLY the names/sectors provided below.
- If a ticker is not listed below and you don't have verified data on it, say plainly "I don't have verified data on that ticker" — do NOT invent a name, price, or business description.
- If asked about news or catalysts, only reference what's actually in the fetched news data provided. Do not invent earnings results, catalysts, or events that weren't given to you.
- Every number in your response must trace back to real data you were given. If real data isn't available for something, say so instead of filling the gap with a guess.`;

export const CONCISE_STYLE_RULES = `COMMUNICATION STYLE:
- Be CONCISE — maximum 3-4 short paragraphs (or fewer) for any response.
- Lead with the answer, then explain briefly.
- Use bullet points for multiple items, not long paragraphs.
- Numbers and data in a scannable format, not buried in sentences.
- No introductory fluff ("Great question!", "Let me break this down…").
- No repeating the question back.
- When comparing multiple stocks, output a markdown table (| Ticker | Price | Day | Stance |) instead of a section per stock.
- If the user asks a yes/no question, start with yes or no.`;

/**
 * Builds the "CURRENT HOLDINGS" ground-truth block: real company name/sector (static,
 * curated) + real-time price/day-change (from a live quotes map) for every ticker in
 * the account. This is the block that must be injected before AXIOM says anything.
 */
export function buildHoldingsBlock(tickers, quotes = {}) {
  if (!tickers?.length) return '';
  const lines = tickers.map(t => {
    const info = lookupCompany(t);
    const q = quotes[t];
    const priceStr = q?.price ? `$${q.price.toFixed(2)}` : (q?.prevClose ? `$${q.prevClose.toFixed(2)} (prev close)` : 'price unavailable');
    const dayStr = q?.changePct != null ? ` — Day: ${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(1)}%` : '';
    return info
      ? `${t} — ${info.name} — Current: ${priceStr}${dayStr} — ${info.sector}`
      : `${t} — [no verified company profile on record] — Current: ${priceStr}${dayStr}`;
  });
  return `\nCURRENT HOLDINGS (real-time data — use ONLY these values, never guess):\n${lines.join('\n')}\n`;
}

/** Ground-truth block for a single ticker the user asked about (may not be a holding). */
export function buildTickerFactBlock(ticker, quote) {
  if (!ticker) return '';
  const info = lookupCompany(ticker);
  const priceStr = quote?.price ? `$${quote.price.toFixed(2)}` : (quote?.prevClose ? `$${quote.prevClose.toFixed(2)} (prev close)` : 'price unavailable');
  const dayStr = quote?.changePct != null ? `, Day: ${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(1)}%` : '';
  return info
    ? `\nVERIFIED DATA for ${ticker} — ${info.name} (${info.sector}) — Current: ${priceStr}${dayStr}\n`
    : `\nVERIFIED DATA for ${ticker}: Current: ${priceStr}${dayStr}. No verified company profile on record for this ticker — do not guess its name or business.\n`;
}

/** Instruction appended to every AXIOM-speaking prompt asking for follow-up chips. */
export const QUICK_REPLIES_INSTRUCTION = `\nEnd your response with a final line (not part of the visible answer) in the exact form: QUICK_REPLIES:["question 1","question 2","question 3"] — 2-3 short, specific follow-up questions the investor could naturally ask next, grounded in what you just said.`;

/** Instruction describing the ACTION: tag protocol for app-interaction. */
export const ACTION_TAGS_INSTRUCTION = `\nIf the investor's message asks you to DO something the app can perform, append exactly one line (after your spoken reply, before QUICK_REPLIES) in the exact form ACTION:<TYPE>:<PARAM> using ONE of:
- ACTION:SHOW_CHART:<TICKER> — open that ticker's chart
- ACTION:RUN_COUNCIL:<TICKER> — convene the full 6-agent council on that ticker
- ACTION:SHOW_HOLDINGS — show the live portfolio table
- ACTION:SHOW_STANCES:<TICKER> — show all 6 agents' current stances on that ticker
- ACTION:MUTE_AGENT:<AGENTID> — mute push notifications from that agent (rex|nova|sage|atlas|vega|zen)
- ACTION:SHOW_REPORT:latest — show the latest weekly council report summary
Only emit an ACTION tag when the investor clearly asked for that specific action. Never emit one speculatively.`;
