/**
 * Server-side Web Push notification helper.
 * Used by cron handlers to send push notifications alongside feed writes.
 * Reads push subscriptions from Firestore via Admin SDK (never from the client).
 */

import webpush from 'web-push';
import { db } from './firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:avoidingransom@gmail.com';

async function loadUserSubs(userId) {
  try {
    const snap = await db.doc(`users/${userId}/data/push`).get();
    if (!snap.exists) return [];
    const subsMap = snap.data()?.subs || {};
    return Object.values(subsMap)
      .map(e => e?.sub)
      .filter(s => s?.endpoint && s?.keys?.p256dh && s?.keys?.auth);
  } catch { return []; }
}

async function wasSentRecently(userId, tag, hoursAgo) {
  try {
    const since = new Date(Date.now() - hoursAgo * 3_600_000);
    const snap = await db.collection(`users/${userId}/notification_log`)
      .where('tag', '==', tag)
      .where('sentAt', '>', since)
      .limit(1)
      .get();
    return !snap.empty;
  } catch { return false; }
}

async function logSent(userId, tag, title) {
  try {
    await db.collection(`users/${userId}/notification_log`).add({
      tag, title, sentAt: FieldValue.serverTimestamp(),
    });
  } catch {}
}

/**
 * Send a Web Push notification to all of a user's registered devices.
 *
 * @param {string} userId
 * @param {{ title, body, url?, tag?, severity? }} opts
 *   severity 'alert'   → dedup window 4 h
 *   severity 'warning' → dedup window 15 min (0.25 h)
 */
export async function sendPushToUser(userId, { title, body, url = '/', tag, severity = 'alert' }) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  const hoursAgo = severity === 'warning' ? 0.25 : 4;
  if (tag && await wasSentRecently(userId, tag, hoursAgo)) return;

  const subs = await loadUserSubs(userId);
  if (!subs.length) return;

  webpush.setVapidDetails(VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  const payload = JSON.stringify({
    title: String(title).slice(0, 120),
    body:  String(body  || '').slice(0, 400),
    url,
    tag,
  });

  const staleEndpoints = [];
  await Promise.allSettled(subs.map(async sub => {
    try {
      await webpush.sendNotification(sub, payload, { TTL: 3600 });
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) staleEndpoints.push(sub.endpoint);
    }
  }));

  if (tag) await logSent(userId, tag, title);

  // Prune stale endpoints from Firestore (best-effort; client-side pruning covers the rest)
  if (staleEndpoints.length) {
    try {
      const pushRef = db.doc(`users/${userId}/data/push`);
      const snap = await pushRef.get();
      if (snap.exists) {
        const subsMap = snap.data()?.subs || {};
        const updates = {};
        for (const [key, entry] of Object.entries(subsMap)) {
          if (staleEndpoints.includes(entry?.sub?.endpoint)) updates[`subs.${key}`] = FieldValue.delete();
        }
        if (Object.keys(updates).length) await pushRef.update(updates);
      }
    } catch {}
  }
}

// Agent emoji map for push titles
export const AGENT_EMOJI = {
  rex: '⚡', nova: '🔥', sage: '🛡️', atlas: '🌍', vega: '🐻', zen: '⚖️', axiom: '👑',
};

/** Build a push-ready title from a feed item. */
export function feedItemTitle(item) {
  const emoji = AGENT_EMOJI[item.agentId] || '📡';
  const agent = (item.agentId || 'AGENT').toUpperCase();
  const ticker = item.ticker ? ` · ${item.ticker}` : '';
  return `${emoji} ${agent}${ticker}`;
}
