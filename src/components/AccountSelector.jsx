import React from 'react';
import { SANS, CY } from '../constants/styles.js';
import { ACCOUNTS } from '../constants/agents.js';

// Mobile-only horizontal pill switcher (desktop uses Sidebar)
export default function AccountSelector({ account, setAccount, positions, running, wdRunning }) {
  const GOLD = '#c9a84c';
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar">
      {Object.entries(ACCOUNTS).map(([key, a]) => {
        const active = account === key;
        const disabled = running || wdRunning;
        return (
          <button key={key} onClick={() => !disabled && setAccount(key)}
            style={{
              ...SANS, fontSize: 11, padding: '5px 14px', borderRadius: 20, whiteSpace: 'nowrap',
              background: active ? 'rgba(201,168,76,0.12)' : 'transparent',
              border: `1px solid ${active ? 'rgba(201,168,76,0.32)' : 'rgba(255,255,255,0.1)'}`,
              color: active ? GOLD : 'rgba(255,255,255,0.4)',
              fontWeight: active ? 600 : 400,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled && !active ? 0.4 : 1,
            }}>
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
