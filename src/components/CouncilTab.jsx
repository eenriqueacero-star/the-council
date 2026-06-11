import React, { useRef, useState, useEffect } from 'react';
import { Search, ChevronRight, Loader2, AlertTriangle, Crown, TrendingUp, Wallet, Swords, Target, TrendingDown, Clock, Volume2, VolumeX, X } from 'lucide-react';
import { MONO, SANS } from '../constants/styles.js';
import { AGENTS, ACCOUNTS, STANCE_STYLE } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent, getQuotes } from '../api.js';
import { useVoice } from '../hooks/useVoice.js';
import { notifyDevices } from '../push.js';
import { db, auth } from '../firebase.js';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { loadAgentContext, buildAgentContext } from '../utils/agentContext.js';
import { loadTickerHistory } from '../utils/rulingContext.js';

const MAX_ROUNDS = 2;
const GRN = '#00C805';
const RED = '#FF3B30';

function ConsensusBar({ roundResults }) {
  const valid   = AGENTS.map(a => roundResults[a.id]).filter(r => r && !r._error);
  const bull    = valid.filter(r => ['PASS','BUY'].includes(r.stance)).length;
  const bear    = valid.filter(r => ['FAIL','BEARISH'].includes(r.stance)).length;
  const caution = valid.filter(r => r.stance === 'CAUTION').length;
  if (!valid.length) return null;

  let signal, signalColor;
  if      (bull >= 5)              { signal = 'STRONG BULL'; signalColor = GRN; }
  else if (bull >= 4 && bear <= 1) { signal = 'LEAN BULL';   signalColor = GRN; }
  else if (bear >= 5)              { signal = 'STRONG BEAR'; signalColor = RED; }
  else if (bear >= 4 && bull <= 1) { signal = 'LEAN BEAR';   signalColor = RED; }
  else                             { signal = 'DIVIDED';      signalColor = '#F59E0B'; }

  return (
    <div className="fade-in" style={{ background: '#F7F7F7', border: '1px solid #EEEEEE', borderRadius: 12, padding: '14px 16px', marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ ...MONO, fontSize: 10, color: '#AAAAAA', letterSpacing: '0.08em' }}>CONSENSUS</span>
        <span style={{ ...MONO, fontSize: 12, fontWeight: 700, color: signalColor }}>{signal}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, overflow: 'hidden', display: 'flex', gap: 1 }}>
        {bull    > 0 && <div style={{ flex: bull,    background: GRN,      transition: 'flex .5s ease' }} />}
        {caution > 0 && <div style={{ flex: caution, background: '#F59E0B', transition: 'flex .5s ease' }} />}
        {bear    > 0 && <div style={{ flex: bear,    background: RED,      transition: 'flex .5s ease' }} />}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
        {bull    > 0 && <span style={{ ...MONO, fontSize: 10, color: GRN      }}>{bull} BULL</span>}
        {caution > 0 && <span style={{ ...MONO, fontSize: 10, color: '#F59E0B' }}>{caution} CAUTION</span>}
        {bear    > 0 && <span style={{ ...MONO, fontSize: 10, color: RED      }}>{bear} BEAR</span>}
      </div>
    </div>
  );
}

