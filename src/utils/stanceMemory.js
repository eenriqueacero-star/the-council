/**
 * Client-side (Firebase JS SDK) utilities for reading persistent agent stance memory
 * and building memory context strings for LLM agent prompts.
 *
 * Cron agents write to agent_memory using short IDs: rex, nova, sage, atlas, vega, zen.
 * CouncilTab agents use AGENTS array IDs: technical, catalyst, risk, macro, bear, sizer.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase.js';

const CRON_ID = {
  technical: 'rex',
  catalyst:  'nova',
  risk:      'sage',
  macro:     'atlas',
  bear:      'vega',
  sizer:     'zen',
};

const NAMES = {
  rex: 'REX', nova: 'NOVA', sage: 'SAGE', atlas: 'ATLAS', vega: 'VEGA', zen: 'ZEN',
};

const CRON_IDS = ['rex', 'nova', 'sage', 'atlas', 'vega', 'zen'];

function memDocId(cronId, ticker) {
  return `${cronId}__${ticker.toUpperCase()}`;
}

function toDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return new Date(ts);
}

/** Returns all 6 agents' stances on a ticker, keyed by cron agent ID (rex, nova, …). */
export async function loadTickerStances(uid, ticker) {
  if (!uid) return {};
  const stances = {};
  await Promise.all(CRON_IDS.map(async cronId => {
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'agent_memory', memDocId(cronId, ticker)));
      if (snap.exists()) stances[cronId] = { id: snap.id, ...snap.data() };
    } catch {}
  }));
  return stances;
}

/** Returns all 6 agents' global outlooks, keyed by cron agent ID. */
export async function loadGlobalOutlooks(uid) {
  if (!uid) return {};
  return loadTickerStances(uid, '_GLOBAL');
}

/**
 * Build the memory block injected into each agent's prompt during a council run.
 *
 * @param {string}  agentDomainId  — AGENTS array id (e.g. 'technical')
 * @param {string}  ticker         — the ticker being analysed
 * @param {object}  tickerStances  — result of loadTickerStances(uid, ticker)
 * @param {object}  globalOutlooks — result of loadGlobalOutlooks(uid)
 */
export function buildMemoryBlock(agentDomainId, ticker, tickerStances, globalOutlooks) {
  const cronId = CRON_ID[agentDomainId];
  if (!cronId) return '';

  const parts = [];

  // This agent's prior stance on the current ticker
  const own = tickerStances[cronId];
  if (own) {
    const date = toDate(own.updatedAt);
    const days = date ? Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000)) : null;
    const daysStr = days !== null ? ` (updated ${days} day${days !== 1 ? 's' : ''} ago)` : '';
    parts.push(
      `## Your Prior Stance on ${ticker}\n` +
      `${own.stance.toUpperCase()} — conviction ${own.conviction}/10${daysStr}\n` +
      `"${own.reasoning}"\n` +
      (own.history?.length
        ? `History: ${own.history.slice(-3).map(h => h.stance).join(' → ')} → ${own.stance}`
        : '')
    );
  }

  // Other agents' stances on this ticker
  const others = CRON_IDS.filter(id => id !== cronId && tickerStances[id]);
  if (others.length > 0) {
    const lines = others.map(id => {
      const s = tickerStances[id];
      return `${NAMES[id]}: ${s.stance} ${s.conviction}/10`;
    }).join(', ');
    parts.push(`## Other Agents' Stances on ${ticker}\n${lines}`);
  }

  // All agents' global market outlooks
  const outlooks = CRON_IDS.filter(id => globalOutlooks[id]);
  if (outlooks.length > 0) {
    const lines = outlooks.map(id => {
      const s = globalOutlooks[id];
      const short = s.reasoning?.slice(0, 70) || '';
      return `${NAMES[id]}: ${s.stance} ${s.conviction}/10${short ? ` — "${short}"` : ''}`;
    }).join('\n');
    parts.push(`## Council Global Outlooks\n${lines}`);
  }

  return parts.length
    ? '\n\n## COUNCIL MEMORY\n' + parts.join('\n\n')
    : '';
}
