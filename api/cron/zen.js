/**
 * ZEN — Position Sizer cron (daily 12pm ET)
 * Scans for positions too small to matter, extreme size imbalances.
 */

import { db } from '../lib/firebaseAdmin.js';
import { fetchPrices } from '../lib/recon.js';
import { FieldValue } from 'firebase-admin/firestore';

const CRON_SECRET = process.env.CRON_SECRET;

function verifyCron(req) {
  return req.headers.authorization === `Bearer ${CRON_SECRET}`;
}

async function getUsers() {
  return (process.env.CRON_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
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
    console.error(`[cron/zen] getFullHoldings error for ${userId}:`, e.message);
    return {};
  }
}

async function writeFeed(userId, item) {
  await db.collection(`users/${userId}/agent_feed`).add({
    ...item,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    timestamp: FieldValue.serverTimestamp(),
  });
}

export default async function handler(req, res) {
  if (!verifyCron(req)) return res.status(401).json({ error: 'Unauthorized' });

  const userIds = await getUsers();
  if (!userIds.length) return res.status(200).json({ ok: true, skipped: 'no user IDs' });

  let total = 0;
  const errors = [];

  for (const userId of userIds) {
    try {
      const holdings = await getFullHoldings(userId);
      const tickers  = Object.keys(holdings);
      if (tickers.length < 2) continue;

      const prices = await fetchPrices(tickers);

      const positionValues = {};
      for (const ticker of tickers) {
        const q      = prices[ticker];
        const shares = holdings[ticker].shares;
        if (!q || !shares) continue;
        positionValues[ticker] = q.price * shares;
      }

      const vals   = Object.values(positionValues);
      const sorted = Object.entries(positionValues).sort(([, a], [, b]) => b - a);
      if (!sorted.length) continue;

      const [largestTicker, largestVal] = sorted[0];
      const [smallestTicker, smallestVal] = sorted[sorted.length - 1];

      // Too-small positions
      for (const [ticker, val] of Object.entries(positionValues)) {
        if (val < 50) {
          await writeFeed(userId, {
            agentId:  'zen',
            ticker,
            headline: `${ticker} position is only $${val.toFixed(0)} — below minimum impact threshold`,
            detail:   `${ticker} is worth $${val.toFixed(0)} — too small to meaningfully affect portfolio performance. Either add to this position to bring it above $100+, or close it and redeploy the capital into higher-conviction names.`,
            severity: 'info',
            source:   'cron_zen_size',
          });
          total++;
        }
      }

      // Extreme size imbalance
      if (largestVal && smallestVal > 0 && largestVal / smallestVal >= 5) {
        const ratio = (largestVal / smallestVal).toFixed(0);
        await writeFeed(userId, {
          agentId:  'zen',
          ticker:   largestTicker,
          headline: `Largest position (${largestTicker}) is ${ratio}x smallest (${smallestTicker}) — rebalance worth considering`,
          detail:   `${largestTicker} ($${largestVal.toFixed(0)}) is ${ratio}x larger than ${smallestTicker} ($${smallestVal.toFixed(0)}). This imbalance may not reflect conviction — if it's passive drift (price appreciation), consider whether the current weighting still matches your thesis.`,
          severity: 'info',
          source:   'cron_zen_imbalance',
        });
        total++;
      }

    } catch (e) {
      console.error(`[cron/zen] user ${userId} error:`, e.message);
      errors.push(`user ${userId}: ${e.message}`);
    }
  }

  console.log(`[cron/zen] Done. ${total} feed items written. Errors: ${errors.length}`);
  res.status(200).json({ ok: true, written: total, errors });
}
