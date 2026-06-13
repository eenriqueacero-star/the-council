import React, { useMemo } from 'react';

// Deterministic star layout — same positions every render, no randomness
const STARS = Array.from({ length: 60 }, (_, i) => ({
  id: i,
  x: ((Math.sin(i * 17.3 + 1.1) + 1) / 2) * 100,
  y: ((Math.cos(i * 13.7 + 0.5) + 1) / 2) * 100,
  size: 1 + (i % 4) * 0.55,
  dur: 2 + (i % 7),
  delay: (i * 0.37) % 5,
  bright: i % 5 === 0,
}));

// Constellation edges connecting a subset of stars
const EDGES = [
  [0,7],[7,14],[14,3],[3,18],[18,0],
  [22,31],[31,40],[40,22],
  [8,15],[15,24],[24,8],
];

export default function MarketOverlay({ state, dark }) {
  if (state === 'open') return null;
  const isNight    = state === 'overnight' || state === 'evening';
  const isPremarket = state === 'premarket';
  const isAfterHours = state === 'afterhours';

  return (
    <div style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none', overflow:'hidden' }}>
      {isNight      && <NightEffect      dark={dark} />}
      {isPremarket  && <PremarketEffect  dark={dark} />}
      {isAfterHours && <AfterHoursEffect dark={dark} />}
    </div>
  );
}

function NightEffect({ dark }) {
  const starColor  = dark ? '#e0d8ff' : '#6D28D9';
  const lineColor  = dark ? '#8B5CF6' : '#6D28D9';
  const starOpacity = dark ? 0.7 : 0.25;
  const lineOpacity = dark ? 0.10 : 0.04;

  return (
    <>
      {/* Deep space radial tint from top */}
      <div style={{
        position:'absolute', inset:0,
        background: dark
          ? 'radial-gradient(ellipse 80% 45% at 50% 0%, rgba(60,20,110,0.45) 0%, transparent 70%)'
          : 'radial-gradient(ellipse 80% 45% at 50% 0%, rgba(67,26,130,0.07) 0%, transparent 70%)',
      }} />

      {/* Constellation lines */}
      <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity: lineOpacity }}>
        {EDGES.map(([a, b], i) => (
          <line key={i}
            x1={`${STARS[a].x}%`} y1={`${STARS[a].y}%`}
            x2={`${STARS[b].x}%`} y2={`${STARS[b].y}%`}
            stroke={lineColor} strokeWidth="0.6"
          />
        ))}
      </svg>

      {/* Stars */}
      {STARS.map(s => (
        <div key={s.id}
          className="twinkle-star"
          style={{
            position:'absolute',
            left:`${s.x}%`, top:`${s.y}%`,
            width: s.bright ? s.size + 1 : s.size,
            height: s.bright ? s.size + 1 : s.size,
            borderRadius:'50%',
            background: s.bright ? '#ffffff' : starColor,
            opacity: starOpacity,
            boxShadow: s.bright && dark ? `0 0 ${s.size * 3}px 1px rgba(180,160,255,0.6)` : 'none',
            '--dur': `${s.dur}s`,
            '--delay': `${s.delay}s`,
          }}
        />
      ))}

      {/* Shooting star track */}
      <div className="shooting-star" style={{
        position:'absolute',
        top:'12%', left:'-5%',
        width: 140,
        height: 1.5,
        borderRadius:2,
        background: dark
          ? 'linear-gradient(to right, transparent, rgba(220,210,255,0.9), transparent)'
          : 'linear-gradient(to right, transparent, rgba(109,40,217,0.5), transparent)',
      }} />
    </>
  );
}

function PremarketEffect({ dark }) {
  return (
    <>
      {/* Amber horizon glow at bottom */}
      <div className="dawn-pulse" style={{
        position:'absolute', bottom:0, left:'-20%', right:'-20%',
        height: 280,
        background:'linear-gradient(to top, rgba(245,158,11,0.20) 0%, rgba(251,191,36,0.08) 40%, transparent 100%)',
        filter:'blur(24px)',
      }} />
      {/* Secondary warm accent */}
      <div style={{
        position:'absolute', bottom:0, left:'20%', right:'20%',
        height:120,
        background:'linear-gradient(to top, rgba(251,146,60,0.18) 0%, transparent 100%)',
        filter:'blur(12px)',
      }} />
      {/* Horizontal scan sweep — kept very faint so it only shows in gaps between content */}
      <div className="scan-bar" style={{
        position:'absolute', top:0, bottom:0, width:200,
        background:'linear-gradient(to right, transparent, rgba(245,158,11,0.022), rgba(251,191,36,0.038), rgba(245,158,11,0.022), transparent)',
      }} />
      <div className="scan-bar-slow" style={{
        position:'absolute', top:0, bottom:0, width:120,
        background:'linear-gradient(to right, transparent, rgba(251,191,36,0.018), transparent)',
      }} />
    </>
  );
}

function AfterHoursEffect({ dark }) {
  return (
    <>
      {/* Purple sunset from top */}
      <div className="aurora" style={{
        position:'absolute', top:-80, left:'-15%', right:'-15%',
        height:340,
        background:'linear-gradient(to bottom, rgba(124,58,237,0.18) 0%, rgba(139,92,246,0.07) 50%, transparent 100%)',
        filter:'blur(28px)',
      }} />
      {/* Warm mid-purple accent */}
      <div className="aurora-slow" style={{
        position:'absolute', top:0, left:'25%', right:'25%',
        height:200,
        background:'radial-gradient(ellipse at 50% 0%, rgba(167,139,250,0.10) 0%, transparent 70%)',
        filter:'blur(16px)',
      }} />
    </>
  );
}
