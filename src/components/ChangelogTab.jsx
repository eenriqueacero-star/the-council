import React from 'react';

const FONT  = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };
const MFONT = { fontFamily: "ui-monospace, 'SF Mono', monospace" };

const ENTRIES = [
  {
    version: '2.0.0', date: '2026-06-11', label: 'Major Update',
    changes: [
      { type: 'FEAT', text: 'Complete UI rebuild: Public.com visual design, white bg, SF Pro font' },
      { type: 'FEAT', text: 'Robinhood-style portfolio: equity curve, Clearbit logos, expand-to-detail' },
      { type: 'FEAT', text: 'Market state banner with live countdown (pre-market, after-hours, overnight)' },
      { type: 'FEAT', text: 'Ambient glow: shifts color with market state and portfolio direction' },
      { type: 'FEAT', text: 'Bottom nav (mobile) + 240px fixed sidebar (desktop)' },
      { type: 'FEAT', text: 'Real-time Firestore positions sync via onSnapshot' },
    ],
  },
  {
    version: '1.5.0', date: '2026-05-20', label: 'Intelligence Layer',
    changes: [
      { type: 'FEAT', text: 'Ticker memory: all prior rulings on a ticker injected into agent prompts' },
      { type: 'FEAT', text: 'Live context enrichment: sector tape, macro data, earnings per agent' },
      { type: 'FEAT', text: 'Ruling logger: every completed council run saved to Firestore' },
      { type: 'FEAT', text: 'Alpha Tracker tab: browse rulings, auto-grade outcomes at 30 days' },
    ],
  },
  {
    version: '1.4.0', date: '2026-04-15', label: 'Update',
    changes: [
      { type: 'FEAT', text: 'Switched to Groq llama-3.3-70b for faster, cheaper agent inference' },
      { type: 'FIX',  text: 'Fixed positions not loading on refresh (Firestore auth race condition)' },
    ],
  },
  {
    version: '1.3.0', date: '2026-03-10', label: 'Update',
    changes: [
      { type: 'FEAT', text: 'Watchdog tab: daily portfolio sentiment scanning' },
      { type: 'FEAT', text: 'DCA Allocator: compute ideal recurring buy sizes per account' },
      { type: 'FIX',  text: 'Improved JSON extraction for malformed agent outputs' },
    ],
  },
  {
    version: '1.0.0', date: '2026-01-01', label: 'Launch',
    changes: [
      { type: 'FEAT', text: '6 specialist agents: Technical, Catalyst, Risk, Macro, Bear, Sizer' },
      { type: 'FEAT', text: 'Portfolio Manager synthesis: BUY / WATCH / PASS verdict + conviction score' },
      { type: 'FEAT', text: 'Chat mode: PM router with inline council convening' },
      { type: 'FEAT', text: 'Multi-account: Edwin, Dad, Bro portfolios' },
    ],
  },
];

const BADGE = {
  FEAT: { bg: 'rgba(0,200,5,0.1)',   fg: '#00C805' },
  FIX:  { bg: 'rgba(245,158,11,0.1)', fg: '#B45309' },
};

export default function ChangelogTab() {
  const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <div style={{ ...FONT, maxWidth: 580, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#000', margin: 0 }}>Changelog</h1>
          <p style={{ fontSize: 13, color: '#AAAAAA', marginTop: 4, marginBottom: 0 }}>Every release, always logged.</p>
        </div>
        <div style={{ ...MFONT, fontSize: 11, color: '#757575', background: '#F7F7F7', border: '1px solid #EEEEEE', borderRadius: 8, padding: '4px 10px', whiteSpace: 'nowrap' }}>
          Updated {now}
        </div>
      </div>

      <div style={{ position: 'relative', paddingLeft: 24 }}>
        <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 1, background: '#EEEEEE' }} />

        {ENTRIES.map((entry, i) => (
          <div key={entry.version} style={{ marginBottom: 20, position: 'relative' }}>
            <div style={{
              position: 'absolute', left: -24 + 4, top: 14,
              width: 8, height: 8, borderRadius: '50%',
              background: i === 0 ? '#000000' : '#CCCCCC',
              border: `2px solid ${i === 0 ? '#000000' : '#CCCCCC'}`,
              zIndex: 1,
            }} />
            <div style={{
              border: `1px solid ${i === 0 ? '#000000' : '#EEEEEE'}`,
              borderRadius: 12,
              background: i === 0 ? '#FFFFFF' : '#F7F7F7',
              padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#000' }}>v{entry.version}</span>
                <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6, background: i === 0 ? '#000' : '#EEEEEE', color: i === 0 ? '#fff' : '#757575' }}>
                  {entry.label}
                </span>
                <span style={{ ...MFONT, fontSize: 12, color: '#AAAAAA', marginLeft: 'auto' }}>{entry.date}</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {entry.changes.map((c, j) => (
                  <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                    <span style={{ ...MFONT, fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, flexShrink: 0, marginTop: 1, background: BADGE[c.type]?.bg || '#EEEEEE', color: BADGE[c.type]?.fg || '#757575' }}>
                      {c.type}
                    </span>
                    <span style={{ color: '#757575', lineHeight: 1.5 }}>{c.text}</span>
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
