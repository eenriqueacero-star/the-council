import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Volume2, VolumeX, Loader2, Mic, MicOff, Send } from 'lucide-react';
import { MONO, DISP } from '../constants/styles.js';
import { AGENTS, PROTOCOLS } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent, getQuotes } from '../api.js';
import { auth, db } from '../firebase.js';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { loadTickerHistory } from '../utils/rulingContext.js';
import { loadAgentContext, buildAgentContext } from '../utils/agentContext.js';
import { useVoice } from '../hooks/useVoice.js';
import { theme } from '../utils/theme.js';
import ArcReactor from './ArcReactor.jsx';

const PS = {
  PASS:       { bg:'rgba(0,200,5,0.1)',    fg:'#00C805', label:'PASS'    },
  FAIL:       { bg:'rgba(255,59,48,0.1)',  fg:'#FF3B30', label:'FAIL'    },
  CAUTION:    { bg:'rgba(245,158,11,0.1)', fg:'#B45309', label:'CAUTION' },
  BEARISH:    { bg:'rgba(255,59,48,0.1)',  fg:'#FF3B30', label:'BEAR'    },
  BUY:        { bg:'#000000',              fg:'#FFFFFF', label:'BUY'     },
  WATCH:      { bg:'#EEEEEE',              fg:'#000000', label:'WATCH'   },
  PASS_FINAL: { bg:'rgba(255,59,48,0.1)',  fg:'#FF3B30', label:'PASS'    },
};

