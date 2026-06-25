# Changelog

Reverse-chronological. Update this file at the end of every session before pushing.

---

## 2026-06-25

### Key distribution across 5 Groq API keys
- Each of the 6 agents is now assigned a specific key by round-robin (`agent[i] → keys[i % keys.length]`), distributing TPM load so no single key absorbs all agents (~700 TPM/key vs ~5 000 on one).
- Synthesis is pinned to `keys[keys.length - 1]` (last key), which sees zero agent traffic and always has a fresh TPM budget.
- 429 key-rotation fallback preserved as before.
- Pre-synthesis sleep reduced from 18 s → 4 s (synthesis key has headroom).
- Files: `api/run-agent.js`, `src/api.js`, `src/components/CouncilTab.jsx`, `src/components/ChatTab.jsx`

### TPM rate-limit fix (earlier in session)
- Reduced agent `max_tokens` from 1 800 → 1 000 to leave headroom for synthesis.
- Added 18 s pre-synthesis sleep as a temporary pacing measure (now replaced by key distribution above).
- Trimmed synthesis input to final-round results only (`finalCouncilSummary`) — ~3× smaller than sending all rounds.
- Synthesis retry now sleeps 20 s on 429 before second attempt.

### Synthesis failure fix
- `callGroqSynthesis` catch block previously had no error param — real error was silently swallowed.
- Now logs `err?.message`, returns HTTP 200 + `{ text: '', warning: '...' }` instead of HTTP 500.
- Reasoning effort lowered to `'medium'` for synthesis (was `'high'`/unset); agents use `'low'`.

### Stock logo fix
- Clearbit CDN (`logo.clearbit.com`) was returning `ERR_NAME_NOT_RESOLVED`.
- Switched to Google S2 favicons (`www.google.com/s2/favicons?domain=...&sz=64`).
- File: `src/components/PortfolioTab.jsx`

### Parse-failure hardening
- `extractJSON` now strips markdown fences, does a balanced-brace scan, unescape-retries on `\"`, and falls back to raw text.
- All 6 agent system prompts updated to output raw JSON only — no fences, no prose wrappers.
- Files: `src/utils.js`, `src/constants/agents.js`

### Empty-response fix
- Reasoning model (`gpt-oss-120b`) was exhausting its token budget on internal reasoning before emitting output.
- Added `reasoning_effort: 'low'` to all agent calls via `callGroqBase`; added empty-response retry (500 ms + one retry).
- File: `api/run-agent.js`

### Model migration to gpt-oss-120b + groq/compound
- Migrated from `llama-3.3-70b-versatile` to `openai/gpt-oss-120b` (reasoning model) for all agents and synthesis.
- Added `groq/compound` as the live-web-search recon model (news + price context before council runs).
- `trimForCompound()` aggressively trims prompts to fit compound's ~600-char cap.
- Compound failures fall back to `gpt-oss-120b` immediately with `grounded: false` warning.
- Files: `api/run-agent.js`, `src/utils/agentContext.js`

### Shared recon architecture
- Live data (SPY, TLT, GLD, VIX, SOXX, SMH, XLK + ticker news) fetched once before the agent loop via `loadAgentContext`.
- Each agent receives a per-role context suffix (`buildAgentContext`): sector tape for technical, macro tape for macro, intraday H/L for bear.
- Both CouncilTab and ChatTab use the same recon + context flow.

### Firestore database created + cross-device sync
- Firebase project `the-council-89570` now has a live Firestore database.
- All positions and rulings persist under `users/{uid}/...` with auth-gated security rules.
- Removed all `localStorage` fallbacks — Firestore is now the only persistence layer.

### In-app ruling deletion removed
- Purge button removed from SettingsTab to prevent accidental data loss.
- File: `src/components/SettingsTab.jsx`
