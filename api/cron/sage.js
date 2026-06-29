/**
 * SAGE — Risk Manager cron (daily 11am ET)
 * Scans for concentration risk, single-day portfolio drawdown, and sector concentration.
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
    console.error(`[cron/sage] getFullHoldings error for ${userId}:`, e.message);
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
      if (!tickers.length) continue;

      const prices = await fetchPrices(tickers);

      // Compute current portfolio value per position
      const values = {};
      let totalValue = 0;
      let totalDayChange = 0;

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

      if (totalValue === 0) continue;

      const portfolioDayPct = (totalDayChange / (totalValue - totalDayChange)) * 100;

      // Position concentration
      for (const ticker of tickers) {
        if (!values[ticker]) continue;
        const pct = (values[ticker].val / totalValue) * 100;

        if (pct >= 35) {
          await writeFeed(userId, {
            agentId:  'sage',
            ticker,
            headline: `${ticker} is ${pct.toFixed(0)}% of portfolio — critical concentration`,
            detail:   `${ticker} represents ${pct.toFixed(1)}% of total portfolio value ($${values[ticker].val.toFixed(0)} of $${totalValue.toFixed(0)}). A single bad earnings report or sector rotation could cause outsized damage. Consider trimming.`,
            severity: 'alert',
            source:   'cron_sage_concentration',
          });
          total++;
        } else if (pct >= 25) {
          await writeFeed(userId, {
            agentId:  'sage',
            ticker,
            headline: `${ticker} is ${pct.toFixed(0)}% of portfolio — approaching concentration limit`,
            detail:   `${ticker} represents ${pct.toFixed(1)}% of total portfolio value. Above 25% introduces meaningful single-stock risk. Monitor and consider partial trim if conviction has changed.`,
            severity: 'warning',
            source:   'cron_sage_concentration',
          });
          total++;
        }
      }

      // Single-day portfolio drawdown
      if (portfolioDayPct <= -3) {
        const severity = portfolioDayPct <= -5 ? 'alert' : 'alert';
        await writeFeed(userId, {
          agentId:  'sage',
          ticker:   'PORTFOLIO',
          headline: `Portfolio dropped ${Math.abs(portfolioDayPct).toFixed(1)}% today — significant single-day loss`,
          detail:   `Total portfolio lost ${Math.abs(portfolioDayPct).toFixed(1)}% today ($${Math.abs(totalDayChange).toFixed(0)}). Review top losers and check if macro or sector news is driving broad weakness before reacting.`,
          severity,
          source:   'cron_sage_drawdown',
        });
        total++;
      }

    } catch (e) {
      console.error(`[cron/sage] user ${userId} error:`, e.message);
      errors.push(`user ${userId}: ${e.message}`);
    }
  }

  console.log(`[cron/sage] Done. ${total} feed items written. Errors: ${errors.length}`);
  res.status(200).json({ ok: true, written: total, errors });
}
