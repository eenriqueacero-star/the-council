import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Volume2, VolumeX, Loader2, Mic, MicOff, Send, Crown, AlertTriangle } from 'lucide-react';
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

export default function ChatTab({ account, acct, positionsLine, flagApiDown, dark }) {
  const [chat,        setChat]       = useState([{ role:'pm', text:"The council is assembled. Ask me anything — market conditions, macro outlook, portfolio strategy, or name a ticker for a full investment ruling." }]);
  const [chatInput,   setChatInput]  = useState('');
  const [chatBusy,    setChatBusy]   = useState(false);
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

    // Refresh the single most-stale agent's research in background (1 call max per run)
    if (uid) {
      const STALE_MS = 24 * 60 * 60 * 1000;
      let staleest = null; let staleestAge = 0;
      AGENTS.forEach(ag => {
        const searched = profiles[ag.id]?.lastResearch?.searchedAt;
        const age = searched ? Date.now() - new Date(searched).getTime() : Infinity;
        if (age > STALE_MS && age > staleestAge) { staleest = ag; staleestAge = age; }
      });
      if (staleest) {
        refreshAgentResearch(uid, staleest.id, staleest.researchPrompt, callAgent)
          .then(content => {
            if (content) profiles[staleest.id] = { ...profiles[staleest.id], lastResearch: { content, searchedAt: new Date().toISOString() } };
          });
      }
    }

    const priceNote   = livePrice ? ` Price: $${livePrice.toFixed(2)}.` : '';
    const baseContent = `Ticker: ${tkr}. Investor considering BUYING.${priceNote} ${acctLine} Today: ${new Date().toDateString()}.${history}`;

    // 3-round council (compact for chat — show only final stances)
    const allRounds = [];
    let hasUngrounded = false;
    const ungroundedWarnings = [];

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
          const { text: txt, grounded, warning } = await callAgent(ag.system, userMsg, ag.search, 500);
          if (ag.search && grounded === false) { hasUngrounded = true; if (warning) ungroundedWarnings.push(warning); }
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
      const { text: txt } = await callAgent(synthSys, `Full council deliberation:\n${fullCouncilContext}\n${livePrice ? `Live price: $${livePrice.toFixed(2)}.` : ''} Deliver the ruling.`, false, 400, null, 'openai/gpt-oss-120b');
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
    setChat(p => p.map(m => m.runId === runId ? { ...m, synth, hasUngrounded, ungroundedWarnings } : m));
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

    // AXIOM reads the message and decides: answer directly, route to specialist(s), or convene full council
    const axiomSys = `You are AXIOM, chair of THE COUNCIL — an elite private investment analysis team. You are direct, sharp, decisive, and genuinely knowledgeable about markets. ${PROTOCOLS}

THE COUNCIL ROSTER (use ONLY these names — never invent others):
- REX ⚡ (id: technical) — Technical Analyst: charts, price action, momentum, key levels
- NOVA 🚀 (id: catalyst) — Catalyst Scout: earnings, product launches, upcoming events
- SAGE 🛡️ (id: risk) — Risk Officer: dilution, volatility, concentration risk
- ATLAS 🌐 (id: macro) — Macro Strategist: Fed, rates, inflation, geopolitics
- VEGA 🐻 (id: bear) — Devil's Advocate: bear case, downside scenarios
- ZEN ⚖️ (id: sizer) — Position Sizer: dollar amounts, sizing, portfolio allocation

ROUTING RULES — choose the most useful response type:
- fullCouncil=true ONLY when the investor explicitly wants a full BUY/SELL/HOLD ruling on a specific ticker ("should I buy X", "full analysis on X", "what's the council's take on X", "convene on X").
- route=["catalyst","technical"] for stock search/discovery questions ("find stocks", "what should I add", "any good picks", "search for opportunities") — NOVA names specific tickers with catalysts, REX checks the charts.
- route=["technical"] for chart/momentum/price action questions about a specific ticker.
- route=["macro"] for macro, Fed, rates, inflation, or geopolitical questions.
- route=["catalyst"] for earnings dates, product launches, or upcoming catalysts on a specific ticker.
- route=["risk"] for risk assessment, dilution, concentration, or volatility questions.
- route=["bear"] for bear case, downside risk, or "what could go wrong" questions.
- route=["sizer"] for position sizing, dollar amounts, or how much to buy.
- route=["technical","macro"] — combine multiple specialists when the question spans domains.
- route=[] — answer DIRECTLY as AXIOM for: greetings, general portfolio questions, strategy, watchlist discussion, anything that doesn't need a specialist.

When routing to specialist(s), set "speak" to a brief 1-sentence intro using their real name (e.g. "Let me get REX's read on that chart." or "NOVA and ATLAS will cover this.").
When answering directly, set "speak" to your full answer.
Today: ${new Date().toDateString()}.${historyBlock}
Respond ONLY with JSON in a \`\`\`json block: {"speak":"<response or intro>","fullCouncil":<bool>,"ticker":"<TICKER or null>","route":["agentId1","agentId2"]}`;

    let router;
    try {
      const { text: txt } = await callAgent(axiomSys, `Investor: "${text}". ${acctLine} Return ONLY the JSON.`, false);
      const parsed = extractJSON(txt);
      if (!parsed) console.error('[AXIOM router] JSON parse failed. Raw txt:', JSON.stringify(txt));
      router = parsed || { speak: "I didn't quite catch that.", fullCouncil: false, ticker: null, route: [] };
    } catch {
      flagApiDown();
      router = { speak: "I can't reach the council right now.", fullCouncil: false, ticker: null, route: [] };
    }

    // Ensure backwards-compat if model returns old `convene` field
    if (router.convene && !router.fullCouncil) router.fullCouncil = true;

    // === FULL COUNCIL ===
    if (router.fullCouncil && router.ticker) {
      const tkr = String(router.ticker).toUpperCase();
      const intro = router.speak || `Convening the full council on ${tkr}.`;
      setChat(p => [...p, { role:'pm', text:intro }]);
      speak(intro);
      setConvHistory(prev => [...prev, { role:'assistant', agentId:'pm', content:intro }]);
      await runCouncilInChat(tkr, acctLine, uid, intro);
      setChatBusy(false);
      return;
    }

    // === SPECIALIST ROUTE (deliberation loop until consensus) ===
    const routeIds = Array.isArray(router.route) ? router.route.filter(id => AGENTS.find(a => a.id === id)) : [];
    if (routeIds.length > 0) {
      if (router.speak) {
        setChat(p => [...p, { role:'pm', text:router.speak }]);
        setConvHistory(prev => [...prev, { role:'assistant', agentId:'pm', content:router.speak }]);
      }

      // The roster line injected into every agent call so they never hallucinate fake names
      const ROSTER = `\nTHE COUNCIL ROSTER (ONLY these six exist — never reference any other name): REX ⚡ (Technical), NOVA 🚀 (Catalyst), SAGE 🛡️ (Risk), ATLAS 🌐 (Macro/Geopolitics), VEGA 🐻 (Bear case), ZEN ⚖️ (Sizing).`;

      // Fetch live price + verified earnings date via Finnhub when a ticker is identified
      let liveContext = '';
      if (router.ticker) {
        try {
          const tkr = router.ticker.toUpperCase();
          const q = await getQuotes([tkr], true);
          const quote = q[tkr];
          if (quote?.price) {
            liveContext = `\nVERIFIED LIVE DATA for ${tkr}: price $${quote.price.toFixed(2)} (prev close $${(quote.prevClose || 0).toFixed(2)}, chg ${(quote.changePct || 0).toFixed(2)}%)`;
            if (quote.nextEarnings) {
              liveContext += `, next earnings: ${quote.nextEarnings} (verified from Finnhub — do NOT cite a different date)`;
            }
          }
        } catch {}
      }

      // ONE compound-beta search — targeted at the ticker if known, general otherwise
      try {
        const searchQuery = router.ticker
          ? `Current price, recent news, and key catalysts for ${router.ticker.toUpperCase()}. Today: ${new Date().toDateString()}.`
          : text;
        const searchSys = `You are a market research assistant. Search for the most relevant, current information. Return 3-4 bullet points of key facts — prices, news, earnings dates, macro data.`;
        const { text: raw } = await callAgent(searchSys, searchQuery, true, 280);
        if (raw) liveContext += `\n\nLIVE MARKET CONTEXT:\n${raw}`;
      } catch {}

      const COMPLEMENTS = {
        technical: 'catalyst', catalyst: 'bear', macro: 'technical',
        risk: 'bear', bear: 'catalyst', sizer: 'risk',
      };

      const spokenThisTurn = [];
      const inQueue = new Set(routeIds); // track what's already queued to avoid duplicates
      const queue = [...routeIds];       // flat ordered queue — append to end as agents invite each other
      const MIN_EXCHANGES = 3;
      const MAX_CALLS = 10;
      let totalCalls = 0;

      for (let i = 0; i < queue.length && totalCalls < MAX_CALLS; i++) {
        const agId = queue[i];
        const ag = AGENTS.find(a => a.id === agId);
        if (!ag) continue;
        if (totalCalls > 0) await sleep(3000);

        const isFirst = spokenThisTurn.length === 0;
        const knowledgeBase = isFirst
          ? `${liveContext}\n\nYou are opening the discussion. Be specific — tickers, prices, dates. End by inviting the most relevant colleague by name to add their perspective.`
          : `${liveContext}\n\nSHARED COUNCIL KNOWLEDGE:\n${spokenThisTurn.map(s => `[${s.name}]: ${s.response}`).join('\n\n')}\n\nAdd what's genuinely missing. Respond directly to anything aimed at you. Invite another colleague by name if their domain is still needed.`;

        const userMsg = isFirst
          ? text
          : `Council discussion on: "${text}". See shared knowledge above. Add your angle.`;

        let response;
        try {
          const identityAnchor = `YOU ARE ${ag.name} (${ag.emoji}). First person only. 3-4 sentences max. Reference your colleagues by name when responding to their points.\n\n`;
          const sys = identityAnchor + ag.conversationalPrompt + ROSTER + knowledgeBase + historyBlock;
          response = (await callAgent(sys, userMsg, false, 280)).text;
        } catch {
          flagApiDown();
          response = 'Having trouble connecting right now.';
        }

        spokenThisTurn.push({ agentId: agId, name: ag.name, response });
        totalCalls++;

        setChat(p => [...p, { role:'agent', agentId:ag.id, name:ag.name, emoji:ag.emoji, color:ag.color, accent:ag.accent, text:response }]);
        setConvHistory(prev => [...prev, { role:'assistant', agentId:ag.id, content:response }]);

        // Any agent mentioned by name gets appended to the queue (once only)
        const lower = response.toLowerCase();
        for (const candidate of AGENTS) {
          if (candidate.id !== agId && !inQueue.has(candidate.id) && lower.includes(candidate.name.toLowerCase())) {
            queue.push(candidate.id);
            inQueue.add(candidate.id);
          }
        }

        // If this is the last item in the queue and we haven't hit MIN_EXCHANGES, auto-add complement
        const isLast = i === queue.length - 1;
        if (isLast && spokenThisTurn.length < MIN_EXCHANGES) {
          const complementId = COMPLEMENTS[agId];
          if (complementId && !inQueue.has(complementId)) {
            queue.push(complementId);
            inQueue.add(complementId);
          }
        }
      }

      // AXIOM closes when discussion is done
      if (spokenThisTurn.length > 0) {
        try {
          const closingSys = `You are AXIOM, chair of THE COUNCIL. The specialists have deliberated and reached a conclusion. Deliver a single crisp summary (2-3 sentences) that directly answers the investor's original question based on everything the team established. Be specific — include tickers, dates, or numbers if they came up. No fluff.`;
          const closingCtx = `Investor asked: "${text}"\n\nFull council discussion:\n${spokenThisTurn.map(s => `[${s.name}]: ${s.response}`).join('\n\n')}\n\nDeliver the consensus answer.`;
          const { text: closing } = await callAgent(closingSys, closingCtx, false, 250);
          setChat(p => [...p, { role:'pm', text:closing }]);
          setConvHistory(prev => [...prev, { role:'assistant', agentId:'pm', content:closing }]);
          speak(closing);
        } catch {}
      }

      setChatBusy(false);
      return;
    }

    // === AXIOM DIRECT ANSWER ===
    setChat(p => [...p, { role:'pm', text:router.speak }]);
    speak(router.speak);
    setConvHistory(prev => [...prev, { role:'assistant', agentId:'pm', content:router.speak }]);
    setChatBusy(false);
  }

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
                    {m.hasUngrounded && !m.synth && (
                      <div style={{ marginTop:6, display:'flex', alignItems:'center', gap:5, ...MONO, fontSize:9, color:'#B45309' }}>
                        <AlertTriangle size={10} style={{ color:'#B45309', flexShrink:0 }} />
                        <span>⚠ {(m.ungroundedWarnings?.length > 0 ? m.ungroundedWarnings[0] + (m.ungroundedWarnings.length > 1 ? ` (+${m.ungroundedWarnings.length - 1} more)` : '') : 'Some agents lacked live data this run')}</span>
                      </div>
                    )}
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
                        {m.hasUngrounded && (
                          <div style={{ marginTop:6, display:'flex', alignItems:'center', gap:5, ...MONO, fontSize:9, color:'#B45309' }}>
                            <AlertTriangle size={10} style={{ color:'#B45309', flexShrink:0 }} />
                            <span>⚠ {(m.ungroundedWarnings?.length > 0 ? m.ungroundedWarnings[0] + (m.ungroundedWarnings.length > 1 ? ` (+${m.ungroundedWarnings.length - 1} more)` : '') : 'Some agents lacked live data this run')}</span>
                          </div>
                        )}
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
            placeholder={listening ? 'Listening…' : 'Ask anything — AXIOM routes to the right specialist automatically…'}
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
        AXIOM reads your message and routes to the right specialist — or convenes the full council for a buy/sell ruling.
      </p>
    </div>
  );
}
