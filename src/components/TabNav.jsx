import React from 'react';
import { MessageSquare, Crown, Briefcase, Coins, Radar, Map, BarChart2 } from 'lucide-react';
import { MONO, CY } from '../constants/styles.js';

const TABS = [
  { id: 'chat',      label: 'PM CHAT',   icon: MessageSquare },
  { id: 'council',   label: 'COUNCIL',   icon: Crown },
  { id: 'positions', label: 'POSITIONS', icon: Briefcase },
  { id: 'dca',       label: 'DCA',       icon: Coins },
  { id: 'watchdog',  label: 'WATCHDOG',  icon: Radar },
  { id: 'alpha',     label: 'ALPHA',     icon: BarChart2 },
  { id: 'roadmap',   label: 'ROADMAP',   icon: Map },
];

export default function TabNav({ tab, setTab }) {
  return (
    <div className="boot mt-5 w-full overflow-x-auto no-scrollbar" style={{ borderBottom: '1px solid rgba(226,221,213,0.08)', animationDelay: '.16s' }}>
      <div className="flex w-fit">
        {TABS.map(t => {
          const Icon = t.icon;
          const sel = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                ...MONO,
                color: sel ? CY : 'rgba(226,221,213,0.38)',
                borderBottom: sel ? `2px solid ${CY}` : '2px solid transparent',
                letterSpacing: '0.10em',
                fontWeight: sel ? 600 : 400,
              }}
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-3 text-[11px] transition-colors whitespace-nowrap hover:text-[rgba(226,221,213,0.65)]">
              <Icon size={12} />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
