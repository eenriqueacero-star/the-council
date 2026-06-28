import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Plus, Trash2, Edit2, Check, X, RefreshCw, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Coins, Loader2, Newspaper } from 'lucide-react';
import { getQuotes, getCandles, getNews, callAgent, getFredData } from '../api.js';
import { theme } from '../utils/theme.js';
import { PROTOCOLS } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import AnimatedNumber from './ui/AnimatedNumber.jsx';
import CouncilLoader from './ui/CouncilLoader.jsx';

const LOGO_DOMAINS = {
  NVDA:'nvidia.com',  MU:'micron.com',    AMD:'amd.com',       AAPL:'apple.com',
  TSLA:'tesla.com',   MSFT:'microsoft.com',GOOG:'google.com',   AMZN:'amazon.com',
  META:'meta.com',    PLTR:'palantir.com', CRDO:'credotech.com',ALAB:'asteralabs.com',
  NBIS:'nebius.com',  APLD:'applieddigital.com',SNDK:'sandisk.com',FLY:'fireflyspace.com',
  OKLO:'oklo.com',    LPTH:'lpth.com',     COIN:'coinbase.com', MSTR:'microstrategy.com',
  SOFI:'sofi.com',    NFLX:'netflix.com',  INTC:'intel.com',    AVGO:'broadcom.com',
};

const RANGES = ['1D','1W','1M','3M','1Y','ALL'];

function TickerLogo({ ticker, dark, size = 36 }) {
  const [err, setErr] = useState(false);
  const T = theme(dark);
  const domain = LOGO_DOMAINS[ticker];
  if (!domain || err) return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#27272A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A1A1AA', fontSize: size * 0.33, fontWeight: 600, flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
      {ticker.slice(0, 2)}
    </div>
  );
  return <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} onError={() => setErr(true)} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'contain', flexShrink: 0, background: T.bgCard }} alt={ticker} />;
}

