/**
 * Consolidated agent cron endpoint.
 * Route: POST /api/cron/agents?agent=rex|nova|sage|atlas|vega|zen
 *
 * All 6 agent scan logics live here to stay within Vercel Hobby's 12-function limit.
 * Auth: Authorization: Bearer $CRON_SECRET (set in Vercel env + GitHub secrets).
 */

import { db } from '../_lib/firebaseAdmin.js';
import { fetchPrices, fetchNews, fetchEarnings, fetchTechnicals, fetchMacro } from '../_lib/recon.js';
import { FieldValue } from 'firebase-admin/firestore';
import {
  getAgentFullMemory, getStaleStances,
  updateStance, updateGlobalOutlook,
  getAllStances, getAllGlobalOutlooks,
} from '../_lib/agentMemory.js';
import { sendPushToUser, feedItemTitle } from '../_lib/pushNotify.js';
import { maybeGenerateProposal, getProposalAwareness } from '../_lib/selfImprovement.js';

// ---------------------------------------------------------------------------
// Weekly council helpers
// ---------------------------------------------------------------------------

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callGroq(systemPrompt, userMsg, keyIndex = 0, model = 'openai/gpt-oss-120b') {
  const keys = [
    process.env.GROQ_API_KEY,  process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3, process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5,
  ].filter(Boolean);
  if (!keys.length) throw new Error('No GROQ_API_KEY configured');
  const key = keys[keyIndex % keys.length];
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
      max_tokens: 600,
      temperature: 0.5,
    }),
  });
  if (res.status === 429) throw new Error('ERR-429');
  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function extractSimpleJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text.replace(/```json?\n?/gi, '').replace(/```/g, '').trim()); } catch {}
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(text.slice(s, e + 1)); } catch {} }
  return null;
}

const WEEKLY_AGENT_DEFS = [
  { id: 'rex',   name: 'REX',   role: 'Technical Analyst',   focus: 'price action, RSI, MACD, moving averages, Bollinger Bands, trend direction' },
  { id: 'nova',  name: 'NOVA',  role: 'Catalyst Scout',       focus: 'upcoming earnings, news catalysts, sector events, sentiment shifts' },
  { id: 'sage',  name: 'SAGE',  role: 'Risk Manager',         focus: 'concentration risk, drawdown potential, portfolio balance, stop-loss levels' },
  { id: 'atlas', name: 'ATLAS', role: 'Macro Strategist',     focus: 'macro environment, interest rates, VIX, sector rotation, yield curve' },
  { id: 'vega',  name: 'VEGA',  role: "Devil's Advocate",     focus: 'downside risks, bear cases, what the bulls are ignoring, failure scenarios' },
  { id: 'zen',   name: 'ZEN',   role: 'Position Sizer',       focus: 'position efficiency, when to size up or down, rebalancing and exit optimization' },
];

const PORTFOLIO_LABELS = ['Edwin', 'Dad', 'Bro'];

// ---------------------------------------------------------------------------
// Auth + shared helpers
// ---------------------------------------------------------------------------

function verifyCron(req) {
  return req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
}

