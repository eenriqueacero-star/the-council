import React from 'react';

export default function SparkLogo({ size = 24, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={style}>
      <defs>
        <linearGradient id="sl1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#6366F1"/>
          <stop offset="33%"  stopColor="#3B82F6"/>
          <stop offset="66%"  stopColor="#A855F7"/>
          <stop offset="100%" stopColor="#22C55E"/>
        </linearGradient>
        <linearGradient id="sl2" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#EF4444"/>
          <stop offset="50%"  stopColor="#F59E0B"/>
          <stop offset="100%" stopColor="#6366F1"/>
        </linearGradient>
      </defs>
      <line x1="32" y1="6"  x2="32" y2="25" stroke="url(#sl1)" strokeWidth="5" strokeLinecap="round"/>
      <line x1="32" y1="39" x2="32" y2="58" stroke="url(#sl1)" strokeWidth="5" strokeLinecap="round"/>
      <line x1="10" y1="19" x2="25" y2="28" stroke="url(#sl1)" strokeWidth="5" strokeLinecap="round"/>
      <line x1="39" y1="36" x2="54" y2="45" stroke="url(#sl1)" strokeWidth="5" strokeLinecap="round"/>
      <line x1="54" y1="19" x2="39" y2="28" stroke="url(#sl2)" strokeWidth="5" strokeLinecap="round"/>
      <line x1="25" y1="36" x2="10" y2="45" stroke="url(#sl2)" strokeWidth="5" strokeLinecap="round"/>
      <circle cx="32" cy="32" r="6" fill="url(#sl1)"/>
    </svg>
  );
}
