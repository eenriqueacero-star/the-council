import React, { useRef } from 'react';
import { Search, ChevronRight, Loader2, AlertTriangle, Crown, TrendingUp, Wallet } from 'lucide-react';
import { MONO, DISP } from '../constants/styles.js';
import { AGENTS } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent, getQuotes } from '../api.js';
import { auth, db } from '../firebase.js';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { loadTickerHistory } from '../utils/rulingContext.js';
import { loadAgentContext, buildAgentContext } from '../utils/agentContext.js';
import { theme } from '../utils/theme.js';

const PS = {
  PASS:       { bg:'rgba(0,200,5,0.1)',    fg:'#00C805', label:'PASS'    },
  FAIL:       { bg:'rgba(255,59,48,0.1)',  fg:'#FF3B30', label:'FAIL'    },
  CAUTION:    { bg:'rgba(245,158,11,0.1)', fg:'#B45309', label:'CAUTION' },
  BEARISH:    { bg:'rgba(255,59,48,0.1)',  fg:'#FF3B30', label:'BEAR'    },
  BUY:        { bg:'#000000',              fg:'#FFFFFF', label:'BUY'     },
  WATCH:      { bg:'#EEEEEE',              fg:'#000000', label:'WATCH'   },
  PASS_FINAL: { bg:'rgba(255,59,48,0.1)',  fg:'#FF3B30', label:'PASS'    },
};

