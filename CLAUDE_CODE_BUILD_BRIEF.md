# THE COUNCIL — Build Brief for Claude Code

**Goal:** Turn the working prototype (`TheCouncil.jsx`) into a real, deployed, phone-accessible web app with a secure backend, live data, persistent storage, and **no demo phase**. The demo buttons and canned data exist only because the prototype couldn't reach a backend; the real app removes them entirely and runs everything live.

---

## 0. CONTEXT FOR CLAUDE CODE

This app is a multi-agent investing assistant. A user talks to a "Portfolio Manager" (PM) who convenes a council of 6 specialist agents (each an LLM call with a role) to review buy ideas, allocate DCA, and watch existing holdings against a sell protocol. The prototype proves the UX and agent logic. Your job is to make it production-real.

**Inputs you have:**
- `TheCouncil.jsx` — the full working prototype (React, single file). Treat it as the source of truth for UI, agent prompts, protocols, and flow. Port it; don't redesign it.
- The owner already uses: **Firebase** (Auth + Firestore + Cloud Functions), **Finnhub** (live prices), and a **GitHub repo** `edge-tracker`. Reuse this infrastructure.

**The one architectural change that matters:** In the prototype, the browser calls `api.anthropic.com` directly. That only works inside Claude's sandbox and is insecure (key would be exposed). In the real app, **all Anthropic and Finnhub calls move to Firebase Cloud Functions.** The frontend calls your functions; the functions hold the keys. This is what makes it work on a phone anywhere.

---

## 1. SECURITY — DO THIS FIRST

Before anything else:
1. **Regenerate the previously-exposed keys** — a GitHub Personal Access Token and a Firebase API key were once pasted in plaintext. Rotate both now if not already done.
2. **No secret ever ships to the browser.** Anthropic API key and Finnhub key live only in Firebase Functions config / Secret Manager (`firebase functions:secrets:set ANTHROPIC_API_KEY`, etc.).
3. Frontend talks to functions over authenticated HTTPS (Firebase Auth token). Reject unauthenticated calls in the functions.
4. `.env`, service-account JSON, and any keys go in `.gitignore`. Verify nothing sensitive is committed.

---

## 2. TARGET ARCHITECTURE

```
  Phone / PC browser (PWA)
        │  Firebase Auth token
        ▼
  React frontend  ──fetch──►  Firebase Cloud Functions  ──►  Anthropic API (agents/PM)
   (Firebase Hosting)                                    └──►  Finnhub (live quotes)
        │                                                        
        └──────── Firestore (positions, trades, ruling history per account) ───────┘
```

- **Frontend:** React + Vite. Port the prototype's components/styling verbatim (the JARVIS look, tabs, animations). Tailwind for styling as in the prototype.
- **Backend:** Firebase Cloud Functions (Node). One callable function per capability (see §5). Functions own the keys and do all external calls.
- **Auth:** Firebase Auth (reuse existing). Gate the app behind login.
- **Data:** Firestore. Per-account documents (Edwin / Dad / Bro).
- **Hosting/PWA:** Firebase Hosting. Add a web manifest + service worker so it installs to the home screen and feels native on the phone.

---

## 3. BUILD PHASES (do in order; verify each before moving on)

**Phase A — Scaffold**
- Create the project (Vite React app + `firebase init` for Hosting, Functions, Firestore). Can live in the existing `edge-tracker` repo under a folder, or a new repo — owner's choice.
- Port `TheCouncil.jsx` into the React app, split into sensible components (Header/ArcReactor, Tabs, ChatTab, CouncilTab, PositionsTab, DCATab, WatchdogTab, RoadmapTab, shared agent definitions/constants). Get it rendering identically.

**Phase B — Backend proxy (kills the sandbox dependency)**
- Build a `runAgent` Cloud Function that accepts `{system, userContent, useSearch}` and proxies to Anthropic, returning the text. Move the Anthropic key server-side.
- Build a `getQuotes` function that takes tickers and returns live prices via Finnhub.
- Swap the frontend's `callAgent` to call `runAgent` instead of `api.anthropic.com`. **At this point the PM/council/etc. work on a phone.**

