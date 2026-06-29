/**
 * NOVA — Catalyst Scout cron (daily 10am ET)
 * Scans for upcoming earnings and negative news clusters.
 */

import { db } from '../lib/firebaseAdmin.js';
import { fetchEarnings, fetchNews } from '../lib/recon.js';
import { FieldValue } from 'firebase-admin/firestore';

const CRON_SECRET = process.env.CRON_SECRET;

function verifyCron(req) {
  return req.headers.authorization === `Bearer ${CRON_SECRET}`;
}

async function getUsers() {
  return (process.env.CRON_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
}

async function getHoldings(userId) {
  try {
    const doc = await db.doc(`users/${userId}/data/positions`).get();
    if (!doc.exists) return {};
    const data = doc.data();
    const combined = {};
    for (const account of Object.values(data?.positions || {})) {
      for (const [ticker] of Object.entries(account || {})) {
        combined[ticker] = true;
      }
    }
    return Object.keys(combined);
  } catch (e) {
    console.error(`[cron/nova] getHoldings error for ${userId}:`, e.message);
    return [];
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
      const tickers = await getHoldings(userId);
      if (!tickers.length) continue;

      const [earningsList, newsMap] = await Promise.all([
        fetchEarnings(tickers),
        fetchNews(tickers),
      ]);

      // Earnings proximity alerts
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
        total++;
      }

      // Negative news clusters
      for (const ticker of tickers) {
        const articles = newsMap[ticker] || [];
        const negatives = articles.filter(a => a.sentiment === 'negative');
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
          total++;
        }
      }
    } catch (e) {
      console.error(`[cron/nova] user ${userId} error:`, e.message);
      errors.push(`user ${userId}: ${e.message}`);
    }
  }

  console.log(`[cron/nova] Done. ${total} feed items written. Errors: ${errors.length}`);
  res.status(200).json({ ok: true, written: total, errors });
}
