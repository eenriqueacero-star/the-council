# Roadmap

Current state of planned work. Update statuses here at the end of every session.

---

## DONE (recent)

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

### Council on Holdings (HOLD/TRIM)
Point the same 6-agent council at existing positions, not just new buys. Verdict options: HOLD, TRIM, ADD, EXIT.

### Scout Mode
Council auto-runs on the watchlist and surfaces only tickers that score 7+ and pass all 4 gates.

### Alpha Tracker vs SPY
Benchmark entered trades against SPY — is the council outperforming the index?

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