function getUsers() {
  return (process.env.CRON_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
}

// Cheap per-invocation cache for muted-agent lists (60s TTL) — writeFeed is called many
// times per userId within a single cron run, so this avoids re-reading the settings doc
// on every feed item.
const mutedAgentsCache = new Map(); // userId -> { list, ts }

async function getMutedAgents(userId) {
  const cached = mutedAgentsCache.get(userId);
  if (cached && Date.now() - cached.ts < 60000) return cached.list;
  let list = [];
  try {
    const snap = await db.doc(`users/${userId}/data/settings`).get();
    list = snap.exists ? (snap.data()?.mutedAgents || []) : [];
  } catch {}
  mutedAgentsCache.set(userId, { list, ts: Date.now() });
  return list;
}

async function writeFeed(userId, item) {
  await db.collection(`users/${userId}/agent_feed`).add({
    ...item,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    timestamp: FieldValue.serverTimestamp(),
  });
  // Push notification for alert/warning items (fire-and-forget, never blocks the cron).
  // Skipped entirely when the investor has muted this agent from the chat (ACTION:MUTE_AGENT) —
  // the feed item itself is still written so the network/feed UI stays complete.
  if ((item.severity === 'alert' || item.severity === 'warning') && item.agentId) {
    const muted = await getMutedAgents(userId);
    if (muted.includes(item.agentId)) return;
    const tag = [item.agentId, item.ticker || 'all', item.source || 'scan'].filter(Boolean).join('-');
    sendPushToUser(userId, {
      title: feedItemTitle(item),
      body:  item.headline || '',
      url:   '/',
      tag,
      severity: item.severity,
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Cross-agent requests (Layer 6, Part 6) — agents ask each other for info during
// the weekly council; the target agent resolves it deterministically from its
// own already-computed scan data the next time its solo cron runs.
// ---------------------------------------------------------------------------

const VALID_AGENT_IDS = new Set(['rex', 'nova', 'sage', 'atlas', 'vega', 'zen']);

function extractAgentRequest(text) {
  if (!text) return null;
  const m = text.match(/REQUEST_FROM:\s*(\w+)\s*:\s*(.+)/i);
  if (!m) return null;
  const toAgent = m[1].toLowerCase();
  if (!VALID_AGENT_IDS.has(toAgent)) return null;
  return { toAgent, question: m[2].trim().slice(0, 240) };
}

async function resolveAgentRequests(userId, agentId, answerFn) {
  let written = 0;
  try {
    const snap = await db.collection(`users/${userId}/agent_requests`)
      .where('toAgent', '==', agentId).where('status', '==', 'pending').limit(5).get();
    for (const d of snap.docs) {
      const req = d.data();
      let answer;
      try { answer = answerFn(req.ticker, req.question); } catch { answer = null; }
      if (!answer) continue;
      await d.ref.update({ status: 'answered', answer, answeredAt: FieldValue.serverTimestamp() });
      await writeFeed(userId, {
        agentId, ticker: req.ticker || null, severity: 'info', source: 'agent_request_answered',
        headline: `${agentId.toUpperCase()} answered ${(req.fromAgent || '?').toUpperCase()}'s question${req.ticker ? ` on ${req.ticker}` : ''}`,
        detail: `Q: ${req.question}\nA: ${answer}`,
      });
      written++;
    }
  } catch (e) { console.error(`[agent_requests] ${agentId} resolve error:`, e.message); }
  return written;
}

async function getFullHoldings(userId) {
  try {
    const doc = await db.doc(`users/${userId}/data/positions`).get();
    if (!doc.exists) return {};
    const data = doc.data();
    const combined = {};
    for (const account of Object.values(data?.positions || {})) {
      for (const [ticker, pos] of Object.entries(account || {})) {
        if (!combined[ticker]) combined[ticker] = { shares: 0, cost: 0 };
        combined[ticker].shares += Number(pos.shares || 0);
        combined[ticker].cost    = Number(pos.cost || combined[ticker].cost || 0);
      }
    }
    return combined;
  } catch (e) {
    console.error(`[cron/agents] getFullHoldings error for ${userId}:`, e.message);
    return {};
  }
}

async function getTickers(userId) {
  const h = await getFullHoldings(userId);
  return Object.keys(h);
}

// ---------------------------------------------------------------------------
// REX — Technical Analyst (every 4 hours)
// ---------------------------------------------------------------------------

async function runRex(userId) {
  const holdings = await getFullHoldings(userId);
  const tickers  = Object.keys(holdings);
  if (!tickers.length) return 0;

  const prices = await fetchPrices(tickers);
  let written = 0;
  const tickerStances = []; // collect for global outlook derivation
  const techMap = {}; // ticker -> technicals, kept for cross-agent request answers

  // Check for stale stances and notify
  const staleItems = await getStaleStances(userId);
  for (const s of staleItems.filter(s => s.agentId === 'rex' && s.ticker !== '_GLOBAL')) {
    const days = s.updatedAt?.toDate ? Math.round((Date.now() - s.updatedAt.toDate().getTime()) / 86400000) : 30;
    if (days >= 32) {
      await writeFeed(userId, {
        agentId: 'rex', ticker: s.ticker, severity: 'info', source: 'cron_rex_stale',
        headline: `REX's ${s.ticker} stance is ${days} days old — refreshing analysis`,
        detail:   `Previous stance: ${s.stance} (${s.conviction}/10). "${s.reasoning?.slice(0, 100)}"`,
      });
      written++;
    }
  }

  for (const ticker of tickers) {
    const tech  = await fetchTechnicals(ticker);
    if (!tech) continue;
    techMap[ticker] = tech;

    const price  = prices[ticker]?.price || 0;
    const events = [];

    if (tech.rsi != null) {
      if (tech.rsi > 70) {
        events.push({
          severity: 'warning',
          headline: `${ticker} RSI hit ${tech.rsi.toFixed(0)} — entering overbought territory`,
          detail:   `RSI of ${tech.rsi.toFixed(1)} signals the stock may be overextended. Watch for a pullback or consolidation. This does not mean sell — trend could continue.`,
        });
      } else if (tech.rsi < 30) {
        events.push({
          severity: 'warning',
          headline: `${ticker} RSI hit ${tech.rsi.toFixed(0)} — entering oversold territory`,
          detail:   `RSI of ${tech.rsi.toFixed(1)} signals extreme selling pressure. Could be a dip opportunity or continued decline. Check news for a catalyst.`,
        });
      }
    }

    if (tech.macdBullish != null) {
      events.push({
        severity: 'info',
        headline: `${ticker} MACD ${tech.macdBullish ? 'bullish' : 'bearish'} crossover — momentum shifting ${tech.macdBullish ? 'up' : 'down'}`,
        detail:   `MACD (${tech.macd?.toFixed(2)}) ${tech.macdBullish ? 'crossed above' : 'crossed below'} signal (${tech.macdSignal?.toFixed(2)}). Histogram: ${tech.macdHistogram?.toFixed(2)}. ${tech.macdBullish ? 'Bullish momentum building.' : 'Bearish momentum building.'}`,
      });
    }

    if (tech.goldenCross && tech.sma50 && tech.sma200) {
      events.push({
        severity: 'alert',
        headline: `${ticker} golden cross forming — SMA50 crossing above SMA200`,
        detail:   `SMA50 (${tech.sma50.toFixed(2)}) is above SMA200 (${tech.sma200.toFixed(2)}), forming a golden cross. Historically a bullish long-term signal.`,
      });
    }

    if (tech.deathCross && tech.sma50 && tech.sma200) {
      events.push({
        severity: 'alert',
        headline: `${ticker} death cross — SMA50 crossed below SMA200`,
        detail:   `SMA50 (${tech.sma50.toFixed(2)}) is below SMA200 (${tech.sma200.toFixed(2)}). Death cross indicates potential long-term downtrend. Monitor closely.`,
      });
    }

    if (price && tech.bollingerUpper && tech.bollingerLower) {
      if (price >= tech.bollingerUpper) {
        events.push({
          severity: 'info',
          headline: `${ticker} broke above upper Bollinger Band ($${tech.bollingerUpper.toFixed(2)})`,
          detail:   `Price ($${price.toFixed(2)}) is above the upper Bollinger Band ($${tech.bollingerUpper.toFixed(2)}). Potential overbought condition or strong breakout. Watch for follow-through or reversal.`,
        });
      } else if (price <= tech.bollingerLower) {
        events.push({
          severity: 'info',
          headline: `${ticker} broke below lower Bollinger Band ($${tech.bollingerLower.toFixed(2)})`,
          detail:   `Price ($${price.toFixed(2)}) is below the lower Bollinger Band ($${tech.bollingerLower.toFixed(2)}). Potential oversold or breakdown. Check for news catalyst.`,
        });
      }
    }

    for (const ev of events) {
      await writeFeed(userId, { agentId: 'rex', ticker, source: 'cron_rex_technicals', ...ev });
      written++;
    }

    // Derive stance from technical indicators
    if (tech.rsi != null || tech.sma200 != null) {
      let bullishSignals = 0;
      let bearishSignals = 0;
      const signals = [];

      if (tech.rsi != null) {
        if (tech.rsi < 60 && tech.rsi > 30) { bullishSignals++; signals.push(`RSI ${tech.rsi.toFixed(0)}`); }
        else if (tech.rsi > 70) { bearishSignals++; signals.push(`RSI overbought ${tech.rsi.toFixed(0)}`); }
        else if (tech.rsi < 30) { bearishSignals++; signals.push(`RSI oversold ${tech.rsi.toFixed(0)}`); }
      }
      if (tech.macdBullish === true)  { bullishSignals++; signals.push('MACD bullish'); }
      if (tech.macdBullish === false) { bearishSignals++; signals.push('MACD bearish'); }
      if (tech.goldenCross) { bullishSignals += 2; signals.push('golden cross'); }
      if (tech.deathCross)  { bearishSignals += 2; signals.push('death cross'); }
      if (price && tech.sma200) {
        if (price > tech.sma200) { bullishSignals++; signals.push(`above SMA200`); }
        else                     { bearishSignals++; signals.push(`below SMA200`); }
      }

      const totalSignals = bullishSignals + bearishSignals;
      let stance, conviction;
      if (bullishSignals > bearishSignals) {
        stance = 'bullish';
        conviction = Math.min(10, Math.round(2 + (bullishSignals / Math.max(totalSignals, 1)) * 7));
      } else if (bearishSignals > bullishSignals) {
        stance = 'bearish';
        conviction = Math.min(10, Math.round(2 + (bearishSignals / Math.max(totalSignals, 1)) * 7));
      } else {
        stance = 'neutral';
        conviction = 4;
      }

      const reasoning = `${signals.join(', ') || 'mixed signals'}. Price: $${price?.toFixed(2) || 'N/A'}.`;
      tickerStances.push({ ticker, stance });

      try {
        const flip = await updateStance(userId, 'rex', ticker, { stance, conviction, reasoning });
        if (flip.flipped) {
          await writeFeed(userId, {
            agentId: 'rex', ticker, severity: 'alert', source: 'cron_rex_flip',
            headline: `REX flipped ${flip.to.toUpperCase()} on ${ticker} after ${flip.daysSincePrevious} days ${flip.from}`,
            detail:   `Technical picture reversed. Now ${stance} (${conviction}/10). ${reasoning}`,
          });
          written++;
        }
      } catch (e) { console.error('[rex] updateStance error:', e.message); }
    }
  }

  // Global outlook — overall technical picture across all holdings
  const bullCount = tickerStances.filter(s => s.stance === 'bullish').length;
  const bearCount = tickerStances.filter(s => s.stance === 'bearish').length;
  const total = tickerStances.length;
  if (total > 0) {
    let outlook, conviction, reasoning;
    const bullPct = bullCount / total;
    if (bullPct >= 0.6) {
      outlook = 'bullish'; conviction = Math.round(5 + bullPct * 4);
      reasoning = `${bullCount}/${total} holdings showing bullish technical structure.`;
    } else if (bearCount / total >= 0.5) {
      outlook = 'bearish'; conviction = Math.round(5 + (bearCount / total) * 4);
      reasoning = `${bearCount}/${total} holdings showing bearish technical signals.`;
    } else {
      outlook = 'neutral'; conviction = 4;
      reasoning = `Mixed technical picture: ${bullCount} bullish, ${bearCount} bearish, ${total - bullCount - bearCount} neutral.`;
    }
    try { await updateGlobalOutlook(userId, 'rex', { outlook, conviction, reasoning }); } catch {}
  }

  written += await resolveAgentRequests(userId, 'rex', (ticker, q) => {
    const t = techMap[ticker];
    if (!t) return null;
    return `${ticker}: RSI ${t.rsi?.toFixed(0) ?? 'N/A'}, MACD ${t.macdBullish ? 'bullish' : 'bearish'}, ${t.sma50 && t.sma200 ? (t.sma50 > t.sma200 ? 'SMA50 above SMA200' : 'SMA50 below SMA200') : 'SMA data N/A'}.`;
  });

  await maybeGenerateProposal(userId, 'rex');
  return written;
}

// ---------------------------------------------------------------------------
// NOVA — Catalyst Scout (daily 10am ET)
// ---------------------------------------------------------------------------

async function runNova(userId) {
  const tickers = await getTickers(userId);
  if (!tickers.length) return 0;

  const [earningsList, newsMap] = await Promise.all([
    fetchEarnings(tickers),
    fetchNews(tickers),
  ]);

  let written = 0;

  // Stale stance check
  const staleItems = await getStaleStances(userId);
  for (const s of staleItems.filter(s => s.agentId === 'nova' && s.ticker !== '_GLOBAL')) {
    const days = s.updatedAt?.toDate ? Math.round((Date.now() - s.updatedAt.toDate().getTime()) / 86400000) : 30;
    if (days >= 32) {
      await writeFeed(userId, {
        agentId: 'nova', ticker: s.ticker, severity: 'info', source: 'cron_nova_stale',
        headline: `NOVA's catalyst view on ${s.ticker} is ${days} days old — checking for updates`,
        detail:   `Previous: ${s.stance} (${s.conviction}/10). "${s.reasoning?.slice(0, 100)}"`,
      });
      written++;
    }
  }

  // Build lookup: ticker → earnings info
  const earningsMap = {};
  for (const e of earningsList) { earningsMap[e.ticker] = e; }

  for (const e of earningsList) {
    let severity, detail;
    if (e.daysAway <= 3) {
      severity = 'alert';
      detail   = `Earnings in ${e.daysAway} day${e.daysAway === 1 ? '' : 's'} (${e.date}${e.estimated ? ', est.' : ''}). Implied move risk is elevated — consider position sizing and whether to hold through.`;
    } else if (e.daysAway <= 14) {
      severity = 'warning';
      detail   = `Earnings on ${e.date} (${e.daysAway} days away${e.estimated ? ', date estimated' : ''}). Start monitoring implied volatility and set your pre-earnings thesis.`;
    } else {
      continue;
    }
    await writeFeed(userId, {
      agentId:  'nova',
      ticker:   e.ticker,
      headline: `${e.ticker} earnings in ${e.daysAway} day${e.daysAway === 1 ? '' : 's'} — implied move needs attention`,
      detail,
      severity,
      source:   'cron_nova_earnings',
    });
    written++;
  }

  // Per-ticker stance derivation
  let bullCount = 0, bearCount = 0;
  for (const ticker of tickers) {
    const negatives = (newsMap[ticker] || []).filter(a => a.sentiment === 'negative');
    const positives = (newsMap[ticker] || []).filter(a => a.sentiment === 'positive');
    if (negatives.length >= 2) {
      const headlines = negatives.slice(0, 3).map(a => `"${a.headline}"`).join('; ');
      await writeFeed(userId, {
        agentId:  'nova',
        ticker,
        headline: `${ticker}: ${negatives.length} negative article${negatives.length > 1 ? 's' : ''} in last 24h flagged`,
        detail:   `Multiple negative signals detected in recent news: ${headlines}. Review each article — cluster of bad news can precede further weakness.`,
        severity: 'warning',
        source:   'cron_nova_news',
      });
      written++;
    }

    // Derive stance
    const e = earningsMap[ticker];
    const hasNearEarnings = e && e.daysAway <= 14;
    const hasNegNews = negatives.length >= 2;
    const hasPosNews = positives.length >= negatives.length + 1;

    let stance, conviction, reasoning;
    if (hasNegNews) {
      stance = 'bearish'; conviction = 5 + Math.min(3, negatives.length - 1);
      reasoning = `${negatives.length} negative articles in 24h.${hasNearEarnings ? ` Earnings in ${e.daysAway}d adds risk.` : ''}`;
      bearCount++;
    } else if (hasNearEarnings && hasPosNews) {
      stance = 'bullish'; conviction = 6;
      reasoning = `Earnings catalyst in ${e.daysAway}d with positive news sentiment.`;
      bullCount++;
    } else if (hasNearEarnings) {
      stance = 'neutral'; conviction = 5;
      reasoning = `Earnings in ${e.daysAway}d — monitoring for directional catalyst.`;
    } else {
      stance = 'neutral'; conviction = 4;
      reasoning = `No imminent earnings or strong news signals.`;
    }

    try {
      const flip = await updateStance(userId, 'nova', ticker, { stance, conviction, reasoning });
      if (flip.flipped) {
        await writeFeed(userId, {
          agentId: 'nova', ticker, severity: 'alert', source: 'cron_nova_flip',
          headline: `NOVA flipped ${flip.to.toUpperCase()} on ${ticker} after ${flip.daysSincePrevious} days ${flip.from}`,
          detail:   `Catalyst picture reversed. Now ${stance} (${conviction}/10). ${reasoning}`,
        });
        written++;
      }
    } catch (e2) { console.error('[nova] updateStance error:', e2.message); }
  }

  // Global outlook
  const total = tickers.length;
  if (total > 0) {
    let outlook, conviction, reasoning;
    if (bullCount / total >= 0.5) {
      outlook = 'bullish'; conviction = 6;
      reasoning = `${bullCount}/${total} holdings have upcoming catalysts with positive sentiment.`;
    } else if (bearCount / total >= 0.4) {
      outlook = 'bearish'; conviction = 6;
      reasoning = `${bearCount}/${total} holdings showing negative news signals.`;
    } else {
      outlook = 'neutral'; conviction = 4;
      reasoning = `Mixed catalyst picture across holdings.`;
    }
    try { await updateGlobalOutlook(userId, 'nova', { outlook, conviction, reasoning }); } catch {}
  }

  written += await resolveAgentRequests(userId, 'nova', (ticker, q) => {
    const e = earningsMap[ticker];
    const negatives = (newsMap[ticker] || []).filter(a => a.sentiment === 'negative').length;
    if (!e && !negatives) return `No confirmed catalyst or notable news cluster on ${ticker} in the current scan window.`;
    return `${ticker}: ${e ? `earnings ${e.date} (in ${e.daysAway}d${e.estimated ? ', estimated' : ''})` : 'no upcoming earnings within 90 days'}. ${negatives} negative article${negatives === 1 ? '' : 's'} in last 24h.`;
  });

  await maybeGenerateProposal(userId, 'nova');
  return written;
}

// ---------------------------------------------------------------------------
// SAGE — Risk Manager (daily 11am ET)
// ---------------------------------------------------------------------------

async function runSage(userId) {
  const holdings = await getFullHoldings(userId);
  const tickers  = Object.keys(holdings);
  if (!tickers.length) return 0;

  const prices = await fetchPrices(tickers);

  let totalValue    = 0;
  let totalDayChange = 0;
  const values = {};

  for (const ticker of tickers) {
    const q      = prices[ticker];
    const shares = holdings[ticker].shares;
    if (!q || !shares) continue;
    const val        = q.price * shares;
    const dayChange  = (q.changePct / 100) * val;
    values[ticker]   = { val, dayChange, pct: q.changePct };
    totalValue      += val;
    totalDayChange  += dayChange;
  }

  if (totalValue === 0) return 0;

  let written = 0;
  let highRiskCount = 0;

  for (const ticker of tickers) {
    if (!values[ticker]) continue;
    const pct = (values[ticker].val / totalValue) * 100;
    if (pct >= 35) {
      await writeFeed(userId, {
        agentId:  'sage', ticker, severity: 'alert', source: 'cron_sage_concentration',
        headline: `${ticker} is ${pct.toFixed(0)}% of portfolio — critical concentration`,
        detail:   `${ticker} represents ${pct.toFixed(1)}% of total portfolio value ($${values[ticker].val.toFixed(0)} of $${totalValue.toFixed(0)}). A single bad earnings report or sector rotation could cause outsized damage. Consider trimming.`,
      });
      written++;
    } else if (pct >= 25) {
      await writeFeed(userId, {
        agentId:  'sage', ticker, severity: 'warning', source: 'cron_sage_concentration',
        headline: `${ticker} is ${pct.toFixed(0)}% of portfolio — approaching concentration limit`,
        detail:   `${ticker} represents ${pct.toFixed(1)}% of total portfolio value. Above 25% introduces meaningful single-stock risk. Monitor and consider partial trim if conviction has changed.`,
      });
      written++;
    }

    // Stance: risk-level of this position
    const pctN = (values[ticker].val / totalValue) * 100;
    let stance, conviction, reasoning;
    if (pctN >= 35) {
      stance = 'bearish'; conviction = 8;
      reasoning = `${ticker} is ${pctN.toFixed(0)}% of portfolio — critical concentration risk.`;
      highRiskCount++;
    } else if (pctN >= 25) {
      stance = 'neutral'; conviction = 6;
      reasoning = `${ticker} is ${pctN.toFixed(0)}% of portfolio — watch concentration.`;
    } else {
      stance = 'bullish'; conviction = 5;
      reasoning = `${ticker} at ${pctN.toFixed(0)}% — within acceptable risk range.`;
    }

    try {
      const flip = await updateStance(userId, 'sage', ticker, { stance, conviction, reasoning });
      if (flip.flipped) {
        await writeFeed(userId, {
          agentId: 'sage', ticker, severity: 'alert', source: 'cron_sage_flip',
          headline: `SAGE risk assessment flipped ${flip.to.toUpperCase()} on ${ticker} after ${flip.daysSincePrevious} days`,
          detail:   `Concentration risk changed. Now ${stance} (${conviction}/10). ${reasoning}`,
        });
        written++;
      }
    } catch (e) { console.error('[sage] updateStance error:', e.message); }
  }

  const portfolioDayPct = (totalDayChange / (totalValue - totalDayChange)) * 100;
  if (portfolioDayPct <= -3) {
    await writeFeed(userId, {
      agentId:  'sage', ticker: 'PORTFOLIO', severity: 'alert', source: 'cron_sage_drawdown',
      headline: `Portfolio dropped ${Math.abs(portfolioDayPct).toFixed(1)}% today — significant single-day loss`,
      detail:   `Total portfolio lost ${Math.abs(portfolioDayPct).toFixed(1)}% today ($${Math.abs(totalDayChange).toFixed(0)}). Review top losers and check if macro or sector news is driving broad weakness before reacting.`,
    });
    written++;
  }

  // Global outlook
  const portfolioHealth = portfolioDayPct <= -3
    ? { outlook: 'bearish', conviction: 7, reasoning: `Portfolio dropped ${Math.abs(portfolioDayPct).toFixed(1)}% today. ${highRiskCount} concentrated positions.` }
    : highRiskCount > 0
      ? { outlook: 'cautious', conviction: 6, reasoning: `${highRiskCount} position${highRiskCount > 1 ? 's' : ''} at critical concentration. Portfolio otherwise stable.` }
      : { outlook: 'neutral', conviction: 5, reasoning: `Portfolio concentration within limits. No major drawdown today.` };
  try { await updateGlobalOutlook(userId, 'sage', portfolioHealth); } catch {}

  written += await resolveAgentRequests(userId, 'sage', (ticker, q) => {
    const v = values[ticker];
    if (!v) return null;
    const pct = (v.val / totalValue) * 100;
    return `${ticker} is ${pct.toFixed(1)}% of portfolio ($${v.val.toFixed(0)}) — ${pct >= 25 ? 'elevated concentration' : 'within normal risk range'}.`;
  });

  await maybeGenerateProposal(userId, 'sage');
  return written;
}

// ---------------------------------------------------------------------------
// ATLAS — Macro Strategist (9am ET + 5pm ET)
// ---------------------------------------------------------------------------

async function fetchOilChange() {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=USO&token=${process.env.FINNHUB_KEY}`);
    if (!r.ok) return null;
    const q = await r.json();
    return q?.dp || null;
  } catch { return null; }
}

async function runAtlas(userIds) {
  const [macro, oilChangePct] = await Promise.all([fetchMacro(), fetchOilChange()]);
  if (!macro) return 0;

  const events = [];

  const vix     = macro.vix?.current;
  const vixPrev = macro.vix?.previous;
  if (vix != null) {
    if (vix >= 30) {
      events.push({ ticker: 'VIX', severity: 'alert', source: 'cron_atlas_vix',
        headline: `VIX spiked to ${vix.toFixed(1)} — elevated fear in the market`,
        detail:   `VIX at ${vix.toFixed(1)} indicates high market fear. Semis and growth stocks typically underperform in VIX > 30 regimes. Consider defensive positioning or reducing leverage.` });
    } else if (vix >= 25) {
      events.push({ ticker: 'VIX', severity: 'warning', source: 'cron_atlas_vix',
        headline: `VIX at ${vix.toFixed(1)} — macro headwind day`,
        detail:   `VIX above 25 signals elevated volatility. Portfolio may see larger intraday swings. Not a sell signal, but avoid adding aggressive positions today.` });
    }
    if (vixPrev != null && vixPrev > 0) {
      const spike = ((vix - vixPrev) / vixPrev) * 100;
      if (spike >= 15) {
        events.push({ ticker: 'VIX', severity: 'alert', source: 'cron_atlas_vix_spike',
          headline: `VIX jumped ${spike.toFixed(0)}% in one session — fear surge`,
          detail:   `VIX rose from ${vixPrev.toFixed(1)} to ${vix.toFixed(1)} (${spike.toFixed(1)}% spike). Sudden fear expansions often accompany institutional selling. Watch for follow-through.` });
      }
    }
  }

  if (macro.yieldSpread != null) {
    if (macro.yieldInverted) {
      events.push({ ticker: 'YIELDS', severity: 'warning', source: 'cron_atlas_yields',
        headline: `Yield curve inverted — 10Y/2Y spread at ${macro.yieldSpread.toFixed(2)}%`,
        detail:   `10Y/2Y spread of ${macro.yieldSpread.toFixed(2)}% signals inversion. Historically precedes recessions by 6-18 months. Growth stocks (semis, tech) are most exposed to multiple compression in this regime.` });
    } else if (macro.yieldSpread < 0.2) {
      events.push({ ticker: 'YIELDS', severity: 'warning', source: 'cron_atlas_yields',
        headline: `Yield spread flattened to ${macro.yieldSpread.toFixed(2)}% — approaching inversion`,
        detail:   `10Y/2Y spread of ${macro.yieldSpread.toFixed(2)}% is dangerously flat. Further flattening or inversion would be a meaningful recession signal. Monitor weekly.` });
    }
  }

  if (oilChangePct != null && Math.abs(oilChangePct) >= 5) {
    const dir = oilChangePct > 0 ? 'jumped' : 'dropped';
    events.push({ ticker: 'OIL', severity: 'alert', source: 'cron_atlas_oil',
      headline: `Oil ${dir} ${Math.abs(oilChangePct).toFixed(1)}% — geopolitical risk elevated`,
      detail:   `Oil ${dir} ${Math.abs(oilChangePct).toFixed(1)}% today (via USO). Significant oil moves can signal Hormuz/Middle East risk, supply disruptions, or demand shock. Defense names may benefit; semis and growth typically sell off.` });
  }

  if (macro.fedRate?.current != null && macro.fedRate?.previous != null) {
    const delta = +(macro.fedRate.current - macro.fedRate.previous).toFixed(2);
    if (Math.abs(delta) >= 0.25) {
      events.push({ ticker: 'FED', severity: 'warning', source: 'cron_atlas_fed',
        headline: `Fed rate ${delta > 0 ? 'hiked' : 'cut'} to ${macro.fedRate.current.toFixed(2)}% from ${macro.fedRate.previous.toFixed(2)}%`,
        detail:   `Federal funds rate moved ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(2)}% to ${macro.fedRate.current.toFixed(2)}%. ${delta < 0 ? 'Rate cuts are bullish for multiples.' : 'Rate hikes compress tech/growth multiples.'}` });
    }
  }

  if (macro.cpi?.current != null && macro.cpi?.previous != null) {
    const cpiDelta = +(macro.cpi.current - macro.cpi.previous).toFixed(1);
    if (Math.abs(cpiDelta) >= 0.2) {
      events.push({ ticker: 'CPI', severity: 'warning', source: 'cron_atlas_cpi',
        headline: `CPI moved to ${macro.cpi.current.toFixed(1)} — inflation signal updated`,
        detail:   `CPI reading: ${macro.cpi.current.toFixed(1)} (prev: ${macro.cpi.previous.toFixed(1)}). ${cpiDelta > 0 ? 'Rising CPI reduces probability of near-term rate cuts.' : 'Falling CPI increases probability of rate cuts — bullish for growth.'}` });
    }
  }

  // Derive global macro outlook from signals
  const macroSignals = [];
  let macroStance = 'neutral';
  let macroConviction = 4;

  if (vix != null) {
    if (vix >= 30) {
      macroStance = 'bearish';
      macroConviction = Math.min(10, 5 + Math.round((vix - 30) / 5));
      macroSignals.push(`VIX ${vix.toFixed(1)} — fear elevated`);
    } else if (vix >= 25) {
      if (macroStance === 'neutral') macroStance = 'cautious';
      macroConviction = Math.max(macroConviction, 5);
      macroSignals.push(`VIX ${vix.toFixed(1)} — elevated volatility`);
    } else if (vix < 18) {
      if (macroStance === 'neutral') macroStance = 'bullish';
      macroConviction = Math.max(macroConviction, 6);
      macroSignals.push(`VIX ${vix.toFixed(1)} — calm market`);
    }
  }

  if (macro.yieldSpread != null) {
    if (macro.yieldInverted) {
      macroStance = 'bearish';
      macroConviction = Math.max(macroConviction, 7);
      macroSignals.push(`yield curve inverted (${macro.yieldSpread.toFixed(2)}%)`);
    } else if (macro.yieldSpread < 0.2) {
      if (macroStance === 'neutral' || macroStance === 'bullish') macroStance = 'cautious';
      macroConviction = Math.max(macroConviction, 5);
      macroSignals.push(`yield spread flat (${macro.yieldSpread.toFixed(2)}%)`);
    }
  }

  if (oilChangePct != null && oilChangePct >= 5) {
    if (macroStance === 'neutral' || macroStance === 'bullish') macroStance = 'cautious';
    macroConviction = Math.max(macroConviction, 5);
    macroSignals.push(`oil spike +${oilChangePct.toFixed(1)}%`);
  }

  if (macro.fedRate?.current != null && macro.fedRate?.previous != null) {
    const delta = +(macro.fedRate.current - macro.fedRate.previous).toFixed(2);
    if (delta >= 0.25) {
      if (macroStance === 'neutral' || macroStance === 'bullish') macroStance = 'cautious';
      macroConviction = Math.max(macroConviction, 5);
      macroSignals.push(`Fed hiked to ${macro.fedRate.current.toFixed(2)}%`);
    } else if (delta <= -0.25) {
      if (macroStance === 'neutral') { macroStance = 'bullish'; macroConviction = Math.max(macroConviction, 6); }
      macroSignals.push(`Fed cut to ${macro.fedRate.current.toFixed(2)}%`);
    }
  }

  if (macro.cpi?.current != null && macro.cpi?.previous != null) {
    const cpiDelta = +(macro.cpi.current - macro.cpi.previous).toFixed(1);
    if (cpiDelta >= 0.3) {
      if (macroStance === 'neutral' || macroStance === 'bullish') macroStance = 'cautious';
      macroSignals.push(`CPI rising to ${macro.cpi.current.toFixed(1)}`);
    } else if (cpiDelta <= -0.3) {
      if (macroStance === 'neutral') { macroStance = 'bullish'; macroConviction = Math.max(macroConviction, 6); }
      macroSignals.push(`CPI falling to ${macro.cpi.current.toFixed(1)}`);
    }
  }

  const macroReasoning = macroSignals.length
    ? macroSignals.join('; ') + '.'
    : 'No significant macro threshold crossings today.';

  let written = 0;
  for (const userId of userIds) {
    for (const ev of events) {
      await writeFeed(userId, { agentId: 'atlas', ...ev });
      written++;
    }
    try {
      const flip = await updateGlobalOutlook(userId, 'atlas', {
        outlook: macroStance, conviction: macroConviction, reasoning: macroReasoning,
      });
      if (flip.flipped) {
        await writeFeed(userId, {
          agentId: 'atlas', ticker: 'MACRO', severity: 'alert', source: 'cron_atlas_flip',
          headline: `ATLAS flipped macro outlook to ${macroStance.toUpperCase()} from ${flip.from.toUpperCase()}`,
          detail:   `Global macro stance reversed. Now ${macroStance} (${macroConviction}/10). ${macroReasoning}`,
        });
        written++;
      }
    } catch (e) { console.error('[atlas] updateGlobalOutlook error:', e.message); }
    written += await resolveAgentRequests(userId, 'atlas', (ticker, q) =>
      `Macro tape: VIX ${vix?.toFixed(1) ?? 'N/A'}, yield spread ${macro.yieldSpread?.toFixed(2) ?? 'N/A'}%${macro.yieldInverted ? ' (inverted)' : ''}, current stance ${macroStance} (${macroConviction}/10).`
    );
    await maybeGenerateProposal(userId, 'atlas');
  }
  return written;
}

// ---------------------------------------------------------------------------
// VEGA — Devil's Advocate (every 4 hours, offset from REX)
// ---------------------------------------------------------------------------

async function runVega(userId) {
  const tickers = await getTickers(userId);
  if (!tickers.length) return 0;

  const [prices, newsMap] = await Promise.all([fetchPrices(tickers), fetchNews(tickers)]);
  let written = 0;

  // Stale stance check
  const staleItems = await getStaleStances(userId);
  for (const s of staleItems.filter(s => s.agentId === 'vega' && s.ticker !== '_GLOBAL')) {
    const days = s.updatedAt?.toDate ? Math.round((Date.now() - s.updatedAt.toDate().getTime()) / 86400000) : 30;
    if (days >= 32) {
      await writeFeed(userId, {
        agentId: 'vega', ticker: s.ticker, severity: 'info', source: 'cron_vega_stale',
        headline: `VEGA's bear thesis on ${s.ticker} is ${days} days old — re-evaluating`,
        detail:   `Previous: ${s.stance} (${s.conviction}/10). "${s.reasoning?.slice(0, 100)}"`,
      });
      written++;
    }
  }

  let bearCount = 0;
  const vegaTechMap = {}; // ticker -> technicals, kept for cross-agent request answers
  for (const ticker of tickers) {
    const q = prices[ticker];
    if (!q) continue;
    const events = [];

    if (q.changePct <= -5) {
      events.push({ severity: 'alert', source: 'cron_vega_drop',
        headline: `${ticker} down ${Math.abs(q.changePct).toFixed(1)}% today — sharp session drop`,
        detail:   `${ticker} fell ${Math.abs(q.changePct).toFixed(1)}% to $${q.price.toFixed(2)}. This exceeds the -5% bear signal threshold. Check if news or sector selloff is driving this. Do not average down without checking the facts.` });
    }

    const negatives = (newsMap[ticker] || []).filter(a => a.sentiment === 'negative');
    if (negatives.length >= 3) {
      const sampleHeadlines = negatives.slice(0, 2).map(a => `"${a.headline}"`).join(' / ');
      events.push({ severity: 'warning', source: 'cron_vega_news',
        headline: `${negatives.length} negative articles on ${ticker} in last 24h`,
        detail:   `Bear signal: multiple negative articles in last 24h. Sample: ${sampleHeadlines}. Cluster of bad news can precede further weakness — check if fundamentals are impaired.` });
    }

    let tech = null;
    if (q.changePct < 0) {
      tech = await fetchTechnicals(ticker);
      if (tech?.sma50 && tech?.sma200 && q.price < tech.sma50 && q.price < tech.sma200) {
        events.push({ severity: 'alert', source: 'cron_vega_downtrend',
          headline: `${ticker} trading below both SMA50 and SMA200 — confirmed downtrend`,
          detail:   `Price ($${q.price.toFixed(2)}) is below SMA50 ($${tech.sma50.toFixed(2)}) and SMA200 ($${tech.sma200.toFixed(2)}). Confirmed downtrend — do not add to this position without a clear catalyst for reversal.` });
      }
    }
    vegaTechMap[ticker] = tech;

    for (const ev of events) {
      await writeFeed(userId, { agentId: 'vega', ticker, ...ev });
      written++;
    }

    // Derive stance
    const isBearDrop  = q.changePct <= -5;
    const isDowntrend = !!(tech?.sma50 && tech?.sma200 && q.price < tech.sma50 && q.price < tech.sma200);
    const isNegNews   = negatives.length >= 3;

    let stance, conviction, reasoning;
    if (isBearDrop || isDowntrend) {
      stance = 'bearish';
      conviction = (isBearDrop && isDowntrend) ? 8 : 7;
      reasoning = [
        isBearDrop  ? `Down ${Math.abs(q.changePct).toFixed(1)}% today` : null,
        isDowntrend ? `Below SMA50 ($${tech.sma50.toFixed(2)}) and SMA200 ($${tech.sma200.toFixed(2)})` : null,
        isNegNews   ? `${negatives.length} negative articles` : null,
      ].filter(Boolean).join('. ') + '.';
      bearCount++;
    } else if (isNegNews) {
      stance = 'neutral'; conviction = 5;
      reasoning = `${negatives.length} negative news articles but no technical breakdown yet.`;
    } else {
      stance = 'neutral'; conviction = 3;
      reasoning = `No significant bear signals today. Price: $${q.price.toFixed(2)}.`;
    }

    try {
      const flip = await updateStance(userId, 'vega', ticker, { stance, conviction, reasoning });
      if (flip.flipped) {
        await writeFeed(userId, {
          agentId: 'vega', ticker, severity: 'alert', source: 'cron_vega_flip',
          headline: `VEGA flipped ${flip.to.toUpperCase()} on ${ticker} after ${flip.daysSincePrevious} days ${flip.from}`,
          detail:   `Bear thesis reversed. Now ${stance} (${conviction}/10). ${reasoning}`,
        });
        written++;
      }
    } catch (e2) { console.error('[vega] updateStance error:', e2.message); }
  }

  // Global outlook
  const total = tickers.length;
  if (total > 0) {
    const bearPct = bearCount / total;
    let outlook, conviction, reasoning;
    if (bearPct >= 0.5) {
      outlook = 'bearish'; conviction = 7;
      reasoning = `${bearCount}/${total} holdings showing bear signals (downtrend or sharp drop).`;
    } else if (bearPct >= 0.25) {
      outlook = 'cautious'; conviction = 5;
      reasoning = `${bearCount}/${total} holdings flagged — elevated downside risk.`;
    } else {
      outlook = 'neutral'; conviction = 4;
      reasoning = `No widespread bear signals across holdings today.`;
    }
    try { await updateGlobalOutlook(userId, 'vega', { outlook, conviction, reasoning }); } catch {}
  }

  written += await resolveAgentRequests(userId, 'vega', (ticker, q) => {
    const qp = prices[ticker];
    const t = vegaTechMap[ticker];
    if (!qp) return null;
    return `${ticker}: ${qp.changePct?.toFixed(1) ?? 'N/A'}% today. ${t?.sma50 && t?.sma200 ? (qp.price < t.sma50 && qp.price < t.sma200 ? 'Below both SMA50/SMA200 — confirmed downtrend.' : 'Above at least one key moving average.') : 'No fresh technicals pulled this scan.'}`;
  });

  await maybeGenerateProposal(userId, 'vega');
  return written;
}