export default function ChatTab({ account, acct, positionsLine, flagApiDown, dark }) {
  const [chat,      setChat]      = useState([{ role:'pm', text:"Good to see you, sir. The council stands ready. Ask me about any ticker and I'll convene the full council instantly." }]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy,  setChatBusy]  = useState(false);
  const chatEndRef = useRef(null);
  const T = theme(dark);

  const { voiceOn, listening, speaking, srSupported, speak, stopSpeaking, toggleVoice, toggleListen } = useVoice();

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [chat]);

  const pmSys = `You are the PORTFOLIO MANAGER, head of THE COUNCIL. ${PROTOCOLS}
Tone: sharp, confident, concise, lightly British-butler. Address the investor as "sir" occasionally.
CRITICAL RULE — ALWAYS convene the council (convene=true) when the investor mentions ANY specific stock ticker or company name, regardless of how the question is phrased ("how does X look", "should I buy X", "what do you think of X", "X outlook", "is X a buy", etc.). The full council must weigh in — never answer stock-specific questions yourself.
Only answer directly (convene=false) for pure market/macro questions with NO specific ticker ("what's SPY doing?", "is the market risky?") or non-investment questions.
Respond ONLY with JSON in a \`\`\`json block: {"speak":"<1-2 sentence reply>","convene":<true|false>,"ticker":"<TICKER or null>"}`;

  async function sendChat(raw) {
    const text = (typeof raw === 'string' ? raw : chatInput).trim();
    if (!text || chatBusy) return;
    setChatInput(''); stopSpeaking();
    setChat(p => [...p, { role:'user', text }]);
    setChatBusy(true);

    const acctLine = `Account: ${acct.label} (${acct.sub}). Holdings: ${positionsLine}. DCA: ${acct.dcaNote}.`;
    let router;
    try {
      const txt = await callAgent(pmSys, `Investor: "${text}". Today: ${new Date().toDateString()}. ${acctLine} Return ONLY the JSON.`, false);
      router = extractJSON(txt) || { speak:"Apologies sir, I didn't quite catch that.", convene:false, ticker:null };
    } catch {
      flagApiDown();
      router = { speak:'I can\'t reach the council right now, sir.', convene:false, ticker:null };
    }

    if (router.convene && router.ticker) {
      const tkr   = String(router.ticker).toUpperCase();
      const intro = router.speak || `Convening the full council on ${tkr}, sir.`;
      setChat(p => [...p, { role:'pm', text:intro }]); speak(intro);
      const runId = Date.now();
      setChat(p => [...p, { role:'council', runId, ticker:tkr, agents:{} }]);

      let livePrice = null, rawQuote = null;
      try {
        const q = await getQuotes([tkr]);
        rawQuote  = q[tkr] || null;
        livePrice = rawQuote?.price > 0 ? rawQuote.price : rawQuote?.prevClose || null;
      } catch {}

      const uid     = auth.currentUser?.uid;
      const history = uid ? await loadTickerHistory(uid, tkr, livePrice) : '';
      const ctx     = await loadAgentContext(tkr, rawQuote);

      const priceNote   = livePrice ? ` Price: $${livePrice.toFixed(2)}.` : '';
      const baseContent = `Ticker: ${tkr}. Investor considering BUYING.${priceNote} ${acctLine} Today: ${new Date().toDateString()}.${history} Return ONLY the JSON.`;

      const results = {};
      await Promise.all(AGENTS.map(async ag => {
        const extra = buildAgentContext(ag.id, ctx);
        try {
          const txt = await callAgent(ag.system, baseContent + extra, true);
          const pr  = extractJSON(txt);
          results[ag.id] = pr || { stance:'CAUTION' };
        } catch {
          flagApiDown();
          results[ag.id] = { stance:'CAUTION' };
        }
        setChat(p => p.map(m => m.runId===runId ? { ...m, agents:{ ...m.agents, [ag.id]:results[ag.id].stance } } : m));
      }));

      const council  = AGENTS.map(ag => `${ag.name}: ${JSON.stringify(results[ag.id])}`).join('\n');
      const synthSys = `You are the PM concluding the council on ${tkr} for ${acct.label}. ${PROTOCOLS}\nSpeak the ruling conversationally (2-4 sentences): verdict, conviction /10, top factor, sizing if BUY.\nRespond ONLY with JSON in a \`\`\`json block: {"speak":"<ruling>","verdict":"BUY"|"WATCH"|"PASS","conviction":<0-10>,"stopLoss":"<price>","takeProfit":"<price>"}`;

      let synth;
      try {
        const txt = await callAgent(synthSys, `Council on ${tkr}:\n${council}\n${livePrice?`Price: $${livePrice.toFixed(2)}.`:''} Deliver the ruling. Return ONLY the JSON.`, false);
        synth = extractJSON(txt) || { speak:'The council is split, sir — I\'d hold off.', verdict:'WATCH', conviction:5 };
      } catch {
        synth = { speak:'I couldn\'t finalize the ruling, sir.', verdict:'WATCH', conviction:5 };
      }

      if (uid && synth.verdict) {
        addDoc(collection(db, 'users', uid, 'rulings'), {
          ticker: tkr, account,
          date: new Date().toISOString().slice(0, 10),
          ts: serverTimestamp(), priceAtCall: livePrice,
          agentStances: Object.fromEntries(AGENTS.map(ag => [ag.id, { stance: results[ag.id]?.stance ?? null, score: results[ag.id]?.score ?? null, headline: results[ag.id]?.headline ?? null }])),
          verdict: synth.verdict, conviction: synth.conviction ?? null,
          entry: null, stopLoss: synth.stopLoss || null, takeProfit: synth.takeProfit || null,
          summary: synth.speak || '',
          outcomeCheckedAt: null, priceAt30d: null, outcome: null,
        }).catch(() => {});
      }

      setChat(p => [...p, { role:'pm', text:synth.speak, verdict:synth.verdict, conviction:synth.conviction, ticker:tkr }]);
      speak(synth.speak);
    } else {
      setChat(p => [...p, { role:'pm', text:router.speak }]);
      speak(router.speak);
    }
    setChatBusy(false);
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <MessageSquare size={16} style={{ color:T.text }} />
          <span style={{ ...DISP, fontSize:14, fontWeight:600, letterSpacing:'0.04em', color:T.text }}>TALK TO YOUR PM · {acct.label.toUpperCase()}</span>
        </div>
        <button onClick={toggleVoice}
          style={{ fontFamily:'inherit', display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, border:`1px solid ${voiceOn ? T.text : T.border}`, background:T.bg, color: voiceOn ? T.text : T.text2, cursor:'pointer', fontSize:11 }}>
          {voiceOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
          <span style={MONO}>{voiceOn ? 'VOICE ON' : 'MUTED'}</span>
        </button>
      </div>

      <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', display:'flex', flexDirection:'column', height:'min(60vh,560px)' }}>
        <div className="flex-1 overflow-y-auto no-scrollbar" style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
          {chat.map((m, i) => {
            if (m.role === 'user') return (
              <div key={i} style={{ display:'flex', justifyContent:'flex-end', animation:'slideInRight .22s ease both' }}>
                <div style={{ maxWidth:'82%', background:'#000000', color:'#FFFFFF', borderRadius:'16px 16px 4px 16px', padding:'10px 14px', fontSize:13, lineHeight:1.55 }}>{m.text}</div>
              </div>
            );
            if (m.role === 'pm') {
              const vs = m.verdict ? (PS[m.verdict==='PASS' ? 'PASS_FINAL' : m.verdict] || null) : null;
              return (
                <div key={i} style={{ display:'flex', justifyContent:'flex-start', gap:10, animation:'slideInLeft .22s ease both' }}>
                  <div style={{ flexShrink:0, marginTop:2 }}><ArcReactor size={26} /></div>
                  <div style={{ maxWidth:'82%' }}>
                    <div style={{ background: dark ? '#2C2C2E' : '#F0F0F0', color:T.text, borderRadius:'16px 16px 16px 4px', padding:'10px 14px', fontSize:13, lineHeight:1.55 }}>
                      {speaking && i===chat.length-1 && voiceOn && (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4, marginRight:6, verticalAlign:'middle' }}>
                          <span className="blink" style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:T.text }} />
                        </span>
                      )}
                      {m.text}
                    </div>
                    {vs && (
                      <div style={{ marginTop:6, display:'inline-flex', alignItems:'center', gap:8 }}>
                        <span style={{ ...MONO, background:vs.bg, color:vs.fg, fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6 }}>{vs.label}</span>
                        <span style={{ ...MONO, fontSize:9, color:T.text3 }}>{m.conviction}/10 · {m.ticker||''}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            if (m.role === 'council') return (
              <div key={i} style={{ display:'flex', justifyContent:'flex-start', gap:10, animation:'fadeUp .3s ease both' }}>
                <div style={{ flexShrink:0, width:26 }} />
                <div style={{ maxWidth:'88%', width:'100%', background: dark ? '#1C1C1E' : '#F7F7F7', border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 12px' }}>
                  <div style={{ ...MONO, fontSize:9, color:T.text3, letterSpacing:'0.08em', marginBottom:8 }}>COUNCIL ON {m.ticker}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                    {AGENTS.map(ag => {
                      const stance = m.agents[ag.id];
                      const ss = stance ? (PS[stance] || null) : null;
                      return (
                        <div key={ag.id} style={{ display:'flex', alignItems:'center', gap:6, background:T.bg, border:`1px solid ${stance ? ag.accent+'30' : T.border}`, borderRadius:8, padding:'6px 8px' }}>
                          <ag.icon size={11} style={{ color:ag.accent }} />
                          <span style={{ ...MONO, fontSize:9, color:T.text2, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ag.name.split(' ')[0]}</span>
                          {stance
                            ? <span style={{ ...MONO, fontSize:8, fontWeight:700, color: ss ? ss.fg : T.text2 }}>{ss ? ss.label : stance}</span>
                            : <Loader2 size={10} className="animate-spin" style={{ color:T.text3 }} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
            return null;
          })}
          {chatBusy && (
            <div style={{ display:'flex', justifyContent:'flex-start', gap:10, animation:'fadeIn .2s ease both' }}>
              <div style={{ flexShrink:0, marginTop:2 }}><ArcReactor size={26} /></div>
              <div style={{ background: dark ? '#2C2C2E' : '#F0F0F0', borderRadius:'16px 16px 16px 4px', padding:'12px 16px' }}>
                <Loader2 size={14} className="animate-spin" style={{ color:T.text }} />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div style={{ borderTop:`1px solid ${T.border}`, padding:10, display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => toggleListen(t => sendChat(t))} disabled={!srSupported || chatBusy}
            style={{ flexShrink:0, width:44, height:44, borderRadius:10, border:'1px solid', borderColor: listening ? '#FF3B30' : T.border, background: listening ? '#FF3B30' : T.bgCard, color: listening ? '#fff' : srSupported ? T.text : T.text3, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all .15s ease', opacity: !srSupported || chatBusy ? .4 : 1 }}>
            {srSupported ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key==='Enter' && sendChat()}
            disabled={chatBusy} placeholder={listening ? 'Listening…' : 'Ask your PM anything…'} style={{ ...MONO, flex:1, background:T.input, border:`1px solid ${T.inputBorder}`, borderRadius:12, padding:'12px 16px', fontSize:14, color:T.text, outline:'none' }} />
          <button onClick={() => sendChat()} disabled={chatBusy || !chatInput.trim()}
            style={{ flexShrink:0, width:44, height:44, borderRadius:10, background: chatBusy || !chatInput.trim() ? T.btnDisabled : '#000000', color: chatBusy || !chatInput.trim() ? T.btnDisabledText : '#FFFFFF', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor: chatBusy || !chatInput.trim() ? 'not-allowed' : 'pointer', transition:'all .15s ease' }}>
            <Send size={17} />
          </button>
        </div>
      </div>

      <div style={{ marginTop:8, display:'flex', flexWrap:'wrap', gap:6 }}>
        {['How does CRDO look?','Should I buy OKLO?','Analyse NVDA for me'].map(q => (
          <button key={q} onClick={() => sendChat(q)} disabled={chatBusy}
            style={{ ...MONO, fontSize:10, padding:'6px 12px', borderRadius:20, border:`1px solid ${T.border}`, color:T.text2, background:'none', cursor:'pointer', transition:'all .15s ease' }}>{q}</button>
        ))}
      </div>
      <p style={{ ...MONO, marginTop:8, fontSize:10, color:T.text3 }}>
        {srSupported ? 'Tap the mic to talk, or type. ' : 'Voice input needs Chrome. '}
        PM always convenes the full council for specific tickers.
      </p>
    </div>
  );
}
