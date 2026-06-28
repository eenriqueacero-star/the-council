# Changelog

Reverse-chronological. Update this file at the end of every session before pushing.

---

## 2026-06-28 (session 16)

### Agent PNG avatars + 3D infrastructure

**Part 1 — Agent PNG avatars replace emoji:**
- `src/constants/agents.js`: added `avatar` field to all 6 agents (`/agents/rex.png` … `/agents/zen.png`); exported `AXIOM_AVATAR = '/agents/axiom.png'`. Emoji fields kept for prompt strings only.
- `src/components/CouncilTab.jsx`: import `AXIOM_AVATAR`; agent cards now show `<img src={ag.avatar}>` (36×36, radius 8) instead of icon box + emoji. AXIOM synthesis card header now shows `<img src={AXIOM_AVATAR}>` (48×48, radius 12) alongside Crown icon. Progress label string stripped of emoji.
- `src/components/ChatTab.jsx`: import `AXIOM_AVATAR`; AXIOM chat bubble avatar replaced SparkLogo with `<img src={AXIOM_AVATAR}>` (32×32); agent chat bubbles use `<img src={m.avatar}>` (26×26); council grid uses `<img src={ag.avatar}>` (16×16). Agent push now includes `avatar: ag.avatar`.
- `src/components/AlphaTrackerTab.jsx`: agent accuracy bars now show avatar img (14×14) + name instead of emoji + name.
- `src/components/DebugTab.jsx`: debug card title stripped of emoji (string context, can't use img).
- PNG files: 7 emblem PNGs already committed to `public/agents/` (session 16 prep).

**Part 2 — React Three Fiber 3D infrastructure:**
- Installed `@react-three/fiber@^8`, `@react-three/drei@^9`, `three` (R3F v8 targets React 18).
- Created `src/components/3d/CouncilScene.jsx`: lazy-imports `Canvas` from R3F so Three.js is code-split and doesn't bloat the initial bundle. Props: `agents`, `speaking`, `verdict`. Currently renders ambient + point lights only; agent models and table are TODO.
- Created `src/components/3d/AgentModel.jsx`: placeholder mesh (sphere + emissive glow in agent color); `isSpeaking` prop raises emissive intensity. Ready for future GLTF model swap.
- Created `src/components/3d/CouncilTable.jsx`: hexagonal cylinder (`CylinderGeometry args=[3,3,0.2,6]`), metallic dark material. Ready for future seating layout.
- Created `src/components/3d/index.js`: re-exports all three components.
- Not wired to any tab — infrastructure only; lazy import keeps bundle clean.

---

## 2026-06-27 (session 15)

### Tab restructure & feature merge

**Change 1 — Remove Watchdog tab:**
- Deleted `WatchdogTab.jsx` import from `App.jsx`
- Removed from `SIDEBAR_TABS`, `MORE_ROWS`, `renderTab`
- Removed `wdRunning`/`setWdRunning` state; references cleaned up

**Change 2 — DCA merged into Portfolio:**
- Removed `DCATab.jsx` as standalone tab
- Added `DCASheet` component inline in `PortfolioTab.jsx` — Framer Motion bottom sheet (mobile) or side panel (desktop)
- Mobile: slides up from bottom, drag-to-dismiss, drag handle pill
- Desktop: slides in from right, close button
- Backdrop tap-to-close on both. Identical DCA logic (same prompt, same API call)
- Trigger: "DCA Allocator" button below holdings list (shown only when positions exist)

**Change 3 — Updates tab (Roadmap + Changelog merged):**
- Created `src/components/UpdatesTab.jsx` with two accordion sections
- Roadmap section: open by default; same ROADMAP data from constants
- Changelog section: collapsed by default; consolidated entries (v0.1.0–v0.4.0)
- Accordion: chevron rotates, `AnimatePresence` height animation, independent toggles

**Change 4 — Navigation updated:**
- `SIDEBAR_TABS`: 7 tabs — Portfolio, Council, Chat, Scout, Alpha, Updates, Settings (+ Debug)
- `MORE_ROWS`: Alpha Tracker, Updates, Settings
- `BottomNav.MORE_IDS`: `['alpha','updates','settings','debug']`
- Bottom nav unchanged: Portfolio, Council, Chat, Scout, More

**Change 5 — MarketOverlay stripped:**
- Removed all particle effects: twinkle stars, constellation lines, shooting star, scan bars, aurora bands, dawn pulse
- Kept only: ambient color tint (subtle radial gradient, blur 32px) for each market state
- Removed all unused CSS keyframes + classes from `index.css`: `twinkle`, `shootStar`, `scanMove`, `scanSlow`, `dawnPulse`, `auroraShift`, `auroraSlow`, `starShimmer`, `.twinkle-star`, `.shooting-star`, `.scan-bar`, etc.
- `scan` and `blink` keyframes kept (used by other UI)

---

## 2026-06-27 (session 14)

### 6 post-redesign UI fixes

**Fix 1 — Kill all cyan/teal:**
- `src/constants/styles.js`: `CY` → `#3B82F6`, `GRN` → `#22C55E`, `RED` → `#EF4444`
- `src/components/ScoutTab.jsx`: all `#38e0d4` → `#3B82F6`, `#00C805` → `#22C55E`, `#FF3B30` → `#EF4444`
- `src/components/SettingsTab.jsx`: same replacements
- `src/components/WatchdogTab.jsx`: `ACCENT` → `#3B82F6`, error red → `#EF4444`
- `src/components/AlphaTrackerTab.jsx`: all color refs updated to new palette
- `src/components/ChatTab.jsx`: PS stance map updated
- `src/components/CouncilTab.jsx`: PS map + track buttons + error colors updated
- `src/components/ChangelogTab.jsx`: badge colors updated, SAGE purple → `#A855F7`
- `src/components/DCATab.jsx`: ACCENT `#f5c451` → `#F59E0B`
- `src/components/RoadmapTab.jsx`: `#f5c451` → `#F59E0B`

**Fix 2 — Top Movers centering on desktop:**
- Added `justifyContent: 'center'`, `maxWidth: 1200`, `margin: '0 auto'` to movers scroll row in `PortfolioTab.jsx`

**Fix 3 — Fidelity-style chart:**
- Catmull-Rom → cubic bezier smooth curves (6-control-point spline)
- Y-axis: 3 price labels at 10/50/90% of range with subtle grid lines
- X-axis: 3 date/time labels (time format for 1D range, date format for others)
- 3-stop gradient fill (more opaque at top)
- Scrub crosshair preserved; dot has white stroke ring

**Fix 4 — Spark SVG logo:**
- New `public/favicon.svg`: 6-spoke starburst with multi-stop gradient (one spoke per agent color), center node
- New `src/components/SparkLogo.jsx`: inline React SVG component
- Replaced `ArcReactor` in `App.jsx`, `TopBar.jsx`, `ChatTab.jsx` with `SparkLogo`

**Fix 5 — CouncilLoader:**
- New `src/components/ui/CouncilLoader.jsx`: 6 colored dots orbiting, pure CSS linear spin, sm/md/lg sizes
- Replaced `ArcReactor` in `AuthGate.jsx` with `CouncilLoader lg`
- Replaced `Loader2` synthesis spinner in `CouncilTab.jsx` with `CouncilLoader sm`

**Fix 6 — Agent colors:**
- `src/constants/agents.js`: REX→`#6366F1`, NOVA→`#F59E0B`, SAGE→`#A855F7`, ATLAS→`#3B82F6`, VEGA→`#EF4444`, ZEN→`#22C55E`
- ROADMAP tier colors: BUILT→`#22C55E`, HIGH VALUE→`#F59E0B`, STRONG EDGE→`#3B82F6`

**Market-closed alert guard:**
- `src/App.jsx` `checkAlerts`: added early return when `getMarketState(new Date()) === 'closed'` — alerts no longer fire on weekends or holidays

---

## 2026-06-27 (session 13)

### Full UI Redesign — Apple-clean cinematic design system

**Phase 1 — Foundation:**
- Installed `framer-motion@^11` and `@headlessui/react`
- Added Inter font from Google Fonts to `index.html`
- Rewrote `src/utils/theme.js` with new design tokens: zinc-based near-blacks (`#09090B`, `#18181B`, `#27272A`), `#3B82F6` blue accent, `#22C55E`/`#EF4444` green/red, ultra-subtle borders (`rgba(255,255,255,0.06)`). Legacy aliases preserved for backward compat.
- Rewrote `src/index.css`: stripped all CSS keyframe animations except SVG-only (ArcReactor), market overlay effects, live dot, skeleton, ambient glow. Replaced with Framer Motion equivalents. Added `.glass` utility (backdrop-filter blur+saturate). Added CSS custom properties for radius/spacing/font-family tokens.
- Created `src/components/ui/AnimatedNumber.jsx` — count-up component using Framer Motion `animate()`.
- Created `src/components/ui/Card.jsx` — glass card with optional motion hover.

**Phase 2 — Layout Shell:**
- Redesigned `App.jsx`: 72px icon-only side rail (desktop), animated tooltips on hover, shared-layout `layoutId="rail-pill"` active indicator, glass top bar offset, `AnimatePresence mode="wait"` tab transitions (opacity + y + blur), dark mode toggle in rail footer. Mobile header kept compact with accent-colored account pills.
- New `src/components/TopBar.jsx`: fixed glass top bar (desktop only), account switcher pills, dark/light toggle, sign-out.
- Redesigned `src/components/BottomNav.jsx`: glass backdrop, Framer Motion `layoutId="nav-pill"` shared layout active indicator, `whileTap` spring press, no more CSS keyframe `tab-pop`.

**Phase 3 — PortfolioTab:**
- `AnimatedNumber` hero total value (count-up on load/change, duration 1s).
- Top movers as horizontal-scroll cards with green/red border tint and `whileHover={{ y: -2 }}`.
- Holdings list: Framer Motion stagger-in (each item 50ms delay), `AnimatePresence` for expanded card (height auto-animation).
- Expanded card chevron rotates 180° on open. "Run Council" button navigates to Council tab directly.
- Range selector replaced with blue pill buttons. Summary moved to 3-column grid cards.

**Phase 4 — CouncilTab + ChatTab:**
- CouncilTab: Framer Motion stagger on agent cards, colored left border per agent, glass card background, `AnimatePresence` on synthesis card entrance (scale + opacity), blue accent on inputs and convene button, animated progress banner.
- ChatTab: Clean chat bubbles (user = blue accent pill, agent = `bgCard` pill), 3-dot typing indicator with bounce animation, glass input bar with pill input, `AnimatePresence` wrapping all messages for slide-in.

**Phase 5 — AuthGate:**
- Cinematic login screen: ambient radial glow, ArcReactor logo, clean blue sign-in button, entrance animation.

---

## 2026-06-27

### AXIOM chat mode: web search enabled for direct answers

**Bug fixed:** AXIOM's conversational path (`route=[]`) was using the router's one-liner `speak` field — generated without web search — so questions like "any positive news?" returned "no data" instead of searching.

**Fix (`src/components/ChatTab.jsx`):** The "AXIOM DIRECT ANSWER" section now makes a dedicated `callAgent` call with `useSearch=true` (compound-beta), passing the full conversation history, account context, and portfolio data block. The router's `speak` is kept as a fallback if the call fails.

**Fix (`src/constants/agents.js` — `AXIOM_CONVERSATIONAL`):** Added explicit web search instruction: AXIOM is told it has live web search and must use it when the answer isn't in provided data. Never say "I don't have real-time data."

---

## 2026-06-26 (session 12)

### Six-feature build: Scout Mode, Portfolio Alerts, AXIOM live data, AXIOM tone, Alpha vs SPY complete, debug/roadmap/changelog updates

**Task 1 — Alpha vs SPY complete (`src/constants/agents.js`):** Removed "⚡ IN PROGRESS" from the roadmap item. Now called "Alpha vs SPY Benchmark". Moved to BUILT tier (was already there but mislabeled). Updated desc to reflect completion.

**Task 2 — Scout Mode (`src/components/ScoutTab.jsx`, `src/utils/councilRunner.js`, `api/scout-cron.js`, `vercel.json`, `src/components/BottomNav.jsx`, `src/App.jsx`, `src/constants/agents.js`):**
- New Scout tab (Telescope icon) in bottom nav and sidebar. Replaces Watchdog in bottom nav (Watchdog moves to More menu).
- Two sources: user watchlist (Firestore `users/{uid}/watchlist`, pre-loaded with OKLO/LPTH/UNH/KKR/ACMR/NU/SERV/RXRX) and auto-discovery pool (30 tickers in `DISCOVERY_POOL`, 5-8 random per run).
- Single-round lightweight council per ticker via `src/utils/councilRunner.js` (reused agent prompts, key rotation, liveDataBlock — no code duplication from CouncilTab).
- 3-second delay between tickers. Progress bar shows "Scouting OKLO… 3/12".
- Results sorted by conviction desc. BUY 7+ = green highlight. Tap row to expand agent stances + rationale.
- Results stored in Firestore: `users/{uid}/watchlist/{ticker}` (watchlist) and `users/{uid}/scoutDiscovery/{ticker}` (discovery).
- Push notification via Web Notification API when BUY conviction 7+ is found.
- Vercel Cron (`api/scout-cron.js`): runs weekdays 9 AM ET (13:00 UTC). Reads watchlists via Firestore REST API. Requires `CRON_USER_IDS` env var (comma-separated UIDs). Also needs `FIREBASE_PROJECT_ID`.
- Auto-discovery toggle in Scout UI.

**Task 3 — Portfolio Alerts (`src/App.jsx`, `src/components/SettingsTab.jsx`, `src/utils/notify.js`):**
- `src/utils/notify.js`: shared utility for Web Notification API (`requestPermission`, `sendNotification`, `getPermissionState`).
- Alert checker runs on app mount and every 5 minutes (in App.jsx). Compares current changePct to threshold. Fires notification once per stock per day. Logs to `users/{uid}/alertHistory`.
- SettingsTab: new Portfolio Alerts section with notification enable button, global threshold selector (3/5/7/10%), and iOS PWA tip.
- Default threshold: 5%. Per-stock customization via `alertSettings.perStock` in App state (Firestore persistence not wired — intentional for now, local state only).

**Task 4 — AXIOM live portfolio data in chat (`src/components/ChatTab.jsx`):**
- `isPortfolioQuery(text)` detects portfolio keywords ("portfolio", "holdings", "P&L", "how did", "performance", "today", "positions", "my stocks", "green", "red", "gains", "losses", "unrealized", "total value", etc).
- When detected: fetches live quotes for all holdings, builds a PORTFOLIO DATA block (per-ticker: price, changePct, shares, cost, day gain/loss, unrealized P&L), calculates totals (total value, total day change %, total unrealized P&L), injects into AXIOM routing prompt.
- ChatTab now receives `posMap` prop from App.jsx.
- Debug mode (?debug=1) logs the full injected portfolio block to console.

**Task 5 — AXIOM conversational tone (`src/constants/agents.js`):**
- `AXIOM_CONVERSATIONAL` updated: casual, direct, market slang, no hedging, strong opinions. "MU got hammered today, whole chip sector sold off" instead of corporate analyst speak.
- `AXIOM_SYSTEM` updated to instruct the speak field to also use the same casual direct tone.

**Task 6 — Changelog, debug, roadmap:**
- ROADMAP: Alpha vs SPY Benchmark, Scout Mode, Portfolio Alerts, AXIOM Live Portfolio Data, AXIOM Natural Voice all in BUILT. "Council on Holdings (HOLD/TRIM)" kept in HIGH VALUE NEXT.
- Debug panel: `ScoutDebugSection` added to DebugTab — expandable cards per scouted ticker showing liveDataBlock, per-agent raw response + parse status + latency + key index, AXIOM synthesis raw response.
- ChangelogTab: v0.3.0 entry added.

- Files: `src/constants/agents.js`, `src/utils/councilRunner.js`, `src/utils/notify.js`, `src/components/ScoutTab.jsx`, `src/components/BottomNav.jsx`, `src/App.jsx`, `src/components/ChatTab.jsx`, `src/components/SettingsTab.jsx`, `src/components/DebugTab.jsx`, `src/components/ChangelogTab.jsx`, `api/scout-cron.js`, `vercel.json`, `CHANGELOG.md`

---

## 2026-06-26 (session 11)

### Three bug fixes: AXIOM verdict collision, double dollar sign, ZEN sizing scale

**Bug 1 — AXIOM verdict collision (`src/constants/agents.js`, `CouncilTab.jsx`, `ChatTab.jsx`, `AlphaTrackerTab.jsx`):**
AXIOM's verdict `"PASS"` was ambiguous — it meant both "gate passes (good)" for individual agents AND "skip this trade (bad)" for AXIOM's ruling. Fixed by changing AXIOM's rejection verdict from `"PASS"` to `"SKIP"`. AXIOM now returns `BUY` (approved), `WATCH` (wait), or `SKIP` (council rejects — do not enter). Updated all three synthesis prompts, all PS/STANCE_STYLE lookups, and the verdict-to-style mapping in CouncilTab, ChatTab, and AlphaTrackerTab. `PASS_FINAL` kept as a backward-compat alias (old Firestore rulings with `verdict:"PASS"` still render red with label "SKIP").

**Bug 2 — Double dollar sign (`src/App.jsx`):**
`positionsLine` was built as `` `@ $${p.cost} avg` ``. If the user typed a cost with a leading `$` (e.g. `$283.70`), the output became `@ $$283.70 avg`. Fixed by parsing cost through `parseFloat` with symbol stripping before formatting: `costNum.toFixed(2)` always produces a clean number, and the single `$` in the template is the only one.

**Bug 3 — ZEN unrealistic sizing (`src/constants/agents.js`):**
ZEN's prompt lacked account scale context and was suggesting $5,000 starters for small accounts. Added ACCOUNT SCALE rule: typical starters are $50–200; scale to stated capital; if no capital, assume ~$2,000–5,000 total; never suggest $5,000+ starter unless capital clearly supports it.

- Files: `src/constants/agents.js`, `src/components/CouncilTab.jsx`, `src/components/ChatTab.jsx`, `src/components/AlphaTrackerTab.jsx`, `src/App.jsx`

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
