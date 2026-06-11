import React, { useRef } from 'react';
import { Search, ChevronRight, Loader2, AlertTriangle, Crown, TrendingUp, Wallet, Play } from 'lucide-react';
import { MONO, DISP } from '../constants/styles.js';
import { AGENTS, STANCE_STYLE, DEMO_TICKER, DEMO_RESULTS, DEMO_SYNTH } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent } from '../api.js';

const FONT = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };

// Public.com stance palette (overrides STANCE_STYLE for visuals)
const PS = {
  PASS:       { bg:'rgba(0,200,5,0.1)',    fg:'#00C805', label:'PASS'    },
  FAIL:       { bg:'rgba(255,59,48,0.1)',  fg:'#FF3B30', label:'FAIL'    },
  CAUTION:    { bg:'rgba(245,158,11,0.1)', fg:'#B45309', label:'CAUTION' },
  BEARISH:    { bg:'rgba(255,59,48,0.1)',  fg:'#FF3B30', label:'BEAR'    },
  BUY:        { bg:'#000000',              fg:'#FFFFFF', label:'BUY'     },
  WATCH:      { bg:'#EEEEEE',              fg:'#000000', label:'WATCH'   },
  PASS_FINAL: { bg:'rgba(255,59,48,0.1)',  fg:'#FF3B30', label:'PASS'    },
};

