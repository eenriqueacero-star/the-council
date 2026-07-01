# Changelog

Reverse-chronological. Update this file at the end of every session before pushing.

---

## 2026-07-01 (session 12 — Fix: Vercel 12-function limit)

### Serverless function count fix
- **`api/lib/` → `api/_lib/`** — renamed lib directory to `_lib` so Vercel's function discovery skips it (Vercel excludes `_`-prefixed paths from the function count)
- **`api/cron/agents.js`** — updated all four lib imports from `'../lib/'` to `'../_lib/'`
- Result: 9 counted serverless functions (down from 13), well under the Hobby plan's 12-function limit

---

## 2026-06-30 (session 11 — Polish: Push Notifications, Onboarding, Settings, Loading, Share/Export)

### Part 1 — Push Notifications (server-side from cron)
- **`api/lib/pushNotify.js`** — new server-side Web Push helper using firebase-admin to load subscriptions, `sendPushToUser(userId, opts)` with per-severity dedup windows (alert: 4 h, warning: 15 min), `notification_log` Firestore collection for dedup tracking, stale endpoint pruning
- **`api/cron/agents.js`** — `writeFeed` now fire-and-forgets `sendPushToUser` for every alert/warning feed item; agent emoji used in push titles (⚡ REX, 🔥 NOVA, 🛡️ SAGE, 🌍 ATLAS, 🐻 VEGA, ⚖️ ZEN, 👑 AXIOM)
- **`web-push` npm package** — added to `package.json` and `node_modules` (was imported in `api/send-push.js` but missing from deps)

### Part 2 — Onboarding Flow
- **`src/components/OnboardingFlow.jsx`** — 5-screen full-screen walkthrough:
  - Screen 1 Welcome: animated SparkLogo scale-in + glow
  - Screen 2 Meet the Agents: auto-advancing carousel (3s) + manual dot navigation through 6 agents + AXIOM; agent-colored card with description
  - Screen 3 Portfolio: descriptive text + [Set Up Portfolio] navigates to Portfolio tab
  - Screen 4 Notifications: `enablePush()` via existing Web Push; granted/denied/unsupported states
  - Screen 5 Ready: mini council (6 agent emblems in a circle + AXIOM center with crown)
  - Framer Motion slide-left transitions; dot progress indicator
  - Completion writes `hasSeenOnboarding: true` to `users/{uid}/data/preferences`
- **`src/App.jsx`** — checks `hasSeenOnboarding` on auth state change; shows `OnboardingFlow` overlay; "Replay Onboarding" available in Settings

### Part 3 — Settings Expansion
- **`src/components/SettingsTab.jsx`** — fully rewritten with sections:
  - Profile: display name, email, Sign Out
  - Appearance: dark mode toggle
  - DCA Schedule: per-account editable amounts saved to `users/{uid}/data/settings.dca`
  - Notifications: Web Push toggle using `enablePush`/`disablePush` from `push.js`; price alert threshold picker
  - Display: Replay Onboarding button
  - Data: Export Portfolio CSV (downloads file from Firestore); Clear Agent Feed (deletes last 50 docs); Delete Account with confirmation modal
  - About: version, stack credits
- Uses `toast` for feedback on all actions

### Part 4 — Skeleton Loading + Toast System
- **`src/components/ui/Skeleton.jsx`** — reusable shimmer skeleton (`<Skeleton>`, `<SkeletonCard>`, `<SkeletonRows>`)
- **`src/utils/toast.js`** — global event-bus toast API: `toast.success()` (3 s), `toast.error()` (stays), `toast.info()` (5 s)
- **`src/components/ui/Toast.jsx`** — `ToastContainer` renders slide-down animated toasts, max 3 stacked, dismiss button
- **`src/index.css`** — `@keyframes skeleton-shimmer` + `.skeleton-shimmer` class
- `CouncilReports.jsx` loading state replaced with 3-card skeleton shimmer

### Part 5 — Share / Export
- **`src/components/CouncilReports.jsx`** — Share button in report detail sheet: `navigator.share()` (Web Share API) with text fallback to clipboard; formatted report text includes ticker verdicts, confidence, AXIOM summary
- Settings → Data → Export Portfolio: downloads `council-portfolio-YYYY-MM-DD.csv` with Account/Ticker/Shares/Avg Cost columns

### PWA Icons
- **`scripts/gen-icons.cjs`** — pure Node.js PNG generator (no deps): CRC32, zlib deflate, point-in-polygon spark rasterization, angle-based gradient (blue→purple→red→amber→green)
- **`public/icons/badge-96.png`** (3.1 KB), **`icon-192.png`** (8.4 KB), **`icon-512.png`** (25.9 KB), **`apple-touch-icon.png`** — generated
- `public/manifest.json` — added apple-touch-icon entry
- `index.html` — apple-touch-icon href updated to point to actual file

---

## 2026-06-30 (session 10 — Layer 5: 3D Council Chamber)

### Feature — React Three Fiber Council Chamber

Live 3D scene rendered as the hero at the top of the Council tab. Lazy-loaded so Three.js stays out of the initial bundle (lands only when Council tab first mounts).

**New files:**
- `src/components/3d/CouncilChamber.jsx` — all 3D scene content (~540 lines)
- `src/components/3d/CouncilScene.jsx` — Canvas wrapper (rewritten; lazy-import entry point)
- `src/components/3d/index.js` — re-exports both

**Scene parts implemented:**
- **Part 1 — Layout:** Hex table (6-sided cylinder) + 6 floating geometric agent avatars around it (icosahedron, octahedron, torus, dodecahedron, tetrahedron, torusKnot) + AXIOM sphere at elevated center with 3 counter-rotating torus rings
- **Part 2 — Energy channels:** Quadratic Bezier curves from each agent seat to AXIOM (cyan), plus 3 cross-link diagonal channels (purple)
- **Part 3 — Conflict lightning:** 80ms interval regenerates jagged polyline arcs between disagreeing agents (bullish vs bearish stance pairs from Layer 3 memory); blended color from both agents
- **Part 5 — Verdict slam:** 4-phase animation on `synthesis.status === 'done'`: dim (500ms) → charge (1000ms) → slam (1700ms) → settle (1600ms) → null. Expanding shockwave torus + Html overlay with verdict/headline
- **Part 6 — Consensus ring:** 6 torus arc segments (one per agent), lit by agent color, brightness driven by agent round state (running/done/idle)
- **Part 7 — Data rain:** 110 instanced `<boxGeometry>` particles falling through the scene; color shifts to the speaking agent's accent when active
- **Part 8 — Agent power auras:** `emissiveIntensity` scaled by Firestore `win_rate` from `agentStatsMap` — high win rate → brighter aura
- **Part 10 — Camera:** `<OrbitControls>` from drei with cinematic auto-rotate (1 revolution per 60s); interactive takeover on user drag; 10s inactivity timer resets to auto-rotate; `maxPolarAngle` prevents going below the table
- **Part 11 — Performance:** `<AdaptiveDpr pixelSizes={[0.75, 1.5, 2]}>` + scene fog; instanced mesh for data rain

