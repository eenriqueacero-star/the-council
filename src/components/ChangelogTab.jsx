import React from 'react';
import { theme } from '../utils/theme.js';

const FONT  = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };
const MFONT = { fontFamily: "ui-monospace, 'SF Mono', monospace" };

const ENTRIES = [
  {
    version: '0.3.2', date: '2026-06-26', label: 'FIX',
    changes: [
      { type: 'FIX', text: 'Portfolio data lost on follow-ups — after fetching live quotes for a portfolio question, the data now carries over automatically for the next 3 follow-up messages (e.g. "why did it do that?" still has the data). Clears when a new ticker council is convened.' },
      { type: 'FIX', text: 'AXIOM tone still corporate despite prompt update — rewrote the axiomSys router prompt with explicit BAD/GOOD tone examples and instructions to name biggest movers, use casual language, and give context. AXIOM_CONVERSATIONAL updated to match.' },
      { type: 'FIX', text: 'AXIOM wrapping JSON in code fences — axiomSys format instruction changed from "Respond with JSON in a ```json block" to "Output ONLY the raw JSON object — no code fences, no backticks." Saves tokens every call.' },
    ],
  },
  {
    version: '0.3.1', date: '2026-06-26', label: 'DEBUG',
    changes: [
      { type: 'FEAT', text: 'Universal Debug System — every feature pipes debug data into a single centralized store (src/utils/debugStore.js). No more prop drilling. Any component calls writeDebug(source, title, payload) and it appears in the Debug panel instantly.' },
      { type: 'FEAT', text: 'Debug panel section tabs: COUNCIL / SCOUT / ALERTS / CHAT / RECON / ALL. Each tab shows only entries from that feature with a live count badge. Clear per section or clear all.' },
      { type: 'FEAT', text: 'Per-section empty states with feature-specific instructions for how to generate debug data.' },
      { type: 'FEAT', text: 'CHAT section: logs AXIOM router decision (raw response + parsed route) and portfolio data injection block for every chat message in debug mode.' },
      { type: 'FEAT', text: 'ALERTS section: logs every alert check (tickers checked, live quotes, threshold, fired map) in debug mode.' },
      { type: 'FEAT', text: 'RECON section: logs Watchdog scan results (raw response + parsed verdict per ticker) and DCA allocation results in debug mode.' },
      { type: 'FIX',  text: 'Removed setDebugLog / onDebugLog prop drilling from CouncilTab, ScoutTab, and App.jsx — all debug writes now go through debugStore directly.' },
    ],
  },
  {
    version: '0.3.0', date: '2026-06-26', label: 'MAJOR',
    changes: [
      { type: 'FEAT', text: 'Scout Mode — watchlist + auto-discovery pool (30 tickers) scanned in a single-round lightweight council. Results sorted by conviction. BUY 7+ highlighted green. Tap rows to expand agent stance summary. Vercel Cron auto-runs daily at 9 AM ET (configure CRON_USER_IDS in Vercel env).' },
      { type: 'FEAT', text: 'Portfolio Alerts — price check on all holdings on app open and every 5 minutes. Configurable thresholds (3/5/7/10%). Fires Web Notifications (works on iOS PWA). Alert history stored in Firestore. Enable via Settings → Notifications.' },
      { type: 'FEAT', text: 'AXIOM live portfolio data in chat — ask "how did my portfolio do today" and AXIOM gets live prices for all holdings, calculates day P&L and unrealized gain/loss, and answers with real numbers.' },
      { type: 'FEAT', text: 'AXIOM conversational tone — casual, direct, market slang. No corporate speak. "MU got hammered today" not "the equity exhibited significant downward pressure."' },
      { type: 'FIX',  text: 'Alpha vs SPY marked complete — removed "IN PROGRESS" label from roadmap.' },
      { type: 'FEAT', text: 'Scout tab replaces Watchdog in bottom nav (Watchdog moves to More menu). Telescope icon.' },
      { type: 'FEAT', text: 'shared src/utils/notify.js for Web Notification API — used by Scout Mode and Portfolio Alerts.' },
      { type: 'FEAT', text: 'src/utils/councilRunner.js — extracted single-round scout logic to avoid duplicating CouncilTab prompt-building code.' },
      { type: 'FEAT', text: 'Debug panel (?debug=1) extended: Scout Mode debug cards show per-ticker liveDataBlock, per-agent raw response + parse status + latency + key index, AXIOM synthesis raw response.' },
      { type: 'FEAT', text: 'AXIOM_SYSTEM updated to use casual direct tone in convene=false speak responses.' },
    ],
  },
  {
    version: '0.2.0', date: '2026-06-13', label: 'MAJOR',
    changes: [
      { type: 'FEAT', text: 'Named agents: REX ⚡ (Technical), NOVA 🚀 (Catalyst), SAGE 🛡️ (Risk), ATLAS 🌐 (Macro), VEGA 🐻 (Devil\'s Advocate), ZEN ⚖️ (Sizer) — each with distinct personality, color, and domain expertise' },
      { type: 'FEAT', text: '3-round council deliberation: Round 1 = independent analysis, Round 2 = cross-examination (agents challenge each other by name), Round 3 = final consensus position. Applies to both Council and Chat tabs' },
      { type: 'FEAT', text: 'Agent selector chips in Chat: talk directly to any agent (AXIOM / REX / NOVA / SAGE / ATLAS / VEGA / ZEN) or trigger a full COUNCIL roundtable' },
      { type: 'FEAT', text: 'Direct agent chat: agents respond conversationally in-character — no JSON, no routing, just the expert you selected' },
      { type: 'FEAT', text: 'Roundtable mode: send any question to all 6 agents simultaneously, responses shown as a threaded conversation' },
      { type: 'FEAT', text: 'Conversation memory: last 10 turns injected into every agent call — no more context amnesia between messages' },
      { type: 'FEAT', text: 'Autonomous domain research: each agent runs a live web search on their specialty area (rates, sector tape, catalysts, etc.) every 4 hours and injects the fresh intel into council runs' },
      { type: 'FEAT', text: 'Agent learning system: after AlphaTracker grades a ruling, each agent receives a personalised lesson (what they called, what happened, what to review). Lessons accumulate up to 8 per agent and are injected into future council prompts' },
      { type: 'FEAT', text: 'Agent accuracy tracking: correct/total graded calls stored per agent in Firestore and shown in their council context so they self-calibrate over time' },
      { type: 'FEAT', text: 'PM renamed AXIOM — a genuine portfolio manager with knowledge, not just a router. Answers market and strategy questions directly; only convenes council for actual BUY/SELL/HOLD decisions' },
      { type: 'FEAT', text: 'CouncilMark replaces ArcReactor — clean hexagon SVG, no Iron Man references anywhere' },
      { type: 'FIX',  text: 'Groq free-tier rate limit protection: agents called sequentially with 1.5s stagger per round; 429 errors trigger a visible cooldown banner and automatic retry instead of crashing the session' },
      { type: 'FIX',  text: 'Quote cache (45s in-memory) prevents redundant Finnhub calls when convening multiple councils in quick succession' },
      { type: 'FIX',  text: 'AbortController signal support on callAgent — requests can now be cancelled cleanly' },
      { type: 'FIX',  text: 'Parallel prep: quotes, ticker history, agent context, and all 6 agent profiles load simultaneously before Round 1 starts — recovers 3–5s per council run' },
    ],
  },
  {
    version: '0.1.11', date: '2026-06-13', label: 'GUI',
    changes: [
      { type: 'FEAT', text: 'AmbientBackground canvas scene behind all UI: sunrise gradient + crepuscular rays + drifting clouds (premarket), portfolio-direction particles (open), sunset beach + ocean shimmer + birds (afterhours), deep space + twinkling stars + moon + shooting stars (overnight/evening), cool dark (closed/weekend)' },
      { type: 'FEAT', text: 'GSAP boot sequence: sidebar slides in from left, main content fades up from below on first load' },
      { type: 'FEAT', text: 'Portfolio value digit-scramble: number cycles through random digits before settling every time quotes refresh' },
      { type: 'FEAT', text: 'Account switcher shared layout: Framer Motion spring-slides the active highlight between account buttons' },
      { type: 'FEAT', text: 'Council agent cards 3D tilt: perspective mouse-tracking on each card, springs back on leave' },
      { type: 'FEAT', text: 'framer-motion + gsap added as dependencies' },
    ],
  },
  {
    version: '0.1.1', date: '2026-06-13', label: 'FIX',
    changes: [
      { type: 'FIX',  text: 'Portfolio positions now persist correctly — Firestore offline persistence enabled; writes queue to IndexedDB and auto-retry on reconnect instead of failing silently on any network hiccup' },
      { type: 'FIX',  text: 'Save status indicator in portfolio header: SAVING… / SAVED ✓ / SAVE FAILED ✕ so you always know if a write went through' },
      { type: 'FIX',  text: 'Account selection (Edwin / Dad / Bro) now persisted in localStorage — no longer resets to Edwin on every page reload' },
      { type: 'FIX',  text: 'Race condition: positions ref now stays in sync with merged Firestore state so a slow initial snapshot can never cause a pending save to overwrite other accounts with empty data' },
      { type: 'FIX',  text: 'Council and Chat rulings were silently dropped on save failure — errors now surface to console instead of vanishing into .catch(() => {})' },
      { type: 'FIX',  text: 'Alpha Tracker infinite re-grade loop: when getQuotes fails entirely, grading is skipped for that load instead of leaving outcomeCheckedAt null and retrying on every page open' },
      { type: 'FIX',  text: 'Ticker history query capped at 50 results — unbounded Firestore read would grow forever and bloat agent prompts' },
      { type: 'FIX',  text: 'CY style constant corrected to #38e0d4 (was hardcoded black #000000)' },
      { type: 'FIX',  text: 'agentContext market tape fetch errors now log a warning instead of silently proceeding with no live context' },
      { type: 'SEC',  text: 'run-agent: added 20,000-char combined prompt limit to prevent Groq API bill abuse by authenticated users' },
      { type: 'SEC',  text: 'send-push: subscriptions now loaded server-side from Firestore using the verified UID — client no longer supplies them, eliminating any ability to target arbitrary push endpoints' },
      { type: 'SEC',  text: 'send-push: replaced decode-only JWT check (forgeable) with proper Firebase Identity Toolkit signature verification' },
      { type: 'SEC',  text: 'get-quotes / get-candles: added ticker format validation (/^[A-Z0-9.]{1,10}$/), 50-ticker cap, and range allowlist' },
    ],
  },
  {
    version: '0.1.0', date: '2026-06-12', label: 'BETA',
    changes: [
      { type: 'FEAT', text: 'Public.com-style portfolio dashboard with equity curve, Clearbit logos, and expand-to-detail' },
      { type: 'FEAT', text: 'Market state banner with live countdown (pre-market, open, after-hours, overnight)' },
      { type: 'FEAT', text: 'Ambient glow shifts color with market state and portfolio direction' },
      { type: 'FEAT', text: 'Real-time Firestore positions sync via onSnapshot across all accounts' },
      { type: 'FEAT', text: '6 specialist agents: Technical, Catalyst, Risk, Macro, Bear, Sizer' },
      { type: 'FEAT', text: 'Portfolio Manager synthesis: BUY / WATCH / PASS verdict + conviction score' },
      { type: 'FEAT', text: 'Chat mode: PM router with inline council convening' },
      { type: 'FEAT', text: 'Live web search via Groq compound-beta for real-time market context' },
      { type: 'FEAT', text: 'Ticker memory: all prior rulings injected into agent prompts (compounds forever)' },
      { type: 'FEAT', text: 'Live context enrichment: sector tape, macro data, intraday highs per agent' },
      { type: 'FEAT', text: 'Alpha Tracker: browse rulings, auto-grade outcomes at 30 days' },
      { type: 'FEAT', text: 'Sell-Protocol Watchdog: scans every holding against the weekly trend rule' },
      { type: 'FEAT', text: 'DCA Allocator: compute ideal recurring buy sizes per account' },
      { type: 'FEAT', text: 'Multi-account: Edwin, Dad, Bro portfolios' },
      { type: 'FEAT', text: 'Dark mode with persistent preference' },
      { type: 'FEAT', text: 'Responsive layout: fixed sidebar on desktop, bottom nav on mobile' },
    ],
  },
];

