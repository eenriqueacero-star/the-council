import React from 'react';
import { MONO, DISP } from '../constants/styles.js';
import { ACCOUNTS } from '../constants/agents.js';

export default function AccountSelector({ account, setAccount, positions, running, wdRunning }) {
  return (
    <div className="boot mt-6" style={{ animationDelay: '.08s' }}>
      <label style={MONO} className="text-[11px] text-white/50 tracking-widest">ACTIVE ACCOUNT</label>
      <div className="mt-2 flex gap-2 flex-wrap">
        {Object.entries(ACCOUNTS).map(([key, a]) => {
          const sel = account === key;
          const holdCount = Object.keys(positions[key] || {}).length || a.holdings.length;
          return (
            <button key={key} onClick={() => setAccount(key)} disabled={running || wdRunning}
              style={{ ...DISP, borderColor: sel ? '#f5c451' : 'rgba(255,255,255,0.12)', background: sel ? 'rgba(245,196,81,0.12)' : 'transparent', color: sel ? '#f5c451' : 'rgba(255,255,255,0.6)', boxShadow: sel ? '0 0 16px rgba(245,196,81,0.25)' : 'none' }}
              className="lift px-4 py-2 rounded-lg border text-sm font-semibold transition-all disabled:opacity-40 text-left leading-tight">
              {a.label}
              <span style={MONO} className="block text-[9px] opacity-60 font-normal">{a.sub} · {holdCount} holds · {a.dcaNote}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
