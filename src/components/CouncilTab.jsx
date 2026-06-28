import React, { useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Search, ChevronRight, Loader2, AlertTriangle, Crown, Wallet } from 'lucide-react';
import CouncilLoader from './ui/CouncilLoader.jsx';
import { MONO, DISP } from '../constants/styles.js';
import { AGENTS, AXIOM_AVATAR, PROTOCOLS } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent, getQuotes, getNews, getFredData, getTechnicals, sleep } from '../api.js';
import { auth, db } from '../firebase.js';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { loadTickerHistory } from '../utils/rulingContext.js';
import { loadAgentContext, buildAgentContext } from '../utils/agentContext.js';
import { writeDebug } from '../utils/debugStore.js';
import { loadAllAgentProfiles, refreshAgentResearch, buildProfileContext } from '../utils/agentMemory.js';
import { theme } from '../utils/theme.js';

const PS = {
  PASS:       { bg:'rgba(34,197,94,0.1)',   fg:'#22C55E', label:'PASS'    },  // individual agent gate
  FAIL:       { bg:'rgba(239,68,68,0.1)',   fg:'#EF4444', label:'FAIL'    },
  CAUTION:    { bg:'rgba(245,158,11,0.1)',  fg:'#B45309', label:'CAUTION' },
  BEARISH:    { bg:'rgba(239,68,68,0.1)',   fg:'#EF4444', label:'BEAR'    },
  BUY:        { bg:'rgba(34,197,94,0.15)',  fg:'#22C55E', label:'BUY'     },
  WATCH:      { bg:'rgba(245,158,11,0.15)', fg:'#B45309', label:'WATCH'   },
  SKIP:       { bg:'rgba(239,68,68,0.1)',   fg:'#EF4444', label:'SKIP'    },  // AXIOM rejection
  PASS_FINAL: { bg:'rgba(239,68,68,0.1)',   fg:'#EF4444', label:'SKIP'    },  // backward-compat for old rulings
  TIMEOUT:    { bg:'rgba(120,120,120,0.1)', fg:'#888',    label:'N/A'     },
};

function StanceBadge({ stance, small }) {
  const s = PS[stance] || PS.CAUTION;
  return (
    <span style={{
      ...MONO,
      background: s.bg, color: s.fg,
      fontSize: small ? 8 : 9, fontWeight: 700,
      padding: small ? '2px 5px' : '3px 8px',
      borderRadius: 5, whiteSpace: 'nowrap', flexShrink: 0,
    }}>{s.label}</span>
  );
}

