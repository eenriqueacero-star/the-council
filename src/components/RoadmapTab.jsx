import React from 'react';
import { Map, Check, CircleDot, Clock } from 'lucide-react';
import { MONO, DISP, SANS, CY, ICE } from '../constants/styles.js';
import { ROADMAP } from '../constants/agents.js';

export default function RoadmapTab() {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-1">
        <Map size={14} style={{ color: ICE }} />
        <span style={{ ...MONO, letterSpacing: '0.10em', color: 'rgba(226,221,213,0.70)', fontWeight: 600 }} className="text-[11px]">BUILD ROADMAP</span>
      </div>
      <p style={{ ...SANS, color: 'rgba(226,221,213,0.52)' }} className="text-[13px] leading-relaxed mt-1">Everything agreed is worth building, so nothing gets forgotten. Top section is live; the rest is the plan, ranked by edge.</p>

      <div className="mt-5 space-y-6">
        {ROADMAP.map(group => (
          <div key={group.tier}>
            <div className="flex items-center gap-2 mb-2.5">
              <span style={{ ...MONO, color: group.color, letterSpacing: '0.12em' }} className="text-[10px] font-semibold">{group.tier}</span>
              <div className="h-px flex-1" style={{ background: `${group.color}18` }} />
              <span style={{ ...MONO, color: 'rgba(226,221,213,0.25)' }} className="text-[10px]">{group.items.length}</span>
            </div>
            <div className="space-y-2">
              {group.items.map(it => {
                const built = group.tier === 'BUILT';
                return (
                  <div key={it.name} className="lift flex items-start gap-3 border rounded-xl p-3.5"
                    style={{ background: '#0e0f18', borderColor: built ? `${group.color}28` : 'rgba(226,221,213,0.07)' }}>
                    <div className="rounded-lg p-1.5 mt-0.5 shrink-0" style={{ background: `${group.color}14` }}>
                      {built ? <Check size={13} style={{ color: group.color }} /> : <CircleDot size={13} style={{ color: group.color }} />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ ...MONO, fontWeight: 700 }} className="text-[13px]">{it.name}</span>
                        {built && <span style={{ ...MONO, letterSpacing: '0.10em', color: group.color, borderColor: `${group.color}33`, background: `${group.color}10` }} className="text-[8px] px-1.5 py-0.5 rounded border">LIVE</span>}
                      </div>
                      <p style={{ ...SANS, color: 'rgba(226,221,213,0.55)' }} className="text-[12px] leading-snug mt-0.5">{it.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl p-4 flex items-start gap-3" style={{ background: 'rgba(200,146,42,0.06)', border: `1px solid rgba(200,146,42,0.22)` }}>
        <Clock size={14} style={{ color: CY }} className="mt-0.5 shrink-0" />
        <div>
          <div style={{ ...MONO, color: CY, letterSpacing: '0.10em', fontWeight: 600 }} className="text-[11px] mb-1">WHEN READY</div>
          <p style={{ ...SANS, color: 'rgba(226,221,213,0.62)' }} className="text-[12px] leading-relaxed">Morning Brief, Shared Recon, Trade Log, All-Accounts mode, Consensus Meter, and real watchlist picks are coming in Phase E.</p>
        </div>
      </div>
    </div>
  );
}
