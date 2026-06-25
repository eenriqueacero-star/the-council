# Roadmap

Current state of planned work. Update statuses here at the end of every session.

---

## DONE (recent)

### Alpha Tracker rework ✓
- [x] **"Track This Trade" button** — council no longer auto-saves; user explicitly clicks Entered or Watching on the AXIOM card
- [x] **Entered / Watching states** — stored as `status` field on rulings doc; badge shown in tracker table
- [x] **Delete + edit entries** — trash icon with two-click confirm; Watching rows show → ENT reclassify button
- [x] **Real outcome states** — WIN / LOSS manual close buttons; auto-grade only fires on Entered trades
- [x] **Stats filter to Entered trades only** — win rate and agent accuracy exclude Watching calls

---

## NEXT

### Agent Tuning
Stop verdicts flip-flopping and agents hallucinating data they should fetch live.

- [ ] **Encode Sell Protocol in agent prompts** — downtrend = confirmed lower highs AND lower lows over multiple weeks; never fail on one red day; hold through normal volatility
- [ ] **4-Gate rule** — all 4 gates (technical, catalyst, macro, risk) must be clear before BUY; one hard PASS gate overrides the rest
- [ ] **Reduce PASS↔WATCH flip-flop** — agents should anchor on prior stance unless new data materially changes the picture; add "rebuttal" requirement when changing stance
- [ ] **Force agents to use live recon data** — prompt changes to make agents cite the live sector/macro context they received, not rely on training-data memory for current prices/news

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
