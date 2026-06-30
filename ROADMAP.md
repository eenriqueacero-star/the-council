# Roadmap

Current state of planned work. Update statuses here at the end of every session.

---

## DONE (session 9)

### Layer 4 — Weekly Automated Council ✓
- [x] `runWeeklyCouncil(userIds)` in `api/cron/agents.js` — full 6-agent council on all holdings across 3 portfolios
- [x] Shared ticker caching — agent takes computed once per unique ticker, reused for Dad/Bro who share Edwin's holdings
- [x] 500ms delays between agent calls; 429 → 10s wait + retry once; sequential tickers; parallel pre-fetch of prices/news/macro
- [x] HOLD/ADD/TRIM/EXIT verdicts (distinct from manual council BUY/WATCH/SKIP)
- [x] Firestore: `users/{uid}/council_reports/{auto-id}` — portfolioLabel, createdAt, holdings[], results{}, overallSummary
- [x] Feed notification: `agentId: 'axiom'`, severity `alert` (EXIT present) or `warning`
- [x] Agent memory updated from weekly council (stances + global outlooks written after each run)
- [x] GitHub Actions cron: Monday 12:00 UTC (8am ET), `--max-time 290` for weekly-council
- [x] `vercel.json` maxDuration 300 for `api/cron/agents.js`
- [x] `src/components/CouncilReports.jsx` — report list + tap-to-detail bottom sheet with per-ticker expandable agent takes
- [x] `AgentFeed.jsx` — AXIOM added to AGENT_INFO + AGENT_FILTERS
- [x] `CouncilTab.jsx` — Feed|Reports toggle; renders AgentFeed or CouncilReports conditionally

---

## DONE (session 21)

### Layer 1 — Agent Background Scans ✓
- [x] `src/utils/agentFeed.js` — `writeToFeed()` client-side utility
- [x] `api/lib/firebaseAdmin.js` — firebase-admin init via `FIREBASE_SERVICE_ACCOUNT` env var
- [x] `api/lib/recon.js` — `fetchPrices`, `fetchNews`, `fetchEarnings`, `fetchTechnicals`, `fetchMacro`
- [x] `api/cron/rex.js` — RSI, MACD, golden/death cross, Bollinger Band scans (every 4h)
- [x] `api/cron/nova.js` — earnings proximity + negative news cluster alerts (daily 10am ET)
- [x] `api/cron/sage.js` — position concentration + portfolio drawdown alerts (daily 11am ET)
- [x] `api/cron/atlas.js` — VIX, yield curve, oil, fed rate, CPI macro alerts (9am + 5pm ET)
- [x] `api/cron/vega.js` — sharp drops, news clusters, confirmed downtrend alerts (every 4h)
- [x] `api/cron/zen.js` — sub-threshold positions + size imbalance alerts (daily 12pm ET)
- [x] `.github/workflows/agent-crons.yml` — GitHub Actions cron triggers for all 6 agents
- [x] `CRON_SECRET` Bearer auth on all endpoints
- [x] `firebase-admin` added to `package.json`
- [x] `vercel.json` maxDuration entries for all 6 cron endpoints
- [x] Edwin setup: needs `FIREBASE_SERVICE_ACCOUNT`, `CRON_SECRET`, `CRON_USER_IDS` in Vercel; `CRON_SECRET` + `VERCEL_APP_URL` in GitHub secrets

### Layer 2 — Council Feed UI ✓
- [x] Feed section inside Council tab: `onSnapshot` on `users/{uid}/agent_feed`, newest-first, limit 50
- [x] Feed cards: agent emblem, agent name in color, severity badge, headline, expandable detail, ticker chips, relative timestamp
- [x] IntersectionObserver auto-marks items read when scrolled into view; "Mark all read" batch button
- [x] Tap-to-detail: bottom-sheet (Framer Motion spring) with full content and Dismiss button
- [x] Agent + severity filter chips; staggered card entrance animation
- [x] Unread count badge on Council tab in BottomNav (red dot with count, persists across tabs)

