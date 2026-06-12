import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Edit2, Check, X, RefreshCw, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react';
import { getQuotes, getCandles } from '../api.js';
import { theme } from '../utils/theme.js';

const FONT  = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };
const MFONT = { fontFamily: "ui-monospace, 'SF Mono', 'Fira Code', monospace" };
const GRN = '#00C805';
const RED = '#FF3B30';

const LOGO_DOMAINS = {
  NVDA:'nvidia.com',  MU:'micron.com',    AMD:'amd.com',       AAPL:'apple.com',
  TSLA:'tesla.com',   MSFT:'microsoft.com',GOOG:'google.com',   AMZN:'amazon.com',
  META:'meta.com',    PLTR:'palantir.com', CRDO:'credotech.com',ALAB:'asteralabs.com',
  NBIS:'nebius.com',  APLD:'applieddigital.com',SNDK:'sandisk.com',FLY:'fireflyspace.com',
  OKLO:'oklo.com',    LPTH:'lpth.com',     COIN:'coinbase.com', MSTR:'microstrategy.com',
  SOFI:'sofi.com',    NFLX:'netflix.com',  INTC:'intel.com',    AVGO:'broadcom.com',
};

const RANGES = ['1D','1W','1M','3M','1Y','ALL'];

function TickerLogo({ ticker, dark }) {
  const [err, setErr] = useState(false);
  const T = theme(dark);
  const domain = LOGO_DOMAINS[ticker];
  if (!domain || err) {
    return (
      <div style={{ width:36, height:36, borderRadius:'50%', background:'#1A1A1A', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:12, fontWeight:600, flexShrink:0, ...MFONT }}>
        {ticker.slice(0,2)}
      </div>
    );
  }
  return <img src={`https://logo.clearbit.com/${domain}`} onError={() => setErr(true)} style={{ width:36, height:36, borderRadius:'50%', objectFit:'contain', flexShrink:0, background: T.bgCard }} alt={ticker} />;
}

