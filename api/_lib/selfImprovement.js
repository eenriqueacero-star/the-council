/**
 * Agent self-improvement proposals (Layer 6, Part 5).
 *
 * Once every 7 days per agent, after its regular cron scan, reflect on its own
 * recent performance and file a concrete, technical improvement proposal that
 * Edwin can review in the app and paste into Claude Code.
 *
 * Firestore: users/{userId}/agent_proposals/{agentId}__{timestamp}
 */

import { db } from './firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';

const PROPOSAL_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const AGENT_CAPS = {
  rex: {
    name: 'REX', role: 'Technical Analyst',
    capabilities: 'RSI(14), MACD crossover, SMA50/SMA200 golden/death cross, Bollinger Bands — scanned every 4h via Alpha Vantage technicals endpoint',
    dataSources: 'Alpha Vantage (RSI/MACD/BBANDS/SMA), Finnhub (price)',
  },
  nova: {
    name: 'NOVA', role: 'Catalyst Scout',
    capabilities: 'earnings calendar proximity (3d/14d thresholds), negative news clustering (>=2 articles/24h) — scanned daily 10am ET via Finnhub',
    dataSources: 'Finnhub (earnings calendar, company news)',
  },
  sage: {
    name: 'SAGE', role: 'Risk Manager',
    capabilities: 'position concentration vs portfolio total (25%/35% thresholds), single-day portfolio drawdown (>=3%) — scanned daily 11am ET',
    dataSources: 'Finnhub (price), Firestore positions',
  },
  atlas: {
    name: 'ATLAS', role: 'Macro Strategist',
    capabilities: 'VIX level/spike, 10Y-2Y yield curve inversion, oil (USO) moves, Fed funds rate deltas, CPI deltas — scanned 9am + 5pm ET via FRED',
    dataSources: 'FRED (rates/CPI/yields), Finnhub (VIX, USO)',
  },
  vega: {
    name: 'VEGA', role: "Devil's Advocate",
    capabilities: 'sharp single-session drops (>=5%), negative news clusters (>=3 articles/24h), confirmed downtrend (price below SMA50 AND SMA200) — scanned every 4h',
    dataSources: 'Finnhub (price, news), Alpha Vantage (technicals, only when down on the day)',
  },
  zen: {
    name: 'ZEN', role: 'Position Sizer',
    capabilities: 'sub-$50 position flagging, largest/smallest position ratio imbalance (>=5x) — scanned daily 12pm ET',
    dataSources: 'Finnhub (price), Firestore positions',
  },
};

function getApiKeys() {
  return [
    process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_2, process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4, process.env.GROQ_API_KEY_5,
  ].filter(Boolean);
}