### Layer 3 — Agent Memory + Persistent Stances ✓
- [x] `api/lib/agentMemory.js` — server-side Admin SDK: `updateStance`, `updateGlobalOutlook`, `getStance`, `getAllStances`, `getAllGlobalOutlooks`, `getStaleStances`, `getAgentFullMemory`, `buildMemorySummary`
- [x] `src/utils/stanceMemory.js` — client-side: `loadTickerStances`, `loadGlobalOutlooks`, `buildMemoryBlock`
- [x] Firestore schema: `users/{uid}/agent_memory/{agentId}__{TICKER}` — stance, conviction, reasoning, history[], staleAfter (+30 days)
- [x] REX cron: stance derived from technical signals per ticker + global outlook; flip → HIGH alert; stale check
- [x] NOVA cron: stance from news/earnings catalysts per ticker + global outlook; flip → HIGH alert; stale check
- [x] SAGE cron: stance from concentration risk per ticker + global health outlook; flip → HIGH alert; stale check
- [x] ATLAS cron: global macro outlook from VIX/yield/oil/Fed/CPI signals; macro flip → HIGH alert (no per-ticker stances)
- [x] VEGA cron: bearish stance on confirmed downtrends/sharp drops; global outlook from bear share; stale check
- [x] ZEN cron: sizing stances per ticker (bearish = undersized, bullish = well-sized); global from imbalance; stale check
- [x] CouncilTab: `loadTickerStances` + `loadGlobalOutlooks` in parallel prep; `buildMemoryBlock` injected per agent per round

---

## DONE (session 20)

### Voice Removal ✓
- [x] `src/hooks/useVoice.js` deleted
- [x] ChatTab: `useVoice` import, all `speak()` calls, voice toggle button, mic button, speaking indicator all removed
- [x] Footer text and input placeholder cleaned up; no voice UI remains

### News Overhaul — 24/7 with Push Notifications ✓
- [x] `isWeekend()` guard removed — news fetches every day
- [x] Hourly auto-refresh interval in news useEffect
- [x] Manual RefreshCw button next to "Market News" header, spins while loading
- [x] Push notifications for negative articles mentioning holdings (localStorage dedup, last 100)
- [x] Empty state shows Newspaper icon + "No recent news for your holdings" (no weekend message)
- [x] `notify.js` exports `pushNotify` alias

### Agent Learning System — Layer 0 ✓
- [x] `src/utils/agentLearning.js`: `resolveObservations` resolves calls after 7 days (WIN/LOSS/NEUTRAL)
- [x] `agent_observations` saved to Firestore after every council run (CouncilTab + ChatTab)
- [x] `agent_stats` accumulated per `{agentId}_{ticker}` (total calls, wins, losses, win rate, avg return, streak)
- [x] Track record injected into each agent's system prompt at council run time
- [x] Track record badge on agent cards in CouncilTab (green >60%, red <40%, zinc otherwise)
- [x] `resolveObservations` runs on app load after auth

---

## DONE (session 19)

### FRED + Alpha Vantage integration ✓
- [x] `api/get-fred.js` — 7 FRED series, yield spread computed, Firebase JWT auth
- [x] `api/get-technicals.js` — RSI/MACD/BBANDS/SMA50/SMA200, rate limit detection, golden/death cross
- [x] `src/api.js` — `getFredData()` (5-min cache) + `getTechnicals(ticker)`
- [x] CouncilTab: ATLAS gets macroContext, REX gets techContext, AXIOM gets macroBackdrop, REX rate-limit badge
- [x] ChatTab: same injection pattern in `runCouncilInChat()`
- [x] PortfolioTab: Macro Pulse collapsible section (Fed Rate / CPI / VIX / Yield Spread)

---

## DONE (recent)

