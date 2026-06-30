import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Plus, Trash2, Edit2, Check, X, RefreshCw, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Coins, Loader2, Newspaper } from 'lucide-react';
import { getQuotes, getCandles, getNews, callAgent, getFredData } from '../api.js';
import { theme } from '../utils/theme.js';
import { PROTOCOLS } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import AnimatedNumber from './ui/AnimatedNumber.jsx';
import CouncilLoader from './ui/CouncilLoader.jsx';
import { pushNotify } from '../utils/notify.js';

const LOGO_DOMAINS = {
  NVDA:'nvidia.com',  MU:'micron.com',    AMD:'amd.com',       AAPL:'apple.com',
  TSLA:'tesla.com',   MSFT:'microsoft.com',GOOG:'google.com',   AMZN:'amazon.com',
  META:'meta.com',    PLTR:'palantir.com', CRDO:'credotech.com',ALAB:'asteralabs.com',
  NBIS:'nebius.com',  APLD:'applieddigital.com',SNDK:'sandisk.com',FLY:'fireflyspace.com',
  OKLO:'oklo.com',    LPTH:'lpth.com',     COIN:'coinbase.com', MSTR:'microstrategy.com',
  SOFI:'sofi.com',    NFLX:'netflix.com',  INTC:'intel.com',    AVGO:'broadcom.com',
};

const RANGES = ['1D','1W','1M','3M','6M','1Y','ALL'];

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

const SENTIMENT_COLORS = {
  positive: { border: '#22C55E', badge: 'rgba(34,197,94,0.15)', text: '#22C55E', label: 'Positive' },
  negative: { border: '#EF4444', badge: 'rgba(239,68,68,0.15)', text: '#EF4444', label: 'Negative' },
  neutral:  { border: '#52525B', badge: 'rgba(82,82,91,0.15)',  text: '#71717A', label: 'Neutral'  },
};

const STAGGER = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };
const ITEM    = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] } } };

// Catmull-Rom → cubic bezier — at module scope so StockDetailSheet can share it
function catmullRomPath(xs, ys) {
  if (!xs.length) return '';
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

function DCASheet({ acct, acctHoldings, positionsLine, flagApiDown, dark, onClose }) {
  const T = theme(dark);
  const MFONT = { fontFamily: "ui-monospace, 'SF Mono', monospace" };
  const [dcaAmount, setDcaAmount] = useState('');
  const [dca, setDca] = useState({ status: 'idle', result: null });
  const [visible, setVisible] = useState(true);
  const ACCENT = '#F59E0B';

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

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
    position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10000,
    background: dark ? 'rgba(24,24,27,0.98)' : 'rgba(250,250,250,0.98)',
    borderRadius: '16px 16px 0 0', backdropFilter: 'blur(24px)',
    maxHeight: '82vh', overflowY: 'auto',
    boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
    border: `1px solid ${T.border}`,
  } : {
    position: 'fixed', top: 0, right: 0, bottom: 0, width: 400, zIndex: 10000,
    background: dark ? 'rgba(24,24,27,0.98)' : 'rgba(250,250,250,0.98)',
    backdropFilter: 'blur(24px)', overflowY: 'auto',
    boxShadow: '-8px 0 40px rgba(0,0,0,0.3)',
    border: `1px solid ${T.border}`,
  };

  const initialAnim = isMobile ? { y: '100%' } : { x: '100%' };
  const animateAnim = isMobile ? { y: 0 } : { x: 0 };
  const exitAnim    = isMobile ? { y: '100%' } : { x: '100%' };

  return createPortal(
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            key="dca-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999 }}
          />
          <motion.div
            key="dca-sheet"
            initial={initialAnim} animate={animateAnim} exit={exitAnim}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            drag={isMobile ? 'y' : false}
            dragConstraints={{ top: 0 }}
            dragElastic={0.1}
            onDragEnd={(_, info) => { if (info.offset.y > 100) handleClose(); }}
            style={sheetStyle}
          >
        {/* Drag handle (mobile) */}
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
          </div>
        )}
        <div style={{ padding: `16px 20px calc(28px + env(safe-area-inset-bottom, 0px))`, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Coins size={16} style={{ color: ACCENT }} />
              <span style={{ ...MFONT, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: T.text }}>
                SMART DCA · {acct.label.toUpperCase()}
              </span>
            </div>
            <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text3, padding: 4, display: 'flex' }}><X size={18} /></button>
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
      )}
    </AnimatePresence>,
    document.body
  );
}

