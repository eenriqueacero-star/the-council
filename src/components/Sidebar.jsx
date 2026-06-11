import React from 'react';
import { TrendingUp, Users, MessageCircle, BellRing, Coins, BarChart2, Map, LogOut } from 'lucide-react';
import { MONO, SANS } from '../constants/styles.js';

const NAV = [
  { id: 'positions', label: 'Portfolio',     icon: TrendingUp },
  { id: 'council',   label: 'Council',       icon: Users },
  { id: 'chat',      label: 'Chat',          icon: MessageCircle },
  { id: 'watchdog',  label: 'Watchdog',      icon: BellRing },
  { id: 'dca',       label: 'Smart DCA',     icon: Coins },
  { id: 'alpha',     label: 'Alpha Tracker', icon: BarChart2 },
  { id: 'roadmap',   label: 'Roadmap',       icon: Map },
];
const GOLD = '#c9a84c';

export default function Sidebar({ tab, setTab, account, setAccount, accounts, running, wdRunning, onSignOut }) {
  return (
    <aside style={{
      width: 220, background: '#080808',
      borderRight: '1px solid rgba(201,168,76,0.1)',
      position: 'fixed', top: 0, left: 0,
      height: '100vh',
      display: 'flex', flexDirection: 'column',
      zIndex: 30,
    }}>
      {/* Logo */}
      <div style={{ padding: '28px 20px 20px' }}>
        <div style={{ ...MONO, letterSpacing: '0.22em', fontWeight: 700, fontSize: 13, color: GOLD }}>THE COUNCIL</div>
        <div style={{ ...MONO, color: 'rgba(201,168,76,0.38)', fontSize: 9, letterSpacing: '0.14em', marginTop: 5 }}>INVESTMENT INTELLIGENCE</div>
      </div>
      <div style={{ height: 1, background: 'rgba(201,168,76,0.08)', margin: '0 20px' }} />

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8,
                background: active ? 'rgba(201,168,76,0.1)' : 'transparent',
                border: `1px solid ${active ? 'rgba(201,168,76,0.2)' : 'transparent'}`,
                color: active ? GOLD : 'rgba(255,255,255,0.44)',
                cursor: 'pointer', marginBottom: 1,
                transition: 'all 0.13s ease', textAlign: 'left',
              }}
              onMouseEnter={e => { if (tab !== id) e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
              onMouseLeave={e => { if (tab !== id) e.currentTarget.style.color = 'rgba(255,255,255,0.44)'; }}>
              <Icon size={14} />
              <span style={{ ...SANS, fontSize: 13, fontWeight: active ? 600 : 400 }}>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Account switcher */}
      <div style={{ height: 1, background: 'rgba(201,168,76,0.08)', margin: '0 20px' }} />
      <div style={{ padding: '14px 10px 12px' }}>
        <div style={{ ...MONO, fontSize: 9, color: 'rgba(201,168,76,0.38)', letterSpacing: '0.13em', marginBottom: 8, paddingLeft: 12 }}>ACCOUNT</div>
        {Object.entries(accounts).map(([key, a]) => {
          const active = account === key;
          const disabled = running || wdRunning;
          return (
            <button key={key} onClick={() => !disabled && setAccount(key)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 6, marginBottom: 1,
                background: active ? 'rgba(201,168,76,0.1)' : 'transparent',
                border: `1px solid ${active ? 'rgba(201,168,76,0.2)' : 'transparent'}`,
                color: active ? GOLD : 'rgba(255,255,255,0.36)',
                ...SANS, fontSize: 12, fontWeight: active ? 600 : 400,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled && !active ? 0.4 : 1,
                textAlign: 'left', transition: 'all 0.13s ease',
              }}>
              {a.label}
            </button>
          );
        })}
      </div>

      {/* Sign out */}
      <div style={{ padding: '0 10px 22px' }}>
        <button onClick={onSignOut}
          style={{ ...SANS, fontSize: 11, color: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', cursor: 'pointer', background: 'transparent', border: 'none', width: '100%' }}
          onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.22)'}>
          <LogOut size={11} /> Sign out
        </button>
      </div>
    </aside>
  );
}
