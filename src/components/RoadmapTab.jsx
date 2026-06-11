import React from 'react';
import { Map, Check, CircleDot, Clock } from 'lucide-react';
import { MONO, SANS, CY, ICE } from '../constants/styles.js';
import { ROADMAP } from '../constants/agents.js';

const GOLD = '#c9a84c';

export default function RoadmapTab() {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-1">
        <Map size={14} style={{ color: ICE }} />
        <span style={{ ...MONO, letterSpacing: '0.10em', color: 'rgba(240,240,240,0.55)', fontWeight: 600, fontSize: 11 }}>BUILD ROADMAP</span>
      </div>
      <p style={{ ...SANS, color: 'rgba(240,240,240,0.45)', fontSize: 13 }} className="leading-relaxed mt-1">Everything agreed is worth building, so nothing gets forgotten. Top section is live; the rest is the plan, ranked by edge.</p>

      <div className="mt-5 space-y-6">
        {ROADMAP.map(group => (
          <div key={group.tier}>
            <div className="flex items-center gap-2 mb-2.5">
              <span style={{ ...MONO, color: group.color, letterSpacing: '0.12em', fontWeight: 600, fontSize: 10 }}>{group.tier}</span>
              <div className="h-px flex-1" style={{ background: `${group.color}20` }} />
              <span style={{ ...MONO, color: 'rgba(240,240,240,0.25)', fontSize: 10 }}>{group.items.length}</span>
            </div>
            <div className="space-y-2">
              {group.items.map(it => {
                const built = group.tier === 'BUILT';
                return (
                  <div key={it.name} className="gold-card lift flex items-start gap-3 p-3.5">
                    <div className="rounded-lg p-1.5 mt-0.5 shrink-0" style={{ background: `${group.color}14` }}>
                      {built
                        ? <Check size={13} style={{ color: group.color }} />
                        : <CircleDot size={13} style={{ color: group.color }} />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ ...MONO, fontWeight: 700, fontSize: 13 }}>{it.name}</span>
                        {built && (
                          <span style={{ ...MONO, letterSpacing: '0.10em', color: group.color, borderColor: `${group.color}33`, background: `${group.color}12`, fontSize: 8 }}
                            className="px-1.5 py-0.5 rounded border">LIVE</span>
                        )}
                      </div>
                      <p style={{ ...SANS, color: 'rgba(240,240,240,0.52)', fontSize: 12 }} className="leading-snug mt-0.5">{it.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl p-4 flex items-start gap-3"
        style={{ background: 'rgba(201,168,76,0.06)', border: `1px solid rgba(201,168,76,0.22)` }}>
        <Clock size={14} style={{ color: GOLD }} className="mt-0.5 shrink-0" />
        <div>
          <div style={{ ...MONO, color: GOLD, letterSpacing: '0.10em', fontWeight: 600, fontSize: 11 }} className="mb-1">WHEN READY</div>
          <p style={{ ...SANS, color: 'rgba(240,240,240,0.58)', fontSize: 12 }} className="leading-relaxed">Morning Brief, Shared Recon, Trade Log, All-Accounts mode, Consensus Meter, and real watchlist picks are coming in Phase E.</p>
        </div>
      </div>
    </div>
  );
}
