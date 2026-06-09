import React, { useRef } from 'react';
import { Search, ChevronRight, Loader2, AlertTriangle, Crown, TrendingUp, Wallet, Play } from 'lucide-react';
import { MONO, DISP } from '../constants/styles.js';
import { AGENTS, STANCE_STYLE, DEMO_TICKER, DEMO_RESULTS, DEMO_SYNTH } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent } from '../api.js';

export default function CouncilTab({ account, acct, positionsLine, flagApiDown, running, setRunning, ticker, setTicker, capital, setCapital, active, setActive, agentState, setAgentState, synthesis, setSynthesis }) {
  const synthRef = useRef(null);

  const verdictKey = synthesis.result ? (synthesis.result.verdict === 'PASS' ? 'PASS_FINAL' : synthesis.result.verdict) : null;
  const vStyle = verdictKey ? STANCE_STYLE[verdictKey] : null;

  const quickPicks = ['AAPL', 'TSLA', 'OKLO', 'PLTR', 'AVGO', 'SMCI'];

  async function convene() {
    const t = ticker.trim().toUpperCase();
    if (!t || running) return;
    setActive(t); setRunning(true); setSynthesis({ status: 'idle', result: null });
    const init = {}; AGENTS.forEach(a => (init[a.id] = { status: 'running', result: null })); setAgentState(init);
    const acctLine = `Account under review: ${acct.label}'s (${acct.sub}). This account currently holds: ${positionsLine}. DCA: ${acct.dcaNote}. Judge concentration and sizing against THIS account.`;
    const capLine = capital.trim() ? `Available capital to deploy: $${capital.trim()}.` : 'Available capital not specified.';
    const userContent = `Ticker under consideration: ${t}. The investor is thinking about BUYING it. ${acctLine} ${capLine} Today is ${new Date().toDateString()}. Return ONLY the JSON.`;
    const results = {};
    await Promise.all(AGENTS.map(async a => {
      try {
        const txt = await callAgent(a.system, userContent, a.search);
        const p = extractJSON(txt);
        results[a.id] = p || { stance: 'CAUTION', headline: 'Could not parse output', points: ['Agent returned unstructured data.'], score: 5 };
        setAgentState(prev => ({ ...prev, [a.id]: { status: 'done', result: results[a.id] } }));
      } catch {
        flagApiDown();
        results[a.id] = null;
        setAgentState(prev => ({ ...prev, [a.id]: { status: 'error', result: null } }));
      }
    }));
    setSynthesis({ status: 'running', result: null });
    setTimeout(() => synthRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
    const council = AGENTS.map(a => `${a.name} (${a.role}): ${JSON.stringify(results[a.id])}`).join('\n');
    const synthSystem = `You are the PORTFOLIO MANAGER and final decision-maker. ${acct.label}'s account.
Five specialists weighed in. Weigh against the 4-Gate Rule. BUY requires gates broadly satisfied AND conviction >= 7. If macro is a headwind day, downgrade to WATCH. Respect a strong unrebutted bear case.
Respond ONLY with JSON in a \`\`\`json block: {"verdict":"BUY"|"WATCH"|"PASS","conviction":<0-10>,"sizing":"<one line>","summary":"<2-3 sentences, plain, direct>","bull":["<for>","<for>"],"risks":["<risk>","<risk>"]}`;
    try {
      const txt = await callAgent(synthSystem, `Council inputs for ${t}:\n${council}\n\n${acctLine}\n${capLine}\n\nFinal ruling. Return ONLY the JSON.`, false);
      const p = extractJSON(txt);
      setSynthesis({ status: 'done', result: p || { verdict: 'WATCH', conviction: 5, sizing: 'n/a', summary: 'Could not parse synthesis.', bull: [], risks: [] } });
    } catch {
      flagApiDown();
      setSynthesis({ status: 'error', result: null });
    }
    setRunning(false);
  }

  function runDemo() {
    if (running) return;
    setTicker(DEMO_TICKER); setCapital('2000'); setActive(DEMO_TICKER); setRunning(true); setSynthesis({ status: 'idle', result: null });
    const init = {}; AGENTS.forEach(a => (init[a.id] = { status: 'running', result: null })); setAgentState(init);
    const order = ['risk', 'catalyst', 'technical', 'macro', 'bear', 'sizer'];
    order.forEach((id, i) => setTimeout(() => setAgentState(prev => ({ ...prev, [id]: { status: 'done', result: DEMO_RESULTS[id] } })), 700 + i * 600));
    const total = 700 + order.length * 600;
    setTimeout(() => { setSynthesis({ status: 'running', result: null }); synthRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, total + 200);
    setTimeout(() => { setSynthesis({ status: 'done', result: DEMO_SYNTH }); setRunning(false); }, total + 1500);
  }

  return (
    <div className="mt-6">
      <label style={MONO} className="block text-[11px] text-white/50 tracking-widest">ENTER TICKER TO CONVENE THE COUNCIL</label>
      <div className="mt-2 flex gap-2 flex-wrap sm:flex-nowrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={ticker} onChange={e => setTicker(e.target.value)} onKeyDown={e => e.key === 'Enter' && convene()}
            placeholder="e.g. AAPL" style={{ ...MONO, letterSpacing: '0.15em' }}
            className="w-full bg-white/[0.04] border border-white/15 rounded-lg pl-9 pr-3 py-3 text-lg uppercase outline-none focus:border-[#f5c451]/60 transition-colors" />
        </div>
        <button onClick={convene} disabled={running || !ticker.trim()}
          style={{ ...DISP, letterSpacing: '0.08em', background: running || !ticker.trim() ? 'rgba(245,196,81,0.25)' : '#f5c451', color: '#0a0a0a' }}
          className="glow-btn w-full sm:w-auto px-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:cursor-not-allowed transition-all hover:brightness-110 whitespace-nowrap">
          {running ? <><Loader2 size={18} className="animate-spin" /> CONVENING…</> : <>CONVENE <ChevronRight size={18} /></>}
        </button>
      </div>

      <div className="mt-2 flex gap-2 items-center">
        <div className="relative flex-1">
          <Wallet size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={capital} onChange={e => setCapital(e.target.value.replace(/[^0-9.]/g, ''))} onKeyDown={e => e.key === 'Enter' && convene()}
            inputMode="decimal" placeholder="available capital (optional)" style={MONO}
            className="w-full bg-white/[0.04] border border-white/15 rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none focus:border-[#7ee787]/60 transition-colors" />
          {capital.trim() && <span style={MONO} className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#7ee787]">${Number(capital).toLocaleString()}</span>}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span style={MONO} className="text-[10px] text-white/30">QUICK:</span>
        {quickPicks.map(q => (
          <button key={q} onClick={() => setTicker(q)} disabled={running} style={MONO}
            className="text-[11px] px-2.5 py-1 rounded border border-white/10 text-white/55 hover:border-[#f5c451]/50 hover:text-[#f5c451] transition-colors disabled:opacity-40">{q}</button>
        ))}
        <button onClick={runDemo} disabled={running} style={MONO}
          className="ml-auto text-[11px] px-3 py-1 rounded border border-[#38e0d4]/40 text-[#38e0d4] hover:bg-[#38e0d4]/10 transition-colors disabled:opacity-40 flex items-center gap-1.5">
          <Play size={11} /> SEE DEMO
        </button>
      </div>

      {active && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-white/10" />
            <span style={MONO} className="text-[10px] text-white/40 tracking-widest">COUNCIL REVIEWING {active} · FOR {acct.label.toUpperCase()}</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {AGENTS.map(a => {
              const st = agentState[a.id] || { status: 'idle' };
              const Icon = a.icon; const r = st.result; const ss = r && STANCE_STYLE[r.stance];
              return (
                <div key={a.id} style={{ animation: st.status === 'done' ? 'cardIn .5s cubic-bezier(.2,.7,.2,1) both' : undefined, borderColor: st.status === 'done' ? `${a.accent}40` : 'rgba(255,255,255,0.08)' }}
                  className="hud lift relative bg-white/[0.025] border rounded-xl p-4 overflow-hidden">
                  {st.status === 'running' && <div className="absolute left-0 right-0 h-12 scanline" style={{ background: `linear-gradient(${a.accent}22, transparent)` }} />}
                  <div className="flex items-start justify-between gap-2 relative">
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-lg p-2" style={{ background: `${a.accent}1a`, border: `1px solid ${a.accent}33` }}><Icon size={16} style={{ color: a.accent }} /></div>
                      <div><div style={DISP} className="text-sm font-semibold leading-tight">{a.name}</div><div style={MONO} className="text-[9px] text-white/35 mt-0.5">{a.role}</div></div>
                    </div>
                    {st.status === 'done' && ss && <span style={{ ...MONO, background: ss.bg, color: ss.fg }} className="text-[9px] font-semibold px-2 py-1 rounded whitespace-nowrap">{ss.label}</span>}
                  </div>
                  {st.status === 'running' && <div className="mt-4 flex items-center gap-2 text-white/40" style={MONO}><Loader2 size={13} className="animate-spin" /><span className="text-[11px]">searching · analyzing…</span></div>}
                  {st.status === 'error'   && <div className="mt-4 flex items-center gap-2 text-[#ff5d6c]" style={MONO}><AlertTriangle size={13} /><span className="text-[11px]">agent error — retry</span></div>}
                  {st.status === 'done' && r && (
                    <div className="mt-3 relative">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-[13px] font-medium leading-snug" style={{ color: a.accent }}>{r.headline}</p>
                        {typeof r.score === 'number' && <span style={MONO} className="text-[10px] text-white/40 whitespace-nowrap">{r.score}/10</span>}
                      </div>
                      <ul className="space-y-1.5">
                        {(r.points || []).map((p, j) => (
                          <li key={j} className="flex gap-2 text-[12px] text-white/65 leading-snug">
                            <span style={{ color: a.accent }} className="mt-[3px]">▸</span><span>{p}</span>
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
        <div ref={synthRef} className="mt-5">
          {synthesis.status === 'running' && (
            <div className="bg-white/[0.025] border border-[#f5c451]/30 rounded-xl p-6 flex items-center gap-3 text-[#f5c451]" style={MONO}>
              <Loader2 size={18} className="animate-spin" /><span className="text-sm">Portfolio Manager synthesizing the council's ruling…</span>
            </div>
          )}
          {synthesis.status === 'done' && synthesis.result && vStyle && (
            <div style={{ animation: 'cardIn .5s cubic-bezier(.2,.7,.2,1) both', borderColor: `${vStyle.fg}55`, boxShadow: `0 0 30px ${vStyle.fg}22` }}
              className="border bg-gradient-to-b from-white/[0.05] to-white/[0.02] rounded-xl p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Crown size={16} style={{ color: '#f5c451' }} />
                <span style={{ ...DISP, letterSpacing: '0.06em' }} className="text-sm font-semibold">PORTFOLIO MANAGER · FINAL RULING</span>
              </div>
              <div className="flex items-center gap-5 flex-wrap">
                <div style={{ background: vStyle.bg, border: `1px solid ${vStyle.fg}55` }} className="rounded-xl px-6 py-4 text-center">
                  <div style={{ ...DISP, color: vStyle.fg, letterSpacing: '0.05em' }} className="text-3xl font-bold">{vStyle.label}</div>
                  <div style={MONO} className="text-[10px] text-white/40 mt-1">{active} · {acct.label}</div>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <div className="flex items-center justify-between text-[11px] text-white/45 mb-1" style={MONO}><span>CONVICTION</span><span>{synthesis.result.conviction}/10</span></div>
                  <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                    <div style={{ width: `${(synthesis.result.conviction / 10) * 100}%`, background: vStyle.fg, transition: 'width .8s ease' }} className="h-full rounded-full" />
                  </div>
                  <div className="mt-3 flex items-start gap-2 text-[12px] text-white/60" style={MONO}>
                    <TrendingUp size={13} className="mt-0.5 text-white/40" /><span>{synthesis.result.sizing}</span>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-[14px] text-white/80 leading-relaxed">{synthesis.result.summary}</p>
              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                <div className="rounded-lg p-3" style={{ background: 'rgba(56,224,138,0.06)', border: '1px solid rgba(56,224,138,0.18)' }}>
                  <div style={{ ...MONO, color: '#38e08a' }} className="text-[10px] mb-1.5 tracking-widest">BULL</div>
                  <ul className="space-y-1">{(synthesis.result.bull || []).map((b, i) => <li key={i} className="text-[12px] text-white/70 flex gap-1.5"><span className="text-[#38e08a]">+</span>{b}</li>)}</ul>
                </div>
                <div className="rounded-lg p-3" style={{ background: 'rgba(255,93,108,0.06)', border: '1px solid rgba(255,93,108,0.18)' }}>
                  <div style={{ ...MONO, color: '#ff5d6c' }} className="text-[10px] mb-1.5 tracking-widest">RISKS</div>
                  <ul className="space-y-1">{(synthesis.result.risks || []).map((b, i) => <li key={i} className="text-[12px] text-white/70 flex gap-1.5"><span className="text-[#ff5d6c]">!</span>{b}</li>)}</ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!active && (
        <div className="mt-12 text-center py-10 border border-dashed border-white/10 rounded-xl">
          <Crown size={32} className="mx-auto mb-3 opacity-30" style={{ color: '#f5c451' }} />
          <p className="text-white/45 text-sm">Type a ticker and convene the council for {acct.label}.</p>
          <p style={MONO} className="text-[11px] text-white/25 mt-2">6 specialists review in parallel → the PM delivers one ruling.</p>
        </div>
      )}
    </div>
  );
}