function fmtPct(n) { return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`; }

export default function PortfolioTab({ account, acct, posMap, acctHoldings, positions, setPos, addTicker, removeTicker, flagApiDown, marketState, onDayChange, dark }) {
  const T = theme(dark);
  const [quotes,     setQuotes]     = useState({});
  const [candles,    setCandles]    = useState([]);
  const [range,      setRange]      = useState('1D');
  const [expanded,   setExpanded]   = useState(null);
  const [chartKey,   setChartKey]   = useState(0);
  const [scrubIdx,   setScrubIdx]   = useState(null);
  const [addMode,    setAddMode]    = useState(false);
  const [newTicker,  setNewTicker]  = useState('');
  const [newShares,  setNewShares]  = useState('');
  const [newCost,    setNewCost]    = useState('');
  const [editTicker, setEditTicker] = useState(null);
  const [editShares, setEditShares] = useState('');
  const [editCost,   setEditCost]   = useState('');
  const timerRef = useRef(null);

  const tickers = acctHoldings.filter(t => posMap[t]);
  const withShares = tickers.filter(t => parseFloat(posMap[t]?.shares) > 0);

  const fetchQuotes = useCallback(async () => {
    if (!tickers.length) return;
    try { setQuotes(await getQuotes(tickers)); } catch { flagApiDown?.(); }
  }, [tickers.join(',')]);

  useEffect(() => {
    fetchQuotes();
    timerRef.current = setInterval(fetchQuotes, 60000);
    return () => clearInterval(timerRef.current);
  }, [fetchQuotes]);

  const fetchCandles = useCallback(async () => {
    if (!withShares.length) return;
    try {
      const data = await getCandles(withShares, range);
      const primary = withShares[0];
      const base = data[primary];
      if (!base?.length) return;
      const minLen = Math.min(...withShares.map(t => data[t]?.length || 0).filter(l => l > 0));
      const curve = base.slice(0, minLen).map((pt, idx) => {
        let val = 0;
        withShares.forEach(t => {
          val += (parseFloat(posMap[t]?.shares) || 0) * (data[t]?.[idx]?.c || quotes[t]?.price || 0);
        });
        return { t: pt.t, c: val };
      });
      setCandles(curve);
      setChartKey(k => k + 1);
    } catch {}
  }, [withShares.join(','), range]);

  useEffect(() => { fetchCandles(); }, [fetchCandles]);

  // Portfolio value
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
  const lineColor    = dayChange > 0 ? GRN : dayChange < 0 ? RED : '#AAAAAA';

  useEffect(() => { onDayChange?.(dayChange); }, [dayChange]);

  const chartPoints  = candles.map(c => c.c);
  const displayValue = (scrubIdx !== null && chartPoints[scrubIdx]) ? chartPoints[scrubIdx] : totalValue;

  // SVG chart
  const W = 400, H = 180;
  const renderChart = () => {
    if (!withShares.length) {
      return <div style={{ height: 60, margin: '16px 0', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span style={{ ...MFONT, fontSize:11, color:'#CCCCCC' }}>Add positions with share counts to see your equity curve</span>
      </div>;
    }
    if (!chartPoints.length) {
      return <div className="skeleton" style={{ height: 60, borderRadius: 8, margin: '16px 0' }} />;
    }
    const min = Math.min(...chartPoints), max = Math.max(...chartPoints);
    const rng = max - min || 1;
    const xs  = chartPoints.map((_, i) => (i / (chartPoints.length - 1)) * W);
    const ys  = chartPoints.map(p => H - ((p - min) / rng) * (H - 20) - 10);
    const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${W},${H} L0,${H} Z`;
    const gradId   = `cg${chartKey}`;
    const scrubX   = scrubIdx !== null ? xs[scrubIdx]  : null;
    const scrubY   = scrubIdx !== null ? ys[scrubIdx]  : null;

    const handleMove = e => {
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const idx = Math.round(((cx - rect.left) / rect.width) * (chartPoints.length - 1));
      setScrubIdx(Math.max(0, Math.min(chartPoints.length - 1, idx)));
    };

    return (
      <div key={chartKey} className="draw-in" style={{ position:'relative', height: H, userSelect:'none' }}
        onMouseMove={handleMove} onTouchMove={handleMove}
        onMouseLeave={() => setScrubIdx(null)} onTouchEnd={() => setScrubIdx(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={lineColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0"    />
            </linearGradient>
          </defs>
          <path d={areaPath}  fill={`url(#${gradId})`} />
          <path d={linePath}  fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {scrubX !== null && (
            <>
              <line x1={scrubX} y1="0" x2={scrubX} y2={H} stroke="#CCCCCC" strokeWidth="1" strokeDasharray="4 3" />
              <circle cx={scrubX} cy={scrubY} r="4" fill={lineColor} />
            </>
          )}
        </svg>
      </div>
    );
  };

  // Today's movers
  const movers = withShares.map(t => {
    const q   = quotes[t] || {};
    const pct = q.prevClose ? ((q.price - q.prevClose) / q.prevClose) * 100 : 0;
    return { t, pct, price: q.price || 0 };
  }).filter(m => Math.abs(m.pct) > 0.01).sort((a,b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 4);

  return (
    <div style={{ ...FONT, background: T.bg, minHeight:'100vh' }}>
      {/* Hero */}
      <div style={{ padding:'20px 16px 0', maxWidth:760, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:36, fontWeight:700, color: T.text, lineHeight:1.1, letterSpacing:'-0.02em' }}>
              ${displayValue.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}
            </div>
            <div style={{ marginTop:4, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:15, fontWeight:500, color: dayChange >= 0 ? GRN : RED }}>
                {dayChange >= 0 ? '+' : ''}{dayChange.toFixed(2)} ({fmtPct(dayChangePct)})
              </span>
              <span style={{ fontSize:13, color: T.text3 }}>Today</span>
            </div>
            {buyingPower > 0 && (
              <div style={{ fontSize:13, color: T.text2, marginTop:4 }}>
                ${buyingPower.toLocaleString()} buying power
              </div>
            )}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, paddingTop:4 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background: marketState==='open' ? GRN : '#CCCCCC', boxShadow: marketState==='open' ? `0 0 6px ${GRN}` : 'none' }} />
            <span style={{ ...MFONT, fontSize:11, color: T.text3 }}>
              {marketState === 'open' ? 'LIVE' : marketState === 'premarket' ? 'PRE-MARKET' : marketState === 'afterhours' ? 'AFTER HOURS' : 'MARKET CLOSED'}
            </span>
          </div>
        </div>

        {/* Chart */}
        <div style={{ marginTop:16 }}>{renderChart()}</div>

        {/* Range selector */}
        <div style={{ display:'flex', alignItems:'center', marginTop:4, marginBottom:16 }}>
          {RANGES.map(r => (
            <button key={r} onClick={() => setRange(r)} style={{
              ...FONT, fontSize:13, fontWeight:500, padding:'6px 10px',
              border:'none', borderBottom: range===r ? `2px solid ${T.text}` : '2px solid transparent',
              background:'none', cursor:'pointer', color: range===r ? T.text : T.text3,
            }}>{r}</button>
          ))}
          <button onClick={() => { fetchQuotes(); fetchCandles(); }}
            style={{ marginLeft:'auto', border:'none', background:'none', cursor:'pointer', color: T.text3, padding:6 }}>
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Breakdown */}
        <div style={{ border: `1px solid ${T.border}`, borderRadius:12, padding:'0 16px', marginBottom:16 }}>
          {[
            ['Equity',       `$${totalValue.toFixed(2)}`],
            ['Cash',         `$${buyingPower.toLocaleString()}`],
            ['Total',        `$${(totalValue+buyingPower).toFixed(2)}`],
          ].map(([label, val], i, arr) => (
            <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'13px 0', borderBottom: i<arr.length-1 ? `1px solid ${T.border}` : 'none' }}>
              <span style={{ fontSize:14, color: T.text2 }}>{label}</span>
              <span style={{ fontSize:16, fontWeight:500, color: T.text }}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Movers */}
      {movers.length > 0 && (
        <div style={{ padding:'0 16px 16px', maxWidth:760, margin:'0 auto' }}>
          <div style={{ ...MFONT, fontSize:13, fontWeight:600, color: T.text3, textTransform:’uppercase’, letterSpacing:’0.08em’, marginBottom:8 }}>TODAY’S MOVERS</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
            {movers.map(({ t, pct, price }) => (
              <div key={t} style={{ border: `1px solid ${T.border}`, borderRadius:10, padding:'10px 12px', display:'flex', alignItems:'center', gap:10 }}>
                <TickerLogo ticker={t} dark={dark} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, color: T.text }}>{t}</div>
                  <div style={{ fontSize:12, color: pct>=0 ? GRN : RED, display:'flex', alignItems:'center', gap:3 }}>
                    {pct>=0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {fmtPct(pct)}
                  </div>
                </div>
                <div style={{ fontSize:14, fontWeight:500 }}>${price.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Positions */}
      <div style={{ maxWidth:760, margin:'0 auto', paddingBottom:24 }}>
        <div style={{ padding:'0 16px 8px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ ...MFONT, fontSize:13, fontWeight:600, color: T.text3, textTransform:'uppercase', letterSpacing:'0.08em' }}>POSITIONS</div>
          <button onClick={() => setAddMode(!addMode)}
            style={{ ...FONT, fontSize:13, fontWeight:500, color: T.text, border: `1px solid ${T.border}`, borderRadius:8, padding:'5px 10px', background: T.bg, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
            <Plus size={14} /> Add
          </button>
        </div>

        {addMode && (
          <div style={{ padding:'12px 16px', borderBottom: `1px solid ${T.border}`, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', background: T.bgCard, marginBottom:0 }}>
            <input value={newTicker} onChange={e => setNewTicker(e.target.value.toUpperCase())} placeholder="TICKER"
              style={{ width:80, padding:'8px 10px', border: `1px solid ${T.border}`, borderRadius:8, fontSize:13, textTransform:'uppercase', background: T.input, color: T.text, outline:'none', ...MFONT }} />
            <input value={newShares} onChange={e => setNewShares(e.target.value)} placeholder="Shares"
              style={{ width:90, padding:'8px 10px', border: `1px solid ${T.border}`, borderRadius:8, fontSize:13, background: T.input, color: T.text, outline:'none' }} />
            <input value={newCost} onChange={e => setNewCost(e.target.value)} placeholder="Avg cost"
              style={{ width:100, padding:'8px 10px', border: `1px solid ${T.border}`, borderRadius:8, fontSize:13, background: T.input, color: T.text, outline:'none' }} />
            <button onClick={() => { if (!newTicker) return; addTicker(newTicker); if (newShares) setPos(newTicker,'shares',newShares); if (newCost) setPos(newTicker,'cost',newCost); setNewTicker(''); setNewShares(''); setNewCost(''); setAddMode(false); }}
              style={{ padding:'8px 14px', background: T.text, color: T.bg, border:'none', borderRadius:8, cursor:'pointer', fontSize:13 }}>Add</button>
            <button onClick={() => setAddMode(false)}
              style={{ padding:'8px 12px', border: `1px solid ${T.border}`, background: T.input, color: T.text, borderRadius:8, cursor:'pointer', fontSize:13 }}>Cancel</button>
          </div>
        )}

        <div style={{ border: `1px solid ${T.border}`, borderRadius:12, overflow:'hidden', margin:'0 16px' }}>
          {tickers.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color: T.text3, fontSize:14 }}>No positions yet. Add a ticker above.</div>
          ) : tickers.map((t, idx) => {
            const q       = quotes[t] || {};
            const pos     = posMap[t]  || {};
            const shares  = parseFloat(pos.shares) || 0;
            const cost    = parseFloat(pos.cost)   || 0;
            const price   = q.price    || 0;
            const prev    = q.prevClose|| price;
            const val     = shares * price;
            const dayPct  = prev ? ((price - prev) / prev) * 100 : 0;
            const totRet  = cost && shares ? ((price - cost) / cost) * 100 : null;
            const totPnL  = shares && cost ? (price - cost) * shares : null;
            const isExp   = expanded === t;
            const isEdit  = editTicker === t;

            return (
              <div key={t} style={{ animation:`cardIn 0.4s ease both`, animationDelay:`${idx*40}ms` }}>
                {/* Row */}
                <div className="holding-row" onClick={() => setExpanded(isExp ? null : t)}
                  style={{ display:'flex', alignItems:'center', gap:12, minHeight:64, padding:'0 16px', borderBottom:`1px solid ${T.border}`, cursor:'pointer', background: T.bg }}>
                  <TickerLogo ticker={t} dark={dark} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:15, fontWeight:600, color: T.text }}>{t}</div>
                    {shares > 0 && <div style={{ ...MFONT, fontSize:12, color: T.text2 }}>{shares} sh</div>}
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    {price > 0 ? (
                      <>
                        <div style={{ fontSize:15, fontWeight:500, color: T.text }}>${price.toFixed(2)}</div>
                        <div style={{ ...MFONT, fontSize:12, color: dayPct>=0 ? GRN : RED }}>{fmtPct(dayPct)}</div>
                      </>
                    ) : <div className="skeleton" style={{ width:60, height:32, borderRadius:6 }} />}
                  </div>
                  <div style={{ color:'#CCCCCC', flexShrink:0 }}>{isExp ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</div>
                </div>

                {/* Expanded */}
                {isExp && (
                  <div className="card-in" style={{ background: T.bgCard, borderBottom:`1px solid ${T.border}`, padding:'12px 16px 16px' }}>
                    {isEdit ? (
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                        <input value={editShares} onChange={e => setEditShares(e.target.value)} placeholder="Shares"
                          style={{ width:100, padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:8, fontSize:13, background: T.input, color: T.text, outline:'none' }} />
                        <input value={editCost} onChange={e => setEditCost(e.target.value)} placeholder="Avg cost"
                          style={{ width:100, padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:8, fontSize:13, background: T.input, color: T.text, outline:'none' }} />
                        <button onClick={() => { setPos(t,'shares',editShares); setPos(t,'cost',editCost); setEditTicker(null); }}
                          style={{ padding:'8px 12px', background: T.text, color: T.bg, border:'none', borderRadius:8, cursor:'pointer' }}><Check size={14}/></button>
                        <button onClick={() => setEditTicker(null)}
                          style={{ padding:'8px 12px', border:`1px solid ${T.border}`, background: T.input, color: T.text, borderRadius:8, cursor:'pointer' }}><X size={14}/></button>
                        <button onClick={() => { removeTicker(t); setExpanded(null); setEditTicker(null); }}
                          style={{ padding:'8px 12px', border:`1px solid ${T.border}`, background: T.input, borderRadius:8, cursor:'pointer', color:RED }}><Trash2 size={14}/></button>
                      </div>
                    ) : (
                      <>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'8px 16px', marginBottom:12 }}>
                          {[
                            ['Shares',       shares > 0 ? `${shares}` : '—'],
                            ['Avg Cost',     cost > 0 ? `$${cost.toFixed(2)}` : '—'],
                            ['Market Value', val > 0 ? `$${val.toFixed(2)}` : '—'],
                            ['Total Return', totRet !== null ? fmtPct(totRet) : '—'],
                            ['Total P&L',    totPnL !== null ? `${totPnL>=0?'+':''}$${Math.abs(totPnL).toFixed(2)}` : '—'],
                            ['Break-even',   cost > 0 ? `$${cost.toFixed(2)}` : '—'],
                          ].map(([label, v]) => (
                            <div key={label}>
                              <div style={{ ...MFONT, fontSize:11, color: T.text3, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:2 }}>{label}</div>
                              <div style={{ fontSize:14, fontWeight:500, color: label==='Total Return' && totRet!==null ? (totRet>=0?GRN:RED) : T.text }}>{v}</div>
                            </div>
                          ))}
                        </div>
                        <button onClick={e => { e.stopPropagation(); setEditTicker(t); setEditShares(pos.shares||''); setEditCost(pos.cost||''); }}
                          style={{ ...FONT, fontSize:12, color: T.text2, display:'flex', alignItems:'center', gap:4, background:'none', border:`1px solid ${T.border}`, borderRadius:8, padding:'6px 10px', cursor:'pointer' }}>
                          <Edit2 size={12}/> Edit position
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
