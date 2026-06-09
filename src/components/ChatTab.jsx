import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Volume2, VolumeX, Loader2, Mic, MicOff, Send } from 'lucide-react';
import { MONO, DISP, CY } from '../constants/styles.js';
import { AGENTS, PROTOCOLS, STANCE_STYLE } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent } from '../api.js';
import { useVoice } from '../hooks/useVoice.js';
import ArcReactor from './ArcReactor.jsx';

export default function ChatTab({ account, acct, positionsLine, flagApiDown }) {
  const [chat, setChat] = useState([{ role: 'pm', text: 'Good to see you, sir. The council stands ready. Ask me how a holding looks, or say "should I buy —" and I\'ll convene the agents.' }]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef(null);

  const { voiceOn, listening, speaking, srSupported, speak, stopSpeaking, toggleVoice, toggleListen } = useVoice();

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  const pmSys = `You are the PORTFOLIO MANAGER, head of THE COUNCIL - a JARVIS-style AI investing assistant. ${PROTOCOLS}
Tone: sharp, confident, concise, lightly British-butler; address the investor as "sir" occasionally (not every line). You command 6 specialists: Technical, Catalyst, Risk, Macro, Devil's Advocate, Position Sizer.
DECIDE: if the investor asks whether to BUY / enter / add / review / decide on a SPECIFIC ticker, set convene=true and the ticker - you will consult the council. For anything else (how a holding looks, market reads, general questions), answer directly and concisely; be honest if unsure.
Respond ONLY with JSON in a \`\`\`json block: {"speak":"<1-3 sentence reply>","convene":<true|false>,"ticker":"<TICKER or null>"}`;

  async function sendChat(raw) {
    const text = (typeof raw === 'string' ? raw : chatInput).trim();
    if (!text || chatBusy) return;
    setChatInput(''); stopSpeaking();
    setChat(p => [...p, { role: 'user', text }]);
    setChatBusy(true);

    const acctLine = `Active account: ${acct.label}'s (${acct.sub}); current positions: ${positionsLine}; DCA ${acct.dcaNote}.`;
    let router;
    try {
      const txt = await callAgent(pmSys, `Investor says: "${text}". Today is ${new Date().toDateString()}. ${acctLine} Return ONLY the JSON.`, true);
      router = extractJSON(txt) || { speak: "Apologies sir, I didn't quite catch that.", convene: false, ticker: null };
    } catch {
      flagApiDown();
      router = { speak: 'I can\'t reach the council right now, sir. Check your connection and try again.', convene: false, ticker: null };
    }

    if (router.convene && router.ticker) {
      const tkr = String(router.ticker).toUpperCase();
      const intro = router.speak || `Consulting the council on ${tkr}, sir.`;
      setChat(p => [...p, { role: 'pm', text: intro }]); speak(intro);
      const runId = Date.now();
      setChat(p => [...p, { role: 'council', runId, ticker: tkr, agents: {} }]);
      const userContent = `Ticker: ${tkr}. The investor is considering BUYING it. ${acctLine} Today is ${new Date().toDateString()}. Return ONLY the JSON.`;
      const results = {};
      await Promise.all(AGENTS.map(async ag => {
        try {
          const txt = await callAgent(ag.system, userContent, ag.search);
          const pr = extractJSON(txt);
          results[ag.id] = pr || { stance: 'CAUTION' };
        } catch {
          flagApiDown();
          results[ag.id] = { stance: 'CAUTION' };
        }
        setChat(p => p.map(m => m.runId === runId ? { ...m, agents: { ...m.agents, [ag.id]: results[ag.id].stance } } : m));
      }));

      const council = AGENTS.map(ag => `${ag.name}: ${JSON.stringify(results[ag.id])}`).join('\n');
      const synthSys = `You are the PM concluding the council on ${tkr} for ${acct.label}. ${PROTOCOLS}
Speak the ruling to the investor conversationally (JARVIS tone, 2-4 sentences): the verdict, conviction out of 10, the single most important factor, and sizing if buying. Reference that the agents reported in.
Respond ONLY with JSON in a \`\`\`json block: {"speak":"<the spoken ruling>","verdict":"BUY"|"WATCH"|"PASS","conviction":<0-10>}`;
      let synth;
      try {
        const txt = await callAgent(synthSys, `Council reports on ${tkr}:\n${council}\n\nDeliver the ruling. Return ONLY the JSON.`, false);
        synth = extractJSON(txt) || { speak: 'The council is split, sir — I\'d hold off for now.', verdict: 'WATCH', conviction: 5 };
      } catch {
        synth = { speak: 'I couldn\'t finalize the ruling, sir.', verdict: 'WATCH', conviction: 5 };
      }
      setChat(p => [...p, { role: 'pm', text: synth.speak, verdict: synth.verdict, conviction: synth.conviction, ticker: tkr }]);
      speak(synth.speak);
    } else {
      setChat(p => [...p, { role: 'pm', text: router.speak }]);
      speak(router.speak);
    }
    setChatBusy(false);
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} style={{ color: CY }} />
          <span style={{ ...DISP, letterSpacing: '0.04em' }} className="text-sm font-semibold">TALK TO YOUR PM · {acct.label.toUpperCase()}</span>
        </div>
        <button onClick={toggleVoice} title={voiceOn ? 'Voice on' : 'Voice off'}
          style={{ borderColor: voiceOn ? `${CY}66` : 'rgba(255,255,255,0.15)', color: voiceOn ? CY : 'rgba(255,255,255,0.5)' }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] transition-colors">
          {voiceOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
          <span style={MONO}>{voiceOn ? 'VOICE ON' : 'MUTED'}</span>
        </button>
      </div>

      <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden flex flex-col" style={{ height: 'min(60vh, 560px)' }}>
        <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3">
          {chat.map((m, i) => {
            if (m.role === 'user') return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[82%] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-[13px]" style={{ background: 'rgba(245,196,81,0.14)', border: '1px solid rgba(245,196,81,0.3)' }}>{m.text}</div>
              </div>
            );
            if (m.role === 'pm') {
              const vs = m.verdict ? STANCE_STYLE[m.verdict === 'PASS' ? 'PASS_FINAL' : m.verdict] : null;
              return (
                <div key={i} className="flex justify-start gap-2.5" style={{ animation: 'cardIn .4s ease both' }}>
                  <div className="shrink-0 mt-0.5"><ArcReactor size={26} /></div>
                  <div className="max-w-[82%]">
                    <div className="rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[13px] text-white/85" style={{ background: 'rgba(63,224,255,0.07)', border: '1px solid rgba(63,224,255,0.22)' }}>
                      {speaking && i === chat.length - 1 && voiceOn && (
                        <span className="inline-flex items-center gap-1 mr-1.5 align-middle"><span className="blink inline-block w-1.5 h-1.5 rounded-full" style={{ background: CY }} /></span>
                      )}
                      {m.text}
                    </div>
                    {vs && <div className="mt-1.5 inline-flex items-center gap-2">
                      <span style={{ ...MONO, background: vs.bg, color: vs.fg }} className="text-[9px] font-semibold px-2 py-0.5 rounded">{vs.label}</span>
                      <span style={MONO} className="text-[9px] text-white/40">{m.conviction}/10 · {m.ticker || ''}</span>
                    </div>}
                  </div>
                </div>
              );
            }
            if (m.role === 'council') return (
              <div key={i} className="flex justify-start gap-2.5">
                <div className="shrink-0 w-[26px]" />
                <div className="max-w-[88%] w-full rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={MONO} className="text-[9px] text-white/40 tracking-widest mb-2">CONSULTING THE COUNCIL · {m.ticker}</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {AGENTS.map(ag => {
                      const stance = m.agents[ag.id];
                      const ss = stance && STANCE_STYLE[stance];
                      return (
                        <div key={ag.id} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${stance ? ag.accent + '33' : 'rgba(255,255,255,0.06)'}` }}>
                          <ag.icon size={11} style={{ color: ag.accent }} />
                          <span style={MONO} className="text-[9px] text-white/55 truncate flex-1">{ag.name.split(' ')[0]}</span>
                          {stance
                            ? <span style={{ ...MONO, color: ss ? ss.fg : '#fff' }} className="text-[8px] font-bold">{ss ? ss.label : stance}</span>
                            : <Loader2 size={10} className="animate-spin text-white/30" />}
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
              <div className="shrink-0 mt-0.5"><ArcReactor size={26} /></div>
              <div className="rounded-2xl rounded-bl-sm px-3.5 py-2.5" style={{ background: 'rgba(63,224,255,0.07)', border: '1px solid rgba(63,224,255,0.22)' }}>
                <Loader2 size={14} className="animate-spin" style={{ color: CY }} />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="border-t border-white/10 p-2.5 flex items-center gap-2">
          <button onClick={() => toggleListen(t => sendChat(t))} disabled={!srSupported || chatBusy}
            title={srSupported ? 'Tap to speak' : 'Voice input needs Chrome'}
            style={{ background: listening ? '#ff5d6c' : 'rgba(255,255,255,0.05)', borderColor: listening ? '#ff5d6c' : 'rgba(255,255,255,0.15)', color: listening ? '#fff' : srSupported ? CY : 'rgba(255,255,255,0.3)' }}
            className={`shrink-0 rounded-xl border w-11 h-11 flex items-center justify-center transition-all disabled:opacity-40 ${listening ? 'glow-btn' : ''}`}>
            {srSupported ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()}
            disabled={chatBusy} placeholder={listening ? 'Listening…' : 'Ask your PM anything…'} style={MONO}
            className="flex-1 bg-white/[0.04] border border-white/15 rounded-xl px-3.5 py-3 text-sm outline-none focus:border-[#3fe0ff]/60 transition-colors disabled:opacity-50" />
          <button onClick={() => sendChat()} disabled={chatBusy || !chatInput.trim()}
            style={{ background: chatBusy || !chatInput.trim() ? 'rgba(63,224,255,0.25)' : CY, color: '#04121a' }}
            className="glow-btn shrink-0 rounded-xl w-11 h-11 flex items-center justify-center transition-all disabled:cursor-not-allowed">
            <Send size={17} />
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {["How does CRDO look?", "Should I buy OKLO?", "What's the macro risk today?"].map(q => (
          <button key={q} onClick={() => sendChat(q)} disabled={chatBusy} style={MONO}
            className="text-[10px] px-2.5 py-1 rounded-full border border-white/10 text-white/50 hover:border-[#3fe0ff]/50 hover:text-[#3fe0ff] transition-colors disabled:opacity-40">{q}</button>
        ))}
      </div>
      <p style={MONO} className="mt-2 text-[10px] text-white/30">
        {srSupported ? 'Tap the mic to talk, or type. ' : 'Type to chat (voice input needs Chrome). '}PM replies aloud when voice is on.
      </p>
    </div>
  );
}
