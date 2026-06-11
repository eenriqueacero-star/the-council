import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Volume2, VolumeX, Loader2, Mic, MicOff, Send } from 'lucide-react';
import { MONO, DISP } from '../constants/styles.js';
import { AGENTS, PROTOCOLS, STANCE_STYLE } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent } from '../api.js';
import { useVoice } from '../hooks/useVoice.js';
import ArcReactor from './ArcReactor.jsx';

const FONT = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };

const PS = {
  PASS:       { bg:'rgba(0,200,5,0.1)',    fg:'#00C805', label:'PASS'    },
  FAIL:       { bg:'rgba(255,59,48,0.1)',  fg:'#FF3B30', label:'FAIL'    },
  CAUTION:    { bg:'rgba(245,158,11,0.1)', fg:'#B45309', label:'CAUTION' },
  BEARISH:    { bg:'rgba(255,59,48,0.1)',  fg:'#FF3B30', label:'BEAR'    },
  BUY:        { bg:'#000000',              fg:'#FFFFFF', label:'BUY'     },
  WATCH:      { bg:'#EEEEEE',              fg:'#000000', label:'WATCH'   },
  PASS_FINAL: { bg:'rgba(255,59,48,0.1)',  fg:'#FF3B30', label:'PASS'    },
};

export default function ChatTab({ account, acct, positionsLine, flagApiDown }) {
  const [chat,      setChat]      = useState([{ role:'pm', text:"Good to see you, sir. The council stands ready. Ask me how a holding looks, or say \"should I buy —\" and I'll convene the agents." }]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy,  setChatBusy]  = useState(false);
  const chatEndRef = useRef(null);

  const { voiceOn, listening, speaking, srSupported, speak, stopSpeaking, toggleVoice, toggleListen } = useVoice();

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [chat]);

  const pmSys = `You are the PORTFOLIO MANAGER, head of THE COUNCIL - a JARVIS-style AI investing assistant. ${PROTOCOLS}
Tone: sharp, confident, concise, lightly British-butler; address the investor as "sir" occasionally (not every line). You command 6 specialists: Technical, Catalyst, Risk, Macro, Devil's Advocate, Position Sizer.
DECIDE: if the investor asks whether to BUY / enter / add / review / decide on a SPECIFIC ticker, set convene=true and the ticker - you will consult the council. For anything else (how a holding looks, market reads, general questions), answer directly and concisely; be honest if unsure.
Respond ONLY with JSON in a \`\`\`json block: {"speak":"<1-3 sentence reply>","convene":<true|false>,"ticker":"<TICKER or null>"}`;

  async function sendChat(raw) {
    const text = (typeof raw === 'string' ? raw : chatInput).trim();
    if (!text || chatBusy) return;
    setChatInput(''); stopSpeaking();
    setChat(p => [...p, { role:'user', text }]);
    setChatBusy(true);

    const acctLine = `Active account: ${acct.label}'s (${acct.sub}); current positions: ${positionsLine}; DCA ${acct.dcaNote}.`;
    let router;
    try {
      const txt = await callAgent(pmSys, `Investor says: "${text}". Today is ${new Date().toDateString()}. ${acctLine} Return ONLY the JSON.`, true);
      router = extractJSON(txt) || { speak:"Apologies sir, I didn't quite catch that.", convene:false, ticker:null };
    } catch {
      flagApiDown();
      router = { speak:'I can\'t reach the council right now, sir. Check your connection and try again.', convene:false, ticker:null };
    }

    if (router.convene && router.ticker) {
      const tkr   = String(router.ticker).toUpperCase();
      const intro = router.speak || `Consulting the council on ${tkr}, sir.`;
      setChat(p => [...p, { role:'pm', text:intro }]); speak(intro);
      const runId = Date.now();
      setChat(p => [...p, { role:'council', runId, ticker:tkr, agents:{} }]);
      const userContent = `Ticker: ${tkr}. The investor is considering BUYING it. ${acctLine} Today is ${new Date().toDateString()}. Return ONLY the JSON.`;
      const results = {};
      await Promise.all(AGENTS.map(async ag => {
        try {
          const txt = await callAgent(ag.system, userContent, ag.search);
          const pr  = extractJSON(txt);
          results[ag.id] = pr || { stance:'CAUTION' };
        } catch {
          flagApiDown();
          results[ag.id] = { stance:'CAUTION' };
        }
        setChat(p => p.map(m => m.runId===runId ? { ...m, agents:{ ...m.agents, [ag.id]:results[ag.id].stance } } : m));
      }));

      const council  = AGENTS.map(ag => `${ag.name}: ${JSON.stringify(results[ag.id])}`).join('\n');
      const synthSys = `You are the PM concluding the council on ${tkr} for ${acct.label}. ${PROTOCOLS}
Speak the ruling to the investor conversationally (JARVIS tone, 2-4 sentences): the verdict, conviction out of 10, the single most important factor, and sizing if buying. Reference that the agents reported in.
Respond ONLY with JSON in a \`\`\`json block: {"speak":"<the spoken ruling>","verdict":"BUY"|"WATCH"|"PASS","conviction":<0-10>}`;
      let synth;
      try {
        const txt = await callAgent(synthSys, `Council reports on ${tkr}:\n${council}\n\nDeliver the ruling. Return ONLY the JSON.`, false);
        synth = extractJSON(txt) || { speak:'The council is split, sir — I\'d hold off for now.', verdict:'WATCH', conviction:5 };
      } catch {
        synth = { speak:'I couldn\'t finalize the ruling, sir.', verdict:'WATCH', conviction:5 };
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
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <MessageSquare size={16} style={{ color:'#000' }} />
          <span style={{ ...DISP, fontSize:14, fontWeight:600, letterSpacing:'0.04em', color:'#000' }}>TALK TO YOUR PM · {acct.label.toUpperCase()}</span>
        </div>
        <button onClick={toggleVoice} title={voiceOn ? 'Voice on' : 'Voice off'}
          style={{ ...FONT, display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, border:`1px solid ${voiceOn ? '#000' : '#EEEEEE'}`, background:'#fff', color: voiceOn ? '#000' : '#757575', cursor:'pointer', fontSize:11 }}>
          {voiceOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
          <span style={MONO}>{voiceOn ? 'VOICE ON' : 'MUTED'}</span>
        </button>
      </div>

      {/* Chat window */}
      <div style={{ background:'#FFFFFF', border:'1px solid #EEEEEE', borderRadius:12, overflow:'hidden', display:'flex', flexDirection:'column', height:'min(60vh, 560px)' }}>
        <div className="flex-1 overflow-y-auto no-scrollbar" style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
          {chat.map((m, i) => {
            if (m.role === 'user') return (
              <div key={i} style={{ display:'flex', justifyContent:'flex-end' }}>
                <div style={{ maxWidth:'82%', background:'#000000', color:'#FFFFFF', borderRadius:'16px 16px 4px 16px', padding:'10px 14px', fontSize:13, lineHeight:1.5 }}>{m.text}</div>
              </div>
            );
            if (m.role === 'pm') {
              const vs = m.verdict ? (PS[m.verdict==='PASS' ? 'PASS_FINAL' : m.verdict] || null) : null;
              return (
                <div key={i} style={{ display:'flex', justifyContent:'flex-start', gap:10, animation:'cardIn .4s ease both' }}>
                  <div style={{ flexShrink:0, marginTop:2 }}><ArcReactor size={26} /></div>
                  <div style={{ maxWidth:'82%' }}>
                    <div style={{ background:'#F0F0F0', color:'#000000', borderRadius:'16px 16px 16px 4px', padding:'10px 14px', fontSize:13, lineHeight:1.5 }}>
                      {speaking && i===chat.length-1 && voiceOn && (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4, marginRight:6, verticalAlign:'middle' }}>
                          <span className="blink" style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:'#000' }} />
                        </span>
                      )}
                      {m.text}
                    </div>
                    {vs && (
                      <div style={{ marginTop:6, display:'inline-flex', alignItems:'center', gap:8 }}>
                        <span style={{ ...MONO, background:vs.bg, color:vs.fg, fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6 }}>{vs.label}</span>
                        <span style={{ ...MONO, fontSize:9, color:'#AAAAAA' }}>{m.conviction}/10 · {m.ticker||''}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            if (m.role === 'council') return (
              <div key={i} style={{ display:'flex', justifyContent:'flex-start', gap:10 }}>
                <div style={{ flexShrink:0, width:26 }} />
                <div style={{ maxWidth:'88%', width:'100%', background:'#F7F7F7', border:'1px solid #EEEEEE', borderRadius:10, padding:'10px 12px' }}>
                  <div style={{ ...MONO, fontSize:9, color:'#AAAAAA', letterSpacing:'0.08em', marginBottom:8 }}>CONSULTING THE COUNCIL · {m.ticker}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                    {AGENTS.map(ag => {
                      const stance = m.agents[ag.id];
                      const ss = stance && (PS[stance] || null);
                      return (
                        <div key={ag.id} style={{ display:'flex', alignItems:'center', gap:6, background:'#FFFFFF', border:`1px solid ${stance ? ag.accent+'28' : '#EEEEEE'}`, borderRadius:8, padding:'6px 8px' }}>
                          <ag.icon size={11} style={{ color:ag.accent }} />
                          <span style={{ ...MONO, fontSize:9, color:'#757575', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ag.name.split(' ')[0]}</span>
                          {stance
                            ? <span style={{ ...MONO, fontSize:8, fontWeight:700, color: ss ? ss.fg : '#757575' }}>{ss ? ss.label : stance}</span>
                            : <Loader2 size={10} className="animate-spin" style={{ color:'#CCCCCC' }} />}
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
            <div style={{ display:'flex', justifyContent:'flex-start', gap:10 }}>
              <div style={{ flexShrink:0, marginTop:2 }}><ArcReactor size={26} /></div>
              <div style={{ background:'#F0F0F0', borderRadius:'16px 16px 16px 4px', padding:'10px 14px' }}>
                <Loader2 size={14} className="animate-spin" style={{ color:'#000' }} />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div style={{ borderTop:'1px solid #EEEEEE', padding:10, display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => toggleListen(t => sendChat(t))} disabled={!srSupported || chatBusy}
            title={srSupported ? 'Tap to speak' : 'Voice input needs Chrome'}
            style={{ flexShrink:0, width:44, height:44, borderRadius:10, border:'1px solid', borderColor: listening ? '#FF3B30' : '#EEEEEE', background: listening ? '#FF3B30' : '#F7F7F7', color: listening ? '#fff' : srSupported ? '#000' : '#CCCCCC', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all .15s ease' }}
            className="disabled:opacity-40">
            {srSupported ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key==='Enter' && sendChat()}
            disabled={chatBusy} placeholder={listening ? 'Listening…' : 'Ask your PM anything…'} style={MONO}
            className="flex-1 bg-white border border-[#EEEEEE] rounded-xl px-4 py-3 text-sm text-black outline-none focus:border-black transition-colors disabled:opacity-50" />
          <button onClick={() => sendChat()} disabled={chatBusy || !chatInput.trim()}
            style={{ flexShrink:0, width:44, height:44, borderRadius:10, background: chatBusy || !chatInput.trim() ? 'rgba(0,0,0,0.12)' : '#000000', color:'#FFFFFF', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all .15s ease' }}
            className="disabled:cursor-not-allowed">
            <Send size={17} />
          </button>
        </div>
      </div>

      {/* Quick suggestions */}
      <div style={{ marginTop:8, display:'flex', flexWrap:'wrap', gap:6 }}>
        {['How does CRDO look?','Should I buy OKLO?',"What's the macro risk today?"].map(q => (
          <button key={q} onClick={() => sendChat(q)} disabled={chatBusy} style={MONO}
            className="text-[10px] px-3 py-1.5 rounded-full border border-[#EEEEEE] text-[#757575] hover:border-black hover:text-black transition-colors disabled:opacity-40">{q}</button>
        ))}
      </div>
      <p style={{ ...MONO, marginTop:8, fontSize:10, color:'#AAAAAA' }}>
        {srSupported ? 'Tap the mic to talk, or type. ' : 'Type to chat (voice input needs Chrome). '}
        PM replies aloud when voice is on.
      </p>
    </div>
  );
}
