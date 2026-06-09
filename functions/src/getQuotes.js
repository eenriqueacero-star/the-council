'use strict';

const { defineSecret } = require('firebase-functions/params');

const finnhubKey = defineSecret('FINNHUB_KEY');

async function getQuotes(request) {
  const { tickers } = request.data;

  if (!Array.isArray(tickers) || tickers.length === 0) {
    throw new Error('tickers must be a non-empty array');
  }

  const results = {};
  await Promise.all(tickers.map(async ticker => {
    try {
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${finnhubKey.value()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Finnhub ${res.status}`);
      const data = await res.json();
      results[ticker] = {
        price:     data.c,   // current price
        changePct: data.dp,  // % change
        high:      data.h,
        low:       data.l,
        open:      data.o,
        prevClose: data.pc,
      };
    } catch (err) {
      results[ticker] = { error: err.message };
    }
  }));

  return results;
}

module.exports = { getQuotes, finnhubKey };
