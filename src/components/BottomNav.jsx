import React from 'react';
import { LayoutDashboard, Users, MessageSquare, Telescope, MoreHorizontal } from 'lucide-react';

const FONT = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };

const TABS = [
  { id: 'portfolio', label: 'Portfolio', Icon: LayoutDashboard },
  { id: 'council',   label: 'Council',   Icon: Users },
  { id: 'chat',      label: 'Chat',      Icon: MessageSquare },
  { id: 'scout',     label: 'Scout',     Icon: Telescope },
  { id: 'more',      label: 'More',      Icon: MoreHorizontal },
];

const MORE_IDS = new Set(['dca','alpha','roadmap','changelog','watchdog']);

export default function BottomNav({ tab, setTab, dark }) {
  return (
    <div className="flex lg:hidden" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      background: dark ? '#1C1C1E' : '#FFFFFF',
      borderTop: `1px solid ${dark ? '#2C2C2E' : '#EEEEEE'}`,
      boxShadow: '0 -4px 20px rgba(0,0,0,0.06)',
      height: 83,
      alignItems: 'flex-start',
      paddingTop: 10,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {TABS.map(({ id, label, Icon }) => {
        const active = tab === id || (id === 'more' && MORE_IDS.has(tab));
        return (
          <button key={id} onClick={() => setTab(id)} style={{
            ...FONT,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            padding: '0 4px',
            color: active ? (dark ? '#F2F2F7' : '#000000') : '#AAAAAA',
          }}>
            {/* key change triggers remount → spring pop animation */}
            <span key={active ? 'on' : 'off'} className={active ? 'tab-pop' : ''} style={{ display:'flex' }}>
              <Icon size={24} strokeWidth={active ? 2.2 : 1.8} />
            </span>
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
