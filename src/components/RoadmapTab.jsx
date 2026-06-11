import React from 'react';
import { Map, Check, CircleDot, Clock } from 'lucide-react';
import { MONO, SANS } from '../constants/styles.js';
import { ROADMAP } from '../constants/agents.js';

export default function RoadmapTab() {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Map size={15} style={{ color: '#000000' }} />
        <span style={{ ...MONO, fontSize: 11, letterSpacing: '0.08em', color: '#757575', fontWeight: 600 }}>BUILD ROADMAP</span>
      </div>
      <p style={{ fontSize: 13, color: '#757575', lineHeight: 1.5, marginTop: 4, marginBottom: 20 }}>Everything agreed is worth building, so nothing gets forgotten.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {ROADMAP.map(group => (
          <div key={group.tier}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ ...MONO, fontSize: 10, color: group.color, letterSpacing: '0.1em', fontWeight: 600 }}>{group.tier}</span>
              <div style={{ flex: 1, height: 1, background: '#EEEEEE' }} />
              <span style={{ ...MONO, fontSize: 10, color: '#CCCCCC' }}>{group.items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {group.items.map(it => {
                const built = group.tier === 'BUILT';
                return (
                  <div key={it.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, border: '1px solid #EEEEEE', borderRadius: 10, padding: '12px 14px', background: built ? '#FAFAFA' : '#FFFFFF' }}>
                    <div style={{ background: `${group.color}12`, borderRadius: 7, padding: 7, flexShrink: 0, marginTop: 1 }}>
                      {built ? <Check size={13} style={{ color: group.color }} /> : <CircleDot size={13} style={{ color: group.color }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{it.name}</span>
                        {built && <span style={{ ...MONO, fontSize: 8, color: group.color, border: `1px solid ${group.color}33`, background: `${group.color}0e`, padding: '1px 6px', borderRadius: 4 }}>LIVE</span>}
                      </div>
                      <p style={{ fontSize: 12, color: '#757575', margin: 0, lineHeight: 1.45 }}>{it.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, background: '#F7F7F7', border: '1px solid #EEEEEE', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Clock size={14} style={{ color: '#757575', marginTop: 1, flexShrink: 0 }} />
        <div>
          <div style={{ ...MONO, fontSize: 11, fontWeight: 600, color: '#000000', marginBottom: 4 }}>COMING UP</div>
          <p style={{ fontSize: 12, color: '#757575', margin: 0, lineHeight: 1.5 }}>Morning Brief, Shared Recon, Trade Log, All-Accounts mode, and real watchlist picks are coming in Phase E.</p>
        </div>
      </div>
    </div>
  );
}
