import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase.js';

const _runAgent  = httpsCallable(functions, 'runAgent',  { timeout: 120000 });
const _getQuotes = httpsCallable(functions, 'getQuotes', { timeout: 30000  });

// Drop-in replacement for the prototype's callAgent().
// Calls the server-side runAgent Cloud Function — no key in the browser.
export async function callAgent(system, userContent, useSearch) {
  const result = await _runAgent({ system, userContent, useSearch: !!useSearch });
  return result.data.text;
}

export async function getQuotes(tickers) {
  const result = await _getQuotes({ tickers });
  return result.data;
}