### Three bug fixes ✓
- [x] AXIOM verdict collision: `"PASS"` was ambiguous (green for agents, meant red/skip for AXIOM). Fixed: AXIOM now outputs `SKIP` instead of `PASS`. Old Firestore rulings with `PASS` still render correctly via `PASS_FINAL` alias.
- [x] Double dollar sign in positionsLine: `@ $${p.cost}` doubled when user stored cost with `$` prefix. Fixed: strip non-numeric chars via `parseFloat` before formatting.
- [x] ZEN unrealistic sizing: was suggesting $5k starters for a Youth DCA account. Added ACCOUNT SCALE rule anchoring starters to $50–200 for small accounts.

---

## DONE (session 13)

### Full UI Redesign ✓
- [x] Design system: new color tokens (zinc-based darks, blue accent), CSS custom properties, Inter font
- [x] `framer-motion` + `@headlessui/react` installed
- [x] `theme.js` rewritten with new tokens; all legacy aliases preserved
- [x] `index.css` stripped CSS keyframes → Framer Motion; `.glass` utility added
- [x] `AnimatedNumber`, `Card` shared UI primitives
- [x] App.jsx: 72px icon-only side rail + tooltips, `AnimatePresence` page transitions, mobile glass header
- [x] `TopBar.jsx`: new desktop fixed glass top bar
- [x] `BottomNav.jsx`: glass, shared layout pill animation, spring press
- [x] `PortfolioTab.jsx`: animated counter hero, stagger holdings, animated expand, top movers horizontal scroll, Run Council button
- [x] `CouncilTab.jsx`: colored left border agent cards, Framer Motion stagger, blue accent inputs, animated synthesis card
- [x] `ChatTab.jsx`: clean chat bubbles, 3-dot typing indicator, glass input bar, AnimatePresence messages
- [x] `AuthGate.jsx`: cinematic login with ambient glow + entrance animation

---

## DONE (session 15)

### Tab restructure & feature merge ✓
- [x] Watchdog tab removed — all references cleaned from App.jsx, BottomNav
- [x] DCA merged into Portfolio as bottom sheet (mobile) / side panel (desktop) with Framer Motion
- [x] Updates tab created — Roadmap + Changelog in accordion (roadmap open by default, changelog collapsed)
- [x] Navigation: 7-tab side rail, 5-tab bottom nav (More menu: Alpha, Updates, Settings)
- [x] MarketOverlay particles stripped — only subtle ambient glow remains per market state

---

## DONE (session 14)

### Post-redesign UI polish ✓
- [x] Kill all cyan/teal — zero `#38e0d4` or `#00C805` in app; replaced with `#22C55E` green, `#EF4444` red, `#3B82F6` blue accent
- [x] Top Movers centered on desktop (justify-center, max-width 1200px)
- [x] Chart redesigned — Catmull-Rom bezier curves, Y-axis dollar labels + grid lines, X-axis date/time labels, 3-stop gradient fill, scrub preserved
- [x] Spark SVG logo — gradient starburst (6 spokes × agent colors); `SparkLogo.jsx` replaces all ArcReactor instances in App/TopBar/ChatTab; `favicon.svg` updated
- [x] `CouncilLoader.jsx` — 6 colored dots orbiting, pure linear spin, sm/md/lg; replaced ArcReactor in AuthGate, Loader2 synthesis spinner in CouncilTab
- [x] Agent colors: REX→`#6366F1`, NOVA→`#F59E0B`, SAGE→`#A855F7`, ATLAS→`#3B82F6`, VEGA→`#EF4444`, ZEN→`#22C55E`
- [x] Market-closed alert guard: `checkAlerts` returns early when `getMarketState` returns 'closed' (no weekend/holiday alerts)

---

## DONE (session 16)

