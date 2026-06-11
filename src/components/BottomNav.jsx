import React from 'react';
import { TrendingUp, Users, MessageCircle, BellRing, MoreHorizontal } from 'lucide-react';

const TABS = [
  { id: 'positions', label: 'Portfolio',  icon: TrendingUp },
  { id: 'council',   label: 'Council',    icon: Users },
  { id: 'chat',      label: 'Chat',       icon: MessageCircle },
  { id: 'watchdog',  label: 'Watchdog',   icon: BellRing },
  { id: 'more',      label: 'More',       icon: MoreHorizontal },
];

const GREEN = '#00d395';
const SANS  = { fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" };

export default function BottomNav({ tab, setTab }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30"
      style={{ background: 'rgba(8,11,22,0.96)', borderTop: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
      <div style={{ maxWidth: '430px', margin: '0 auto', display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const sel = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flex: 1, padding: '10px 0 8px', color: sel ? GREEN : 'rgba(255,255,255,0.32)', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'color .15s' }}
              className="flex flex-col items-center gap-1">
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 28 }}>
                {sel && <div style={{ position: 'absolute', inset: 0, background: `${GREEN}14`, borderRadius: 8 }} />}
                <Icon size={19} strokeWidth={sel ? 2.5 : 1.8} />
              </div>
              <span style={{ ...SANS, fontSize: '10px', fontWeight: sel ? 600 : 400, letterSpacing: '-0.01em' }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
