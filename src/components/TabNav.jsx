import React from 'react';
import { Home, Layers, MessageCircle, Shield, LayoutGrid, Coins, BarChart2, Map } from 'lucide-react';

const MOBILE_TABS = [
  { id: 'positions', label: 'Portfolio', icon: Home },
  { id: 'council',   label: 'Council',   icon: Layers },
  { id: 'chat',      label: 'Chat',      icon: MessageCircle },
  { id: 'watchdog',  label: 'Watchdog',  icon: Shield },
  { id: 'dca',       label: 'More',      icon: LayoutGrid },
];

const SIDEBAR_TABS = [
  { id: 'positions', label: 'Portfolio', icon: Home },
  { id: 'council',   label: 'Council',   icon: Layers },
  { id: 'chat',      label: 'Chat',      icon: MessageCircle },
  { id: 'watchdog',  label: 'Watchdog',  icon: Shield },
  { id: 'dca',       label: 'DCA',       icon: Coins },
  { id: 'alpha',     label: 'Alpha',     icon: BarChart2 },
  { id: 'roadmap',   label: 'Roadmap',   icon: Map },
];

export default function TabNav({ tab, setTab }) {
  return (
    <>
      {/* Mobile bottom bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-start justify-around bg-white"
        style={{ borderTop: '1px solid #EEEEEE', paddingBottom: 'env(safe-area-inset-bottom, 20px)', height: 83 }}
      >
        {MOBILE_TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex flex-col items-center justify-center gap-0.5 pt-2 flex-1"
              style={{ color: active ? '#000000' : '#AAAAAA' }}
            >
              <Icon size={24} strokeWidth={active ? 2 : 1.5} />
              <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, letterSpacing: 0 }}>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col fixed top-0 left-0 bottom-0 z-40 bg-white"
        style={{ width: 240, borderRight: '1px solid #EEEEEE' }}
      >
        <div className="px-6 py-5" style={{ borderBottom: '1px solid #EEEEEE' }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.04em', color: '#000' }}>THE COUNCIL</span>
        </div>
        <nav className="flex-1 py-2 overflow-y-auto">
          {SIDEBAR_TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="w-full flex items-center gap-3 px-5 transition-colors"
                style={{
                  height: 48,
                  color: active ? '#000000' : '#757575',
                  fontWeight: active ? 600 : 400,
                  fontSize: 14,
                  borderLeft: active ? '3px solid #000000' : '3px solid transparent',
                  background: 'transparent',
                }}
              >
                <Icon size={18} strokeWidth={active ? 2 : 1.5} />
                {t.label}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