**Phase C — Remove the demo phase (explicit)**
- Delete `DEMO_TICKER`, `DEMO_RESULTS`, `DEMO_SYNTH`, `DEMO_DCA`, `DEMO_WD` and the `runDemo`, `runDCADemo`, `runWatchdogDemo` functions.
- Remove every "SEE DEMO" / "DEMO" button from Council, DCA, and Watchdog tabs.
- Remove the `apiDown` "live mode blocked" notice (no longer applicable once the backend exists) — or repurpose it as a genuine network-error toast.
- Acceptance: there is no demo data or demo button anywhere; every panel populates from live function calls only.

**Phase D — Persistence**
- Firestore schema (see §6). Wire the Positions tab to read/write Firestore so positions survive across sessions and sync phone↔PC.
- Persist council rulings and DCA allocations as history (needed for the Alpha Tracker later).

**Phase E — New features (see §4)**
- Build Morning Brief, Shared Recon, Trade Log, All-Accounts mode, Consensus Meter, real watchlist quick-picks, and merge Council into PM Chat.

**Phase F — Ship**
- PWA manifest + service worker. Deploy to Firebase Hosting. Confirm install-to-home-screen and full function on iOS Safari + Android Chrome + desktop.

---

## 4. FEATURE CHANGES AGREED (build these into the real version)

