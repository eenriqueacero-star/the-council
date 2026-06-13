import React from 'react';
import { CY } from '../constants/styles.js';

export default function CouncilMark({ size = 30, className }) {
  // Hexagon vertices for a regular hexagon centered at (50,50) with radius 42
  const r = 42;
  const cx = 50, cy = 50;
  const hexPoints = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      style={{ filter: `drop-shadow(0 0 ${size / 6}px rgba(56,224,212,0.6))` }}
    >
      {/* Outer hexagon */}
      <polygon
        points={hexPoints}
        fill="none"
        stroke={CY}
        strokeWidth="2.5"
        strokeOpacity="0.8"
      />
      {/* Inner circle */}
      <circle
        cx={cx}
        cy={cy}
        r="10"
        fill={CY}
        fillOpacity="0.9"
      />
      <circle
        cx={cx}
        cy={cy}
        r="10"
        fill="none"
        stroke="#cdf6ff"
        strokeWidth="1.5"
      />
    </svg>
  );
}
