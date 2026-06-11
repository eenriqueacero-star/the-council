import React from 'react';
import { TrendingUp, Users, MessageCircle, BellRing, MoreHorizontal } from 'lucide-react';

const TABS = [
  { id: 'positions', label: 'Portfolio',  icon: TrendingUp },
  { id: 'council',   label: 'Council',    icon: Users },
  { id: 'chat',      label: 'Chat',       icon: MessageCircle },
  { id: 'watchdog',  label: 'Watchdog',   icon: BellRing },
  { id: 'more',      label: 'More',       icon: MoreHorizontal },
];
const MORE_TABS = ['dca', 'alpha', 'roadmap'];
const GOLD = '#c9a84c';

export default function BottomNav({ tab, setTab }) {
  const navTab = MORE_TABS.includes(tab) ? 'more' : tab;

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'rgba(8,8,8,0.96)',
      borderTop: '1px solid rgba(201,168,76,0.1)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      display: 'flex',
      zIndex: 50,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = navTab === id;
        return (
          <button key={id}
            onClick={() => {
              if (id === 'more') { if (!MORE_TABS.includes(tab)) setTab('dca'); }
              else setTab(id);
            }}
            style={{
              flex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '10px 4px 10px',
              gap: 4,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: active ? GOLD : 'rgba(255,255,255,0.32)',
              WebkitTapHighlightColor: 'transparent',
            }}>
            <div style={{
              width: 38, height: 34,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 10,
              background: active ? 'rgba(201,168,76,0.12)' : 'transparent',
              border: `1px solid ${active ? 'rgba(201,168,76,0.22)' : 'transparent'}`,
              transition: 'all 0.15s ease',
            }}>
              <Icon size={15} />
            </div>
            <span style={{
              fontSize: 9,
              fontFamily: "'Inter', sans-serif",
              fontWeight: active ? 600 : 400,
              letterSpacing: '0.02em',
            }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
