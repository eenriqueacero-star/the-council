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

  const AV_KEY = process.env.ALPHA_VANTAGE_KEY;
  if (!AV_KEY) return res.status(500).json({ error: 'ALPHA_VANTAGE_KEY not set' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { ticker } = body || {};
  if (!ticker || typeof ticker !== 'string') return res.status(400).json({ error: 'ticker required' });

  const TICKER_RE = /^[A-Z0-9.]{1,10}$/;
  if (!TICKER_RE.test(ticker.toUpperCase())) return res.status(400).json({ error: 'Invalid ticker' });

  const symbol = ticker.toUpperCase();
  const indicators = {};

  const fetchIndicator = async (fn, extraParams = '') => {
    const url = `https://www.alphavantage.co/query?function=${fn}&symbol=${encodeURIComponent(symbol)}&interval=daily&time_period=14&series_type=close${extraParams}&apikey=${AV_KEY}`;
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const data = await r.json();
      // Alpha Vantage returns {"Note":"..."} or {"Information":"..."} when rate limited
      if (data.Note || data.Information) {
        console.error(`[get-technicals] AV rate limit hit for ${fn}:`, data.Note || data.Information);
        return null;
      }
      return data;
    } catch (e) {
      console.error(`[get-technicals] fetch error for ${fn}:`, e.message);
      return null;
    }
  };

  try {
    // RSI (14-day)
    const rsiData = await fetchIndicator('RSI');
    const rsiKey = Object.keys(rsiData || {}).find(k => k.includes('Technical'));
    if (rsiKey) {
      const vals = Object.entries(rsiData[rsiKey]);
      if (vals.length > 0) {
        indicators.rsi = { value: parseFloat(vals[0][1].RSI), date: vals[0][0] };
      }
    }

    // MACD
    const macdData = await fetchIndicator('MACD', '&fastperiod=12&slowperiod=26&signalperiod=9');
    const macdKey = Object.keys(macdData || {}).find(k => k.includes('Technical'));
    if (macdKey) {
      const vals = Object.entries(macdData[macdKey]);
      if (vals.length > 0) {
        const m = vals[0][1];
        indicators.macd = {
          macd:      parseFloat(m.MACD),
          signal:    parseFloat(m.MACD_Signal),
          histogram: parseFloat(m.MACD_Hist),
          date:      vals[0][0],
          bullish:   parseFloat(m.MACD) > parseFloat(m.MACD_Signal),
        };
      }
    }

    // Bollinger Bands (20-day)
    const bbData = await fetchIndicator('BBANDS', '&time_period=20');
    const bbKey = Object.keys(bbData || {}).find(k => k.includes('Technical'));
    if (bbKey) {
      const vals = Object.entries(bbData[bbKey]);
      if (vals.length > 0) {
        const b = vals[0][1];
        indicators.bollinger = {
          upper:  parseFloat(b['Real Upper Band']),
          middle: parseFloat(b['Real Middle Band']),
          lower:  parseFloat(b['Real Lower Band']),
          date:   vals[0][0],
        };
      }
    }

    // SMA 50
    const sma50Data = await fetchIndicator('SMA', '&time_period=50');
    const sma50Key = Object.keys(sma50Data || {}).find(k => k.includes('Technical'));
    if (sma50Key) {
      const vals = Object.entries(sma50Data[sma50Key]);
      if (vals.length > 0) indicators.sma50 = { value: parseFloat(vals[0][1].SMA), date: vals[0][0] };
    }

    // SMA 200
    const sma200Data = await fetchIndicator('SMA', '&time_period=200');
    const sma200Key = Object.keys(sma200Data || {}).find(k => k.includes('Technical'));
    if (sma200Key) {
      const vals = Object.entries(sma200Data[sma200Key]);
      if (vals.length > 0) indicators.sma200 = { value: parseFloat(vals[0][1].SMA), date: vals[0][0] };
    }

    // Golden/death cross
    if (indicators.sma50 && indicators.sma200) {
      indicators.crossSignal = indicators.sma50.value > indicators.sma200.value ? 'GOLDEN_CROSS' : 'DEATH_CROSS';
    }

    const hasData = Object.keys(indicators).length > 0;
    console.error(`[get-technicals] ${symbol}: ${hasData ? Object.keys(indicators).join(', ') : 'no data (rate limited?)'}`);
    res.status(200).json({ ticker: symbol, indicators: hasData ? indicators : null });
  } catch (err) {
    console.error('[get-technicals] error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
