# Roadmap

Current state of planned work. Update statuses here at the end of every session.

---

## IN PROGRESS

### Alpha Tracker rework
The current Alpha Tracker auto-logs every council run. The goal is to make it trade-intent-driven.

- [ ] **"Track This Trade" button** on each council ruling — only committed trades enter the tracker
- [ ] **Entered / Watching states** — "Entered" means shares were purchased; "Watching" means the ruling was saved but no position taken yet
- [ ] **Delete + edit entries** — allow removing or correcting logged trades
- [ ] **Real outcome states** — replace the always-"open" placeholder with: Open → Closed (manual) or Closed (auto-graded at 30 days). Show P&L and hit/miss vs stop/target.
- [ ] Auto-grading should only fire on trades in "Entered" state, not "Watching"

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
