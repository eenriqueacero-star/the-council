import React from 'react';
import { Clock } from 'lucide-react';
import { MONO, DISP, CY } from '../constants/styles.js';

const ENTRIES = [
  {
    version: 'v1.4.0',
    date: '2026-06-11',
    label: 'Portfolio Overhaul + Glow Effects',
    changes: [
      { type: 'feat', text: 'Robinhood-style equity curve — animated SVG line draws in on load with glowing green stroke and area gradient' },
      { type: 'feat', text: 'Time range selector: 1D / 1W / 1M / 3M / 1Y / ALL — active pill glows green' },
      { type: 'feat', text: 'Holdings list with live market value, total P&L, and per-position day % change with colored glow' },
      { type: 'feat', text: 'New Finnhub candles API endpoint for historical OHLC chart data' },
      { type: 'fix',  text: 'Council agent timeout raised 10s → 60s — was silently cutting off full analyses' },
      { type: 'feat', text: 'Global glow effects — convene button, agent cards, tab highlights, holding rows on hover' },
      { type: 'feat', text: 'Changelog tab with full update history and live last-updated timestamp' },
    ],
  },
  {
    version: 'v1.3.0',
    date: '2026-06-10',
    label: 'Agent Intelligence System',
    changes: [
      { type: 'feat', text: 'Alpha Tracker tab — all-time track record with auto-grading at 30 days (target hit / stopped out / expired)' },
      { type: 'feat', text: 'Per-agent accuracy breakdown — unlocks after 5+ graded rulings, improves with every run' },
      { type: 'feat', text: 'Ticker memory — every prior council call on a ticker injected into new analyses, compounds forever' },
      { type: 'feat', text: 'Live context injection — Technical gets sector tape (SOXX/SMH/XLK), Macro gets SPY/TLT/GLD/VIX, Bear gets intraday range' },
      { type: 'feat', text: 'Ruling logger — every completed council run saved to Firestore permanently' },
      { type: 'fix',  text: 'Positions Firestore load race on refresh — now waits for onAuthStateChanged before querying' },
    ],
  },
  {
    version: 'v1.2.0',
    date: '2026-06-09',
    label: 'Chat & Speed Upgrades',
    changes: [
      { type: 'feat', text: 'PM Chat mode — portfolio manager answers questions and routes to the full council when analysis is needed' },
      { type: 'feat', text: 'Groq API integration (llama-3.3-70b-versatile) — 5–10× faster per-agent responses' },
      { type: 'feat', text: 'Consensus meter — visual agreement bar across all 6 agents shown in synthesis' },
      { type: 'feat', text: 'Roadmap tab' },
      { type: 'fix',  text: 'Removed demo ticker pre-fill — council starts clean with no placeholder noise in prompts' },
    ],
  },
  {
    version: 'v1.1.0',
    date: '2026-06-08',
    label: 'Core Council System',
    changes: [
      { type: 'feat', text: '6-agent council: Technical, Catalyst, Risk, Macro, Bear Thesis, Position Sizer — each with specialist system prompt' },
      { type: 'feat', text: 'Multi-account support — Edwin, Dad, Bro with independent positions, capital, and history' },
      { type: 'feat', text: 'DCA Allocator tab — new-money deployment planner anchored to current holdings' },
      { type: 'feat', text: 'Watchdog mode — scans every position for concentration, oversize, and thesis decay' },
      { type: 'feat', text: 'Live Finnhub price injection — every analysis anchored to real-time price' },
    ],
  },
  {
    version: 'v1.0.0',
    date: '2026-06-07',
    label: 'Launch',
    changes: [
      { type: 'feat', text: 'JARVIS dark theme — animated grid, floating orbs, CRT scanline, boot sequence overlay' },
      { type: 'feat', text: 'Firebase Auth + Firestore sync — positions persist across all devices' },
      { type: 'feat', text: 'HUD corner brackets, neon glow, Chakra Petch + IBM Plex Mono typefaces' },
      { type: 'feat', text: 'Positions tab — track holdings, shares, avg cost with live quote P&L' },
    ],
  },
];

const TYPE_STYLE = {
  feat: { label: 'FEAT', color: '#38e0d4', bg: 'rgba(56,224,212,0.1)' },
  fix:  { label: 'FIX',  color: '#f5c451', bg: 'rgba(245,196,81,0.1)' },
  impr: { label: 'IMPR', color: '#b083ff', bg: 'rgba(176,131,255,0.1)' },
};

function fmtDate(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function ChangelogTab() {
  const latest = ENTRIES[0];

  return (
    <div className="mt-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4 mb-7">
        <div>
          <h2 style={{ ...DISP, color: CY, letterSpacing: '0.12em' }} className="text-lg font-bold neon">CHANGELOG</h2>
          <p style={MONO} className="text-[11px] text-white/40 mt-0.5">full update history · The Council</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg shrink-0"
          style={{ background: 'rgba(56,224,212,0.07)', border: '1px solid rgba(56,224,212,0.22)' }}>
          <Clock size={12} style={{ color: CY }} />
          <span style={{ ...MONO, color: CY }} className="text-[11px] whitespace-nowrap">Last updated: {fmtDate(latest.date)}</span>
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-[7px] top-2 bottom-0 w-px"
          style={{ background: 'linear-gradient(to bottom, rgba(56,224,212,0.45), rgba(56,224,212,0.04))' }} />

        <div className="space-y-7">
          {ENTRIES.map((entry, i) => (
            <div key={entry.version} className="relative pl-8 fade-up" style={{ animationDelay: `${i * 0.07}s` }}>
              <div className="absolute left-0 top-2 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center"
                style={{ background: i === 0 ? CY : '#070a0c', borderColor: i === 0 ? CY : 'rgba(56,224,212,0.3)',
                  boxShadow: i === 0 ? `0 0 14px ${CY}` : 'none' }}>
                {i === 0 && <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#070a0c' }} />}
              </div>

              <div className="rounded-xl p-4"
                style={{ background: i === 0 ? 'rgba(56,224,212,0.04)' : 'rgba(255,255,255,0.025)',
                  border: `1px solid ${i === 0 ? 'rgba(56,224,212,0.22)' : 'rgba(255,255,255,0.08)'}` }}>
                <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 mb-3">
                  <span style={{ ...DISP, color: i === 0 ? CY : 'rgba(255,255,255,0.9)', letterSpacing: '0.06em' }}
                    className="font-bold text-sm">{entry.version}</span>
                  <span style={{ ...MONO, color: 'rgba(255,255,255,0.3)' }} className="text-[11px]">{fmtDate(entry.date)}</span>
                  <span className="ml-auto px-2 py-0.5 rounded text-[10px] font-semibold"
                    style={{ ...DISP, background: i === 0 ? 'rgba(56,224,212,0.14)' : 'rgba(255,255,255,0.06)',
                      color: i === 0 ? CY : 'rgba(255,255,255,0.4)', letterSpacing: '0.04em' }}>
                    {entry.label}
                  </span>
                </div>
                <ul className="space-y-2">
                  {entry.changes.map((c, j) => {
                    const ts = TYPE_STYLE[c.type] || TYPE_STYLE.feat;
                    return (
                      <li key={j} className="flex items-start gap-2.5">
                        <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest"
                          style={{ ...MONO, background: ts.bg, color: ts.color }}>{ts.label}</span>
                        <span style={MONO} className="text-[12px] text-white/62 leading-relaxed">{c.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p style={MONO} className="mt-10 text-[10px] text-white/20 text-center">The Council · powered by Groq + Finnhub + Firebase</p>
    </div>
  );
}