1. **Morning Brief (one button).** Runs the full standing ritual in one tap: live prices + today's movers across all holdings, Iran/Middle East + oil status, red flags, and — only if it's Monday — the DCA suggestion. This is the most-used workflow; make it prominent (top of PM Chat or its own button).
2. **Shared Recon pass (performance).** Currently all 6 agents each web-search the same ticker — redundant, slow, and can yield inconsistent prices. Change to: one recon call (or `getQuotes` + one news/earnings search) fetches the data once, then passes that shared context into all 6 agents. Fewer external calls, faster, internally consistent.
3. **Quick Trade Log.** Natural-language "Bought 2 NVDA @ 205" (or a small form) writes to Firestore and updates that account's Positions automatically. Keeps the council's view accurate without hand-editing.
4. **All-Accounts mode.** A toggle to run a council ruling or DCA across Edwin + Dad + Bro at once (they mostly mirror each other), instead of switching accounts manually three times.
5. **Consensus Meter.** Surface agent agreement/disagreement on each ruling. Tight agreement = higher confidence; a split council = a signal to size smaller. Show it on the PM ruling.
6. **Real watchlist quick-picks.** Replace the generic AAPL/TSLA chips with the actual watchlist: OKLO, LPTH, UNH, KKR, ACMR, NU (and let it read from a Firestore watchlist doc so it's editable).
7. **Merge Council tab into PM Chat.** They do the same job; the chat is the better interface (conversational, voice, agents report inline). Make PM Chat the single entry point for convening; drop the standalone Council tab (keep the agent-card visuals inside the chat's council message).

---

## 5. CLOUD FUNCTIONS (suggested surface)

- `runAgent({system, userContent, useSearch})` → `{text}`. Proxies Anthropic `/v1/messages`, model `claude-sonnet-4` (or current), max_tokens ~1000, optional web_search tool. **Holds the key.**
- `getQuotes({tickers:[...]})` → `{ [ticker]: {price, changePct} }` via Finnhub.
- `getRecon({ticker})` → `{price, changePct, nextEarnings, headlines[]}` — the shared recon used by all agents (combines getQuotes + one search). Powers feature #2.
- `morningBrief({account})` → assembles movers + macro + flags + (Monday) DCA. Powers feature #1.
- All functions require a valid Firebase Auth token.

Keep the agent **system prompts, protocols, and the 6-agent + PM definitions exactly as written in `TheCouncil.jsx`** — they encode the owner's rules. Reproduce them verbatim in the backend or pass them from the frontend.

---

## 6. DATA MODEL (Firestore)

```
users/{uid}
  accounts/{accountId}            // accountId: "edwin" | "dad" | "bro"
    meta: { label, broker, dcaAmount, dcaNote }
    positions/{ticker}: { shares, avgCost, updatedAt }
    trades/{tradeId}: { ticker, side, shares, price, ts }
    rulings/{rulingId}: { ticker, verdict, conviction, agents:{...}, ts }
    dca/{dcaId}: { date, allocations:[{ticker, amount, pct, reason}] }
  watchlist: { tickers:[ "OKLO","LPTH","UNH","KKR","ACMR","NU" ] }
```

---

## 7. THE THREE ACCOUNTS (seed data)

- **Edwin** — Fidelity Youth (Z38457917). Holdings: NVDA, NBIS, MU, AMD, SNDK, CRDO, APLD, ALAB, FLY. DCA $60/week, Mondays.
- **Dad** — Fidelity (Z53363050). Holdings: NVDA, NBIS, MU, AMD, SNDK, CRDO, APLD, ALAB. DCA $50/month.
- **Bro** — Robinhood. Holdings: same 8 as Dad. No DCA.

Never mix the three. Each has independent positions, trades, and history.

---

## 8. THE PROTOCOLS (must be preserved in agent logic)

**Sell Protocol:** Exit ONLY when red candles are forming AND a downtrend is confirmed (lower highs / lower lows on the WEEKLY chart). Never sell on valuation, RSI, or news alone.

**4-Gate Entry Rule (all four for a new entry):** (1) catalyst within 60 days, (2) weekly chart in uptrend, (3) min 7/10 conviction with a clear bull thesis, (4) no entries on macro headwind days. Sizing: small starter only, scale up after price action confirms.

**The 6 agents:** Technical Analyst (sell-protocol + 4-gate chart check), Catalyst Scout (catalyst within 60 days), Risk Manager (sizing/concentration/dilution vs the account's real positions), Macro Agent (headwind-day check), Devil's Advocate (forced bear case), Position Sizer (dollars + shares vs stated capital). The **Portfolio Manager** synthesizes their reports into BUY / WATCH / PASS + conviction.

---

## 9. ACCEPTANCE CRITERIA

- [ ] App loads behind Firebase Auth and runs fully on iOS Safari, Android Chrome, and desktop — no sandbox/viewer limitation.
- [ ] No Anthropic/Finnhub key is present in any client bundle.
- [ ] **Zero demo data or demo buttons remain.** Every tab populates from live functions.
- [ ] Positions persist in Firestore and sync across devices.
- [ ] PM Chat convenes the council live (with voice output) and is the single convene entry point.
- [ ] Morning Brief, Shared Recon, Trade Log, All-Accounts, Consensus Meter, and real watchlist picks are implemented.
- [ ] Installable as a PWA (home-screen icon).

---

## 10. KICKOFF PROMPT (paste this into Claude Code first)

> I'm building "The Council," a multi-agent investing app. I have a working React prototype (`TheCouncil.jsx`) and a build brief (`CLAUDE_CODE_BUILD_BRIEF.md`) — read both. I already use Firebase (Auth, Firestore, Functions) and Finnhub, and have a GitHub repo `edge-tracker`.
>
> Start with Phase A and B from the brief: scaffold a Vite React + Firebase project, port the prototype UI verbatim, then build a `runAgent` Cloud Function that proxies the Anthropic API server-side and a `getQuotes` function for Finnhub, and switch the frontend's `callAgent` to use them. First, walk me through rotating my exposed keys and confirm nothing secret will be committed. Then show me the project structure you propose before writing files. Don't remove the demo code yet — we'll do that in Phase C once the backend works.

Build incrementally, verify each phase, and keep the JARVIS look and all agent prompts/protocols exactly as in the prototype.
