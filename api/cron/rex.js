/**
 * REX — Technical Analyst cron (every 4 hours)
 * Scans all user holdings for technical signals: RSI extremes, MACD crossovers,
 * golden/death cross, Bollinger Band breaks.
 */

import { db } from '../lib/firebaseAdmin.js';
import { fetchPrices, fetchTechnicals } from '../lib/recon.js';
import { FieldValue } from 'firebase-admin/firestore';

const CRON_SECRET = process.env.CRON_SECRET;

function verifyCron(req) {
  return req.headers.authorization === `Bearer ${CRON_SECRET}`;
}

async function getUsers() {
  const ids = (process.env.CRON_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return ids;
}

async function getHoldings(userId) {
  try {
    const doc = await db.doc(`users/${userId}/data/positions`).get();
    if (!doc.exists) return {};
    const data = doc.data();
    const allPositions = data?.positions || {};
    const combined = {};
    for (const account of Object.values(allPositions)) {
      for (const [ticker, pos] of Object.entries(account || {})) {
        if (!combined[ticker]) combined[ticker] = { shares: 0, cost: 0 };
        combined[ticker].shares += Number(pos.shares || 0);
        combined[ticker].cost    = Number(pos.cost || combined[ticker].cost);
      }
    }
    return combined;
  } catch (e) {
    console.error(`[cron/rex] getHoldings error for ${userId}:`, e.message);
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
      const holdings = await getHoldings(userId);
      const tickers  = Object.keys(holdings);
      if (!tickers.length) continue;

      const prices = await fetchPrices(tickers);

      for (const ticker of tickers) {
        try {
          const tech = await fetchTechnicals(ticker);
          if (!tech) continue;

          const price = prices[ticker]?.price || 0;
          const events = [];

          // RSI extremes
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

          // MACD crossover
          if (tech.macdBullish != null) {
            events.push({
              severity: 'info',
              headline: `${ticker} MACD ${tech.macdBullish ? 'bullish' : 'bearish'} crossover — momentum shifting ${tech.macdBullish ? 'up' : 'down'}`,
              detail:   `MACD (${tech.macd?.toFixed(2)}) ${tech.macdBullish ? 'crossed above' : 'crossed below'} signal (${tech.macdSignal?.toFixed(2)}). Histogram: ${tech.macdHistogram?.toFixed(2)}. ${tech.macdBullish ? 'Bullish momentum building.' : 'Bearish momentum building.'}`,
            });
          }

          // Golden cross
          if (tech.goldenCross && tech.sma50 && tech.sma200) {
            events.push({
              severity: 'alert',
              headline: `${ticker} golden cross forming — SMA50 crossing above SMA200`,
              detail:   `SMA50 (${tech.sma50.toFixed(2)}) is above SMA200 (${tech.sma200.toFixed(2)}), forming a golden cross. Historically a bullish long-term signal.`,
            });
          }

          // Death cross
          if (tech.deathCross && tech.sma50 && tech.sma200) {
            events.push({
              severity: 'alert',
              headline: `${ticker} death cross — SMA50 crossed below SMA200`,
              detail:   `SMA50 (${tech.sma50.toFixed(2)}) is below SMA200 (${tech.sma200.toFixed(2)}). Death cross indicates potential long-term downtrend. Monitor closely.`,
            });
          }

          // Bollinger Band breaks
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
            await writeFeed(userId, {
              agentId:  'rex',
              ticker,
              headline: ev.headline,
              detail:   ev.detail,
              severity: ev.severity,
              source:   'cron_rex_technicals',
            });
            total++;
          }
        } catch (e) {
          console.error(`[cron/rex] ${ticker} error:`, e.message);
          errors.push(`${ticker}: ${e.message}`);
        }
      }
    } catch (e) {
      console.error(`[cron/rex] user ${userId} error:`, e.message);
      errors.push(`user ${userId}: ${e.message}`);
    }
  }

  console.log(`[cron/rex] Done. ${total} feed items written. Errors: ${errors.length}`);
  res.status(200).json({ ok: true, written: total, errors });
}
