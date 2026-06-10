import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MONO, DISP } from '../constants/styles.js';
import { ACCOUNTS } from '../constants/agents.js';

export default function AccountSelector({ account, setAccount, positions, running, wdRunning }) {
  const [open, setOpen] = useState(false);
  const acct = ACCOUNTS[account];

  return (
    <div className="boot mt-4" style={{ animationDelay: '.08s' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={MONO}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-white/[0.08] hover:bg-white/[0.04] transition-colors text-left">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-white/40 tracking-widest shrink-0">ACCOUNT</span>
          <span style={{ ...DISP, color: '#f5c451' }} className="text-sm font-semibold truncate">{acct.label}</span>
          <span className="text-[10px] text-white/30 truncate hidden sm:block">{acct.sub}</span>
        </div>
        <ChevronDown size={13} className="shrink-0 text-white/30 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>

      {open && (
        <div className="mt-2 flex gap-2 flex-wrap px-1">
          {Object.entries(ACCOUNTS).map(([key, a]) => {
            const sel = account === key;
            const holdCount = Object.keys(positions[key] || {}).length || a.holdings.length;
            return (
              <button key={key} onClick={() => { setAccount(key); setOpen(false); }} disabled={running || wdRunning}
                style={{ ...DISP, borderColor: sel ? '#f5c451' : 'rgba(255,255,255,0.12)', background: sel ? 'rgba(245,196,81,0.12)' : 'transparent', color: sel ? '#f5c451' : 'rgba(255,255,255,0.6)', boxShadow: sel ? '0 0 16px rgba(245,196,81,0.25)' : 'none' }}
                className="lift px-4 py-2 rounded-lg border text-sm font-semibold transition-all disabled:opacity-40 text-left leading-tight">
                {a.label}
                <span style={MONO} className="block text-[9px] opacity-60 font-normal">{a.sub} · {holdCount} holds · {a.dcaNote}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
