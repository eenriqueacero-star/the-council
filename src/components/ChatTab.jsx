import React, { useState, useRef, useEffect, useReducer } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Volume2, VolumeX, Loader2, Mic, MicOff, Send, Crown, AlertTriangle } from 'lucide-react';
import { MONO, DISP } from '../constants/styles.js';
import { AGENTS, AXIOM_AVATAR, PROTOCOLS, AXIOM_SYSTEM, AXIOM_CONVERSATIONAL } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent, getQuotes, getNews, getFredData, getTechnicals, sleep } from '../api.js';
import { auth, db } from '../firebase.js';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { loadTickerHistory } from '../utils/rulingContext.js';
import { loadAgentContext, buildAgentContext } from '../utils/agentContext.js';
import { loadAllAgentProfiles, refreshAgentResearch, buildProfileContext } from '../utils/agentMemory.js';
import { useVoice } from '../hooks/useVoice.js';
import { theme } from '../utils/theme.js';
import SparkLogo from './SparkLogo.jsx';
import { writeDebug } from '../utils/debugStore.js';

const PS = {
  PASS:       { bg:'rgba(34,197,94,0.1)',   fg:'#22C55E', label:'PASS'    },
  FAIL:       { bg:'rgba(239,68,68,0.1)',   fg:'#EF4444', label:'FAIL'    },
  CAUTION:    { bg:'rgba(245,158,11,0.1)',  fg:'#B45309', label:'CAUTION' },
  BEARISH:    { bg:'rgba(239,68,68,0.1)',   fg:'#EF4444', label:'BEAR'    },
  BUY:        { bg:'rgba(34,197,94,0.15)',  fg:'#22C55E', label:'BUY'     },
  WATCH:      { bg:'rgba(245,158,11,0.15)', fg:'#B45309', label:'WATCH'   },
  SKIP:       { bg:'rgba(239,68,68,0.1)',   fg:'#EF4444', label:'SKIP'    },  // AXIOM rejection
  PASS_FINAL: { bg:'rgba(239,68,68,0.1)',   fg:'#EF4444', label:'SKIP'    },  // backward-compat
};

const PORTFOLIO_KEYWORDS = ['portfolio','holdings','p&l','pnl','how did','performance','today','positions','my stocks','how are we doing','green','red','down','up','gains','losses','unrealized','total value'];

function isPortfolioQuery(text) {
  const lower = text.toLowerCase();
  return PORTFOLIO_KEYWORDS.some(kw => lower.includes(kw));
}

