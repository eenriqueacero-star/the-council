import React from 'react';
import { LogOut } from 'lucide-react';
import { MONO, DISP, CY } from '../constants/styles.js';
import ArcReactor from './ArcReactor.jsx';

export default function Header({ onSignOut }) {
  return (
    <div className="boot flex items-center justify-between flex-wrap gap-3 pb-5" style={{ borderBottom: '1px solid rgba(226,221,213,0.08)' }}>
      <div>
        <div className="flex items-center gap-3">
          <ArcReactor size={30} />
          <h1 style={{ ...DISP, letterSpacing: '0.22em', fontWeight: 700 }} className="neon text-xl sm:text-2xl">THE COUNCIL</h1>
        </div>
        <p style={{ ...MONO, color: 'rgba(226,221,213,0.35)', letterSpacing: '0.16em' }} className="text-[10px] mt-1.5">MULTI-AGENT INVESTMENT INTELLIGENCE</p>
      </div>
      <div className="flex items-center gap-4">
        <div style={{ ...MONO, color: 'rgba(226,221,213,0.32)' }} className="text-[10px] text-right leading-relaxed">
          <div className="flex items-center justify-end gap-1.5 mb-0.5">
            <span className="blink inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#2fcb8a', boxShadow: '0 0 6px #2fcb8a' }} />
            <span style={{ color: '#2fcb8a', letterSpacing: '0.12em' }}>ONLINE</span>
          </div>
          <div style={{ letterSpacing: '0.08em' }}>SELL PROTOCOL · 4-GATE ENGINE</div>
        </div>
        <button onClick={onSignOut} title="Sign out"
          style={{ color: 'rgba(226,221,213,0.28)' }}
          className="p-2 rounded-lg transition-colors hover:text-[rgba(226,221,213,0.7)] hover:bg-[rgba(226,221,213,0.04)]">
          <LogOut size={14} />
        </button>
      </div>
    </div>
  );
}