export default function CouncilTab({ account, acct, positionsLine, flagApiDown, running, setRunning, ticker, setTicker, capital, setCapital, active, setActive, agentState, setAgentState, synthesis, setSynthesis, councilAccounts, setCouncilAccounts, councilPositionsLine }) {
  const synthRef  = useRef(null);
  const [liveSearch,    setLiveSearch]    = useState(false);
  const [debateHistory, setDebateHistory] = useState([]);
  const [currentRound,  setCurrentRound]  = useState(0);
  const [drawer,        setDrawer]        = useState(null);
  const [elapsed,       setElapsed]       = useState(0);
  const [estimatedTotal,setEstimatedTotal]= useState(0);
  const [cooldown,      setCooldown]      = useState(0);
  const timerRef   = useRef(null);
  const elapsedRef = useRef(0);
  const { speak, stopSpeaking, speaking } = useVoice();

  useEffect(() => () => clearInterval(timerRef.current), []);

  function formatTime(s) {
    const m = Math.floor(s / 60), sec = s % 60;
    return m > 0 ? `${m}m ${sec.toString().padStart(2,'0')}s` : `${sec}s`;
  }

  const verdictKey = synthesis.result ? (synthesis.result.verdict === 'PASS' ? 'PASS_FINAL' : synthesis.result.verdict) : null;
  const vStyle     = verdictKey ? STANCE_STYLE[verdictKey] : null;
  const quickPicks = ['AAPL','TSLA','OKLO','PLTR','AVGO','SMCI'];
  const isMulti    = (councilAccounts?.length ?? 1) > 1;
  const acctLabel  = isMulti ? councilAccounts.map(k => ACCOUNTS[k].label).join(' + ') : acct.label;
  const showLiveRound = running && currentRound > debateHistory.length;
  const liveLabel = currentRound <= 1
    ? `ROUND 1 · INITIAL ANALYSIS · ${active}`
    : `ROUND ${currentRound} · REBUTTAL · ${active}`;

  function openDrawer(agent, result) { stopSpeaking(); setDrawer({ agent, result }); }
  function speakAgent(agent, result) {
    if (!result) return;
    const ss = STANCE_STYLE[result.stance];
    speak(`${agent.name}. ${ss?.label || result.stance}. ${result.headline}. ${(result.points||[]).join('. ')}`);
  }

  async function convene() {
    const t = ticker.trim().toUpperCase();
    if (!t || running) return;
    const uid = auth.currentUser?.uid;
    setActive(t); setRunning(true); setSynthesis({ status: 'idle', result: null });
    setDebateHistory([]); setCurrentRound(0);
    setElapsed(0); elapsedRef.current = 0;
    setEstimatedTotal(48);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => { elapsedRef.current += 1; setElapsed(s => s + 1); }, 1000);

    try {
      const acctLine = isMulti
        ? `Accounts under review: ${acctLabel}. Combined positions: ${councilPositionsLine}. Judge concentration and sizing across ALL these accounts.`
        : `Account under review: ${acct.label}'s (${acct.sub}). This account currently holds: ${councilPositionsLine}. DCA: ${acct.dcaNote}. Judge concentration and sizing against THIS account.`;
      const capLine = capital.trim() ? `Available capital to deploy: $${capital.trim()}.` : 'Available capital not specified.';

      let livePrice = null, rawQuote = null, priceLine = '';
      try {
        const quotes = await getQuotes([t]);
        rawQuote  = quotes[t];
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
            return (!r || r._error) ? `${a.name}: no response` : `${a.name} (${r.stance}): "${r.headline}"`;
          }).join('\n');
          debateCtx = `\n\nROUND ${round} COUNCIL POSITIONS:\n${prevLines}\n\nThe council is working toward a unanimous decision. Rebut opposing points with hard evidence. If evidence is clearly against your prior stance, update it. Return the same JSON format.`;
        }

        const userContent   = baseContent + debateCtx;
        const roundResults  = {};
        for (let i = 0; i < AGENTS.length; i++) {
          const a = AGENTS[i];
          const ctxSuffix = isFirst ? buildAgentContext(a.id, agentCtx) : '';
          try {
            const txt = await callAgent(a.system, userContent + ctxSuffix, a.search && liveSearch && isFirst);
            const p   = extractJSON(txt);
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
        const hasBull = stances.some(s => ['PASS','BUY'].includes(s));
        const hasBear = stances.some(s => ['FAIL','BEARISH'].includes(s));
        if (!(hasBull && hasBear)) { setEstimatedTotal(elapsedRef.current + 8); break; }

        if (round < MAX_ROUNDS - 1) {
          const SECS = 60;
          setEstimatedTotal(elapsedRef.current + SECS + 48);
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
        `ROUND ${i+1}:\n${AGENTS.map(a => {
          const ag = r[a.id];
          return (!ag || ag._error) ? `${a.name}: no response` : `${a.name} (${a.role}): ${ag.stance} — "${ag.headline}"`;
        }).join('\n')}`
      ).join('\n\n');
      const roundWord = allRounds.length === 1 ? 'analysis (consensus in round 1)' : `${allRounds.length} rounds of debate`;
      const capProvided = capital.trim().length > 0;

      const synthSystem = `You are the PORTFOLIO MANAGER and final decision-maker for ${acctLabel}'s account${isMulti?'s':''}. The investor is AGGRESSIVE — they play to win and accept volatility for outsized returns. Be bold and action-oriented.\nThe council completed ${roundWord}. BUY requires conviction >= 7 AND reward-to-risk of at least 2:1.\n${capProvided?`Available capital: $${capital.trim()}.`:''}\nALWAYS include: aggressive entry, conservative entry, stop loss, take profit, invalidation level, mind-changer.\nRespond ONLY with JSON in a \`\`\`json block: {"verdict":"BUY"|"WATCH"|"PASS","conviction":<0-10>,"sizing":"<one line>","entry":"<zone>","conservativeEntry":"<entry>","stopLoss":"<price>","takeProfit":"<price>","invalidation":"<price>","mindChanger":"<data point>","positionSize":"<$ + shares or null>","timeframe":"<timeframe or null>","summary":"<2-3 sentences>","bull":["<for>"],"risks":["<risk>"]}`;

      try {
        const txt = await callAgent(synthSystem, `Council ${roundWord} for ${t}:\n${debateTranscript}\n\n${acctLine}\n${capLine}\n${priceLine}Final ruling. Return ONLY the JSON.`, false, 900);
        const p = extractJSON(txt);
        setSynthesis({ status: 'done', result: p || { verdict: 'WATCH', conviction: 5, sizing: 'n/a', summary: 'Could not parse synthesis.', bull: [], risks: [] } });
        if (p) {
          notifyDevices(`${t}: ${p.verdict} · ${p.conviction}/10`, p.summary || 'Council ruling is in.');
          if (uid) {
            const lastRound = allRounds[allRounds.length - 1];
            const agentStances = {};
            AGENTS.forEach(a => { const r = lastRound[a.id]; if (r && !r._error) agentStances[a.id] = { stance: r.stance||null, score: r.score??null, headline: r.headline||null }; });
            addDoc(collection(db,'users',uid,'rulings'), {
              ticker: t, account: isMulti ? councilAccounts.join('+') : account,
              date: new Date().toISOString().split('T')[0], ts: serverTimestamp(), priceAtCall: livePrice||null, agentStances,
              verdict: p.verdict, conviction: p.conviction, entry: p.entry||null, stopLoss: p.stopLoss||null,
              takeProfit: p.takeProfit||null, summary: p.summary||null, outcomeCheckedAt: null, priceAt30d: null, outcome: null,
            }).catch(()=>{});
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

  const inputStyle = { background: '#FFFFFF', border: '1px solid #EEEEEE', borderRadius: 8, color: '#000000', outline: 'none', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
  const focusIn    = e => (e.target.style.borderColor = '#000000');
  const focusOut   = e => (e.target.style.borderColor = '#EEEEEE');

  function AgentCard({ a, r, clickable }) {
    const Icon = a.icon;
    const ss   = r && !r._error ? STANCE_STYLE[r.stance] : null;
    return (
      <div onClick={() => clickable && r && !r._error && openDrawer(a, r)}
        className="fade-in"
        style={{ background: '#F7F7F7', border: '1px solid #EEEEEE', borderRadius: 12, padding: 16, cursor: clickable && r && !r._error ? 'pointer' : 'default', borderLeft: `3px solid ${a.accent}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: r && !r._error ? 10 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: `${a.accent}15`, borderRadius: 8, padding: 8 }}><Icon size={14} style={{ color: a.accent }} /></div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{a.name}</div>
              <div style={{ fontSize: 10, color: '#AAAAAA', marginTop: 1 }}>{a.role}</div>
            </div>
          </div>
          {ss && <span style={{ ...MONO, background: ss.bg, color: ss.fg, fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap' }}>{ss.label}</span>}
        </div>
        {r && !r._error && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: a.accent, lineHeight: 1.35, margin: 0 }}>{r.headline}</p>
              {typeof r.score === 'number' && <span style={{ ...MONO, fontSize: 10, color: '#AAAAAA', whiteSpace: 'nowrap' }}>{r.score}/10</span>}
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {(r.points||[]).map((pt, j) => (
                <li key={j} style={{ display: 'flex', gap: 8, fontSize: 12, color: '#555555', lineHeight: 1.4 }}>
                  <span style={{ color: a.accent, marginTop: 1, fontSize: 10, flexShrink: 0 }}>▸</span><span>{pt}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {r?._error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, color: RED }}>
            <AlertTriangle size={12} /><span style={{ ...MONO, fontSize: 11 }}>{r.errorCode||'ERR-NET'}</span>
          </div>
        )}
      </div>
    );
  }

  function LiveCard({ a }) {
    const st = agentState[a.id] || { status: 'idle' };
    const Icon = a.icon;
    return (
      <div style={{ background: '#F7F7F7', border: '1px solid #EEEEEE', borderRadius: 12, padding: 16, borderLeft: `3px solid ${a.accent}`, cursor: st.status === 'done' && st.result ? 'pointer' : 'default' }}
        onClick={() => st.status === 'done' && st.result && openDrawer(a, st.result)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: `${a.accent}15`, borderRadius: 8, padding: 8 }}><Icon size={14} style={{ color: a.accent }} /></div>
            <div><div style={{ fontWeight: 600, fontSize: 13 }}>{a.name}</div><div style={{ fontSize: 10, color: '#AAAAAA', marginTop: 1 }}>{a.role}</div></div>
          </div>
          {st.status === 'done' && st.result && (() => { const ss = STANCE_STYLE[st.result.stance]; return ss ? <span style={{ ...MONO, background: ss.bg, color: ss.fg, fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 5 }}>{ss.label}</span> : null; })()}
        </div>
        {st.status === 'running' && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, color: '#AAAAAA' }}><Loader2 size={12} className="animate-spin" /><span style={{ ...MONO, fontSize: 11 }}>{st.debating ? 'rebutting…' : 'analyzing…'}</span></div>}
        {st.status === 'error'   && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, color: RED }}><AlertTriangle size={12} /><span style={{ ...MONO, fontSize: 11 }}>{st.errorCode||'ERR-NET'}</span></div>}
        {st.status === 'done' && st.result && !st.result._error && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: a.accent, margin: 0 }}>{st.result.headline}</p>
              {typeof st.result.score === 'number' && <span style={{ ...MONO, fontSize: 10, color: '#AAAAAA' }}>{st.result.score}/10</span>}
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(st.result.points||[]).map((pt,j) => (
                <li key={j} style={{ display: 'flex', gap: 8, fontSize: 12, color: '#555555', lineHeight: 1.4 }}>
                  <span style={{ color: a.accent, fontSize: 10, flexShrink: 0 }}>▸</span><span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const divider = (label) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
      <div style={{ flex: 1, height: 1, background: '#EEEEEE' }} />
      <span style={{ ...MONO, fontSize: 10, color: '#AAAAAA', letterSpacing: '0.08em' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: '#EEEEEE' }} />
    </div>
  );

  return (
    <div style={{ marginTop: 24 }}>
      {/* Ticker input */}
      <label style={{ ...MONO, fontSize: 11, color: '#757575', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>TICKER</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#AAAAAA' }} />
          <input value={ticker} onChange={e => setTicker(e.target.value)} onKeyDown={e => e.key === 'Enter' && convene()}
            placeholder="e.g. AAPL"
            style={{ ...inputStyle, paddingLeft: 36, paddingRight: 12, paddingTop: 12, paddingBottom: 12, fontSize: 16, letterSpacing: '0.1em', textTransform: 'uppercase' }}
            onFocus={focusIn} onBlur={focusOut} />
        </div>
        <button onClick={convene} disabled={running || !ticker.trim()}
          style={{ background: running || !ticker.trim() ? '#AAAAAA' : '#000000', color: '#FFFFFF', border: 'none', borderRadius: 8, padding: '12px 24px', fontWeight: 600, fontSize: 14, cursor: running || !ticker.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
          {running ? <><Loader2 size={15} className="animate-spin" /> Convening…</> : <>Convene <ChevronRight size={15} /></>}
        </button>
      </div>

      {/* Capital input */}
      <div style={{ marginTop: 8, position: 'relative' }}>
        <Wallet size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#AAAAAA' }} />
        <input value={capital} onChange={e => setCapital(e.target.value.replace(/[^0-9.]/g,''))} onKeyDown={e => e.key === 'Enter' && convene()}
          inputMode="decimal" placeholder="available capital (optional)"
          style={{ ...inputStyle, paddingLeft: 34, paddingRight: capital.trim() ? 80 : 12, paddingTop: 10, paddingBottom: 10 }}
          onFocus={focusIn} onBlur={focusOut} />
        {capital.trim() && <span style={{ ...MONO, position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: GRN }}>${Number(capital).toLocaleString()}</span>}
      </div>

      {/* Accounts */}
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ ...MONO, fontSize: 10, color: '#AAAAAA' }}>ACCOUNTS:</span>
        {Object.entries(ACCOUNTS).map(([key, a]) => {
          const sel = councilAccounts?.includes(key);
          return (
            <button key={key} disabled={running}
              onClick={() => {
                if (!setCouncilAccounts) return;
                if (sel && councilAccounts.length === 1) return;
                setCouncilAccounts(sel ? councilAccounts.filter(k => k !== key) : [...councilAccounts, key]);
              }}
              style={{ ...MONO, background: sel ? '#000000' : '#F0F0F0', color: sel ? '#FFFFFF' : '#757575', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 11, cursor: 'pointer', opacity: running ? 0.5 : 1 }}>
              {a.label}
            </button>
          );
        })}
      </div>

      {/* Live search toggle */}
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => setLiveSearch(v => !v)}
          style={{ ...MONO, background: liveSearch ? '#000000' : '#F0F0F0', color: liveSearch ? '#FFFFFF' : '#757575', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Search size={10} />{liveSearch ? 'LIVE SEARCH ON' : 'LIVE SEARCH OFF'}
        </button>
        <span style={{ ...MONO, fontSize: 10, color: '#CCCCCC' }}>off saves ~6¢/run</span>
      </div>

      {/* Quick picks */}
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ ...MONO, fontSize: 10, color: '#CCCCCC' }}>QUICK:</span>
        {quickPicks.map(q => (
          <button key={q} onClick={() => setTicker(q)} disabled={running}
            style={{ ...MONO, background: '#F0F0F0', color: '#555555', border: 'none', borderRadius: 5, padding: '3px 10px', fontSize: 11, cursor: 'pointer', opacity: running ? 0.5 : 1 }}>
            {q}
          </button>
        ))}
      </div>

      {/* Timer */}
      {running && (() => {
        const rem = Math.max(0, estimatedTotal - elapsed);
        return (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={11} style={{ color: '#757575' }} />
            <span style={{ ...MONO, fontSize: 11, color: '#757575' }}>{rem > 0 ? `~${formatTime(rem)} remaining` : 'finishing up…'}</span>
          </div>
        );
      })()}

      {/* Rounds */}
      {active && (
        <div style={{ marginTop: 28 }}>
          {debateHistory.map((roundResults, ri) => {
            const isLastDone = ri === debateHistory.length - 1 && !showLiveRound;
            const label = ri === 0 ? `ROUND 1 · INITIAL ANALYSIS · ${active}` : `ROUND ${ri+1} · REBUTTAL · ${active}`;
            return (
              <div key={ri} style={{ opacity: isLastDone ? 1 : 0.55, marginBottom: 8 }}>
                {divider(label)}
                <div className="grid sm:grid-cols-2 lg:grid-cols-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 10 }}>
                  {AGENTS.map(a => <AgentCard key={a.id} a={a} r={roundResults[a.id]} clickable={true} />)}
                </div>
                {(showLiveRound || ri < debateHistory.length - 1) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
                    <div style={{ flex: 1, height: 1, background: '#EEEEEE' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#AAAAAA' }}><Swords size={11} /><span style={{ ...MONO, fontSize: 10 }}>AGENTS REBUTTING</span><Swords size={11} /></div>
                    <div style={{ flex: 1, height: 1, background: '#EEEEEE' }} />
                  </div>
                )}
              </div>
            );
          })}

          {cooldown > 0 && divider(`RATE LIMIT COOLDOWN · ${cooldown}s · ROUND 2 INCOMING`)}

          {showLiveRound && (
            <div>
              {divider(liveLabel)}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 10 }}>
                {AGENTS.map(a => <LiveCard key={a.id} a={a} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {debateHistory.length > 0 && !showLiveRound && <ConsensusBar roundResults={debateHistory[debateHistory.length - 1]} />}

      {/* Synthesis */}
      {active && (
        <div ref={synthRef} style={{ marginTop: 20 }}>
          {synthesis.status === 'running' && (
            <div style={{ background: '#F7F7F7', border: '1px solid #EEEEEE', borderRadius: 12, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Loader2 size={16} className="animate-spin" style={{ color: '#757575' }} />
              <span style={{ fontSize: 14, color: '#757575' }}>Portfolio Manager reviewing the debate…</span>
            </div>
          )}
          {synthesis.status === 'error' && (
            <div style={{ background: '#FFF5F5', border: '1px solid #FFD0CC', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={16} style={{ color: RED }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: RED }}>{synthesis.errorCode||'ERR-NET'} — PM synthesis failed</div>
                <div style={{ fontSize: 12, color: '#757575', marginTop: 2 }}>
                  {synthesis.errorCode === 'ERR-401' ? 'Session expired — refresh.' :
                   synthesis.errorCode === 'ERR-429' ? 'Rate limit — wait 30s and retry.' :
                   synthesis.errorCode === 'ERR-CFG' ? 'GROQ_API_KEY not configured.' : 'Check connection and retry.'}
                </div>
              </div>
            </div>
          )}
          {synthesis.status === 'done' && synthesis.result && (
            <div className="fade-in">
              {/* Black PM verdict banner */}
              <div style={{ background: '#000000', borderRadius: 12, padding: '20px 24px', color: '#FFFFFF', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                  <Crown size={12} style={{ color: 'rgba(255,255,255,0.5)' }} />
                  <span style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em' }}>PORTFOLIO MANAGER · FINAL RULING</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>{vStyle?.label || synthesis.result.verdict}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{active} · {acctLabel}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                      <span>CONVICTION</span><span>{synthesis.result.conviction}/10</span>
                    </div>
                    <div style={{ height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${synthesis.result.conviction * 10}%`, background: '#FFFFFF', height: '100%', transition: 'width .6s ease' }} />
                    </div>
                    {synthesis.result.sizing && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
                        <TrendingUp size={12} />{synthesis.result.sizing}
                      </div>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.5, color: 'rgba(255,255,255,0.85)', margin: 0 }}>{synthesis.result.summary}</p>
              </div>

              {/* Trade plan */}
              {(synthesis.result.entry || synthesis.result.stopLoss || synthesis.result.takeProfit) && (
                <div style={{ background: '#F7F7F7', border: '1px solid #EEEEEE', borderRadius: 12, padding: '16px 20px', marginBottom: 12 }}>
                  <div style={{ ...MONO, fontSize: 10, color: '#AAAAAA', letterSpacing: '0.08em', marginBottom: 12 }}>TRADE PLAN</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px,1fr))', gap: 12 }}>
                    {[{icon: Target, label: 'AGGRESSIVE ENTRY', val: synthesis.result.entry, color: '#0070F3'},
                      {icon: Target, label: 'CONSERVATIVE ENTRY', val: synthesis.result.conservativeEntry, color: '#5599EE'},
                      {icon: TrendingDown, label: 'STOP LOSS', val: synthesis.result.stopLoss, color: RED},
                      {icon: X, label: 'INVALIDATION', val: synthesis.result.invalidation, color: RED},
                      {icon: TrendingUp, label: 'TAKE PROFIT', val: synthesis.result.takeProfit, color: GRN},
                      {icon: Wallet, label: 'POSITION SIZE', val: synthesis.result.positionSize, color: '#000000'},
                      {icon: Clock, label: 'TIMEFRAME', val: synthesis.result.timeframe, color: '#757575'},
                    ].filter(x => x.val).map(({icon: I, label: lb, val, color}) => (
                      <div key={lb}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                          <I size={10} style={{ color }} />
                          <span style={{ ...MONO, fontSize: 9, color: '#AAAAAA' }}>{lb}</span>
                        </div>
                        <div style={{ ...MONO, fontSize: 13, fontWeight: 600, color }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  {synthesis.result.mindChanger && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #EEEEEE', fontSize: 12, color: '#757575' }}>
                      <span style={{ ...MONO, fontSize: 9, color: '#AAAAAA', letterSpacing: '0.06em' }}>WOULD FLIP: </span>
                      {synthesis.result.mindChanger}
                    </div>
                  )}
                </div>
              )}

              {/* Bull / Risks */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: '#F0FFF4', border: '1px solid #C3F4CF', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ ...MONO, fontSize: 10, color: GRN, letterSpacing: '0.08em', marginBottom: 8 }}>BULL</div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {(synthesis.result.bull||[]).map((b,i) => (
                      <li key={i} style={{ display: 'flex', gap: 6, fontSize: 12, color: '#333333' }}>
                        <span style={{ color: GRN }}>+</span>{b}
                      </li>
                    ))}
                  </ul>
                </div>
                <div style={{ background: '#FFF5F5', border: '1px solid #FFD0CC', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ ...MONO, fontSize: 10, color: RED, letterSpacing: '0.08em', marginBottom: 8 }}>RISKS</div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {(synthesis.result.risks||[]).map((b,i) => (
                      <li key={i} style={{ display: 'flex', gap: 6, fontSize: 12, color: '#333333' }}>
                        <span style={{ color: RED }}>!</span>{b}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!active && (
        <div style={{ marginTop: 40, textAlign: 'center', padding: '40px 20px', background: '#F7F7F7', border: '1px dashed #DDDDDD', borderRadius: 12 }}>
          <Crown size={28} style={{ color: '#CCCCCC', margin: '0 auto 10px' }} />
          <p style={{ fontSize: 14, color: '#757575', margin: '0 0 6px' }}>Type a ticker and convene the council for {acctLabel}.</p>
          <p style={{ ...MONO, fontSize: 11, color: '#AAAAAA', margin: 0 }}>6 specialists analyze → debate → PM delivers the ruling.</p>
        </div>
      )}

      {/* Agent detail drawer */}
      {drawer && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.25)' }} onClick={() => { stopSpeaking(); setDrawer(null); }} />
          <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 50, width: '100%', maxWidth: 360, background: '#FFFFFF', borderLeft: '1px solid #EEEEEE', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #EEEEEE' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: `${drawer.agent.accent}15`, borderRadius: 10, padding: 10 }}>
                  <drawer.agent.icon size={16} style={{ color: drawer.agent.accent }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{drawer.agent.name}</div>
                  <div style={{ fontSize: 10, color: '#AAAAAA', marginTop: 1 }}>{drawer.agent.role}</div>
                </div>
              </div>
              <button onClick={() => { stopSpeaking(); setDrawer(null); }}
                style={{ background: '#F0F0F0', border: 'none', borderRadius: 20, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {(() => { const ss = STANCE_STYLE[drawer.result.stance]; return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {ss && <span style={{ ...MONO, background: ss.bg, color: ss.fg, fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 6 }}>{ss.label}</span>}
                  {typeof drawer.result.score === 'number' && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ ...MONO, fontSize: 10, color: '#AAAAAA', marginBottom: 3 }}>CONVICTION</div>
                      <div style={{ ...MONO, fontSize: 20, fontWeight: 700, color: drawer.agent.accent }}>{drawer.result.score}<span style={{ fontSize: 11, color: '#CCCCCC' }}>/10</span></div>
                    </div>
                  )}
                </div>
              ); })()}
              <div>
                <div style={{ ...MONO, fontSize: 9, color: '#AAAAAA', letterSpacing: '0.08em', marginBottom: 5 }}>HEADLINE</div>
                <p style={{ fontSize: 15, fontWeight: 500, color: drawer.agent.accent, lineHeight: 1.35, margin: 0 }}>{drawer.result.headline}</p>
              </div>
              <div>
                <div style={{ ...MONO, fontSize: 9, color: '#AAAAAA', letterSpacing: '0.08em', marginBottom: 8 }}>ANALYSIS</div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(drawer.result.points||[]).map((pt,i) => (
                    <li key={i} style={{ display: 'flex', gap: 10, fontSize: 13, color: '#333333', lineHeight: 1.5 }}>
                      <span style={{ color: drawer.agent.accent, fontSize: 10, marginTop: 2, flexShrink: 0 }}>▸</span><span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid #EEEEEE' }}>
              <button onClick={() => speaking ? stopSpeaking() : speakAgent(drawer.agent, drawer.result)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 10, background: speaking ? '#F0F0F0' : '#000000', color: speaking ? '#000000' : '#FFFFFF', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'background 0.15s' }}>
                {speaking ? <VolumeX size={15} /> : <Volume2 size={15} />}
                {speaking ? 'Stop' : 'Speak Analysis'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
