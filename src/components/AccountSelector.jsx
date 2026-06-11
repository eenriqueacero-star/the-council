import React from 'react';
import { ACCOUNTS } from '../constants/agents.js';

export default function AccountSelector({ account, setAccount, positions, running, wdRunning }) {
  return (
    <div className="flex items-center gap-2 mt-4 mb-2">
      {Object.entries(ACCOUNTS).map(([key, a]) => {
        const active = account === key;
        return (
          <button
            key={key}
            onClick={() => setAccount(key)}
            disabled={running || wdRunning}
            style={{
              height: 28,
              padding: '0 12px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              background: active ? '#000000' : '#F7F7F7',
              color: active ? '#FFFFFF' : '#757575',
              border: 'none',
              cursor: running || wdRunning ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s, color 0.15s',
              opacity: running || wdRunning ? 0.5 : 1,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
            }}
          >
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
