import { db } from '../firebase.js';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Write an event to the agent_feed collection for a specific user.
 * Called by cron endpoints (server-side via admin SDK) and client code.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.agentId   e.g. "rex"
 * @param {string} opts.ticker    e.g. "NVDA"
 * @param {string} opts.headline  Short one-liner shown in feed
 * @param {string} opts.detail    Full agent reasoning (2-3 sentences)
 * @param {"info"|"warning"|"alert"} opts.severity
 * @param {string} opts.source    What triggered it (e.g. "cron_rex_technicals")
 */
export async function writeToFeed({ userId, agentId, ticker, headline, detail, severity, source }) {
  const feedRef = collection(db, 'users', userId, 'agent_feed');
  await addDoc(feedRef, {
    agentId,
    ticker,
    headline,
    detail,
    severity,
    source,
    read: false,
    createdAt: serverTimestamp(),
    timestamp: serverTimestamp(),
  });
}
