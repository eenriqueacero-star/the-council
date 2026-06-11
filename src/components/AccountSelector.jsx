import React from 'react';
import { ACCOUNTS } from '../constants/agents.js';

export default function AccountSelector({ account, setAccount, running, wdRunning }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 14, marginBottom: 4 }}>
      {Object.entries(ACCOUNTS).map(([key, a]) => {
        const sel = account === key;
        return (
          <button key={key} onClick={() => setAccount(key)} disabled={running || wdRunning}
            style={{
              padding: '5px 16px',
              borderRadius: 20,
              background: sel ? '#000000' : '#F0F0F0',
              color: sel ? '#FFFFFF' : '#757575',
              fontWeight: sel ? 600 : 400,
              fontSize: 14,
              border: 'none',
              cursor: running || wdRunning ? 'not-allowed' : 'pointer',
              opacity: running || wdRunning ? 0.5 : 1,
              transition: 'background 0.15s, color 0.15s',
            }}>
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
