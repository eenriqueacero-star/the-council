import webpush from 'web-push';

function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  try {
    const payloadB64 = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    const projectId = 'the-council-89570';
    return payload.exp > now
      && payload.iss === `https://securetoken.google.com/${projectId}`
      && payload.aud === projectId;
  } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'VAPID keys not set in Vercel environment variables' });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:avoidingransom@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  const { subs, title, body, url, tag } = req.body || {};
  if (!Array.isArray(subs) || !subs.length) return res.status(400).json({ error: 'subs must be a non-empty array' });
  if (subs.length > 10) return res.status(400).json({ error: 'too many subscriptions' });
  if (!title) return res.status(400).json({ error: 'title required' });

  const payload = JSON.stringify({ title: String(title).slice(0, 120), body: String(body || '').slice(0, 400), url: url || '/', tag });

  const results = await Promise.allSettled(subs.map(s => webpush.sendNotification(s, payload, { TTL: 3600 })));
  const stale = [];
  let sent = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') sent++;
    else if (r.reason?.statusCode === 404 || r.reason?.statusCode === 410) stale.push(subs[i]?.endpoint);
  });

  return res.status(200).json({ sent, stale });
}