const BADGE = {
  FEAT: { bg: 'rgba(0,200,5,0.1)',      fg: '#00C805' },
  FIX:  { bg: 'rgba(245,158,11,0.1)',   fg: '#B45309' },
  SEC:  { bg: 'rgba(255,59,48,0.1)',    fg: '#FF3B30' },
  GUI:  { bg: 'rgba(176,131,255,0.15)', fg: '#b083ff' },
};

export default function ChangelogTab({ dark }) {
  const T = theme(dark);
  const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <div style={{ ...FONT, maxWidth: 580, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: T.text, margin: 0 }}>Changelog</h1>
          <p style={{ fontSize: 13, color: T.text2, marginTop: 4, marginBottom: 0 }}>Every release, always logged.</p>
        </div>
        <div style={{ ...MFONT, fontSize: 11, color: T.text2, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: '4px 10px', whiteSpace: 'nowrap' }}>
          Updated {now}
        </div>
      </div>

      <div style={{ position: 'relative', paddingLeft: 24 }}>
        <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 1, background: T.border }} />

        {ENTRIES.map((entry, i) => (
          <div key={entry.version} style={{ marginBottom: 20, position: 'relative' }}>
            <div style={{
              position: 'absolute', left: -24 + 4, top: 14,
              width: 8, height: 8, borderRadius: '50%',
              background: T.text,
              border: `2px solid ${T.text}`,
              zIndex: 1,
            }} />
            <div style={{
              border: `1px solid ${T.text}`,
              borderRadius: 12,
              background: T.bg,
              padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>v{entry.version}</span>
                <span style={{ ...MFONT, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: T.text, color: T.bg, letterSpacing: '0.06em' }}>
                  {entry.label}
                </span>
                <span style={{ ...MFONT, fontSize: 12, color: T.text2, marginLeft: 'auto' }}>{entry.date}</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {entry.changes.map((c, j) => (
                  <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                    <span style={{ ...MFONT, fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, flexShrink: 0, marginTop: 1, background: BADGE[c.type]?.bg || T.bgCard, color: BADGE[c.type]?.fg || T.text2 }}>
                      {c.type}
                    </span>
                    <span style={{ color: T.text2, lineHeight: 1.5 }}>{c.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
