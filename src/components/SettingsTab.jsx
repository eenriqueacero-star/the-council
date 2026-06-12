import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { theme } from '../utils/theme.js';

const FONT  = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };
const MFONT = { fontFamily: "ui-monospace, 'SF Mono', monospace" };

export default function SettingsTab({ dark, setDark }) {
  const T = theme(dark);
  return (
    <div style={{ ...FONT, maxWidth: 480, margin: '0 auto', padding: '24px 16px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 24, letterSpacing: '-0.01em' }}>Settings</h2>

      <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
        {/* Dark mode row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {dark ? <Moon size={18} style={{ color: T.text2 }} /> : <Sun size={18} style={{ color: T.text2 }} />}
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: T.text }}>Dark mode</div>
              <div style={{ fontSize: 13, color: T.text2, marginTop: 2 }}>Switch between light and dark appearance</div>
            </div>
          </div>
          {/* iOS-style toggle */}
          <button
            onClick={() => setDark(d => !d)}
            style={{
              width: 50, height: 30, borderRadius: 15, border: 'none', cursor: 'pointer',
              background: dark ? '#000000' : '#E0E0E0',
              position: 'relative', flexShrink: 0,
              transition: 'background 0.2s ease',
            }}
            aria-label="Toggle dark mode"
          >
            <div style={{
              width: 24, height: 24, borderRadius: '50%', background: '#FFFFFF',
              position: 'absolute', top: 3, left: dark ? 23 : 3,
              transition: 'left 0.2s ease',
              boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
            }} />
          </button>
        </div>
      </div>

      <p style={{ ...MFONT, fontSize: 11, color: T.text3, marginTop: 32, textAlign: 'center', letterSpacing: '0.06em' }}>
        THE COUNCIL · NOT FINANCIAL ADVICE
      </p>
    </div>
  );
}