// ---------------------------------------------------------------------------
// ZEN — Position Sizer (daily 12pm ET)
// ---------------------------------------------------------------------------

async function runZen(userId) {
  const holdings = await getFullHoldings(userId);
  const tickers  = Object.keys(holdings);
  if (tickers.length < 2) return 0;

  const prices = await fetchPrices(tickers);
  const positionValues = {};
  for (const ticker of tickers) {
    const q      = prices[ticker];
    const shares = holdings[ticker].shares;
    if (!q || !shares) continue;
    positionValues[ticker] = q.price * shares;
  }

  const sorted = Object.entries(positionValues).sort(([, a], [, b]) => b - a);
  if (!sorted.length) return 0;

  const totalVal       = Object.values(positionValues).reduce((a, b) => a + b, 0);
  const largestTicker  = sorted[0][0];
  const largestVal     = sorted[0][1];
  const smallestTicker = sorted[sorted.length - 1][0];
  const smallestVal    = sorted[sorted.length - 1][1];
  const sizeRatio      = smallestVal > 0 ? largestVal / smallestVal : 0;

  let written = 0;
  let undersizedCount = 0;

  // Stale stance check
  const staleItems = await getStaleStances(userId);
  for (const s of staleItems.filter(s => s.agentId === 'zen' && s.ticker !== '_GLOBAL')) {
    const days = s.updatedAt?.toDate ? Math.round((Date.now() - s.updatedAt.toDate().getTime()) / 86400000) : 30;
    if (days >= 32) {
      await writeFeed(userId, {
        agentId: 'zen', ticker: s.ticker, severity: 'info', source: 'cron_zen_stale',
        headline: `ZEN's sizing assessment for ${s.ticker} is ${days} days old — refreshing`,
        detail:   `Previous: ${s.stance} (${s.conviction}/10). "${s.reasoning?.slice(0, 100)}"`,
      });
      written++;
    }
  }

  for (const [ticker, val] of Object.entries(positionValues)) {
    if (val < 50) {
      await writeFeed(userId, {
        agentId: 'zen', ticker, severity: 'info', source: 'cron_zen_size',
        headline: `${ticker} position is only $${val.toFixed(0)} — below minimum impact threshold`,
        detail:   `${ticker} is worth $${val.toFixed(0)} — too small to meaningfully affect portfolio performance. Either add to bring it above $100+, or close it and redeploy into higher-conviction names.`,
      });
      written++;
      undersizedCount++;
    }
  }

  if (sizeRatio >= 5) {
    const ratio = sizeRatio.toFixed(0);
    await writeFeed(userId, {
      agentId: 'zen', ticker: largestTicker, severity: 'info', source: 'cron_zen_imbalance',
      headline: `Largest position (${largestTicker}) is ${ratio}x smallest (${smallestTicker}) — rebalance worth considering`,
      detail:   `${largestTicker} ($${largestVal.toFixed(0)}) is ${ratio}x larger than ${smallestTicker} ($${smallestVal.toFixed(0)}). If the imbalance is passive drift, check whether current weighting still matches your conviction.`,
    });
    written++;
  }

  // Per-ticker stances
  for (const [ticker, val] of Object.entries(positionValues)) {
    const pct = totalVal > 0 ? (val / totalVal) * 100 : 0;
    let stance, conviction, reasoning;
    if (val < 50) {
      stance = 'bearish'; conviction = 7;
      reasoning = `Position $${val.toFixed(0)} is below minimum threshold. Close or add to this position.`;
    } else if (sizeRatio >= 5 && val === largestVal) {
      stance = 'neutral'; conviction = 5;
      reasoning = `Largest position at ${pct.toFixed(0)}% — ${sizeRatio.toFixed(0)}x imbalance vs smallest holding.`;
    } else {
      stance = 'bullish'; conviction = 5;
      reasoning = `Position $${val.toFixed(0)} (${pct.toFixed(0)}% of portfolio) — adequately sized.`;
    }
    try {
      const flip = await updateStance(userId, 'zen', ticker, { stance, conviction, reasoning });
      if (flip.flipped) {
        await writeFeed(userId, {
          agentId: 'zen', ticker, severity: 'alert', source: 'cron_zen_flip',
          headline: `ZEN sizing assessment flipped ${flip.to.toUpperCase()} on ${ticker} after ${flip.daysSincePrevious} days`,
          detail:   `Sizing posture changed. Now ${stance} (${conviction}/10). ${reasoning}`,
        });
        written++;
      }
    } catch (e) { console.error('[zen] updateStance error:', e.message); }
  }

  // Global outlook
  const total = Object.keys(positionValues).length;
  if (total > 0) {
    let outlook, conviction, reasoning;
    if (undersizedCount >= 2 || sizeRatio >= 5) {
      outlook = 'cautious'; conviction = 6;
      const parts = [];
      if (undersizedCount > 0) parts.push(`${undersizedCount} undersized position${undersizedCount !== 1 ? 's' : ''}`);
      if (sizeRatio >= 5) parts.push(`${sizeRatio.toFixed(0)}x size imbalance (${largestTicker} vs ${smallestTicker})`);
      reasoning = parts.join(' and ') + ' — portfolio sizing needs attention.';
    } else if (undersizedCount === 1) {
      outlook = 'neutral'; conviction = 5;
      reasoning = `One undersized position — minor cleanup needed. Otherwise balanced.`;
    } else {
      outlook = 'bullish'; conviction = 6;
      reasoning = `All positions adequately sized. Portfolio structure clean.`;
    }
    try { await updateGlobalOutlook(userId, 'zen', { outlook, conviction, reasoning }); } catch {}
  }

  written += await resolveAgentRequests(userId, 'zen', (ticker, q) => {
    const v = positionValues[ticker];
    if (v == null) return null;
    const pct = totalVal > 0 ? (v / totalVal) * 100 : 0;
    return `${ticker} position is $${v.toFixed(0)} (${pct.toFixed(1)}% of portfolio) — ${v < 50 ? 'below minimum impact threshold' : 'adequately sized'}.`;
  });

  await maybeGenerateProposal(userId, 'zen');
  return written;
}

