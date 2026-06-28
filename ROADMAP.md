# Roadmap

Current state of planned work. Update statuses here at the end of every session.

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
