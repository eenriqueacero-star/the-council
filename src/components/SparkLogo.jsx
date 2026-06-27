import React from 'react';

export default function SparkLogo({ size = 24, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" style={style}>
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#3B82F6"/>
          <stop offset="25%"  stopColor="#A855F7"/>
          <stop offset="50%"  stopColor="#EF4444"/>
          <stop offset="75%"  stopColor="#F59E0B"/>
          <stop offset="100%" stopColor="#22C55E"/>
        </linearGradient>
      </defs>
      <path
        d="M60 8 L66 48 L100 28 L72 54 L112 60 L72 66 L100 92 L66 72 L60 112 L54 72 L20 92 L48 66 L8 60 L48 54 L20 28 L54 48 Z"
        fill="none" stroke="url(#sparkGrad)" strokeWidth="5" strokeLinejoin="round"
      />
      <circle cx="60" cy="60" r="10" fill="url(#sparkGrad)"/>
    </svg>
  );
}
