import React from 'react';
import { LogOut } from 'lucide-react';
import { SANS, CY } from '../constants/styles.js';

export default function Header({ onSignOut }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2.5">
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: CY, flexShrink: 0 }} className="blink" />
        <span style={{ ...SANS, fontWeight: 700, fontSize: '15px', letterSpacing: '-0.02em', color: '#e2e8f0' }}>
          The Council
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: CY }} />
          <span style={{ ...SANS, fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>Live</span>
        </div>
        <button onClick={onSignOut} title="Sign out"
          style={{ color: 'rgba(255,255,255,0.28)', padding: '6px', borderRadius: '8px', transition: 'color .15s' }}
          onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.28)'}>
          <LogOut size={14} />
        </button>
      </div>
    </div>
  );
}
