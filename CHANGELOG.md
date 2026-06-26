# Changelog

Reverse-chronological. Update this file at the end of every session before pushing.

---

## 2026-06-26 (session 10)

### Alpha Tracker vs SPY benchmarking

**`src/components/CouncilTab.jsx` + `src/components/ChatTab.jsx`:** When saving a trade as "Entered", the app now calls `getQuotes(['SPY'])` (hits the 45s client cache if SPY was recently fetched) and stores `spyEntryPrice` on the Firestore ruling doc. Watching trades skip this.

**`src/components/AlphaTrackerTab.jsx` — grading changes:**
- Auto-grade (30-day): fetches SPY price alongside ticker prices in parallel. Computes `myReturn`, `spyReturn`, and `alpha` for any ruling that has `spyEntryPrice`; stores all three on the doc. If SPY fetch fails, return fields stay null and the trade is excluded from alpha calcs (not errored).
- Manual WIN/LOSS close: now also fetches current ticker + SPY price, stores `priceAt30d` (previously not stored on manual close), and computes the same trio.

**`src/components/AlphaTrackerTab.jsx` — UI additions:**
- New "ALPHA vs SPY BENCHMARK" panel: Total Alpha, Avg Alpha/Trade, Beat-SPY Rate (% of trades where my_return > spy_return). Green-bordered when positive, red when negative, grey when no data.
- "vs SPY" column added to the trade table: `Me +X% / SPY +Y% / α +Z%` per graded Entered trade. Trades without `spyEntryPrice` show "SPY N/A". Open/Watching show "—".

**`src/constants/agents.js`:** In-app Roadmap: "Alpha vs SPY" moved to BUILT tier with "⚡ IN PROGRESS" label; removed from HIGH VALUE NEXT.

**SPY data source:** Finnhub `/api/v1/quote?symbol=SPY` via existing `get-quotes.js`. Entry price = live quote at save time. Exit = live quote at grade/close. No historical lookup — pre-existing trades will show "SPY N/A" until graded/closed.

- Files: `src/components/CouncilTab.jsx`, `src/components/ChatTab.jsx`, `src/components/AlphaTrackerTab.jsx`, `src/constants/agents.js`

---

## 2026-06-26

### Finnhub quote hardening — retry, 429 detection, duplicate call fix

**`api/get-quotes.js`:** Quote fetch now retries up to 3 times (1 s wait between) when Finnhub returns both `c` and `pc` as zero/null (transient miss). On HTTP 429, logs `[quote] Finnhub 429 rate-limited for <TICKER>` and sets `{ error: 'rate_limited', rateLimited: true }` — no retry on 429. Graceful fallback when all retries exhausted: `{ error: 'no_price_after_retries' }`, agents proceed flagged ungrounded as before.

**`src/components/ChatTab.jsx`:** Removed duplicate Finnhub quote call. The AXIOM routing step was calling `getQuotes([tkr], true)` (cache key `"NVDA+earnings"`) while `runCouncilInChat` called `getQuotes([tkr])` (key `"NVDA"`). Two different cache keys → two server round-trips per chat-convene. Changed the routing step to `getQuotes([tkr])` — second call now hits the 45 s client cache. The `nextEarnings` data in the routing step was redundant (NOVA already gets it from `getNews` during the council).

**`src/components/CouncilTab.jsx`:** Debug RECON card now includes `rawQuote` (full quote result, including `rateLimited: true` when applicable) alongside `rawNews`/`rawEarnings`, so 429 vs outage is immediately visible in the debug panel.

**Quote call count:** CouncilTab — 2 `get-quotes` calls per convene (ticker + 7 sector ETFs), never per-agent. ChatTab — was 3 (ticker called twice), now 2 (cache hit on second ticker call). News/earnings: 1 `get-news` call per run, data shared via `liveDataBlock`/`baseContent` to all 6 agents × 3 rounds — never per-agent, never per-round.

Added `[quote] Finnhub returned null price after retry for <TICKER>` log when all 3 retry attempts are exhausted and both `c` and `pc` remain zero/null.

- Files: `api/get-quotes.js`, `src/components/ChatTab.jsx`, `src/components/CouncilTab.jsx`

---

## 2026-06-25 (session 8)

### FIX — VEGA hard ban on fabricated events

Previous soft rule ("label it as general risk") was being ignored by rounds 2-3, where VEGA reverted to asserting "sector facing heavy insider selling" with no hedge and no data support.

Replaced with an ABSOLUTE RULE in VEGA's system prompt: specific market events (insider selling, downgrades, lawsuits, earnings misses, layoffs, specific competitor moves) are **forbidden** unless that exact event appears in the LIVE DATA news headlines. Not even as a hedge or possibility. The rule includes FORBIDDEN/ALLOWED examples inline so the model has no ambiguity about what "specific event" means.

Allowed bear case sources remain: (a) actual LIVE DATA price action, (b) actual LIVE DATA headlines, (c) real portfolio position/concentration, (d) broad structural arguments (valuation, sector concentration, competition as a general dynamic) without specific event claims.

