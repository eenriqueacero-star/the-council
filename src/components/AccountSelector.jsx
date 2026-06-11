import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MONO, DISP, CY } from '../constants/styles.js';
import { ACCOUNTS } from '../constants/agents.js';

export default function AccountSelector({ account, setAccount, positions, running, wdRunning }) {
  const [open, setOpen] = useState(false);
  const acct = ACCOUNTS[account];

  return (
    <div className="boot mt-4" style={{ animationDelay: '.08s' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ ...MONO, background: 'rgba(226,221,213,0.02)', borderColor: 'rgba(226,221,213,0.09)' }}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-colors text-left hover:bg-[rgba(226,221,213,0.04)]">
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ color: 'rgba(226,221,213,0.35)', letterSpacing: '0.14em' }} className="text-[10px] shrink-0">ACCOUNT</span>
          <span style={{ ...MONO, color: CY, fontWeight: 600 }} className="text-[13px] truncate">{acct.label}</span>
          <span style={{ color: 'rgba(226,221,213,0.28)' }} className="text-[10px] truncate hidden sm:block">{acct.sub}</span>
        </div>
        <ChevronDown size={12} style={{ color: 'rgba(226,221,213,0.28)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} className="shrink-0" />
      </button>

      {open && (
        <div className="mt-2 flex gap-2 flex-wrap px-0.5">
          {Object.entries(ACCOUNTS).map(([key, a]) => {
            const sel = account === key;
            const holdCount = Object.keys(positions[key] || {}).length || a.holdings.length;
            return (
              <button key={key} onClick={() => { setAccount(key); setOpen(false); }} disabled={running || wdRunning}
                style={{
                  ...MONO,
                  borderColor: sel ? `${CY}88` : 'rgba(226,221,213,0.10)',
                  background: sel ? 'rgba(200,146,42,0.10)' : 'transparent',
                  color: sel ? CY : 'rgba(226,221,213,0.55)',
                  fontWeight: sel ? 600 : 400,
                }}
                className="lift px-4 py-2 rounded-lg border text-[12px] transition-all disabled:opacity-40 text-left leading-tight">
                {a.label}
                <span style={{ ...MONO, color: sel ? `${CY}77` : 'rgba(226,221,213,0.30)', fontWeight: 400 }} className="block text-[9px] mt-0.5">{a.sub} · {holdCount} holds · {a.dcaNote}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
