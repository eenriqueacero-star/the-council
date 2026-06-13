import { getQuotes } from '../api.js';
import { buildProfileContext } from './agentMemory.js';

function pct(v) {
  if (v == null || isNaN(v)) return 'n/a';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

export async function loadAgentContext(ticker, tickerQuote) {
  let q = {};
  try { q = await getQuotes(['SPY', 'TLT', 'GLD', 'VIX', 'SOXX', 'SMH', 'XLK']); }
  catch (e) { console.warn('agentContext: market tape fetch failed, agents will lack live context:', e?.message); }
  return { q, tickerQuote };
}

export function buildAgentContext(agentId, ctx, profile) {
  if (!ctx) return buildProfileContext(profile);
  const { q, tickerQuote } = ctx;
  let base = '';
  if (agentId === 'technical') {
    const soxx = pct(q.SOXX?.changePct), smh = pct(q.SMH?.changePct),
          xlk  = pct(q.XLK?.changePct),  spy = pct(q.SPY?.changePct);
    base = `\nSECTOR CONTEXT TODAY: SOXX ${soxx} · SMH ${smh} · XLK ${xlk}. Broad market: SPY ${spy}. Note whether the ticker is moving with or against its sector.`;
  } else if (agentId === 'macro') {
    const spy = pct(q.SPY?.changePct), tlt = pct(q.TLT?.changePct), gld = pct(q.GLD?.changePct);
    const vix = q.VIX?.price ? q.VIX.price.toFixed(1) : 'n/a';
    const vixC = pct(q.VIX?.changePct);
    base = `\nMARKET TAPE TODAY: SPY ${spy} · TLT ${tlt} · GLD ${gld} · VIX ${vix} (${vixC}). Anchor your macro thesis to this live tape.`;
  } else if (agentId === 'bear' && tickerQuote) {
    const price = tickerQuote.price > 0 ? tickerQuote.price : tickerQuote.prevClose;
    const high = tickerQuote.high, low = tickerQuote.low;
    if (price && high && low) {
      const fromHigh = ((price - high) / high * 100).toFixed(1);
      base = `\nINTRADAY CONTEXT: Today high $${high.toFixed(2)}, low $${low.toFixed(2)}, current $${price.toFixed(2)} (${fromHigh}% off day high). Weight this in your downside scenario.`;
    }
  }
  return base + buildProfileContext(profile);
}
