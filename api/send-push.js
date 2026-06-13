import webpush from 'web-push';

const PROJECT_ID = 'the-council-89570';

async function verifyAuth(idToken) {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_WEB_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const user = data.users?.[0];
    return user ? user.localId : null;
  } catch { return null; }
}

function parseValue(v) {
  if (!v) return null;
  if (v.stringValue  !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue  !== undefined) return Number(v.doubleValue);
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue    !== undefined) return null;
  if (v.mapValue)   return parseMap(v.mapValue.fields);
  if (v.arrayValue) return (v.arrayValue.values || []).map(parseValue);
  return null;
}

function parseMap(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = parseValue(v);
  return out;
}

async function loadUserSubs(uid, idToken) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/data/push`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
    if (r.status === 404) return [];
    if (!r.ok) return [];
    const doc = await r.json();
    const subsMap = parseMap(doc.fields || {}).subs || {};
    return Object.values(subsMap)
      .map(entry => entry?.sub)
      .filter(s => s?.endpoint && s?.keys?.p256dh && s?.keys?.auth);
  } catch { return []; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'VAPID keys not set in Vercel environment variables' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const idToken = authHeader.slice(7);
  const uid = await verifyAuth(idToken);
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  const { title, body, url, tag } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });

  // Load subscriptions server-side — never trust the client to supply them
  const subs = await loadUserSubs(uid, idToken);
  if (!subs.length) return res.status(200).json({ sent: 0, stale: [] });

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:avoidingransom@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  const payload = JSON.stringify({
    title: String(title).slice(0, 120),
    body:  String(body || '').slice(0, 400),
    url:   url || '/',
    tag,
  });

  const results = await Promise.allSettled(
    subs.map(s => webpush.sendNotification(s, payload, { TTL: 3600 }))
  );

  const stale = [];
  let sent = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') sent++;
    else if (r.reason?.statusCode === 404 || r.reason?.statusCode === 410) {
      stale.push(subs[i]?.endpoint);
    }
  });

  return res.status(200).json({ sent, stale });
}
