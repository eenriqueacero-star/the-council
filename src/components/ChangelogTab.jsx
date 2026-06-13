import React from 'react';
import { theme } from '../utils/theme.js';

const FONT  = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };
const MFONT = { fontFamily: "ui-monospace, 'SF Mono', monospace" };

const ENTRIES = [
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
  FEAT: { bg: 'rgba(0,200,5,0.1)',    fg: '#00C805' },
  FIX:  { bg: 'rgba(245,158,11,0.1)', fg: '#B45309' },
  SEC:  { bg: 'rgba(255,59,48,0.1)',  fg: '#FF3B30' },
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
