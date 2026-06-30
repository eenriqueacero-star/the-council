/**
 * Server-side (Firebase Admin SDK) utilities for persistent agent stance memory.
 *
 * Firestore path: users/{userId}/agent_memory/{agentId}__{ticker}
 * Doc IDs:  e.g. "rex__NVDA", "atlas___global" (ticker "_global" for market outlook)
 *
 * Fields: agentId, ticker, stance, conviction, reasoning, history[], createdAt, updatedAt, staleAfter
 * For global outlook docs: stance field holds "bullish"|"bearish"|"cautious"|"neutral"
 */

import { db } from './firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';

const STALE_DAYS = 30;

function col(userId) {
  return db.collection(`users/${userId}/agent_memory`);
}

function docId(agentId, ticker) {
  return `${agentId}__${ticker.toUpperCase()}`;
}

function staleAfterDate() {
  const d = new Date();
  d.setDate(d.getDate() + STALE_DAYS);
  return d;
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export async function getStance(userId, agentId, ticker) {
  try {
    const snap = await col(userId).doc(docId(agentId, ticker)).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  } catch { return null; }
}

/** Returns all 6 agents' stances on a single ticker keyed by agentId. */
export async function getAllStances(userId, ticker) {
  const ids = ['rex', 'nova', 'sage', 'atlas', 'vega', 'zen'];
  const results = await Promise.all(ids.map(id => getStance(userId, id, ticker)));
  const out = {};
  ids.forEach((id, i) => { if (results[i]) out[id] = results[i]; });
  return out;
}

/** Returns all 6 agents' global market outlooks. */
export async function getAllGlobalOutlooks(userId) {
  return getAllStances(userId, '_GLOBAL');
}

/** Returns all stance docs for one agent (across all tickers). */
export async function getAgentFullMemory(userId, agentId) {
  try {
    const snap = await col(userId).where('agentId', '==', agentId).get();
    const out = {};
    snap.docs.forEach(d => { out[d.id] = { id: d.id, ...d.data() }; });
    return out;
  } catch { return {}; }
}

/** Returns all stance docs where staleAfter < now (across all agents). */
export async function getStaleStances(userId) {
  try {
    const snap = await col(userId).where('staleAfter', '<', new Date()).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

/**
 * Upsert an agent's stance on a ticker.
 * Returns { flipped, from, to, daysSincePrevious } when stance direction reverses.
 */
export async function updateStance(userId, agentId, ticker, { stance, conviction, reasoning }) {
  const ref = col(userId).doc(docId(agentId, ticker));
  const snap = await ref.get();
  const now = new Date();

  let flipped = false;
  let from = null;
  const to = stance;
  let daysSincePrevious = null;

  if (snap.exists) {
    const prev = snap.data();
    const prevStance = prev.stance;
    const isFlip = (
      (prevStance === 'bullish' && stance === 'bearish') ||
      (prevStance === 'bearish' && stance === 'bullish')
    );

    if (isFlip) {
      flipped = true;
      from = prevStance;
      const prevDate = prev.updatedAt?.toDate?.() || now;
      daysSincePrevious = Math.max(0, Math.round((now - prevDate) / 86400000));
    }

    if (prevStance !== stance) {
      const histEntry = {
        stance: prevStance,
        conviction: prev.conviction,
        reasoning: prev.reasoning,
        timestamp: prev.updatedAt?.toDate?.()?.toISOString() || now.toISOString(),
      };
      const newHistory = [...(prev.history || []), histEntry].slice(-20);
      await ref.set({
        agentId, ticker: ticker.toUpperCase(), stance, conviction, reasoning,
        history: newHistory,
        updatedAt: FieldValue.serverTimestamp(),
        staleAfter: staleAfterDate(),
      }, { merge: true });
    } else {
      await ref.set({
        stance, conviction, reasoning,
        updatedAt: FieldValue.serverTimestamp(),
        staleAfter: staleAfterDate(),
      }, { merge: true });
    }
  } else {
    await ref.set({
      agentId, ticker: ticker.toUpperCase(), stance, conviction, reasoning,
      history: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      staleAfter: staleAfterDate(),
    });
  }

  return { flipped, from, to, daysSincePrevious };
}

/** Shorthand for updating an agent's global market outlook. */
export async function updateGlobalOutlook(userId, agentId, { outlook, conviction, reasoning }) {
  return updateStance(userId, agentId, '_GLOBAL', { stance: outlook, conviction, reasoning });
}

// ---------------------------------------------------------------------------
// Memory context builder (for injecting into cron log strings — not LLM prompts)
// ---------------------------------------------------------------------------

/**
 * Formats an agent's full memory into a human-readable summary for logging.
 */
export function buildMemorySummary(agentMemory) {
  const entries = Object.values(agentMemory).filter(m => m.ticker !== '_GLOBAL');
  if (!entries.length) return '(no prior stances)';
  return entries.map(m => `${m.ticker}: ${m.stance} (${m.conviction}/10)`).join(', ');
}
