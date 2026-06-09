import { auth } from './firebase.js';

async function authHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

// Drop-in replacement for the prototype's callAgent().
// Calls /api/run-agent (Vercel serverless function) — no key in the browser.
export async function callAgent(system, userContent, useSearch) {
  const headers = await authHeaders();
  const res = await fetch('/api/run-agent', {
    method: 'POST',
    headers,
    body: JSON.stringify({ system, userContent, useSearch: !!useSearch }),
  });
  if (!res.ok) throw new Error(`api_unreachable_${res.status}`);
  const data = await res.json();
  return data.text;
}

export async function getQuotes(tickers) {
  const headers = await authHeaders();
  const res = await fetch('/api/get-quotes', {
    method: 'POST',
    headers,
    body: JSON.stringify({ tickers }),
  });
  if (!res.ok) throw new Error(`api_unreachable_${res.status}`);
  return res.json();
}
