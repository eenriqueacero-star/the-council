import React from 'react';
import { LogOut } from 'lucide-react';
import { MONO, DISP, CY } from '../constants/styles.js';
import ArcReactor from './ArcReactor.jsx';

export default function Header({ onSignOut }) {
  return (
    <div className="boot flex items-center justify-between flex-wrap gap-3 border-b border-white/10 pb-5">
      <div>
        <div className="flex items-center gap-3">
          <ArcReactor size={32} />
          <h1 style={{ ...DISP, letterSpacing: '0.06em' }} className="neon text-2xl sm:text-3xl font-bold">THE COUNCIL</h1>
        </div>
        <p style={{ ...MONO, color: CY }} className="text-[11px] sm:text-xs opacity-70 mt-1 tracking-[0.2em]">J.A.R.V.I.S. // MULTI-AGENT COMMAND DECK</p>
      </div>
      <div className="flex items-center gap-4">
        <div style={MONO} className="text-[10px] text-white/40 text-right leading-relaxed">
          <div className="flex items-center justify-end gap-1.5">
            <span className="blink inline-block w-1.5 h-1.5 rounded-full" style={{ background: CY, boxShadow: `0 0 8px ${CY}` }} />
            ONLINE
          </div>
          <div>SELL-PROTOCOL · 4-GATE ENGINE</div>
          <div className="text-white/25">6-AGENT COUNCIL</div>
        </div>
        <button onClick={onSignOut} title="Sign out"
          className="p-2 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors">
          <LogOut size={15} />
        </button>
      </div>
    </div>
  );
}
