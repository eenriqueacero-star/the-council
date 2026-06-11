import React, { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX, Loader2, Mic, MicOff, Send, Search, Trash2 } from 'lucide-react';
import { MONO, SANS } from '../constants/styles.js';
import { AGENTS, PROTOCOLS, STANCE_STYLE } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent, getQuotes } from '../api.js';
import { useVoice } from '../hooks/useVoice.js';
import { notifyDevices } from '../push.js';
import ArcReactor from './ArcReactor.jsx';
import { db, auth } from '../firebase.js';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { loadAgentContext, buildAgentContext } from '../utils/agentContext.js';
import { loadTickerHistory } from '../utils/rulingContext.js';

export default function ChatTab({ account, acct, positionsLine, flagApiDown }) {
  const GREETING = `Good to see you, sir. The council stands ready. Ask me how a holding looks, or say "should I buy —" and I'll convene the agents.`;

  const [chat,       setChat]       = useState([{ role: 'pm', text: GREETING }]);
  const [chatInput,  setChatInput]  = useState('');
  const [chatBusy,   setChatBusy]   = useState(false);
  const [liveSearch, setLiveSearch] = useState(false);
  const chatEndRef        = useRef(null);
  const loadCancelRef     = useRef(false);
  const prevChatLenRef    = useRef(0);

  const { voiceOn, listening, speaking, srSupported, speak, stopSpeaking, toggleVoice, toggleListen } = useVoice();

  function firestoreRef(acct) {
    const uid = auth.currentUser?.uid;
    if (!uid) return null;
    return doc(db, 'users', uid, 'chat', acct);
  }

  useEffect(() => {
    setChat([{ role: 'pm', text: GREETING }]);
    loadCancelRef.current = false;
    const ref = firestoreRef(account);
    if (ref) {
      getDoc(ref).then(snap => {
        if (loadCancelRef.current) return;
        if (snap.exists()) {
          const msgs = snap.data().messages;
          if (Array.isArray(msgs) && msgs.length) { setChat(msgs); return; }
        }
        loadLocal();
      }).catch(() => { if (!loadCancelRef.current) loadLocal(); });
    } else { loadLocal(); }
    function loadLocal() {
      try { const s = localStorage.getItem(`council_chat_${account}`); if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length) { setChat(p); return; } } } catch {}
      setChat([{ role: 'pm', text: GREETING }]);
    }
    return () => { loadCancelRef.current = true; };
  }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  function saveChat() {
    setChat(current => {
      const msgs = current.slice(-120);
      const ref  = firestoreRef(account);
      if (ref) setDoc(ref, { messages: msgs, updatedAt: Date.now() }).catch(() => {});
      try { localStorage.setItem(`council_chat_${account}`, JSON.stringify(msgs)); } catch {}
      return current;
    });
  }

  function clearHistory() {
    const reset = [{ role: 'pm', text: GREETING }];
    setChat(reset);
    const ref = firestoreRef(account);
    if (ref) setDoc(ref, { messages: reset, updatedAt: Date.now() }).catch(() => {});
    try { localStorage.removeItem(`council_chat_${account}`); } catch {}
  }

  useEffect(() => {
    if (chat.length > prevChatLenRef.current) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    prevChatLenRef.current = chat.length;
  }, [chat]);

  const pmSys = `You are the PORTFOLIO MANAGER, head of THE COUNCIL - a JARVIS-style AI investing assistant. ${PROTOCOLS}
Tone: sharp, confident, decisive, lightly British-butler; address the investor as "sir" occasionally. The investor plays to WIN — be aggressive and action-oriented.
DECIDE — pick exactly one branch:
- SPECIFIC TICKER named (buy, review, add, "should I", "how does X look"): set convene=true, ticker=that symbol, agent=null.
- RECOMMENDATION REQUEST ("what should I buy", "any ideas"): pick the SINGLE best ticker NOT in portfolio, set convene=true, ticker=that symbol.
- DOMAIN QUESTION (macro, rates, sector news, market technicals): route to ONE specialist — set convene=false, ticker=null, agent=one of "macro"|"technical"|"risk"|"bear"|"catalyst".
- GENERAL CHAT: answer directly; set convene=false, ticker=null, agent=null.
CRITICAL: convene=true requires a real ticker. Never set convene=true with ticker=null.
Respond ONLY with JSON in a \`\`\`json block: {"speak":"<1-3 sentence reply>","convene":<true|false>,"ticker":"<TICKER or null>","agent":"<agentId or null>"}`;

  function errMessage(e) {
    const code = (e?.message||'').match(/ERR-[\w]+/)?.[0] || 'ERR-NET';
    return code === 'ERR-401' ? `[${code}] Session expired — refresh.`
         : code === 'ERR-429' ? `[${code}] Rate limit — wait 30 seconds.`
         : code === 'ERR-CFG' ? `[${code}] Server misconfiguration.`
         : `[${code}] Check your connection.`;
  }

  async function sendChat(raw) {
    const text = (typeof raw === 'string' ? raw : chatInput).trim();
    if (!text || chatBusy) return;
    loadCancelRef.current = true;
    setChatInput(''); stopSpeaking();
    setChat(p => [...p, { role: 'user', text }]);
    saveChat();
    setChatBusy(true);

    try {
      const acctLine  = `Active account: ${acct.label}'s (${acct.sub}); current positions: ${positionsLine}; DCA ${acct.dcaNote}.`;
      const recentCtx = chat.filter(m => (m.role === 'user' || m.role === 'pm') && m.text).slice(-6)
        .map(m => `${m.role === 'user' ? 'INVESTOR' : 'PM'}: ${m.text}`).join('\n');
      let router;
      try {
        const routerPrompt = recentCtx
          ? `RECENT CONVERSATION:\n${recentCtx}\n\nInvestor says: "${text}". Today is ${new Date().toDateString()}. ${acctLine} Return ONLY the JSON.`
          : `Investor says: "${text}". Today is ${new Date().toDateString()}. ${acctLine} Return ONLY the JSON.`;
        const txt = await callAgent(pmSys, routerPrompt, false);
        router = extractJSON(txt) || { speak: "Apologies sir, I didn't quite catch that.", convene: false, ticker: null };
      } catch (e) { flagApiDown(); router = { speak: errMessage(e), convene: false, ticker: null }; }

      if (router.convene && !router.ticker) {
        const msg = router.speak || 'Which ticker should I run the council on, sir?';
        setChat(p => [...p, { role: 'pm', text: msg }]); speak(msg); saveChat(); return;
      }

      if (!router.convene && router.agent) {
        const ag = AGENTS.find(a => a.id === router.agent);
        if (!ag) { setChat(p => [...p, { role: 'pm', text: router.speak }]); speak(router.speak); }
        else {
          const intro = router.speak || `Consulting ${ag.name}, sir.`;
          setChat(p => [...p, { role: 'pm', text: intro }]); speak(intro);
          const runId = Date.now();
          setChat(p => [...p, { role: 'agent-call', runId, agentId: ag.id, done: false }]);
          const agentContent = `STANDALONE QUESTION — no ticker context. The investor asks: "${text}". Today is ${new Date().toDateString()}. ${acctLine} Answer directly. Return ONLY the JSON.`;
          try {
            const txt = await callAgent(ag.system, agentContent, ag.search && liveSearch);
            const pr  = extractJSON(txt) || { stance: 'CAUTION', headline: 'No data available', points: [] };
            setChat(p => p.map(m => m.runId === runId ? { ...m, result: pr, done: true } : m));
          } catch {
            flagApiDown();
            setChat(p => p.map(m => m.runId === runId ? { ...m, result: { stance: 'CAUTION', headline: 'Agent unavailable', points: [] }, done: true } : m));
          }
          saveChat();
        }
      } else if (router.convene && router.ticker) {
        const tkr = String(router.ticker).toUpperCase();
        const uid = auth.currentUser?.uid;
        const intro = router.speak || `Consulting the council on ${tkr}, sir.`;
        setChat(p => [...p, { role: 'pm', text: intro }]); speak(intro);
        const runId = Date.now();
        setChat(p => [...p, { role: 'council', runId, ticker: tkr, agents: {}, debateRound: 1 }]);
        saveChat();

        let chatCurrentPrice = null, chatRawQuote = null, priceLine = '';
        try {
          const quotes = await getQuotes([tkr]);
          chatRawQuote     = quotes[tkr];
          chatCurrentPrice = (chatRawQuote?.price && chatRawQuote.price > 0) ? chatRawQuote.price : chatRawQuote?.prevClose;
          if (chatCurrentPrice) priceLine = `CURRENT LIVE PRICE: $${chatCurrentPrice.toFixed(2)} (real-time quote — use this for ALL price levels). `;
        } catch {}

        const [chatAgentCtx, tickerHistory] = await Promise.all([
          loadAgentContext(tkr, chatRawQuote),
          uid ? loadTickerHistory(uid, tkr, chatCurrentPrice) : Promise.resolve(''),
        ]);

        const baseContent = `Ticker: ${tkr}. ${priceLine}The investor is considering BUYING it. ${acctLine} Today is ${new Date().toDateString()}. Return ONLY the JSON.${tickerHistory}`;
        const allRounds   = [];

        for (let round = 0; round < 2; round++) {
          const isFirst = round === 0;
          if (!isFirst) setChat(p => p.map(m => m.runId === runId ? { ...m, debateRound: round+1, agents: {} } : m));

          let debateCtx = '';
          if (!isFirst) {
            const prev = allRounds[round-1];
            const prevLines = AGENTS.map(a => { const r = prev[a.id]; return (!r) ? `${a.name}: no response` : `${a.name} (${r.stance}): "${r.headline||''}"` }).join('\n');
            debateCtx = `\n\nROUND ${round} COUNCIL POSITIONS:\n${prevLines}\n\nThe council is working toward a unanimous decision. Rebut opposing points with hard evidence. Return the same JSON format.`;
          }

          const userContent = baseContent + debateCtx;
          const roundResults = {};
          for (let i = 0; i < AGENTS.length; i++) {
            const ag = AGENTS[i];
            const ctxSuffix = isFirst ? buildAgentContext(ag.id, chatAgentCtx) : '';
            try {
              const txt = await callAgent(ag.system, userContent + ctxSuffix, ag.search && liveSearch && isFirst);
              const pr  = extractJSON(txt);
              roundResults[ag.id] = pr || { stance: 'CAUTION' };
            } catch { flagApiDown(); roundResults[ag.id] = { stance: 'CAUTION' }; }
            setChat(p => p.map(m => m.runId === runId ? { ...m, agents: { ...m.agents, [ag.id]: roundResults[ag.id] } } : m));
            if (i < AGENTS.length - 1) await new Promise(r => setTimeout(r, 3000));
          }
          allRounds.push(roundResults);
          saveChat();

          const stances = AGENTS.map(a => roundResults[a.id]?.stance).filter(Boolean);
          const hasBull = stances.some(s => ['PASS','BUY'].includes(s));
          const hasBear = stances.some(s => ['FAIL','BEARISH'].includes(s));
          if (!(hasBull && hasBear)) break;
          if (round < 1) {
            const SECS = 60;
            for (let s = SECS-1; s >= 0; s--) {
              setChat(p => p.map(m => m.runId === runId ? { ...m, cooldown: s } : m));
              if (s > 0) await new Promise(r => setTimeout(r, 1000));
            }
          }
        }

        const council   = allRounds.map((r,i) => `Round ${i+1}: ${AGENTS.map(ag => { const res = r[ag.id]; return `${ag.name}: ${res?.stance||'no response'} — "${res?.headline||''}"` }).join(' | ')}`).join('\n');
        const roundWord = allRounds.length === 1 ? 'analysis' : `${allRounds.length} rounds of debate`;
        const synthSys  = `You are the PM concluding the council on ${tkr} for ${acct.label} after ${roundWord}. ${PROTOCOLS}\nInvestor is AGGRESSIVE. Be bold. Speak the ruling conversationally (JARVIS tone, 2-4 sentences): verdict, conviction/10, key factor. If BUY: state entry zone, stop, take profit, invalidation in one crisp line.\nthen followUp: one short natural question or suggestion.\nRespond ONLY with JSON: {"speak":"<ruling>","verdict":"BUY"|"WATCH"|"PASS","conviction":<0-10>,"followUp":"<one sentence>"}`;
        let synth;
        try {
          const txt = await callAgent(synthSys, `Council ${roundWord} for ${tkr}:\n${council}\n\n${priceLine}Deliver the ruling. Return ONLY the JSON.`, false, 900);
          synth = extractJSON(txt) || { speak: 'The council is split, sir — I\'d hold off for now.', verdict: 'WATCH', conviction: 5, followUp: null };
        } catch (e) { flagApiDown(); synth = { speak: errMessage(e), verdict: 'WATCH', conviction: 5, followUp: null }; }

        setChat(p => [...p, { role: 'pm', text: synth.speak, verdict: synth.verdict, conviction: synth.conviction, ticker: tkr }]);
        speak(synth.speak);
        notifyDevices(`${tkr}: ${synth.verdict} · ${synth.conviction}/10`, synth.speak);

        if (uid) {
          const lastRound = allRounds[allRounds.length - 1];
          if (lastRound) {
            const agentStances = {};
            AGENTS.forEach(a => { const r = lastRound[a.id]; if (r) agentStances[a.id] = { stance: r.stance||null, score: r.score??null, headline: r.headline||null }; });
            addDoc(collection(db,'users',uid,'rulings'), {
              ticker: tkr, account, date: new Date().toISOString().split('T')[0],
              ts: serverTimestamp(), priceAtCall: chatCurrentPrice||null, agentStances,
              verdict: synth.verdict, conviction: synth.conviction,
              entry: null, stopLoss: null, takeProfit: null, summary: synth.speak||null,
              outcomeCheckedAt: null, priceAt30d: null, outcome: null,
            }).catch(()=>{});
          }
        }
        if (synth.followUp) {
          await new Promise(r => setTimeout(r, 1000));
          setChat(p => [...p, { role: 'pm', text: synth.followUp }]);
          speak(synth.followUp);
        }
      } else {
        setChat(p => [...p, { role: 'pm', text: router.speak }]);
        speak(router.speak);
      }
      saveChat();
    } finally { setChatBusy(false); }
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>PM Chat · {acct.label}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setLiveSearch(v => !v)} title={liveSearch ? 'Live search on' : 'Live search off'}
            style={{ background: liveSearch ? '#000000' : '#F0F0F0', color: liveSearch ? '#FFFFFF' : '#757575', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Search size={14} />
          </button>
          <button onClick={toggleVoice} title={voiceOn ? 'Voice on' : 'Voice off'}
            style={{ background: voiceOn ? '#000000' : '#F0F0F0', color: voiceOn ? '#FFFFFF' : '#757575', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            {voiceOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button onClick={clearHistory} disabled={chatBusy}
            style={{ background: '#F0F0F0', color: '#757575', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: chatBusy ? 'not-allowed' : 'pointer', opacity: chatBusy ? 0.5 : 1 }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Chat window */}
      <div style={{ border: '1px solid #EEEEEE', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'min(60vh, 560px)', background: '#FFFFFF' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 10 }} className="no-scrollbar">
          {chat.map((m, i) => {
            if (m.role === 'user') return (
              <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ maxWidth: '80%', background: '#000000', color: '#FFFFFF', borderRadius: '18px 18px 4px 18px', padding: '10px 14px', fontSize: 14, lineHeight: 1.45 }}>{m.text}</div>
              </div>
            );
            if (m.role === 'pm') {
              const vs = m.verdict ? STANCE_STYLE[m.verdict === 'PASS' ? 'PASS_FINAL' : m.verdict] : null;
              return (
                <div key={i} className="fade-in" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flexShrink: 0, marginTop: 2 }}><ArcReactor size={24} /></div>
                  <div style={{ maxWidth: '80%' }}>
                    <div style={{ background: '#F0F0F0', color: '#000000', borderRadius: '4px 18px 18px 18px', padding: '10px 14px', fontSize: 14, lineHeight: 1.45 }}>
                      {speaking && i === chat.length - 1 && voiceOn && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#000000', marginRight: 6, verticalAlign: 'middle' }} />}
                      {m.text}
                    </div>
                    {vs && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                        <span style={{ ...MONO, background: vs.bg, color: vs.fg, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>{vs.label}</span>
                        <span style={{ ...MONO, fontSize: 9, color: '#AAAAAA' }}>{m.conviction}/10 · {m.ticker||''}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            if (m.role === 'agent-call') {
              const ag = AGENTS.find(a => a.id === m.agentId);
              if (!ag) return null;
              const result = m.result;
              const ss = result?.stance ? STANCE_STYLE[result.stance] : null;
              const points = result?.points || result?.bullets || [];
              return (
                <div key={i} className="fade-in" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ width: 24, flexShrink: 0 }} />
                  <div style={{ maxWidth: '88%', width: '100%', background: '#F7F7F7', border: `1px solid #EEEEEE`, borderRadius: 12, borderLeft: `3px solid ${ag.accent}`, padding: '10px 12px' }}>
                    <div style={{ ...MONO, fontSize: 9, letterSpacing: '0.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ag.icon size={9} style={{ color: ag.accent }} />
                      {m.done ? <span style={{ color: ag.accent }}>{ag.name.toUpperCase()}</span> : <span style={{ color: ag.accent, opacity: 0.7 }}>WAKING UP {ag.name.split(' ')[0].toUpperCase()}…</span>}
                    </div>
                    {!m.done ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={11} className="animate-spin" style={{ color: ag.accent }} /><span style={{ fontSize: 11, color: '#AAAAAA' }}>Consulting…</span></div>
                    ) : (
                      <>
                        {ss && <span style={{ ...MONO, color: ss.fg, fontSize: 8, fontWeight: 700, display: 'block', marginBottom: 4 }}>{ss.label}</span>}
                        {result?.headline && <p style={{ fontSize: 12, fontWeight: 500, color: ag.accent, margin: '0 0 5px', lineHeight: 1.35 }}>{result.headline}</p>}
                        {points.length > 0 && (
                          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {points.map((b,bi) => <li key={bi} style={{ display: 'flex', gap: 6, fontSize: 11, color: '#555555', lineHeight: 1.4 }}><span style={{ color: ag.accent, flexShrink: 0 }}>·</span><span>{b}</span></li>)}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            }
            if (m.role === 'council') return (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ width: 24, flexShrink: 0 }} />
                <div style={{ maxWidth: '88%', width: '100%', background: '#F7F7F7', border: '1px solid #EEEEEE', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ ...MONO, fontSize: 9, color: '#AAAAAA', letterSpacing: '0.08em', marginBottom: 8 }}>
                    {m.cooldown > 0
                      ? <span style={{ color: '#F59E0B' }}>RATE LIMIT COOLDOWN · {m.cooldown}s · ROUND 2 INCOMING</span>
                      : m.debateRound > 1 ? `ROUND ${m.debateRound} · REBUTTAL · ${m.ticker}` : `CONSULTING THE COUNCIL · ${m.ticker}`}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {AGENTS.map(ag => {
                      const result = m.agents[ag.id];
                      const stance = result?.stance;
                      const ss     = stance ? STANCE_STYLE[stance] : null;
                      const bullets = result?.points || result?.bullets || [];
                      return (
                        <div key={ag.id} style={{ background: '#FFFFFF', border: `1px solid ${stance ? ag.accent + '22' : '#EEEEEE'}`, borderRadius: 8, padding: '7px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <ag.icon size={11} style={{ color: ag.accent }} />
                            <span style={{ ...MONO, fontSize: 9, color: '#757575', flex: 1 }}>{ag.name.split(' ')[0].toUpperCase()}</span>
                            {stance ? <span style={{ ...MONO, color: ss?ss.fg:'#000', fontSize: 8, fontWeight: 700 }}>{ss?ss.label:stance}</span>
                                    : <Loader2 size={9} className="animate-spin" style={{ color: '#AAAAAA' }} />}
                          </div>
                          {result?.headline && <p style={{ fontSize: 11, fontWeight: 500, color: ag.accent, margin: '4px 0 0', lineHeight: 1.35 }}>{result.headline}</p>}
                          {bullets.length > 0 && (
                            <ul style={{ margin: '4px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {bullets.map((b,bi) => <li key={bi} style={{ display: 'flex', gap: 5, fontSize: 10, color: '#555555', lineHeight: 1.4 }}><span style={{ color: ag.accent, flexShrink: 0 }}>·</span><span>{b}</span></li>)}
                            </ul>
                          )}
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flexShrink: 0 }}><ArcReactor size={24} /></div>
              <div style={{ background: '#F0F0F0', borderRadius: '4px 18px 18px 18px', padding: '10px 14px' }}>
                <Loader2 size={14} className="animate-spin" style={{ color: '#757575' }} />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div style={{ padding: '8px 10px', borderTop: '1px solid #EEEEEE', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => toggleListen(t => sendChat(t))} disabled={!srSupported || chatBusy}
            style={{ background: listening ? '#FF3B30' : '#F0F0F0', color: listening ? '#FFFFFF' : srSupported ? '#000000' : '#AAAAAA', border: 'none', borderRadius: 10, width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: srSupported && !chatBusy ? 'pointer' : 'not-allowed', flexShrink: 0, opacity: !srSupported ? 0.5 : 1 }}>
            {srSupported ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()}
            disabled={chatBusy} placeholder={listening ? 'Listening…' : 'Ask your PM anything…'}
            style={{ flex: 1, background: '#FFFFFF', border: '1px solid #EEEEEE', borderRadius: 10, padding: '0 14px', height: 42, fontSize: 14, color: '#000000', outline: 'none', fontFamily: 'inherit' }}
            onFocus={e => (e.target.style.borderColor = '#000000')}
            onBlur={e => (e.target.style.borderColor = '#EEEEEE')} />
          <button onClick={() => sendChat()} disabled={chatBusy || !chatInput.trim()}
            style={{ background: chatBusy || !chatInput.trim() ? '#CCCCCC' : '#000000', color: '#FFFFFF', border: 'none', borderRadius: 10, width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: chatBusy || !chatInput.trim() ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
            <Send size={17} />
          </button>
        </div>
      </div>

      {/* Quick suggestions */}
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {["How does CRDO look?", "Should I buy OKLO?", "What's the macro risk today?"].map(q => (
          <button key={q} onClick={() => sendChat(q)} disabled={chatBusy}
            style={{ ...MONO, background: '#F0F0F0', color: '#757575', border: 'none', borderRadius: 20, padding: '5px 12px', fontSize: 11, cursor: chatBusy ? 'not-allowed' : 'pointer', opacity: chatBusy ? 0.5 : 1 }}>{q}</button>
        ))}
      </div>
      <p style={{ ...MONO, fontSize: 10, color: '#CCCCCC', marginTop: 6 }}>
        {srSupported ? 'Tap mic to talk, or type. ' : 'Type to chat (voice needs Chrome). '}PM replies aloud when voice is on.
      </p>
    </div>
  );
}