### Agent PNG Avatars ✓
- [x] `avatar` field added to all 6 agents in `agents.js`; `AXIOM_AVATAR` exported
- [x] CouncilTab: agent cards show emblem PNG (36px), AXIOM synthesis card shows axiom.png (48px)
- [x] ChatTab: AXIOM chat bubbles use axiom.png (32px), agent bubbles use agent PNG (26px), council grid uses PNG (16px)
- [x] AlphaTrackerTab: accuracy bars show agent PNG (14px) instead of emoji
- [x] DebugTab: card title emoji removed (string context)
- [x] Zero emoji rendering references remain in JSX (grep confirmed)

### 3D Council Infrastructure ✓ (Phase 1)
- [x] `@react-three/fiber@^8`, `@react-three/drei@^9`, `three` installed (React 18 compatible)
- [x] `src/components/3d/CouncilScene.jsx` — lazy Canvas, camera, lights; ready for agents + table
- [x] `src/components/3d/AgentModel.jsx` — sphere placeholder with emissive agent-color glow + `isSpeaking` prop
- [x] `src/components/3d/CouncilTable.jsx` — hexagonal cylinder, metallic dark material
- [x] `src/components/3d/index.js` — re-exports all 3D components
- [x] Three.js lazy-loaded via dynamic import; not in initial bundle

---

## DONE (session 17)

### 3 Bug Fixes + Portfolio News ✓
- [x] Top Movers: capped at 5, mobile-responsive sizing (72px min-width, smaller fonts/padding)
- [x] BottomNav pill: centered behind icon using translate(-50%,-50%) inside 36×36 icon container
- [x] Scout Mode: mobile-responsive row layout — stacks vertically, headline wraps, agents shown as cards
- [x] Portfolio News: "Market News" section below Holdings; Finnhub news for top 5 holdings, AI summaries via Groq, sentiment/category detection, ticker pills, stagger animation, weekend guard

---

## DONE (2026-06-30)

### Chart data source: Finnhub → Twelve Data → Yahoo Finance ✓
- [x] `api/get-candles.js` rewired to `yahoo-finance2` v3 (no API key, no rate limits)
- [x] Uses `.chart()` for all 7 ranges (`.historical()` deprecated in v3)
- [x] All tickers fetched in parallel via `Promise.all`
- [x] Per-range candle cache in PortfolioTab (`candleCacheRef`) — range switches served instantly
- [x] Cache invalidated on holdings change and on manual refresh

---

## IN PROGRESS

### Alpha Tracker vs SPY ⚡
- [x] `spyEntryPrice` captured at save time (Finnhub quote) for all new Entered trades
- [x] Auto-grade (30d) computes `myReturn`, `spyReturn`, `alpha` when `spyEntryPrice` exists; stores on Firestore doc
- [x] Manual WIN/LOSS close now also stores `priceAt30d` + computes return trio
- [x] UI: "ALPHA vs SPY BENCHMARK" summary panel — Total Alpha, Avg Alpha/Trade, Beat-SPY Rate; green/red/grey by sign
- [x] UI: "vs SPY" column in trade table — `Me +X% / SPY +Y% / α +Z%` per graded Entered trade; "SPY N/A" for pre-existing trades without entry price
- [ ] Pre-existing trades: historical SPY price lookup for trades logged before this build (backfill via Finnhub candles on entry date)

---

## DONE (recent)

### Finnhub quote hardening ✓
- [x] Retry loop (3 attempts, 1 s apart) when both c and pc come back zero/null — transient miss no longer marks everything ungrounded
- [x] `[quote] Finnhub returned null price after retry` logged when all retries exhausted
- [x] 429 detection: `[quote] Finnhub 429 rate-limited` logged; `rateLimited: true` flag in response; no retry on 429
- [x] Debug RECON card now shows `rawQuote` alongside news+earnings so 429 vs outage is immediately distinguishable
- [x] ChatTab duplicate quote call eliminated — AXIOM routing step now uses same cache key as `runCouncilInChat`; second call is a cache hit
- [x] Quote + news + earnings fetched ONCE per run; shared via `liveDataBlock`/`baseContent` to all 6 agents × 3 rounds — never re-fetched per agent or per round

