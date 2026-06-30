import React from 'react';
import { motion } from 'framer-motion';
import { LayoutDashboard, Users, MessageSquare, Telescope, MoreHorizontal } from 'lucide-react';

const TABS = [
  { id: 'portfolio', label: 'Portfolio', Icon: LayoutDashboard },
  { id: 'council',   label: 'Council',   Icon: Users },
  { id: 'chat',      label: 'Chat',      Icon: MessageSquare },
  { id: 'scout',     label: 'Scout',     Icon: Telescope },
  { id: 'more',      label: 'More',      Icon: MoreHorizontal },
];
const MORE_IDS = new Set(['alpha','updates','settings','debug']);

export default function BottomNav({ tab, setTab, dark, feedUnreadCount = 0 }) {
  return (
    <nav className="flex lg:hidden" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      alignItems: 'center',
      paddingTop: 10,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      background: dark ? '#18181b' : '#FAFAFA',
      borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
    }}>
      {TABS.map(({ id, label, Icon }) => {
        const active = tab === id || (id === 'more' && MORE_IDS.has(tab));
        const showBadge = id === 'council' && feedUnreadCount > 0;
        return (
          <motion.button
            key={id}
            onClick={() => setTab(id)}
            whileTap={{ scale: 0.9 }}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 3, border: 'none', background: 'none', cursor: 'pointer', padding: '0 4px',
              color: active ? '#3B82F6' : (dark ? '#52525B' : '#A1A1AA'),
              fontFamily: 'var(--font-display)',
            }}
          >
            <span style={{ display: 'flex', position: 'relative', alignItems: 'center', justifyContent: 'center', width: 36, height: 36 }}>
              {active && (
                <motion.div
                  layoutId="nav-pill"
                  style={{
                    position: 'absolute', inset: 0,
                    borderRadius: 10,
                    background: 'rgba(59,130,246,0.12)',
                    zIndex: 0,
                  }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span style={{ position: 'relative', zIndex: 1, display: 'flex' }}>
                <Icon size={22} strokeWidth={active ? 2.2 : 1.7} />
              </span>
              {showBadge && (
                <span style={{
                  position: 'absolute', top: 4, right: 4, zIndex: 2,
                  minWidth: 14, height: 14, borderRadius: 7,
                  background: '#EF4444', border: `1.5px solid ${dark ? '#18181b' : '#FAFAFA'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, fontWeight: 700, color: '#fff', lineHeight: 1,
                  padding: feedUnreadCount > 9 ? '0 2px' : 0,
                }}>
                  {feedUnreadCount > 9 ? '9+' : feedUnreadCount}
                </span>
              )}
            </span>
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>
              {label}
            </span>
          </motion.button>
        );
      })}
    </nav>
  );
}
