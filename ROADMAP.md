# Roadmap

Current state of planned work. Update statuses here at the end of every session.

---

## DONE (recent)

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