export default function CouncilTab({ account, acct, positionsLine, flagApiDown, running, setRunning, ticker, setTicker, capital, setCapital, active, setActive, agentState, setAgentState, synthesis, setSynthesis }) {
  const synthRef = useRef(null);

  const verdictKey = synthesis.result ? (synthesis.result.verdict === 'PASS' ? 'PASS_FINAL' : synthesis.result.verdict) : null;
  const vStyle     = verdictKey ? (PS[verdictKey] || PS.WATCH) : null;

  const quickPicks = ['AAPL','TSLA','OKLO','PLTR','AVGO','SMCI'];

  async function convene() {
    const t = ticker.trim().toUpperCase();
    if (!t || running) return;
    setActive(t); setRunning(true); setSynthesis({ status:'idle', result:null });
    const init = {}; AGENTS.forEach(a => (init[a.id] = { status:'running', result:null })); setAgentState(init);
    const acctLine   = `Account under review: ${acct.label}'s (${acct.sub}). This account currently holds: ${positionsLine}. DCA: ${acct.dcaNote}. Judge concentration and sizing against THIS account.`;
    const capLine    = capital.trim() ? `Available capital to deploy: $${capital.trim()}.` : 'Available capital not specified.';
    const userContent= `Ticker under consideration: ${t}. The investor is thinking about BUYING it. ${acctLine} ${capLine} Today is ${new Date().toDateString()}. Return ONLY the JSON.`;
    const results = {};
    await Promise.all(AGENTS.map(async a => {
      try {
        const txt = await callAgent(a.system, userContent, a.search);
        const p   = extractJSON(txt);
        results[a.id] = p || { stance:'CAUTION', headline:'Could not parse output', points:['Agent returned unstructured data.'], score:5 };
        setAgentState(prev => ({ ...prev, [a.id]:{ status:'done', result:results[a.id] } }));
      } catch {
        flagApiDown();
        results[a.id] = null;
        setAgentState(prev => ({ ...prev, [a.id]:{ status:'error', result:null } }));
      }
    }));
    setSynthesis({ status:'running', result:null });
    setTimeout(() => synthRef.current?.scrollIntoView({ behavior:'smooth', block:'center' }), 200);
    const council     = AGENTS.map(a => `${a.name} (${a.role}): ${JSON.stringify(results[a.id])}`).join('\n');
    const synthSystem = `You are the PORTFOLIO MANAGER and final decision-maker. ${acct.label}'s account.\nFive specialists weighed in. Weigh against the 4-Gate Rule. BUY requires gates broadly satisfied AND conviction >= 7. If macro is a headwind day, downgrade to WATCH. Respect a strong unrebutted bear case.\nRespond ONLY with JSON in a \`\`\`json block: {"verdict":"BUY"|"WATCH"|"PASS","conviction":<0-10>,"sizing":"<one line>","summary":"<2-3 sentences, plain, direct>","bull":["<for>","<for>"],"risks":["<risk>","<risk>"]}`;
    try {
      const txt = await callAgent(synthSystem, `Council inputs for ${t}:\n${council}\n\n${acctLine}\n${capLine}\n\nFinal ruling. Return ONLY the JSON.`, false);
      const p   = extractJSON(txt);
      setSynthesis({ status:'done', result: p || { verdict:'WATCH', conviction:5, sizing:'n/a', summary:'Could not parse synthesis.', bull:[], risks:[] } });
    } catch {
      flagApiDown();
      setSynthesis({ status:'error', result:null });
    }
    setRunning(false);
  }

  function runDemo() {
    if (running) return;
    setTicker(DEMO_TICKER); setCapital('2000'); setActive(DEMO_TICKER); setRunning(true); setSynthesis({ status:'idle', result:null });
    const init = {}; AGENTS.forEach(a => (init[a.id] = { status:'running', result:null })); setAgentState(init);
    const order = ['risk','catalyst','technical','macro','bear','sizer'];
    order.forEach((id, i) => setTimeout(() => setAgentState(prev => ({ ...prev, [id]:{ status:'done', result:DEMO_RESULTS[id] } })), 700 + i * 600));
    const total = 700 + order.length * 600;
    setTimeout(() => { setSynthesis({ status:'running', result:null }); synthRef.current?.scrollIntoView({ behavior:'smooth', block:'center' }); }, total + 200);
    setTimeout(() => { setSynthesis({ status:'done', result:DEMO_SYNTH }); setRunning(false); }, total + 1500);
  }

  return (
    <div className="mt-2">
      {/* Ticker input */}
      <label style={{ ...MONO, display:'block', fontSize:11, color:'#AAAAAA', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:8 }}>Enter Ticker to Convene the Council</label>
      <div className="flex gap-2 flex-wrap sm:flex-nowrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color:'#AAAAAA' }} />
          <input value={ticker} onChange={e => setTicker(e.target.value)} onKeyDown={e => e.key==='Enter' && convene()}
            placeholder="e.g. AAPL" style={{ ...MONO, letterSpacing:'0.15em' }}
            className="w-full bg-white border border-[#EEEEEE] rounded-lg pl-9 pr-3 py-3 text-lg uppercase outline-none focus:border-black transition-colors text-black" />
        </div>
        <button onClick={convene} disabled={running || !ticker.trim()}
          style={{ ...DISP, letterSpacing:'0.08em', background: running || !ticker.trim() ? 'rgba(0,0,0,0.12)' : '#000000', color:'#FFFFFF' }}
          className="w-full sm:w-auto px-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:cursor-not-allowed transition-all">
          {running ? <><Loader2 size={18} className="animate-spin" /> CONVENING…</> : <>CONVENE <ChevronRight size={18} /></>}
        </button>
      </div>

      {/* Capital */}
      <div className="mt-2 flex gap-2 items-center">
        <div className="relative flex-1">
          <Wallet size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color:'#AAAAAA' }} />
          <input value={capital} onChange={e => setCapital(e.target.value.replace(/[^0-9.]/g,''))} onKeyDown={e => e.key==='Enter' && convene()}
            inputMode="decimal" placeholder="available capital (optional)" style={MONO}
            className="w-full bg-white border border-[#EEEEEE] rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none focus:border-black transition-colors text-black" />
          {capital.trim() && <span style={{ ...MONO, color:'#00C805' }} className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px]">${Number(capital).toLocaleString()}</span>}
        </div>
      </div>

      {/* Quick picks */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span style={MONO} className="text-[10px] text-[#AAAAAA]">QUICK:</span>
        {quickPicks.map(q => (
          <button key={q} onClick={() => setTicker(q)} disabled={running} style={MONO}
            className="text-[11px] px-2.5 py-1 rounded border border-[#EEEEEE] text-[#757575] hover:border-black hover:text-black transition-colors disabled:opacity-40">{q}</button>
        ))}
        <button onClick={runDemo} disabled={running} style={MONO}
          className="ml-auto text-[11px] px-3 py-1 rounded border border-[#EEEEEE] text-[#757575] hover:border-black hover:text-black transition-colors disabled:opacity-40 flex items-center gap-1.5">
          <Play size={11} /> DEMO
        </button>
      </div>

      {/* Agent grid */}
      {active && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px flex-1 bg-[#EEEEEE]" />
            <span style={MONO} className="text-[10px] text-[#AAAAAA] tracking-widest">COUNCIL REVIEWING {active} · FOR {acct.label.toUpperCase()}</span>
            <div className="h-px flex-1 bg-[#EEEEEE]" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {AGENTS.map(a => {
              const st   = agentState[a.id] || { status:'idle' };
              const Icon = a.icon;
              const r    = st.result;
              const ss   = r && (PS[r.stance] || PS.CAUTION);
              return (
                <div key={a.id}
                  style={{ animation: st.status==='done' ? 'cardIn .5s cubic-bezier(.2,.7,.2,1) both' : undefined, background:'#FFFFFF', border:`1px solid ${st.status==='done' ? '#EEEEEE' : '#EEEEEE'}`, borderRadius:12, padding:16, overflow:'hidden', position:'relative', boxShadow:'0 2px 12px rgba(0,0,0,0.05)' }}>
                  {st.status==='running' && <div className="absolute left-0 right-0 h-12 scanline" style={{ background:`linear-gradient(${a.accent}18, transparent)`, top:0 }} />}
                  <div className="flex items-start justify-between gap-2 relative">
                    <div className="flex items-center gap-2.5">
                      <div style={{ background:`${a.accent}12`, border:`1px solid ${a.accent}28`, borderRadius:8, padding:7 }}><Icon size={16} style={{ color:a.accent }} /></div>
                      <div>
                        <div style={{ ...DISP, fontSize:14, fontWeight:600, color:'#000', lineHeight:'1.2' }}>{a.name}</div>
                        <div style={{ ...MONO, fontSize:9, color:'#AAAAAA', marginTop:2 }}>{a.role}</div>
                      </div>
                    </div>
                    {st.status==='done' && ss && (
                      <span style={{ ...MONO, background:ss.bg, color:ss.fg, fontSize:9, fontWeight:700, padding:'3px 8px', borderRadius:6, whiteSpace:'nowrap' }}>{ss.label}</span>
                    )}
                  </div>
                  {st.status==='running' && <div className="mt-4 flex items-center gap-2" style={{ ...MONO, color:'#AAAAAA' }}><Loader2 size={13} className="animate-spin" /><span style={{ fontSize:11 }}>searching · analyzing…</span></div>}
                  {st.status==='error'   && <div className="mt-4 flex items-center gap-2" style={{ ...MONO, color:'#FF3B30' }}><AlertTriangle size={13} /><span style={{ fontSize:11 }}>agent error — retry</span></div>}
                  {st.status==='done' && r && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p style={{ fontSize:13, fontWeight:500, color:a.accent, lineHeight:'1.3' }}>{r.headline}</p>
                        {typeof r.score==='number' && <span style={{ ...MONO, fontSize:10, color:'#AAAAAA', whiteSpace:'nowrap' }}>{r.score}/10</span>}
                      </div>
                      <ul style={{ listStyle:'none', padding:0, margin:0 }}>
                        {(r.points||[]).map((p,j) => (
                          <li key={j} style={{ display:'flex', gap:8, fontSize:12, color:'#333', lineHeight:'1.4', marginBottom:6 }}>
                            <span style={{ color:a.accent, marginTop:2 }}>▸</span><span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Synthesis */}
      {active && (
        <div ref={synthRef} className="mt-5">
          {synthesis.status==='running' && (
            <div style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:12, padding:24, display:'flex', alignItems:'center', gap:12, ...MONO, color:'#B45309' }}>
              <Loader2 size={18} className="animate-spin" /><span style={{ fontSize:14 }}>Portfolio Manager synthesizing the council’s ruling…</span>
            </div>
          )}
          {synthesis.status==='done' && synthesis.result && vStyle && (
            <div style={{ animation:'cardIn .5s cubic-bezier(.2,.7,.2,1) both', background:'#000000', borderRadius:12, padding:'20px 24px', color:'#FFFFFF' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
                <Crown size={16} style={{ color:'#F59E0B' }} />
                <span style={{ ...DISP, fontSize:14, fontWeight:600, letterSpacing:'0.06em', color:'#fff' }}>PORTFOLIO MANAGER · FINAL RULING</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
                <div style={{ background:vStyle.bg === '#000000' ? 'rgba(255,255,255,0.12)' : vStyle.bg, border:`1px solid rgba(255,255,255,0.2)`, borderRadius:10, padding:'12px 24px', textAlign:'center' }}>
                  <div style={{ ...DISP, color: vStyle.fg === '#FFFFFF' ? '#FFFFFF' : vStyle.fg, fontSize:32, fontWeight:700, letterSpacing:'0.04em' }}>{vStyle.label}</div>
                  <div style={{ ...MONO, color:'rgba(255,255,255,0.45)', fontSize:10, marginTop:2 }}>{active} · {acct.label}</div>
                </div>
                <div style={{ flex:1, minWidth:160 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', ...MONO, fontSize:11, color:'rgba(255,255,255,0.45)', marginBottom:6 }}><span>CONVICTION</span><span>{synthesis.result.conviction}/10</span></div>
                  <div style={{ height:8, borderRadius:4, background:'rgba(255,255,255,0.15)', overflow:'hidden' }}>
                    <div style={{ width:`${(synthesis.result.conviction/10)*100}%`, background:vStyle.fg === '#000000' ? '#FFFFFF' : vStyle.fg, height:'100%', borderRadius:4, transition:'width .8s ease' }} />
                  </div>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginTop:12, ...MONO, fontSize:12, color:'rgba(255,255,255,0.55)' }}>
                    <TrendingUp size={13} style={{ marginTop:1, color:'rgba(255,255,255,0.35)' }} /><span>{synthesis.result.sizing}</span>
                  </div>
                </div>
              </div>
              <p style={{ marginTop:16, fontSize:14, color:'rgba(255,255,255,0.85)', lineHeight:1.6 }}>{synthesis.result.summary}</p>
              <div style={{ marginTop:16, display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div style={{ background:'rgba(0,200,5,0.1)', border:'1px solid rgba(0,200,5,0.25)', borderRadius:8, padding:12 }}>
                  <div style={{ ...MONO, color:'#00C805', fontSize:10, marginBottom:8, letterSpacing:'0.08em' }}>BULL</div>
                  <ul style={{ listStyle:'none', padding:0, margin:0 }}>{(synthesis.result.bull||[]).map((b,i) => <li key={i} style={{ fontSize:12, color:'rgba(255,255,255,0.7)', display:'flex', gap:6, marginBottom:4 }}><span style={{ color:'#00C805' }}>+</span>{b}</li>)}</ul>
                </div>
                <div style={{ background:'rgba(255,59,48,0.1)', border:'1px solid rgba(255,59,48,0.25)', borderRadius:8, padding:12 }}>
                  <div style={{ ...MONO, color:'#FF3B30', fontSize:10, marginBottom:8, letterSpacing:'0.08em' }}>RISKS</div>
                  <ul style={{ listStyle:'none', padding:0, margin:0 }}>{(synthesis.result.risks||[]).map((b,i) => <li key={i} style={{ fontSize:12, color:'rgba(255,255,255,0.7)', display:'flex', gap:6, marginBottom:4 }}><span style={{ color:'#FF3B30' }}>!</span>{b}</li>)}</ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!active && (
        <div style={{ marginTop:48, textAlign:'center', padding:'40px 20px', border:'1px dashed #EEEEEE', borderRadius:12 }}>
          <Crown size={32} style={{ margin:'0 auto 12px', opacity:0.25, color:'#F59E0B' }} />
          <p style={{ color:'#AAAAAA', fontSize:14, margin:0 }}>Type a ticker and convene the council for {acct?.label}.</p>
          <p style={{ ...MONO, color:'#CCCCCC', fontSize:11, marginTop:6 }}>6 specialists review in parallel → the PM delivers one ruling.</p>
        </div>
      )}
    </div>
  );
}