**`src/components/CouncilTab.jsx` changes:**
- `sceneStances` state: `tickerStances` persisted to state after `convene()` Promise.all so the 3D scene always shows the most recent stance data
- `speaking` derived from `agentState`: the currently running agent ID, or `'synthesis'` when AXIOM deliberates, or `null`
- `<CouncilScene>` rendered at top of return (above ticker input) inside `<Suspense>` with dark loading placeholder
- `agentStatsMap` (already in state) passed to scene as `agentStats`

**Deferred (not implemented):**
- Part 4: Mini stock charts floating near each agent (needs per-agent chart data)
- Part 9: Live ticker ribbon around table edge (needs all-holdings price polling)
- Part 11 quality toggle: explicit High/Low switch UI

---

## 2026-06-30 (session 9 — Layer 4: Weekly Automated Council)

### Feature — Weekly Council on All Holdings

Every Monday at 8am ET, the full 6-agent council runs automatically on every holding across all 3 portfolios (Edwin/Dad/Bro) and stores a structured report in Firestore for each user.

**`api/cron/agents.js`** — Added `runWeeklyCouncil(userIds)` handler:
- Gathers unique tickers across all portfolios; runs each only once (shared ticker caching for NVDA, NBIS, MU, AMD, SNDK, CRDO, APPL, ALAB held across Edwin/Dad/Bro)
- Parallel pre-fetch: prices, news, earnings, macro (FRED), agent global outlooks
- Per ticker (sequential): fetchTechnicals + getAllStances → 6 agents (500ms delays, HOLD/ADD/TRIM/EXIT verdicts) → AXIOM synthesis → update agent memory stances
- 429 handling: 10s wait + one retry per call
- Per-user: builds report from cached results, saves to `users/{uid}/council_reports/{auto-id}` with portfolioLabel, createdAt, holdings[], results{}, overallSummary
- Feed notification: `agentId: 'axiom'`, severity `'alert'` (if any EXIT verdicts) or `'warning'`, headline with verdict tally
- `WEEKLY_AGENT_DEFS` array maps short cron IDs (rex, nova…) to role/focus for single-round weekly prompts

**`.github/workflows/agent-crons.yml`** — Added Monday 12:00 UTC schedule + `DOW` detection:
- New cron: `0 12 * * 1`
- `weekly-council` uses `--max-time 290`; all other agents stay at `55`

**`vercel.json`** — Increased `api/cron/agents.js` maxDuration from 120 to 300