function fmtPct(n) { return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`; }

function detectSentiment(text) {
  const t = (text || '').toLowerCase();
  if (/beat|raise|upgrade|growth|partnership|record|accelerat|bullish|unveils|launches/.test(t)) return 'positive';
  if (/miss|downgrade|cut|decline|risk|concern|warning|oversupply|slips|fall|drops/.test(t)) return 'negative';
  return 'neutral';
}

function detectCategory(text) {
  const t = (text || '').toLowerCase();
  if (/\bfed\b|rate|inflation|monetary/.test(t)) return 'Fed';
  if (/earnings|revenue|\beps\b|beat|miss/.test(t)) return 'Earnings';
  if (/\bai\b|chip|semiconductor|data center/.test(t)) return 'Tech';
  if (/oil|energy|opec/.test(t)) return 'Energy';
  if (/defense|military|contract/.test(t)) return 'Defense';
  return 'Market';
}

function timeAgo(datetime) {
  const diff = Date.now() - datetime * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function isWeekend() {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

const SENTIMENT_COLORS = {
  positive: { border: '#22C55E', badge: 'rgba(34,197,94,0.15)', text: '#22C55E', label: 'Positive' },
  negative: { border: '#EF4444', badge: 'rgba(239,68,68,0.15)', text: '#EF4444', label: 'Negative' },
  neutral:  { border: '#52525B', badge: 'rgba(82,82,91,0.15)',  text: '#71717A', label: 'Neutral'  },
};

const STAGGER = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };
const ITEM    = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] } } };

function DCASheet({ acct, acctHoldings, positionsLine, flagApiDown, dark, onClose }) {
  const T = theme(dark);
  const MFONT = { fontFamily: "ui-monospace, 'SF Mono', monospace" };
  const [dcaAmount, setDcaAmount] = useState('');
  const [dca, setDca] = useState({ status: 'idle', result: null });
  const ACCENT = '#F59E0B';

  async function allocateDCA() {
    if (dca.status === 'running') return;
    const amt = (dcaAmount.trim() ? Number(dcaAmount) : acct.dca) || 0;
    if (!amt) { setDca({ status: 'done', result: { allocations: [], summary: 'No DCA amount set. Enter an amount above.' } }); return; }
    setDca({ status: 'running', result: null });
    const sys = `You are the DCA ALLOCATOR. ${PROTOCOLS}
The investor makes a recurring DCA buy into the ${acct.label} account (current positions: ${positionsLine}). Available this round: $${amt}. Search recent price action for these holdings and allocate the dollars toward the 1-2 best "buy the dip" setups — most oversold / closest to weekly support while still in an uptrend. Concentrate, don't spread thin. NEVER add to a name tripping the sell protocol (note it if so).
Respond ONLY with JSON in a \`\`\`json block: {"allocations":[{"ticker":"X","amount":<dollars>,"pct":<0-100>,"reason":"<one line>"}],"summary":"<2 sentences>"}`;
    try {
      const { text: txt } = await callAgent(sys, `Allocate this round's $${amt} for ${acct.label}. Today is ${new Date().toDateString()}. Return ONLY the JSON.`, true);
      const p = extractJSON(txt);
      setDca({ status: 'done', result: p || { allocations: [], summary: 'Could not parse allocation.' } });
    } catch {
      flagApiDown?.();
      setDca({ status: 'error', result: null });
    }
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;

  const sheetStyle = isMobile ? {
    position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
    background: dark ? 'rgba(24,24,27,0.98)' : 'rgba(250,250,250,0.98)',
    borderRadius: '16px 16px 0 0', backdropFilter: 'blur(24px)',
    padding: '0 0 env(safe-area-inset-bottom, 0px)',
    maxHeight: '82vh', overflowY: 'auto',
    boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
    border: `1px solid ${T.border}`,
  } : {
    position: 'fixed', top: 0, right: 0, bottom: 0, width: 400, zIndex: 200,
    background: dark ? 'rgba(24,24,27,0.98)' : 'rgba(250,250,250,0.98)',
    backdropFilter: 'blur(24px)', overflowY: 'auto',
    boxShadow: '-8px 0 40px rgba(0,0,0,0.3)',
    border: `1px solid ${T.border}`,
  };

  const initialAnim = isMobile ? { y: '100%' } : { x: '100%' };
  const animateAnim = isMobile ? { y: 0 } : { x: 0 };
  const exitAnim    = isMobile ? { y: '100%' } : { x: '100%' };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 199 }}
      />
      <motion.div
        initial={initialAnim} animate={animateAnim} exit={exitAnim}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        drag={isMobile ? 'y' : false}
        dragConstraints={{ top: 0 }}
        dragElastic={0.1}
        onDragEnd={(_, info) => { if (info.offset.y > 100) onClose(); }}
        style={sheetStyle}
      >
        {/* Drag handle (mobile) */}
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
          </div>
        )}
        <div style={{ padding: '16px 20px 28px', fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Coins size={16} style={{ color: ACCENT }} />
              <span style={{ ...MFONT, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: T.text }}>
                SMART DCA · {acct.label.toUpperCase()}
              </span>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text3, padding: 4, display: 'flex' }}><X size={18} /></button>
          </div>
          <p style={{ fontSize: 13, color: T.text2, lineHeight: 1.55, marginBottom: 16 }}>
            Concentrates your DCA into the 1–2 best "buy the dip" setups. Skips anything tripping the sell protocol.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
              <Coins size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.text3 }} />
              <input
                value={dcaAmount}
                onChange={e => setDcaAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                placeholder={`amount (default $${acct.dca || '—'})`}
                style={{ ...MFONT, fontSize: 13, width: '100%', paddingLeft: 36, paddingRight: 12, paddingTop: 11, paddingBottom: 11, background: T.input, border: `1px solid ${T.inputBorder}`, borderRadius: 10, color: T.text, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <button onClick={allocateDCA} disabled={dca.status === 'running'} style={{
              ...MFONT, fontSize: 13, fontWeight: 600, letterSpacing: '0.06em',
              background: dca.status === 'running' ? T.bgHover : (dark ? '#F2F2F7' : '#000000'),
              color: dca.status === 'running' ? T.text2 : (dark ? '#000000' : '#FFFFFF'),
              border: 'none', borderRadius: 10, padding: '11px 22px',
              cursor: dca.status === 'running' ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
            }}>
              {dca.status === 'running' ? <><Loader2 size={15} className="animate-spin" /> ALLOCATING…</> : 'ALLOCATE'}
            </button>
          </div>
          {dca.status === 'running' && (
            <div style={{ border: `1px solid ${ACCENT}22`, borderRadius: 12, padding: '16px', display: 'flex', alignItems: 'center', gap: 10, background: T.bgCard, ...MFONT, color: ACCENT }}>
              <Loader2 size={14} className="animate-spin" />
              <span style={{ fontSize: 13 }}>Scanning {acctHoldings.length} holdings for the best dip…</span>
            </div>
          )}
          {dca.status === 'done' && dca.result && (
            <div>
              {(dca.result.allocations || []).map((al, i) => (
                <div key={i} style={{ marginBottom: 8, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ textAlign: 'center', minWidth: 60 }}>
                    <div style={{ ...MFONT, fontSize: 20, fontWeight: 700, color: ACCENT }}>${al.amount}</div>
                    <div style={{ ...MFONT, fontSize: 9, color: T.text3 }}>{al.pct}%</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{al.ticker}</div>
                    <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.4, marginTop: 2 }}>{al.reason}</div>
                  </div>
                </div>
              ))}
              {dca.result.summary && (
                <p style={{ fontSize: 13, color: T.text2, lineHeight: 1.55, marginTop: 12, paddingLeft: 12, borderLeft: `2px solid ${ACCENT}55` }}>{dca.result.summary}</p>
              )}
              <p style={{ ...MFONT, fontSize: 10, color: T.text3, marginTop: 12 }}>You execute the buys — this is a suggestion, not an order.</p>
            </div>
          )}
          {dca.status === 'idle' && (
            <div style={{ marginTop: 16, textAlign: 'center', padding: '32px 16px', border: `1px dashed ${T.border}`, borderRadius: 12 }}>
              <Coins size={24} style={{ color: T.text3, margin: '0 auto 10px' }} />
              <p style={{ fontSize: 13, color: T.text2 }}>Hit ALLOCATE to route {acct?.label}'s DCA into the best dip.</p>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

export default function PortfolioTab({ account, acct, posMap, acctHoldings, positions, setPos, addTicker, removeTicker, flagApiDown, marketState, onDayChange, dark, saveStatus, authReady, onTabChange }) {
  const T = theme(dark);
  const prefersReduced = useReducedMotion();
  const [quotes,        setQuotes]        = useState({});
  const [candles,       setCandles]       = useState([]);
  const [candlesLoaded, setCandlesLoaded] = useState(false);
  const [range,         setRange]         = useState('1D');
  const [expanded,      setExpanded]      = useState(null);
  const [chartKey,      setChartKey]      = useState(0);
  const [scrubIdx,      setScrubIdx]      = useState(null);
  const [addMode,       setAddMode]       = useState(false);
  const [newTicker,     setNewTicker]     = useState('');
  const [newShares,     setNewShares]     = useState('');
  const [newCost,       setNewCost]       = useState('');
  const [editTicker,    setEditTicker]    = useState(null);
  const [editShares,    setEditShares]    = useState('');
  const [editCost,      setEditCost]      = useState('');
  const [dcaOpen,       setDcaOpen]       = useState(false);
  const [newsItems,     setNewsItems]     = useState(null); // null = not fetched yet
  const [newsLoading,   setNewsLoading]   = useState(false);
  const [newsWeekend,   setNewsWeekend]   = useState(false);
  const [macroPulse,    setMacroPulse]    = useState(null); // null = not fetched
  const [macroOpen,     setMacroOpen]     = useState(false);
  const timerRef = useRef(null);

  const tickers    = acctHoldings.filter(t => posMap[t]);
  const withShares = tickers.filter(t => parseFloat(posMap[t]?.shares) > 0);

  const fetchQuotes = useCallback(async () => {
    if (!tickers.length) return;
    try { setQuotes(await getQuotes(tickers)); } catch { flagApiDown?.(); }
  }, [tickers.join(',')]);

  useEffect(() => {
    if (!authReady) return;
    fetchQuotes();
    timerRef.current = setInterval(fetchQuotes, 60000);
    return () => clearInterval(timerRef.current);
  }, [fetchQuotes, authReady]);

  useEffect(() => {
    if (!authReady || macroPulse) return;
    getFredData().then(d => { if (d) setMacroPulse(d); }).catch(() => {});
  }, [authReady]);

  const fetchNews = useCallback(async (holdingsBySize) => {
    if (newsItems !== null || newsLoading || newsWeekend) return;
    if (isWeekend()) { setNewsWeekend(true); return; }
    setNewsLoading(true);
    try {
      const top5 = holdingsBySize.slice(0, 5);
      const newsPerTicker = await Promise.all(top5.map(t => getNews(t)));
      const allArticles = [];
      newsPerTicker.forEach((result, i) => {
        const ticker = top5[i];
        const articles = (result.articles || []).slice(0, 3);
        articles.forEach(a => allArticles.push({ ...a, ticker }));
      });
      const limited = allArticles.slice(0, 15);

      const summarized = await Promise.all(limited.map(async (article) => {
        try {
          const sys = `You are a portfolio analyst. Given this news about ${article.ticker}, write ONE sentence explaining how this could affect someone holding ${article.ticker}. Be specific and actionable. No fluff.`;
          const usr = `Headline: ${article.headline}\nSummary: ${article.summary || article.headline}`;
          const { text } = await callAgent(sys, usr, false, 80);
          return { ...article, aiSummary: text?.trim() || null };
        } catch {
          return { ...article, aiSummary: null };
        }
      }));

      const enriched = summarized.map(a => ({
        ...a,
        sentiment: detectSentiment(a.headline + ' ' + (a.summary || '')),
        category: detectCategory(a.headline + ' ' + (a.summary || '')),
        mentionedTickers: top5.filter(t => (a.headline + ' ' + (a.summary || '')).includes(t)),
      }));

      setNewsItems(enriched);
    } catch {
      setNewsItems([]);
    } finally {
      setNewsLoading(false);
    }
  }, [newsItems, newsLoading, newsWeekend]);

  useEffect(() => {
    if (!authReady || !withShares.length || newsItems !== null || newsLoading || newsWeekend) return;
    const bySize = [...withShares].sort((a, b) => {
      const qa = quotes[a] || {}, qb = quotes[b] || {};
      const va = (parseFloat(posMap[a]?.shares) || 0) * (qa.price || 0);
      const vb = (parseFloat(posMap[b]?.shares) || 0) * (qb.price || 0);
      return vb - va;
    });
    fetchNews(bySize);
  }, [authReady, withShares.join(','), newsItems, newsLoading, newsWeekend]);

  const fetchCandles = useCallback(async () => {
    if (!withShares.length) { setCandlesLoaded(true); return; }
    setCandlesLoaded(false);
    try {
      const data    = await getCandles(withShares, range);
      const primary = withShares[0];
      const base    = data[primary];
      if (!base?.length) { setCandles([]); setCandlesLoaded(true); return; }
      const minLen = Math.min(...withShares.map(t => data[t]?.length || 0).filter(l => l > 0));
      const curve  = base.slice(0, minLen).map((pt, idx) => {
        let val = 0;
        withShares.forEach(t => { val += (parseFloat(posMap[t]?.shares) || 0) * (data[t]?.[idx]?.c || quotes[t]?.price || 0); });
        return { t: pt.t, c: val };
      });
      setCandles(curve);
      setChartKey(k => k + 1);
    } catch { setCandles([]); } finally { setCandlesLoaded(true); }
  }, [withShares.join(','), range]);

  useEffect(() => { fetchCandles(); }, [fetchCandles]);

  let totalValue = 0, prevValue = 0;
  withShares.forEach(t => {
    const sh = parseFloat(posMap[t]?.shares) || 0;
    const q  = quotes[t] || {};
    totalValue += sh * (q.price     || 0);
    prevValue  += sh * (q.prevClose || q.price || 0);
  });
  const dayChange    = totalValue - prevValue;
  const dayChangePct = prevValue > 0 ? (dayChange / prevValue) * 100 : 0;
  const buyingPower  = parseFloat(acct?.capital) || 0;
  const isUp         = dayChange >= 0;
  const lineColor    = dayChange > 0 ? T.green : dayChange < 0 ? T.red : T.text3;

  useEffect(() => { onDayChange?.(dayChange); }, [dayChange]);

  const chartPoints  = candles.map(c => c.c);
  const displayValue = (scrubIdx !== null && chartPoints[scrubIdx]) ? chartPoints[scrubIdx] : totalValue;

  // SVG chart
  const W = 400, H = 160, PAD_L = 52, PAD_B = 28, PAD_T = 12, PAD_R = 8;
  const CW = W - PAD_L - PAD_R, CH = H - PAD_T - PAD_B;

  // Catmull-Rom → cubic bezier conversion
  function catmullRomPath(xs, ys) {
    if (xs.length < 2) return `M${xs[0]},${ys[0]}`;
    let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
    for (let i = 0; i < xs.length - 1; i++) {
      const p0 = i > 0 ? i - 1 : i;
      const p1 = i, p2 = i + 1, p3 = i + 2 < xs.length ? i + 2 : i + 1;
      const cp1x = xs[p1] + (xs[p2] - xs[p0]) / 6;
      const cp1y = ys[p1] + (ys[p2] - ys[p0]) / 6;
      const cp2x = xs[p2] - (xs[p3] - xs[p1]) / 6;
      const cp2y = ys[p2] - (ys[p3] - ys[p1]) / 6;
      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${xs[p2].toFixed(1)},${ys[p2].toFixed(1)}`;
    }
    return d;
  }

  const renderChart = () => {
    if (!withShares.length) return (
      <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: T.text3 }}>Add positions with share counts to see your equity curve</span>
      </div>
    );
    if (!chartPoints.length && !candlesLoaded) return <div className="skeleton" style={{ height: H, borderRadius: 8 }} />;
    const effectivePoints = chartPoints.length ? chartPoints : (prevValue > 0 ? [prevValue, totalValue || prevValue] : []);
    const effectiveTimes  = candles.length ? candles.map(c => c.t) : null;
    if (!effectivePoints.length) return (
      <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: T.text3 }}>No chart data</span>
      </div>
    );

    const isSynthetic = !chartPoints.length;
    const min = Math.min(...effectivePoints), max = Math.max(...effectivePoints);
    const rng = max - min || max * 0.01 || 1;
    const padMin = min - rng * 0.08, padMax = max + rng * 0.08;
    const padRng = padMax - padMin;

    const xs = effectivePoints.map((_, i) => PAD_L + (i / Math.max(effectivePoints.length - 1, 1)) * CW);
    const ys = effectivePoints.map(p => PAD_T + CH - ((p - padMin) / padRng) * CH);

    const linePath = catmullRomPath(xs, ys);
    const areaPath = `${linePath} L${xs[xs.length-1].toFixed(1)},${(PAD_T+CH).toFixed(1)} L${PAD_L},${(PAD_T+CH).toFixed(1)} Z`;
    const gradId   = `cg${chartKey}`;
    const scrubX   = scrubIdx !== null ? xs[scrubIdx] : null;
    const scrubY   = scrubIdx !== null ? ys[scrubIdx] : null;

    // Y-axis: 3 labels
    const yLabels = [padMin + padRng * 0.1, padMin + padRng * 0.5, padMin + padRng * 0.9].map((v, i) => ({
      v, y: PAD_T + CH - ((v - padMin) / padRng) * CH
    }));

    // X-axis: 3 date labels
    const fmtDate = (ts) => {
      if (!ts) return '';
      const d = new Date(ts * 1000);
      return range === '1D'
        ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    const xLabelIdxs = effectiveTimes ? [0, Math.floor(effectiveTimes.length / 2), effectiveTimes.length - 1] : [];

    const handleMove = e => {
      const rect = e.currentTarget.getBoundingClientRect();
      const cx   = e.touches ? e.touches[0].clientX : e.clientX;
      const relX = cx - rect.left - (rect.width * PAD_L / W);
      const plotW = rect.width * CW / W;
      const idx  = Math.round((relX / plotW) * (effectivePoints.length - 1));
      setScrubIdx(Math.max(0, Math.min(effectivePoints.length - 1, idx)));
    };

    return (
      <div key={chartKey} style={{ position: 'relative', height: H, userSelect: 'none' }}
        onMouseMove={handleMove} onTouchMove={handleMove}
        onMouseLeave={() => setScrubIdx(null)} onTouchEnd={() => setScrubIdx(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={lineColor} stopOpacity="0.22" />
              <stop offset="75%"  stopColor={lineColor} stopOpacity="0.06" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0"    />
            </linearGradient>
          </defs>
          {/* Y-axis grid lines + labels */}
          {yLabels.map(({ v, y }, i) => (
            <g key={i}>
              <line x1={PAD_L} y1={y.toFixed(1)} x2={W - PAD_R} y2={y.toFixed(1)} stroke={T.border} strokeWidth="0.5" strokeDasharray="3 4" />
              <text x={PAD_L - 4} y={(y + 4).toFixed(1)} textAnchor="end" fontSize="9" fill={T.text3} fontFamily="var(--font-mono)">
                ${v >= 1000 ? (v/1000).toFixed(1)+'k' : v.toFixed(0)}
              </text>
            </g>
          ))}
          {/* X-axis date labels */}
          {xLabelIdxs.map((idx, i) => effectiveTimes?.[idx] && (
            <text key={i} x={xs[idx].toFixed(1)} y={(H - 6).toFixed(1)} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontSize="9" fill={T.text3} fontFamily="var(--font-mono)">
              {fmtDate(effectiveTimes[idx])}
            </text>
          ))}
          {/* Chart area + line */}
          <path d={areaPath} fill={`url(#${gradId})`} />
          <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {scrubX !== null && (
            <>
              <line x1={scrubX.toFixed(1)} y1={PAD_T} x2={scrubX.toFixed(1)} y2={PAD_T + CH} stroke={T.text3} strokeWidth="1" strokeDasharray="4 3" />
              <circle cx={scrubX.toFixed(1)} cy={scrubY.toFixed(1)} r="3.5" fill={lineColor} stroke={T.bg} strokeWidth="1.5" />
            </>
          )}
        </svg>
        {isSynthetic && <div style={{ position: 'absolute', bottom: PAD_B + 4, right: PAD_R + 4, fontFamily: 'var(--font-mono)', fontSize: 9, color: T.text3 }}>PREV CLOSE REF</div>}
      </div>
    );
  };

  const movers = withShares.map(t => {
    const q   = quotes[t] || {};
    const pct = q.prevClose ? ((q.price - q.prevClose) / q.prevClose) * 100 : 0;
    return { t, pct, price: q.price || 0 };
  }).filter(m => Math.abs(m.pct) > 0.01).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 5);

  const S = { padding: '0 var(--space-page)', maxWidth: 760, margin: '0 auto' };

  return (
    <div style={{ minHeight: '100vh' }}>

      {/* Hero section */}
      <div style={{ ...S, paddingTop: 24, paddingBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            {/* Animated total value */}
            <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color: T.text, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-display)' }}>
              <AnimatedNumber
                value={displayValue}
                format={v => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                duration={prefersReduced ? 0 : 1}
              />
            </div>
            <motion.div
              key={dayChange > 0 ? 'up' : dayChange < 0 ? 'down' : 'flat'}
              initial={prefersReduced ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span style={{ fontSize: 15, fontWeight: 600, color: lineColor, fontFamily: 'var(--font-display)' }}>
                {dayChange >= 0 ? '+' : ''}{dayChange.toFixed(2)} ({fmtPct(dayChangePct)})
              </span>
              <span style={{ fontSize: 13, color: T.text3 }}>Today</span>
            </motion.div>
            {buyingPower > 0 && <div style={{ fontSize: 13, color: T.text2, marginTop: 4 }}>${buyingPower.toLocaleString()} cash</div>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, paddingTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className={marketState === 'open' ? 'live-dot' : ''} style={{ width: 7, height: 7, borderRadius: '50%', background: marketState === 'open' ? T.green : T.text3 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: T.text3, letterSpacing: '0.08em' }}>
                {marketState === 'open' ? 'LIVE' : marketState === 'premarket' ? 'PRE' : marketState === 'afterhours' ? 'AH' : 'CLOSED'}
              </span>
            </div>
            {saveStatus !== 'idle' && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: saveStatus === 'error' ? T.red : saveStatus === 'saved' ? T.green : T.text3 }}>
                {saveStatus === 'saving' ? 'SAVING…' : saveStatus === 'saved' ? 'SAVED ✓' : 'FAILED'}
              </span>
            )}
          </div>
        </div>

        {/* Chart */}
        <div style={{ marginTop: 20 }}>{renderChart()}</div>

        {/* Range pills */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 8, marginBottom: 20, gap: 2 }}>
          {RANGES.map(r => (
            <motion.button key={r} onClick={() => setRange(r)} whileTap={{ scale: 0.92 }} style={{
              fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: range === r ? 600 : 400,
              padding: '5px 11px', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: range === r ? T.accent : 'transparent',
              color: range === r ? '#fff' : T.text3,
              transition: 'all 0.18s ease',
            }}>{r}</motion.button>
          ))}
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => { fetchQuotes(); fetchCandles(); }}
            style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: T.text3, display: 'flex', padding: 6 }}>
            <RefreshCw size={13} />
          </motion.button>
        </div>

        {/* Summary row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
          {[
            ['Equity',   `$${totalValue.toFixed(2)}`],
            ['Cash',     `$${buyingPower.toLocaleString()}`],
            ['Total',    `$${(totalValue + buyingPower).toFixed(2)}`],
          ].map(([label, val]) => (
            <div key={label} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top movers — horizontal scroll (max 5, mobile-responsive) */}
      {movers.length > 0 && (() => {
        const isMob = typeof window !== 'undefined' && window.innerWidth < 768;
        const cardMin  = isMob ? 72 : 90;
        const cardPad  = isMob ? '10px 10px' : '12px 14px';
        const nameSz   = isMob ? 12 : 13;
        const pctSz    = isMob ? 11 : 12;
        const priceSz  = isMob ? 10 : 11;
        return (
          <>
          {/* Macro Pulse */}
          {macroPulse && (() => {
            const spread = macroPulse.yield_spread;
            const metrics = [
              { label: 'Fed Rate', value: `${macroPulse.fed_rate?.current ?? '—'}%`, sub: macroPulse.fed_rate?.date, color: '#f5c451' },
              { label: 'CPI', value: macroPulse.cpi?.current ?? '—', sub: macroPulse.cpi?.date, color: '#38e0d4' },
              { label: 'VIX', value: macroPulse.vix?.current ?? '—', sub: macroPulse.vix?.current > 20 ? '⚠ elevated' : 'calm', color: macroPulse.vix?.current > 20 ? '#f87171' : '#4ade80' },
              { label: 'Yield Spread', value: spread?.current != null ? `${spread.current.toFixed(2)}%` : '—', sub: spread?.inverted ? '⚠ INVERTED' : '10Y–2Y', color: spread?.inverted ? '#f87171' : '#38e0d4' },
            ];
            return (
              <div style={{ ...S, marginBottom: 16 }}>
                <button onClick={() => setMacroOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: macroOpen ? 10 : 0 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Macro Pulse</span>
                  {macroOpen ? <ChevronUp size={12} color={T.text3} /> : <ChevronDown size={12} color={T.text3} />}
                </button>
                <AnimatePresence initial={false}>
                  {macroOpen && (
                    <motion.div key="macro-pulse" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                        {metrics.map(m => (
                          <div key={m.label} style={{ background: T.bgCard, border: `1px solid ${m.color}30`, borderLeft: `3px solid ${m.color}`, borderRadius: 8, padding: '8px 10px' }}>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{m.label}</div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: m.color }}>{m.value}</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: T.text3, marginTop: 2 }}>{m.sub}</div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })()}
          <div style={{ marginBottom: 24 }}>
            <div style={{ ...S, paddingBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Top Movers</span>
            </div>
            <div className="no-scrollbar" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingLeft: 'var(--space-page)', paddingRight: 'var(--space-page)', paddingBottom: 4, justifyContent: 'center', maxWidth: 1200, margin: '0 auto' }}>
              {movers.map(({ t, pct, price }) => (
                <motion.div key={t} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} style={{
                  flexShrink: 0, background: T.bgCard, border: `1px solid ${pct >= 0 ? T.green + '25' : T.red + '25'}`,
                  borderRadius: 12, padding: cardPad, minWidth: cardMin, cursor: 'pointer',
                }}>
                  <TickerLogo ticker={t} dark={dark} size={isMob ? 24 : 28} />
                  <div style={{ marginTop: 8, fontFamily: 'var(--font-display)', fontSize: nameSz, fontWeight: 600, color: T.text }}>{t}</div>
                  <div style={{ fontSize: pctSz, fontWeight: 500, color: pct >= 0 ? T.green : T.red, marginTop: 2 }}>{fmtPct(pct)}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: priceSz, color: T.text2, marginTop: 1 }}>${price.toFixed(2)}</div>
                </motion.div>
              ))}
            </div>
          </div>
          </>
        );
      })()}

      {/* Holdings */}
      <div style={{ ...S, paddingBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Holdings</span>
          <motion.button onClick={() => setAddMode(!addMode)} whileTap={{ scale: 0.96 }} style={{
            fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 500, color: T.text,
            border: `1px solid ${T.border}`, borderRadius: 8, padding: '5px 12px',
            background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Plus size={13} /> Add
          </motion.button>
        </div>

        <AnimatePresence>
          {addMode && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', overflow: 'hidden' }}>
              {[
                [newTicker, setNewTicker, 'TICKER', 72, true],
                [newShares, setNewShares, 'Shares',  90, false],
                [newCost,   setNewCost,   'Avg cost',100, false],
              ].map(([val, fn, ph, w, upper]) => (
                <input key={ph} value={val} onChange={e => fn(upper ? e.target.value.toUpperCase() : e.target.value)} placeholder={ph}
                  style={{ width: w, padding: '8px 10px', border: `1px solid ${T.inputBorder}`, borderRadius: 8, fontSize: 13, background: T.input, color: T.text, outline: 'none', fontFamily: upper ? 'var(--font-mono)' : 'var(--font-display)' }} />
              ))}
              <motion.button whileTap={{ scale: 0.96 }} onClick={() => {
                if (!newTicker) return;
                addTicker(newTicker);
                if (newShares) setPos(newTicker, 'shares', newShares);
                if (newCost)   setPos(newTicker, 'cost', newCost);
                setNewTicker(''); setNewShares(''); setNewCost(''); setAddMode(false);
              }} style={{ padding: '8px 16px', background: T.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Add</motion.button>
              <motion.button whileTap={{ scale: 0.96 }} onClick={() => setAddMode(false)} style={{ padding: '8px 12px', border: `1px solid ${T.border}`, background: 'transparent', color: T.text2, borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden' }}>
          {tickers.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.text3, fontSize: 14 }}>No positions yet. Add a ticker above.</div>
          ) : (
            <motion.div variants={prefersReduced ? undefined : STAGGER} initial="hidden" animate="visible">
              {tickers.map((t, idx) => {
                const q      = quotes[t] || {};
                const pos    = posMap[t]  || {};
                const shares = parseFloat(pos.shares) || 0;
                const cost   = parseFloat(String(pos.cost || '').replace(/[^0-9.]/g, '')) || 0;
                const price  = q.price    || 0;
                const prev   = q.prevClose|| price;
                const val    = shares * price;
                const dayPct = prev ? ((price - prev) / prev) * 100 : 0;
                const totRet = cost && shares ? ((price - cost) / cost) * 100 : null;
                const totPnL = shares && cost ? (price - cost) * shares : null;
                const isExp  = expanded === t;
                const isEdit = editTicker === t;

                return (
                  <motion.div key={t} variants={prefersReduced ? undefined : ITEM}>
                    {/* Row */}
                    <motion.div
                      onClick={() => setExpanded(isExp ? null : t)}
                      whileHover={{ background: T.bgCardHover }}
                      whileTap={{ scale: 0.995 }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 68, padding: '0 16px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer', background: T.bgCard }}
                    >
                      <TickerLogo ticker={t} dark={dark} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{t}</div>
                        {shares > 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: T.text2, marginTop: 1 }}>{shares} sh{val > 0 ? ` · $${val.toFixed(0)}` : ''}</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {price > 0 ? (
                          <>
                            <div style={{ fontSize: 15, fontWeight: 500, color: T.text }}>${price.toFixed(2)}</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: dayPct >= 0 ? T.green : T.red, marginTop: 1 }}>{fmtPct(dayPct)}</div>
                          </>
                        ) : <div className="skeleton" style={{ width: 56, height: 30, borderRadius: 6 }} />}
                      </div>
                      <motion.div animate={{ rotate: isExp ? 180 : 0 }} transition={{ duration: 0.2 }} style={{ color: T.text3, flexShrink: 0 }}>
                        <ChevronDown size={16} />
                      </motion.div>
                    </motion.div>

                    {/* Expanded detail */}
                    <AnimatePresence>
                      {isExp && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{ background: T.bgElevated, borderBottom: `1px solid ${T.border}`, padding: '14px 16px 18px' }}>
                            {isEdit ? (
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                <input value={editShares} onChange={e => setEditShares(e.target.value)} placeholder="Shares"
                                  style={{ width: 100, padding: '8px 10px', border: `1px solid ${T.inputBorder}`, borderRadius: 8, fontSize: 13, background: T.input, color: T.text, outline: 'none' }} />
                                <input value={editCost} onChange={e => setEditCost(e.target.value)} placeholder="Avg cost"
                                  style={{ width: 100, padding: '8px 10px', border: `1px solid ${T.inputBorder}`, borderRadius: 8, fontSize: 13, background: T.input, color: T.text, outline: 'none' }} />
                                <motion.button whileTap={{ scale: 0.94 }} onClick={() => { setPos(t, 'shares', editShares); setPos(t, 'cost', editCost); setEditTicker(null); }}
                                  style={{ padding: '8px 14px', background: T.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}><Check size={14} /></motion.button>
                                <motion.button whileTap={{ scale: 0.94 }} onClick={() => setEditTicker(null)}
                                  style={{ padding: '8px 12px', border: `1px solid ${T.border}`, background: 'transparent', color: T.text, borderRadius: 8, cursor: 'pointer' }}><X size={14} /></motion.button>
                                <motion.button whileTap={{ scale: 0.94 }} onClick={() => { removeTicker(t); setExpanded(null); setEditTicker(null); }}
                                  style={{ padding: '8px 12px', border: `1px solid ${T.red}30`, background: 'transparent', borderRadius: 8, cursor: 'pointer', color: T.red }}><Trash2 size={14} /></motion.button>
                              </div>
                            ) : (
                              <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 16px', marginBottom: 14 }}>
                                  {[
                                    ['Avg Cost',     cost > 0 ? `$${cost.toFixed(2)}` : '—'],
                                    ['Market Val',   val > 0  ? `$${val.toFixed(2)}`  : '—'],
                                    ['Total Return', totRet !== null ? fmtPct(totRet) : '—', totRet],
                                    ['Total P&L',    totPnL !== null ? `${totPnL >= 0 ? '+' : ''}$${Math.abs(totPnL).toFixed(2)}` : '—', totPnL],
                                  ].map(([label, v, num]) => (
                                    <div key={label}>
                                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
                                      <div style={{ fontSize: 14, fontWeight: 500, color: num != null ? (num >= 0 ? T.green : T.red) : T.text }}>{v}</div>
                                    </div>
                                  ))}
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  {onTabChange && (
                                    <motion.button whileTap={{ scale: 0.96 }} onClick={e => { e.stopPropagation(); onTabChange('council'); }}
                                      style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 500, padding: '7px 14px', background: T.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                                      Run Council
                                    </motion.button>
                                  )}
                                  <motion.button whileTap={{ scale: 0.96 }} onClick={e => { e.stopPropagation(); setEditTicker(t); setEditShares(pos.shares || ''); setEditCost(pos.cost || ''); }}
                                    style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: T.text2, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>
                                    <Edit2 size={12} /> Edit
                                  </motion.button>
                                </div>
                              </>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>

        {/* Portfolio News section */}
        {withShares.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Newspaper size={14} style={{ color: T.text3 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Market News</span>
            </div>

            {newsWeekend ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>📅</span>
                <span style={{ fontSize: 13, color: T.text3 }}>Markets closed — news refreshes Monday</span>
              </div>
            ) : newsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                <CouncilLoader size="sm" />
              </div>
            ) : newsItems && newsItems.length === 0 ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, fontSize: 13, color: T.text3 }}>
                No recent news for your holdings
              </div>
            ) : newsItems && newsItems.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {newsItems.map((article, i) => {
                  const sc = SENTIMENT_COLORS[article.sentiment] || SENTIMENT_COLORS.neutral;
                  return (
                    <motion.div
                      key={`${article.ticker}-${i}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.25 }}
                      onClick={() => article.url && window.open(article.url, '_blank')}
                      style={{
                        background: T.bgCard,
                        border: `1px solid ${T.border}`,
                        borderLeft: `3px solid ${sc.border}`,
                        borderRadius: 12,
                        padding: 16,
                        cursor: article.url ? 'pointer' : 'default',
                        maxWidth: 800,
                      }}
                    >
                      {/* Row 1: source + time + sentiment badge */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: T.text }}>{article.source || 'News'}</span>
                          <span style={{ fontSize: 12, color: T.text3 }}>· {timeAgo(article.datetime)}</span>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: sc.badge, color: sc.text }}>
                          {sc.label}
                        </span>
                      </div>

                      {/* Row 2: headline */}
                      <div style={{ fontSize: 15, fontWeight: 500, color: T.text, lineHeight: 1.45, marginBottom: 8 }}>
                        {article.headline}
                      </div>

                      {/* Row 3: AI summary */}
                      {article.aiSummary && (
                        <div style={{ fontSize: 13, color: T.text2, fontStyle: 'italic', lineHeight: 1.5, marginBottom: 10 }}>
                          ✨ {article.aiSummary}
                        </div>
                      )}

                      {/* Row 4: ticker pills + category */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: T.accentGlow, color: T.accent }}>
                            {article.ticker}
                          </span>
                          {article.mentionedTickers && article.mentionedTickers.filter(t => t !== article.ticker).map(t => (
                            <span key={t} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: T.text2 }}>
                              {t}
                            </span>
                          ))}
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 7px', borderRadius: 6, background: 'rgba(82,82,91,0.15)', color: T.text3 }}>
                          {article.category}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}

        {/* DCA Allocator button */}
        {withShares.length > 0 && (
          <div style={{ padding: '16px var(--space-page) 32px', maxWidth: 760, margin: '0 auto' }}>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setDcaOpen(true)}
              style={{
                fontFamily: 'var(--font-display)', width: '100%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 8, padding: '13px', borderRadius: 12,
                border: `1px solid ${T.border}`, background: 'transparent',
                color: T.text2, fontSize: 14, fontWeight: 500, cursor: 'pointer',
              }}
            >
              <Coins size={15} style={{ color: '#F59E0B' }} />
              DCA Allocator
            </motion.button>
          </div>
        )}
      </div>

      {/* DCA Bottom Sheet / Side Panel */}
      <AnimatePresence>
        {dcaOpen && (
          <DCASheet
            acct={acct}
            acctHoldings={acctHoldings}
            positionsLine={Object.keys(posMap).map(t => {
              const p = posMap[t] || {};
              const costNum = parseFloat(String(p.cost || '').replace(/[^0-9.]/g, ''));
              return p.shares ? `${t} ${p.shares}sh${costNum > 0 ? ` @ $${costNum.toFixed(2)} avg` : ''}` : t;
            }).join(', ')}
            flagApiDown={flagApiDown}
            dark={dark}
            onClose={() => setDcaOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