export default function ChatTab({ account, acct, posMap, positionsLine, flagApiDown, dark }) {
  const [chat,        setChat]       = useState([{ role:'pm', text:"The council is assembled. Ask me anything — market conditions, macro outlook, portfolio strategy, or name a ticker for a full investment ruling." }]);
  const [chatInput,   setChatInput]  = useState('');
  const [chatBusy,    setChatBusy]   = useState(false);
  const [convHistory, setConvHistory]= useState([]);
  const [chatTrackRunId,  setChatTrackRunId]  = useState(null);
  const [chatTrackStatus, setChatTrackStatus] = useState(null); // null | 'entered' | 'watching'
  const [chatTrackPrice,  setChatTrackPrice]  = useState('');
  const [chatTrackShares, setChatTrackShares] = useState('');
  const [chatTrackSaving, setChatTrackSaving] = useState(false);
  const [chatTrackedMap,  setChatTrackedMap]  = useState({}); // { [runId]: 'entered' | 'watching' }
  const chatEndRef = useRef(null);
  // Portfolio follow-up: after injecting data, carry it for next 3 messages
  const lastPortfolioDataRef = useRef('');
  const portfolioFollowUpRef = useRef(0);
  const T = theme(dark);

  const { voiceOn, listening, speaking, srSupported, speak, stopSpeaking, toggleVoice, toggleListen } = useVoice();

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [chat]);

  async function saveFromChat(runId, rulingData, status, price, shares) {
    const uid = auth.currentUser?.uid;
    if (!uid || !rulingData) return;
    setChatTrackSaving(true);
    try {
      // Capture SPY entry price for benchmarking on entered trades
      let spyEntryPrice = null;
      if (status === 'entered') {
        try {
          const sq = await getQuotes(['SPY']);
          const spyQ = sq['SPY'];
          spyEntryPrice = spyQ?.price > 0 ? spyQ.price : spyQ?.prevClose || null;
        } catch {}
      }

      await addDoc(collection(db, 'users', uid, 'rulings'), {
        ticker: rulingData.ticker, account: rulingData.account,
        verdict: rulingData.verdict, conviction: rulingData.conviction,
        stopLoss: rulingData.stopLoss,
        takeProfit: rulingData.takeProfit,
        priceAtCall: rulingData.livePrice,
        agentStances: rulingData.agentStances,
        ts: serverTimestamp(),
        date: new Date().toISOString().slice(0, 10),
        status,
        enteredPrice: status === 'entered' && price ? parseFloat(price) : null,
        enteredShares: status === 'entered' && shares ? parseFloat(shares) : null,
        spyEntryPrice,
        outcome: null,
        outcomeCheckedAt: null,
        priceAt30d: null,
        spyExitPrice: null,
        myReturn: null,
        spyReturn: null,
        alpha: null,
      });
      setChatTrackedMap(prev => ({ ...prev, [runId]: status }));
      setChatTrackRunId(null);
      setChatTrackStatus(null);
      setChatTrackPrice('');
      setChatTrackShares('');
    } catch (e) {
      console.error('saveFromChat failed:', e);
    } finally {
      setChatTrackSaving(false);
    }
  }

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
    const [quotesRes, fredData, techData] = await Promise.all([
      getQuotes([tkr]).catch(() => ({})),
      getFredData().catch(() => null),
      getTechnicals(tkr).catch(() => null),
    ]);
    rawQuote  = quotesRes[tkr] || null;
    livePrice = rawQuote?.price > 0 ? rawQuote.price : rawQuote?.prevClose || null;

    const history  = uid ? await loadTickerHistory(uid, tkr, livePrice) : '';
    const ctx      = await loadAgentContext(tkr, rawQuote);
    const profiles = uid ? await loadAllAgentProfiles(uid, AGENTS.map(a => a.id)) : {};

    // ATLAS macro context
    const macroContext = fredData ? `

LIVE MACRO DATA (Federal Reserve FRED):
- Fed Funds Rate: ${fredData.fed_rate?.current ?? 'N/A'}% (${fredData.fed_rate?.date ?? ''})
- CPI Inflation: ${fredData.cpi?.current ?? 'N/A'} (${fredData.cpi?.date ?? ''})
- Unemployment: ${fredData.unemployment?.current ?? 'N/A'}% (${fredData.unemployment?.date ?? ''})
- Real GDP Growth: ${fredData.gdp_growth?.current ?? 'N/A'}% (${fredData.gdp_growth?.date ?? ''})
- 10Y Treasury: ${fredData.treasury_10y?.current ?? 'N/A'}% | 2Y Treasury: ${fredData.treasury_2y?.current ?? 'N/A'}%
- Yield Spread (10Y-2Y): ${fredData.yield_spread?.current ?? 'N/A'}%${fredData.yield_spread?.inverted ? ' ⚠️ INVERTED — recession signal' : ''}
- VIX: ${fredData.vix?.current ?? 'N/A'} (${fredData.vix?.date ?? ''})
Use these exact FRED numbers to ground your macro assessment.` : '\n[FRED macro data unavailable for this run.]';

    // REX technicals context
    const techIndicators = techData?.indicators;
    const hasTech = !!(techIndicators && Object.keys(techIndicators).length > 0);
    const techContext = hasTech ? `

LIVE TECHNICAL INDICATORS for ${tkr} (Alpha Vantage):
- RSI (14): ${techIndicators.rsi?.value?.toFixed(1) ?? 'N/A'}${techIndicators.rsi?.value > 70 ? ' ⚠️ OVERBOUGHT' : techIndicators.rsi?.value < 30 ? ' ⚠️ OVERSOLD' : ' (neutral)'}
- MACD: ${techIndicators.macd?.macd?.toFixed(3) ?? 'N/A'} | Signal: ${techIndicators.macd?.signal?.toFixed(3) ?? 'N/A'} | Histogram: ${techIndicators.macd?.histogram?.toFixed(3) ?? 'N/A'} ${techIndicators.macd?.bullish ? '(bullish crossover)' : '(bearish crossover)'}
- Bollinger Bands: Upper ${techIndicators.bollinger?.upper?.toFixed(2) ?? 'N/A'} | Middle ${techIndicators.bollinger?.middle?.toFixed(2) ?? 'N/A'} | Lower ${techIndicators.bollinger?.lower?.toFixed(2) ?? 'N/A'}
- SMA 50: ${techIndicators.sma50?.value?.toFixed(2) ?? 'N/A'} | SMA 200: ${techIndicators.sma200?.value?.toFixed(2) ?? 'N/A'}
- Cross Signal: ${techIndicators.crossSignal === 'GOLDEN_CROSS' ? '✅ GOLDEN CROSS (bullish)' : techIndicators.crossSignal === 'DEATH_CROSS' ? '⚠️ DEATH CROSS (bearish)' : 'N/A'}
Use these exact indicator values to ground your technical assessment.` : '\n[Alpha Vantage technical indicators unavailable — base analysis on price action from LIVE DATA.]';

    // AXIOM macro backdrop
    const macroBackdrop = fredData
      ? `Macro backdrop: Fed rate ${fredData.fed_rate?.current ?? 'N/A'}%, CPI ${fredData.cpi?.current ?? 'N/A'}, Unemployment ${fredData.unemployment?.current ?? 'N/A'}%, VIX ${fredData.vix?.current ?? 'N/A'}, Yield spread ${fredData.yield_spread?.current ?? 'N/A'}%${fredData.yield_spread?.inverted ? ' (INVERTED)' : ''}.`
      : '';

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

    // Shared recon: ONE compound call for live news, then inject into all agents
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
      try {
        const { articles, nextEarnings, earningsEstimated } = await getNews(tkr);
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
        console.error(`[recon][ChatTab] Finnhub articles: ${articles?.length ?? 0}, nextEarnings: ${nextEarnings}, estimated: ${earningsEstimated}`);
      } catch (newsErr) {
        console.error('[recon] Finnhub news call failed:', newsErr.message);
        earningsLine = 'Next earnings: unavailable';
      }

      liveDataBlock = `\nLIVE DATA (as of ${timeStr}): ${tkr} ${priceStr}${changeStr ? ', ' + changeStr : ''}${rangeStr}. ${earningsLine}.${newsText ? ' Recent news (last 5 days, via Finnhub):\n' + newsText : ' Recent news: no recent news available (Finnhub).'}\n`;
      reconGrounded = !!(livePrice && newsText);
      console.error('[recon][ChatTab] rawQuote:', JSON.stringify(rawQuote));
      console.error('[recon][ChatTab] liveDataBlock:', liveDataBlock);
    } catch (reconErr) {
      console.error('[recon] recon step failed:', reconErr.message);
    }

    const priceNote   = livePrice ? ` Price: $${livePrice.toFixed(2)}.` : '';
    const liveDataOverride = liveDataBlock
      ? liveDataBlock + '\nIMPORTANT: The LIVE DATA block above is the current ground truth. If any historical ruling, prior call, or context conflicts with the price, trend, or news in LIVE DATA — IGNORE the history and reason from LIVE DATA only. Never cite prices or news from historical rulings as if they are current.\n'
      : '';
    const baseContent = `Ticker: ${tkr}. Investor considering BUYING.${priceNote} ${acctLine} Today: ${new Date().toDateString()}.${history}${liveDataOverride}`;

    // 3-round council (compact for chat — show only final stances)
    const allRounds = [];
    let hasUngrounded = !reconGrounded;
    const ungroundedWarnings = reconGrounded ? [] : ['Live data unavailable for this run'];

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
        const agentSystem = ag.id === 'macro'
          ? ag.system + macroContext
          : ag.id === 'technical'
            ? ag.system + techContext
            : ag.system;
        try {
          const { text: txt } = await callAgent(agentSystem, userMsg, false, 1000, null, null, i);
          const parsed = extractJSON(txt);
          if (!parsed) console.error(`[parse fail] ${ag.name} R${round + 1} raw:`, JSON.stringify(txt));
          roundResults[ag.id] = parsed || { stance: 'CAUTION', score: 5, headline: 'Could not parse', points: [] };
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

        if (!(round === 2 && i === AGENTS.length - 1)) await sleep(2500);
      }
      allRounds.push(roundResults);
    }

    // Brief pause before synthesis — agents ran on separate keys so synthesis key has fresh TPM budget
    await sleep(4000);
    // Only send each agent's final round output to keep the synthesis prompt small
    const finalCouncilSummary = AGENTS.map(ag => {
      const r = allRounds[2]?.[ag.id] || allRounds[1]?.[ag.id] || allRounds[0]?.[ag.id] || {};
      return `${ag.name} (${ag.role}): ${JSON.stringify(r)}`;
    }).join('\n');

    const synthSys = `You are AXIOM, chair of THE COUNCIL, delivering the final ruling on ${tkr} for ${acct.label}. ${PROTOCOLS}${macroBackdrop ? '\n' + macroBackdrop : ''}
The council ran 3 deliberation rounds. Synthesize into a decisive verdict. Speak the ruling conversationally (2-4 sentences).
Output ONLY the final raw JSON ruling object — no markdown, no code fences, no reasoning text, no commentary before or after the JSON: {"speak":"<ruling text>","verdict":"BUY"|"WATCH"|"SKIP","conviction":<0-10>,"stopLoss":"<price>","takeProfit":"<price>"}
BUY = approved entry. WATCH = wait for better setup. SKIP = council rejects this trade — do not enter.`;

    let synth;
    try {
      const { text: txt, warning: synthWarn } = await callAgent(synthSys, `Council final positions:\n${finalCouncilSummary}\n${livePrice ? `Live price: $${livePrice.toFixed(2)}.` : ''} Deliver the ruling.`, false, 2000, null, 'openai/gpt-oss-120b');
      synth = extractJSON(txt);
      if (!synth) {
        console.error('[synthesis parse fail] ChatTab raw txt:', JSON.stringify(txt), 'warn:', synthWarn);
        synth = { speak: synthWarn || (txt ? txt.slice(0, 400) : 'The council is split — I\'d hold off.'), verdict: 'WATCH', conviction: 5 };
      }
    } catch (err) {
      console.error('[synthesis] ChatTab callAgent threw:', err?.message);
      synth = { speak: 'Could not finalize the ruling.', verdict: 'WATCH', conviction: 5 };
      flagApiDown();
    }

    // Build agentStances for Track This Trade
    const agentStances = {};
    AGENTS.forEach(ag => { agentStances[ag.id] = { stance: allRounds[2]?.[ag.id]?.stance || allRounds[0]?.[ag.id]?.stance || '?' }; });
    const rulingData = {
      ticker: tkr, account, livePrice, agentStances,
      stopLoss: parseFloat(synth.stopLoss) || null,
      takeProfit: parseFloat(synth.takeProfit) || null,
      verdict: synth.verdict, conviction: synth.conviction ?? null,
    };

    // Update council message with synth result + rulingData (no auto-save — user clicks Track This Trade)
    setChat(p => p.map(m => m.runId === runId ? { ...m, synth, hasUngrounded, ungroundedWarnings, rulingData } : m));
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

    // Portfolio data injection — fetch live prices if user asks about portfolio performance,
    // then carry that data for the next 3 follow-up messages automatically.
    let portfolioDataBlock = '';
    if (isPortfolioQuery(text)) {
      // Fresh fetch
      const tickers = Object.keys(posMap || {}).filter(t => t && t.trim());
      if (tickers.length > 0) {
        try {
          const quotes = await getQuotes(tickers);
          let totalValue = 0, totalDayGain = 0, totalUnrealizedPL = 0;
          const rows = [];
          for (const ticker of tickers) {
            const q = quotes[ticker];
            const pos = posMap[ticker] || {};
            const shares = parseFloat(pos.shares) || 0;
            const cost = parseFloat(String(pos.cost || '').replace(/[^0-9.]/g, '')) || 0;
            const price = q?.price || q?.prevClose || 0;
            const changePct = q?.changePct ?? 0;
            const prevClose = q?.prevClose || price;
            const mktVal = shares * price;
            const dayGain = shares * (price - prevClose);
            const unrealizedPL = cost > 0 ? (price - cost) * shares : null;
            totalValue += mktVal;
            totalDayGain += dayGain;
            if (unrealizedPL != null) totalUnrealizedPL += unrealizedPL;
            rows.push(`${ticker}: $${price.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}% today) | ${shares}sh | cost $${cost.toFixed(2)} | mkt val $${mktVal.toFixed(2)} | day gain $${dayGain.toFixed(2)}${unrealizedPL != null ? ` | unrealized P&L $${unrealizedPL.toFixed(2)}` : ''}`);
          }
          portfolioDataBlock = `\n\nPORTFOLIO DATA (live as of ${new Date().toLocaleTimeString()}):\n${rows.join('\n')}\nTOTAL: market value $${totalValue.toFixed(2)} | day change $${totalDayGain.toFixed(2)} (${totalValue > 0 ? ((totalDayGain / (totalValue - totalDayGain)) * 100).toFixed(2) : '0.00'}%) | total unrealized P&L $${totalUnrealizedPL.toFixed(2)}\n`;

          // Fetch headlines for top 3 movers (by absolute $ day change) — gives AXIOM real news to cite
          const tickerDayGains = tickers.map(t => {
            const q = quotes[t]; const pos = posMap[t] || {};
            const shares = parseFloat(pos.shares) || 0;
            const price = q?.price || q?.prevClose || 0;
            const prevClose = q?.prevClose || price;
            return { ticker: t, absDayGain: Math.abs(shares * (price - prevClose)) };
          }).sort((a, b) => b.absDayGain - a.absDayGain).slice(0, 3);

          const newsResults = await Promise.allSettled(tickerDayGains.map(({ ticker: t }) => getNews(t)));
          const newsLines = [];
          newsResults.forEach((r, i) => {
            if (r.status !== 'fulfilled') return;
            const headlines = (r.value?.articles || []).slice(0, 3).map(a => `  - ${a.headline}`);
            if (headlines.length) newsLines.push(`${tickerDayGains[i].ticker} recent news:\n${headlines.join('\n')}`);
          });
          if (newsLines.length) portfolioDataBlock += `\nRECENT NEWS (biggest movers):\n${newsLines.join('\n')}\n`;

          lastPortfolioDataRef.current = portfolioDataBlock;
          portfolioFollowUpRef.current = 3; // carry for next 3 follow-up messages
          writeDebug('CHAT', `Portfolio data injected for "${text.slice(0, 40)}"`, portfolioDataBlock);
        } catch (err) {
          console.error('[chat portfolio injection] quote fetch failed:', err?.message);
        }
      }
    } else if (portfolioFollowUpRef.current > 0 && lastPortfolioDataRef.current) {
      // Auto-inject cached data for follow-up questions
      portfolioDataBlock = lastPortfolioDataRef.current;
      portfolioFollowUpRef.current -= 1;
      writeDebug('CHAT', `Portfolio data carried over (${portfolioFollowUpRef.current} left) for "${text.slice(0, 40)}"`, portfolioDataBlock);
    }

    // AXIOM reads the message and decides: answer directly, route to specialist(s), or convene full council
    const axiomSys = `You are AXIOM, chair of THE COUNCIL. Talk like a sharp, knowledgeable friend — direct, casual, no corporate speak. Strong opinions backed by data. ${PROTOCOLS}

TONE — always sound like the GOOD example:
BAD: "Your portfolio declined 5.83% today, losing $194.07 in market value."
GOOD: "Rough day — down about $194 (5.8%). CRDO and SNDK got destroyed, both down 10%+. Still up $758 unrealized overall though."
BAD: "The equity exhibited significant downward pressure amid sector rotation."
GOOD: "MU got hammered today, whole chip sector sold off after the CPI print."
When discussing portfolio data: name the biggest movers, give dollar gain/loss, note whether you're up or down overall. 2-4 sentences max.

THE COUNCIL ROSTER (use ONLY these names):
- REX ⚡ (id: technical) — Technical Analyst: charts, price action, momentum, key levels
- NOVA 🚀 (id: catalyst) — Catalyst Scout: earnings, product launches, upcoming events
- SAGE 🛡️ (id: risk) — Risk Officer: dilution, volatility, concentration risk
- ATLAS 🌐 (id: macro) — Macro Strategist: Fed, rates, inflation, geopolitics
- VEGA 🐻 (id: bear) — Devil's Advocate: bear case, downside scenarios
- ZEN ⚖️ (id: sizer) — Position Sizer: dollar amounts, sizing, portfolio allocation

ROUTING RULES:
- fullCouncil=true ONLY when the investor explicitly wants a full BUY/SELL/HOLD ruling on a specific ticker.
- route=["catalyst","technical"] for stock search/discovery ("find stocks", "any good picks", "search for opportunities").
- route=["technical"] for chart/momentum/price action questions about a specific ticker.
- route=["macro"] for macro, Fed, rates, inflation, geopolitical questions.
- route=["catalyst"] for earnings dates, catalysts on a specific ticker.
- route=["risk"] for risk, dilution, concentration, volatility.
- route=["bear"] for bear case or "what could go wrong".
- route=["sizer"] for position sizing or how much to buy.
- route=[] — answer DIRECTLY as AXIOM for: greetings, portfolio questions, strategy, watchlist, anything that doesn't need a specialist.

MACRO GROUNDING RULE: When explaining why stocks moved, ONLY cite reasons that appear in the LIVE DATA, PORTFOLIO DATA, or RECENT NEWS blocks provided. Do NOT invent macro explanations (CPI surprises, Fed moves, geopolitical events, earnings reports) unless they are explicitly mentioned in the data you were given. If you don't know the specific reason for a move, say so honestly — "not sure what triggered it specifically, but the whole chip sector sold off" is better than inventing a CPI surprise that didn't happen. Honesty about uncertainty is always better than a confident fabrication.

When routing: set "speak" to a brief 1-sentence intro ("Let me get REX on that chart.").
When answering directly: set "speak" to your full casual answer.
Today: ${new Date().toDateString()}.${historyBlock}
Output ONLY the raw JSON object — no code fences, no backticks, no prose before or after: {"speak":"<response or intro>","fullCouncil":<bool>,"ticker":"<TICKER or null>","route":["agentId1"]}`;

    let router;
    try {
      const portfolioContext = portfolioDataBlock ? portfolioDataBlock : '';
      const { text: txt } = await callAgent(axiomSys, `Investor: "${text}". ${acctLine}${portfolioContext} Return ONLY the JSON.`, false);
      const parsed = extractJSON(txt);
      if (!parsed) console.error('[AXIOM router] JSON parse failed. Raw txt:', JSON.stringify(txt));
      router = parsed || { speak: "I didn't quite catch that.", fullCouncil: false, ticker: null, route: [] };
      if (new URLSearchParams(window.location.search).get('debug') === '1') {
        writeDebug('CHAT', `AXIOM router · "${text.slice(0, 50)}"`, { raw: txt, parsed: router });
      }
    } catch {
      flagApiDown();
      router = { speak: "I can't reach the council right now.", fullCouncil: false, ticker: null, route: [] };
    }

    // Ensure backwards-compat if model returns old `convene` field
    if (router.convene && !router.fullCouncil) router.fullCouncil = true;

    // === FULL COUNCIL ===
    if (router.fullCouncil && router.ticker) {
      // New topic — clear portfolio follow-up carry
      portfolioFollowUpRef.current = 0;
      lastPortfolioDataRef.current = '';
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
          const q = await getQuotes([tkr]);
          const quote = q[tkr];
          if (quote?.price) {
            liveContext = `\nVERIFIED LIVE DATA for ${tkr}: price $${quote.price.toFixed(2)} (prev close $${(quote.prevClose || 0).toFixed(2)}, chg ${(quote.changePct || 0).toFixed(2)}%)`;
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

        setChat(p => [...p, { role:'agent', agentId:ag.id, name:ag.name, avatar:ag.avatar, emoji:ag.emoji, color:ag.color, accent:ag.accent, text:response }]);
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

    // === AXIOM DIRECT ANSWER (web-search enabled) ===
    let axiomReply = router.speak;
    try {
      const axiomConvSys = AXIOM_CONVERSATIONAL + `\nToday: ${new Date().toDateString()}.${historyBlock}`;
      const axiomConvMsg = `Investor: "${text}". ${acctLine}${portfolioDataBlock ? portfolioDataBlock : ''} Answer directly and conversationally. Search the web if you need current information.`;
      const { text: axiomTxt } = await callAgent(axiomConvSys, axiomConvMsg, true, 400);
      if (axiomTxt && axiomTxt.trim()) axiomReply = axiomTxt.trim();
    } catch {
      flagApiDown();
    }
    setChat(p => [...p, { role:'pm', text:axiomReply }]);
    speak(axiomReply);
    setConvHistory(prev => [...prev, { role:'assistant', agentId:'pm', content:axiomReply }]);
    setChatBusy(false);
  }

  const BUBBLE_BG_AGENT = dark ? '#27272A' : '#F4F4F5';

  function renderMessage(m, i) {
    if (m.role === 'user') return (
      <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}
        style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ maxWidth: '80%', background: T.accent, color: '#fff', borderRadius: '18px 18px 4px 18px', padding: '10px 14px', fontSize: 14, lineHeight: 1.55 }}>{m.text}</div>
      </motion.div>
    );

    if (m.role === 'pm') {
      const vs = m.verdict ? (PS[m.verdict === 'SKIP' ? 'SKIP' : m.verdict === 'PASS' ? 'PASS_FINAL' : m.verdict] || null) : null;
      return (
        <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}
          style={{ display: 'flex', justifyContent: 'flex-start', gap: 10 }}>
          <div style={{ flexShrink: 0, marginTop: 2 }}><img src={AXIOM_AVATAR} alt="AXIOM" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} /></div>
          <div style={{ maxWidth: '82%' }}>
            <div style={{ ...MONO, fontSize: 9, color: T.accent, marginBottom: 4, letterSpacing: '0.08em' }}>AXIOM</div>
            <div style={{ background: BUBBLE_BG_AGENT, color: T.text, borderRadius: '18px 18px 18px 4px', padding: '10px 14px', fontSize: 14, lineHeight: 1.6 }}>
              {speaking && i === chat.length - 1 && voiceOn && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 6, verticalAlign: 'middle' }}>
                  {[0, 1, 2].map(d => <span key={d} className="blink" style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: T.accent, animationDelay: `${d * 0.2}s` }} />)}
                </span>
              )}
              {m.text}
            </div>
            {vs && (
              <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ ...MONO, background: vs.bg, color: vs.fg, fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>{vs.label}</span>
                <span style={{ ...MONO, fontSize: 9, color: T.text3 }}>{m.conviction}/10 · {m.ticker || ''}</span>
              </div>
            )}
          </div>
        </motion.div>
      );
    }

    if (m.role === 'agent') return (
      <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}
        style={{ display: 'flex', justifyContent: 'flex-start', gap: 10 }}>
        <img src={m.avatar} alt={m.name} style={{ flexShrink: 0, marginTop: 2, width: 26, height: 26, borderRadius: 8, objectFit: 'cover' }} />
        <div style={{ maxWidth: '82%' }}>
          <div style={{ ...MONO, fontSize: 9, color: m.color || m.accent, marginBottom: 4, letterSpacing: '0.08em' }}>{m.name}</div>
          <div style={{ background: BUBBLE_BG_AGENT, color: T.text, borderRadius: '18px 18px 18px 4px', padding: '10px 14px', fontSize: 14, lineHeight: 1.6 }}>{m.text}</div>
        </div>
      </motion.div>
    );

    if (m.role === 'council') {
      const finalStances = m.agents || {};
      return (
        <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          style={{ display: 'flex', justifyContent: 'flex-start', gap: 10 }}>
          <div style={{ flexShrink: 0, width: 26, paddingTop: 2 }}>
            <Crown size={16} style={{ color: T.amber, opacity: 0.8 }} />
          </div>
          <div style={{ maxWidth: '92%', width: '100%', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ ...MONO, fontSize: 9, color: T.amber, letterSpacing: '0.08em', marginBottom: 10 }}>
              COUNCIL SESSION · {m.ticker}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {AGENTS.map(ag => {
                const stance = finalStances[ag.id];
                const ss = stance ? (PS[stance] || null) : null;
                return (
                  <div key={ag.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: T.bg, border: `1px solid ${stance ? ag.accent + '30' : T.border}`, borderLeft: stance ? `2px solid ${ag.accent}` : `1px solid ${T.border}`, borderRadius: 8, padding: '5px 8px' }}>
                    <img src={ag.avatar} alt={ag.name} style={{ width: 16, height: 16, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                    <span style={{ ...MONO, fontSize: 9, color: T.text2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ag.name}</span>
                    {stance ? <span style={{ ...MONO, fontSize: 8, fontWeight: 700, color: ss ? ss.fg : T.text2 }}>{ss ? ss.label : stance}</span>
                            : <Loader2 size={10} className="animate-spin" style={{ color: T.text3 }} />}
                  </div>
                );
              })}
            </div>
            {m.synth && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                {(() => {
                  const vs = m.synth.verdict ? (PS[m.synth.verdict === 'SKIP' ? 'SKIP' : m.synth.verdict === 'PASS' ? 'PASS_FINAL' : m.synth.verdict] || null) : null;
                  return vs ? <span style={{ ...MONO, background: vs.bg, color: vs.fg, fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>{vs.label} · {m.synth.conviction}/10</span> : null;
                })()}
                {m.rulingData && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                    {chatTrackedMap[m.runId] ? (
                      <span style={{ ...MONO, fontSize: 9, color: T.accent }}>✓ Saved · {chatTrackedMap[m.runId] === 'entered' ? 'ENTERED' : 'WATCHING'}</span>
                    ) : chatTrackRunId === m.runId ? (
                      <div>
                        {chatTrackStatus === 'entered' && (
                          <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                            <input value={chatTrackPrice} onChange={e => setChatTrackPrice(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Entry price" style={{ ...MONO, fontSize: 11, background: T.input, border: `1px solid ${T.inputBorder}`, color: T.text, borderRadius: 6, padding: '4px 8px', width: 90, outline: 'none' }} />
                            <input value={chatTrackShares} onChange={e => setChatTrackShares(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Shares (opt)" style={{ ...MONO, fontSize: 11, background: T.input, border: `1px solid ${T.inputBorder}`, color: T.text, borderRadius: 6, padding: '4px 8px', width: 100, outline: 'none' }} />
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <motion.button whileTap={{ scale: 0.96 }} onClick={() => saveFromChat(m.runId, m.rulingData, chatTrackStatus, chatTrackPrice, chatTrackShares)} disabled={chatTrackSaving}
                            style={{ ...MONO, fontSize: 9, fontWeight: 700, background: T.accent, color: '#fff', border: 'none', borderRadius: 5, padding: '4px 12px', cursor: chatTrackSaving ? 'not-allowed' : 'pointer', opacity: chatTrackSaving ? 0.7 : 1 }}>
                            {chatTrackSaving ? 'Saving…' : `Save · ${chatTrackStatus === 'entered' ? 'ENTERED' : 'WATCHING'}`}
                          </motion.button>
                          <button onClick={() => { setChatTrackRunId(null); setChatTrackStatus(null); }} style={{ ...MONO, fontSize: 9, color: T.text3, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px' }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ ...MONO, fontSize: 9, color: T.text3 }}>TRACK:</span>
                        <motion.button whileTap={{ scale: 0.94 }} onClick={() => { setChatTrackRunId(m.runId); setChatTrackStatus('entered'); setChatTrackPrice(m.rulingData.livePrice ? m.rulingData.livePrice.toFixed(2) : ''); setChatTrackShares(''); }}
                          style={{ ...MONO, fontSize: 9, fontWeight: 600, background: `${T.accent}18`, color: T.accent, border: `1px solid ${T.accent}30`, borderRadius: 5, padding: '3px 10px', cursor: 'pointer' }}>▸ Entered</motion.button>
                        <motion.button whileTap={{ scale: 0.94 }} onClick={() => { setChatTrackRunId(m.runId); setChatTrackStatus('watching'); setChatTrackPrice(''); setChatTrackShares(''); }}
                          style={{ ...MONO, fontSize: 9, fontWeight: 600, background: 'rgba(168,85,247,0.12)', color: '#A855F7', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 5, padding: '3px 10px', cursor: 'pointer' }}>◎ Watching</motion.button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      );
    }
    return null;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageSquare size={15} style={{ color: T.text3 }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: T.text }}>{acct.label}</span>
        </div>
        <motion.button whileTap={{ scale: 0.9 }} onClick={toggleVoice}
          style={{ fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 20, border: `1px solid ${voiceOn ? T.accent : T.border}`, background: voiceOn ? `${T.accent}12` : 'transparent', color: voiceOn ? T.accent : T.text2, cursor: 'pointer', fontSize: 11 }}>
          {voiceOn ? <Volume2 size={12} /> : <VolumeX size={12} />}
          <span style={MONO}>{voiceOn ? 'VOICE' : 'MUTED'}</span>
        </motion.button>
      </div>

      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'min(62vh,580px)' }}>
        <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <AnimatePresence initial={false}>
            {chat.map((m, i) => renderMessage(m, i))}
          </AnimatePresence>

          {chatBusy && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ display: 'flex', justifyContent: 'flex-start', gap: 10 }}>
              <div style={{ flexShrink: 0, marginTop: 2 }}><SparkLogo size={24} /></div>
              <div style={{ background: BUBBLE_BG_AGENT, borderRadius: '18px 18px 18px 4px', padding: '12px 16px', display: 'flex', gap: 5, alignItems: 'center' }}>
                {[0, 1, 2].map(d => (
                  <motion.span key={d} animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, delay: d * 0.12, repeat: Infinity }}
                    style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: T.text3 }} />
                ))}
              </div>
            </motion.div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div style={{ borderTop: `1px solid ${T.border}`, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => toggleListen(t => sendChat(t))} disabled={!srSupported || chatBusy}
            style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 12, border: `1px solid ${listening ? T.red : T.border}`, background: listening ? T.red : 'transparent', color: listening ? '#fff' : srSupported ? T.text2 : T.text3, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: !srSupported || chatBusy ? 0.4 : 1 }}>
            {srSupported ? <Mic size={16} /> : <MicOff size={16} />}
          </motion.button>
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendChat()}
            disabled={chatBusy}
            placeholder={listening ? 'Listening…' : 'Ask AXIOM anything…'}
            style={{ fontFamily: 'var(--font-display)', flex: 1, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 12, padding: '10px 14px', fontSize: 14, color: T.text, outline: 'none' }}
          />
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => sendChat()} disabled={chatBusy || !chatInput.trim()}
            style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: chatBusy || !chatInput.trim() ? T.btnDisabled : T.accent, color: chatBusy || !chatInput.trim() ? T.btnDisabledText : '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: chatBusy || !chatInput.trim() ? 'not-allowed' : 'pointer' }}>
            <Send size={15} />
          </motion.button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {["How's the market today?", "Any positive news?", "Analyse NVDA for me"].map(q => (
          <motion.button key={q} whileTap={{ scale: 0.95 }} onClick={() => sendChat(q)} disabled={chatBusy}
            style={{ fontFamily: 'var(--font-display)', fontSize: 12, padding: '6px 14px', borderRadius: 20, border: `1px solid ${T.border}`, color: T.text2, background: 'none', cursor: 'pointer' }}>{q}</motion.button>
        ))}
      </div>
      <p style={{ ...MONO, marginTop:8, fontSize:10, color:T.text3 }}>
        {srSupported ? 'Tap the mic to talk, or type. ' : 'Voice input needs Chrome. '}
        AXIOM reads your message and routes to the right specialist — or convenes the full council for a buy/sell ruling.
      </p>
    </div>
  );
}
