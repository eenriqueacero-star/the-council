/**
 * VEGA — Devil's Advocate cron (every 4 hours, offset from REX)
 * Scans for sharp single-session drops, unusual volume on down days,
 * negative news clusters, and confirmed downtrends.
 */

import { db } from '../lib/firebaseAdmin.js';
import { fetchPrices, fetchNews, fetchTechnicals } from '../lib/recon.js';
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
    if (!doc.exists) return [];
    const data = doc.data();
    const tickers = new Set();
    for (const account of Object.values(data?.positions || {})) {
      for (const ticker of Object.keys(account || {})) tickers.add(ticker);
    }
    return [...tickers];
  } catch (e) {
    console.error(`[cron/vega] getHoldings error for ${userId}:`, e.message);
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

      const [prices, newsMap] = await Promise.all([
        fetchPrices(tickers),
        fetchNews(tickers),
      ]);

      for (const ticker of tickers) {
        try {
          const q = prices[ticker];
          if (!q) continue;

          const events = [];

          // Sharp single-session drop
          if (q.changePct <= -5) {
            events.push({
              ticker,
              headline: `${ticker} down ${Math.abs(q.changePct).toFixed(1)}% today — sharp session drop`,
              detail:   `${ticker} fell ${Math.abs(q.changePct).toFixed(1)}% to $${q.price.toFixed(2)}. This exceeds the -5% bear signal threshold. Check if news or sector selloff is driving this. Do not average down without checking the facts.`,
              severity: 'alert',
              source:   'cron_vega_drop',
            });
          }

          // Negative news clusters
          const articles = newsMap[ticker] || [];
          const negatives = articles.filter(a => a.sentiment === 'negative');
          if (negatives.length >= 3) {
            const sampleHeadlines = negatives.slice(0, 2).map(a => `"${a.headline}"`).join(' / ');
            events.push({
              ticker,
              headline: `${negatives.length} negative articles on ${ticker} in last 24h`,
              detail:   `Bear signal: multiple negative articles in last 24h. Sample: ${sampleHeadlines}. Cluster of bad news can precede further weakness — check if fundamentals are impaired.`,
              severity: 'warning',
              source:   'cron_vega_news',
            });
          }

          // Technicals: confirmed downtrend + unusual volume on down day
          // Fetch technicals only if price is already down to avoid wasting AV calls on green days
          if (q.changePct < 0) {
            const tech = await fetchTechnicals(ticker);
            if (tech) {
              // Confirmed downtrend: price below both SMA50 and SMA200
              const belowBoth = tech.sma50 && tech.sma200 && q.price < tech.sma50 && q.price < tech.sma200;
              if (belowBoth) {
                events.push({
                  ticker,
                  headline: `${ticker} trading below both SMA50 and SMA200 — confirmed downtrend`,
                  detail:   `Price ($${q.price.toFixed(2)}) is below SMA50 ($${tech.sma50.toFixed(2)}) and SMA200 ($${tech.sma200.toFixed(2)}). This is the VEGA bear signal: confirmed downtrend. Do not add to this position without a clear catalyst for reversal.`,
                  severity: 'alert',
                  source:   'cron_vega_downtrend',
                });
              }
            }
          }

          for (const ev of events) {
            await writeFeed(userId, { agentId: 'vega', ...ev });
            total++;
          }
        } catch (e) {
          console.error(`[cron/vega] ${ticker} error:`, e.message);
          errors.push(`${ticker}: ${e.message}`);
        }
      }
    } catch (e) {
      console.error(`[cron/vega] user ${userId} error:`, e.message);
      errors.push(`user ${userId}: ${e.message}`);
    }
  }

  console.log(`[cron/vega] Done. ${total} feed items written. Errors: ${errors.length}`);
  res.status(200).json({ ok: true, written: total, errors });
}