export default function CouncilTab({ account, acct, positionsLine, flagApiDown, running, setRunning, ticker, setTicker, capital, setCapital, active, setActive, agentState, setAgentState, synthesis, setSynthesis, dark }) {
  const synthRef = useRef(null);
  const T = theme(dark);

  const verdictKey = synthesis.result ? (synthesis.result.verdict === 'PASS' ? 'PASS_FINAL' : synthesis.result.verdict) : null;
  const vStyle     = verdictKey ? (PS[verdictKey] || PS.WATCH) : null;
  const quickPicks = ['AAPL','TSLA','OKLO','PLTR','AVGO','SMCI'];

  async function convene() {
    const t = ticker.trim().toUpperCase();
    if (!t || running) return;
    setActive(t); setRunning(true); setSynthesis({ status:'idle', result:null });
    const init = {}; AGENTS.forEach(a => (init[a.id] = { status:'running', result:null })); setAgentState(init);

    let livePrice = null, rawQuote = null;
    try {
      const q = await getQuotes([t]);
      rawQuote  = q[t] || null;
      livePrice = rawQuote?.price > 0 ? rawQuote.price : rawQuote?.prevClose || null;
    } catch {}

    const uid     = auth.currentUser?.uid;
    const history = uid ? await loadTickerHistory(uid, t, livePrice) : '';
    const ctx     = await loadAgentContext(t, rawQuote);

    const priceNote   = livePrice ? ` Current price: $${livePrice.toFixed(2)}.` : '';
    const acctLine    = `Account: ${acct.label} (${acct.sub}). Holdings: ${positionsLine}. DCA: ${acct.dcaNote}.`;
    const capLine     = capital.trim() ? `Available capital: $${capital.trim()}.` : 'Capital: unspecified.';
    const baseContent = `Ticker: ${t}. Investor considering BUYING.${priceNote} ${acctLine} ${capLine} Today: ${new Date().toDateString()}.${history} Return ONLY the JSON.`;

    const results = {};
    await Promise.all(AGENTS.map(async a => {
      const extra = buildAgentContext(a.id, ctx);
      try {
        const txt = await callAgent(a.system, baseContent + extra, true);
        const p   = extractJSON(txt);
        results[a.id] = p || { stance:'CAUTION', headline:'Could not parse', points:['Agent returned unstructured data.'], score:5 };
        setAgentState(prev => ({ ...prev, [a.id]:{ status:'done', result:results[a.id] } }));
      } catch {
        flagApiDown();
        results[a.id] = null;
        setAgentState(prev => ({ ...prev, [a.id]:{ status:'error', result:null } }));
      }
    }));

    setSynthesis({ status:'running', result:null });
    setTimeout(() => synthRef.current?.scrollIntoView({ behavior:'smooth', block:'center' }), 200);

    const council     = AGENTS.map(a => `${a.name}: ${JSON.stringify(results[a.id])}`).join('\n');
    const synthSystem = `You are the PORTFOLIO MANAGER — final decision-maker for ${acct.label}. Six specialists just reported. Apply the 4-Gate Rule. BUY = all gates broadly satisfied + conviction ≥ 7. Downgrade to WATCH on macro headwinds. Respect a strong unrebutted bear case.\nRespond ONLY with JSON in a \`\`\`json block: {"verdict":"BUY"|"WATCH"|"PASS","conviction":<0-10>,"entry":"<price or range>","stopLoss":"<stop price>","takeProfit":"<target price>","sizing":"<one line>","summary":"<2-3 sentences>","bull":["<point>","<point>"],"risks":["<risk>","<risk>"]}`;

    try {
      const txt = await callAgent(synthSystem, `Council on ${t}:\n${council}\n${acctLine} ${capLine}${livePrice ? ` Price: $${livePrice.toFixed(2)}.` : ''} Final ruling. Return ONLY the JSON.`, false);
      const p   = extractJSON(txt);
      const res = p || { verdict:'WATCH', conviction:5, sizing:'n/a', summary:'Could not parse synthesis.', bull:[], risks:[] };
      setSynthesis({ status:'done', result: res });
      if (uid && res.verdict) {
        addDoc(collection(db, 'users', uid, 'rulings'), {
          ticker: t, account,
          date: new Date().toISOString().slice(0, 10),
          ts: serverTimestamp(),
          priceAtCall: livePrice,
          agentStances: Object.fromEntries(AGENTS.map(a => [a.id, { stance: results[a.id]?.stance ?? null, score: results[a.id]?.score ?? null, headline: results[a.id]?.headline ?? null }])),
          verdict: res.verdict, conviction: res.conviction ?? null,
          entry: res.entry || null, stopLoss: res.stopLoss || null, takeProfit: res.takeProfit || null,
          summary: res.summary || '',
          outcomeCheckedAt: null, priceAt30d: null, outcome: null,
        }).catch(e => console.error('Failed to save ruling:', e));
      }
    } catch {
      flagApiDown();
      setSynthesis({ status:'error', result:null });
    } finally {
      setRunning(false);
    }
  }

  const inp = {
    background: T.input, border: `1px solid ${T.inputBorder}`, color: T.text,
    borderRadius: 8, outline: 'none', transition: 'border-color .15s ease',
  };

  return (
    <div className="mt-2">
      <label style={{ ...MONO, display:'block', fontSize:11, color:T.text3, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:8 }}>Ticker to Convene the Council</label>
      <div className="flex gap-2 flex-wrap sm:flex-nowrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color:T.text3 }} />
          <input value={ticker} onChange={e => setTicker(e.target.value)} onKeyDown={e => e.key==='Enter' && convene()}
            placeholder="e.g. NVDA"
            onFocus={e => e.target.style.borderColor = T.inputFocus}
            onBlur={e => e.target.style.borderColor = T.inputBorder}
            style={{ ...MONO, ...inp, letterSpacing:'0.15em', width:'100%', paddingLeft:36, paddingRight:12, paddingTop:12, paddingBottom:12, fontSize:18, textTransform:'uppercase' }} />
        </div>
        <button onClick={convene} disabled={running || !ticker.trim()}
          style={{ fontFamily:'inherit', letterSpacing:'0.08em', background: running || !ticker.trim() ? T.btnDisabled : '#000000', color: running || !ticker.trim() ? T.btnDisabledText : '#FFFFFF', borderRadius:8, border:'none', cursor: running || !ticker.trim() ? 'not-allowed' : 'pointer', padding:'12px 24px', fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:8, whiteSpace:'nowrap', transition:'all .15s ease', width:'auto' }}>
          {running ? <><Loader2 size={18} className="animate-spin" /> CONVENING…</> : <>CONVENE <ChevronRight size={18} /></>}
        </button>
      </div>

      <div className="mt-2">
        <div className="relative">
          <Wallet size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color:T.text3 }} />
          <input value={capital} onChange={e => setCapital(e.target.value.replace(/[^0-9.]/g,''))} onKeyDown={e => e.key==='Enter' && convene()}
            inputMode="decimal" placeholder="available capital (optional)"
            onFocus={e => e.target.style.borderColor = T.inputFocus}
            onBlur={e => e.target.style.borderColor = T.inputBorder}
            style={{ ...MONO, ...inp, width:'100%', paddingLeft:36, paddingRight:capital.trim() ? 80 : 12, paddingTop:10, paddingBottom:10, fontSize:14 }} />
          {capital.trim() && <span style={{ ...MONO, color:'#00C805', position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:11 }}>${Number(capital).toLocaleString()}</span>}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span style={{ ...MONO, fontSize:10, color:T.text3 }}>QUICK:</span>
        {quickPicks.map(q => (
          <button key={q} onClick={() => setTicker(q)} disabled={running}
            style={{ ...MONO, fontSize:11, padding:'4px 10px', borderRadius:6, border:`1px solid ${T.border}`, color:T.text2, background:'none', cursor:'pointer', transition:'all .15s ease' }}>{q}</button>
        ))}
      </div>

      {active && (
        <div className="mt-8">
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
            <div style={{ height:1, flex:1, background:T.border }} />
            <span style={{ ...MONO, fontSize:10, color:T.text3, letterSpacing:'0.1em' }}>COUNCIL ON {active} · {acct.label.toUpperCase()}</span>
            <div style={{ height:1, flex:1, background:T.border }} />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {AGENTS.map((a, idx) => {
              const st   = agentState[a.id] || { status:'idle' };
              const Icon = a.icon;
              const r    = st.result;
              const ss   = r && (PS[r.stance] || PS.CAUTION);
              return (
                <div key={a.id} style={{
                  animation: st.status==='done' ? `cardIn .5s cubic-bezier(.2,.7,.2,1) ${idx*55}ms both` : undefined,
                  background: T.bg, border:`1px solid ${st.status==='error' ? 'rgba(255,59,48,0.3)' : T.border}`,
                  borderRadius:12, padding:16, overflow:'hidden', position:'relative',
                  boxShadow: dark ? 'none' : '0 2px 12px rgba(0,0,0,0.05)',
                }}>
                  {st.status==='running' && (
                    <div className="absolute left-0 right-0 h-1 top-0" style={{ background:a.accent, animation:'shimmer 1.5s infinite linear', backgroundSize:'200% 100%', backgroundImage:`linear-gradient(90deg,${a.accent}44 0%,${a.accent} 50%,${a.accent}44 100%)` }} />
                  )}
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ background:`${a.accent}18`, border:`1px solid ${a.accent}30`, borderRadius:8, padding:7 }}>
                        <Icon size={16} style={{ color:a.accent }} />
                      </div>
                      <div>
                        <div style={{ ...DISP, fontSize:14, fontWeight:600, color:T.text, lineHeight:1.2 }}>{a.name}</div>
                        <div style={{ ...MONO, fontSize:9, color:T.text3, marginTop:2 }}>{a.role}</div>
                      </div>
                    </div>
                    {st.status==='done' && ss && (
                      <span style={{ ...MONO, background:ss.bg, color:ss.fg, fontSize:9, fontWeight:700, padding:'3px 8px', borderRadius:6, whiteSpace:'nowrap', flexShrink:0 }}>{ss.label}</span>
                    )}
                  </div>
                  {st.status==='running' && (
                    <div style={{ marginTop:16, display:'flex', alignItems:'center', gap:8, ...MONO, color:T.text3 }}>
                      <Loader2 size={13} className="animate-spin" /><span style={{ fontSize:11 }}>searching · analyzing…</span>
                    </div>
                  )}
                  {st.status==='error' && (
                    <div style={{ marginTop:16, display:'flex', alignItems:'center', gap:8, ...MONO, color:'#FF3B30' }}>
                      <AlertTriangle size={13} /><span style={{ fontSize:11 }}>agent error — retry</span>
                    </div>
                  )}
                  {st.status==='done' && r && (
                    <div style={{ marginTop:12 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:8 }}>
                        <p style={{ fontSize:13, fontWeight:500, color:a.accent, lineHeight:1.35, margin:0 }}>{r.headline}</p>
                        {typeof r.score==='number' && <span style={{ ...MONO, fontSize:10, color:T.text3, flexShrink:0 }}>{r.score}/10</span>}
                      </div>
                      <ul style={{ listStyle:'none', padding:0, margin:0 }}>
                        {(r.points||[]).map((pt,j) => (
                          <li key={j} style={{ display:'flex', gap:8, fontSize:12, color: dark ? '#C0C0C0' : '#333', lineHeight:1.45, marginBottom:5 }}>
                            <span style={{ color:a.accent, marginTop:2, flexShrink:0 }}>▸</span><span>{pt}</span>
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

      {active && (
        <div ref={synthRef} style={{ marginTop:20 }}>
          {synthesis.status==='running' && (
            <div style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.35)', borderRadius:12, padding:24, display:'flex', alignItems:'center', gap:12, ...MONO, color:'#B45309' }}>
              <Loader2 size={18} className="animate-spin" />
              <span style={{ fontSize:14 }}>Portfolio Manager synthesizing the council’s ruling…</span>
            </div>
          )}
          {synthesis.status==='error' && (
            <div style={{ background:'rgba(255,59,48,0.08)', border:'1px solid rgba(255,59,48,0.3)', borderRadius:12, padding:20, display:'flex', alignItems:'center', gap:10, ...MONO, color:'#FF3B30' }}>
              <AlertTriangle size={16} /><span style={{ fontSize:13 }}>Synthesis failed — retry by convening again.</span>
            </div>
          )}
          {synthesis.status==='done' && synthesis.result && vStyle && (
            <div style={{ animation:'cardIn .5s cubic-bezier(.2,.7,.2,1) both', background:'#000000', borderRadius:12, padding:'20px 24px', color:'#FFFFFF' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
                <Crown size={16} style={{ color:'#F59E0B' }} />
                <span style={{ ...DISP, fontSize:14, fontWeight:600, letterSpacing:'0.06em' }}>PORTFOLIO MANAGER · FINAL RULING</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
                <div style={{ background: vStyle.bg === '#000000' ? 'rgba(255,255,255,0.12)' : vStyle.bg, border:'1px solid rgba(255,255,255,0.2)', borderRadius:10, padding:'12px 24px', textAlign:'center' }}>
                  <div style={{ ...DISP, color: vStyle.fg, fontSize:32, fontWeight:700, letterSpacing:'0.04em' }}>{vStyle.label}</div>
                  <div style={{ ...MONO, color:'rgba(255,255,255,0.45)', fontSize:10, marginTop:2 }}>{active} · {acct.label}</div>
                </div>
                <div style={{ flex:1, minWidth:160 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', ...MONO, fontSize:11, color:'rgba(255,255,255,0.45)', marginBottom:6 }}>
                    <span>CONVICTION</span><span>{synthesis.result.conviction}/10</span>
                  </div>
                  <div style={{ height:8, borderRadius:4, background:'rgba(255,255,255,0.15)', overflow:'hidden' }}>
                    <div style={{ width:`${(synthesis.result.conviction/10)*100}%`, background: vStyle.fg === '#000000' ? '#FFFFFF' : vStyle.fg, height:'100%', borderRadius:4, transition:'width .8s ease' }} />
                  </div>
                  <div style={{ display:'flex', gap:8, marginTop:10, ...MONO, fontSize:11, color:'rgba(255,255,255,0.55)', flexWrap:'wrap' }}>
                    {synthesis.result.entry     && <span>ENTRY <strong style={{ color:'#fff' }}>{synthesis.result.entry}</strong></span>}
                    {synthesis.result.stopLoss  && <span>STOP <strong style={{ color:'#FF3B30' }}>{synthesis.result.stopLoss}</strong></span>}
                    {synthesis.result.takeProfit&& <span>TARGET <strong style={{ color:'#00C805' }}>{synthesis.result.takeProfit}</strong></span>}
                  </div>
                  <div style={{ marginTop:8, ...MONO, fontSize:12, color:'rgba(255,255,255,0.55)', display:'flex', alignItems:'flex-start', gap:6 }}>
                    <TrendingUp size={13} style={{ marginTop:1, color:'rgba(255,255,255,0.35)', flexShrink:0 }} /><span>{synthesis.result.sizing}</span>
                  </div>
                </div>
              </div>
              <p style={{ marginTop:16, fontSize:14, color:'rgba(255,255,255,0.85)', lineHeight:1.65 }}>{synthesis.result.summary}</p>
              <div style={{ marginTop:16, display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div style={{ background:'rgba(0,200,5,0.1)', border:'1px solid rgba(0,200,5,0.25)', borderRadius:8, padding:12 }}>
                  <div style={{ ...MONO, color:'#00C805', fontSize:10, marginBottom:8, letterSpacing:'0.08em' }}>BULL CASE</div>
                  <ul style={{ listStyle:'none', padding:0, margin:0 }}>
                    {(synthesis.result.bull||[]).map((b,i) => (
                      <li key={i} style={{ fontSize:12, color:'rgba(255,255,255,0.75)', display:'flex', gap:6, marginBottom:4 }}><span style={{ color:'#00C805' }}>+</span>{b}</li>
                    ))}
                  </ul>
                </div>
                <div style={{ background:'rgba(255,59,48,0.1)', border:'1px solid rgba(255,59,48,0.25)', borderRadius:8, padding:12 }}>
                  <div style={{ ...MONO, color:'#FF3B30', fontSize:10, marginBottom:8, letterSpacing:'0.08em' }}>RISKS</div>
                  <ul style={{ listStyle:'none', padding:0, margin:0 }}>
                    {(synthesis.result.risks||[]).map((b,i) => (
                      <li key={i} style={{ fontSize:12, color:'rgba(255,255,255,0.75)', display:'flex', gap:6, marginBottom:4 }}><span style={{ color:'#FF3B30' }}>!</span>{b}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!active && (
        <div style={{ marginTop:48, textAlign:'center', padding:'40px 20px', border:`1px dashed ${T.border}`, borderRadius:12 }}>
          <Crown size={32} style={{ margin:'0 auto 12px', opacity:0.25, color:'#F59E0B' }} />
          <p style={{ color:T.text3, fontSize:14, margin:0 }}>Type a ticker and convene the council for {acct?.label}.</p>
          <p style={{ ...MONO, color:T.text3, fontSize:11, marginTop:6, opacity:.7 }}>6 specialists analyse live → PM delivers one ruling.</p>
        </div>
      )}
    </div>
  );
}