### VEGA hard ban on fabricated events ✓
- [x] Replaced soft "label it" rule with ABSOLUTE RULE: specific events forbidden unless in LIVE DATA headlines
- [x] Inline FORBIDDEN/ALLOWED examples so model has no ambiguity
- [x] Adversarial role preserved — strongest honest bear case, no invented events

### VEGA grounding + earnings estimated flag ✓
- [x] VEGA must frame unconfirmed risks as "general risk, not confirmed in current data" — no more inferred insider selling or peer activity
- [x] Finnhub `dateConfirmed` field now propagated as `earningsEstimated` flag
- [x] LIVE DATA earnings line labels estimated dates clearly
- [x] NOVA notes "date estimated" for unconfirmed dates near the 60-day boundary

### NOVA earnings-calendar fix ✓
- [x] `api/get-news.js` fetches earnings calendar in parallel with news; returns `nextEarnings` date + `rawEarnings`
- [x] LIVE DATA block now includes "Next earnings: YYYY-MM-DD (in X days)" line from Finnhub
- [x] NOVA prompt updated to check the earnings line first — PASS if confirmed date within ~60 days
- [x] Debug RECON card shows both rawNews and rawEarnings for verification

### Real news via Finnhub ✓
- [x] Replaced groq/compound news recon with Finnhub company-news API (real, dated, sourced headlines)
- [x] `api/get-news.js` — new serverless endpoint using existing FINNHUB_KEY
- [x] `getNews(ticker)` in `src/api.js` with 2-min cache
- [x] Both CouncilTab and ChatTab use Finnhub; compound news call fully removed
- [x] Debug panel RECON card now shows raw Finnhub JSON for verification
- [x] Honest-empty ("no recent news available") instead of fabricated fallback

### NOVA + Recon fixes ✓
- [x] NOVA catalyst gate relaxed — passes when a clearly referenced upcoming event exists, even without exact date
- [x] Recon news query now requests dated, last-3-5-day headlines only; staleness filter rejects undated generic responses
- [x] Debug panel shows raw recon response (before filtering) so news freshness is verifiable
- [x] shadcn CSS build error fixed (border/ring Tailwind color extensions)

### Debug Panel ✓
- [x] `?debug=1` URL param gates the Debug tab — zero clutter in normal use
- [x] Captures LIVE DATA block, all 6 agents × 3 rounds (prompt, raw response, parse OK, stance, timing, key index), and AXIOM synthesis
- [x] Copyable cards for each section; truncated pre-blocks with expand links
- [x] State persists after run completes; survives tab switches

### Agent Tuning ✓
- [x] **PROTOCOLS expanded** — downtrend definition explicit (lower highs + lower lows over multiple weeks; single red day never counts), 4-Gate rule spelled out, Stability Rule (anti-flip-flop), Live Data Rule added
- [x] **REX** — DOWNTREND STANDARD block: must see lower highs AND lower lows across multiple weeks; ambiguity defaults to CAUTION not FAIL
- [x] **NOVA** — CATALYST STANDARD: earnings dates must come from live search or LIVE DATA; never from memory; unconfirmed date does not clear Gate 1
- [x] **SAGE** — RISK STANDARD: all risk flags grounded in LIVE DATA and account context; small starter mitigates sizing risk
- [x] **ATLAS** — GATE 4 STANDARD: only fail on real macro stress visible in LIVE DATA; background uncertainty is not a headwind
- [x] **VEGA** — BEAR CASE STANDARD: confirmed facts only; no fabricated risks; trend call stays with REX
- [x] **ZEN** — SIZING STANDARD: price from LIVE DATA only; never from memory; stance reflects position feasibility, not stock quality

