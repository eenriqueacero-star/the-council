/**
 * ATLAS — Macro Strategist cron (9am ET + 5pm ET)
 * Scans for VIX spikes, yield curve changes, oil moves, CPI/fed rate changes.
 */

import { db } from '../lib/firebaseAdmin.js';
import { fetchMacro } from '../lib/recon.js';
import { FieldValue } from 'firebase-admin/firestore';

const CRON_SECRET = process.env.CRON_SECRET;

const OIL_TICKER = 'USO'; // Proxy for oil via Finnhub

function verifyCron(req) {
  return req.headers.authorization === `Bearer ${CRON_SECRET}`;
}

async function getUsers() {
  return (process.env.CRON_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
}

async function writeFeed(userId, item) {
  await db.collection(`users/${userId}/agent_feed`).add({
    ...item,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    timestamp: FieldValue.serverTimestamp(),
  });
}

// Fetch oil price change via Finnhub
async function fetchOilChange() {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${OIL_TICKER}&token=${process.env.FINNHUB_KEY}`);
    if (!r.ok) return null;
    const q = await r.json();
    return q?.dp || null; // day change percent
  } catch { return null; }
}

export default async function handler(req, res) {
  if (!verifyCron(req)) return res.status(401).json({ error: 'Unauthorized' });

  const userIds = await getUsers();
  if (!userIds.length) return res.status(200).json({ ok: true, skipped: 'no user IDs' });

  // Fetch macro data once, broadcast to all users
  const [macro, oilChangePct] = await Promise.all([fetchMacro(), fetchOilChange()]);

  if (!macro) {
    console.log('[cron/atlas] No macro data available');
    return res.status(200).json({ ok: true, skipped: 'no macro data' });
  }

  // Build events list (same for all users — macro is global)
  const events = [];

  // VIX
  const vix = macro.vix?.current;
  const vixPrev = macro.vix?.previous;
  if (vix != null) {
    if (vix >= 30) {
      events.push({
        ticker:   'VIX',
        headline: `VIX spiked to ${vix.toFixed(1)} — elevated fear in the market`,
        detail:   `VIX at ${vix.toFixed(1)} indicates high market fear. Semis and growth stocks typically underperform in VIX > 30 regimes. Consider defensive positioning or reducing leverage.`,
        severity: 'alert',
        source:   'cron_atlas_vix',
      });
    } else if (vix >= 25) {
      events.push({
        ticker:   'VIX',
        headline: `VIX at ${vix.toFixed(1)} — macro headwind day`,
        detail:   `VIX above 25 signals elevated volatility. Portfolio may see larger intraday swings. Not a sell signal, but avoid adding aggressive positions today.`,
        severity: 'warning',
        source:   'cron_atlas_vix',
      });
    }

    if (vixPrev != null && vixPrev > 0) {
      const vixSpike = ((vix - vixPrev) / vixPrev) * 100;
      if (vixSpike >= 15) {
        events.push({
          ticker:   'VIX',
          headline: `VIX jumped ${vixSpike.toFixed(0)}% in one session — fear surge`,
          detail:   `VIX rose from ${vixPrev.toFixed(1)} to ${vix.toFixed(1)} (${vixSpike.toFixed(1)}% spike). Sudden fear expansions often accompany institutional selling. Watch for follow-through.`,
          severity: 'alert',
          source:   'cron_atlas_vix_spike',
        });
      }
    }
  }

  // Yield spread
  if (macro.yieldSpread != null) {
    const spread = macro.yieldSpread;
    if (macro.yieldInverted) {
      events.push({
        ticker:   'YIELDS',
        headline: `Yield curve inverted — 10Y/2Y spread at ${spread.toFixed(2)}%`,
        detail:   `10Y/2Y spread of ${spread.toFixed(2)}% signals inversion. Historically precedes recessions by 6-18 months. Growth stocks (semis, tech) are most exposed to multiple compression in this regime.`,
        severity: 'warning',
        source:   'cron_atlas_yields',
      });
    } else if (spread < 0.2) {
      events.push({
        ticker:   'YIELDS',
        headline: `Yield spread flattened to ${spread.toFixed(2)}% — approaching inversion`,
        detail:   `10Y/2Y spread of ${spread.toFixed(2)}% is dangerously flat. Further flattening or inversion would be a meaningful recession signal. Monitor weekly.`,
        severity: 'warning',
        source:   'cron_atlas_yields',
      });
    }
  }

  // Oil spike (Hormuz proxy)
  if (oilChangePct != null && Math.abs(oilChangePct) >= 5) {
    const dir = oilChangePct > 0 ? 'jumped' : 'dropped';
    events.push({
      ticker:   'OIL',
      headline: `Oil ${dir} ${Math.abs(oilChangePct).toFixed(1)}% — geopolitical risk elevated`,
      detail:   `Oil ${dir} ${Math.abs(oilChangePct).toFixed(1)}% today (via USO). Significant oil moves can signal Hormuz/Middle East risk, supply disruptions, or demand shock. Defense names may benefit; semis and growth typically sell off.`,
      severity: 'alert',
      source:   'cron_atlas_oil',
    });
  }

  // Fed rate change
  if (macro.fedRate?.current != null && macro.fedRate?.previous != null) {
    const delta = +(macro.fedRate.current - macro.fedRate.previous).toFixed(2);
    if (Math.abs(delta) >= 0.25) {
      events.push({
        ticker:   'FED',
        headline: `Fed rate ${delta > 0 ? 'hiked' : 'cut'} to ${macro.fedRate.current.toFixed(2)}% from ${macro.fedRate.previous.toFixed(2)}%`,
        detail:   `Federal funds rate moved ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(2)}% to ${macro.fedRate.current.toFixed(2)}%. This directly affects discount rates for growth stocks and borrowing costs. ${delta < 0 ? 'Rate cuts are bullish for multiples.' : 'Rate hikes compress tech/growth multiples.'}`,
        severity: 'warning',
        source:   'cron_atlas_fed',
      });
    }
  }

  // CPI change
  if (macro.cpi?.current != null && macro.cpi?.previous != null) {
    const cpiDelta = +(macro.cpi.current - macro.cpi.previous).toFixed(1);
    if (Math.abs(cpiDelta) >= 0.2) {
      events.push({
        ticker:   'CPI',
        headline: `CPI moved to ${macro.cpi.current.toFixed(1)} — inflation signal updated`,
        detail:   `CPI reading: ${macro.cpi.current.toFixed(1)} (prev: ${macro.cpi.previous.toFixed(1)}). ${cpiDelta > 0 ? 'Rising CPI reduces probability of near-term rate cuts.' : 'Falling CPI increases probability of rate cuts — bullish for growth.'}`,
        severity: 'warning',
        source:   'cron_atlas_cpi',
      });
    }
  }

  // Write to all users
  let total = 0;
  const errors = [];

  for (const userId of userIds) {
    for (const ev of events) {
      try {
        await writeFeed(userId, { agentId: 'atlas', ...ev });
        total++;
      } catch (e) {
        console.error(`[cron/atlas] writeFeed error for user ${userId}:`, e.message);
        errors.push(`user ${userId}: ${e.message}`);
      }
    }
  }

  console.log(`[cron/atlas] Done. ${total} feed items written. Errors: ${errors.length}`);
  res.status(200).json({ ok: true, written: total, events: events.length, errors });
}