// ---------------------------------------------------------------------------
// WEEKLY COUNCIL — runs all 6 agents on every holding, Monday 8am ET
// ---------------------------------------------------------------------------

async function runWeeklyCouncil(userIds) {
  if (!userIds.length) return 0;
  const primaryUserId = userIds[0];

  // 1. Gather holdings per user
  const userHoldings = {};
  for (const userId of userIds) {
    userHoldings[userId] = await getFullHoldings(userId);
  }

  // 2. Unique tickers across all portfolios
  const uniqueTickers = [...new Set(Object.values(userHoldings).flatMap(h => Object.keys(h)))];
  if (!uniqueTickers.length) return 0;
  console.error(`[weekly-council] ${uniqueTickers.length} unique tickers across ${userIds.length} portfolios`);

  // 3. Bulk pre-fetch (parallel, once for all tickers)
  const [prices, newsMap, earningsList, macro, globalOutlooks] = await Promise.all([
    fetchPrices(uniqueTickers),
    fetchNews(uniqueTickers),
    fetchEarnings(uniqueTickers),
    fetchMacro(),
    getAllGlobalOutlooks(primaryUserId),
  ]);

  const macroLine = macro
    ? `VIX ${macro.vix?.current?.toFixed(1) ?? 'N/A'}${(macro.vix?.current ?? 0) >= 25 ? ' (elevated)' : ''}, Yield ${macro.yieldSpread?.toFixed(2) ?? 'N/A'}%${macro.yieldInverted ? ' INVERTED' : ''}, Fed ${macro.fedRate?.current?.toFixed(2) ?? 'N/A'}%`
    : 'Macro unavailable';

  const globalOutlookLine = Object.entries(globalOutlooks)
    .map(([id, o]) => `${id.toUpperCase()}: ${o.stance} ${o.conviction}/10`)
    .join(' | ');

  // 3b. Research phase — each agent researches its domain once before the debate; every
  // agent's findings are shared with the whole council for every ticker below, so agents
  // build on each other's research instead of analyzing in isolation.
  const holdingsLine = uniqueTickers.join(', ');
  const researchNotes = {};
  for (let i = 0; i < WEEKLY_AGENT_DEFS.length; i++) {
    const ag = WEEKLY_AGENT_DEFS[i];
    const sys = `You are ${ag.name}, ${ag.role} on an investment council. Before today's council, research the latest developments relevant to your specialty (${ag.focus}).`;
    const msg = `Current holdings: ${holdingsLine}\nCurrent market conditions: ${macroLine}\n\nWhat have you learned recently that the council should know? Focus on new patterns or signals relevant to our holdings, risks other agents might not see from their angle, opportunities worth investigating, and anything you've been wrong about recently. Be specific to our actual holdings — plain text, 3-4 sentences, no JSON, no markdown.`;
    try {
      const note = await callGroq(sys, msg, i);
      researchNotes[ag.id] = (note || '').trim().slice(0, 500);
    } catch (e) {
      console.error(`[weekly-council] research phase failed for ${ag.name}:`, e.message);
      researchNotes[ag.id] = '';
    }
    await sleep(400);
  }
  const researchBlock = WEEKLY_AGENT_DEFS
    .map(ag => researchNotes[ag.id] ? `${ag.name}: ${researchNotes[ag.id]}` : null)
    .filter(Boolean).join('\n');
  console.error(`[weekly-council] research phase complete — ${Object.values(researchNotes).filter(Boolean).length}/6 notes filed`);

  // Self-improvement awareness (Part 5) — tell each agent if a proposal it filed was
  // reviewed since its last run, computed once and reused for every ticker below.
  const awarenessLines = {};
  for (const ag of WEEKLY_AGENT_DEFS) {
    awarenessLines[ag.id] = await getProposalAwareness(primaryUserId, ag.id);
  }

  // Cross-agent requests filed during this week's debate (Part 6 teamwork)
  const weeklyRequests = [];

  // 4. Agent + AXIOM cache keyed by ticker (shared across all portfolios for same stock)
  const agentTakesCache = {};
  const axiomCache = {};

  for (const ticker of uniqueTickers) {
    console.error(`[weekly-council] Processing ${ticker}…`);

    // Per-ticker: technicals (may be rate-limited) + memory stances
    const [tech, tickerStances] = await Promise.all([
      fetchTechnicals(ticker).catch(() => null),
      getAllStances(primaryUserId, ticker),
    ]);

    const q = prices[ticker];
    const tickerEarnings = earningsList.find(e => e.ticker === ticker) || null;
    const tickerNews = newsMap[ticker] || [];

    const priceStr = q?.price
      ? `$${q.price.toFixed(2)}${q.changePct != null ? ` (${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(1)}% today)` : ''}`
      : 'N/A';
    const earningsStr = tickerEarnings
      ? `Earnings: ${tickerEarnings.date} (in ${tickerEarnings.daysAway} days${tickerEarnings.estimated ? ', est.' : ''})`
      : 'No upcoming earnings within 90 days';
    const techStr = tech ? [
      tech.rsi != null ? `RSI ${tech.rsi.toFixed(0)}${tech.rsi > 70 ? ' (overbought)' : tech.rsi < 30 ? ' (oversold)' : ''}` : null,
      tech.macdBullish != null ? `MACD ${tech.macdBullish ? 'bullish' : 'bearish'} crossover` : null,
      tech.sma50 && tech.sma200 ? `SMA50 $${tech.sma50.toFixed(2)} | SMA200 $${tech.sma200.toFixed(2)}` : null,
      tech.goldenCross ? 'GOLDEN CROSS ✓' : tech.deathCross ? 'DEATH CROSS ⚠' : null,
    ].filter(Boolean).join(' · ') : 'Technicals unavailable';
    const newsStr = tickerNews.length
      ? tickerNews.slice(0, 5).map(a => `[${a.date}] ${a.headline} (${a.source})`).join('\n')
      : 'No recent news';

    const priorStr = Object.entries(tickerStances)
      .map(([id, s]) => `${id.toUpperCase()}: ${s.stance} (${s.conviction}/10) — "${s.reasoning?.slice(0, 80) ?? ''}"`)
      .join('\n');

    const reconBlock = [
      `TICKER: ${ticker} | Price: ${priceStr}`,
      `Technicals: ${techStr}`,
      earningsStr,
      `Macro: ${macroLine}`,
      `Recent news:\n${newsStr}`,
      priorStr   ? `\nPrior stances on ${ticker}:\n${priorStr}` : '',
      globalOutlookLine ? `Global outlooks: ${globalOutlookLine}` : '',
    ].filter(Boolean).join('\n');

    // 4a. Run all 6 agents
    const agentTakes = [];
    for (let i = 0; i < WEEKLY_AGENT_DEFS.length; i++) {
      const ag = WEEKLY_AGENT_DEFS[i];
      const sys = `You are ${ag.name}, ${ag.role}. Focus on: ${ag.focus}.
${awarenessLines[ag.id] ? `\n${awarenessLines[ag.id]}\n` : ''}
WEEKLY COUNCIL — assessing an EXISTING portfolio position (not a new trade).
Verdicts: HOLD (keep as-is) | ADD (increase position) | TRIM (reduce exposure) | EXIT (close entirely — thesis broken).
If you need information from another specialist to sharpen this verdict, append exactly one line to the END of your reasoning in the form: REQUEST_FROM:<agentid>: <question> — where <agentid> is one of rex, nova, sage, atlas, vega, zen (not yourself). Only do this when a real gap exists.
Return ONLY valid JSON, no markdown:
{"agent":"${ag.name}","stance":"bullish|bearish|neutral","conviction":1-10,"verdict":"HOLD|ADD|TRIM|EXIT","reasoning":"2-3 sentences"}`;

      const msg = `WEEKLY COUNCIL ASSESSMENT\n\n${reconBlock}${researchBlock ? `\n\nCOUNCIL RESEARCH THIS WEEK (from all 6 specialists):\n${researchBlock}` : ''}\n\nAs ${ag.name}, give your verdict on ${ticker} as an existing holding.`;

      let take = null;
      try {
        take = extractSimpleJSON(await callGroq(sys, msg, i));
      } catch (e) {
        if (e.message?.includes('429')) {
          console.error(`[weekly-council] 429 on ${ticker}/${ag.name}, retrying after 10s…`);
          await sleep(10000);
          try { take = extractSimpleJSON(await callGroq(sys, msg, i)); } catch {}
        }
      }
      const resolved = take || { agent: ag.name, stance: 'neutral', conviction: 5, verdict: 'HOLD', reasoning: 'Agent unavailable this week.' };

      // Parse + strip any cross-agent request the agent embedded in its reasoning
      const req = extractAgentRequest(resolved.reasoning);
      if (req && req.toAgent !== ag.id) {
        resolved.reasoning = resolved.reasoning.replace(/REQUEST_FROM:\s*\w+\s*:\s*.+$/i, '').trim();
        weeklyRequests.push({ fromAgent: ag.id, toAgent: req.toAgent, question: req.question, ticker });
      }

      agentTakes.push(resolved);
      console.error(`[weekly-council]   ${ticker}/${ag.name} → ${resolved.verdict}`);
      await sleep(500);
    }

    agentTakesCache[ticker] = agentTakes;

    // 4b. AXIOM synthesis
    const axiomSys = `You are AXIOM, weekly council orchestrator. Synthesize 6 specialist assessments of an existing position.
Final verdicts: HOLD (no action) | ADD (increase) | TRIM (reduce) | EXIT (close — thesis broken).
Return ONLY valid JSON:
{"ticker":"${ticker}","finalVerdict":"HOLD|ADD|TRIM|EXIT","confidence":1-10,"summary":"2-3 sentence consensus","dissent":"AGENT (stance X/10): concern — or empty string if unanimous"}`;

    const axiomMsg = `${ticker} weekly council:\n${agentTakes.map(t => `${t.agent}: ${t.stance} (${t.conviction}/10) → ${t.verdict} — "${t.reasoning}"`).join('\n')}\n\nDeliver the final weekly verdict.`;

    try {
      await sleep(500);
      const parsed = extractSimpleJSON(await callGroq(axiomSys, axiomMsg, WEEKLY_AGENT_DEFS.length));
      axiomCache[ticker] = parsed || { ticker, finalVerdict: 'HOLD', confidence: 5, summary: 'Synthesis unavailable.', dissent: '' };
    } catch {
      axiomCache[ticker] = { ticker, finalVerdict: 'HOLD', confidence: 5, summary: 'AXIOM synthesis failed — defaulting HOLD.', dissent: '' };
    }

    // 4c. Update agent memory with weekly council stances
    for (const take of agentTakes) {
      const agDef = WEEKLY_AGENT_DEFS.find(a => a.name === take.agent);
      if (!agDef) continue;
      for (const userId of userIds) {
        try { await updateStance(userId, agDef.id, ticker, { stance: take.stance, conviction: take.conviction, reasoning: take.reasoning }); } catch {}
      }
    }

    console.error(`[weekly-council] ${ticker} ✓ → ${axiomCache[ticker].finalVerdict}`);
  }

  // 4d. File cross-agent requests raised during the debate — resolved by the target
  // agent's own solo cron run the next time it scans that ticker (see resolveAgentRequests).
  if (weeklyRequests.length) {
    console.error(`[weekly-council] ${weeklyRequests.length} cross-agent request(s) filed`);
    for (const userId of userIds) {
      for (const r of weeklyRequests) {
        try {
          await db.collection(`users/${userId}/agent_requests`).add({
            fromAgent: r.fromAgent, toAgent: r.toAgent, question: r.question, ticker: r.ticker,
            status: 'pending', createdAt: FieldValue.serverTimestamp(),
          });
        } catch (e) { console.error('[weekly-council] agent_requests write failed:', e.message); }
      }
    }
  }

  // 5. Build and save per-user reports + feed items
  let totalWritten = 0;
  for (let ui = 0; ui < userIds.length; ui++) {
    const userId = userIds[ui];
    const userTickers = Object.keys(userHoldings[userId]);

    const results = {};
    for (const ticker of userTickers) {
      if (axiomCache[ticker]) {
        results[ticker] = { ...axiomCache[ticker], agentTakes: agentTakesCache[ticker] || [] };
      }
    }

    // Verdict summary counts
    const vc = { HOLD: 0, ADD: 0, TRIM: 0, EXIT: 0 };
    for (const r of Object.values(results)) vc[r.finalVerdict] = (vc[r.finalVerdict] || 0) + 1;
    const trimTickers = userTickers.filter(t => results[t]?.finalVerdict === 'TRIM');
    const exitTickers  = userTickers.filter(t => results[t]?.finalVerdict === 'EXIT');
    const vcParts = ['HOLD','ADD','TRIM','EXIT'].filter(k => vc[k] > 0).map(k => `${vc[k]} ${k}`);
    const overallSummary = `Weekly council: ${vcParts.join(', ')}.`
      + (trimTickers.length ? ` TRIM flagged: ${trimTickers.join(', ')}.` : '')
      + (exitTickers.length  ? ` EXIT signals: ${exitTickers.join(', ')}.`  : '')
      + (!trimTickers.length && !exitTickers.length ? ' Portfolio in good shape — no major actions needed.' : '');

    const portfolioLabel = PORTFOLIO_LABELS[ui] || `Portfolio ${ui + 1}`;

    try {
      await db.collection(`users/${userId}/council_reports`).add({
        portfolioLabel,
        createdAt: FieldValue.serverTimestamp(),
        holdings: userTickers,
        results,
        overallSummary,
      });
    } catch (e) { console.error(`[weekly-council] Report save failed ${userId}:`, e.message); }

    // Feed notification
    try {
      await writeFeed(userId, {
        agentId: 'axiom',
        ticker: null,
        tickers: userTickers,
        severity: exitTickers.length > 0 ? 'alert' : 'warning',
        source: 'weekly_council',
        headline: `Weekly Council Complete — ${vcParts.join(', ')}`,
        detail: overallSummary,
      });
      totalWritten++;
    } catch (e) { console.error(`[weekly-council] Feed write failed ${userId}:`, e.message); }
  }

  return totalWritten;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

const AGENTS = new Set(['rex', 'nova', 'sage', 'atlas', 'vega', 'zen', 'weekly-council']);

export default async function handler(req, res) {
  // Log every incoming request unconditionally, before auth, so we can tell "never called"
  // apart from "called but rejected" in Vercel's function logs.
  console.error(`[cron/agents] incoming request: method=${req.method} agent=${req.query?.agent || '(none)'} authHeaderPresent=${!!req.headers.authorization}`);

  if (!verifyCron(req)) return res.status(401).json({ error: 'Unauthorized' });

  const agent = (req.query?.agent || '').toLowerCase();
  if (!agent || !AGENTS.has(agent)) {
    return res.status(400).json({ error: `Invalid or missing ?agent param. Must be one of: ${[...AGENTS].join(', ')}` });
  }

  const userIds = getUsers();
  if (!userIds.length) return res.status(200).json({ ok: true, agent, skipped: 'no CRON_USER_IDS configured' });

  console.log(`[cron/agents] Starting ${agent.toUpperCase()} for ${userIds.length} user(s)`);

  let total  = 0;
  const errors = [];

  try {
    if (agent === 'atlas' || agent === 'weekly-council') {
      // These run once for all users together
      total = agent === 'atlas'
        ? await runAtlas(userIds)
        : await runWeeklyCouncil(userIds);
    } else {
      for (const userId of userIds) {
        try {
          let n = 0;
          if (agent === 'rex')  n = await runRex(userId);
          if (agent === 'nova') n = await runNova(userId);
          if (agent === 'sage') n = await runSage(userId);
          if (agent === 'vega') n = await runVega(userId);
          if (agent === 'zen')  n = await runZen(userId);
          total += n;
        } catch (e) {
          console.error(`[cron/agents] ${agent} error for user ${userId}:`, e.message);
          errors.push(`user ${userId}: ${e.message}`);
        }
      }
    }
  } catch (e) {
    console.error(`[cron/agents] ${agent} fatal error:`, e.message);
    return res.status(500).json({ ok: false, agent, error: e.message });
  }

  console.log(`[cron/agents] ${agent.toUpperCase()} done. ${total} items written. Errors: ${errors.length}`);
  res.status(200).json({ ok: true, agent, written: total, errors });
}
