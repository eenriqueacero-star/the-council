# Changelog

Reverse-chronological. Update this file at the end of every session before pushing.

---

## 2026-06-25 (session 4)

### FIX — NOVA catalyst gate too rigid; recon news staleness

**FIX 1 — NOVA prompt relaxed (agents.js)**
- Previous rule: FAIL if exact date not confirmed → NOVA blocked every run where GTC/conference had no pinned date
- New rule: A catalyst COUNTS if a clearly referenced upcoming event exists within ~60 days, even without an exact date. A recent earnings beat or referenced conference DOES satisfy Gate 1. Only FAIL if there is genuinely NO identifiable near-term catalyst. When timing is approximate, note "timing approximate" rather than FAILing.
- NEVER fabricate a date, but if a specific date isn't in LIVE DATA, say "date unconfirmed" while still PASSing if the event itself is clearly referenced.

**FIX 2 — Recon news query tightened (CouncilTab.jsx, ChatTab.jsx)**
- Old query: "Latest news… past 7 days" with a generic summarizer system prompt → compound returned stale/historical summaries (old earnings beats, Hopper architecture background) without dates
- New system prompt: explicitly forbids generic background and requests dated headlines only; if no recent news exists, say so
- New query: "Search for ${ticker} news from the last 3-5 days only. Return dated, specific headlines… Do NOT return generic background info or old news. If no recent news exists, say so."
- Staleness filter: if response is <60 chars or matches `/no (recent|confirmed|news)/i`, treat as empty → LIVE DATA shows "no confirmed recent news (last 3-5 days)" rather than a stale summary
- Raw recon response now stored in `debugRef.current.reconRawResponse` for inspection

**Debug panel — recon card added (DebugTab.jsx)**
- New "RECON · RAW NEWS RESPONSE" card (purple accent) appears before the LIVE DATA BLOCK card
- Shows the raw compound output before filtering, so you can see exactly what was returned and verify freshness/dates
- "LIVE DATA BLOCK (assembled)" card now has a subtitle clarifying it's the filtered block injected into agent prompts

**shadcn CSS fix (tailwind.config.js)**
- shadcn init added `@apply border-border` to index.css but the Tailwind config had no `border`/`ring` color extensions
- Added CSS var mappings to tailwind.config.js so the build no longer errors

---

## 2026-06-25 (session 3)

### Debug panel — full run diagnostics without DevTools

Added a diagnostic `Debug` tab (visible only when `?debug=1` is in the URL) that captures and displays all data flowing through a council run without changing any logic.

**What's captured:**
- `LIVE DATA` block exactly as assembled (price, %change, range, news)
- For each of the 6 agents across all 3 rounds: full prompt sent, raw response text, parse success (✅/❌), parsed stance/score, response time in ms, Groq key index used, and grounded/ungrounded status
- Synthesis (AXIOM): system prompt, user prompt (final council summary), raw response, parse success, timing, and any warning
- `anyUngrounded` flag shown in the panel header

**UI:**
- Each card has a "Copy" button that copies the full debug block for easy pasting
- Long prompts/responses are truncated at 8–12 lines with an expand link — readable without scrolling forever
- Panel is dark (`#0a0d10`) regardless of app theme — debug always shows on black
- Shows "No debug data yet" when no run has happened; data persists in state between tab switches

**Implementation:**
- `debugRef` accumulates data during the run; `setDebugLog` (passed from App.jsx) is called once synthesis completes
- `isDebugMode` flag (`?debug=1`) gates all tab registration, rendering, and prop passing — zero overhead in normal use
- Files: `src/App.jsx`, `src/components/CouncilTab.jsx`, `src/components/DebugTab.jsx` (new)

---

## 2026-06-26

### Agent Tuning — tighter rules, no flip-flopping, live data only

**PROTOCOLS block expanded** (`src/constants/agents.js`). All 6 agents and AXIOM synthesis receive the full shared rules block. New additions:
- *Sell Protocol* now explicitly lists what does NOT count as a downtrend: single red day, -1% to -3% move, one down week, high RSI, valuation. Default when ambiguous: trend is INTACT.
- *4-Gate rule* rewritten with gate numbers and explicit criteria.
- *Stability Rule* (new): same facts must produce the same stance; do not swing on intraday noise or fractional moves.
- *Live Data Rule* (new): never state a price, earnings date, or news event from memory; if not in LIVE DATA, say it is unconfirmed.

**Per-agent additions** (all preserve existing role, persona, and JSON output schema):
- **REX** — DOWNTREND STANDARD: lower highs AND lower lows across multiple weeks required; ambiguity defaults to CAUTION, not FAIL.
- **NOVA** — CATALYST STANDARD: earnings dates must come from live search or LIVE DATA; unconfirmed date does not clear Gate 1.
- **SAGE** — RISK STANDARD: all flags grounded in LIVE DATA and account context; small starter mitigates sizing risk, so not a FAIL trigger.
- **ATLAS** — GATE 4 STANDARD: only FAIL on real macro stress visible in today's LIVE DATA; background uncertainty is the normal state, not a headwind.
- **VEGA** — BEAR CASE STANDARD: confirmed facts from live search only; no fabricated risks; trend call deferred to REX.
- **ZEN** — SIZING STANDARD: price from LIVE DATA only; stance reflects position feasibility, not overall stock quality.

**In-app Roadmap** — Agent Tuning added as #1 item in HIGH VALUE — NEXT.

- File: `src/constants/agents.js`

---

## 2026-06-25 (session 2)

### Alpha Tracker rework — intent-driven tracking only

**Stop auto-logging.** Council convenes no longer write anything to Firestore automatically. Running the council is just an analysis run; nothing is persisted until you explicitly choose to track it.

**Track This Trade button.** After AXIOM delivers its final ruling, a `TRACK:` row appears at the bottom of the AXIOM card (CouncilTab) and on each council session card (ChatTab). Two buttons:
- **▸ Entered** — you actually bought; optionally enter your actual entry price and share count, then save.
- **◎ Watching** — tracking the idea but haven't bought yet.
Clicking Save writes the ruling to `users/{uid}/rulings` with `status: 'entered'|'watching'`.

**Real outcome states.** Alpha Tracker now shows ENTERED / WATCHING status badges per row. Open entered trades show **WIN** and **LOSS** close buttons. Manually closing a trade sets `outcome: 'win'|'loss'` and `outcomeCheckedAt`, preventing auto-grade from overwriting the manual decision. Auto-grade (30-day price check → target/stop/expired) still runs, but only on `status === 'entered'` trades.

**Delete + edit.** Each row now has a trash icon. First click shows DEL / × confirm inline (no dialog). Confirmed delete removes the Firestore doc. Watching rows also show a `→ ENT` button to reclassify as Entered.

**Stats filtered to entered trades.** Win rate, loss rate, avg return, and agent accuracy all filter to `status === 'entered'` trades only. Watching calls don't pollute the hit rate. The top stats card now shows "X entered · Y watching" instead of a raw total.

- Files: `src/components/CouncilTab.jsx`, `src/components/ChatTab.jsx`, `src/components/AlphaTrackerTab.jsx`

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
