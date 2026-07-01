/**
 * Living Knowledge Network — client-side view layer.
 *
 * Pure functions that turn existing Firestore collections (agent_feed, agent_memory,
 * agent_stats, council_reports) plus live quotes into a { nodes, edges } graph.
 * No new Firestore writes happen here — this is a VIEW over data that already exists
 * for Layers 1-4.
 */

import { AGENTS, AXIOM_AVATAR, AGENT_SHORT_ID } from '../constants/agents.js';

const SEVERITY_COLOR = { alert: '#EF4444', warning: '#F59E0B', info: '#71717A' };
const STANCE_COLOR    = { bullish: '#22C55E', bearish: '#EF4444', neutral: '#71717A', cautious: '#F59E0B' };
const VERDICT_COLOR   = { HOLD: '#22C55E', ADD: '#3B82F6', TRIM: '#F59E0B', EXIT: '#EF4444' };

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function severityColor(sev) { return SEVERITY_COLOR[sev] || SEVERITY_COLOR.info; }
export function stanceColor(stance) { return STANCE_COLOR[stance] || STANCE_COLOR.neutral; }
export function verdictColor(v) { return VERDICT_COLOR[v] || '#71717A'; }

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return 0;
}

/**
 * Build the full node/edge graph.
 *
 * @param {object} p
 * @param {object[]} p.feedItems   — recent users/{uid}/agent_feed docs (already limited/sorted)
 * @param {object}   p.memoryDocs  — { "agentId__TICKER": {...} } from users/{uid}/agent_memory
 * @param {object}   p.agentStats  — { "agentId_TICKER": {...} } from users/{uid}/agent_stats
 * @param {object[]} p.reports     — recent users/{uid}/council_reports docs (newest first)
 * @param {string[]} p.holdings    — tickers in the active account
 * @param {object}   p.quotes      — { TICKER: { price, changePct } }
 * @param {object}   p.proposalCounts — { agentId: pendingCount }
 */
