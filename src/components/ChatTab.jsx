import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Volume2, VolumeX, Loader2, Mic, MicOff, Send, Crown } from 'lucide-react';
import { MONO, DISP } from '../constants/styles.js';
import { AGENTS, PROTOCOLS, AXIOM_SYSTEM, AXIOM_CONVERSATIONAL } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent, getQuotes, sleep } from '../api.js';
import { auth, db } from '../firebase.js';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { loadTickerHistory } from '../utils/rulingContext.js';
import { loadAgentContext, buildAgentContext } from '../utils/agentContext.js';
import { loadAllAgentProfiles, refreshAgentResearch, buildProfileContext } from '../utils/agentMemory.js';
import { useVoice } from '../hooks/useVoice.js';
import { theme } from '../utils/theme.js';
import ArcReactor from './ArcReactor.jsx';

const PS = {
  PASS:       { bg:'rgba(0,200,5,0.1)',    fg:'#00C805', label:'PASS'    },
  FAIL:       { bg:'rgba(255,59,48,0.1)',  fg:'#FF3B30', label:'FAIL'    },
  CAUTION:    { bg:'rgba(245,158,11,0.1)', fg:'#B45309', label:'CAUTION' },
  BEARISH:    { bg:'rgba(255,59,48,0.1)',  fg:'#FF3B30', label:'BEAR'    },
  BUY:        { bg:'rgba(0,200,5,0.15)',   fg:'#00C805', label:'BUY'     },
  WATCH:      { bg:'rgba(245,158,11,0.15)',fg:'#B45309', label:'WATCH'   },
  PASS_FINAL: { bg:'rgba(255,59,48,0.1)',  fg:'#FF3B30', label:'PASS'    },
};

const AGENT_CHIPS = [
  { id: 'pm',      label: 'AXIOM', emoji: '🎯', color: '#38e0d4' },
  ...AGENTS.map(ag => ({ id: ag.id, label: ag.name, emoji: ag.emoji, color: ag.color })),
  { id: 'council', label: 'COUNCIL', emoji: '🔄', color: '#b083ff' },
];

