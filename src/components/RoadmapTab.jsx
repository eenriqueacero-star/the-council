import React from 'react';
import { Map, Check, CircleDot, Clock } from 'lucide-react';
import { MONO, DISP } from '../constants/styles.js';
import { ROADMAP } from '../constants/agents.js';

export default function RoadmapTab() {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-1">
        <Map size={16} style={{ color: '#b083ff' }} />
        <span style={{ ...DISP, letterSpacing: '0.04em' }} className="text-sm font-semibold">BUILD ROADMAP</span>
      </div>
      <p className="text-[13px] text-white/55 leading-relaxed">Everything agreed is worth building, so nothing gets forgotten. Top section is live; the rest is the plan, ranked by edge.</p>

      <div className="mt-5 space-y-6">
        {ROADMAP.map(group => (
          <div key={group.tier}>
            <div className="flex items-center gap-2 mb-2.5">
              <span style={{ ...MONO, color: group.color }} className="text-[10px] tracking-widest font-semibold">{group.tier}</span>
              <div className="h-px flex-1" style={{ background: `${group.color}22` }} />
              <span style={MONO} className="text-[10px] text-white/30">{group.items.length}</span>
            </div>
            <div className="space-y-2">
              {group.items.map(it => {
                const built = group.tier === 'BUILT';
                return (
                  <div key={it.name} className="lift flex items-start gap-3 bg-white/[0.025] border rounded-xl p-3.5" style={{ borderColor: built ? `${group.color}33` : 'rgba(255,255,255,0.08)' }}>
                    <div className="rounded-lg p-1.5 mt-0.5" style={{ background: `${group.color}1a` }}>
                      {built ? <Check size={14} style={{ color: group.color }} /> : <CircleDot size={14} style={{ color: group.color }} />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span style={DISP} className="text-sm font-semibold">{it.name}</span>
                        {built && <span style={{ ...MONO, color: group.color }} className="text-[8px] px-1.5 py-0.5 rounded">LIVE</span>}
                      </div>
                      <p className="text-[12px] text-white/55 leading-snug mt-0.5">{it.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl p-4 flex items-start gap-3" style={{ background: 'rgba(245,196,81,0.08)', border: '1px solid rgba(245,196,81,0.25)' }}>
        <Clock size={16} style={{ color: '#f5c451' }} className="mt-0.5" />
        <div>
          <div style={DISP} className="text-sm font-semibold text-[#f5c451]">When ready</div>
          <p className="text-[12px] text-white/65 leading-relaxed mt-0.5">Morning Brief, Shared Recon, Trade Log, All-Accounts mode, Consensus Meter, and real watchlist picks are coming in Phase E.</p>
        </div>
      </div>
    </div>
  );
}
