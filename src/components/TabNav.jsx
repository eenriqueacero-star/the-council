import React, { useState } from 'react';
import { MessageSquare, Crown, Briefcase, Coins, Radar, Map, BarChart2, MoreHorizontal, X } from 'lucide-react';

const MAIN_TABS = [
  { id: 'chat',      label: 'Chat',      icon: MessageSquare },
  { id: 'council',   label: 'Council',   icon: Crown },
  { id: 'positions', label: 'Portfolio', icon: Briefcase },
  { id: 'watchdog',  label: 'Watchdog',  icon: Radar },
];
const MORE_TABS = [
  { id: 'dca',     label: 'DCA',     icon: Coins },
  { id: 'alpha',   label: 'Alpha',   icon: BarChart2 },
  { id: 'roadmap', label: 'Roadmap', icon: Map },
];
const ALL_TABS = [...MAIN_TABS, ...MORE_TABS];

export default function TabNav({ tab, setTab }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const activeInMore = MORE_TABS.some(t => t.id === tab);

  function select(id) { setTab(id); setMoreOpen(false); }

  const btnStyle = (sel) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 10px',
    margin: '1px 6px',
    borderRadius: 8,
    background: sel ? '#F0F0F0' : 'transparent',
    color: sel ? '#000000' : '#757575',
    fontWeight: sel ? 600 : 400,
    fontSize: 14,
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.12s',
    textAlign: 'left',
    width: 'calc(100% - 12px)',
  });

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col shrink-0" style={{ width: 200, borderRight: '1px solid #EEEEEE', minHeight: '100vh', paddingTop: 20, background: '#FFFFFF' }}>
        <div style={{ padding: '0 16px 20px', fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em', color: '#000000' }}>
          The Council
        </div>
        {ALL_TABS.map(t => {
          const Icon = t.icon;
          const sel  = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={btnStyle(sel)}>
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{ background: '#FFFFFF', borderTop: '1px solid #EEEEEE', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-stretch">
          {MAIN_TABS.map(t => {
            const Icon = t.icon;
            const sel  = tab === t.id;
            return (
              <button key={t.id} onClick={() => select(t.id)}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '9px 0 8px', color: sel ? '#000000' : '#AAAAAA', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <Icon size={22} />
                <span style={{ fontSize: 10, fontWeight: sel ? 600 : 400 }}>{t.label}</span>
              </button>
            );
          })}
          <button onClick={() => setMoreOpen(v => !v)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '9px 0 8px', color: activeInMore ? '#000000' : '#AAAAAA', border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <MoreHorizontal size={22} />
            <span style={{ fontSize: 10, fontWeight: activeInMore ? 600 : 400 }}>More</span>
          </button>
        </div>
      </div>

      {/* Mobile More sheet */}
      {moreOpen && (
        <>
          <div className="md:hidden fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.18)' }} onClick={() => setMoreOpen(false)} />
          <div className="md:hidden fixed left-0 right-0 z-50 rounded-t-2xl"
            style={{ bottom: 0, background: '#FFFFFF', padding: '16px 16px 12px', borderTop: '1px solid #EEEEEE', paddingBottom: 'calc(env(safe-area-inset-bottom) + 72px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>More</span>
              <button onClick={() => setMoreOpen(false)}
                style={{ background: '#F0F0F0', border: 'none', borderRadius: 20, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={14} />
              </button>
            </div>
            {MORE_TABS.map(t => {
              const Icon = t.icon;
              const sel  = tab === t.id;
              return (
                <button key={t.id} onClick={() => select(t.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '11px 8px', borderRadius: 10, background: sel ? '#F0F0F0' : 'transparent', color: '#000000', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: sel ? 600 : 400, marginBottom: 2 }}>
                  <div style={{ background: '#F0F0F0', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={17} />
                  </div>
                  {t.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
