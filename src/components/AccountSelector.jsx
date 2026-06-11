import React from 'react';
import { SANS, CY } from '../constants/styles.js';
import { ACCOUNTS } from '../constants/agents.js';

export default function AccountSelector({ account, setAccount, running, wdRunning }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      {Object.entries(ACCOUNTS).map(([key, a]) => {
        const sel = account === key;
        return (
          <button key={key} onClick={() => setAccount(key)} disabled={running || wdRunning}
            style={{
              ...SANS,
              fontSize: '13px', fontWeight: sel ? 600 : 400,
              padding: '5px 14px', borderRadius: '999px',
              border: `1px solid ${sel ? CY + '50' : 'rgba(255,255,255,0.10)'}`,
              background: sel ? CY + '18' : 'transparent',
              color: sel ? CY : 'rgba(255,255,255,0.40)',
              transition: 'all .15s', cursor: 'pointer',
            }}
            className="disabled:opacity-40">
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