export default function ChatTab({ account, acct, positionsLine, flagApiDown, dark }) {
  const [chat,        setChat]       = useState([{ role:'pm', text:"The council is assembled. Ask me anything — market conditions, portfolio strategy, or name a specific ticker for a full council analysis." }]);
  const [chatInput,   setChatInput]  = useState('');
  const [chatBusy,    setChatBusy]   = useState(false);
  const [activeAgent, setActiveAgent]= useState('pm');
  const [convHistory, setConvHistory]= useState([]);
  const chatEndRef = useRef(null);
  const T = theme(dark);

  const { voiceOn, listening, speaking, srSupported, speak, stopSpeaking, toggleVoice, toggleListen } = useVoice();

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [chat]);

  function buildHistoryBlock(history) {
    if (!history.length) return '';
    const lines = history.slice(-10).map(h => {
      if (h.role === 'user') return `[You]: ${h.content}`;
      const agentObj = AGENTS.find(a => a.id === h.agentId);
      const speaker = agentObj ? `[${agentObj.name}]` : '[AXIOM]';
      return `${speaker}: ${h.content}`;
    });
    return `\n\nCONVERSATION HISTORY:\n${lines.join('\n')}\n---`;
  }

  async function runCouncilInChat(tkr, acctLine, uid, introText) {
    const runId = Date.now();
    setChat(p => [...p, { role:'council', runId, ticker:tkr, agents:{}, rounds:[], synth:null }]);

    let livePrice = null, rawQuote = null;
    try {
      const q = await getQuotes([tkr]);
      rawQuote  = q[tkr] || null;
      livePrice = rawQuote?.price > 0 ? rawQuote.price : rawQuote?.prevClose || null;
    } catch {}

    const history = uid ? await loadTickerHistory(uid, tkr, livePrice) : '';
    const ctx     = await loadAgentContext(tkr, rawQuote);
    const profiles = uid ? await loadAllAgentProfiles(uid, AGENTS.map(a => a.id)) : {};

    // Background research refresh
    if (uid) {
      AGENTS.forEach(ag => {
        const profile = profiles[ag.id];
        const stale = !profile?.lastResearch?.searchedAt ||
          Date.now() - new Date(profile.lastResearch.searchedAt).getTime() > 4 * 60 * 60 * 1000;
        if (stale) {
          refreshAgentResearch(uid, ag.id, ag.researchPrompt, callAgent)
            .then(content => {
              if (content) profiles[ag.id] = { ...profiles[ag.id], lastResearch: { content, searchedAt: new Date().toISOString() } };
            });
        }
      });
    }

    const priceNote   = livePrice ? ` Price: $${livePrice.toFixed(2)}.` : '';
    const baseContent = `Ticker: ${tkr}. Investor considering BUYING.${priceNote} ${acctLine} Today: ${new Date().toDateString()}.${history}`;

    // 3-round council (compact for chat — show only final stances)
    const allRounds = [];

    const summariseRound = (r, idx) => {
      const s = AGENTS.map(ag => { const res = r[ag.id] || {}; return `${ag.name}: ${res.stance || '?'} — ${res.headline || ''}`; }).join('\n');
      return `=== ROUND ${idx + 1} ===\n${s}`;
    };

    for (let round = 0; round < 3; round++) {
      const roundResults = {};
      const priorRoundsContext = allRounds.map((r, i) => summariseRound(r, i)).join('\n\n');

      for (let i = 0; i < AGENTS.length; i++) {
        const ag = AGENTS[i];
        const profile = profiles[ag.id] || null;
        const extra = buildAgentContext(ag.id, ctx, profile);
        const profileCtx = buildProfileContext(profile);
        const currentRoundSoFar = Object.entries(roundResults)
          .map(([id, r]) => { const a = AGENTS.find(x => x.id === id); return `${a.name}: ${r.stance || '?'} — ${r.headline || ''}`; })
          .join('\n');

        let roundPromptSuffix = '';
        if (round === 0) {
          roundPromptSuffix = currentRoundSoFar ? `\n\nEARLIER IN THIS ROUND:\n${currentRoundSoFar}\n\nDeliver your independent analysis.` : '';
        } else if (round === 1) {
          roundPromptSuffix = `\n\nCOUNCIL ROUND 1 SUMMARY:\n${priorRoundsContext}\n\nEARLIER IN ROUND 2:\n${currentRoundSoFar || 'None yet.'}\n\nRevise if needed. Add "rebuttal" field. Return updated JSON.`;
        } else {
          roundPromptSuffix = `\n\nCOUNCIL ROUNDS 1-2 SUMMARY:\n${priorRoundsContext}\n\nEARLIER IN ROUND 3:\n${currentRoundSoFar || 'None yet.'}\n\nFinal position. Add "finalNote" if changing stance. Return JSON.`;
        }

        const userMsg = baseContent + extra + profileCtx + roundPromptSuffix + ' Return ONLY the JSON.';
        try {
          const txt = await callAgent(ag.system, userMsg, ag.search, 500);
          roundResults[ag.id] = extractJSON(txt) || { stance: 'CAUTION', score: 5, headline: 'Could not parse', points: [] };
        } catch {
          roundResults[ag.id] = { stance: 'CAUTION', score: 5, headline: 'Error', points: [] };
          flagApiDown();
        }

        // Update council message with latest stances
        setChat(p => p.map(m => {
          if (m.runId !== runId) return m;
          const updatedAgents = { ...m.agents, [ag.id]: roundResults[ag.id]?.stance };
          return { ...m, agents: updatedAgents };
        }));

        if (!(round === 2 && i === AGENTS.length - 1)) await sleep(1500);
      }
      allRounds.push(roundResults);
    }

    // Synthesis
    const fullCouncilContext = allRounds.map((r, i) =>
      `=== ROUND ${i + 1} ===\n` + AGENTS.map(ag => `${ag.name} (${ag.role}): ${JSON.stringify(r[ag.id])}`).join('\n')
    ).join('\n\n');

    const synthSys = `You are AXIOM, chair of THE COUNCIL, delivering the final ruling on ${tkr} for ${acct.label}. ${PROTOCOLS}
The council ran 3 deliberation rounds. Synthesize into a decisive verdict. Speak the ruling conversationally (2-4 sentences).
Return ONLY JSON: {"speak":"<ruling text>","verdict":"BUY"|"WATCH"|"PASS","conviction":<0-10>,"stopLoss":"<price>","takeProfit":"<price>"}`;

    let synth;
    try {
      const txt = await callAgent(synthSys, `Full council deliberation:\n${fullCouncilContext}\n${livePrice ? `Live price: $${livePrice.toFixed(2)}.` : ''} Deliver the ruling.`, false, 400);
      synth = extractJSON(txt) || { speak: 'The council is split — I\'d hold off.', verdict: 'WATCH', conviction: 5 };
    } catch {
      synth = { speak: 'Could not finalize the ruling.', verdict: 'WATCH', conviction: 5 };
      flagApiDown();
    }

    // Save ruling
    if (uid && synth.verdict) {
      const agentStances = {};
      AGENTS.forEach(ag => { agentStances[ag.id] = { stance: allRounds[2]?.[ag.id]?.stance || allRounds[0]?.[ag.id]?.stance || '?' }; });
      addDoc(collection(db, 'users', uid, 'rulings'), {
        ticker: tkr, account,
        date: new Date().toISOString().slice(0, 10),
        ts: serverTimestamp(), priceAtCall: livePrice,
        agentStances,
        verdict: synth.verdict, conviction: synth.conviction ?? null,
        stopLoss: parseFloat(synth.stopLoss) || null,
        takeProfit: parseFloat(synth.takeProfit) || null,
        summary: synth.speak || '',
        outcomeCheckedAt: null, priceAt30d: null, outcome: null,
      }).catch(e => console.error('Failed to save ruling:', e));
    }

    // Update council message with synth result
    setChat(p => p.map(m => m.runId === runId ? { ...m, synth } : m));
    setChat(p => [...p, { role: 'pm', text: synth.speak, verdict: synth.verdict, conviction: synth.conviction, ticker: tkr }]);
    speak(synth.speak);

    setConvHistory(prev => [
      ...prev,
      { role: 'assistant', agentId: 'pm', content: synth.speak }
    ]);
  }

  async function sendChat(raw) {
    const text = (typeof raw === 'string' ? raw : chatInput).trim();
    if (!text || chatBusy) return;
    setChatInput(''); stopSpeaking();

    setChat(p => [...p, { role:'user', text }]);
    setConvHistory(prev => [...prev, { role:'user', content: text }]);
    setChatBusy(true);

    const uid = auth.currentUser?.uid;
    const acctLine = `Account: ${acct.label} (${acct.sub}). Holdings: ${positionsLine}. DCA: ${acct.dcaNote}.`;
    const historyBlock = buildHistoryBlock(convHistory);

    // === COUNCIL mode: send to all 6 agents simultaneously ===
    if (activeAgent === 'council') {
      setChat(p => [...p, { role: 'roundtable', agents: [] }]);
      const responses = [];

      const settled = await Promise.allSettled(
        AGENTS.map(async (ag, idx) => {
          await sleep(idx * 500); // slight stagger
          const sys = ag.conversationalPrompt + historyBlock;
          const txt = await callAgent(sys, text, false, 400);
          return { ag, txt };
        })
      );

      settled.forEach(res => {
        if (res.status === 'fulfilled') {
          const { ag, txt } = res.value;
          responses.push({ agentId: ag.id, name: ag.name, emoji: ag.emoji, color: ag.color, accent: ag.accent, content: txt });
        }
      });

      setChat(p => {
        const updated = [...p];
        // Replace the roundtable placeholder with real responses
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].role === 'roundtable') {
            updated[i] = { role: 'roundtable', agents: responses };
            break;
          }
        }
        return updated;
      });

      responses.forEach(r => {
        setConvHistory(prev => [...prev, { role: 'assistant', agentId: r.agentId, content: r.content }]);
      });

      setChatBusy(false);
      return;
    }

    // === DIRECT AGENT mode ===
    if (activeAgent !== 'pm') {
      const ag = AGENTS.find(a => a.id === activeAgent);
      if (ag) {
        const sys = ag.conversationalPrompt + historyBlock;
        let response;
        try {
          response = await callAgent(sys, text, false, 400);
        } catch {
          flagApiDown();
          response = 'I\'m having trouble connecting right now.';
        }
        setChat(p => [...p, { role: 'agent', agentId: ag.id, name: ag.name, emoji: ag.emoji, color: ag.color, accent: ag.accent, text: response }]);
        setConvHistory(prev => [...prev, { role: 'assistant', agentId: ag.id, content: response }]);
        setChatBusy(false);
        return;
      }
    }

    // === AXIOM (PM) mode ===
    const axiomSys = `You are AXIOM, chair of THE COUNCIL — an elite private investment analysis team. You are direct, sharp, decisive, and genuinely knowledgeable about markets. ${PROTOCOLS}
CRITICAL: Only convene the full council (convene=true) when the investor specifically asks for a BUY/SELL/HOLD/ANALYSIS decision on a named ticker.
For ALL other questions — market conditions, portfolio strategy, macro discussion, greetings, or general questions — answer directly and intelligently yourself (convene=false).
You are NOT a router. You are a seasoned portfolio manager who happens to have a full research team available.
Today: ${new Date().toDateString()}. ${historyBlock}
Respond ONLY with JSON in a \`\`\`json block: {"speak":"<your response>","convene":<true|false>,"ticker":"<TICKER or null>"}`;

    let router;
    try {
      const txt = await callAgent(axiomSys, `Investor: "${text}". ${acctLine} Return ONLY the JSON.`, false);
      router = extractJSON(txt) || { speak: "I didn't quite catch that.", convene: false, ticker: null };
    } catch {
      flagApiDown();
      router = { speak: "I can't reach the council right now.", convene: false, ticker: null };
    }

    if (router.convene && router.ticker) {
      const tkr = String(router.ticker).toUpperCase();
      const intro = router.speak || `Convening the full council on ${tkr}.`;
      setChat(p => [...p, { role:'pm', text:intro }]);
      speak(intro);
      setConvHistory(prev => [...prev, { role: 'assistant', agentId: 'pm', content: intro }]);
      await runCouncilInChat(tkr, acctLine, uid, intro);
    } else {
      setChat(p => [...p, { role:'pm', text:router.speak }]);
      speak(router.speak);
      setConvHistory(prev => [...prev, { role: 'assistant', agentId: 'pm', content: router.speak }]);
    }

    setChatBusy(false);
  }

  const agentChipStyle = (chip) => ({
    fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '5px 10px', borderRadius: 20,
    border: `1px solid ${activeAgent === chip.id ? chip.color : T.border}`,
    background: activeAgent === chip.id ? `${chip.color}18` : 'transparent',
    color: activeAgent === chip.id ? chip.color : T.text2,
    cursor: 'pointer', fontSize: 11, fontWeight: activeAgent === chip.id ? 600 : 400,
    transition: 'all .15s ease', whiteSpace: 'nowrap',
  });

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <MessageSquare size={16} style={{ color:T.text }} />
          <span style={{ ...DISP, fontSize:14, fontWeight:600, letterSpacing:'0.04em', color:T.text }}>THE COUNCIL · {acct.label.toUpperCase()}</span>
        </div>
        <button onClick={toggleVoice}
          style={{ fontFamily:'inherit', display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, border:`1px solid ${voiceOn ? T.text : T.border}`, background:T.bg, color: voiceOn ? T.text : T.text2, cursor:'pointer', fontSize:11 }}>
          {voiceOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
          <span style={MONO}>{voiceOn ? 'VOICE ON' : 'MUTED'}</span>
        </button>
      </div>

      {/* Agent selector chips */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10, overflowX:'auto' }}>
        {AGENT_CHIPS.map(chip => (
          <button key={chip.id} onClick={() => setActiveAgent(chip.id)} disabled={chatBusy}
            style={agentChipStyle(chip)}>
            <span>{chip.emoji}</span>
            <span style={MONO}>{chip.label}</span>
          </button>
        ))}
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
              const vs = m.verdict ? (PS[m.verdict === 'PASS' ? 'PASS_FINAL' : m.verdict] || null) : null;
              return (
                <div key={i} style={{ display:'flex', justifyContent:'flex-start', gap:10, animation:'slideInLeft .22s ease both' }}>
                  <div style={{ flexShrink:0, marginTop:2 }}><ArcReactor size={26} /></div>
                  <div style={{ maxWidth:'82%' }}>
                    <div style={{ ...MONO, fontSize:8, color:'#38e0d4', marginBottom:4, letterSpacing:'0.08em' }}>AXIOM</div>
                    <div style={{ background: dark ? '#2C2C2E' : '#F0F0F0', color:T.text, borderRadius:'16px 16px 16px 4px', padding:'10px 14px', fontSize:13, lineHeight:1.55 }}>
                      {speaking && i === chat.length - 1 && voiceOn && (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4, marginRight:6, verticalAlign:'middle' }}>
                          <span className="blink" style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:T.text }} />
                        </span>
                      )}
                      {m.text}
                    </div>
                    {vs && (
                      <div style={{ marginTop:6, display:'inline-flex', alignItems:'center', gap:8 }}>
                        <span style={{ ...MONO, background:vs.bg, color:vs.fg, fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6 }}>{vs.label}</span>
                        <span style={{ ...MONO, fontSize:9, color:T.text3 }}>{m.conviction}/10 · {m.ticker || ''}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            // Direct agent response
            if (m.role === 'agent') {
              return (
                <div key={i} style={{ display:'flex', justifyContent:'flex-start', gap:10, animation:'slideInLeft .22s ease both' }}>
                  <div style={{ flexShrink:0, marginTop:2, width:26, height:26, borderRadius:8, background:`${m.accent}18`, border:`1px solid ${m.accent}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>{m.emoji}</div>
                  <div style={{ maxWidth:'82%' }}>
                    <div style={{ ...MONO, fontSize:8, color:m.color, marginBottom:4, letterSpacing:'0.08em' }}>{m.name}</div>
                    <div style={{ background: dark ? '#2C2C2E' : '#F0F0F0', color:T.text, borderRadius:'16px 16px 16px 4px', padding:'10px 14px', fontSize:13, lineHeight:1.55 }}>{m.text}</div>
                  </div>
                </div>
              );
            }

            // Roundtable: all agents respond
            if (m.role === 'roundtable') {
              if (!m.agents || m.agents.length === 0) {
                return (
                  <div key={i} style={{ display:'flex', justifyContent:'flex-start', gap:10, animation:'fadeUp .3s ease both' }}>
                    <div style={{ flexShrink:0, width:26 }} />
                    <div style={{ background: dark ? '#1C1C1E' : '#F7F7F7', border:`1px solid ${T.border}`, borderRadius:10, padding:12 }}>
                      <div style={{ ...MONO, fontSize:9, color:T.text3, marginBottom:6 }}>ROUNDTABLE — all agents responding…</div>
                      <Loader2 size={13} className="animate-spin" style={{ color:T.text3 }} />
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} style={{ display:'flex', flexDirection:'column', gap:8, animation:'fadeUp .3s ease both' }}>
                  {m.agents.map((ag, j) => (
                    <div key={j} style={{ display:'flex', justifyContent:'flex-start', gap:10 }}>
                      <div style={{ flexShrink:0, marginTop:2, width:26, height:26, borderRadius:8, background:`${ag.accent}18`, border:`1px solid ${ag.accent}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>{ag.emoji}</div>
                      <div style={{ maxWidth:'82%' }}>
                        <div style={{ ...MONO, fontSize:8, color:ag.color, marginBottom:4, letterSpacing:'0.08em' }}>{ag.name}</div>
                        <div style={{ background: dark ? '#2C2C2E' : '#F0F0F0', color:T.text, borderRadius:'16px 16px 16px 4px', padding:'10px 14px', fontSize:13, lineHeight:1.55 }}>{ag.content}</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            }

            // Council session card
            if (m.role === 'council') {
              const finalStances = m.agents || {};
              return (
                <div key={i} style={{ display:'flex', justifyContent:'flex-start', gap:10, animation:'fadeUp .3s ease both' }}>
                  <div style={{ flexShrink:0, width:26, paddingTop:2 }}>
                    <Crown size={16} style={{ color:'#F59E0B', opacity:0.7 }} />
                  </div>
                  <div style={{ maxWidth:'92%', width:'100%', background: dark ? '#1C1C1E' : '#F7F7F7', border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 12px' }}>
                    <div style={{ ...MONO, fontSize:9, color:'#F59E0B', letterSpacing:'0.08em', marginBottom:8 }}>
                      COUNCIL SESSION · {m.ticker} · 3-ROUND DELIBERATION
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5 }}>
                      {AGENTS.map(ag => {
                        const stance = finalStances[ag.id];
                        const ss = stance ? (PS[stance] || null) : null;
                        return (
                          <div key={ag.id} style={{ display:'flex', alignItems:'center', gap:6, background:T.bg, border:`1px solid ${stance ? ag.accent + '30' : T.border}`, borderRadius:8, padding:'5px 8px' }}>
                            <span style={{ fontSize:11 }}>{ag.emoji}</span>
                            <span style={{ ...MONO, fontSize:9, color:T.text2, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ag.name}</span>
                            {stance
                              ? <span style={{ ...MONO, fontSize:8, fontWeight:700, color: ss ? ss.fg : T.text2 }}>{ss ? ss.label : stance}</span>
                              : <Loader2 size={10} className="animate-spin" style={{ color:T.text3 }} />}
                          </div>
                        );
                      })}
                    </div>
                    {m.synth && (
                      <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${T.border}` }}>
                        {(() => {
                          const vs = m.synth.verdict ? (PS[m.synth.verdict === 'PASS' ? 'PASS_FINAL' : m.synth.verdict] || null) : null;
                          return vs ? (
                            <span style={{ ...MONO, background:vs.bg, color:vs.fg, fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6 }}>
                              {vs.label} · {m.synth.conviction}/10
                            </span>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

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
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendChat()}
            disabled={chatBusy}
            placeholder={
              listening ? 'Listening…' :
              activeAgent === 'pm' ? 'Ask AXIOM anything…' :
              activeAgent === 'council' ? 'Ask the full roundtable…' :
              `Ask ${AGENTS.find(a => a.id === activeAgent)?.name || activeAgent}…`
            }
            style={{ ...MONO, flex:1, background:T.input, border:`1px solid ${T.inputBorder}`, borderRadius:12, padding:'12px 16px', fontSize:14, color:T.text, outline:'none' }}
          />
          <button onClick={() => sendChat()} disabled={chatBusy || !chatInput.trim()}
            style={{ flexShrink:0, width:44, height:44, borderRadius:10, background: chatBusy || !chatInput.trim() ? T.btnDisabled : '#000000', color: chatBusy || !chatInput.trim() ? T.btnDisabledText : '#FFFFFF', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor: chatBusy || !chatInput.trim() ? 'not-allowed' : 'pointer', transition:'all .15s ease' }}>
            <Send size={17} />
          </button>
        </div>
      </div>

      <div style={{ marginTop:8, display:'flex', flexWrap:'wrap', gap:6 }}>
        {['How does CRDO look?','What\'s the macro picture?','Analyse NVDA for me'].map(q => (
          <button key={q} onClick={() => sendChat(q)} disabled={chatBusy}
            style={{ ...MONO, fontSize:10, padding:'6px 12px', borderRadius:20, border:`1px solid ${T.border}`, color:T.text2, background:'none', cursor:'pointer', transition:'all .15s ease' }}>{q}</button>
        ))}
      </div>
      <p style={{ ...MONO, marginTop:8, fontSize:10, color:T.text3 }}>
        {srSupported ? 'Tap the mic to talk, or type. ' : 'Voice input needs Chrome. '}
        Select an agent chip to talk directly — or use COUNCIL for a roundtable.
      </p>
    </div>
  );
}