export default function CouncilTab({ account, acct, positionsLine, flagApiDown, running, setRunning, ticker, setTicker, capital, setCapital, active, setActive, agentState, setAgentState, synthesis, setSynthesis, dark }) {
  const synthRef = useRef(null);
  const T = theme(dark);
  const [progressLabel, setProgressLabel] = useState('');
  const [trackStatus, setTrackStatus] = useState(null); // null | 'entered' | 'watching'
  const [trackPrice, setTrackPrice] = useState('');
  const [trackShares, setTrackShares] = useState('');
  const [trackSaving, setTrackSaving] = useState(false);
  const [trackSaved, setTrackSaved] = useState(false);
  const [techAvailable, setTechAvailable] = useState(true); // false when AV rate-limited
  const debugRef = useRef(null); // accumulates debug data during a run

  const upperTicker = ticker.trim().toUpperCase();
  const verdictKey = synthesis.result ? (
    synthesis.result.verdict === 'SKIP' ? 'SKIP' :
    synthesis.result.verdict === 'PASS' ? 'PASS_FINAL' : // backward-compat with old Firestore rulings
    synthesis.result.verdict
  ) : null;
  const vStyle     = verdictKey ? (PS[verdictKey] || PS.WATCH) : null;
  const anyUngrounded = Object.values(agentState).some(st =>
    st.r1?.grounded === false || st.r2?.grounded === false || st.r3?.grounded === false
  );
  const quickPicks = ['AAPL','TSLA','OKLO','PLTR','AVGO','SMCI'];
  const prefersReduced = useReducedMotion();

  async function saveToTracker() {
    if (!trackStatus || trackSaving || trackSaved) return;
    const uid = auth.currentUser?.uid;
    if (!uid || !synthesis.rulingData) return;
    setTrackSaving(true);
    const rd = synthesis.rulingData;
    try {
      // Capture SPY entry price for benchmarking on entered trades
      let spyEntryPrice = null;
      if (trackStatus === 'entered') {
        try {
          const sq = await getQuotes(['SPY']);
          const spyQ = sq['SPY'];
          spyEntryPrice = spyQ?.price > 0 ? spyQ.price : spyQ?.prevClose || null;
        } catch {}
      }

      await addDoc(collection(db, 'users', uid, 'rulings'), {
        ticker: rd.ticker, account: rd.account,
        verdict: rd.verdict, conviction: rd.conviction,
        stopLoss: rd.stopLoss,
        takeProfit: rd.takeProfit,
        priceAtCall: rd.livePrice,
        agentStances: rd.agentStances,
        ts: serverTimestamp(),
        date: new Date().toISOString().slice(0, 10),
        status: trackStatus,
        enteredPrice: trackStatus === 'entered' && trackPrice ? parseFloat(trackPrice) : null,
        enteredShares: trackStatus === 'entered' && trackShares ? parseFloat(trackShares) : null,
        spyEntryPrice,
        outcome: null,
        outcomeCheckedAt: null,
        priceAt30d: null,
        spyExitPrice: null,
        myReturn: null,
        spyReturn: null,
        alpha: null,
      });
      setTrackSaved(true);
    } catch (e) {
      console.error('Track trade save failed:', e);
    } finally {
      setTrackSaving(false);
    }
  }

  async function convene() {
    if (running || !ticker.trim()) return;
    setRunning(true);
    setActive(null);
    setAgentState({});
    setSynthesis({ status: 'idle', result: null });
    setProgressLabel('Preparing…');
    setTrackStatus(null);
    setTrackPrice('');
    setTrackShares('');
    setTrackSaved(false);

    // Initialize debug data for this run
    debugRef.current = { ticker: ticker.trim().toUpperCase(), ts: Date.now(), liveDataBlock: '', agents: {}, synthesis: null, anyUngrounded: false };

    const uid = auth.currentUser?.uid;

    // 1. Parallel prep — fetch price, history, profiles, FRED macro, and technicals concurrently
    const [quotesRes, history, profiles, fredData, techData] = await Promise.all([
      getQuotes([upperTicker]).catch(() => ({})),
      uid ? loadTickerHistory(uid, upperTicker, null) : Promise.resolve(''),
      uid ? loadAllAgentProfiles(uid, AGENTS.map(a => a.id)) : Promise.resolve({}),
      getFredData().catch(() => null),
      getTechnicals(upperTicker).catch(() => null),
    ]);

    const rawQuote = quotesRes[upperTicker] || null;
    const livePrice = rawQuote?.price > 0 ? rawQuote.price : rawQuote?.prevClose || null;
    const ctx = await loadAgentContext(upperTicker, rawQuote);

    // Build ATLAS macro context from FRED data
    const macroContext = fredData ? `

LIVE MACRO DATA (Federal Reserve FRED):
- Fed Funds Rate: ${fredData.fed_rate?.current ?? 'N/A'}% (${fredData.fed_rate?.date ?? ''})
- CPI Inflation: ${fredData.cpi?.current ?? 'N/A'} (${fredData.cpi?.date ?? ''})
- Unemployment: ${fredData.unemployment?.current ?? 'N/A'}% (${fredData.unemployment?.date ?? ''})
- Real GDP Growth: ${fredData.gdp_growth?.current ?? 'N/A'}% (${fredData.gdp_growth?.date ?? ''})
- 10Y Treasury: ${fredData.treasury_10y?.current ?? 'N/A'}% | 2Y Treasury: ${fredData.treasury_2y?.current ?? 'N/A'}%
- Yield Spread (10Y-2Y): ${fredData.yield_spread?.current ?? 'N/A'}%${fredData.yield_spread?.inverted ? ' ⚠️ INVERTED — recession signal' : ''}
- VIX: ${fredData.vix?.current ?? 'N/A'} (${fredData.vix?.date ?? ''})
Use these exact FRED numbers to ground your macro assessment. Do not cite numbers from memory.` : '\n[FRED macro data unavailable for this run.]';

    // Build REX technical context from Alpha Vantage
    const techIndicators = techData?.indicators;
    const hasTech = !!(techIndicators && Object.keys(techIndicators).length > 0);
    setTechAvailable(hasTech);
    const techContext = hasTech ? `

LIVE TECHNICAL INDICATORS for ${upperTicker} (Alpha Vantage):
- RSI (14): ${techIndicators.rsi?.value?.toFixed(1) ?? 'N/A'}${techIndicators.rsi?.value > 70 ? ' ⚠️ OVERBOUGHT' : techIndicators.rsi?.value < 30 ? ' ⚠️ OVERSOLD' : ' (neutral)'}
- MACD: ${techIndicators.macd?.macd?.toFixed(3) ?? 'N/A'} | Signal: ${techIndicators.macd?.signal?.toFixed(3) ?? 'N/A'} | Histogram: ${techIndicators.macd?.histogram?.toFixed(3) ?? 'N/A'} ${techIndicators.macd?.bullish ? '(bullish crossover)' : '(bearish crossover)'}
- Bollinger Bands: Upper ${techIndicators.bollinger?.upper?.toFixed(2) ?? 'N/A'} | Middle ${techIndicators.bollinger?.middle?.toFixed(2) ?? 'N/A'} | Lower ${techIndicators.bollinger?.lower?.toFixed(2) ?? 'N/A'}
- SMA 50: ${techIndicators.sma50?.value?.toFixed(2) ?? 'N/A'} | SMA 200: ${techIndicators.sma200?.value?.toFixed(2) ?? 'N/A'}
- Cross Signal: ${techIndicators.crossSignal === 'GOLDEN_CROSS' ? '✅ GOLDEN CROSS (bullish)' : techIndicators.crossSignal === 'DEATH_CROSS' ? '⚠️ DEATH CROSS (bearish)' : 'N/A'}
Use these exact indicator values to ground your technical assessment.` : '\n[Alpha Vantage technical indicators unavailable — rate limit or data issue. Base analysis on price action from LIVE DATA.]';

    // AXIOM macro backdrop summary
    const macroBackdrop = fredData
      ? `Macro backdrop: Fed rate ${fredData.fed_rate?.current ?? 'N/A'}%, CPI ${fredData.cpi?.current ?? 'N/A'}, Unemployment ${fredData.unemployment?.current ?? 'N/A'}%, VIX ${fredData.vix?.current ?? 'N/A'}, Yield spread ${fredData.yield_spread?.current ?? 'N/A'}%${fredData.yield_spread?.inverted ? ' (INVERTED)' : ''}.`
      : '';

    // 2. Refresh research for the single most-stale agent (background, no await).
    // Limited to 1 compound-beta call per council run to avoid rate limit bursts.
    if (uid) {
      const STALE_MS = 24 * 60 * 60 * 1000; // 24h threshold
      let staleest = null;
      let staleestAge = 0;
      AGENTS.forEach(ag => {
        const searched = profiles[ag.id]?.lastResearch?.searchedAt;
        const age = searched ? Date.now() - new Date(searched).getTime() : Infinity;
        if (age > STALE_MS && age > staleestAge) { staleest = ag; staleestAge = age; }
      });
      if (staleest) {
        refreshAgentResearch(uid, staleest.id, staleest.researchPrompt, callAgent)
          .then(content => {
            if (content) {
              profiles[staleest.id] = { ...profiles[staleest.id], lastResearch: { content, searchedAt: new Date().toISOString() } };
            }
          });
      }
    }

    // Shared recon: ONE compound call for live news, then inject into all agents
    setProgressLabel('Fetching live data…');
    let liveDataBlock = '';
    let reconGrounded = false;
    try {
      const now = new Date();
      const timeStr = now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
      let priceStr = livePrice ? `$${livePrice.toFixed(2)}` : 'N/A';
      let changeStr = rawQuote?.changePct != null ? `${rawQuote.changePct >= 0 ? '+' : ''}${rawQuote.changePct.toFixed(2)}% today` : '';
      let rangeStr = rawQuote?.low && rawQuote?.high ? ` range $${rawQuote.low.toFixed(2)}-$${rawQuote.high.toFixed(2)}` : '';

      let newsText = '';
      let earningsLine = '';
      let reconRawResponse = '';
      try {
        const { articles, nextEarnings, earningsEstimated, rawNews, rawEarnings } = await getNews(upperTicker);
        reconRawResponse = JSON.stringify({ rawQuote: rawQuote || null, rawNews: rawNews || [], rawEarnings: rawEarnings || null }, null, 2);

        if (articles && articles.length > 0) {
          newsText = articles
            .map(a => `- [${a.date}] ${a.headline} (${a.source})`)
            .join('\n');
        }

        if (nextEarnings) {
          const daysAway = Math.round((new Date(nextEarnings) - new Date(new Date().toISOString().slice(0, 10))) / 864e5);
          const estFlag = earningsEstimated ? ', est.' : '';
          earningsLine = `Next earnings: ${nextEarnings}${estFlag} (in ${daysAway} day${daysAway !== 1 ? 's' : ''}${earningsEstimated ? ' — date estimated, not yet confirmed by company' : ''})`;
        } else {
          earningsLine = 'Next earnings: none scheduled within 90 days';
        }
        console.error(`[recon][CouncilTab] Finnhub articles: ${articles?.length ?? 0}, nextEarnings: ${nextEarnings}, estimated: ${earningsEstimated}`);
      } catch (newsErr) {
        console.error('[recon] Finnhub news call failed:', newsErr.message);
        earningsLine = 'Next earnings: unavailable';
      }

      liveDataBlock = `\nLIVE DATA (as of ${timeStr}): ${upperTicker} ${priceStr}${changeStr ? ', ' + changeStr : ''}${rangeStr}. ${earningsLine}.${newsText ? ' Recent news (last 5 days, via Finnhub):\n' + newsText : ' Recent news: no recent news available (Finnhub).'}\n`;
      reconGrounded = !!(livePrice && newsText);
      if (debugRef.current) {
        debugRef.current.liveDataBlock = liveDataBlock;
        debugRef.current.reconRawResponse = reconRawResponse;
      }
      console.error('[recon][CouncilTab] rawQuote:', JSON.stringify(rawQuote));
      console.error('[recon][CouncilTab] liveDataBlock:', liveDataBlock);
    } catch (reconErr) {
      console.error('[recon] recon step failed:', reconErr.message);
      liveDataBlock = '';
      reconGrounded = false;
    }

    const priceNote = livePrice ? ` Price: $${livePrice.toFixed(2)}.` : '';
    const acctLine  = `Account: ${acct.label}. Holdings: ${positionsLine}. Capital: $${capital.trim() || acct.capital || 'unspecified'}.`;
    const liveDataOverride = liveDataBlock
      ? liveDataBlock + '\nIMPORTANT: The LIVE DATA block above is the current ground truth. If any historical ruling, prior call, or context conflicts with the price, trend, or news in LIVE DATA — IGNORE the history and reason from LIVE DATA only. Never cite prices or news from historical rulings as if they are current.\n'
      : '';
    const baseContent = `Ticker: ${upperTicker}. Investor considering BUYING.${priceNote} ${acctLine} Today: ${new Date().toDateString()}.${history}${liveDataOverride}`;
    console.error('[recon][CouncilTab] baseContent tail (last 400 chars):', baseContent.slice(-400));

    // Mark all agents as pending
    const initState = {};
    AGENTS.forEach(a => { initState[a.id] = {}; });
    setAgentState(initState);
    setActive(upperTicker);

    // 3. Multi-round council: 3 rounds, sequential with 1.5s stagger
    const allRounds = []; // allRounds[roundIndex][agentId] = result

    // Compact summary of a round's results to keep prompts under 20k limit
    const summariseRound = (r, idx) => {
      const summary = AGENTS.map(ag => {
        const res = r[ag.id] || {};
        return `${ag.name}: ${res.stance || '?'} (${res.score ?? '?'}/10) — ${res.headline || ''}`;
      }).join('\n');
      return `=== ROUND ${idx + 1} ===\n${summary}`;
    };

    for (let round = 0; round < 3; round++) {
      const roundResults = {};
      // Use compact summaries for prior rounds to stay within the 20k prompt limit
      const priorRoundsContext = allRounds.map((r, i) => summariseRound(r, i)).join('\n\n');

      for (let i = 0; i < AGENTS.length; i++) {
        const ag = AGENTS[i];
        setProgressLabel(`Round ${round + 1} · ${ag.name}`);
        setAgentState(prev => ({
          ...prev,
          [ag.id]: { ...prev[ag.id], [`r${round + 1}`]: { status: 'running' } },
        }));

        // What agents earlier in this round said (compact)
        const currentRoundSoFar = Object.entries(roundResults)
          .map(([id, r]) => { const a = AGENTS.find(x => x.id === id); return `${a.name}: ${r.stance || '?'} — ${r.headline || ''}`; })
          .join('\n');

        const profile = profiles[ag.id] || null;
        const profileCtx = buildProfileContext(profile);
        const extra = buildAgentContext(ag.id, ctx, profile);

        let roundPromptSuffix = '';
        if (round === 0) {
          roundPromptSuffix = currentRoundSoFar
            ? `\n\nEARLIER IN THIS ROUND:\n${currentRoundSoFar}\n\nDeliver your independent analysis.`
            : '';
        } else if (round === 1) {
          roundPromptSuffix = `\n\nCOUNCIL ROUND 1 SUMMARY:\n${priorRoundsContext}\n\nEARLIER IN ROUND 2:\n${currentRoundSoFar || 'None yet.'}\n\nRevise if needed. Add a "rebuttal" field (1-2 sentences). Return updated JSON.`;
        } else {
          roundPromptSuffix = `\n\nCOUNCIL ROUNDS 1-2 SUMMARY:\n${priorRoundsContext}\n\nEARLIER IN ROUND 3:\n${currentRoundSoFar || 'None yet.'}\n\nFinal position. Add "finalNote" if changing stance. Return JSON.`;
        }

        const userMsg = baseContent + extra + profileCtx + roundPromptSuffix + ' Return ONLY the JSON.';

        // Log first agent of round 1 to confirm LIVE DATA reaches the prompt
        if (round === 0 && i === 0) {
          console.error(`[recon][CouncilTab] agent[0] userMsg contains LIVE DATA: ${userMsg.includes('LIVE DATA')}`);
          console.error(`[recon][CouncilTab] agent[0] userMsg first 600 chars:`, userMsg.slice(0, 600));
        }

        // Inject FRED data only into ATLAS; technicals only into REX
        const agentSystem = ag.id === 'macro'
          ? ag.system + macroContext
          : ag.id === 'technical'
            ? ag.system + techContext
            : ag.system;

        const _t0 = Date.now();
        try {
          const { text: txt } = await callAgent(agentSystem, userMsg, false, 1000, null, null, i);
          const _ms = Date.now() - _t0;
          let result = extractJSON(txt);
          const parseOk = !!result;
          if (!result) { console.error(`[parse fail] ${ag.name} R${round + 1} raw:`, JSON.stringify(txt)); result = { stance: 'CAUTION', score: 5, headline: 'Could not parse', points: [] }; }
          roundResults[ag.id] = result;
          const _warn = reconGrounded ? null : 'Ungrounded — live data unavailable';
          setAgentState(prev => ({
            ...prev,
            [ag.id]: { ...prev[ag.id], [`r${round + 1}`]: { status: 'done', result, grounded: reconGrounded, warning: _warn } },
          }));
          if (debugRef.current) {
            if (!debugRef.current.agents[ag.id]) debugRef.current.agents[ag.id] = {};
            debugRef.current.agents[ag.id][`r${round + 1}`] = { prompt: userMsg, rawResponse: txt, parseOk, parsed: result, ms: _ms, keyIndex: i % 5, grounded: reconGrounded, warning: _warn };
            if (!reconGrounded) debugRef.current.anyUngrounded = true;
          }
        } catch (err) {
          const isRateLimit = err?.message?.includes('429') || err?.message?.includes('ERR-429');
          if (isRateLimit) {
            setSynthesis({ status: 'cooldown', result: null });
            await sleep(35000);
            setSynthesis({ status: 'idle', result: null });
            try {
              const _t1 = Date.now();
              const { text: txt } = await callAgent(agentSystem, userMsg, false, 1000, null, null, i);
              const _ms = Date.now() - _t1;
              let result = extractJSON(txt);
              const parseOk = !!result;
              if (!result) { console.error(`[parse fail] ${ag.name} R${round + 1} retry raw:`, JSON.stringify(txt)); result = { stance: 'CAUTION', score: 5, headline: 'Rate limit retry', points: [] }; }
              roundResults[ag.id] = result;
              const _warn = reconGrounded ? null : 'Ungrounded — live data unavailable';
              setAgentState(prev => ({
                ...prev,
                [ag.id]: { ...prev[ag.id], [`r${round + 1}`]: { status: 'done', result, grounded: reconGrounded, warning: _warn } },
              }));
              if (debugRef.current) {
                if (!debugRef.current.agents[ag.id]) debugRef.current.agents[ag.id] = {};
                debugRef.current.agents[ag.id][`r${round + 1}`] = { prompt: userMsg, rawResponse: txt, parseOk, parsed: result, ms: _ms, keyIndex: i % 5, grounded: reconGrounded, warning: _warn };
              }
            } catch {
              roundResults[ag.id] = { stance: 'TIMEOUT', score: 5, headline: 'Agent unavailable', points: [] };
              setAgentState(prev => ({
                ...prev,
                [ag.id]: { ...prev[ag.id], [`r${round + 1}`]: { status: 'error', result: null } },
              }));
              flagApiDown();
            }
          } else {
            roundResults[ag.id] = { stance: 'TIMEOUT', score: 5, headline: 'Agent unavailable', points: [] };
            setAgentState(prev => ({
              ...prev,
              [ag.id]: { ...prev[ag.id], [`r${round + 1}`]: { status: 'error', result: null } },
            }));
            flagApiDown();
          }
        }

        // Stagger between agents — longer delay throttles compound RPM (not after last agent in last round)
        if (!(round === 2 && i === AGENTS.length - 1)) {
          await sleep(2500);
        }
      }
      allRounds.push(roundResults);
    }

    // 4. Synthesis — pace the TPM budget before calling so the per-minute window partially resets
    setProgressLabel('AXIOM deliberating…');
    setActive('synthesis');
    setSynthesis({ status: 'running', result: null });
    setTimeout(() => synthRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
    await sleep(4000); // brief pause; agents ran on separate keys so synthesis key has fresh TPM budget
    setProgressLabel('AXIOM synthesizing…');

    // Only send each agent's FINAL round output — keeps synthesis prompt ~3x smaller than all-rounds
    const finalCouncilSummary = AGENTS.map(ag => {
      const r = allRounds[2]?.[ag.id] || allRounds[1]?.[ag.id] || allRounds[0]?.[ag.id] || {};
      return `${ag.name} (${ag.role}): ${JSON.stringify(r)}`;
    }).join('\n');

    const synthSys = `You are AXIOM, chair of THE COUNCIL, delivering the final investment ruling on ${upperTicker} for ${acct.label}. ${PROTOCOLS}${macroBackdrop ? '\n' + macroBackdrop : ''}
The council ran 3 deliberation rounds. Synthesize their evolving positions into a decisive verdict.
Output ONLY the final raw JSON ruling object — no markdown, no code fences, no reasoning text, no commentary before or after the JSON: {"verdict":"BUY"|"WATCH"|"SKIP","conviction":<0-10>,"stopLoss":"<price>","takeProfit":"<price>","headline":"<one bold line>","rationale":"<2-3 sentences summarizing the council consensus and key risks>"}
BUY = approved entry. WATCH = wait for better setup. SKIP = council rejects this trade — do not enter.`;

    const synthUserMsg = `Council final positions:\n${finalCouncilSummary}\nLive price: ${livePrice ? '$' + livePrice.toFixed(2) : 'unknown'}. Capital: $${capital.trim() || acct.capital || 'unspecified'}. Deliver the ruling.`;
    const _st0 = Date.now();
    try {
      const { text: txt, warning: synthWarn } = await callAgent(
        synthSys,
        synthUserMsg,
        false, 2000, null, 'openai/gpt-oss-120b'
      );
      const _sms = Date.now() - _st0;
      let result = extractJSON(txt);
      const synthParseOk = !!result;
      if (!result) {
        console.error('[synthesis parse fail] CouncilTab raw txt:', JSON.stringify(txt), 'warn:', synthWarn);
        result = {
          verdict: 'WATCH', conviction: 5,
          headline: synthWarn ? 'Synthesis error — see details' : 'Council deliberation complete',
          rationale: synthWarn || (txt ? txt.slice(0, 600) : 'Could not parse synthesis response.'),
        };
      }
      if (debugRef.current) {
        debugRef.current.synthesis = { systemPrompt: synthSys, userPrompt: synthUserMsg, rawResponse: txt, parseOk: synthParseOk, parsed: result, ms: _sms, warning: synthWarn || null, verdict: result.verdict, conviction: result.conviction };
        writeDebug('COUNCIL', `${debugRef.current.ticker} council run`, { ...debugRef.current });
      }

      // Build agentStances for when user clicks Track This Trade
      const agentStances = {};
      AGENTS.forEach(ag => {
        agentStances[ag.id] = { stance: allRounds[2]?.[ag.id]?.stance || allRounds[0]?.[ag.id]?.stance || '?' };
      });

      setSynthesis({ status: 'done', result, rulingData: {
        ticker: upperTicker, account, livePrice, agentStances,
        stopLoss: parseFloat(result.stopLoss) || null,
        takeProfit: parseFloat(result.takeProfit) || null,
        verdict: result.verdict, conviction: result.conviction,
      }});
    } catch (err) {
      console.error('[synthesis] callAgent threw:', err?.message);
      if (debugRef.current) {
        debugRef.current.synthesis = { systemPrompt: synthSys, userPrompt: synthUserMsg, rawResponse: null, parseOk: false, parsed: null, ms: Date.now() - _st0, warning: err?.message || 'callAgent threw' };
        writeDebug('COUNCIL', `${debugRef.current.ticker} council run (error)`, { ...debugRef.current });
      }
      flagApiDown();
      setSynthesis({ status: 'error', result: null });
    }

    setActive(null);
    setProgressLabel('');
    setRunning(false);
  }

  const inp = {
    background: T.input, border: `1px solid ${T.inputBorder}`, color: T.text,
    borderRadius: 8, outline: 'none', transition: 'border-color .15s ease',
  };

  const showCouncil = active !== null || synthesis.status !== 'idle';

  return (
    <div style={{ marginTop: 8 }}>
      <label style={{ ...MONO, display: 'block', fontSize: 11, color: T.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Convene the Council</label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: T.text3 }} />
          <input
            value={ticker}
            onChange={e => setTicker(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && convene()}
            placeholder="TICKER"
            onFocus={e => { e.target.style.borderColor = T.accent; }}
            onBlur={e => { e.target.style.borderColor = T.inputBorder; }}
            style={{ ...MONO, background: T.input, border: `1px solid ${T.inputBorder}`, color: T.text, borderRadius: 12, outline: 'none', letterSpacing: '0.15em', width: '100%', paddingLeft: 40, paddingRight: 12, paddingTop: 14, paddingBottom: 14, fontSize: 20, textTransform: 'uppercase', transition: 'border-color .15s ease' }}
          />
        </div>
        <motion.button
          onClick={convene}
          disabled={running || !ticker.trim()}
          whileTap={running || !ticker.trim() ? {} : { scale: 0.97 }}
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em', background: running || !ticker.trim() ? T.btnDisabled : T.accent, color: running || !ticker.trim() ? T.btnDisabledText : '#FFFFFF', borderRadius: 12, border: 'none', cursor: running || !ticker.trim() ? 'not-allowed' : 'pointer', padding: '14px 28px', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap', transition: 'all .15s ease' }}
        >
          {running ? <><Loader2 size={16} className="animate-spin" /> Convening…</> : <>Convene <ChevronRight size={16} /></>}
        </motion.button>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ position: 'relative' }}>
          <Wallet size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: T.text3 }} />
          <input
            value={capital}
            onChange={e => setCapital(e.target.value.replace(/[^0-9.]/g, ''))}
            onKeyDown={e => e.key === 'Enter' && convene()}
            inputMode="decimal"
            placeholder="available capital (optional)"
            onFocus={e => { e.target.style.borderColor = T.accent; }}
            onBlur={e => { e.target.style.borderColor = T.inputBorder; }}
            style={{ ...MONO, background: T.input, border: `1px solid ${T.inputBorder}`, color: T.text, borderRadius: 12, outline: 'none', width: '100%', paddingLeft: 40, paddingRight: capital.trim() ? 80 : 12, paddingTop: 10, paddingBottom: 10, fontSize: 14, transition: 'border-color .15s ease' }}
          />
          {capital.trim() && <span style={{ ...MONO, color: T.green, position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11 }}>${Number(capital).toLocaleString()}</span>}
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ ...MONO, fontSize: 10, color: T.text3 }}>QUICK:</span>
        {quickPicks.map(q => (
          <motion.button key={q} onClick={() => setTicker(q)} disabled={running} whileTap={{ scale: 0.94 }}
            style={{ ...MONO, fontSize: 11, padding: '4px 11px', borderRadius: 8, border: `1px solid ${T.border}`, color: T.text2, background: 'none', cursor: 'pointer' }}>{q}</motion.button>
        ))}
      </div>

      {/* Progress */}
      <AnimatePresence>
        {running && progressLabel && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ marginTop: 16, background: `${T.accent}10`, border: `1px solid ${T.accent}30`, borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Loader2 size={14} className="animate-spin" style={{ color: T.accent, flexShrink: 0 }} />
            <span style={{ ...MONO, fontSize: 12, color: T.accent }}>{progressLabel}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {synthesis.status === 'cooldown' && (
        <div style={{ marginTop: 12, background: `${T.amber}15`, border: `1px solid ${T.amber}40`, borderRadius: 10, padding: '10px 16px', ...MONO, fontSize: 12, color: T.amber }}>
          Rate limit — resuming shortly…
        </div>
      )}

      {showCouncil && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ height: 1, flex: 1, background: T.border }} />
            <span style={{ ...MONO, fontSize: 10, color: T.text3, letterSpacing: '0.1em' }}>
              {upperTicker || active} · {acct.label.toUpperCase()} · 3-ROUND COUNCIL
            </span>
            <div style={{ height: 1, flex: 1, background: T.border }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {AGENTS.map((ag, idx) => {
              const st = agentState[ag.id] || {};
              const Icon = ag.icon;

              // Get final round result (round 3 > round 2 > round 1)
              const r3 = st.r3?.result;
              const r2 = st.r2?.result;
              const r1 = st.r1?.result;
              const finalResult = r3 || r2 || r1;
              const finalSS = finalResult ? (PS[finalResult.stance] || PS.CAUTION) : null;
              const finalGrounded = st.r3?.grounded ?? st.r2?.grounded ?? st.r1?.grounded;
              const finalWarning  = st.r3?.warning  ?? st.r2?.warning  ?? st.r1?.warning;

              const isCurrentlyRunning =
                (st.r1?.status === 'running') ||
                (st.r2?.status === 'running') ||
                (st.r3?.status === 'running');
              const hasError =
                (st.r1?.status === 'error' && !r2 && !r3) ||
                (st.r2?.status === 'error' && !r3) ||
                (st.r3?.status === 'error');
              const isDone = !isCurrentlyRunning && (r1 || r2 || r3);

              // Build stance evolution string
              const stanceEvolution = [
                r1?.stance, r2?.stance, r3?.stance
              ].filter(Boolean);

              return (
                <motion.div key={ag.id}
                  initial={prefersReduced ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, delay: isDone ? idx * 0.05 : 0, ease: [0.25, 0.46, 0.45, 0.94] }}
                  style={{
                    background: T.bgCard,
                    border: `1px solid ${hasError ? T.red + '40' : T.border}`,
                    borderLeft: `3px solid ${hasError ? T.red : ag.accent}`,
                    borderRadius: 12, padding: 16, overflow: 'hidden', position: 'relative',
                  }}>
                  {isCurrentlyRunning && (
                    <div className="absolute left-0 right-0 h-1 top-0" style={{ background: ag.accent, animation: 'shimmer 1.5s infinite linear', backgroundSize: '200% 100%', backgroundImage: `linear-gradient(90deg,${ag.accent}44 0%,${ag.accent} 50%,${ag.accent}44 100%)` }} />
                  )}

                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img src={ag.avatar} alt={ag.name} style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                      <div>
                        <div style={{ ...DISP, fontSize: 14, fontWeight: 600, color: T.text, lineHeight: 1.2 }}>
                          {ag.name}
                        </div>
                        <div style={{ ...MONO, fontSize: 9, color: T.text3, marginTop: 2 }}>{ag.role}</div>
                        {ag.id === 'technical' && !techAvailable && (
                          <div style={{ ...MONO, fontSize: 8, color: '#B45309', background: 'rgba(245,158,11,0.1)', padding: '1px 5px', borderRadius: 3, marginTop: 2 }}>Technicals unavailable (API limit)</div>
                        )}
                      </div>
                    </div>
                    {isDone && finalSS && <StanceBadge stance={finalResult.stance} />}
                  </div>

                  {isCurrentlyRunning && (
                    <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, ...MONO, color: T.text3 }}>
                      <Loader2 size={13} className="animate-spin" />
                      <span style={{ fontSize: 11 }}>
                        {st.r3?.status === 'running' ? 'Round 3 — final position…' :
                         st.r2?.status === 'running' ? 'Round 2 — reconsidering…' :
                         'Round 1 — initial analysis…'}
                      </span>
                    </div>
                  )}

                  {hasError && !isDone && (
                    <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, ...MONO, color: '#EF4444' }}>
                      <AlertTriangle size={13} /><span style={{ fontSize: 11 }}>agent error</span>
                    </div>
                  )}

                  {isDone && finalResult && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: ag.accent, lineHeight: 1.35, margin: 0 }}>
                          {finalResult.headline}
                        </p>
                        {typeof finalResult.score === 'number' && (
                          <span style={{ ...MONO, fontSize: 10, color: T.text3, flexShrink: 0 }}>{finalResult.score}/10</span>
                        )}
                      </div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {(finalResult.points || []).map((pt, j) => (
                          <li key={j} style={{ display: 'flex', gap: 8, fontSize: 12, color: dark ? '#C0C0C0' : '#333', lineHeight: 1.45, marginBottom: 5 }}>
                            <span style={{ color: ag.accent, marginTop: 2, flexShrink: 0 }}>▸</span><span>{pt}</span>
                          </li>
                        ))}
                      </ul>

                      {/* Round evolution badges */}
                      {stanceEvolution.length > 1 && (
                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          <span style={{ ...MONO, fontSize: 8, color: T.text3 }}>R1→R3:</span>
                          {stanceEvolution.map((stance, ri) => (
                            <React.Fragment key={ri}>
                              {ri > 0 && <span style={{ ...MONO, fontSize: 8, color: T.text3 }}>→</span>}
                              <StanceBadge stance={stance} small />
                            </React.Fragment>
                          ))}
                        </div>
                      )}

                      {/* Rebuttal / final note if present */}
                      {(finalResult.rebuttal || finalResult.finalNote) && (
                        <div style={{ marginTop: 8, padding: '6px 10px', background: `${ag.accent}0d`, borderRadius: 6, borderLeft: `2px solid ${ag.accent}40` }}>
                          <p style={{ ...MONO, fontSize: 10, color: T.text2, margin: 0, lineHeight: 1.5 }}>
                            {finalResult.finalNote || finalResult.rebuttal}
                          </p>
                        </div>
                      )}

                      {/* Ungrounded warning */}
                      {finalGrounded === false && (
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', background: 'rgba(245,158,11,0.1)', borderRadius: 6 }}>
                          <AlertTriangle size={10} style={{ color: '#B45309', flexShrink: 0 }} />
                          <span style={{ ...MONO, fontSize: 9, color: '#B45309' }}>⚠ {finalWarning || 'Ungrounded — live search unavailable, answer may be stale'}</span>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Synthesis section */}
      {showCouncil && (
        <div ref={synthRef} style={{ marginTop: 20 }}>
          {synthesis.status === 'running' && (
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 12, padding: 24, display: 'flex', alignItems: 'center', gap: 12, ...MONO, color: '#B45309' }}>
              <CouncilLoader size="sm" />
              <span style={{ fontSize: 14 }}>{progressLabel || 'AXIOM synthesizing…'}</span>
            </div>
          )}
          {synthesis.status === 'error' && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: 20, display: 'flex', alignItems: 'center', gap: 10, ...MONO, color: '#EF4444' }}>
              <AlertTriangle size={16} /><span style={{ fontSize: 13 }}>Synthesis failed — retry by convening again.</span>
            </div>
          )}
          {synthesis.status === 'done' && synthesis.result && vStyle && (
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{
                background: dark ? '#09090B' : '#09090B',
                border: `1px solid ${vStyle.fg}25`,
                boxShadow: `0 0 40px ${vStyle.fg}15`,
                borderRadius: 16, padding: '24px 28px', color: '#FFFFFF',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <img src={AXIOM_AVATAR} alt="AXIOM" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Crown size={16} style={{ color: '#F59E0B' }} />
                  <span style={{ ...DISP, fontSize: 14, fontWeight: 600, letterSpacing: '0.06em' }}>AXIOM · FINAL RULING · 3-ROUND COUNCIL</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '12px 24px', textAlign: 'center' }}>
                  <div style={{ ...DISP, color: vStyle.fg, fontSize: 32, fontWeight: 700, letterSpacing: '0.04em' }}>{vStyle.label}</div>
                  <div style={{ ...MONO, color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 2 }}>{upperTicker} · {acct.label}</div>
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
                    <span>CONVICTION</span><span>{synthesis.result.conviction}/10</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
                    <div style={{ width: `${(synthesis.result.conviction / 10) * 100}%`, background: vStyle.fg, height: '100%', borderRadius: 4, transition: 'width .8s ease' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.55)', flexWrap: 'wrap' }}>
                    {synthesis.result.stopLoss   && <span>STOP <strong style={{ color: '#EF4444' }}>{synthesis.result.stopLoss}</strong></span>}
                    {synthesis.result.takeProfit && <span>TARGET <strong style={{ color: '#22C55E' }}>{synthesis.result.takeProfit}</strong></span>}
                  </div>
                </div>
              </div>
              {synthesis.result.headline && (
                <p style={{ marginTop: 16, fontSize: 16, fontWeight: 600, color: vStyle.fg, lineHeight: 1.4 }}>{synthesis.result.headline}</p>
              )}
              <p style={{ marginTop: 8, fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.65 }}>{synthesis.result.rationale}</p>
              {anyUngrounded && (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(245,158,11,0.12)', borderRadius: 6 }}>
                  <AlertTriangle size={11} style={{ color: '#B45309', flexShrink: 0 }} />
                  <span style={{ ...MONO, fontSize: 11, color: '#B45309' }}>⚠ Some agents lacked live data this run — ruling may reflect stale inputs</span>
                </div>
              )}

              {/* Track This Trade */}
              {synthesis.rulingData && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  {trackSaved ? (
                    <div style={{ ...MONO, fontSize: 11, color: '#22C55E', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>✓</span>
                      <span>Saved to Alpha Tracker · {trackStatus === 'entered' ? 'ENTERED' : 'WATCHING'}</span>
                    </div>
                  ) : !trackStatus ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>TRACK:</span>
                      <button
                        onClick={() => { setTrackStatus('entered'); setTrackPrice(synthesis.rulingData.livePrice ? synthesis.rulingData.livePrice.toFixed(2) : ''); }}
                        style={{ ...MONO, fontSize: 11, fontWeight: 600, background: 'rgba(34,197,94,0.15)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}
                      >
                        ▸ Entered
                      </button>
                      <button
                        onClick={() => setTrackStatus('watching')}
                        style={{ ...MONO, fontSize: 11, fontWeight: 600, background: 'rgba(168,85,247,0.15)', color: '#A855F7', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}
                      >
                        ◎ Watching
                      </button>
                    </div>
                  ) : (
                    <div>
                      {trackStatus === 'entered' && (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                          <input
                            value={trackPrice}
                            onChange={e => setTrackPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                            placeholder="Entry price"
                            style={{ ...MONO, fontSize: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 6, padding: '6px 10px', width: 110, outline: 'none' }}
                          />
                          <input
                            value={trackShares}
                            onChange={e => setTrackShares(e.target.value.replace(/[^0-9.]/g, ''))}
                            placeholder="Shares (optional)"
                            style={{ ...MONO, fontSize: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 6, padding: '6px 10px', width: 140, outline: 'none' }}
                          />
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                          onClick={saveToTracker}
                          disabled={trackSaving}
                          style={{ ...MONO, fontSize: 11, fontWeight: 600, background: '#22C55E', color: '#000', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: trackSaving ? 'not-allowed' : 'pointer', opacity: trackSaving ? 0.7 : 1 }}
                        >
                          {trackSaving ? 'Saving…' : `Save · ${trackStatus === 'entered' ? 'ENTERED' : 'WATCHING'}`}
                        </button>
                        <button
                          onClick={() => setTrackStatus(null)}
                          style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}

      {!showCouncil && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          style={{ marginTop: 48, textAlign: 'center', padding: '48px 20px', border: `1px dashed ${T.border}`, borderRadius: 16 }}>
          <Crown size={28} style={{ margin: '0 auto 12px', opacity: 0.2, color: T.amber }} />
          <p style={{ color: T.text3, fontSize: 14, margin: 0 }}>Enter a ticker and convene the council for {acct?.label}.</p>
          <p style={{ ...MONO, color: T.text3, fontSize: 11, marginTop: 6, opacity: 0.6 }}>6 specialists · 3 deliberation rounds · AXIOM final ruling</p>
        </motion.div>
      )}
    </div>
  );
}
