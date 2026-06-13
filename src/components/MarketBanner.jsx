import React, { useState, useEffect, useRef } from 'react';

const FONT = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };
const MFONT = { fontFamily: "ui-monospace, 'SF Mono', monospace" };

// Airport departure-board digit — flips when value changes
function FlipDigit({ value }) {
  const [cur,  setCur]  = useState(value);
  const [prev, setPrev] = useState(value);
  const [key,  setKey]  = useState(0);

  useEffect(() => {
    if (value === cur) return;
    setPrev(cur);
    setCur(value);
    setKey(k => k + 1);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span style={{ position:'relative', display:'inline-block', minWidth:'0.65em', overflow:'hidden', textAlign:'center' }}>
      <span key={key} className="flip-digit-new" style={{ display:'block' }}>{cur}</span>
    </span>
  );
}

function FlipCountdown({ ms }) {
  if (ms <= 0) return <span style={MFONT}>Opening now…</span>;
  const s   = Math.floor(ms / 1000);
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (h > 0) {
    return (
      <span style={{ ...MFONT, fontSize:12 }}>
        Opens in {h}h{' '}
        <FlipDigit value={String(m).padStart(2,'0')[0]} /><FlipDigit value={String(m).padStart(2,'0')[1]} />m
      </span>
    );
  }
  const mm = String(m).padStart(2,'0');
  const ss = String(sec).padStart(2,'0');
  return (
    <span style={{ ...MFONT, fontSize:12, display:'inline-flex', alignItems:'center', gap:1, letterSpacing:'0.04em' }}>
      Opens in{' '}
      <FlipDigit value={mm[0]} /><FlipDigit value={mm[1]} />m{' '}
      <FlipDigit value={ss[0]} /><FlipDigit value={ss[1]} />s
    </span>
  );
}

const CONFIGS = {
  premarket:  { emoji: '🌅', label: 'Pre-Market Hours',       bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)',  color: '#B45309', showCount: true  },
  afterhours: { emoji: '🌆', label: 'After-Hours Trading',    bg: 'rgba(139,92,246,0.08)',  border: 'rgba(139,92,246,0.2)', color: '#7C3AED', showCount: false },
  evening:    { emoji: '🌙', label: 'Overnight Hours',        bg: 'rgba(109,40,217,0.06)', border: 'rgba(109,40,217,0.15)', color: '#6D28D9', stars: true, showCount: true },
  overnight:  { emoji: '🌙', label: 'Overnight Hours',        bg: 'rgba(109,40,217,0.06)', border: 'rgba(109,40,217,0.15)', color: '#6D28D9', stars: true, showCount: true },
  weekend:    { emoji: '📅', label: 'Markets Closed',         bg: 'rgba(0,0,0,0.04)',       border: '#EEEEEE',              color: '#757575', showCount: true },
};

export default function MarketBanner({ state, msToOpen }) {
  const [visible,   setVisible]   = useState(false);
  const [remaining, setRemaining] = useState(msToOpen);

  useEffect(() => { const t = setTimeout(() => setVisible(true), 60); return () => clearTimeout(t); }, []);
  useEffect(() => { setRemaining(msToOpen); }, [msToOpen]);
  useEffect(() => {
    if (!remaining) return;
    const id = setInterval(() => setRemaining(r => Math.max(0, r - 1000)), 1000);
    return () => clearInterval(id);
  }, [!!remaining]);

  if (state === 'open') return null;
  const cfg = CONFIGS[state] || CONFIGS.weekend;

  return (
    <div style={{
      ...FONT,
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.3s ease',
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: 10,
      padding: '9px 14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: 13,
      color: cfg.color,
      margin: '10px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{cfg.emoji}</span>
        <span style={{ fontWeight: 500 }}>{cfg.label}</span>
        {cfg.stars && (
          <span style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
            {[0, 0.5, 1].map(delay => (
              <span key={delay} className="star-shimmer"
                style={{ animationDelay: `${delay}s`, fontSize: 10, color: cfg.color }}>✦</span>
            ))}
          </span>
        )}
      </div>
      {cfg.showCount && (
        <span style={{ opacity: 0.85 }}><FlipCountdown ms={remaining} /></span>
      )}
    </div>
  );
}
