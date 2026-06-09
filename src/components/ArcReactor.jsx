import React from 'react';
import { CY } from '../constants/styles.js';

export default function ArcReactor({ size = 30 }) {
  const spokes = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ filter: `drop-shadow(0 0 ${size / 6}px rgba(63,224,255,0.7))` }}>
      <circle className="spin-slow" cx="50" cy="50" r="45" fill="none" stroke={CY} strokeOpacity="0.45" strokeWidth="1.4" strokeDasharray="5 6" />
      <circle className="spin-rev"  cx="50" cy="50" r="35" fill="none" stroke={CY} strokeOpacity="0.7"  strokeWidth="2"   strokeDasharray="22 9" />
      <circle cx="50" cy="50" r="24" fill="none" stroke={CY} strokeOpacity="0.35" strokeWidth="1" />
      {spokes.map(a => (
        <line key={a}
          x1={50 + 12 * Math.cos(a * Math.PI / 180)} y1={50 + 12 * Math.sin(a * Math.PI / 180)}
          x2={50 + 23 * Math.cos(a * Math.PI / 180)} y2={50 + 23 * Math.sin(a * Math.PI / 180)}
          stroke={CY} strokeOpacity="0.45" strokeWidth="1.2" />
      ))}
      <circle className="core-pulse" cx="50" cy="50" r="12" fill={CY} fillOpacity="0.85" />
      <circle cx="50" cy="50" r="12" fill="none" stroke="#cdf6ff" strokeWidth="1.6" />
    </svg>
  );
}
