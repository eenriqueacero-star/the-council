import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Volume2, VolumeX, Loader2, Mic, MicOff, Send, Search, Trash2 } from 'lucide-react';
import { MONO, DISP, SANS, CY, ICE } from '../constants/styles.js';
import { AGENTS, PROTOCOLS, STANCE_STYLE } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent, getQuotes } from '../api.js';
import { useVoice } from '../hooks/useVoice.js';
import { notifyDevices } from '../push.js';
import { db, auth } from '../firebase.js';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { loadAgentContext, buildAgentContext } from '../utils/agentContext.js';
import { loadTickerHistory } from '../utils/rulingContext.js';

export default function ChatTab({ account, acct, positionsLine, flagApiDown }) {
  const GREETING = `Good to see you, sir. The council stands ready. Ask me how a holding looks, or say "should I buy —" and I'll convene the agents.`;

  const [chat, setChat] = useState([{ role: 'pm', text: GREETING }]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [liveSearch, setLiveSearch] = useState(false);
  const chatEndRef = useRef(null);
  const loadCancelRef = useRef(false);
  const prevChatLenRef = useRef(0);

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
    } else {
      loadLocal();
    }

    function loadLocal() {
      try {
        const saved = localStorage.getItem(`council_chat_${account}`);
        if (saved) { const p = JSON.parse(saved); if (Array.isArray(p) && p.length) { setChat(p); return; } }
      } catch {}
      setChat([{ role: 'pm', text: GREETING }]);
    }

    return () => { loadCancelRef.current = true; };
  }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  function saveChat() {
    setChat(current => {
      const msgs = current.slice(-120);
      const ref = firestoreRef(account);
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
    if (chat.length > prevChatLenRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevChatLenRef.current = chat.length;
  }, [chat]);

  const pmSys = `You are the PORTFOLIO MANAGER, head of THE COUNCIL - a JARVIS-style AI investing assistant. ${PROTOCOLS}
Tone: sharp, confident, decisive, lightly British-butler; address the investor as "sir" occasionally (not every line). The investor plays to WIN — be aggressive and action-oriented in your calls. You command 6 specialists: Technical (id: "technical"), Catalyst Scout (id: "catalyst"), Risk Manager (id: "risk"), Macro Agent (id: "macro"), Devil's Advocate (id: "bear"), Position Sizer (id: "sizer").
DECIDE — pick exactly one branch:
- SPECIFIC TICKER named (buy, review, add, "should I", "how does X look"): set convene=true, ticker=that symbol, agent=null.
- RECOMMENDATION REQUEST ("what should I buy", "any ideas", "what stocks"): pick the SINGLE best ticker NOT in their portfolio, set convene=true, ticker=that symbol, agent=null. Your speak must name the ticker.
- DOMAIN QUESTION (macro conditions, rates, geopolitics, sector news, market technical read, risk landscape): route to the ONE best specialist — set convene=false, ticker=null, agent=one of "macro"|"technical"|"risk"|"bear"|"catalyst". Your speak should introduce the specialist (e.g. "Let me get the Macro Agent's read on today's tape, sir." or "Waking up the Technical Analyst."). Do NOT answer the question yourself.
- GENERAL CHAT (greetings, portfolio overview, how app works, small talk): answer directly in speak; set convene=false, ticker=null, agent=null. Do NOT promise to run agents.
CRITICAL: convene=true requires a real ticker. Never set convene=true with ticker=null. Never promise to call an agent unless agent is set or convene=true.
Respond ONLY with JSON in a \`\`\`json block: {"speak":"<1-3 sentence reply>","convene":<true|false>,"ticker":"<TICKER or null>","agent":"<agentId or null>"}`;

  function errMessage(e) {
    const msg = e?.message || '';
    const code = msg.match(/ERR-[\w]+/)?.[0] || 'ERR-NET';
    const advice = code === 'ERR-401' ? 'Session expired — please refresh the page.'
                 : code === 'ERR-429' ? 'Rate limit hit — give it 30 seconds, sir.'
                 : code === 'ERR-CFG' ? 'Server misconfiguration — GROQ_API_KEY missing in Vercel.'
                 : code === 'ERR-NET' ? 'No response from server — check your connection.'
                 : 'Something went wrong on the server.';
    return `[${code}] ${advice}`;
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
    const acctLine = `Active account: ${acct.label}'s (${acct.sub}); current positions: ${positionsLine}; DCA ${acct.dcaNote}.`;
    const recentCtx = chat
      .filter(m => (m.role === 'user' || m.role === 'pm') && m.text)
      .slice(-6)
      .map(m => `${m.role === 'user' ? 'INVESTOR' : 'PM'}: ${m.text}`)
      .join('\n');
    let router;
    try {
      const routerPrompt = recentCtx
        ? `RECENT CONVERSATION:\n${recentCtx}\n\nInvestor says: "${text}". Today is ${new Date().toDateString()}. ${acctLine} Return ONLY the JSON.`
        : `Investor says: "${text}". Today is ${new Date().toDateString()}. ${acctLine} Return ONLY the JSON.`;
      const txt = await callAgent(pmSys, routerPrompt, false);
      router = extractJSON(txt) || { speak: "Apologies sir, I didn't quite catch that.", convene: false, ticker: null };
    } catch (e) {
      flagApiDown();
      router = { speak: errMessage(e), convene: false, ticker: null };
    }

    if (router.convene && !router.ticker) {
      const msg = router.speak || 'Which ticker would you like me to run the council on, sir?';
      setChat(p => [...p, { role: 'pm', text: msg }]); speak(msg);
      saveChat(); return;
    }

    if (!router.convene && router.agent) {
      const ag = AGENTS.find(a => a.id === router.agent);
      if (!ag) {
        setChat(p => [...p, { role: 'pm', text: router.speak }]);
        speak(router.speak);
      } else {
        const intro = router.speak || `Consulting ${ag.name}, sir.`;
        setChat(p => [...p, { role: 'pm', text: intro }]);
        speak(intro);
        const runId = Date.now();
        setChat(p => [...p, { role: 'agent-call', runId, agentId: ag.id, done: false }]);
        const agentContent = `STANDALONE QUESTION — no ticker context. The investor asks: "${text}". Today is ${new Date().toDateString()}. ${acctLine} Answer this question directly. Return ONLY the JSON.`;
        try {
          const txt = await callAgent(ag.system, agentContent, ag.search && liveSearch);
          const pr = extractJSON(txt) || { stance: 'CAUTION', headline: 'No data available', points: [] };
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

      let chatCurrentPrice = null;
      let chatRawQuote = null;
      let priceLine = '';
      try {
        const quotes = await getQuotes([tkr]);
        chatRawQuote = quotes[tkr];
        chatCurrentPrice = (chatRawQuote?.price && chatRawQuote.price > 0) ? chatRawQuote.price : chatRawQuote?.prevClose;
        if (chatCurrentPrice) priceLine = `CURRENT LIVE PRICE: $${chatCurrentPrice.toFixed(2)} (real-time quote — use this for ALL price levels, entries, stops, and targets; ignore any training-data prices). `;
      } catch {}

      const [chatAgentCtx, tickerHistory] = await Promise.all([
        loadAgentContext(tkr, chatRawQuote),
        uid ? loadTickerHistory(uid, tkr, chatCurrentPrice) : Promise.resolve(''),
      ]);

      const baseContent = `Ticker: ${tkr}. ${priceLine}The investor is considering BUYING it. ${acctLine} Today is ${new Date().toDateString()}. Return ONLY the JSON.${tickerHistory}`;
      const allRounds = [];

      for (let round = 0; round < 2; round++) {
        const isFirst = round === 0;

        if (!isFirst) {
          setChat(p => p.map(m => m.runId === runId ? { ...m, debateRound: round + 1, agents: {} } : m));
        }

        let debateCtx = '';
        if (!isFirst) {
          const prev = allRounds[round - 1];
          const prevLines = AGENTS.map(a => {
            const r = prev[a.id];
            if (!r) return `${a.name}: no response`;
            return `${a.name} (${r.stance}): "${r.headline || ''}"`;
          }).join('\n');
          debateCtx = `\n\nROUND ${round} COUNCIL POSITIONS:\n${prevLines}\n\nThe council is working toward a unanimous decision. Rebut any opposing points with hard evidence. If the weight of evidence is clearly against your prior stance, update it. If it supports your stance, sharpen your argument. Return the same JSON format.`;
        }

        const userContent = baseContent + debateCtx;
        const roundResults = {};

        for (let i = 0; i < AGENTS.length; i++) {
          const ag = AGENTS[i];
          const ctxSuffix = isFirst ? buildAgentContext(ag.id, chatAgentCtx) : '';
          try {
            const txt = await callAgent(ag.system, userContent + ctxSuffix, ag.search && liveSearch && isFirst);
            const pr = extractJSON(txt);
            roundResults[ag.id] = pr || { stance: 'CAUTION' };
          } catch {
            flagApiDown();
            roundResults[ag.id] = { stance: 'CAUTION' };
          }
          setChat(p => p.map(m => m.runId === runId ? { ...m, agents: { ...m.agents, [ag.id]: roundResults[ag.id] } } : m));
          if (i < AGENTS.length - 1) await new Promise(r => setTimeout(r, 3000));
        }

        allRounds.push(roundResults);
        saveChat();

        const stances = AGENTS.map(a => roundResults[a.id]?.stance).filter(Boolean);
        const hasBull = stances.some(s => ['PASS', 'BUY'].includes(s));
        const hasBear = stances.some(s => ['FAIL', 'BEARISH'].includes(s));
        if (!(hasBull && hasBear)) break;

        if (round < 1) {
          const SECS = 60;
          for (let s = SECS - 1; s >= 0; s--) {
            setChat(p => p.map(m => m.runId === runId ? { ...m, cooldown: s } : m));
            if (s > 0) await new Promise(r => setTimeout(r, 1000));
          }
        }
      }

      const council = allRounds.map((r, i) =>
        `Round ${i + 1}: ${AGENTS.map(ag => {
          const res = r[ag.id];
          return `${ag.name}: ${res?.stance || 'no response'} — "${res?.headline || ''}"`;
        }).join(' | ')}`
      ).join('\n');
      const roundWord = allRounds.length === 1 ? 'analysis' : `${allRounds.length} rounds of debate`;
      const synthSys = `You are the PM concluding the council on ${tkr} for ${acct.label} after ${roundWord}. ${PROTOCOLS}
The investor is AGGRESSIVE — they play to win and accept volatility. Be bold and decisive. Act as a disciplined swing trader, not a fan.
Speak the ruling conversationally (JARVIS tone, 2-4 sentences): verdict, conviction/10, key factor. If BUY — state whether this is buyable NOW or only on confirmation, then give entry zone, stop loss, take profit, and exact invalidation level (price where bull thesis dies) all in one crisp line. Require 2:1 reward-to-risk before calling BUY.
Then add a followUp: one short natural question or suggestion — e.g. offer to size the position, mention the exact trigger to watch, or ask if they want to dig into a specific risk.
Respond ONLY with JSON in a \`\`\`json block: {"speak":"<ruling>","verdict":"BUY"|"WATCH"|"PASS","conviction":<0-10>,"followUp":"<one sentence>"}`;
      let synth;
      try {
        const txt = await callAgent(synthSys, `Council ${roundWord} for ${tkr}:\n${council}\n\n${priceLine}Deliver the ruling. Return ONLY the JSON.`, false, 900);
        synth = extractJSON(txt) || { speak: 'The council is split, sir — I\'d hold off for now.', verdict: 'WATCH', conviction: 5, followUp: null };
      } catch (e) {
        flagApiDown();
        synth = { speak: errMessage(e), verdict: 'WATCH', conviction: 5, followUp: null };
      }
      setChat(p => [...p, { role: 'pm', text: synth.speak, verdict: synth.verdict, conviction: synth.conviction, ticker: tkr }]);
      speak(synth.speak);
      notifyDevices(`${tkr}: ${synth.verdict} · ${synth.conviction}/10`, synth.speak);

      if (uid) {
        const lastRound = allRounds[allRounds.length - 1];
        if (lastRound) {
          const agentStances = {};
          AGENTS.forEach(a => {
            const r = lastRound[a.id];
            if (r) agentStances[a.id] = { stance: r.stance || null, score: r.score ?? null, headline: r.headline || null };
          });
          addDoc(collection(db, 'users', uid, 'rulings'), {
            ticker: tkr,
            account,
            date: new Date().toISOString().split('T')[0],
            ts: serverTimestamp(),
            priceAtCall: chatCurrentPrice || null,
            agentStances,
            verdict: synth.verdict, conviction: synth.conviction,
            entry: null, stopLoss: null, takeProfit: null,
            summary: synth.speak || null,
            outcomeCheckedAt: null, priceAt30d: null, outcome: null,
          }).catch(() => {});
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
    } finally {
      setChatBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} style={{ color: CY }} />
          <span style={{ ...SANS, color: 'rgba(255,255,255,0.60)', fontWeight: 600, fontSize: '13px' }}>PM Chat · {acct.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setLiveSearch(v => !v)}
            title={liveSearch ? 'Live search on (costs ~6¢/run) — tap to turn off' : 'Live search off — tap to enable'}
            style={{ borderColor: liveSearch ? `${ICE}88` : 'rgba(226,221,213,0.12)', color: liveSearch ? ICE : 'rgba(226,221,213,0.38)' }}
            className="flex items-center justify-center w-8 h-8 rounded-lg border transition-colors">
            <Search size={14} />
          </button>
          <button onClick={toggleVoice}
            title={voiceOn ? 'Voice on — tap to mute' : 'Voice muted — tap to enable'}
            style={{ borderColor: voiceOn ? `${CY}66` : 'rgba(226,221,213,0.12)', color: voiceOn ? CY : 'rgba(226,221,213,0.38)' }}
            className="flex items-center justify-center w-8 h-8 rounded-lg border transition-colors">
            {voiceOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button onClick={clearHistory} disabled={chatBusy} title="Clear chat history"
            style={{ borderColor: 'rgba(226,221,213,0.12)', color: 'rgba(226,221,213,0.35)' }}
            className="flex items-center justify-center w-8 h-8 rounded-lg border transition-colors hover:border-[#e85c5c]/40 hover:text-[#e85c5c] disabled:opacity-40">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden flex flex-col" style={{ height: 'min(60vh, 560px)', background: '#111827', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3">
          {chat.map((m, i) => {
            if (m.role === 'user') return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[82%] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-[13px]" style={{ ...SANS, background: '#00d395', color: '#061a12', fontWeight: 500 }}>{m.text}</div>
              </div>
            );
            if (m.role === 'pm') {
              const vs = m.verdict ? STANCE_STYLE[m.verdict === 'PASS' ? 'PASS_FINAL' : m.verdict] : null;
              return (
                <div key={i} className="flex justify-start gap-2.5" style={{ animation: 'cardIn .4s ease both' }}>
                  <div className="shrink-0 mt-0.5 flex items-center justify-center rounded-full" style={{ width: 26, height: 26, background: ICE + '20', border: `1px solid ${ICE}44`, flexShrink: 0 }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: ICE, fontFamily: "'Inter', sans-serif" }}>PM</span>
                  </div>
                  <div className="max-w-[82%]">
                    <div className="rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[13px]" style={{ ...SANS, color: 'rgba(226,234,240,0.88)', background: '#1a2438', border: '1px solid rgba(255,255,255,0.08)' }}>
                      {speaking && i === chat.length - 1 && voiceOn && (
                        <span className="inline-flex items-center gap-1 mr-1.5 align-middle"><span className="blink inline-block w-1.5 h-1.5 rounded-full" style={{ background: CY }} /></span>
                      )}
                      {m.text}
                    </div>
                    {vs && <div className="mt-1.5 inline-flex items-center gap-2">
                      <span style={{ ...MONO, background: vs.bg, color: vs.fg }} className="text-[9px] font-semibold px-2 py-0.5 rounded">{vs.label}</span>
                      <span style={{ ...MONO, color: 'rgba(255,255,255,0.35)' }} className="text-[9px]">{m.conviction}/10 · {m.ticker || ''}</span>
                    </div>}
                  </div>
                </div>
              );
            }
            if (m.role === 'agent-call') {
              const ag = AGENTS.find(a => a.id === m.agentId);
              if (!ag) return null;
              const result = m.result;
              const stance = result?.stance;
              const ss = stance && STANCE_STYLE[stance];
              const points = result?.points || result?.bullets || [];
              return (
                <div key={i} className="flex justify-start gap-2.5" style={{ animation: 'cardIn .4s ease both' }}>
                  <div className="shrink-0 w-[26px]" />
                  <div className="max-w-[88%] w-full rounded-xl px-3 py-2.5" style={{ background: '#111827', border: `1px solid ${ag.accent}44` }}>
                    <div style={MONO} className="text-[9px] tracking-widest mb-2 flex items-center gap-1.5">
                      <ag.icon size={9} style={{ color: ag.accent }} />
                      {m.done
                        ? <span style={{ color: ag.accent }}>{ag.name.toUpperCase()}</span>
                        : <span style={{ color: ag.accent }} className="animate-pulse">WAKING UP {ag.name.split(' ')[0].toUpperCase()}…</span>
                      }
                    </div>
                    {!m.done ? (
                      <div className="flex items-center gap-2 py-1">
                        <Loader2 size={12} className="animate-spin" style={{ color: ag.accent }} />
                        <span className="text-[11px] text-white/40">Consulting…</span>
                      </div>
                    ) : (
                      <div className="rounded-lg px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${ag.accent}33` }}>
                        {stance && ss && <span style={{ ...MONO, color: ss.fg }} className="text-[8px] font-bold block mb-1">{ss.label}</span>}
                        {result?.headline && <p className="text-[11px] font-medium leading-snug" style={{ color: ag.accent }}>{result.headline}</p>}
                        {points.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {points.map((b, bi) => (
                              <li key={bi} className="text-[11px] leading-snug flex gap-1.5" style={{ color: 'rgba(226,221,213,0.55)' }}>
                                <span style={{ color: ag.accent }} className="shrink-0">·</span>
                                <span>{b}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            if (m.role === 'council') return (
              <div key={i} className="flex justify-start gap-2.5">
                <div className="shrink-0 w-[26px]" />
                <div className="max-w-[88%] w-full rounded-xl px-3 py-2.5" style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ ...MONO, color: 'rgba(226,221,213,0.40)', letterSpacing: '0.10em' }} className="text-[9px] tracking-widest mb-2">
                    {m.cooldown > 0
                      ? <span style={{ color: CY }}>RATE LIMIT COOLDOWN · {m.cooldown}s · ROUND 2 INCOMING</span>
                      : m.debateRound > 1 ? `ROUND ${m.debateRound} · REBUTTAL · ${m.ticker}` : `CONSULTING THE COUNCIL · ${m.ticker}`}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {AGENTS.map(ag => {
                      const result = m.agents[ag.id];
                      const stance = result?.stance;
                      const ss = stance && STANCE_STYLE[stance];
                      const bullets = result?.points || result?.bullets || [];
                      return (
                        <div key={ag.id} className="rounded-lg px-2.5 py-2" style={{ background: 'rgba(226,221,213,0.02)', border: `1px solid ${stance ? ag.accent + '33' : 'rgba(255,255,255,0.06)'}` }}>
                          <div className="flex items-center gap-1.5">
                            <ag.icon size={11} style={{ color: ag.accent }} />
                            <span style={MONO} className="text-[9px] text-white/55 flex-1">{ag.name.split(' ')[0].toUpperCase()}</span>
                            {stance
                              ? <span style={{ ...MONO, color: ss ? ss.fg : '#fff' }} className="text-[8px] font-bold">{ss ? ss.label : stance}</span>
                              : <Loader2 size={10} className="animate-spin text-white/30" />}
                          </div>
                          {result?.headline && (
                            <p className="mt-1 text-[11px] font-medium leading-snug" style={{ color: ag.accent }}>{result.headline}</p>
                          )}
                          {bullets.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {bullets.map((b, bi) => (
                                <li key={bi} className="text-[11px] leading-snug flex gap-1.5" style={{ color: 'rgba(226,221,213,0.55)' }}>
                                  <span style={{ color: ag.accent }} className="shrink-0">·</span>
                                  <span>{b}</span>
                                </li>
                              ))}
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
            <div className="flex justify-start gap-2.5">
              <div className="shrink-0 mt-0.5 flex items-center justify-center rounded-full" style={{ width: 26, height: 26, background: ICE + '20', border: `1px solid ${ICE}44`, flexShrink: 0 }}>
                <span style={{ fontSize: '9px', fontWeight: 700, color: ICE, fontFamily: "'Inter', sans-serif" }}>PM</span>
              </div>
              <div className="rounded-2xl rounded-bl-sm px-3.5 py-2.5" style={{ background: '#1a2438', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Loader2 size={14} className="animate-spin" style={{ color: CY }} />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-2.5 flex items-center gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button onClick={() => toggleListen(t => sendChat(t))} disabled={!srSupported || chatBusy}
            title={srSupported ? 'Tap to speak' : 'Voice input needs Chrome'}
            style={{ background: listening ? '#e85c5c' : 'rgba(226,221,213,0.04)', borderColor: listening ? '#e85c5c' : 'rgba(226,221,213,0.12)', color: listening ? '#fff' : srSupported ? CY : 'rgba(226,221,213,0.30)' }}
            className={`shrink-0 rounded-xl border w-11 h-11 flex items-center justify-center transition-all disabled:opacity-40 ${listening ? 'glow-btn' : ''}`}>
            {srSupported ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()}
            disabled={chatBusy} placeholder={listening ? 'Listening…' : 'Ask your PM anything…'}
            style={{ ...SANS, background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.10)', color: '#e2e8f0', fontSize: '14px' }}
            className="flex-1 border rounded-xl px-3.5 py-3 text-sm outline-none transition-colors disabled:opacity-50"
            onFocus={e => e.target.style.borderColor = `${CY}60`}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'} />
          <button onClick={() => sendChat()} disabled={chatBusy || !chatInput.trim()}
            style={{ background: chatBusy || !chatInput.trim() ? 'rgba(0,211,149,0.18)' : CY, color: '#061a12' }}
            className="glow-btn shrink-0 rounded-xl w-11 h-11 flex items-center justify-center transition-all disabled:cursor-not-allowed">
            <Send size={17} />
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {["How does CRDO look?", "Should I buy OKLO?", "What's the macro risk today?"].map(q => (
          <button key={q} onClick={() => sendChat(q)} disabled={chatBusy}
            style={{ ...MONO, borderColor: 'rgba(226,221,213,0.10)', color: 'rgba(226,221,213,0.45)' }}
            className="text-[10px] px-2.5 py-1 rounded-full border transition-colors disabled:opacity-40 hover:border-[rgba(200,146,42,0.45)] hover:text-[#c8922a]">{q}</button>
        ))}
      </div>
      <p style={{ ...MONO, color: 'rgba(226,221,213,0.28)' }} className="mt-2 text-[10px]">
        {srSupported ? 'Tap the mic to talk, or type. ' : 'Type to chat (voice input needs Chrome). '}PM replies aloud when voice is on.
      </p>
    </div>
  );
}
