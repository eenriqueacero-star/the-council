/**
 * Shared recon helpers for cron agent endpoints.
 * All functions use environment variables directly — no Firebase auth needed
 * since these call external APIs, not Firestore.
 */

const FINNHUB_KEY = () => process.env.FINNHUB_KEY;
const AV_KEY      = () => process.env.ALPHA_VANTAGE_KEY;
const FRED_KEY    = () => process.env.FRED_API_KEY;

// --- Prices ---

/**
 * Fetch Finnhub quote for each ticker.
 * @param {string[]} tickers
 * @returns {{ [ticker]: { price, changePct, change, high, low, volume, prevClose } }}
 */
export async function fetchPrices(tickers) {
  const results = {};
  await Promise.all(tickers.map(async ticker => {
    try {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_KEY()}`);
      if (!r.ok) { results[ticker] = null; return; }
      const q = await r.json();
      if (!q || (q.c === 0 && q.pc === 0)) { results[ticker] = null; return; }
      results[ticker] = {
        price:      q.c || q.pc || 0,
        prevClose:  q.pc || 0,
        change:     q.d  || 0,
        changePct:  q.dp || 0,
        high:       q.h  || 0,
        low:        q.l  || 0,
        volume:     q.v  || 0,
        raw:        q,
      };
    } catch (e) {
      console.error(`[recon] fetchPrices error for ${ticker}:`, e.message);
      results[ticker] = null;
    }
  }));
  return results;
}

// --- News ---

/**
 * Fetch Finnhub company news for the last 3 days.
 * @param {string[]} tickers
 * @returns {{ [ticker]: Array<{ headline, source, date, summary }> }}
 */
export async function fetchNews(tickers) {
  const today = new Date().toISOString().slice(0, 10);
  const from  = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  const results = {};

  await Promise.all(tickers.map(async ticker => {
    try {
      const r = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${today}&token=${FINNHUB_KEY()}`);
      if (!r.ok) { results[ticker] = []; return; }
      const data = await r.json();
      if (!Array.isArray(data)) { results[ticker] = []; return; }
      results[ticker] = data
        .sort((a, b) => b.datetime - a.datetime)
        .slice(0, 10)
        .map(a => ({
          headline: a.headline || '',
          source:   a.source   || '',
          date:     a.datetime ? new Date(a.datetime * 1000).toISOString().slice(0, 10) : today,
          summary:  a.summary  || '',
          sentiment: guessSentiment(a.headline || ''),
        }));
    } catch (e) {
      console.error(`[recon] fetchNews error for ${ticker}:`, e.message);
      results[ticker] = [];
    }
  }));
  return results;
}

function guessSentiment(headline) {
  const h = headline.toLowerCase();
  const neg = /miss|loss|fall|drop|decline|warn|cut|downgrad|layoff|lawsuit|recall|halt|suspend|investi/;
  const pos = /beat|rise|surge|jump|record|upgrade|acquire|launch|partner|win|profit|grow/;
  if (neg.test(h)) return 'negative';
  if (pos.test(h)) return 'positive';
  return 'neutral';
}

// --- Earnings ---

/**
 * Fetch upcoming earnings dates from Finnhub for the next 60 days.
 * @param {string[]} tickers
 * @returns {Array<{ ticker, date, dateConfirmed, estimated }>}
 */