**New file: `src/components/CouncilReports.jsx`** — Weekly report viewer:
- `onSnapshot` on `users/{uid}/council_reports`, ordered by `createdAt` desc, limit 10
- Report list cards: AXIOM avatar, portfolio label, date, verdict count chips (N HOLD / N TRIM / N EXIT), truncated summary
- Tap opens `ReportDetailSheet` — Framer Motion spring bottom sheet (stiffness 380, damping 34)
- Per-ticker `TickerRow`: expandable row showing AXIOM synthesis first, then 6 `AgentTakeCard` items
- `AgentTakeCard`: agent avatar, name in agent color, stance text, `ConvictionBar`, `VerdictBadge`, reasoning
- Verdict palette: HOLD (green #22C55E), ADD (blue #3B82F6), TRIM (amber #F59E0B), EXIT (red #EF4444)
- Empty state: FileText icon + "Reports are generated every Monday at 8am ET."

**`src/components/AgentFeed.jsx`** — AXIOM added:
- Import `AXIOM_AVATAR` from `constants/agents.js`
- `AGENT_INFO['axiom'] = { name: 'AXIOM', color: '#F59E0B', avatar: AXIOM_AVATAR }` after AGENTS.forEach loop
- `AGENT_FILTERS` extended to include `'AXIOM'`

**`src/components/CouncilTab.jsx`** — Feed|Reports toggle:
- Import `CouncilReports` from `./CouncilReports.jsx`
- `feedOrReports` state (default `'feed'`)
- Toggle buttons ("Agent Feed" | "Weekly Reports") rendered above the feed section
- Conditionally renders `<AgentFeed>` or `<CouncilReports>` based on selection

---

## 2026-06-30 (session 8 — Layer 3: Agent Memory + Persistent Stances)

### Feature — Persistent Agent Stance Memory

Each of the 6 cron agents now maintains a persistent stance on every holding and a global market outlook, stored in Firestore and injected into manual Council runs.

**New file: `api/lib/agentMemory.js`** — Server-side (Admin SDK) utilities:
- `getStance / getAllStances / getAllGlobalOutlooks / getAgentFullMemory / getStaleStances` — read helpers
- `updateStance(userId, agentId, ticker, {stance, conviction, reasoning})` — upserts a stance doc, pushes prior stance to `history[]` (capped at 20) when the stance direction changes, detects bullish↔bearish flips, returns `{ flipped, from, to, daysSincePrevious }`; resets `staleAfter` to +30 days
- `updateGlobalOutlook(userId, agentId, {outlook, conviction, reasoning})` — shorthand calling `updateStance` with ticker `_GLOBAL`
- Schema: `users/{userId}/agent_memory/{agentId}__{TICKER}` — fields: agentId, ticker, stance, conviction, reasoning, history[], createdAt, updatedAt, staleAfter

**New file: `src/utils/stanceMemory.js`** — Client-side (Firestore JS SDK) utilities:
- `loadTickerStances(uid, ticker)` — parallel getDoc for all 6 agents on a ticker
- `loadGlobalOutlooks(uid)` — all 6 agents' global market outlooks
- `buildMemoryBlock(agentDomainId, ticker, tickerStances, globalOutlooks)` — returns formatted string for LLM prompt injection: "## COUNCIL MEMORY" with agent's own prior stance, other agents' stances on same ticker, and all agents' global outlooks

**`api/cron/agents.js`** — All 6 agents updated with stance memory:
- **REX**: derives stance from RSI/MACD/SMA cross/price-vs-SMA200 signals; tracks bullish/bearish signal count; calls `updateStance` per ticker; flip → HIGH alert; after all tickers, derives global outlook (bullish if ≥60% bullish); stale check (≥32 days) writes info feed
- **NOVA**: derives stance from negative news clusters (bearish) + near earnings + positive news (bullish); flip → HIGH alert; global outlook from bull/bear distribution; stale check
- **SAGE**: derives stance from position concentration pct (≥35% → bearish, 25-35% → neutral, <25% → bullish); flip → HIGH alert; global outlook from portfolio health (drawdown + concentration); stale check
- **ATLAS**: derives global macro outlook from VIX level (≥30 bearish, ≥25 cautious, <18 bullish), yield inversion (bearish), oil spike, Fed hike/cut, CPI trend; calls `updateGlobalOutlook` per user inside the existing userIds loop; macro stance flip → HIGH alert. Atlas has no per-ticker stances (macro only)
- **VEGA**: derives stance per ticker (bearish if drop >5% OR price below both SMAs; neutral otherwise); flip → HIGH alert; global outlook from share of bearish holdings (≥50% → bearish, ≥25% → cautious); stale check
- **ZEN**: derives sizing stance (bearish if position <$50, neutral if largest in a ≥5x imbalance, bullish if adequately sized); flip → HIGH alert; global outlook from undersized count + imbalance; stale check

**`src/components/CouncilTab.jsx`** — Memory injected into every manual Council run:
- Added `import { loadTickerStances, loadGlobalOutlooks, buildMemoryBlock } from '../utils/stanceMemory.js'`
- Added `tickerStances` and `globalOutlooks` to the parallel Promise.all prep block (alongside profiles, FRED, technicals)
- Per agent per round: `buildMemoryBlock(ag.id, upperTicker, tickerStances, globalOutlooks)` inserted between profileCtx and roundPromptSuffix in `userMsg`; each agent sees its own prior stance, peers' current stances on the ticker, and all global outlooks

---

## 2026-06-30 (session 7 — Layer 2: Council Feed)

### Feature — Agent Feed (Live Stream inside Council Tab)

**New file: `src/components/AgentFeed.jsx`**

Reads `users/{uid}/agent_feed` in real-time via Firestore `onSnapshot` (newest-first, limit 50). Placed as a section at the bottom of the Council tab.

- **FeedCard component:** agent emblem (28px img), agent name in agent's color, severity badge (HIGH/MED in red/amber), bold headline, truncated detail with "more/less" expand, ticker chips, relative timestamp ("2h ago"), unread indicator dot. Left border color reflects severity/agent. `IntersectionObserver` (threshold 0.5) marks each card `read: true` in Firestore as it scrolls into view.
- **Tap-to-detail:** `DetailSheet` bottom-sheet slides up with Framer Motion spring (`stiffness 380, damping 34`). Shows large agent emblem (56px), full headline + body (no truncation), ticker chips, full date/time, severity badge, Dismiss button.
- **Filter chips:** All | REX | NOVA | SAGE | ATLAS | VEGA | ZEN + severity sub-filter (All | High | Med). Filters are client-side (already have all 50 docs).
- **Mark All Read:** batch `writeBatch` updates all unread docs in one round-trip.
- **Staggered animation:** each card fades+translates in with `delay: min(i × 50ms, 300ms)`.
- **Empty state:** BellOff icon + "Your agents haven't reported anything yet…" when no docs; different message when filter produces zero results.
- **Severity mapping:** `alert` → HIGH (red), `warning` → MED (amber), `info` → LOW (subtle).
- Agent lookup built from `AGENTS` array: `agentId: 'rex'` → `{ name:'REX', color:'#6366F1', avatar:'/agents/rex.png' }`.

**`src/App.jsx`:**
- Added `query, where` to firestore imports.
- Added `feedUnreadCount` state.
- Inside `onAuthStateChanged` block: added second `onSnapshot` listener on `agent_feed` filtered by `where('read', '==', false)` to track unread count independently of whether Council tab is mounted. Cleans up with `feedUnsub()` on auth change or unmount.
- Passes `feedUnreadCount` to `<BottomNav>`.

**`src/components/BottomNav.jsx`:**
- Accepts `feedUnreadCount` prop (default 0).
- When `feedUnreadCount > 0`, renders a red badge (14px circle, `#EF4444`) in the top-right of the Council tab icon. Shows digit count (capped at "9+" for 10+). Badge has a 1.5px border matching nav background for crisp cutout on both dark/light.

**`src/components/CouncilTab.jsx`:**
- Imports `AgentFeed`.
- Renders `<AgentFeed dark={dark} />` at the bottom of the council content, after the empty state prompt. All existing council functionality untouched.

---

## 2026-06-30 (session 6 — iOS PWA fix)

### Fix — iOS True Full-Screen PWA + Safe Area

**Goal:** Eliminate all white/gray gaps on iPhone (notch, home indicator, safe area strips) when installed as a PWA.

**`src/index.css`** — Rewrote html/body/#root layout to flex-column pattern:
- `html { height: 100%; background-color: #18181b; }` — fills background behind notch
- `body { height: 100%; overflow: hidden; background-color: #18181b; -webkit-text-size-adjust: 100%; }` — solid bg, no overflow
- `#root { height: 100dvh; display: flex; flex-direction: column; padding-top: env(safe-area-inset-top); overflow: hidden; }` — root is flex column (NOT scroll container); `padding-top` handles notch/Dynamic Island

**`public/manifest.json`:**
- `background_color` + `theme_color` updated to `#18181b` (was `#070a0c`)
- Added `"orientation": "portrait"`

**`src/App.jsx`** — Four changes for proper flex-column layout:
- Outermost div: `height: 100%, display: flex, flexDirection: column, overflow: hidden` (removed `minHeight: 100%` and `paddingTop: env(safe-area-inset-top)` — now handled by #root CSS)
- `lg:ml-[72px]` main content div: `flex: 1, minHeight: 0, display: flex, flexDirection: column, overflow: hidden`
- Mobile header div: removed `position: sticky` and `top: env(safe-area-inset-top)` — now a `flexShrink: 0` flex child, always visible outside scroll container
- New inner scroll container wrapping all tab content: `flex: 1, minHeight: 0, overflowY: auto, WebkitOverflowScrolling: touch`; tab motion.div gets `paddingBottom: calc(72px + env(safe-area-inset-bottom, 0px))`

**`src/components/BottomNav.jsx`:**
- Dark mode background: `#09090B` → `#18181b` to match html/body/#root, so the safe-area strip below the home indicator is the same color as the nav

---

## 2026-06-30 (session 6)

### Feature — Chart Interaction Upgrade (Robinhood-level)

Five features added to `src/components/PortfolioTab.jsx`:

**1. Touch Scrub with Haptics**
- `handleMove` replaced by `handleScrubMove` — RAF-throttled (`requestAnimationFrame`), no React setState per pixel.
- Crosshair fires `navigator.vibrate(1)` each time the scrub crosses a new data point.
- Scrub state split into `scrubIdx` (chart crosshair position) + `scrubVal/scrubTs` (hero display values), so the P&L header updates only on index transitions, not on every mousemove pixel.
- `touchAction: 'none'` on chart div prevents browser scroll-hijacking the scrub.

**2. Individual Stock Charts**
- New `StockDetailSheet` component: bottom-sheet on mobile, side panel (440px) on desktop.
- Opens via "Chart" button in each holding's expanded detail panel (`TrendingUp` icon).
- Has its own range selector, per-range candle cache (useRef), same Catmull-Rom chart style, and shows ticker stats (shares, avg cost, total return, P&L).
- `catmullRomPath` lifted to module scope so both components share it.

**3. Animated Range Transitions**
- `renderChart()` call site wrapped in `<AnimatePresence mode="wait">` + `motion.div key={chart-${range}-${chartKey}}`.
- Each range switch fades in (opacity 0→1, scale 0.985→1, 220 ms) and fades out cleanly.
- StockDetailSheet also wraps its chart in `AnimatePresence` with the same transition.

**4. Enhanced Ambient Session Hue**
- Open-market pulse: opacity `[0.2, 0.32, 0.2]` (was `[0.18, 0.28, 0.18]`), duration 2.8s.
- Radial gradient ellipse broadened to 90% × 65% and pushed lower (`at 50% 75%`).
- SVG drop-shadow glow scaled to 6px during market open (was 5px), using `${ambientColor}77` (was `66`).
- `scrubSession` now computed from `scrubTs` (stable across renders) instead of `effectiveTimes[scrubIdx]`.

**5. Pinch-to-Zoom (chart area only — page zoom still disabled)**
- `zoomLevel` (1–8×) and `panOffset` (0–1) added as component state.
- `handleTouchStart`: two-finger pinch starts zoom, records start distance/zoom/pan; single-finger starts pan when zoomed > 1; double-tap (< 300 ms) resets zoom+pan.
- `handleTouchMoveAll`: two-finger → `setZoomLevel`; single-finger zoomed → `setPanOffset`; else → scrub.
- Zoom slices `effectivePoints`/`effectiveTimes` to a `visibleCount = max(5, round(allLen / zoomLevel))` window anchored by `panOffset`.
- Y-axis auto-scales to the visible window. Zoom level badge (e.g. "2.4×") overlaid top-right when zoomed.
- `useEffect([range])` resets zoom + pan + scrub on range switch.

---

## 2026-06-30 (session 5)

### Fix — iOS safe-area follow-up: white bottom bar + viewport shrink

**Issue 1 — Viewport felt smaller (`src/index.css`):**
`position: fixed` on `html` and `body` was compressing the viewport. Replaced with:
- `html { height: 100%; overscroll-behavior: none; }`
- `body { height: 100%; overflow: hidden; overscroll-behavior: none; background-color: #18181b; }`
- `#root { height: 100vh; height: 100dvh; overflow-y: auto; }` — `100dvh` (dynamic viewport height) correctly accounts for iOS browser chrome appearing/disappearing; `100vh` is the fallback for older iOS.

**Issue 2 — White bar at bottom (`src/components/BottomNav.jsx`, `src/App.jsx`):**
- BottomNav had `height: 80` fixed + `paddingBottom: env(safe-area-inset-bottom)`. On iPhone (34px home-indicator inset), this left only ~36px for button content — too small and visually broken.
- Fixed by removing `height: 80` entirely; nav now sizes to content naturally (paddingTop 10 + buttons ~52px + safe-area padding).
- Background changed from `rgba(9,9,11,0.92)` (8% transparent) to solid `#09090B` — semi-transparency was letting the body background show through in the safe-area strip, causing the white bar.
- Removed `glass` class from nav (backdrop-filter has no effect on a solid background).
- Tab content `paddingBottom` updated from fixed `96px` → `calc(72px + env(safe-area-inset-bottom, 0px))` so content clears the dynamic nav height plus the home indicator.

---

## 2026-06-30 (session 4)

### Fix — iOS mobile: disable pinch-zoom + bounce, fix white status-bar gap

**Issue 1 — Pinch-to-zoom and page bounce (`index.html`, `src/index.css`):**
- Viewport meta updated: added `maximum-scale=1.0, user-scalable=no, viewport-fit=cover`
- `html, body` locked with `overflow: hidden; overscroll-behavior: none; touch-action: manipulation; position: fixed; width: 100%; height: 100%`
- `#root` becomes the single scroll container: `height: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: none`
- `background-color: #18181b` on `#root` fills the notch/status-bar area before React renders

**Issue 2 — White bar at top (`index.html`, `src/index.css`, `src/App.jsx`):**
- `theme-color` updated from `#09090B` → `#18181b` (zinc-900, matches status bar area)
- `apple-mobile-web-app-capable` and `apple-mobile-web-app-status-bar-style: black-translucent` were already present
- `paddingTop: 'env(safe-area-inset-top)'` added to the outermost App wrapper div so content clears the notch
- Mobile header sticky position changed from `top: 0` → `top: env(safe-area-inset-top, 0px)` so it sticks below the notch (not behind it) after scroll
- `minHeight: '100vh'` on App wrapper changed to `minHeight: '100%'` (correct inside fixed-body scroll container)

---

## 2026-06-30 (session 3)

### Fix — Chart data source: Twelve Data → Yahoo Finance (yahoo-finance2)

Twelve Data free tier is 8 calls/minute — with 9 tickers that's an instant 429. Switched to `yahoo-finance2` (no API key, no hard rate limits, covers all tickers including small caps like CRDO, ALAB, NBIS, APLD).

**`api/get-candles.js` — complete rewrite:**
- Replaced Twelve Data HTTP fetch with `yahoo-finance2` v3 (`new YahooFinance()`)
- Uses `.chart()` for all 7 ranges — `.historical()` is deprecated in v3
- All tickers fetched in parallel via `Promise.all` (no sequential delays needed)
- No API key required; `TWELVE_DATA_KEY` no longer used in code
- Resolution mapping:
  | Range | interval | period1 |
  |-------|----------|---------|
  | 1D    | 5m       | now − 20h (covers 4 AM–8 PM ET extended session) |
  | 1W    | 1d       | now − 7d |
  | 1M    | 1d       | now − 30d |
  | 3M    | 1d       | now − 90d |
  | 6M    | 1d       | now − 180d |
  | 1Y    | 1d       | now − 365d |
  | ALL   | 1wk      | now − 5y |
- Bars with null `close` filtered out (extended-hours stale ticks)
- `console.error` logging preserved for Vercel visibility

**`src/components/PortfolioTab.jsx` — per-range candle cache:**
- `candleCacheRef` (`useRef({})`) stores built portfolio curves keyed by range
- Switching range pills serves from cache instantly — no network call
- Cache cleared on two events: holdings set changes (`useEffect` on `withShares.join(',')`) and explicit refresh button press
- Refresh button clears cache before calling `fetchCandles()` so data is always fresh on manual reload

---

## 2026-06-30 (session 2)

### Fix — Chart candles: add Vercel-visible logging + datetime parsing fix

Chart still showed 2 points after the Twelve Data switch. Two issues:

1. **Logs were invisible on Vercel Hobby:** `console.log` is not reliably surfaced in Vercel's runtime log viewer on the Hobby plan. Switched all `[get-candles]` output to `console.error` so logs appear in the Functions tab.

2. **Twelve Data datetime format is non-standard ISO:** For 5-min intraday bars, Twelve Data returns `"2026-06-27 09:30:00"` (space separator). `new Date("2026-06-27 09:30:00")` is not valid ISO 8601 and can return `Invalid Date` in some Node.js versions, causing all timestamps to be `NaN` and the candle array to be malformed. Fixed with `.replace(' ', 'T')` → `"2026-06-27T09:30:00"` before parsing.

**Logging added (`api/get-candles.js`):**
- Startup warning if `TWELVE_DATA_KEY` env var is not set (most likely root cause of 2-point chart)
- Before each Twelve Data fetch: logs ticker, interval, outputsize, and full URL with API key redacted
- After parse: logs `data.status`, `data.values` count, and `data.message` (error text from Twelve Data)
- Before final return: logs all tickers and their candle counts (e.g. `NVDA:22, AAPL:22`)

**Root cause most likely:** `TWELVE_DATA_KEY` not yet added to Vercel environment variables. When the key is missing, Twelve Data returns `{ status: "error", message: "..." }` → code sets `results[t] = []` → frontend falls back to 2-point synthetic line.

---

## 2026-06-30

### Fix — Chart data source: Finnhub → Twelve Data

Finnhub's `/stock/candle` endpoint consistently returns empty arrays on the free tier for historical data after 5+ fix attempts. Switched `api/get-candles.js` to Twelve Data's `/time_series` endpoint (800 calls/day free tier, reliable candle history).

**Changes (`api/get-candles.js`):**
- Replaced Finnhub `/stock/candle` with Twelve Data `/time_series`
- API key: `TWELVE_DATA_KEY` Vercel env var (Edwin must add after signing up at twelvedata.com)
- Resolution mapping updated:
  | Range | interval | outputsize |
  |-------|----------|------------|
  | 1D    | 5min     | 78         |
  | 1W    | 1day     | 5          |
  | 1M    | 1day     | 22         |
  | 3M    | 1day     | 65         |
  | 6M    | 1day     | 130        |
  | 1Y    | 1day     | 252        |
  | ALL   | 1week    | 260        |
- Always passes `prepost=true` (extended hours) and `timezone=America/New_York`
- Response transformation: values are strings → `parseFloat`/`parseInt`; array is newest-first → reversed for chronological chart display
- Sequential ticker fetches with 200ms delay between each to stay under the 8 calls/min free tier limit
- Added permanent logging: `[get-candles] <ticker> range: <range> interval: <interval> points: <n>`
- Frontend response format unchanged (unix-second timestamps, o/h/l/c fields) — no frontend changes needed

**No other Finnhub usage was changed** — `get-quotes.js`, news, earnings, and all other endpoints are untouched.

---

## 2026-06-29 (session 29)

### Fix — get-candles: 1W and 1M returned empty arrays

Changed resolution for 1W and 1M from `'15'` / `'60'` (intraday) to `'D'` (daily). Finnhub free tier does not serve historical intraday candles — only the current trading day intraday is available. Using intraday resolutions for multi-day ranges caused Finnhub to return `s: "no_data"`, which the handler converted to `[]`. All 9 portfolio tickers were returning empty arrays for every range except 1D. Fix aligns 1W/1M with the already-working 3M/6M/1Y which use daily bars.

---

## 2026-06-29 (session 28)

### Feature — Chart: Robinhood-matched intervals + extended hours + ambient session hue

**Part 1 — Correct intervals (`api/get-candles.js`):**
| Range | Resolution | Window |
|---|---|---|
| 1D | 5-min bars | 20h back (captures 4AM–8PM ET extended session) |
| 1W | 15-min bars | 7 days |
| 1M | 60-min bars | 30 days |
| 3M | Daily | 90 days |
| 6M | Daily | 180 days |
| 1Y | Daily | 365 days |
| ALL | Weekly | 5 years |

**Part 2 — Extended hours live price (`renderChart`):**
- After fetching candles, if `Date.now()` is more than 5 minutes newer than the last candle timestamp, the current `totalValue` (from live `/quote` data already in state) is appended as a final data point at the current timestamp. This extends the chart naturally into after-hours without any extra API calls.
- 1D `from` is now `now - 20 * 3600`, wide enough to capture pre-market from 4:00 AM ET.

**Part 3 — Session badge (enhanced):**
- Replaced LIVE/PRE/AH/CLOSED abbreviations with full labels: `MARKET OPEN` (green), `PRE-MARKET` (blue), `AFTER-HOURS` (amber), `CLOSED` (red)
- Each label is colored to match its session

**Part 4 — 1D extended hours visual segmentation:**
- `sessionOf(ts)` helper classifies each timestamp as `'reg'` (13:30–20:00 UTC = 9:30 AM–4:00 PM EDT) or `'ext'`
- Pre-market segment: dashed `strokeDasharray="5 3"`, 40% opacity
- Regular session segment: solid, full width, full opacity
- After-hours segment: dashed, 40% opacity
- Subtle vertical divider lines at the 9:30 AM and 4:00 PM session boundaries

**Ambient session hue (session 28 enhancement):**
- Radial gradient glow div sits behind the SVG; color shifts by session (`#22c55e` open, `#60a5fa` premarket, `#f59e0b` after-hours, `#7c3aed` closed); 2s Framer Motion crossfade between sessions
- Market Open: gradient pulses 0.18↔0.28 opacity on a 3s Infinity loop (subtle heartbeat)
- SVG `drop-shadow` filter on the whole chart shifts color and intensity by session
- Gradient fill middle stop tinted with `ambientColor` (blends session hue into the P&L green/red)
- SVG `feGaussianBlur` glow filter applied to chart line paths
- **Scrub-reactive (1D):** when user drags into a pre-market or after-hours zone, `scrubSession` overrides `marketState`, shifting the ambient color to blue; releasing scrub transitions back to real-time session color

---

## 2026-06-29 (session 27)

### Fix — 1W chart shows 2 points (Finnhub free-tier intraday limit)

Finnhub free tier only provides intraday bars (5-min, 15-min, 60-min) for the **current trading day**. Requesting 15-min bars over 7 days returns `no_data`, falling back to the synthetic 2-point line.

`api/get-candles.js`: changed 1W resolution from `'15'` (15-min intraday) → `'D'` (daily). Now returns 5 real daily bars (Mon–Fri of the past week) instead of 2 synthetic points. Same Finnhub free-tier limitation applies to 1D when markets are closed — those 2 points are expected until Monday open.

---

## 2026-06-29 (session 26)

### Fix — Chart crosshair tooltip shows "Invalid Date"

**Root causes (two, both fixed):**

1. **Seconds/milliseconds mismatch:** `api/get-candles.js` was converting Finnhub's Unix-second timestamps to milliseconds (`ts * 1000`) before sending them to the frontend, but `fmtDate` and the P&L header tooltip were calling `new Date(ts)` directly. The conversion should happen at display time, not storage time. Removed `* 1000` from the API so `candles[i].t` is now raw Unix seconds; all frontend formatters now do `new Date(ts * 1000)` explicitly.

2. **`undefined` timestamp when candles is empty:** When Finnhub returns no data (market closed, new ticker with no history), `candles = []` and the chart uses the synthetic 2-point fallback `[prevValue, totalValue]`. The user can still scrub this chart, which sets `scrubIdx = 0`. `candles[0]?.t` is `undefined` → `new Date(undefined)` = "Invalid Date". Fixed by guarding all timestamp formatters: if `ts` is falsy or `isNaN`, fall back to the static label (`'Today'` for 1D, range name otherwise).

**`api/get-candles.js`:** Removed `* 1000` from candle mapping — timestamps are now Unix seconds.

**`src/components/PortfolioTab.jsx`:**
- `fmtDate`: updated to `new Date(ts * 1000)` with `isNaN` guard; double-validates with `isNaN(d.getTime())`
- P&L header tooltip: replaced inline `new Date(candles[scrubIdx]?.t)` with an IIFE that guards against `undefined`/`NaN` timestamps and falls back to `range` label; also fixed 1D tooltip to use `toLocaleString` (not `toLocaleDateString` with time options, which behaves inconsistently across browsers)

---

## 2026-06-29 (session 25)

### Fix — Stock chart STILL showing 2 data points (root cause found)

**Root cause:** `fetchCandles` used `Math.min` across all tickers' data lengths to determine how many candle points to use:
```js
const minLen = Math.min(...withShares.map(t => data[t]?.length || 0).filter(l => l > 0));
```
Any newer or illiquid ticker in the portfolio (e.g. `NBIS`, `APLD`, `FLY`) that only has 2 days of candle history on Finnhub's free tier would set `minLen = 2`, truncating the ENTIRE portfolio curve to 2 points regardless of how much data the major tickers had. NVDA might have 22 daily candles; one outlier ticker kills everything.

**Secondary issue:** `primary = withShares[0]` — if that first ticker happened to have no Finnhub data (intermittent failure), the whole fetch bailed even though other tickers had valid data.

**Fix (`src/components/PortfolioTab.jsx` — `fetchCandles`):**
- `primary` now selected as the ticker with the **most** data points (via `reduce`), not blindly `withShares[0]`
- Removed `minLen` / `Math.min` entirely — the curve is always as long as the primary ticker's full history
- For tickers shorter than primary, their price is **clamped to their last available candle** (`tData[Math.min(idx, tData.length - 1)]`) rather than truncating the curve
- Fallback: tickers with zero candle data use `quotes[t]?.price` (current quote) as a constant proxy

**Result:** 1M now shows ~22 data points; short-history tickers contribute their best available price rather than collapsing the whole chart.

---

## 2026-06-29 (session 24)

### Fix — Chat broken, quick-action buttons broken, DCA sheet broken

**Bug 1 & 2 — Chat + buttons crash (ReferenceError):**
`sendChat()` in `ChatTab.jsx` called `stopSpeaking()` which was deleted along with `useVoice.js` during voice removal (session 20). This threw a `ReferenceError` on every send, crashing all chat messages and all quick-action buttons (which call `sendChat()`).
- `ChatTab.jsx` line 358: removed `stopSpeaking()` call; `setChatInput(''); stopSpeaking()` → `setChatInput('');`

**Bug 3 — DCA sheet invisible on desktop / bottom-clipped on mobile:**
Root cause: Framer Motion's tab transition applies `transform: translateY(...)` to the tab content wrapper. CSS spec: any element with a CSS transform creates a new containing block for `position: fixed` descendants, so the DCA sheet was being positioned relative to the tab container instead of the viewport. On desktop this put the sheet off-screen; on mobile it was partially clipped.
- `PortfolioTab.jsx`: added `import { createPortal } from 'react-dom'`
- `DCASheet` now renders via `createPortal(…, document.body)` — escapes all transform ancestors
- Added internal `visible` state + `handleClose()` so Framer Motion exit animations still play (sets `visible=false`, waits 300 ms, then calls parent `onClose`)
- Removed outer `AnimatePresence` wrapper in parent (animation now managed internally by `DCASheet`)
- `zIndex` raised to `10000`/`9999` to ensure sheet/backdrop always render above all other elements
- Mobile: moved safe-area bottom padding inside scrollable content: `calc(28px + env(safe-area-inset-bottom, 0px))` so bottom items are fully visible when scrolled to end

---

## 2026-06-29 (session 23)

### Fix — Stock chart only showing 2 data points

**Root cause:** Default range was `'1D'` with 5-minute resolution. Finnhub returns `s: "no_data"` when markets are closed (weekends, after-hours), so `candles` was always `[]`. The chart fallback `effectivePoints = [prevClose, currentValue]` produced exactly 2 synthetic data points.

**Secondary bug:** `fmtDate` was doing `new Date(ts * 1000)` but timestamps from `api/get-candles.js` are already converted to ms on the server (`ts * 1000`). The double-multiply was creating X-axis labels with year ~55000+.

**`api/get-candles.js`:**
- Added `'6M'` range (resolution `'D'`, 180 days back)
- Fixed `'1W'` resolution from `'60'` → `'15'` (15-min bars, per spec)
- Valid ranges now: `1D, 1W, 1M, 3M, 6M, 1Y, ALL`

**`src/components/PortfolioTab.jsx`:**
- Default range changed from `'1D'` → `'1M'` (daily bars, ~22 trading days, always has data)
- Added `'6M'` to `RANGES` constant
- Fixed `fmtDate`: `new Date(ts * 1000)` → `new Date(ts)` (timestamps already in ms)
- Removed hard-coded `isUp` variable (was using removed `dayChange` reference)
- Added `rangeStartValue` (first candle's portfolio value) and `headerChange`/`headerChangePct` computed from selected-range start
- `lineColor` now reflects range change instead of day-only change
- P&L header line now shows range change: e.g. "+$1,234 (5.2%) 1M" instead of always "Today"
- When scrubbing, P&L label shows the hovered date instead of range label
- `dayChange` and `dayChangePct` kept for `onDayChange` callback (bottom nav badge)

---

## 2026-06-29 (session 22)

### Fix — Consolidate cron endpoints under Vercel Hobby 12-function limit

**Problem:** 6 individual `api/cron/*.js` files pushed total function count to 14, exceeding Vercel Hobby's 12-function limit.

**Fix:**
- Deleted `api/cron/rex.js`, `nova.js`, `sage.js`, `atlas.js`, `vega.js`, `zen.js` (6 files)
- Created `api/cron/agents.js`: single handler accepting `?agent=rex|nova|sage|atlas|vega|zen` query param. All 6 agent scan logics preserved identically, moved into per-agent async functions (`runRex`, `runNova`, `runSage`, `runAtlas`, `runVega`, `runZen`). Returns 400 on missing/invalid `?agent` param.
- `vercel.json`: replaced 6 individual `maxDuration` entries with one `api/cron/agents.js: { maxDuration: 120 }`
- `.github/workflows/agent-crons.yml`: curl calls updated to `$BASE_URL/api/cron/agents?agent=$AGENT` — schedules and secrets unchanged

**Result:** 9 total serverless functions (was 14). Comfortably under the 12-function Hobby limit.

---

## 2026-06-29 (session 21)

### Layer 1 — Agent Background Scans (Vercel Cron Jobs)

**Part 1 — Firestore agent_feed collection:**
- Created `src/utils/agentFeed.js`: `writeToFeed({ userId, agentId, ticker, headline, detail, severity, source })` — writes to `users/{userId}/agent_feed/{auto-id}` using client Firebase SDK. Fields: agentId, ticker, headline, detail, severity, source, read (false), createdAt (serverTimestamp), timestamp (serverTimestamp).

**Part 2 — Shared recon + Firebase Admin:**
- Created `api/lib/firebaseAdmin.js`: firebase-admin init via `FIREBASE_SERVICE_ACCOUNT` env var (JSON string). Comment at top reminds Edwin to generate service account key from Firebase Console. Exports `db` (admin Firestore instance).
- Created `api/lib/recon.js`: shared serverless helpers — `fetchPrices(tickers)`, `fetchNews(tickers)`, `fetchEarnings(tickers)`, `fetchTechnicals(ticker)`, `fetchMacro()`. Direct calls to Finnhub, Alpha Vantage, and FRED APIs. Includes `guessSentiment()` helper for news NLP.
- Added `firebase-admin: ^12.0.0` to `package.json`.

**Part 3 — 6 cron endpoint files (all CRON_SECRET protected via `Authorization: Bearer`):**
- `api/cron/rex.js`: RSI overbought/oversold (>70, <30), MACD crossover detection, golden/death cross, Bollinger Band breaks. Calls `fetchTechnicals` + `fetchPrices`. Severities: warning (RSI), info (MACD, BB), alert (cross signals).
- `api/cron/nova.js`: Earnings within 3 days (alert) and 14 days (warning), negative news clusters ≥2 articles (warning). Uses `fetchEarnings` + `fetchNews`.
- `api/cron/sage.js`: Position concentration ≥25% (warning) and ≥35% (alert), portfolio single-day drop ≥3% (alert). Uses `fetchPrices` + Firestore holdings with share counts.
- `api/cron/atlas.js`: VIX ≥25 (warning), VIX ≥30 (alert), VIX spike ≥15% (alert), yield curve inversion (warning), yield spread <0.2% (warning), oil ≥5% move (alert), fed rate change ≥0.25% (warning), CPI change ≥0.2 (warning). Macro events broadcast to all users (global, not per-ticker).
- `api/cron/vega.js`: Single-session drop ≥5% (alert), negative news clusters ≥3 articles (warning), price below both SMA50 and SMA200 (alert, only fetches technicals when changePct < 0 to avoid AV waste).
- `api/cron/zen.js`: Position value < $50 (info), largest/smallest position ratio ≥5x (info).

**Part 4 — GitHub Actions cron triggers:**
- Created `.github/workflows/agent-crons.yml`: all 6 agent schedules registered. Single job computes which agents should run at the current UTC hour and calls each endpoint via `curl -sf ... -H "Authorization: Bearer $CRON_SECRET"`. Manual `workflow_dispatch` for testing. Requires GitHub secrets: `CRON_SECRET`, `VERCEL_APP_URL`.

**vercel.json updated:** Added `maxDuration` entries for all 6 cron endpoints (rex/vega: 120s, others: 60s).

---

## 2026-06-29 (session 20)

### Voice Removal, News Overhaul, Agent Learning System (Layer 0)

**Part 1 — Voice/TTS removed:**
- Deleted `src/hooks/useVoice.js`
- `ChatTab.jsx`: removed `useVoice` import + destructure, all `speak()` calls, voice toggle button (Volume2/VolumeX), mic/speech recognition button (Mic/MicOff), speaking indicator (animated dots on last PM message), `srSupported` conditional footer text. Text content of `speak` fields in JSON schemas untouched.

**Part 2 — News Overhaul (24/7 with push notifications):**
- `PortfolioTab.jsx`: removed `isWeekend()` guard — news fetches on all days including weekends
- Hourly auto-refresh via `setInterval(fetchNews, 60 * 60 * 1000)` in the news useEffect (keyed on `account`)
- Manual refresh button (RefreshCw icon) added next to "Market News" header; spins via Framer Motion `animate.rotate` while `isRefreshing` is true
- Push notifications: after AI enrichment, negative articles mentioning holdings fire `pushNotify()`; duplicate suppression via localStorage hash (last 100 entries)
- Empty state: replaced text-only with Newspaper icon + "No recent news for your holdings"
- `notify.js`: exported `pushNotify` alias for `sendNotification`

**Part 3 — Agent Learning System (Layer 0):**
- Created `src/utils/agentLearning.js`: `resolveObservations(db, userId, getCurrentPrice)` — queries unresolved `agent_observations` older than 7 days, computes WIN/LOSS/NEUTRAL vs price at call, updates observation doc and accumulates/creates `agent_stats` doc (`{agentId}_{ticker}`)
- `CouncilTab.jsx` + `ChatTab.jsx`: after every council synthesis, saves each agent's final verdict as an `agent_observations` document in Firestore
- `CouncilTab.jsx`: fetches `agent_stats` per agent for the current ticker before the agent loop; injects track record string into each agent's system prompt ("YOUR TRACK RECORD on NVDA: 15 calls, 10 wins…")
- `CouncilTab.jsx`: track record badge displayed below agent role on agent cards — green (>60% win rate), red (<40%), zinc (otherwise)
- `App.jsx`: calls `resolveObservations` in background after Firebase auth resolves; `getCurrentPrice` reuses `getQuotes`
- Firestore collections: `users/{uid}/agent_observations` and `users/{uid}/agent_stats` — covered by existing wildcard security rule

---

## 2026-06-28 (session 19)

### FRED + Alpha Vantage integration

**New API endpoints:**
- `api/get-fred.js` — fetches 7 FRED series (FEDFUNDS, CPIAUCSL, UNRATE, A191RL1Q225SBEA, DGS10, DGS2, VIXCLS) in parallel; computes yield spread (10Y–2Y) and inversion flag; Firebase JWT auth
- `api/get-technicals.js` — fetches RSI(14), MACD, BBANDS(20), SMA50, SMA200 for a given ticker from Alpha Vantage; detects rate limit via Note/Information fields; adds GOLDEN_CROSS/DEATH_CROSS signal

**`vercel.json`:** added `maxDuration` for both new endpoints (20s for FRED, 45s for technicals)

**`src/api.js`:** added `getFredData()` (GET, 5-min in-memory cache) and `getTechnicals(ticker)` (POST)

**`src/components/CouncilTab.jsx`:**
- Parallel fetch of `fredData` + `techData` alongside quotes at start of `convene()`
- `macroContext` (ATLAS only): FRED live numbers injected into ATLAS system prompt
- `techContext` (REX only): Alpha Vantage indicators injected into REX system prompt (only for the analyzed ticker — not batch-fetched)
- `macroBackdrop`: brief FRED summary injected into AXIOM synthesis prompt
- Rate limit badge on REX card when technicals unavailable

**`src/components/ChatTab.jsx`:**
- Same FRED + technicals fetch pattern added to `runCouncilInChat()`
- `agentSystem` selected per-agent in loop (ATLAS gets macroContext, REX gets techContext, others unchanged)
- AXIOM `synthSys` includes macroBackdrop when FRED data available

**`src/components/PortfolioTab.jsx` — Macro Pulse section:**
- Collapsible section above Top Movers; fetches FRED once on load (uses 5-min cache from `getFredData`)
- 4 metric cards: Fed Rate (gold), CPI (cyan), VIX (red/green based on >20), Yield Spread (red if inverted)
- Collapsed by default; AnimatePresence height animation on expand

---

## 2026-06-28 (session 18)

### Two follow-up fixes

**Fix 1 — BottomNav pill transform conflict (`src/components/BottomNav.jsx`):**
- Removed `top: '50%', left: '50%', transform: 'translate(-50%, -50%)'` from the `layoutId="nav-pill"` div — those transforms conflicted with Framer Motion's layout animation transforms, causing the pill to jump off-center when switching tabs
- Replaced with `inset: 0` — pill fills the 36×36 `position: relative` parent container exactly, no transform needed

**Fix 2 — Weekend shows "no news" instead of market closed message (`src/components/PortfolioTab.jsx`):**
- Added `newsWeekend` boolean state; weekend check now sets `newsWeekend: true` instead of `newsItems: []`
- Render branch checks `newsWeekend` first and shows a dedicated "Markets closed — news refreshes Monday" message with a calendar icon in `text3` color
- "No recent news for your holdings" message now only appears when a real fetch returned zero articles on a weekday

---

## 2026-06-28 (session 17)

### 3 bug fixes + Portfolio News feature

**Bug 1 — Top Movers mobile scroll (`src/components/PortfolioTab.jsx`):**
- `.slice(0, 5)` on movers array — always cap at 5 cards regardless of portfolio size
- Mobile (< 768px): `minWidth: 72` (was 90), `padding: '10px 10px'`, font sizes reduced 1px each, logo 24px (was 28px)
- Desktop: unchanged sizing, still capped at 5
- Section already hidden when all positions are flat (no change needed)

**Bug 2 — BottomNav blue pill off-center (`src/components/BottomNav.jsx`):**
- Moved pill inside the icon `<span>` container (36×36, `position: relative`) instead of being absolute on the whole button
- Pill now uses `top: '50%', left: '50%', transform: 'translate(-50%, -50%)'` — perfectly centers behind the icon
- Pill size: `width: 36, height: 36, borderRadius: 10`

**Bug 3 — Scout Mode mobile overflow (`src/components/ScoutTab.jsx`):**
- `renderRow` reworked to be mobile-responsive: header row (ticker + verdict badge + time + chevron) + data row (conviction + price + headline)
- Mobile: data row stacks vertically; headline wraps (`wordBreak: 'break-word'`) instead of `whiteSpace: nowrap`
- Expanded agent stances: mobile shows each agent as a card (name, verdict badge, reasoning) instead of cramped inline pills
- Desktop expanded: unchanged pill layout
- Progress bar: `maxWidth: calc(100vw - 40px)` so it never overflows

**Feature — Portfolio News with AI Summaries (`src/components/PortfolioTab.jsx`):**
- New "Market News" section below Holdings list
- Fetches news via existing `getNews()` for top 5 holdings by position size; 3 articles per ticker, 15 max total
- AI summaries: `callAgent` runs in parallel (`Promise.all`) for all articles; 1-sentence portfolio-impact summary per article
- Sentiment detection: keyword regex → `positive` / `negative` / `neutral`; colored left border (green/red/zinc) + badge pill
- Category detection: Fed / Earnings / Tech / Energy / Defense / Market based on headline keywords
- Ticker pills: shows which portfolio holdings are mentioned in the article
- Cards: glass card + colored left border, source + time ago + sentiment badge, headline (wrapping), AI summary (italic, ✨), ticker pills + category tag
- Framer Motion stagger entrance (50ms per card)
- Tap to open article URL in new tab
- Weekend guard: shows "Markets closed — news refreshes Monday" on Sat/Sun
- Loading: `<CouncilLoader size="sm" />` while fetching
- Cached in component state — no re-fetch on tab switch
- Imports: added `getNews`, `Newspaper`, `CouncilLoader`

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
