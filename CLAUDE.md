# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow rules (always follow)

- Always work on the **main** branch. Never create or switch to other branches.
- At the **START** of any task, read `CHANGELOG.md` and `ROADMAP.md` to understand current state.
- After completing **ANY** task, BEFORE finishing: (a) add a dated entry to `CHANGELOG.md` describing what changed and why, and (b) update `ROADMAP.md` — check off completed items and update statuses.
- Always **commit AND push to main** yourself, then confirm the push succeeded.

---

## Commands

```bash
npm run dev       # Vite dev server (localhost:5173) — frontend only
npm run build     # Production build → dist/
npm run preview   # Preview the production build locally
```

No test suite. No lint step. Type-check via IDE only (no tsc script).

For Vercel serverless functions (`api/*.js`), they run in Node.js on Vercel but cannot be run locally without a Vercel dev environment. Use `vercel dev` if the CLI is installed.

---

## Architecture

**Stack:** React 18 + Vite + Tailwind · Firebase Auth + Firestore · Vercel serverless · Groq API via `api/run-agent.js` · Finnhub prices via `api/get-quotes.js`

**Models:**
- `openai/gpt-oss-120b` — all 6 specialist agents (reasoning_effort: 'low') and synthesis/AXIOM (reasoning_effort: 'medium')
- `groq/compound` — live web-search recon run once before the agent loop; falls back to `gpt-oss-120b` on any failure

### Request flow

```
Browser (React)
  → src/api.js  (attaches Firebase Auth JWT to every request)
  → api/run-agent.js  (Vercel, 60s max) → Groq API
  → api/get-quotes.js (Vercel, 30s max) → Finnhub API
  → src/firebase.js → Firestore (direct SDK, user-scoped rules)
```

All API keys live **only** in Vercel environment variables (`GROQ_API_KEY` through `GROQ_API_KEY_5`, `FINNHUB_KEY`, `FIREBASE_WEB_API_KEY`). The browser never touches them. Both `/api/*` routes verify the Firebase Auth JWT before forwarding.

### Groq key distribution

5 keys (`GROQ_API_KEY` … `GROQ_API_KEY_5`) are loaded at runtime. Agent calls use round-robin assignment: `agent[i] → keys[i % keys.length]`. Synthesis (AXIOM) is pinned to `keys[keys.length - 1]` so it always has a fresh TPM budget. 429 key-rotation fallback is preserved for each call.

- **Do NOT change model names, key rotation logic, or reasoning_effort settings** without explicit instruction.

### State management

`App.jsx` owns all lifted state: `account`, `tab`, `positions` (per-account map), and CouncilTab's in-flight state (`ticker`, `capital`, `active`, `agentState`, `synthesis`). This lifted state survives tab switches. Everything is passed as props — no context, no external store.

### Accounts & agents

`src/constants/agents.js` is the single source of truth for:
- `ACCOUNTS` — the three portfolios (edwin / dad / bro), each with default holdings and capital
- `AGENTS` — the 6 specialist agents (technical, catalyst, risk, macro, bear, sizer) with system prompts
- The portfolio-manager (PM) system prompt used in ChatTab
- PROTOCOLS block injected into every agent prompt

### Agent orchestration (CouncilTab + ChatTab)

Both tabs share the same council pattern:
1. Recon: `callAgent(..., useSearch=true)` → `groq/compound` fetches live news for the ticker (falls back to `gpt-oss-120b` with `grounded: false` warning)
2. Fetch live price via `getQuotes([ticker])`
3. Call `loadTickerHistory(uid, ticker, livePrice)` (Firestore — all prior rulings on this ticker)
4. Call `loadAgentContext(ticker, rawQuote)` (live sector/macro quotes: SPY, TLT, GLD, VIX, SOXX, SMH, XLK)
5. Build `baseContent` string: account context + positions + capital + ticker history
6. Loop 6 AGENTS × 3 rounds sequentially; each call passes `agentIndex=i` for key assignment
7. 4 s pause (synthesis key has fresh TPM budget from key distribution)
8. Call synthesis (AXIOM) via `callAgent(..., model='openai/gpt-oss-120b')` with final-round results only
9. Save the completed ruling to `users/{uid}/rulings/{id}` in Firestore

`ChatTab` additionally has a PM router: the first `callAgent` call goes to the PM, which returns a JSON router object (`{ reply, convene, ticker, ... }`). If `convene: true`, it kicks off the full council flow above inline in the chat.

### Intelligence layer utilities

- `src/utils/agentContext.js` — fetches SPY, TLT, GLD, VIX, SOXX, SMH, XLK once before the agent loop; `buildAgentContext(agentId, ctx)` returns a per-agent context string suffix (sector tape for `technical`, macro tape for `macro`, intraday high/low for `bear`)
- `src/utils/rulingContext.js` — queries all `users/{uid}/rulings` for a ticker (no limit, compounds forever); shows 5 most recent in detail, summarizes older as a one-liner
- `src/utils.js` — `extractJSON`: strips markdown fences, balanced-brace scan, unescape retry, raw-text fallback

### Alpha Tracker tab

`src/components/AlphaTrackerTab.jsx` loads all rulings for the active account from Firestore, auto-grades any ruling older than 30 days (compares live price to `stopLoss`/`takeProfit` fields, writes `outcome` back), and shows a summary table + per-agent accuracy breakdown (unlocks at 5+ graded rulings).

### Firestore schema

```
users/{uid}/
  data/positions         # { positions: { account: { ticker: { shares, cost } } } }
  rulings/{rulingId}     # one per completed council run
```

Firestore rules: every path under `users/{uid}/**` requires `request.auth.uid == uid`. Composite index on `rulings`: `ticker ASC, ts DESC` (defined in `firestore.indexes.json`).

### Vercel config (`vercel.json`)

Only files listed under `functions` can have custom timeouts — adding a function config for a file that doesn't exist will break the build. The SPA rewrite (`/((?!api/).*) → /index.html`) must remain so React Router handles all non-API routes.

### Deployment

Vercel deploys automatically from **`main` branch only**. Feature branches are never deployed. Always push production-ready changes to `main`.

### JARVIS UI conventions

- Background: `#070a0c`, accent cyan: `#38e0d4`, gold: `#f5c451`, purple: `#b083ff`
- `MONO` / `DISP` / `CY` style constants in `src/constants/styles.js`
- Neon glow via `.neon` CSS class in `index.css`; CRT scanline via `.crtline`
- Tab layout uses `flex overflow-x-auto no-scrollbar` (7 tabs don't fit in a grid)
