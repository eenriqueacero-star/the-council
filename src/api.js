import { auth } from './firebase.js';

async function authHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

// 45s in-memory quote cache
const quoteCache = new Map(); // key: sorted tickers string → { data, ts }

export async function callAgent(system, userContent, useSearch, maxTokens = 512, signal, model = null) {
  let headers;
  try { headers = await authHeaders(); }
  catch { throw new Error('ERR-401: Not authenticated'); }

  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    const payload = { system, userContent, useSearch: !!useSearch, maxTokens };
    if (model) payload.model = model;
    try {
      res = await fetch('/api/run-agent', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal,
      });
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      throw new Error('ERR-NET: No response from server');
    }

    if (res.status === 429 && attempt === 0) {
      const retryAfter = res.headers?.get?.('retry-after');
      const waitMs = retryAfter ? Math.max(parseInt(retryAfter, 10) * 1000, 35000) : 35000;
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    if (!res.ok) {
      let body = {};
      try { body = await res.json(); } catch {}
      const code = body.code || `ERR-${res.status}`;
      throw new Error(`${code}: ${body.error || res.statusText}`);
    }
    const data = await res.json();
    return { text: data.text, grounded: data.grounded ?? null, warning: data.warning ?? null };
  }
}

export async function getQuotes(tickers, withEarnings = false) {
  const key = [...tickers].sort().join(',') + (withEarnings ? '+earnings' : '');
  const cached = quoteCache.get(key);
  if (cached && Date.now() - cached.ts < 45000) return cached.data;
  const headers = await authHeaders();
  const res = await fetch('/api/get-quotes', { method: 'POST', headers, body: JSON.stringify({ tickers, withEarnings }) });
  if (!res.ok) throw new Error(`api_unreachable_${res.status}`);
  const data = await res.json();
  quoteCache.set(key, { data, ts: Date.now() });
  return data;
}

export async function getCandles(tickers, range) {
  const headers = await authHeaders();
  const res = await fetch('/api/get-candles', {
    method: 'POST',
    headers,
    body: JSON.stringify({ tickers, range }),
  });
  if (!res.ok) throw new Error(`api_unreachable_${res.status}`);
  return res.json();
}

// Stagger helper
export const sleep = ms => new Promise(r => setTimeout(r, ms));