export async function fetchEarnings(tickers) {
  const today = new Date().toISOString().slice(0, 10);
  const to    = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
  const all   = [];

  await Promise.all(tickers.map(async ticker => {
    try {
      const r = await fetch(`https://finnhub.io/api/v1/calendar/earnings?symbol=${encodeURIComponent(ticker)}&from=${today}&to=${to}&token=${FINNHUB_KEY()}`);
      if (!r.ok) return;
      const data = await r.json();
      const cal  = data?.earningsCalendar;
      if (!Array.isArray(cal)) return;
      const upcoming = cal
        .filter(e => e.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (upcoming.length > 0) {
        const soonest = upcoming[0];
        all.push({
          ticker,
          date:          soonest.date,
          dateConfirmed: soonest.dateConfirmed,
          estimated:     soonest.dateConfirmed !== 1,
          daysAway:      Math.round((new Date(soonest.date) - new Date(today)) / 864e5),
        });
      }
    } catch (e) {
      console.error(`[recon] fetchEarnings error for ${ticker}:`, e.message);
    }
  }));
  return all;
}

// --- Technicals (Alpha Vantage) ---

/**
 * Fetch technical indicators for a single ticker from Alpha Vantage.
 * @param {string} ticker
 * @returns {{ rsi, macd, sma50, sma200, bollingerUpper, bollingerLower, goldenCross, deathCross } | null}
 */
export async function fetchTechnicals(ticker) {
  const key = AV_KEY();
  if (!key) { console.error('[recon] ALPHA_VANTAGE_KEY not set'); return null; }

  const fetchAV = async (fn, extra = '') => {
    const url = `https://www.alphavantage.co/query?function=${fn}&symbol=${encodeURIComponent(ticker)}&interval=daily&time_period=14&series_type=close${extra}&apikey=${key}`;
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const data = await r.json();
      if (data.Note || data.Information) {
        console.error(`[recon] AV rate limit for ${fn} (${ticker})`);
        return null;
      }
      return data;
    } catch (e) {
      console.error(`[recon] AV fetch error ${fn} (${ticker}):`, e.message);
      return null;
    }
  };

  try {
    const [rsiData, macdData, bbData, sma50Data, sma200Data] = await Promise.all([
      fetchAV('RSI'),
      fetchAV('MACD', '&fastperiod=12&slowperiod=26&signalperiod=9'),
      fetchAV('BBANDS', '&time_period=20'),
      fetchAV('SMA', '&time_period=50'),
      fetchAV('SMA', '&time_period=200'),
    ]);

    const getFirst = (data, valFn) => {
      const key = Object.keys(data || {}).find(k => k.includes('Technical'));
      if (!key) return null;
      const entries = Object.entries(data[key]);
      return entries.length ? valFn(entries[0]) : null;
    };

    const rsi    = getFirst(rsiData,   ([, v]) => parseFloat(v.RSI));
    const sma50  = getFirst(sma50Data, ([, v]) => parseFloat(v.SMA));
    const sma200 = getFirst(sma200Data,([, v]) => parseFloat(v.SMA));

    let macd = null, macdSignal = null, macdHistogram = null, macdBullish = null;
    const macdEntry = getFirst(macdData, e => e);
    if (macdEntry) {
      const [, m] = macdEntry;
      macd          = parseFloat(m.MACD);
      macdSignal    = parseFloat(m.MACD_Signal);
      macdHistogram = parseFloat(m.MACD_Hist);
      macdBullish   = macd > macdSignal;
    }

    let bollingerUpper = null, bollingerLower = null;
    const bbEntry = getFirst(bbData, e => e);
    if (bbEntry) {
      const [, b] = bbEntry;
      bollingerUpper = parseFloat(b['Real Upper Band']);
      bollingerLower = parseFloat(b['Real Lower Band']);
    }

    const goldenCross = sma50 != null && sma200 != null && sma50 > sma200;
    const deathCross  = sma50 != null && sma200 != null && sma50 < sma200;

    return { rsi, macd, macdSignal, macdHistogram, macdBullish, sma50, sma200, bollingerUpper, bollingerLower, goldenCross, deathCross };
  } catch (e) {
    console.error(`[recon] fetchTechnicals error (${ticker}):`, e.message);
    return null;
  }
}

// --- Macro (FRED) ---

/**
 * Fetch macro indicators from FRED.
 * @returns {{ fedRate, cpi, unemployment, gdp, vix, yieldSpread, treasury10y, treasury2y, ... }}
 */
export async function fetchMacro() {
  const key = FRED_KEY();
  if (!key) { console.error('[recon] FRED_API_KEY not set'); return null; }

  const series = {
    fedRate:      'FEDFUNDS',
    cpi:          'CPIAUCSL',
    unemployment: 'UNRATE',
    gdp:          'A191RL1Q225SBEA',
    treasury10y:  'DGS10',
    treasury2y:   'DGS2',
    vix:          'VIXCLS',
  };

  const results = {};
  await Promise.all(Object.entries(series).map(async ([label, seriesId]) => {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${key}&file_type=json&sort_order=desc&limit=3`;
      const r   = await fetch(url);
      if (!r.ok) { results[label] = null; return; }
      const data = await r.json();
      const obs  = (data.observations || []).filter(o => o.value !== '.');
      if (!obs.length) { results[label] = null; return; }
      results[label] = {
        current:  parseFloat(obs[0].value),
        date:     obs[0].date,
        previous: obs.length > 1 ? parseFloat(obs[1].value) : null,
      };
    } catch (e) {
      console.error(`[recon] fetchMacro error for ${seriesId}:`, e.message);
      results[label] = null;
    }
  }));

  if (results.treasury10y && results.treasury2y) {
    results.yieldSpread = +(results.treasury10y.current - results.treasury2y.current).toFixed(2);
    results.yieldInverted = results.treasury10y.current < results.treasury2y.current;
  }

  return results;
}
