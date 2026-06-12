import React from 'react';
import { Map, Check, CircleDot, Clock } from 'lucide-react';
import { theme } from '../utils/theme.js';
import { ROADMAP } from '../constants/agents.js';

const FONT  = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };
const MFONT = { fontFamily: "ui-monospace, 'SF Mono', monospace" };

export default function RoadmapTab({ dark }) {
  const T = theme(dark);
  return (
    <div style={{ ...FONT }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
        <Map size={16} style={{ color: T.text2 }} />
        <span style={{ ...MFONT, fontSize:12, fontWeight:600, letterSpacing:'0.08em', color:T.text }}>BUILD ROADMAP</span>
      </div>
      <p style={{ fontSize:13, color:T.text2, lineHeight:1.55, marginBottom:20 }}>
        Everything agreed is worth building, so nothing gets forgotten. Top section is live; the rest is the plan, ranked by edge.
      </p>

      <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
        {ROADMAP.map(group => (
          <div key={group.tier}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <span style={{ ...MFONT, fontSize:10, fontWeight:600, letterSpacing:'0.12em', color:group.color }}>{group.tier}</span>
              <div style={{ flex:1, height:1, background:`${group.color}22` }} />
              <span style={{ ...MFONT, fontSize:10, color:T.text3 }}>{group.items.length}</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {group.items.map(it => {
                const built = group.tier === 'BUILT';
                return (
                  <div key={it.name} style={{
                    display:'flex', alignItems:'flex-start', gap:12,
                    border:`1px solid ${built ? group.color + '33' : T.border}`,
                    borderRadius:12, padding:'12px 14px',
                    background: T.bgCard,
                    transition:'background .15s ease',
                  }}>
                    <div style={{ borderRadius:8, padding:6, background:`${group.color}18`, flexShrink:0, marginTop:1 }}>
                      {built
                        ? <Check size={13} style={{ color:group.color }} />
                        : <CircleDot size={13} style={{ color:group.color }} />}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <span style={{ ...MFONT, fontSize:13, fontWeight:700, color:T.text }}>{it.name}</span>
                        {built && (
                          <span style={{ ...MFONT, fontSize:8, letterSpacing:'0.10em', color:group.color, border:`1px solid ${group.color}44`, background:`${group.color}12`, padding:'2px 6px', borderRadius:4 }}>LIVE</span>
                        )}
                      </div>
                      <p style={{ fontSize:12, color:T.text2, lineHeight:1.4, marginTop:3 }}>{it.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop:24, borderRadius:12, padding:'14px 16px', display:'flex', alignItems:'flex-start', gap:12, background:'rgba(245,196,81,0.06)', border:'1px solid rgba(245,196,81,0.22)' }}>
        <Clock size={14} style={{ color:'#f5c451', marginTop:1, flexShrink:0 }} />
        <div>
          <div style={{ ...MFONT, fontSize:10, fontWeight:600, letterSpacing:'0.10em', color:'#f5c451', marginBottom:4 }}>WHEN READY</div>
          <p style={{ fontSize:12, color:T.text2, lineHeight:1.55 }}>
            Morning Brief, Shared Recon, Trade Log, All-Accounts mode, Consensus Meter, and real watchlist picks are coming in Phase E.
          </p>
        </div>
      </div>
    </div>
  );
}
