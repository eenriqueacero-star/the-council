'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { runAgent: runAgentHandler, anthropicKey } = require('./runAgent');
const { getQuotes: getQuotesHandler, finnhubKey }  = require('./getQuotes');

// Proxies Anthropic API — key never leaves the server
exports.runAgent = onCall(
  { secrets: [anthropicKey], timeoutSeconds: 120, memory: '256MiB' },
  async request => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required.');
    }
    try {
      return await runAgentHandler(request);
    } catch (err) {
      console.error('runAgent error:', err.message);
      throw new HttpsError('internal', err.message);
    }
  }
);

// Proxies Finnhub price quotes — key never leaves the server
exports.getQuotes = onCall(
  { secrets: [finnhubKey], timeoutSeconds: 30, memory: '256MiB' },
  async request => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required.');
    }
    try {
      return await getQuotesHandler(request);
    } catch (err) {
      console.error('getQuotes error:', err.message);
      throw new HttpsError('internal', err.message);
    }
  }
);