VEGA's adversarial role is unchanged — it should still argue the strongest honest bear case, just without inventing events.

- File: `src/constants/agents.js`

---

## 2026-06-25 (session 7)

### FIX — VEGA data-grounding + earnings estimated flag

**FIX 1 — VEGA over-reach tightened** (`src/constants/agents.js`)
- Previous rule allowed VEGA to "search for risks" — it was inferring specific events (insider selling, peer activity) from general knowledge and presenting them as current facts.
- New BEAR CASE STANDARD: build the bear case ONLY on risks supported by LIVE DATA (price action, real news headlines, earnings timing, portfolio position). General structural risks (valuation, competition, concentration) are allowed but must be framed as "general risk, not confirmed in current data." Specific events (insider selling, downgrades, lawsuits, misses) must appear in LIVE DATA news to be cited. Fabricated or inferred events explicitly prohibited.

**FIX 2 — Earnings estimated flag** (`api/get-news.js`, `src/api.js`, `CouncilTab.jsx`, `ChatTab.jsx`, `agents.js`)
- Finnhub earnings calendar includes `dateConfirmed` (1 = company has officially announced, 0 = Finnhub estimate). Now read and propagate this flag as `earningsEstimated: boolean`.
- LIVE DATA earnings line now reads: `Next earnings: 2026-08-25, est. (in 60 days — date estimated, not yet confirmed by company)` when unconfirmed, or plain `Next earnings: 2026-08-25 (in 60 days)` when confirmed.
- NOVA prompt updated: estimated dates still PASS within ~60 days, but NOVA notes "date estimated" in its point so timing is not treated as certain near the boundary.

---

## 2026-06-25 (session 6)

### FIX — NOVA catalyst gate now sees real upcoming earnings dates

**Root cause:** NOVA was searching news for upcoming catalysts, but news reports *past* events. The next earnings date was never in the data NOVA could see, so it FAILed the catalyst gate even when a real earnings date existed in Finnhub.

**Solution — earnings calendar in LIVE DATA:**
- `api/get-news.js`: now fetches news and earnings calendar **in parallel** (`Promise.allSettled`). Earnings call: `GET /calendar/earnings?symbol=<SYM>&from=<today>&to=<today+90days>`. Returns `nextEarnings` (nearest upcoming date as `YYYY-MM-DD` or `null`) and `rawEarnings` (full Finnhub response) alongside the existing `articles`/`rawNews`.
- `src/api.js`: `getNews()` fallback now includes `nextEarnings: null, rawEarnings: null`.
- `CouncilTab.jsx` + `ChatTab.jsx`: compute days-away from `nextEarnings`, build `earningsLine` ("Next earnings: 2026-08-21 (in 57 days)" or "none scheduled within 90 days"), inject into LIVE DATA block directly before the news bullets.
- LIVE DATA block now reads: `NVDA $195.74, -1.64% today range ... Next earnings: 2026-08-21 (in 57 days). Recent news ...`

**NOVA prompt tightened:**
- Now explicitly told to check the "Next earnings:" line in LIVE DATA first (sourced from Finnhub). If that line shows a confirmed date within ~60 days → PASS Gate 1, report the exact date. Falls back to news headlines for other catalysts (conferences, launches) only if no earnings date within the window. FAIL only when genuinely nothing upcoming exists. NEVER invent a date.

**Debug panel:** RECON card relabeled "RECON · RAW FINNHUB RESPONSE (news + earnings)" — now shows `{ rawNews: [...], rawEarnings: {...} }` so both data sources are verifiable.

---

## 2026-06-25 (session 5)

### CRITICAL — Replace compound/generated news with real Finnhub headlines

**Problem:** groq/compound was fabricating dated headlines that passed the freshness filter (fake GPU launches, nonsensical price targets, false revenue figures). These fed every agent as ground truth, causing agents to reason on hallucinated facts.

**Solution — Finnhub company-news endpoint (real data):**
- New `api/get-news.js` serverless function: calls `https://finnhub.io/api/v1/company-news?symbol=<TICKER>&from=<5-days-ago>&to=<today>` using the existing `FINNHUB_KEY`. Returns top 5 articles sorted by datetime desc, each with `headline`, `source`, `date`, `summary`.
- New `getNews(ticker)` in `src/api.js`: auth-gated POST to `/api/get-news` with a 2-minute in-memory cache (same pattern as `getQuotes`).
- `CouncilTab.jsx` + `ChatTab.jsx`: compound news call removed entirely and replaced with `getNews()`. Headlines formatted as `- [YYYY-MM-DD] Headline (Source)`. If Finnhub returns zero articles, LIVE DATA shows "no recent news available (Finnhub)" — no fallback to generated text.
- `vercel.json`: added `api/get-news.js` with 15s maxDuration.
- The groq/compound recon call is fully removed from both tabs (code deleted, not commented out). The `callAgent` import and compound model remain available in `run-agent.js` for other uses.

**Debug panel:** "RECON · RAW NEWS RESPONSE" card now shows the raw Finnhub JSON array — real articles with unix timestamps, sources, and headlines. Headlines are verifiably real and dated.

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