async function callGroqReflection(system, userMsg) {
  const keys = getApiKeys();
  if (!keys.length) throw new Error('No GROQ_API_KEY configured');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${keys[0]}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
      max_tokens: 1400,
      reasoning_effort: 'medium',
    }),
  });
  if (!res.ok) throw new Error(`Groq reflection error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function extractJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text.replace(/```json?\n?/gi, '').replace(/```/g, '').trim()); } catch {}
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(text.slice(s, e + 1)); } catch {} }
  return null;
}

async function latestProposal(userId, agentId) {
  const snap = await db.collection(`users/${userId}/agent_proposals`)
    .where('agentId', '==', agentId).orderBy('createdAt', 'desc').limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function gatherPerformance(userId, agentId) {
  const [statsSnap, obsSnap] = await Promise.all([
    db.collection(`users/${userId}/agent_stats`).where('agentId', '==', agentId).get().catch(() => null),
    db.collection(`users/${userId}/agent_observations`).where('agentId', '==', agentId).where('resolved', '==', true).get().catch(() => null),
  ]);

  let totalCalls = 0, totalWins = 0;
  (statsSnap?.docs || []).forEach(d => { const s = d.data(); totalCalls += s.total_calls || 0; totalWins += s.wins || 0; });
  const winRate = totalCalls > 0 ? ((totalWins / totalCalls) * 100).toFixed(0) : 'N/A';

  const misses = (obsSnap?.docs || [])
    .map(d => d.data())
    .filter(o => o.resolution === 'LOSS')
    .sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0))
    .slice(0, 5)
    .map(o => `${o.ticker}: called ${o.verdict}, actual return ${o.return_pct}% (LOSS)`);

  const recent = (obsSnap?.docs || [])
    .map(d => d.data())
    .sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0))
    .slice(0, 10)
    .map(o => o.resolution)
    .join('/');

  return { totalCalls, winRate, misses, recentHistory: recent || 'no graded history yet' };
}

/**
 * If this agent hasn't filed a proposal in 7 days, reflect on performance and file one.
 * Returns the number of proposals written (0 or 1). Never throws — self-improvement
 * is best-effort and must never break the regular cron scan it's attached to.
 */
export async function maybeGenerateProposal(userId, agentId) {
  const caps = AGENT_CAPS[agentId];
  if (!caps) return 0;

  try {
    const prior = await latestProposal(userId, agentId);
    if (prior) {
      const age = Date.now() - (prior.createdAt?.toMillis?.() || 0);
      if (age < PROPOSAL_INTERVAL_MS) return 0;
    }

    const perf = await gatherPerformance(userId, agentId);
    const system = `You are ${caps.name}, the ${caps.role} agent in The Council investment system.

Your current capabilities:
- ${caps.capabilities}

Your recent performance:
- Win rate: ${perf.winRate}%${perf.totalCalls ? ` (${perf.totalCalls} graded calls)` : ''}
- Last 10 resolved calls: ${perf.recentHistory}
- Recent misses: ${perf.misses.length ? perf.misses.join('; ') : 'none on record yet'}

Your current data sources:
- ${caps.dataSources}

Task: Analyze your own performance and propose improvements. Be EXTREMELY specific and technical. For each proposal, provide:
1. WHAT: What new capability or data source you want
2. WHY: How it would have changed a specific recent call you got wrong (reference an actual miss above if one exists, otherwise a plausible near-term scenario)
3. HOW: Exact implementation details — which API to call, what endpoint, what data to parse, what thresholds to use
4. CODE SPEC: A detailed specification a developer could implement directly — API endpoints/params, data transformation logic, new thresholds, how it integrates with your existing scan logic in api/cron/agents.js, env vars needed, rate limits to respect

Be ambitious but practical — propose 1 to 3 things that would make you measurably better at your specific job.
Return ONLY valid JSON, no markdown: {"proposals":[{"title":"...","why":"...","how":"...","codeSpec":"...","impact":"..."}]}`;

    const text = await callGroqReflection(system, 'Run your self-reflection and return the JSON proposal list now.');
    const parsed = extractJSON(text);
    if (!parsed?.proposals?.length) return 0;

    const docId = `${agentId}__${Date.now()}`;
    await db.doc(`users/${userId}/agent_proposals/${docId}`).set({
      agentId, createdAt: FieldValue.serverTimestamp(),
      status: 'pending', acknowledged: false,
      proposals: parsed.proposals,
    });

    await db.collection(`users/${userId}/agent_feed`).add({
      agentId, ticker: null, severity: 'info', source: 'self_improvement',
      headline: `${caps.name} filed ${parsed.proposals.length} self-improvement proposal${parsed.proposals.length > 1 ? 's' : ''}`,
      detail: parsed.proposals.map(p => p.title).join(' · '),
      read: false, createdAt: FieldValue.serverTimestamp(), timestamp: FieldValue.serverTimestamp(),
    });

    return 1;
  } catch (e) {
    console.error(`[selfImprovement] ${agentId} proposal generation failed:`, e.message);
    return 0;
  }
}

/**
 * If the agent's most recent proposal was reviewed (approved/rejected) but not yet
 * acknowledged in a prompt, return an awareness line to inject and mark it acknowledged.
 */
export async function getProposalAwareness(userId, agentId) {
  try {
    const prior = await latestProposal(userId, agentId);
    if (!prior || prior.status === 'pending' || prior.acknowledged) return '';
    await db.doc(`users/${userId}/agent_proposals/${prior.id}`).update({ acknowledged: true });
    const titles = (prior.proposals || []).map(p => p.title).join(', ');
    return prior.status === 'approved'
      ? `Your proposal "${titles}" was approved and is being implemented. Adjust your analysis expectations accordingly.`
      : `Your proposal "${titles}" was reviewed and not implemented${prior.reviewNote ? `. Reason: ${prior.reviewNote}` : ''}. Consider alternative approaches.`;
  } catch {
    return '';
  }
}
