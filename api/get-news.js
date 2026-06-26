async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return false;
  const idToken = authHeader.slice(7);
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_WEB_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data.users?.length);
  } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await verifyAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { ticker } = req.body;
  const TICKER_RE = /^[A-Z0-9.]{1,10}$/;
  if (!ticker || typeof ticker !== 'string' || !TICKER_RE.test(ticker.toUpperCase())) {
    return res.status(400).json({ error: 'Invalid ticker' });
  }

  const sym = ticker.toUpperCase();
  const today     = new Date();
  const newsFrom  = new Date(Date.now() - 5 * 864e5);  // 5 days ago
  const earningsTo = new Date(Date.now() + 90 * 864e5); // 90 days ahead

  const todayStr      = today.toISOString().slice(0, 10);
  const newsFromStr   = newsFrom.toISOString().slice(0, 10);
  const earningsToStr = earningsTo.toISOString().slice(0, 10);

  // Fetch news and earnings calendar in parallel
  const [newsResult, earningsResult] = await Promise.allSettled([
    fetch(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(sym)}&from=${newsFromStr}&to=${todayStr}&token=${process.env.FINNHUB_KEY}`),
    fetch(`https://finnhub.io/api/v1/calendar/earnings?symbol=${encodeURIComponent(sym)}&from=${todayStr}&to=${earningsToStr}&token=${process.env.FINNHUB_KEY}`),
  ]);

  // --- News articles ---
  let articles = [];
  let rawNews  = [];
  try {
    if (newsResult.status === 'fulfilled' && newsResult.value.ok) {
      const data = await newsResult.value.json();
      if (Array.isArray(data)) {
        const sorted = [...data].sort((a, b) => b.datetime - a.datetime).slice(0, 5);
        rawNews  = sorted;
        articles = sorted.map(item => ({
          headline: item.headline || '',
          source:   item.source   || '',
          date:     item.datetime ? new Date(item.datetime * 1000).toISOString().slice(0, 10) : '',
          summary:  item.summary  || '',
        }));
      }
    } else {
      console.error(`[get-news] news fetch failed for ${sym}`);
    }
  } catch (e) {
    console.error(`[get-news] news parse error for ${sym}:`, e.message);
  }

  // --- Earnings calendar ---
  let nextEarnings     = null;  // 'YYYY-MM-DD' or null
  let earningsEstimated = false; // true when dateConfirmed !== 1
  let rawEarnings      = null;
  try {
    if (earningsResult.status === 'fulfilled' && earningsResult.value.ok) {
      const eData = await earningsResult.value.json();
      rawEarnings = eData;
      const cal = eData?.earningsCalendar;
      if (Array.isArray(cal) && cal.length > 0) {
        const upcoming = cal
          .filter(e => e.date >= todayStr)
          .sort((a, b) => a.date.localeCompare(b.date));
        if (upcoming.length > 0) {
          const soonest = upcoming[0];
          nextEarnings = soonest.date;
          // Finnhub sets dateConfirmed=1 when the company has officially announced the date
          earningsEstimated = soonest.dateConfirmed !== 1;
        }
      }
    } else {
      console.error(`[get-news] earnings fetch failed for ${sym}`);
    }
  } catch (e) {
    console.error(`[get-news] earnings parse error for ${sym}:`, e.message);
  }

  console.error(`[get-news] ${sym}: ${articles.length} news articles, nextEarnings=${nextEarnings}, estimated=${earningsEstimated}`);
  return res.status(200).json({ articles, nextEarnings, earningsEstimated, rawNews, rawEarnings });
}