export function buildNetworkData({ feedItems = [], memoryDocs = {}, agentStats = {}, reports = [], holdings = [], quotes = {}, proposalCounts = {} }) {
  const nodes = [];
  const edges = [];
  const now = Date.now();

  const agentNode = shortId => nodes.find(n => n.id === `agent_${shortId}`);

  // ---- Agent nodes (6 + AXIOM) — always present -----------------------------
  // Graph node identity uses the SHORT cron id (rex/nova/...) since that's the namespace
  // agent_feed/agent_memory/agent_proposals/agent_requests are keyed by. agent_stats (win
  // rate) is the one exception — it's written by the Layer-0 learning system using the
  // LONG AGENTS[].id, so that lookup alone uses ag.id via AGENT_SHORT_ID's inverse.
  AGENTS.forEach(ag => {
    const shortId = AGENT_SHORT_ID[ag.id];
    // Aggregate this agent's win rate + call volume across all tickers
    let totalCalls = 0, totalWins = 0;
    Object.values(agentStats).forEach(s => {
      if (s.agentId !== ag.id) return;
      totalCalls += s.total_calls || 0;
      totalWins  += s.wins || 0;
    });
    const winRate = totalCalls > 0 ? totalWins / totalCalls : null;
    const globalOutlook = memoryDocs[`${shortId}___GLOBAL`] || null;

    nodes.push({
      id: `agent_${shortId}`, type: 'agent', refId: shortId,
      label: ag.name, detail: ag.role,
      color: ag.color, avatar: ag.avatar,
      size: 1.4 + Math.min(1.2, totalCalls / 25) + (winRate != null ? winRate * 0.6 : 0),
      metadata: {
        agentId: shortId, longId: ag.id, name: ag.name, role: ag.role, avatar: ag.avatar,
        winRate, totalCalls, globalOutlook: globalOutlook?.stance || null,
        globalConviction: globalOutlook?.conviction || null,
        pendingProposals: proposalCounts[shortId] || 0,
      },
    });
  });

  nodes.push({
    id: 'axiom', type: 'agent', refId: 'axiom',
    label: 'AXIOM', detail: 'Chair — Synthesis',
    color: '#F59E0B', avatar: AXIOM_AVATAR,
    size: 2.2,
    metadata: { agentId: 'axiom', name: 'AXIOM', role: 'Chair — Synthesis', avatar: AXIOM_AVATAR, hub: true },
  });
  // AXIOM anchors to every agent — the hub
  AGENTS.forEach(ag => {
    const shortId = AGENT_SHORT_ID[ag.id];
    edges.push({ id: `axiom-${shortId}`, source: 'axiom', target: `agent_${shortId}`, kind: 'hub', strength: 0.4 });
  });

  // ---- Holding nodes — one per ticker in the active account ------------------
  const stanceByTicker = {}; // ticker -> [{ agentId, stance, conviction }]
  Object.entries(memoryDocs).forEach(([key, doc]) => {
    if (!doc || doc.ticker === '_GLOBAL') return;
    const [agentId] = key.split('__');
    if (!stanceByTicker[doc.ticker]) stanceByTicker[doc.ticker] = [];
    stanceByTicker[doc.ticker].push({ agentId, stance: doc.stance, conviction: doc.conviction, reasoning: doc.reasoning, updatedAt: doc.updatedAt });
  });

  holdings.forEach(ticker => {
    const q = quotes[ticker] || {};
    const stances = stanceByTicker[ticker] || [];
    const bull = stances.filter(s => s.stance === 'bullish').length;
    const bear = stances.filter(s => s.stance === 'bearish').length;
    const color = bull > bear ? '#22C55E' : bear > bull ? '#EF4444' : '#71717A';

    nodes.push({
      id: `holding_${ticker}`, type: 'holding', refId: ticker,
      label: ticker, detail: `${bull} bullish / ${bear} bearish`,
      color, size: 1.5,
      metadata: { ticker, price: q.price ?? null, dayChange: q.changePct ?? null, consensusStance: color === '#22C55E' ? 'BULLISH' : color === '#EF4444' ? 'BEARISH' : 'SPLIT', stances },
    });

    // Agent -> Holding edges exist wherever a stance is on record
    stances.forEach(s => {
      edges.push({
        id: `agent_${s.agentId}-holding_${ticker}`,
        source: `agent_${s.agentId}`, target: `holding_${ticker}`,
        kind: 'stance', strength: 0.5,
        metadata: { stance: s.stance, conviction: s.conviction, reasoning: s.reasoning },
        color: stanceColor(s.stance),
      });
    });
  });

  // Attach each agent's own per-ticker stance list to its node (for the agent info panel)
  AGENTS.forEach(ag => {
    const shortId = AGENT_SHORT_ID[ag.id];
    const n = agentNode(shortId);
    if (!n) return;
    n.metadata.stances = Object.entries(stanceByTicker)
      .map(([ticker, list]) => ({ ticker, ...list.find(s => s.agentId === shortId) }))
      .filter(s => s.stance);
  });

  // Agent <-> Agent edges — agents who analyzed the same stock, stronger when they disagree
  holdings.forEach(ticker => {
    const stances = stanceByTicker[ticker] || [];
    for (let i = 0; i < stances.length; i++) {
      for (let j = i + 1; j < stances.length; j++) {
        const a = stances[i], b = stances[j];
        const disagree = (a.stance === 'bullish' && b.stance === 'bearish') || (a.stance === 'bearish' && b.stance === 'bullish');
        const id = [a.agentId, b.agentId].sort().join('-') + '-agree';
        const existing = edges.find(e => e.id === id);
        if (existing) {
          existing.metadata.tickers.push(ticker);
          if (disagree) existing.metadata.disagreements++;
        } else {
          edges.push({
            id, source: `agent_${a.agentId}`, target: `agent_${b.agentId}`,
            kind: 'agent-agent', strength: 0.15,
            metadata: { tickers: [ticker], disagreements: disagree ? 1 : 0 },
          });
        }
      }
    }
  });

  // ---- Event nodes — from recent agent_feed (last 7 days), size shrinks with age -----
  feedItems.forEach(item => {
    const created = toMillis(item.createdAt || item.timestamp);
    const ageMs = now - created;
    if (created && ageMs > SEVEN_DAYS_MS) return; // auto-hide after 7 days
    const ageFrac = created ? Math.max(0, 1 - ageMs / SEVEN_DAYS_MS) : 0.5;

    const nodeId = `event_${item.id}`;
    nodes.push({
      id: nodeId, type: 'event', refId: item.id,
      label: (item.headline || '').slice(0, 24), detail: item.headline,
      color: severityColor(item.severity), size: 0.5 + ageFrac * 0.6,
      metadata: { ...item },
    });

    if (item.agentId && agentNode(item.agentId)) {
      edges.push({ id: `agent_${item.agentId}-${nodeId}`, source: `agent_${item.agentId}`, target: nodeId, kind: 'detected', strength: 0.6, color: severityColor(item.severity) });
    }
    const evTickers = item.tickers?.length ? item.tickers : (item.ticker ? [item.ticker] : []);
    evTickers.forEach(t => {
      if (nodes.find(n => n.id === `holding_${t}`)) {
        edges.push({ id: `${nodeId}-holding_${t}`, source: nodeId, target: `holding_${t}`, kind: 'about', strength: 0.35 });
      }
    });
  });

  // ---- Insight nodes — from recent council_reports ---------------------------
  reports.forEach(report => {
    Object.entries(report.results || {}).forEach(([ticker, r]) => {
      if (!nodes.find(n => n.id === `holding_${ticker}`)) return;
      const nodeId = `insight_${report.id}_${ticker}`;
      nodes.push({
        id: nodeId, type: 'insight', refId: `${report.id}_${ticker}`,
        label: `${r.finalVerdict} ${ticker}`, detail: r.summary,
        color: verdictColor(r.finalVerdict), size: 0.8 + (r.confidence || 5) / 10,
        metadata: { ticker, verdict: r.finalVerdict, conviction: r.confidence, summary: r.summary, dissent: r.dissent, agentTakes: r.agentTakes, createdAt: report.createdAt, portfolioLabel: report.portfolioLabel },
      });
      edges.push({ id: `${nodeId}-holding_${ticker}`, source: nodeId, target: `holding_${ticker}`, kind: 'insight', strength: 0.5, color: verdictColor(r.finalVerdict) });
      edges.push({ id: `axiom-${nodeId}`, source: 'axiom', target: nodeId, kind: 'verdict', strength: 0.3 });
    });
  });

  return { nodes, edges };
}