### Alpha Tracker rework ✓
- [x] **"Track This Trade" button** — council no longer auto-saves; user explicitly clicks Entered or Watching on the AXIOM card
- [x] **Entered / Watching states** — stored as `status` field on rulings doc; badge shown in tracker table
- [x] **Delete + edit entries** — trash icon with two-click confirm; Watching rows show → ENT reclassify button
- [x] **Real outcome states** — WIN / LOSS manual close buttons; auto-grade only fires on Entered trades
- [x] **Stats filter to Entered trades only** — win rate and agent accuracy exclude Watching calls

---

## NEXT

### 3D Council Meeting — Phase 2
Animated scene where agent characters sit around the hexagonal table and present verdicts. R3F infrastructure installed (Phase 1 done). Next: design agent 3D models, speaking animations (emissive pulse + camera focus), camera choreography (cut to speaking agent), GLTF model import.

### Council on Holdings (HOLD/TRIM)
Point the same 6-agent council at existing positions, not just new buys. Verdict options: HOLD, TRIM, ADD, EXIT.

### Scout Mode
Council auto-runs on the watchlist and surfaces only tickers that score 7+ and pass all 4 gates.

### Alpha Tracker vs SPY — historical backfill
Pre-existing Entered trades (logged before this build) show "SPY N/A". To backfill: use Finnhub candle data for SPY on the entry date and write `spyEntryPrice` retroactively. Then the next grade/close will compute alpha correctly.

---

## LATER

### Learning System (3-layer)

**Layer 0 — Agent observation tracking ✓** (session 20)
- [x] `agent_observations` Firestore collection — verdict, price, resolution after 7 days
- [x] `agent_stats` Firestore collection — win rate, avg return, streak per agent per ticker
- [x] Track record injected into agent prompts; badge on CouncilTab cards

**Layer 1 — Shared knowledge base**
- [ ] Firestore doc (`users/{uid}/data/knowledge`) all agents read before deliberating
- [ ] Manually curated: sector rotation notes, macro regime, watchlist rationale
- [ ] Injected as a preamble block in `baseContent`

**Layer 2 — Self-learning from Alpha Tracker**
- [ ] After each graded ruling, compute per-agent accuracy and conviction calibration
- [ ] Inject summary stats into agent prompts: "Your recent BULLISH calls: 4/6 correct, avg conviction 7.2"
- [ ] Agents should weight their own track record when calibrating confidence

**Layer 3 — Scheduled Morning Brief**
- [ ] Vercel Cron job (daily pre-market) that runs a lightweight council pass on watchlist tickers
- [ ] Output posted to a Firestore `briefs/{date}` doc, surfaced in a new "Morning Brief" tab
- [ ] Requires Vercel Cron config (`vercel.json`) and a dedicated `/api/morning-brief.js` handler

---

## DONE

- [x] Alpha Tracker rework (see above)
- [x] In-app ruling deletion removed (purge button)
- [x] Firestore database created; cross-device sync via `users/{uid}/...`
- [x] localStorage fallbacks removed — Firestore only
- [x] Model migration: `llama-3.3-70b-versatile` → `gpt-oss-120b` (agents + synthesis) + `groq/compound` (recon)
- [x] Shared recon architecture: live SPY/TLT/GLD/VIX/SOXX/SMH/XLK fetched once, per-role suffixes injected
- [x] Parse-failure hardening: `extractJSON` balanced-brace scan + fence stripping + unescape retry
- [x] Agent prompts: raw JSON output only, no markdown fences
- [x] Empty-response fix: `reasoning_effort: 'low'` + empty-response retry
- [x] Synthesis failure fix: real error logging + 200+warning response + medium effort + 429 retry
- [x] Stock logos: Clearbit → Google S2 favicons
- [x] TPM fix: reduced agent max_tokens, trimmed synthesis input to final round only
- [x] Key distribution: 6 agents round-robin across 5 keys; synthesis pinned to last key; sleep 18s → 4s