function StockDetailSheet({ ticker, posMap, quotes: parentQuotes, dark, onClose }) {
  const T = theme(dark);
  const MFONT = { fontFamily: "ui-monospace, 'SF Mono', monospace" };
  const [visible,  setVisible]  = useState(true);
  const [range,    setRange]    = useState('1M');
  const [candles,  setCandles]  = useState([]);
  const [loaded,   setLoaded]   = useState(false);
  const [chartKey, setChartKey] = useState(0);
  const [quote,    setQuote]    = useState(parentQuotes?.[ticker] || null);
  const cacheRef = useRef({});

  function handleClose() { setVisible(false); setTimeout(onClose, 300); }

  useEffect(() => {
    if (cacheRef.current[range]) {
      setCandles(cacheRef.current[range]);
      setChartKey(k => k + 1);
      return;
    }
    setLoaded(false);
    getCandles([ticker], range).then(data => {
      const pts = (data[ticker] || []).map(b => ({ t: b.t, c: b.c }));
      cacheRef.current[range] = pts;
      setCandles(pts);
      setChartKey(k => k + 1);
      setLoaded(true);
    }).catch(() => { setCandles([]); setLoaded(true); });
  }, [ticker, range]);

  useEffect(() => {
    if (!parentQuotes?.[ticker]) {
      getQuotes([ticker]).then(q => setQuote(q[ticker])).catch(() => {});
    }
  }, [ticker]);

  const W = 400, H = 160, PAD_L = 52, PAD_B = 28, PAD_T = 12, PAD_R = 8;
  const CW = W - PAD_L - PAD_R, CH = H - PAD_T - PAD_B;

  const price   = quote?.price    || 0;
  const prev    = quote?.prevClose|| price;
  const dayPct  = prev ? ((price - prev) / prev) * 100 : 0;
  const pos     = posMap[ticker]  || {};
  const shares  = parseFloat(pos.shares) || 0;
  const cost    = parseFloat(String(pos.cost || '').replace(/[^0-9.]/g, '')) || 0;
  const totRet  = cost && shares ? ((price - cost) / cost) * 100 : null;
  const totPnL  = shares && cost ? (price - cost) * shares : null;
  const lc      = dayPct >= 0 ? '#22c55e' : '#ef4444';

  const points  = candles.map(c => c.c);
  const times   = candles.map(c => c.t);

  const renderStockChart = () => {
    if (!points.length && !loaded) return <div className="skeleton" style={{ height: H, borderRadius: 8 }} />;
    if (!points.length) return <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ ...MFONT, fontSize: 11, color: T.text3 }}>No chart data</span></div>;
    const min = Math.min(...points), max = Math.max(...points);
    const rng = max - min || max * 0.01 || 1;
    const padMin = min - rng * 0.08, padRng = (max + rng * 0.08) - (min - rng * 0.08);
    const xs = points.map((_, i) => PAD_L + (i / Math.max(points.length - 1, 1)) * CW);
    const ys = points.map(p => PAD_T + CH - ((p - padMin) / padRng) * CH);
    const lp = catmullRomPath(xs, ys);
    const ap = `${lp} L${xs[xs.length-1].toFixed(1)},${(PAD_T+CH).toFixed(1)} L${PAD_L},${(PAD_T+CH).toFixed(1)} Z`;
    const gid = `ssg${chartKey}`, gfid = `ssgf${chartKey}`;
    const yL = [padMin + padRng * 0.1, padMin + padRng * 0.5, padMin + padRng * 0.9].map(v => ({ v, y: PAD_T + CH - ((v - padMin) / padRng) * CH }));
    const fmtD = ts => { if (!ts) return ''; const d = new Date(ts * 1000); return range === '1D' ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
    const xIdxs = times.length ? [0, Math.floor(times.length / 2), times.length - 1] : [];
    return (
      <div key={chartKey} style={{ position: 'relative', height: H, userSelect: 'none' }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ filter: `drop-shadow(0 0 3px ${lc}66)` }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lc} stopOpacity="0.22" /><stop offset="100%" stopColor={lc} stopOpacity="0" />
            </linearGradient>
            <filter id={gfid} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {yL.map(({ v, y }, i) => (
            <g key={i}>
              <line x1={PAD_L} y1={y.toFixed(1)} x2={W - PAD_R} y2={y.toFixed(1)} stroke={T.border} strokeWidth="0.5" strokeDasharray="3 4" />
              <text x={PAD_L - 4} y={(y + 4).toFixed(1)} textAnchor="end" fontSize="9" fill={T.text3} fontFamily="var(--font-mono)">${v >= 1000 ? (v/1000).toFixed(1)+'k' : v.toFixed(2)}</text>
            </g>
          ))}
          {xIdxs.map((idx, i) => times[idx] && <text key={i} x={xs[idx].toFixed(1)} y={(H-6).toFixed(1)} textAnchor={i===0?'start':i===2?'end':'middle'} fontSize="9" fill={T.text3} fontFamily="var(--font-mono)">{fmtD(times[idx])}</text>)}
          <path d={ap} fill={`url(#${gid})`} />
          <path d={lp} fill="none" stroke={lc} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" filter={`url(#${gfid})`} />
        </svg>
      </div>
    );
  };

  const isMob = typeof window !== 'undefined' && window.innerWidth < 1024;
  const sheetStyle = isMob ? {
    position:'fixed',bottom:0,left:0,right:0,zIndex:10000,
    background: dark?'rgba(24,24,27,0.98)':'rgba(250,250,250,0.98)',
    borderRadius:'16px 16px 0 0',backdropFilter:'blur(24px)',
    maxHeight:'85vh',overflowY:'auto',boxShadow:'0 -8px 40px rgba(0,0,0,0.4)',
    border:`1px solid ${T.border}`,
  } : {
    position:'fixed',top:0,right:0,bottom:0,width:440,zIndex:10000,
    background: dark?'rgba(24,24,27,0.98)':'rgba(250,250,250,0.98)',
    backdropFilter:'blur(24px)',overflowY:'auto',
    boxShadow:'-8px 0 40px rgba(0,0,0,0.3)',border:`1px solid ${T.border}`,
  };

  return createPortal(
    <AnimatePresence>
      {visible && (<>
        <motion.div key="sd-bd" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={handleClose}
          style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9999}} />
        <motion.div key="sd-sheet"
          initial={isMob?{y:'100%'}:{x:'100%'}} animate={isMob?{y:0}:{x:0}} exit={isMob?{y:'100%'}:{x:'100%'}}
          transition={{type:'spring',damping:25,stiffness:300}}
          drag={isMob?'y':false} dragConstraints={{top:0}} dragElastic={0.1}
          onDragEnd={(_,i)=>{if(i.offset.y>100)handleClose();}}
          style={sheetStyle}>
          {isMob && <div style={{display:'flex',justifyContent:'center',padding:'12px 0 4px'}}><div style={{width:40,height:4,borderRadius:2,background:'rgba(255,255,255,0.2)'}}/></div>}
          <div style={{padding:`16px 20px calc(28px + env(safe-area-inset-bottom,0px))`}}>
            {/* Header */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <TickerLogo ticker={ticker} dark={dark} size={40} />
                <div>
                  <div style={{...MFONT,fontSize:18,fontWeight:700,color:T.text}}>{ticker}</div>
                  {price > 0 && (
                    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:2}}>
                      <span style={{fontSize:15,fontWeight:600,color:T.text}}>${price.toFixed(2)}</span>
                      <span style={{...MFONT,fontSize:12,color:lc}}>{fmtPct(dayPct)}</span>
                    </div>
                  )}
                </div>
              </div>
              <button onClick={handleClose} style={{background:'none',border:'none',cursor:'pointer',color:T.text3,padding:4,display:'flex'}}><X size={18}/></button>
            </div>
            {/* Chart with animated transition */}
            <AnimatePresence mode="wait">
              <motion.div key={`${range}-${chartKey}`} initial={{opacity:0,scale:0.98}} animate={{opacity:1,scale:1}} exit={{opacity:0}} transition={{duration:0.22}}>
                {renderStockChart()}
              </motion.div>
            </AnimatePresence>
            {/* Range pills */}
            <div style={{display:'flex',alignItems:'center',marginTop:8,marginBottom:20,gap:2}}>
              {RANGES.map(r=>(
                <motion.button key={r} onClick={()=>setRange(r)} whileTap={{scale:0.92}} style={{
                  fontFamily:'var(--font-display)',fontSize:12,fontWeight:range===r?600:400,
                  padding:'5px 11px',borderRadius:20,border:'none',cursor:'pointer',
                  background:range===r?T.accent:'transparent',color:range===r?'#fff':T.text3,transition:'all 0.18s ease',
                }}>{r}</motion.button>
              ))}
            </div>
            {/* Stats */}
            {shares > 0 && (
              <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'10px 16px',marginBottom:16}}>
                {[
                  ['Shares',`${shares}`],
                  ['Avg Cost',cost>0?`$${cost.toFixed(2)}`:'—'],
                  ['Total Return',totRet!==null?fmtPct(totRet):'—',totRet],
                  ['Total P&L',totPnL!==null?`${totPnL>=0?'+':''}$${Math.abs(totPnL).toFixed(2)}`:'—',totPnL],
                ].map(([label,v,num])=>(
                  <div key={label} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 12px'}}>
                    <div style={{...MFONT,fontSize:10,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>{label}</div>
                    <div style={{fontSize:15,fontWeight:600,color:num!=null?(num>=0?'#22c55e':'#ef4444'):T.text}}>{v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </>)}
    </AnimatePresence>,
    document.body
  );
}

export default function PortfolioTab({ account, acct, posMap, acctHoldings, positions, setPos, addTicker, removeTicker, flagApiDown, marketState, onDayChange, dark, saveStatus, authReady, onTabChange }) {
  const T = theme(dark);
  const prefersReduced = useReducedMotion();
  const [quotes,        setQuotes]        = useState({});
  const [candles,       setCandles]       = useState([]);
  const [candlesLoaded, setCandlesLoaded] = useState(false);
  const [range,         setRange]         = useState('1M');
  const [expanded,      setExpanded]      = useState(null);
  const [chartKey,      setChartKey]      = useState(0);
  const [scrubIdx,          setScrubIdx]          = useState(null);
  const [scrubVal,          setScrubVal]          = useState(null);
  const [scrubTs,           setScrubTs]           = useState(null);
  const [zoomLevel,         setZoomLevel]         = useState(1);
  const [panOffset,         setPanOffset]         = useState(0);
  const [stockDetailTicker, setStockDetailTicker] = useState(null);
  const [addMode,           setAddMode]           = useState(false);
  const [newTicker,     setNewTicker]     = useState('');
  const [newShares,     setNewShares]     = useState('');
  const [newCost,       setNewCost]       = useState('');
  const [editTicker,    setEditTicker]    = useState(null);
  const [editShares,    setEditShares]    = useState('');
  const [editCost,      setEditCost]      = useState('');
  const [dcaOpen,       setDcaOpen]       = useState(false);
  const [newsItems,     setNewsItems]     = useState(null); // null = not fetched yet
  const [newsLoading,   setNewsLoading]   = useState(false);
  const [isRefreshing,  setIsRefreshing]  = useState(false);
  const [macroPulse,    setMacroPulse]    = useState(null); // null = not fetched
  const [macroOpen,     setMacroOpen]     = useState(false);
  const timerRef        = useRef(null);
  const candleCacheRef  = useRef({}); // keyed by range; cleared when holdings change
  const scrubRafRef     = useRef(null);
  const lastScrubIdxRef = useRef(null);
  const pinchRef        = useRef({});

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
    if (newsLoading) return;
    setNewsLoading(true);
    setIsRefreshing(true);
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

      // Push notifications for negative news mentioning holdings
      const notified = JSON.parse(localStorage.getItem('council_notified_news') || '[]');
      for (const article of enriched) {
        if (article.sentiment === 'negative' && article.mentionedTickers.length > 0) {
          const hashKey = btoa(article.headline).slice(0, 20);
          if (!notified.includes(hashKey)) {
            pushNotify(
              `⚠️ ${article.mentionedTickers.join(', ')} Alert`,
              article.aiSummary || article.headline
            );
            notified.push(hashKey);
            if (notified.length > 100) notified.splice(0, notified.length - 100);
          }
        }
      }
      localStorage.setItem('council_notified_news', JSON.stringify(notified));
    } catch {
      setNewsItems([]);
    } finally {
      setNewsLoading(false);
      setIsRefreshing(false);
    }
  }, [newsLoading]);

  const getBySize = useCallback(() => [...withShares].sort((a, b) => {
    const qa = quotes[a] || {}, qb = quotes[b] || {};
    const va = (parseFloat(posMap[a]?.shares) || 0) * (qa.price || 0);
    const vb = (parseFloat(posMap[b]?.shares) || 0) * (qb.price || 0);
    return vb - va;
  }), [withShares, quotes, posMap]);

  useEffect(() => {
    if (!authReady || !withShares.length) return;
    const bySize = getBySize();
    fetchNews(bySize);
    const interval = setInterval(() => fetchNews(getBySize()), 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [account, authReady]);

  // Clear candle cache whenever the set of held tickers changes
  useEffect(() => { candleCacheRef.current = {}; }, [withShares.join(',')]);

  const fetchCandles = useCallback(async () => {
    if (!withShares.length) { setCandlesLoaded(true); return; }
    // Serve from cache on range switches; skip network call if data already loaded
    if (candleCacheRef.current[range]) {
      setCandles(candleCacheRef.current[range]);
      setChartKey(k => k + 1);
      setCandlesLoaded(true);
      return;
    }
    setCandlesLoaded(false);
    try {
      const data = await getCandles(withShares, range);
      // Use the ticker with the most data points to drive the timeline — prevents
      // a newer/illiquid ticker (e.g. NBIS with 2 days) from truncating the whole curve.
      const primary = withShares.reduce(
        (best, t) => (data[t]?.length || 0) > (data[best]?.length || 0) ? t : best,
        withShares[0]
      );
      const base = data[primary];
      if (!base?.length) { setCandles([]); setCandlesLoaded(true); return; }
      const curve = base.map((pt, idx) => {
        let val = 0;
        withShares.forEach(t => {
          const sh  = parseFloat(posMap[t]?.shares) || 0;
          const tData = data[t];
          // For tickers shorter than primary, clamp to their last known candle
          const price = tData?.length
            ? (tData[Math.min(idx, tData.length - 1)]?.c || 0)
            : (quotes[t]?.price || 0);
          val += sh * price;
        });
        return { t: pt.t, c: val };
      });
      candleCacheRef.current[range] = curve;
      setCandles(curve);
      setChartKey(k => k + 1);
    } catch { setCandles([]); } finally { setCandlesLoaded(true); }
  }, [withShares.join(','), range]);

  useEffect(() => { fetchCandles(); }, [fetchCandles]);

  // Reset scrub + zoom when switching ranges
  useEffect(() => {
    setScrubIdx(null); setScrubVal(null); setScrubTs(null);
    setZoomLevel(1); setPanOffset(0);
    lastScrubIdxRef.current = null;
    if (scrubRafRef.current) { cancelAnimationFrame(scrubRafRef.current); scrubRafRef.current = null; }
  }, [range]);

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

  useEffect(() => { onDayChange?.(dayChange); }, [dayChange]);

  const chartPoints     = candles.map(c => c.c);
  const rangeStartValue = candles.length > 1 ? candles[0].c : prevValue;
  const displayValue    = scrubVal !== null ? scrubVal : totalValue;
  // For header: compare display point to the start of the selected range
  const headerBase      = candles.length > 1 ? rangeStartValue : prevValue;
  const headerChange    = displayValue - headerBase;
  const headerChangePct = headerBase > 0 ? (headerChange / headerBase) * 100 : 0;
  const lineColor       = headerChange > 0 ? T.green : headerChange < 0 ? T.red : T.text3;

  // SVG chart constants
  const W = 400, H = 160, PAD_L = 52, PAD_B = 28, PAD_T = 12, PAD_R = 8;
  const CW = W - PAD_L - PAD_R, CH = H - PAD_T - PAD_B;

  const renderChart = () => {
    if (!withShares.length) return (
      <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: T.text3 }}>Add positions with share counts to see your equity curve</span>
      </div>
    );
    if (!chartPoints.length && !candlesLoaded) return <div className="skeleton" style={{ height: H, borderRadius: 8 }} />;

    let effectivePoints = chartPoints.length ? chartPoints : (prevValue > 0 ? [prevValue, totalValue || prevValue] : []);
    let effectiveTimes  = candles.length ? candles.map(c => c.t) : null;
    const isSynthetic   = !chartPoints.length;

    // Append live portfolio value when quotes are fresher than last candle
    if (!isSynthetic && totalValue > 0 && effectiveTimes?.length) {
      const nowSecs = Math.floor(Date.now() / 1000);
      if (nowSecs - effectiveTimes[effectiveTimes.length - 1] > 300) {
        effectivePoints = [...effectivePoints, totalValue];
        effectiveTimes  = [...effectiveTimes, nowSecs];
      }
    }

    if (!effectivePoints.length) return (
      <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: T.text3 }}>No chart data</span>
      </div>
    );

    // Apply zoom + pan to slice visible window
    const allLen       = effectivePoints.length;
    const visibleCount = zoomLevel > 1 ? Math.max(5, Math.round(allLen / zoomLevel)) : allLen;
    const maxStartIdx  = Math.max(0, allLen - visibleCount);
    const startIdx     = zoomLevel > 1 ? Math.round(panOffset * maxStartIdx) : 0;
    const displayPoints = zoomLevel > 1 ? effectivePoints.slice(startIdx, startIdx + visibleCount) : effectivePoints;
    const displayTimes  = (zoomLevel > 1 && effectiveTimes) ? effectiveTimes.slice(startIdx, startIdx + visibleCount) : effectiveTimes;

    // Extended-hours segment detection for 1D (EDT = UTC-4; regular = 13:30–20:00 UTC)
    const sessionOf = ts => {
      const h = new Date(ts * 1000).getUTCHours() + new Date(ts * 1000).getUTCMinutes() / 60;
      if (h >= 13.5 && h < 20) return 'reg';
      return 'ext';
    };
    const hasExtHours = range === '1D' && !isSynthetic && !!displayTimes?.length;
    let regularStart = 0, regularEnd = displayPoints.length - 1;
    if (hasExtHours) {
      const fr = displayTimes.findIndex(ts => sessionOf(ts) === 'reg');
      const lr = displayTimes.map((ts, i) => ({ ts, i })).filter(({ ts }) => sessionOf(ts) === 'reg').pop()?.i;
      if (fr !== -1) regularStart = fr;
      if (lr != null) regularEnd  = lr;
    }

    // Scrub-reactive ambient session from scrubTs (stable cross-render)
    const scrubSession = (() => {
      if (range !== '1D' || !scrubTs) return null;
      return sessionOf(scrubTs) === 'reg' ? 'open' : 'ext';
    })();

    const min = Math.min(...displayPoints), max = Math.max(...displayPoints);
    const rng = max - min || max * 0.01 || 1;
    const padMin = min - rng * 0.08, padMax = max + rng * 0.08;
    const padRng = padMax - padMin;

    const xs = displayPoints.map((_, i) => PAD_L + (i / Math.max(displayPoints.length - 1, 1)) * CW);
    const ys = displayPoints.map(p => PAD_T + CH - ((p - padMin) / padRng) * CH);

    const linePath = catmullRomPath(xs, ys);
    const areaPath = `${linePath} L${xs[xs.length-1].toFixed(1)},${(PAD_T+CH).toFixed(1)} L${PAD_L},${(PAD_T+CH).toFixed(1)} Z`;
    const gradId   = `cg${chartKey}`;
    const scrubX   = scrubIdx !== null ? xs[scrubIdx] : null;
    const scrubY   = scrubIdx !== null ? ys[scrubIdx] : null;

    const yLabels = [padMin + padRng * 0.1, padMin + padRng * 0.5, padMin + padRng * 0.9].map(v => ({
      v, y: PAD_T + CH - ((v - padMin) / padRng) * CH,
    }));

    const fmtDate = ts => {
      if (!ts || isNaN(ts)) return '';
      const d = new Date(ts * 1000);
      if (isNaN(d.getTime())) return '';
      return range === '1D'
        ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    const xLabelIdxs = displayTimes ? [0, Math.floor(displayTimes.length / 2), displayTimes.length - 1] : [];

    // ── Scrub handler: RAF-throttled + haptic per new data point ──
    const handleScrubMove = e => {
      if (e.touches?.length === 2) return; // let pinch handler take over
      const touch = e.touches?.[0];
      const cx    = touch ? touch.clientX : e.clientX;
      const rect  = e.currentTarget.getBoundingClientRect();
      if (scrubRafRef.current) return;
      scrubRafRef.current = requestAnimationFrame(() => {
        scrubRafRef.current = null;
        const relX  = cx - rect.left - (rect.width * PAD_L / W);
        const plotW = rect.width * CW / W;
        const len   = displayPoints.length;
        const idx   = Math.max(0, Math.min(len - 1, Math.round((relX / plotW) * (len - 1))));
        if (idx !== lastScrubIdxRef.current) {
          if (lastScrubIdxRef.current !== null) navigator.vibrate?.(1);
          lastScrubIdxRef.current = idx;
          setScrubIdx(idx);
          setScrubVal(displayPoints[idx] ?? null);
          setScrubTs(displayTimes?.[idx] ?? null);
        }
      });
    };

    // ── Pinch-to-zoom touch handlers ──
    const handleTouchStart = e => {
      if (e.touches.length === 2) {
        const d = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        );
        pinchRef.current = { ...pinchRef.current, pinching: true, startDist: d, startZoom: zoomLevel, startPan: panOffset };
        // Cancel any in-flight scrub RAF
        if (scrubRafRef.current) { cancelAnimationFrame(scrubRafRef.current); scrubRafRef.current = null; }
        setScrubIdx(null); setScrubVal(null); setScrubTs(null);
        lastScrubIdxRef.current = null;
      } else if (e.touches.length === 1) {
        if (zoomLevel > 1) {
          pinchRef.current = { ...pinchRef.current, panning: true, panStartX: e.touches[0].clientX, panStartOffset: panOffset };
        }
        // Double-tap to reset zoom (300 ms window)
        const now = Date.now();
        if (now - (pinchRef.current.lastTap || 0) < 300) {
          setZoomLevel(1); setPanOffset(0);
          setScrubIdx(null); setScrubVal(null); setScrubTs(null);
          lastScrubIdxRef.current = null;
        }
        pinchRef.current.lastTap = now;
      }
    };

    const handleTouchMoveAll = e => {
      if (e.touches.length === 2 && pinchRef.current.pinching) {
        const d = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        );
        setZoomLevel(Math.max(1, Math.min(8, pinchRef.current.startZoom * d / pinchRef.current.startDist)));
        return;
      }
      if (e.touches.length === 1 && zoomLevel > 1 && pinchRef.current.panning) {
        const rect    = e.currentTarget.getBoundingClientRect();
        const plotW   = rect.width * CW / W;
        const dx      = e.touches[0].clientX - pinchRef.current.panStartX;
        const dFrac   = (-dx / plotW) * (visibleCount / Math.max(1, maxStartIdx));
        setPanOffset(Math.max(0, Math.min(1, pinchRef.current.panStartOffset + dFrac)));
        return;
      }
      if (e.touches.length === 1) handleScrubMove(e);
    };

    const handleTouchEnd = () => {
      pinchRef.current.pinching = false;
      pinchRef.current.panning  = false;
      setScrubIdx(null); setScrubVal(null); setScrubTs(null);
      lastScrubIdxRef.current = null;
    };

    // Ambient session hue — scrub overrides real-time session on 1D
    const ambientSession = (() => {
      if (scrubSession === 'ext') return 'ext1D';
      if (scrubSession === 'open') return 'open';
      return marketState;
    })();
    const SESS_HUE = { open: '#22c55e', premarket: '#60a5fa', afterhours: '#f59e0b', ext1D: '#60a5fa', default: '#7c3aed' };
    const ambientColor = SESS_HUE[ambientSession] || SESS_HUE.default;
    const isMarketOpen = ambientSession === 'open';
    const glowId = `gf${chartKey}`;

    return (
      <div style={{ position: 'relative', height: H, userSelect: 'none', touchAction: 'none' }}
        onMouseMove={handleScrubMove}
        onMouseLeave={() => { setScrubIdx(null); setScrubVal(null); setScrubTs(null); lastScrubIdxRef.current = null; }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMoveAll}
        onTouchEnd={handleTouchEnd}
      >
        {/* Ambient session glow */}
        <motion.div
          key={ambientSession}
          initial={{ opacity: 0 }}
          animate={isMarketOpen ? { opacity: [0.2, 0.32, 0.2] } : { opacity: 0.18 }}
          transition={isMarketOpen ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut' } : { duration: 2 }}
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 8,
            background: `radial-gradient(ellipse 90% 65% at 50% 75%, ${ambientColor}60 0%, transparent 72%)`,
          }}
        />

        {/* Zoom indicator */}
        {zoomLevel > 1.05 && (
          <div style={{ position: 'absolute', top: 4, right: PAD_R + 2, fontFamily: 'var(--font-mono)', fontSize: 9, color: ambientColor, opacity: 0.7, pointerEvents: 'none' }}>
            {zoomLevel.toFixed(1)}×
          </div>
        )}

        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}
          style={{ filter: `drop-shadow(0 0 ${isMarketOpen ? 6 : 3}px ${ambientColor}77)` }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={lineColor} stopOpacity="0.22" />
              <stop offset="60%"  stopColor={ambientColor} stopOpacity="0.06" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
            <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {yLabels.map(({ v, y }, i) => (
            <g key={i}>
              <line x1={PAD_L} y1={y.toFixed(1)} x2={W - PAD_R} y2={y.toFixed(1)} stroke={T.border} strokeWidth="0.5" strokeDasharray="3 4" />
              <text x={PAD_L - 4} y={(y + 4).toFixed(1)} textAnchor="end" fontSize="9" fill={T.text3} fontFamily="var(--font-mono)">
                ${v >= 1000 ? (v/1000).toFixed(1)+'k' : v.toFixed(0)}
              </text>
            </g>
          ))}
          {xLabelIdxs.map((idx, i) => displayTimes?.[idx] && (
            <text key={i} x={xs[idx].toFixed(1)} y={(H - 6).toFixed(1)} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontSize="9" fill={T.text3} fontFamily="var(--font-mono)">
              {fmtDate(displayTimes[idx])}
            </text>
          ))}
          <path d={areaPath} fill={`url(#${gradId})`} />
          {hasExtHours ? (
            <g filter={`url(#${glowId})`}>
              {regularStart > 0 && (
                <path d={catmullRomPath(xs.slice(0, regularStart + 1), ys.slice(0, regularStart + 1))}
                  fill="none" stroke={lineColor} strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="5 3" strokeLinecap="round" />
              )}
              <path d={catmullRomPath(xs.slice(regularStart, regularEnd + 1), ys.slice(regularStart, regularEnd + 1))}
                fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {regularEnd < displayPoints.length - 1 && (
                <path d={catmullRomPath(xs.slice(regularEnd), ys.slice(regularEnd))}
                  fill="none" stroke={lineColor} strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="5 3" strokeLinecap="round" />
              )}
              {regularStart > 0 && xs[regularStart] != null && (
                <line x1={xs[regularStart].toFixed(1)} y1={PAD_T} x2={xs[regularStart].toFixed(1)} y2={PAD_T + CH}
                  stroke={T.text3} strokeWidth="0.6" strokeDasharray="3 3" strokeOpacity="0.35" />
              )}
              {regularEnd < displayPoints.length - 1 && xs[regularEnd] != null && (
                <line x1={xs[regularEnd].toFixed(1)} y1={PAD_T} x2={xs[regularEnd].toFixed(1)} y2={PAD_T + CH}
                  stroke={T.text3} strokeWidth="0.6" strokeDasharray="3 3" strokeOpacity="0.35" />
              )}
            </g>
          ) : (
            <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              filter={`url(#${glowId})`} />
          )}
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
              key={headerChange > 0 ? 'up' : headerChange < 0 ? 'down' : 'flat'}
              initial={prefersReduced ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span style={{ fontSize: 15, fontWeight: 600, color: lineColor, fontFamily: 'var(--font-display)' }}>
                {headerChange >= 0 ? '+' : ''}{headerChange.toFixed(2)} ({fmtPct(headerChangePct)})
              </span>
              <span style={{ fontSize: 13, color: T.text3 }}>
                {(() => {
                  const ts = scrubTs;
                  if (!ts || isNaN(ts)) return range === '1D' ? 'Today' : range;
                  const d = new Date(ts * 1000);
                  if (isNaN(d.getTime())) return range === '1D' ? 'Today' : range;
                  return range === '1D'
                    ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                })()}
              </span>
            </motion.div>
            {buyingPower > 0 && <div style={{ fontSize: 13, color: T.text2, marginTop: 4 }}>${buyingPower.toLocaleString()} cash</div>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, paddingTop: 6 }}>
            {(() => {
              const sc = marketState === 'open' ? T.green : marketState === 'premarket' ? '#60A5FA' : marketState === 'afterhours' ? '#F59E0B' : T.red;
              const sl = marketState === 'open' ? 'MARKET OPEN' : marketState === 'premarket' ? 'PRE-MARKET' : marketState === 'afterhours' ? 'AFTER-HOURS' : 'CLOSED';
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div className={marketState === 'open' ? 'live-dot' : ''} style={{ width: 7, height: 7, borderRadius: '50%', background: sc }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: sc, letterSpacing: '0.08em', fontWeight: 600 }}>{sl}</span>
                </div>
              );
            })()}
            {saveStatus !== 'idle' && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: saveStatus === 'error' ? T.red : saveStatus === 'saved' ? T.green : T.text3 }}>
                {saveStatus === 'saving' ? 'SAVING…' : saveStatus === 'saved' ? 'SAVED ✓' : 'FAILED'}
              </span>
            )}
          </div>
        </div>

        {/* Chart — fade/scale transition on range change */}
        <div style={{ marginTop: 20 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={`chart-${range}-${chartKey}`}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {renderChart()}
            </motion.div>
          </AnimatePresence>
        </div>

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
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => { candleCacheRef.current = {}; fetchQuotes(); fetchCandles(); }}
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
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  {onTabChange && (
                                    <motion.button whileTap={{ scale: 0.96 }} onClick={e => { e.stopPropagation(); onTabChange('council'); }}
                                      style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 500, padding: '7px 14px', background: T.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                                      Run Council
                                    </motion.button>
                                  )}
                                  <motion.button whileTap={{ scale: 0.96 }} onClick={e => { e.stopPropagation(); setStockDetailTicker(t); }}
                                    style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: T.text2, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>
                                    <TrendingUp size={12} /> Chart
                                  </motion.button>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Newspaper size={14} style={{ color: T.text3 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Market News</span>
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => { const bySize = getBySize(); fetchNews(bySize); }}
                disabled={newsLoading}
                style={{ background: 'none', border: 'none', cursor: newsLoading ? 'not-allowed' : 'pointer', color: T.text3, display: 'flex', alignItems: 'center', padding: 4, opacity: newsLoading ? 0.5 : 1 }}
              >
                <motion.div animate={{ rotate: isRefreshing ? 360 : 0 }} transition={{ duration: 0.6, ease: 'linear', repeat: isRefreshing ? Infinity : 0 }}>
                  <RefreshCw size={13} />
                </motion.div>
              </motion.button>
            </div>

            {newsLoading && !newsItems ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                <CouncilLoader size="sm" />
              </div>
            ) : newsItems && newsItems.length === 0 ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Newspaper size={16} style={{ color: T.text3 }} />
                <span style={{ fontSize: 13, color: T.text3 }}>No recent news for your holdings</span>
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

      {/* Individual stock chart sheet */}
      {stockDetailTicker && (
        <StockDetailSheet
          ticker={stockDetailTicker}
          posMap={posMap}
          quotes={quotes}
          dark={dark}
          onClose={() => setStockDetailTicker(null)}
        />
      )}
    </div>
  );
}
