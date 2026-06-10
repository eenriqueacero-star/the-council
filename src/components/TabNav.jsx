import React from 'react';
import { MessageSquare, Crown, Briefcase, Coins, Radar, Map, BarChart2 } from 'lucide-react';
import { DISP } from '../constants/styles.js';

const TABS = [
  { id: 'chat',      label: 'PM CHAT',       icon: MessageSquare },
  { id: 'council',   label: 'COUNCIL',       icon: Crown },
  { id: 'positions', label: 'POSITIONS',     icon: Briefcase },
  { id: 'dca',       label: 'DCA ALLOCATOR', icon: Coins },
  { id: 'watchdog',  label: 'WATCHDOG',      icon: Radar },
  { id: 'alpha',     label: 'ALPHA',         icon: BarChart2 },
  { id: 'roadmap',   label: 'ROADMAP',       icon: Map },
];

export default function TabNav({ tab, setTab }) {
  return (
    <div className="boot mt-6 flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/10 w-full overflow-x-auto no-scrollbar" style={{ animationDelay: '.16s' }}>
      {TABS.map(t => {
        const Icon = t.icon;
        const sel = tab === t.id;
        return (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ ...DISP, background: sel ? '#f5c451' : 'transparent', color: sel ? '#0a0a0a' : 'rgba(255,255,255,0.55)', boxShadow: sel ? '0 0 18px rgba(245,196,81,0.4)' : 'none' }}
            className="flex-shrink-0 px-3 sm:px-4 py-2 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap">
            <Icon size={13} /> {t.label}
          </button>
        );
      })}
    </div>
  );
}
