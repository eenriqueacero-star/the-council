import React from 'react';

export default function MarketOverlay({ state, dark }) {
  if (state === 'open') return null;
  const isPremarket  = state === 'premarket';
  const isAfterHours = state === 'afterhours';
  const isNight      = state === 'overnight' || state === 'evening';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {isNight && (
        <div style={{
          position: 'absolute', inset: 0,
          background: dark
            ? 'radial-gradient(ellipse 80% 45% at 50% 0%, rgba(60,20,110,0.3) 0%, transparent 70%)'
            : 'radial-gradient(ellipse 80% 45% at 50% 0%, rgba(67,26,130,0.05) 0%, transparent 70%)',
        }} />
      )}
      {isPremarket && (
        <div style={{
          position: 'absolute', bottom: 0, left: '-20%', right: '-20%',
          height: 280,
          background: 'linear-gradient(to top, rgba(245,158,11,0.12) 0%, rgba(251,191,36,0.04) 40%, transparent 100%)',
          filter: 'blur(32px)',
        }} />
      )}
      {isAfterHours && (
        <div style={{
          position: 'absolute', top: -80, left: '-15%', right: '-15%',
          height: 340,
          background: 'linear-gradient(to bottom, rgba(124,58,237,0.12) 0%, rgba(139,92,246,0.04) 50%, transparent 100%)',
          filter: 'blur(32px)',
        }} />
      )}
    </div>
  );
}
