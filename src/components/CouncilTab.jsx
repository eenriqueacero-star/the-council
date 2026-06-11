import React, { useRef, useState, useEffect } from 'react';
import { Search, ChevronRight, Loader2, AlertTriangle, Crown, TrendingUp, Wallet, Play, Swords, Target, TrendingDown, Clock, Volume2, VolumeX, X } from 'lucide-react';
import { MONO, DISP, SANS, CY, ICE } from '../constants/styles.js';
import { AGENTS, ACCOUNTS, STANCE_STYLE, DEMO_TICKER, DEMO_RESULTS, DEMO_SYNTH } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent, getQuotes } from '../api.js';
import { useVoice } from '../hooks/useVoice.js';
import { notifyDevices } from '../push.js';
import { db, auth } from '../firebase.js';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { loadAgentContext, buildAgentContext } from '../utils/agentContext.js';
import { loadTickerHistory } from '../utils/rulingContext.js';

const MAX_ROUNDS = 2;

export default function CouncilTab({ account, acct, positionsLine, flagApiDown, running, setRunning, ticker, setTicker, capital, setCapital, active, setActive, agentState, setAgentState, synthesis, setSynthesis, councilAccounts, setCouncilAccounts, councilPositionsLine }) {
  const synthRef = useRef(null);
  const [liveSearch, setLiveSearch] = useState(false);
  const [debateHistory, setDebateHistory] = useState([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [drawer, setDrawer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [estimatedTotal, setEstimatedTotal] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef(null);
  const elapsedRef = useRef(0);
  const { speak, stopSpeaking, speaking } = useVoice();

  useEffect(() => () => clearInterval(timerRef.current), []);

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec.toString().padStart(2, '0')}s` : `${sec}s`;
  }

  const verdictKey = synthesis.result ? (synthesis.result.verdict === 'PASS' ? 'PASS_FINAL' : synthesis.result.verdict) : null;
  const vStyle = verdictKey ? STANCE_STYLE[verdictKey] : null;
  const quickPicks = ['AAPL', 'TSLA', 'OKLO', 'PLTR', 'AVGO', 'SMCI'];
  const isMulti    = (councilAccounts?.length ?? 1) > 1;
  const acctLabel  = isMulti ? councilAccounts.map(k => ACCOUNTS[k].label).join(' + ') : acct.label;

  const showLiveRound = running && currentRound > debateHistory.length;
  const liveLabel = currentRound <= 1
    ? `ROUND 1 · INITIAL ANALYSIS · ${active}`
    : `ROUND ${currentRound} · REBUTTAL · ${active}`;

  function openDrawer(agent, result) {
    stopSpeaking();
    setDrawer({ agent, result });
  }

  function speakAgent(agent, result) {
    if (!result) return;
    const ss = STANCE_STYLE[result.stance];
    const stanceWord = ss?.label || result.stance;
    const pts = (result.points || []).join('. ');
    speak(`${agent.name}. My assessment: ${stanceWord}. ${result.headline}. ${pts}`);
  }

  async function convene() {
    const t = ticker.trim().toUpperCase();
    if (!t || running) return;
    const uid = auth.currentUser?.uid;
    setActive(t); setRunning(true); setSynthesis({ status: 'idle', result: null });
    setDebateHistory([]); setCurrentRound(0);
    setElapsed(0); elapsedRef.current = 0;
    setEstimatedTotal(40 + 8);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => { elapsedRef.current += 1; setElapsed(s => s + 1); }, 1000);

    try {
    const acctLine = isMulti
      ? `Accounts under review: ${acctLabel}. Combined positions: ${councilPositionsLine}. Judge concentration and sizing across ALL these accounts.`
      : `Account under review: ${acct.label}'s (${acct.sub}). This account currently holds: ${councilPositionsLine}. DCA: ${acct.dcaNote}. Judge concentration and sizing against THIS account.`;
    const capLine = capital.trim() ? `Available capital to deploy: $${capital.trim()}.` : 'Available capital not specified.';

    let livePrice = null;
    let rawQuote = null;
    let priceLine = '';
    try {
      const quotes = await getQuotes([t]);
      rawQuote = quotes[t];
      livePrice = (rawQuote?.price && rawQuote.price > 0) ? rawQuote.price : rawQuote?.prevClose;
      if (livePrice) priceLine = `CURRENT LIVE PRICE: $${livePrice.toFixed(2)} (real-time quote — use this for ALL price levels, entries, stops, and targets; ignore any training-data prices). `;
    } catch {}

    const [agentCtx, tickerHistory] = await Promise.all([
      loadAgentContext(t, rawQuote),
      uid ? loadTickerHistory(uid, t, livePrice) : Promise.resolve(''),
    ]);

    const baseContent = `Ticker under consideration: ${t}. ${priceLine}The investor is thinking about BUYING it. ${acctLine} ${capLine} Today is ${new Date().toDateString()}. Return ONLY the JSON.${tickerHistory}`;
    const allRounds = [];

    for (let round = 0; round < MAX_ROUNDS; round++) {
      setCurrentRound(round + 1);
      const isFirst = round === 0;
      const init = {};
      AGENTS.forEach(a => (init[a.id] = { status: 'running', result: null, debating: !isFirst }));
      setAgentState(init);

      let debateCtx = '';
      if (!isFirst) {
        const prev = allRounds[round - 1];
        const prevLines = AGENTS.map(a => {
          const r = prev[a.id];
          if (!r || r._error) return `${a.name}: no response`;
          return `${a.name} (${r.stance}): "${r.headline}"`;
        }).join('\n');
        debateCtx = `\n\nROUND ${round} COUNCIL POSITIONS:\n${prevLines}\n\nThe council is working toward a unanimous decision. Rebut any opposing points with hard evidence. If the weight of evidence is clearly against your prior stance, update it. If it supports your stance, sharpen your argument. The goal is consensus. Return the same JSON format.`;
      }

      const userContent = baseContent + debateCtx;
      const roundResults = {};

      for (let i = 0; i < AGENTS.length; i++) {
        const a = AGENTS[i];
        const ctxSuffix = isFirst ? buildAgentContext(a.id, agentCtx) : '';
        try {
          const txt = await callAgent(a.system, userContent + ctxSuffix, a.search && liveSearch && isFirst);
          const p = extractJSON(txt);
          roundResults[a.id] = p || { stance: 'CAUTION', headline: 'Could not parse output', points: [], score: 5 };
          setAgentState(prev => ({ ...prev, [a.id]: { status: 'done', result: roundResults[a.id] } }));
        } catch (e) {
          const code = e?.message?.match(/ERR-[\w]+/)?.[0] || 'ERR-NET';
          flagApiDown();
          roundResults[a.id] = { _error: true, errorCode: code };
          setAgentState(prev => ({ ...prev, [a.id]: { status: 'error', result: null, errorCode: code } }));
        }
        if (i < AGENTS.length - 1) await new Promise(r => setTimeout(r, 3000));
      }

      allRounds.push(roundResults);
      setDebateHistory([...allRounds]);

      const stances = AGENTS.map(a => roundResults[a.id]?.stance).filter(Boolean);
      const hasBull = stances.some(s => ['PASS', 'BUY'].includes(s));
      const hasBear = stances.some(s => ['FAIL', 'BEARISH'].includes(s));
      if (!(hasBull && hasBear)) {
        setEstimatedTotal(elapsedRef.current + 8);
        break;
      }

      if (round < MAX_ROUNDS - 1) {
        const SECS = 60;
        setEstimatedTotal(elapsedRef.current + SECS + 40 + 8);
        setCooldown(SECS);
        for (let s = SECS - 1; s >= 0; s--) {
          await new Promise(r => setTimeout(r, 1000));
          setCooldown(s);
        }
      }
    }

    setSynthesis({ status: 'running', result: null });
    setTimeout(() => synthRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);

    const debateTranscript = allRounds.map((r, i) =>
      `ROUND ${i + 1}:\n${AGENTS.map(a => {
        const ag = r[a.id];
        if (!ag || ag._error) return `${a.name}: no response`;
        return `${a.name} (${a.role}): ${ag.stance} — "${ag.headline}"`;
      }).join('\n')}`
    ).join('\n\n');
    const roundWord = allRounds.length === 1 ? 'analysis (consensus in round 1)' : `${allRounds.length} rounds of debate`;

    const capProvided = capital.trim().length > 0;
    const synthSystem = `You are the PORTFOLIO MANAGER and final decision-maker for ${acctLabel}'s account${isMulti ? 's' : ''}. The investor is AGGRESSIVE — they play to win and accept volatility for outsized returns. Be bold and action-oriented. Act as a disciplined swing trader, not a fan.
The council completed ${roundWord}. Weigh all arguments against the 4-Gate Rule. BUY requires gates broadly satisfied AND conviction >= 7 AND reward-to-risk of at least 2:1. Do not let a weak bear case block a strong bull setup. If the bull thesis is compelling, lean BUY.
Decide: is this buyable NOW or only after a specific confirmation trigger? State the trigger if waiting.
${capProvided ? `Available capital: $${capital.trim()}.` : ''}
ALWAYS include: aggressive entry (buy now zone), conservative entry (buy on confirmation), stop loss, take profit, exact invalidation level (the precise price where the bull thesis is structurally dead), and the single data point that would change your verdict fastest.
If verdict is BUY and capital is stated, include exact position size (dollar amount and approximate share count).
If the thesis is long-term (multi-month hold), include a timeframe. Otherwise set timeframe to null.
Respond ONLY with JSON in a \`\`\`json block: {"verdict":"BUY"|"WATCH"|"PASS","conviction":<0-10>,"sizing":"<one line>","entry":"<aggressive entry zone>","conservativeEntry":"<confirmation-based entry>","stopLoss":"<price>","takeProfit":"<price or target>","invalidation":"<exact price where bull thesis is dead>","mindChanger":"<one data point that would flip this verdict>","positionSize":"<$ amount + approx shares if capital known, else null>","timeframe":"<e.g. 3-6 months or null>","summary":"<2-3 sentences, plain, direct>","bull":["<for>","<for>"],"risks":["<risk>","<risk>"]}`;
    try {
      const txt = await callAgent(synthSystem, `Council ${roundWord} for ${t}:\n${debateTranscript}\n\n${acctLine}\n${capLine}\n${priceLine}Final ruling. Return ONLY the JSON.`, false, 900);
      const p = extractJSON(txt);
      setSynthesis({ status: 'done', result: p || { verdict: 'WATCH', conviction: 5, sizing: 'n/a', summary: 'Could not parse synthesis.', bull: [], risks: [] } });
      if (p) {
        notifyDevices(`${t}: ${p.verdict} · ${p.conviction}/10`, p.summary || 'Council ruling is in.');
        if (uid) {
          const lastRound = allRounds[allRounds.length - 1];
          const agentStances = {};
          AGENTS.forEach(a => {
            const r = lastRound[a.id];
            if (r && !r._error) agentStances[a.id] = { stance: r.stance || null, score: r.score ?? null, headline: r.headline || null };
          });
          addDoc(collection(db, 'users', uid, 'rulings'), {
            ticker: t,
            account: isMulti ? councilAccounts.join('+') : account,
            date: new Date().toISOString().split('T')[0],
            ts: serverTimestamp(),
            priceAtCall: livePrice || null,
            agentStances,
            verdict: p.verdict, conviction: p.conviction,
            entry: p.entry || null, stopLoss: p.stopLoss || null,
            takeProfit: p.takeProfit || null, summary: p.summary || null,
            outcomeCheckedAt: null, priceAt30d: null, outcome: null,
          }).catch(() => {});
        }
      }
    } catch (e) {
      const code = e?.message?.match(/ERR-[\w]+/)?.[0] || 'ERR-NET';
      flagApiDown();
      setSynthesis({ status: 'error', result: null, errorCode: code });
    }
    } finally {
      clearInterval(timerRef.current);
      setRunning(false);
      setCooldown(0);
    }
  }

  function runDemo() {
    if (running) return;
    setTicker(DEMO_TICKER); setCapital('2000'); setActive(DEMO_TICKER); setRunning(true); setSynthesis({ status: 'idle', result: null });
    setDebateHistory([]); setCurrentRound(1);
    const init = {}; AGENTS.forEach(a => (init[a.id] = { status: 'running', result: null })); setAgentState(init);
    const order = ['risk', 'catalyst', 'technical', 'macro', 'bear', 'sizer'];
    order.forEach((id, i) => setTimeout(() => setAgentState(prev => ({ ...prev, [id]: { status: 'done', result: DEMO_RESULTS[id] } })), 700 + i * 600));
    const total = 700 + order.length * 600;
    setTimeout(() => {
      const demoRound = {};
      AGENTS.forEach(a => { demoRound[a.id] = DEMO_RESULTS[a.id]; });
      setDebateHistory([demoRound]);
      setSynthesis({ status: 'running', result: null });
      synthRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, total + 200);
    setTimeout(() => { setSynthesis({ status: 'done', result: DEMO_SYNTH }); setRunning(false); }, total + 1500);
  }

  return (
    <div className="mt-6">
      <label style={{ ...MONO, color: 'rgba(240,240,240,0.50)', letterSpacing: '0.10em' }} className="block text-[11px]">ENTER TICKER TO CONVENE THE COUNCIL</label>
      <div className="mt-2 flex gap-2 flex-wrap sm:flex-nowrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(240,240,240,0.30)' }} />
          <input value={ticker} onChange={e => setTicker(e.target.value)} onKeyDown={e => e.key === 'Enter' && convene()}
            placeholder="e.g. AAPL"
            style={{ ...MONO, letterSpacing: '0.15em', background: 'rgba(240,240,240,0.03)', borderColor: 'rgba(240,240,240,0.10)', color: '#f0f0f0' }}
            className="w-full border rounded-lg pl-9 pr-3 py-3 text-lg uppercase outline-none transition-colors"
            onFocus={e => e.target.style.borderColor = `${CY}55`}
            onBlur={e => e.target.style.borderColor = 'rgba(240,240,240,0.10)'} />
        </div>
        <button onClick={convene} disabled={running || !ticker.trim()}
          style={{ ...MONO, letterSpacing: '0.10em', fontWeight: 600, background: running || !ticker.trim() ? 'rgba(200,146,42,0.22)' : CY, color: '#0a0808' }}
          className="glow-btn w-full sm:w-auto px-6 py-3 rounded-lg flex items-center justify-center gap-2 disabled:cursor-not-allowed transition-all hover:brightness-110 whitespace-nowrap text-[13px]">
          {running ? <><Loader2 size={16} className="animate-spin" /> CONVENING…</> : <>CONVENE <ChevronRight size={16} /></>}
        </button>
      </div>

      <div className="mt-2 flex gap-2 items-center">
        <div className="relative flex-1">
          <Wallet size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(240,240,240,0.30)' }} />
          <input value={capital} onChange={e => setCapital(e.target.value.replace(/[^0-9.]/g, ''))} onKeyDown={e => e.key === 'Enter' && convene()}
            inputMode="decimal" placeholder="available capital (optional)"
            style={{ ...MONO, background: 'rgba(240,240,240,0.03)', borderColor: 'rgba(240,240,240,0.10)', color: '#f0f0f0' }}
            className="w-full border rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none transition-colors"
            onFocus={e => e.target.style.borderColor = `${CY}55`}
            onBlur={e => e.target.style.borderColor = 'rgba(240,240,240,0.10)'} />
          {capital.trim() && <span style={{ ...MONO, color: '#c9a84c' }} className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px]">${Number(capital).toLocaleString()}</span>}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span style={{ ...MONO, color: 'rgba(240,240,240,0.35)', letterSpacing: '0.10em' }} className="text-[10px]">ACCOUNTS:</span>
        {Object.entries(ACCOUNTS).map(([key, a]) => {
          const sel = councilAccounts?.includes(key);
          return (
            <button key={key} disabled={running}
              onClick={() => {
                if (!setCouncilAccounts) return;
                if (sel && councilAccounts.length === 1) return;
                setCouncilAccounts(sel ? councilAccounts.filter(k => k !== key) : [...councilAccounts, key]);
              }}
              style={{ ...MONO, background: sel ? 'rgba(200,146,42,0.12)' : 'rgba(240,240,240,0.03)', border: `1px solid ${sel ? `${CY}55` : 'rgba(240,240,240,0.10)'}`, color: sel ? CY : 'rgba(240,240,240,0.40)' }}
              className="text-[10px] px-2.5 py-1 rounded-lg transition-all disabled:opacity-40 hover:brightness-110">
              {a.label}
            </button>
          );
        })}
        {isMulti && <span style={{ ...MONO, color: 'rgba(240,240,240,0.30)' }} className="text-[10px]">combined analysis</span>}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button onClick={() => setLiveSearch(v => !v)}
          style={{ ...MONO, borderColor: liveSearch ? `${ICE}66` : 'rgba(240,240,240,0.12)', color: liveSearch ? ICE : 'rgba(240,240,240,0.40)' }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] transition-colors">
          <Search size={11} />
          <span>{liveSearch ? 'LIVE SEARCH ON' : 'LIVE SEARCH OFF'}</span>
        </button>
        <span style={{ ...MONO, color: 'rgba(240,240,240,0.25)' }} className="text-[10px]">off saves ~6¢/run</span>
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span style={{ ...MONO, color: 'rgba(240,240,240,0.30)', letterSpacing: '0.10em' }} className="text-[10px]">QUICK:</span>
        {quickPicks.map(q => (
          <button key={q} onClick={() => setTicker(q)} disabled={running}
            style={{ ...MONO, borderColor: 'rgba(240,240,240,0.10)', color: 'rgba(240,240,240,0.55)' }}
            className="text-[11px] px-2.5 py-1 rounded border transition-colors disabled:opacity-40 hover:border-[rgba(200,146,42,0.45)] hover:text-[#c8922a]">{q}</button>
        ))}
        <button onClick={runDemo} disabled={running}
          style={{ ...MONO, borderColor: `${ICE}33`, color: ICE }}
          className="ml-auto text-[11px] px-3 py-1 rounded border transition-colors disabled:opacity-40 flex items-center gap-1.5">
          <Play size={11} /> SEE DEMO
        </button>
      </div>

      {running && (() => {
        const remaining = Math.max(0, estimatedTotal - elapsed);
        return (
          <div className="mt-2 flex items-center gap-1.5" style={MONO}>
            <Clock size={11} style={{ color: CY }} />
            <span className="text-[11px]" style={{ color: CY }}>
              {remaining > 0 ? `~${formatTime(remaining)} remaining` : 'finishing up…'}
            </span>
          </div>
        );
      })()}

      {active && (
        <div className="mt-8">
          {debateHistory.map((roundResults, ri) => {
            const isLastDone = ri === debateHistory.length - 1 && !showLiveRound;
            const label = ri === 0 ? `ROUND 1 · INITIAL ANALYSIS · ${active}` : `ROUND ${ri + 1} · REBUTTAL · ${active}`;
            return (
              <div key={ri} className={!isLastDone ? 'opacity-60 mb-2' : 'mb-2'}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-px flex-1" style={{ background: 'rgba(240,240,240,0.08)' }} />
                  <span style={{ ...MONO, color: 'rgba(240,240,240,0.40)', letterSpacing: '0.10em' }} className="text-[10px]">{label}</span>
                  <div className="h-px flex-1" style={{ background: 'rgba(240,240,240,0.08)' }} />
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {AGENTS.map(a => {
                    const r = roundResults[a.id];
                    const Icon = a.icon;
                    const ss = r && STANCE_STYLE[r.stance];
                    return (
                      <div key={a.id} onClick={() => r && !r._error && openDrawer(a, r)}
                        style={{ background: '#111111', borderColor: (r && !r._error) ? `${a.accent}38` : 'rgba(192,57,43,0.25)', cursor: (r && !r._error) ? 'pointer' : 'default' }}
                        className="gold-card lift p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="rounded-lg p-2" style={{ background: `${a.accent}1a`, border: `1px solid ${a.accent}2a` }}><Icon size={15} style={{ color: a.accent }} /></div>
                            <div><div style={{ ...MONO, fontWeight: 600 }} className="text-[13px] leading-tight">{a.name}</div><div style={{ ...MONO, color: 'rgba(240,240,240,0.35)' }} className="text-[9px] mt-0.5">{a.role}</div></div>
                          </div>
                          {ss && <span style={{ ...MONO, background: ss.bg, color: ss.fg }} className="text-[9px] font-semibold px-2 py-1 rounded whitespace-nowrap">{ss.label}</span>}
                        </div>
                        {r && !r._error && (
                          <div className="mt-3">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <p className="text-[13px] font-medium leading-snug" style={{ color: a.accent }}>{r.headline}</p>
                              {typeof r.score === 'number' && <span style={{ ...MONO, color: 'rgba(240,240,240,0.40)' }} className="text-[10px] whitespace-nowrap">{r.score}/10</span>}
                            </div>
                            <ul className="space-y-1.5">
                              {(r.points || []).map((p, j) => (
                                <li key={j} className="flex gap-2 text-[12px] leading-snug" style={{ color: 'rgba(240,240,240,0.65)' }}>
                                  <span style={{ color: a.accent }} className="mt-[3px]">▸</span><span>{p}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {r?._error && <div className="mt-3 flex items-center gap-2" style={{ ...MONO, color: '#c0392b' }}><AlertTriangle size={12} /><span className="text-[11px]">{r.errorCode || 'ERR-NET'}</span></div>}
                        {r && !r._error && <div style={{ ...MONO, color: 'rgba(240,240,240,0.20)' }} className="mt-3 text-[9px] text-right">tap to hear ›</div>}
                      </div>
                    );
                  })}
                </div>
                {(showLiveRound || ri < debateHistory.length - 1) && (
                  <div className="flex items-center gap-3 my-5">
                    <div className="h-px flex-1" style={{ background: 'rgba(240,240,240,0.05)' }} />
                    <div className="flex items-center gap-1.5" style={{ ...MONO, color: 'rgba(240,240,240,0.22)', letterSpacing: '0.10em' }}>
                      <Swords size={11} />
                      <span className="text-[10px]">AGENTS REBUTTING</span>
                      <Swords size={11} />
                    </div>
                    <div className="h-px flex-1" style={{ background: 'rgba(240,240,240,0.05)' }} />
                  </div>
                )}
              </div>
            );
          })}

          {cooldown > 0 && (
            <div className="flex items-center gap-3 my-5">
              <div className="h-px flex-1" style={{ background: 'rgba(240,240,240,0.05)' }} />
              <div className="flex items-center gap-1.5" style={{ ...MONO, color: CY, letterSpacing: '0.10em' }}>
                <Clock size={11} />
                <span className="text-[10px]">RATE LIMIT COOLDOWN · {cooldown}s · ROUND 2 INCOMING</span>
                <Clock size={11} />
              </div>
              <div className="h-px flex-1" style={{ background: 'rgba(240,240,240,0.05)' }} />
            </div>
          )}

          {showLiveRound && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1" style={{ background: 'rgba(240,240,240,0.08)' }} />
                <span style={{ ...MONO, color: 'rgba(240,240,240,0.40)', letterSpacing: '0.10em' }} className="text-[10px]">{liveLabel}</span>
                <div className="h-px flex-1" style={{ background: 'rgba(240,240,240,0.08)' }} />
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {AGENTS.map(a => {
                  const st = agentState[a.id] || { status: 'idle' };
                  const Icon = a.icon; const r = st.result; const ss = r && STANCE_STYLE[r.stance];
                  return (
                    <div key={a.id} onClick={() => st.status === 'done' && r && openDrawer(a, r)}
                      style={{ animation: st.status === 'done' ? 'cardIn .5s cubic-bezier(.2,.7,.2,1) both' : undefined, background: '#111111', borderColor: st.status === 'done' ? `${a.accent}38` : 'rgba(240,240,240,0.07)', cursor: st.status === 'done' ? 'pointer' : 'default' }}
                      className="gold-card lift p-4 relative">
                      {st.status === 'running' && <div className="absolute left-0 right-0 h-12 scanline" style={{ background: `linear-gradient(${a.accent}18, transparent)` }} />}
                      <div className="flex items-start justify-between gap-2 relative">
                        <div className="flex items-center gap-2.5">
                          <div className="rounded-lg p-2" style={{ background: `${a.accent}1a`, border: `1px solid ${a.accent}2a` }}><Icon size={15} style={{ color: a.accent }} /></div>
                          <div><div style={{ ...MONO, fontWeight: 600 }} className="text-[13px] leading-tight">{a.name}</div><div style={{ ...MONO, color: 'rgba(240,240,240,0.35)' }} className="text-[9px] mt-0.5">{a.role}</div></div>
                        </div>
                        {st.status === 'done' && ss && <span style={{ ...MONO, background: ss.bg, color: ss.fg }} className="text-[9px] font-semibold px-2 py-1 rounded whitespace-nowrap">{ss.label}</span>}
                      </div>
                      {st.status === 'running' && <div className="mt-4 flex items-center gap-2" style={{ ...MONO, color: 'rgba(240,240,240,0.40)' }}><Loader2 size={13} className="animate-spin" /><span className="text-[11px]">{st.debating ? 'rebutting…' : 'analyzing…'}</span></div>}
                      {st.status === 'error'   && <div className="mt-4 flex items-center gap-2" style={{ ...MONO, color: '#c0392b' }}><AlertTriangle size={13} /><span className="text-[11px]">{st.errorCode || 'ERR-NET'} — retry</span></div>}
                      {st.status === 'done' && r && (
                        <div className="mt-3 relative">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <p className="text-[13px] font-medium leading-snug" style={{ color: a.accent }}>{r.headline}</p>
                            {typeof r.score === 'number' && <span style={{ ...MONO, color: 'rgba(240,240,240,0.40)' }} className="text-[10px] whitespace-nowrap">{r.score}/10</span>}
                          </div>
                          <ul className="space-y-1.5">
                            {(r.points || []).map((p, j) => (
                              <li key={j} className="flex gap-2 text-[12px] leading-snug" style={{ color: 'rgba(240,240,240,0.65)' }}>
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
        </div>
      )}

      {active && (
        <div ref={synthRef} className="mt-5">
          {synthesis.status === 'running' && (
            <div className="border rounded-xl p-6 flex items-center gap-3" style={{ ...MONO, background: '#111111', borderColor: `${CY}28`, color: CY }}>
              <Loader2 size={16} className="animate-spin" /><span className="text-sm">Portfolio Manager reviewing the full debate…</span>
            </div>
          )}
          {synthesis.status === 'error' && (
            <div className="border rounded-xl p-5 flex items-center gap-3" style={{ ...MONO, background: '#111111', borderColor: 'rgba(192,57,43,0.28)', color: '#c0392b' }}>
              <AlertTriangle size={16} />
              <div>
                <div className="text-sm font-semibold">{synthesis.errorCode || 'ERR-NET'} — PM synthesis failed</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'rgba(240,240,240,0.40)' }}>
                  {synthesis.errorCode === 'ERR-401' ? 'Session expired — refresh the page.' :
                   synthesis.errorCode === 'ERR-429' ? 'Rate limit — wait 30 seconds and retry.' :
                   synthesis.errorCode === 'ERR-CFG' ? 'GROQ_API_KEY not set in Vercel env vars.' :
                   'Check your connection and try again.'}
                </div>
              </div>
            </div>
          )}
          {synthesis.status === 'done' && synthesis.result && vStyle && (
            <div style={{ animation: 'cardIn .5s cubic-bezier(.2,.7,.2,1) both', background: '#0d0d0d', borderColor: `${vStyle.fg}44`, boxShadow: `0 0 24px ${vStyle.fg}14` }}
              className="border rounded-xl p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Crown size={14} style={{ color: CY }} />
                <span style={{ ...MONO, letterSpacing: '0.10em', color: 'rgba(240,240,240,0.70)', fontWeight: 600 }} className="text-[11px]">PORTFOLIO MANAGER · FINAL RULING</span>
              </div>
              <div className="flex items-center gap-5 flex-wrap">
                <div style={{ background: vStyle.bg, border: `1px solid ${vStyle.fg}44` }} className="rounded-xl px-6 py-4 text-center">
                  <div style={{ ...MONO, color: vStyle.fg, letterSpacing: '0.08em', fontWeight: 700 }} className="text-3xl">{vStyle.label}</div>
                  <div style={{ ...MONO, color: 'rgba(240,240,240,0.40)', letterSpacing: '0.10em' }} className="text-[10px] mt-1">{active} · {acctLabel}</div>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <div className="flex items-center justify-between text-[11px] mb-1" style={{ ...MONO, color: 'rgba(240,240,240,0.45)' }}><span>CONVICTION</span><span>{synthesis.result.conviction}/10</span></div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(240,240,240,0.08)' }}>
                    <div style={{ width: `${(synthesis.result.conviction / 10) * 100}%`, background: vStyle.fg, transition: 'width .8s ease' }} className="h-full rounded-full" />
                  </div>
                  <div className="mt-3 flex items-start gap-2 text-[12px]" style={{ ...MONO, color: 'rgba(240,240,240,0.60)' }}>
                    <TrendingUp size={13} className="mt-0.5 shrink-0" style={{ color: 'rgba(240,240,240,0.40)' }} /><span>{synthesis.result.sizing}</span>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-[14px] leading-relaxed" style={{ ...SANS, color: 'rgba(240,240,240,0.80)' }}>{synthesis.result.summary}</p>
              {(synthesis.result.entry || synthesis.result.stopLoss || synthesis.result.takeProfit) && (
                <div className="mt-4 rounded-xl p-4" style={{ background: 'rgba(240,240,240,0.02)', border: '1px solid rgba(240,240,240,0.07)' }}>
                  <div style={{ ...MONO, letterSpacing: '0.10em', color: 'rgba(240,240,240,0.35)' }} className="text-[10px] mb-3">TRADE PLAN</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {synthesis.result.entry && (<div><div className="flex items-center gap-1 mb-1"><Target size={10} style={{ color: ICE }} /><span style={{ ...MONO, color: 'rgba(240,240,240,0.35)' }} className="text-[9px]">AGGRESSIVE ENTRY</span></div><div className="text-[13px] font-medium" style={{ ...MONO, color: ICE }}>{synthesis.result.entry}</div></div>)}
                    {synthesis.result.conservativeEntry && (<div><div className="flex items-center gap-1 mb-1"><Target size={10} style={{ color: `${ICE}80` }} /><span style={{ ...MONO, color: 'rgba(240,240,240,0.35)' }} className="text-[9px]">CONSERVATIVE ENTRY</span></div><div className="text-[13px] font-medium" style={{ ...MONO, color: `${ICE}cc` }}>{synthesis.result.conservativeEntry}</div></div>)}
                    {synthesis.result.stopLoss && (<div><div className="flex items-center gap-1 mb-1"><TrendingDown size={10} style={{ color: '#c0392b' }} /><span style={{ ...MONO, color: 'rgba(240,240,240,0.35)' }} className="text-[9px]">STOP LOSS</span></div><div className="text-[13px] font-medium" style={{ ...MONO, color: '#c0392b' }}>{synthesis.result.stopLoss}</div></div>)}
                    {synthesis.result.invalidation && (<div><div className="flex items-center gap-1 mb-1"><X size={10} style={{ color: '#c0392b' }} /><span style={{ ...MONO, color: 'rgba(240,240,240,0.35)' }} className="text-[9px]">INVALIDATION</span></div><div className="text-[13px] font-medium" style={{ ...MONO, color: 'rgba(192,57,43,0.75)' }}>{synthesis.result.invalidation}</div></div>)}
                    {synthesis.result.takeProfit && (<div><div className="flex items-center gap-1 mb-1"><TrendingUp size={10} style={{ color: '#c9a84c' }} /><span style={{ ...MONO, color: 'rgba(240,240,240,0.35)' }} className="text-[9px]">TAKE PROFIT</span></div><div className="text-[13px] font-medium" style={{ ...MONO, color: '#c9a84c' }}>{synthesis.result.takeProfit}</div></div>)}
                    {synthesis.result.positionSize && (<div><div className="flex items-center gap-1 mb-1"><Wallet size={10} style={{ color: CY }} /><span style={{ ...MONO, color: 'rgba(240,240,240,0.35)' }} className="text-[9px]">POSITION SIZE</span></div><div className="text-[13px] font-medium" style={{ ...MONO, color: CY }}>{synthesis.result.positionSize}</div></div>)}
                    {synthesis.result.timeframe && (<div><div className="flex items-center gap-1 mb-1"><Clock size={10} style={{ color: 'rgba(240,240,240,0.40)' }} /><span style={{ ...MONO, color: 'rgba(240,240,240,0.35)' }} className="text-[9px]">TIMEFRAME</span></div><div className="text-[13px] font-medium" style={{ ...MONO, color: 'rgba(240,240,240,0.70)' }}>{synthesis.result.timeframe}</div></div>)}
                  </div>
                  {synthesis.result.mindChanger && (<div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(240,240,240,0.07)' }}><span style={{ ...MONO, color: 'rgba(240,240,240,0.30)', letterSpacing: '0.08em' }} className="text-[9px]">WOULD FLIP VERDICT: </span><span className="text-[12px]" style={{ ...SANS, color: 'rgba(240,240,240,0.55)' }}>{synthesis.result.mindChanger}</span></div>)}
                </div>
              )}
              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                <div className="rounded-lg p-3" style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.16)' }}>
                  <div style={{ ...MONO, color: '#c9a84c', letterSpacing: '0.10em' }} className="text-[10px] mb-1.5">BULL</div>
                  <ul className="space-y-1">{(synthesis.result.bull || []).map((b, i) => <li key={i} className="text-[12px] flex gap-1.5" style={{ ...SANS, color: 'rgba(240,240,240,0.70)' }}><span style={{ color: '#c9a84c' }}>+</span>{b}</li>)}</ul>
                </div>
                <div className="rounded-lg p-3" style={{ background: 'rgba(192,57,43,0.05)', border: '1px solid rgba(192,57,43,0.16)' }}>
                  <div style={{ ...MONO, color: '#c0392b', letterSpacing: '0.10em' }} className="text-[10px] mb-1.5">RISKS</div>
                  <ul className="space-y-1">{(synthesis.result.risks || []).map((b, i) => <li key={i} className="text-[12px] flex gap-1.5" style={{ ...SANS, color: 'rgba(240,240,240,0.70)' }}><span style={{ color: '#c0392b' }}>!</span>{b}</li>)}</ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!active && (
        <div className="mt-12 text-center py-10 border border-dashed rounded-xl" style={{ borderColor: 'rgba(240,240,240,0.08)' }}>
          <Crown size={28} className="mx-auto mb-3" style={{ color: CY, opacity: 0.22 }} />
          <p style={{ ...SANS, color: 'rgba(240,240,240,0.45)' }} className="text-sm">Type a ticker and convene the council for {acctLabel}.</p>
          <p style={{ ...MONO, color: 'rgba(240,240,240,0.25)' }} className="text-[11px] mt-2">6 specialists analyze → debate → PM delivers the ruling.</p>
        </div>
      )}

      {drawer && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={() => { stopSpeaking(); setDrawer(null); }} />
          <div className="fixed right-0 top-0 bottom-0 z-50 flex flex-col w-full max-w-sm"
            style={{ background: '#0d0d0d', borderLeft: `1px solid ${drawer.agent.accent}28`, animation: 'slideInRight .25s ease' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid rgba(240,240,240,0.07)' }}>
              <div className="flex items-center gap-3">
                <div className="rounded-xl p-2.5" style={{ background: `${drawer.agent.accent}1a`, border: `1px solid ${drawer.agent.accent}33` }}>
                  <drawer.agent.icon size={16} style={{ color: drawer.agent.accent }} />
                </div>
                <div>
                  <div style={{ ...MONO, fontWeight: 700 }} className="text-[14px] leading-tight">{drawer.agent.name}</div>
                  <div style={{ ...MONO, color: 'rgba(240,240,240,0.35)' }} className="text-[10px] mt-0.5">{drawer.agent.role}</div>
                </div>
              </div>
              <button onClick={() => { stopSpeaking(); setDrawer(null); }} className="text-white/30 hover:text-white/70 transition-colors p-1">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {(() => {
                const ss = STANCE_STYLE[drawer.result.stance];
                return (
                  <div className="flex items-center justify-between">
                    {ss && <span style={{ ...MONO, background: ss.bg, color: ss.fg, fontSize: 11 }} className="font-bold px-3 py-1.5 rounded-lg">{ss.label}</span>}
                    {typeof drawer.result.score === 'number' && (
                      <div className="text-right">
                        <div style={{ ...MONO, color: 'rgba(240,240,240,0.35)', letterSpacing: '0.10em' }} className="text-[10px] mb-1">CONVICTION</div>
                        <div style={{ ...MONO, color: drawer.agent.accent }} className="text-lg font-bold">{drawer.result.score}<span style={{ color: 'rgba(240,240,240,0.30)' }} className="text-xs">/10</span></div>
                      </div>
                    )}
                  </div>
                );
              })()}
              <div>
                <div style={{ ...MONO, color: 'rgba(240,240,240,0.30)', letterSpacing: '0.10em' }} className="text-[9px] mb-1.5">HEADLINE</div>
                <p className="text-[15px] font-medium leading-snug" style={{ color: drawer.agent.accent }}>{drawer.result.headline}</p>
              </div>
              <div>
                <div style={{ ...MONO, color: 'rgba(240,240,240,0.30)', letterSpacing: '0.10em' }} className="text-[9px] mb-2">ANALYSIS</div>
                <ul className="space-y-3">
                  {(drawer.result.points || []).map((pt, i) => (
                    <li key={i} className="flex gap-3 text-[13px] leading-relaxed" style={{ ...SANS, color: 'rgba(240,240,240,0.75)' }}>
                      <span style={{ color: drawer.agent.accent }} className="mt-[2px] text-[10px]">▸</span>
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="p-5" style={{ borderTop: '1px solid rgba(240,240,240,0.07)' }}>
              <button onClick={() => speaking ? stopSpeaking() : speakAgent(drawer.agent, drawer.result)}
                style={{ ...MONO, background: speaking ? `${drawer.agent.accent}22` : `${drawer.agent.accent}18`, border: `1px solid ${drawer.agent.accent}40`, color: drawer.agent.accent }}
                className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl transition-all hover:brightness-110">
                {speaking ? <VolumeX size={16} /> : <Volume2 size={16} />}
                <span className="text-[12px] font-semibold tracking-wider">{speaking ? 'STOP' : 'SPEAK ANALYSIS'}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
