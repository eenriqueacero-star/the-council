import React from 'react';
import { Moon, Sun, Bell } from 'lucide-react';
import { theme } from '../utils/theme.js';

const FONT  = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };
const MFONT = { fontFamily: "ui-monospace, 'SF Mono', monospace" };

const MKT_STATES = [
  { id: 'premarket',  label: 'Pre-Market',  color: '#f59e0b' },
  { id: 'open',       label: 'Open',        color: '#00C805' },
  { id: 'afterhours', label: 'After Hours', color: '#a855f7' },
  { id: 'overnight',  label: 'Overnight',   color: '#6366f1' },
  { id: 'evening',    label: 'Evening',     color: '#4338ca' },
  { id: 'weekend',    label: 'Weekend',     color: '#6b7280' },
];

const PORT_DIRS = [
  { id: 'up',   label: '▲ Up',   color: '#00C805' },
  { id: 'flat', label: '— Flat', color: '#aaaaaa' },
  { id: 'down', label: '▼ Down', color: '#FF3B30' },
];

export default function SettingsTab({ dark, setDark, mktOverride, setMktOverride, pdOverride, setPdOverride, effectiveMkt, portfolioDirection, onTestBell }) {
  const T = theme(dark);

  const row = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px' };
  const sectionLabel = { ...MFONT, fontSize:10, color:T.text3, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 };

  return (
    <div style={{ ...FONT, maxWidth: 480, margin: '0 auto', padding: '24px 16px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 24, letterSpacing: '-0.01em' }}>Settings</h2>

      {/* Appearance */}
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <div style={row}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {dark ? <Moon size={18} style={{ color: T.text2 }} /> : <Sun size={18} style={{ color: T.text2 }} />}
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: T.text }}>Dark mode</div>
              <div style={{ fontSize: 13, color: T.text2, marginTop: 2 }}>Switch between light and dark appearance</div>
            </div>
          </div>
          <button onClick={() => setDark(d => !d)} style={{
            width: 50, height: 30, borderRadius: 15, border: 'none', cursor: 'pointer',
            background: dark ? '#000000' : '#E0E0E0', position: 'relative', flexShrink: 0,
            transition: 'background 0.2s ease',
          }} aria-label="Toggle dark mode">
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#FFFFFF', position: 'absolute', top: 3, left: dark ? 23 : 3, transition: 'left 0.2s ease', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
          </button>
        </div>
      </div>

      {/* Animation & Effects Test Panel */}
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`, background: T.bgCard }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Animation Test Panel</div>
          <div style={{ fontSize: 12, color: T.text2, marginTop: 2 }}>Preview ambient scenes and effects without waiting for market hours</div>
        </div>

        {/* Market state */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
          <div style={sectionLabel}>Market State</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {MKT_STATES.map(s => {
              const active = mktOverride === s.id;
              return (
                <button key={s.id} onClick={() => setMktOverride(active ? null : s.id)} style={{
                  ...MFONT, fontSize: 11, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${active ? s.color : T.border}`,
                  background: active ? `${s.color}22` : T.bg,
                  color: active ? s.color : T.text2,
                  fontWeight: active ? 700 : 400,
                  transition: 'all .15s ease',
                }}>
                  {s.label}
                  {!mktOverride && effectiveMkt === s.id && <span style={{ marginLeft: 4, opacity: 0.5 }}>•</span>}
                </button>
              );
            })}
          </div>
          {mktOverride && (
            <button onClick={() => setMktOverride(null)} style={{ ...MFONT, fontSize: 10, marginTop: 8, color: T.text3, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              ↩ Reset to live ({effectiveMkt.toUpperCase()})
            </button>
          )}
        </div>

        {/* Portfolio direction */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
          <div style={sectionLabel}>Portfolio Direction (open scene only)</div>
          <div style={{ display: 'flex', gap: 7 }}>
            {PORT_DIRS.map(d => {
              const active = pdOverride === d.id;
              return (
                <button key={d.id} onClick={() => setPdOverride(active ? null : d.id)} style={{
                  ...MFONT, fontSize: 11, padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${active ? d.color : T.border}`,
                  background: active ? `${d.color}22` : T.bg,
                  color: active ? d.color : T.text2,
                  fontWeight: active ? 700 : 400,
                  transition: 'all .15s ease',
                }}>
                  {d.label}
                </button>
              );
            })}
          </div>
          {pdOverride && (
            <button onClick={() => setPdOverride(null)} style={{ ...MFONT, fontSize: 10, marginTop: 8, color: T.text3, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              ↩ Reset to computed ({portfolioDirection})
            </button>
          )}
        </div>

        {/* Bell trigger */}
        <div style={{ ...row }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Bell size={18} style={{ color: '#00C805' }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: T.text }}>Market open bell</div>
              <div style={{ fontSize: 12, color: T.text2, marginTop: 2 }}>Trigger the 9:30 AM animation</div>
            </div>
          </div>
          <button onClick={onTestBell} style={{
            ...MFONT, fontSize: 11, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
            border: '1px solid rgba(0,200,5,0.4)', background: 'rgba(0,200,5,0.08)',
            color: '#00C805', fontWeight: 600, transition: 'all .15s ease',
          }}>
            Ring 🔔
          </button>
        </div>
      </div>

      <p style={{ ...MFONT, fontSize: 11, color: T.text3, marginTop: 24, textAlign: 'center', letterSpacing: '0.06em' }}>
        THE COUNCIL · NOT FINANCIAL ADVICE
      </p>
    </div>
  );
}
