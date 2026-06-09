'use strict';

const { defineSecret } = require('firebase-functions/params');
const Anthropic = require('@anthropic-ai/sdk');

const anthropicKey = defineSecret('ANTHROPIC_API_KEY');

const MODEL = 'claude-sonnet-4-6';

async function runAgent(request) {
  const { system, userContent, useSearch } = request.data;

  if (!system || !userContent) {
    throw new Error('Missing required fields: system, userContent');
  }

  const client = new Anthropic.default({ apiKey: anthropicKey.value() });

  const body = {
    model: MODEL,
    max_tokens: 1000,
    system,
    messages: [{ role: 'user', content: userContent }],
  };

  if (useSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }

  const response = await client.messages.create(body);
  const text = (response.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  return { text };
}

module.exports = { runAgent, anthropicKey };
