import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Map, FileText, Check, CircleDot, Clock } from 'lucide-react';
import { theme } from '../utils/theme.js';
import { ROADMAP } from '../constants/agents.js';

const FONT  = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };
const MFONT = { fontFamily: "ui-monospace, 'SF Mono', monospace" };

const CHANGELOG_ENTRIES = [
  {
    version: '0.4.0', date: '2026-06-27', label: 'MAJOR',
    changes: [
      { type: 'GUI', text: 'Full Apple-clean UI redesign — zinc-based dark palette, Inter font, Framer Motion page transitions, icon-only side rail, glass bottom nav, animated portfolio counter, stagger-in holdings list' },
      { type: 'GUI', text: 'Post-redesign polish — zero cyan/teal: all colors replaced with #22C55E green, #EF4444 red, #3B82F6 blue. Agent colors: REX #6366F1, NOVA #F59E0B, SAGE #A855F7, ATLAS #3B82F6, VEGA #EF4444, ZEN #22C55E' },
      { type: 'GUI', text: 'Spark logo — 6-spoke gradient starburst cycling through all agent colors. Replaces ArcReactor everywhere. New favicon.svg + SparkLogo.jsx component' },
      { type: 'GUI', text: 'CouncilLoader — 6 colored dots orbiting, pure linear spin, sm/md/lg sizes. Boot splash on auth load. Replaces all Loader2 spinners' },
      { type: 'GUI', text: 'Chart redesign — Catmull-Rom bezier curves, Y-axis dollar labels + grid lines, X-axis date/time labels, 3-stop gradient fill, scrub crosshair preserved' },
      { type: 'GUI', text: 'Tab restructure — 7 focused tabs, DCA merged into Portfolio bottom sheet, Watchdog removed, Roadmap+Changelog merged into Updates, MarketOverlay particles removed' },
      { type: 'FIX', text: 'checkAlerts: returns early when market is closed — no more weekend/holiday notifications from stale Friday data' },
    ],
  },
  {
    version: '0.3.3', date: '2026-06-26', label: 'FIX',
    changes: [
      { type: 'FIX', text: 'AXIOM hallucinating macro explanations — added MACRO GROUNDING RULE: AXIOM may only cite reasons that appear in LIVE DATA, PORTFOLIO DATA, or RECENT NEWS blocks. Honesty about uncertainty over invented CPI surprises.' },
      { type: 'FEAT', text: 'Portfolio data block now includes recent headlines for the top 3 biggest movers (by absolute $ day change). Fetched in parallel via getNews, giving AXIOM real news to cite.' },
    ],
  },
  {
    version: '0.3.2', date: '2026-06-26', label: 'FIX',
    changes: [
      { type: 'FIX', text: 'Portfolio data lost on follow-ups — data now carries over for next 3 follow-up messages. Clears when a new ticker council is convened.' },
      { type: 'FIX', text: 'AXIOM tone still corporate despite prompt update — rewrote axiomSys router prompt with explicit BAD/GOOD tone examples. Casual, direct, market slang.' },
      { type: 'FIX', text: 'AXIOM wrapping JSON in code fences — format instruction changed to "Output ONLY the raw JSON object." Saves tokens every call.' },
    ],
  },
  {
    version: '0.3.1', date: '2026-06-26', label: 'DEBUG',
    changes: [
      { type: 'FEAT', text: 'Universal Debug System — every feature pipes data into debugStore.js. No prop drilling. Debug panel shows COUNCIL / SCOUT / ALERTS / CHAT / RECON / ALL sections.' },
      { type: 'FIX',  text: 'Removed setDebugLog prop drilling from CouncilTab, ScoutTab, App.jsx — all debug writes go through debugStore directly.' },
    ],
  },
  {
    version: '0.3.0', date: '2026-06-26', label: 'MAJOR',
    changes: [
      { type: 'FEAT', text: 'Scout Mode — watchlist + auto-discovery pool scanned in a single-round lightweight council. Results sorted by conviction. BUY 7+ highlighted.' },
      { type: 'FEAT', text: 'Portfolio Alerts — price check on all holdings every 5 min. Configurable thresholds. Fires Web Notifications. Alert history in Firestore.' },
      { type: 'FEAT', text: 'AXIOM live portfolio data in chat — ask "how did my portfolio do today" and AXIOM gets live prices, calculates day P&L and unrealized gain/loss.' },
    ],
  },
  {
    version: '0.2.0', date: '2026-06-13', label: 'MAJOR',
    changes: [
      { type: 'FEAT', text: 'Named agents: REX ⚡ NOVA 🚀 SAGE 🛡️ ATLAS 🌐 VEGA 🐻 ZEN ⚖️ — each with distinct personality, color, and domain expertise' },
      { type: 'FEAT', text: '3-round council deliberation: Round 1 = independent analysis, Round 2 = cross-examination, Round 3 = final consensus position' },
      { type: 'FEAT', text: 'Autonomous domain research: each agent runs live web search on their specialty every 4 hours and injects the fresh intel into council runs' },
      { type: 'FEAT', text: 'Agent learning system: after AlphaTracker grades a ruling, each agent receives a personalised lesson. Lessons accumulate and inject into future runs' },
      { type: 'FEAT', text: 'PM renamed AXIOM — genuine portfolio manager. Answers market questions directly; only convenes council for actual BUY/SELL/HOLD decisions' },
    ],
  },
  {
    version: '0.1.0', date: '2026-06-12', label: 'BETA',
    changes: [
      { type: 'FEAT', text: 'Portfolio dashboard with equity curve, Clearbit logos, expand-to-detail' },
      { type: 'FEAT', text: '6 specialist agents: Technical, Catalyst, Risk, Macro, Bear, Sizer' },
      { type: 'FEAT', text: 'Alpha Tracker: browse rulings, auto-grade outcomes at 30 days' },
      { type: 'FEAT', text: 'Sell-Protocol Watchdog: scans every holding against the weekly trend rule' },
      { type: 'FEAT', text: 'Multi-account: Edwin, Dad, Bro portfolios' },
    ],
  },
];

const BADGE = {
  FEAT:  { bg: 'rgba(34,197,94,0.1)',   fg: '#22C55E' },
  FIX:   { bg: 'rgba(245,158,11,0.1)',  fg: '#B45309' },
  SEC:   { bg: 'rgba(239,68,68,0.1)',   fg: '#EF4444' },
  GUI:   { bg: 'rgba(168,85,247,0.15)', fg: '#A855F7' },
  DEBUG: { bg: 'rgba(59,130,246,0.1)',  fg: '#3B82F6' },
  MAJOR: { bg: 'rgba(99,102,241,0.1)',  fg: '#6366F1' },
  BETA:  { bg: 'rgba(245,158,11,0.1)',  fg: '#F59E0B' },
};

function AccordionSection({ title, icon: Icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          ...FONT, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer', borderBottom: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon size={16} style={{ color: '#3B82F6' }} />
          <span style={{ fontSize: 17, fontWeight: 600, color: '#FAFAFA' }}>{title}</span>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={18} style={{ color: '#52525B' }} />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ paddingBottom: 28 }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RoadmapContent({ T }) {
  return (
    <>
      <p style={{ fontSize: 13, color: T.text2, lineHeight: 1.55, marginBottom: 20 }}>
        Everything agreed is worth building, so nothing gets forgotten. Top section is live; the rest is ranked by edge.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {ROADMAP.map(group => (
          <div key={group.tier}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ ...MFONT, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: group.color }}>{group.tier}</span>
              <div style={{ flex: 1, height: 1, background: `${group.color}22` }} />
              <span style={{ ...MFONT, fontSize: 10, color: T.text3 }}>{group.items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {group.items.map(it => {
                const built = group.tier === 'BUILT';
                return (
                  <div key={it.name} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    border: `1px solid ${built ? group.color + '33' : T.border}`,
                    borderRadius: 12, padding: '12px 14px', background: T.bgCard,
                  }}>
                    <div style={{ borderRadius: 8, padding: 6, background: `${group.color}18`, flexShrink: 0, marginTop: 1 }}>
                      {built ? <Check size={13} style={{ color: group.color }} /> : <CircleDot size={13} style={{ color: group.color }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ ...MFONT, fontSize: 13, fontWeight: 700, color: T.text }}>{it.name}</span>
                        {built && (
                          <span style={{ ...MFONT, fontSize: 8, letterSpacing: '0.10em', color: group.color, border: `1px solid ${group.color}44`, background: `${group.color}12`, padding: '2px 6px', borderRadius: 4 }}>LIVE</span>
                        )}
                      </div>
                      <p style={{ fontSize: 12, color: T.text2, lineHeight: 1.4, marginTop: 3 }}>{it.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 24, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.22)' }}>
        <Clock size={14} style={{ color: '#F59E0B', marginTop: 1, flexShrink: 0 }} />
        <div>
          <div style={{ ...MFONT, fontSize: 10, fontWeight: 600, letterSpacing: '0.10em', color: '#F59E0B', marginBottom: 4 }}>WHEN READY</div>
          <p style={{ fontSize: 12, color: T.text2, lineHeight: 1.55 }}>
            Morning Brief, Shared Recon, Trade Log, All-Accounts mode, and real watchlist picks are coming in Phase E.
          </p>
        </div>
      </div>
    </>
  );
}

function ChangelogContent({ T }) {
  const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div style={{ ...MFONT, fontSize: 11, color: T.text2, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: '4px 10px' }}>
          Updated {now}
        </div>
      </div>
      <div style={{ position: 'relative', paddingLeft: 24 }}>
        <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 1, background: T.border }} />
        {CHANGELOG_ENTRIES.map(entry => (
          <div key={entry.version} style={{ marginBottom: 20, position: 'relative' }}>
            <div style={{ position: 'absolute', left: -24 + 4, top: 14, width: 8, height: 8, borderRadius: '50%', background: T.text, border: `2px solid ${T.text}`, zIndex: 1 }} />
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, background: T.bgCard, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>v{entry.version}</span>
                <span style={{ ...MFONT, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: BADGE[entry.label]?.bg || T.bgCard, color: BADGE[entry.label]?.fg || T.text2, letterSpacing: '0.06em' }}>
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
    </>
  );
}

export default function UpdatesTab({ dark }) {
  const T = theme(dark);
  return (
    <div style={{ ...FONT, maxWidth: 680, margin: '0 auto', padding: 'var(--space-page)' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 4 }}>Updates</h1>
      <p style={{ fontSize: 13, color: T.text2, marginBottom: 24 }}>What's built and what's coming.</p>

      <div style={{ borderTop: `1px solid ${T.border}` }}>
        <AccordionSection title="Roadmap" icon={Map} defaultOpen={true}>
          <RoadmapContent T={T} />
        </AccordionSection>
        <div style={{ borderTop: `1px solid ${T.border}` }} />
        <AccordionSection title="Changelog" icon={FileText} defaultOpen={false}>
          <ChangelogContent T={T} />
        </AccordionSection>
      </div>
    </div>
  );
}
