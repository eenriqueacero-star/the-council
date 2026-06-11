import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Briefcase, ChevronDown, ChevronUp, Plus, X, RefreshCw, Loader2, TrendingUp } from 'lucide-react';
import { MONO, DISP, GRN, RED, GOLD } from '../constants/styles.js';
import { getQuotes, getCandles } from '../api.js';

const RANGES = ['1D','1W','1M','3M','1Y','ALL'];

const NAMES = {
  NVDA:'NVIDIA',AMD:'Advanced Micro',MU:'Micron',AAPL:'Apple',TSLA:'Tesla',
  MSFT:'Microsoft',GOOG:'Alphabet',AMZN:'Amazon',META:'Meta',PLTR:'Palantir',
  CRDO:'Credo Technology',ALAB:'Astera Labs',NBIS:'Nebius Group',APLD:'Applied Digital',
  SNDK:'SanDisk',OKLO:'Oklo Inc',AVGO:'Broadcom',SMCI:'Super Micro',
  SOXX:'Semiconductor ETF',QQQ:'Nasdaq 100 ETF',SPY:'S&P 500 ETF',
  COIN:'Coinbase',MSTR:'MicroStrategy',SOFI:'SoFi',NFLX:'Netflix',INTC:'Intel',
};

const PALETTE = ['#00C805','#38e0d4','#f5c451','#b083ff','#ff9500','#4ecdc4','#ff5d6c','#c8922a','#5a96e8','#2fcb8a'];
const tcolor = t => PALETTE[t.charCodeAt(0) % PALETTE.length];

function fmtVal(n) { return n == null ? '—' : '$' + n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtPnl(n) { return (n>=0?'+$':'-$') + Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtPct(n) { return (n>=0?'+':'')+n.toFixed(2)+'%'; }
function fmt2(n) { return n==null?'—':n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }

function EquityChart({ candles, tickers, posMap, quotes }) {
  const pathRef = useRef(null);
  const [hover, setHover] = useState(null);

  const series = useMemo(() => {
    if (!candles || !tickers.length) return [];
    const first = tickers.find(t => candles[t]?.length > 1);
    if (!first) return [];
    return candles[first].map((pt, i) => {
      const v = tickers.reduce((s, t) => {
        const sh = parseFloat(posMap[t]?.shares) || 0;
        const price = candles[t]?.[i]?.c ?? quotes[t]?.price ?? 0;
        return s + sh * price;
      }, 0);
      return { t: pt.t, v };
    }).filter(p => p.v > 0);
  }, [candles, tickers, posMap, quotes]);

  useEffect(() => {
    if (!pathRef.current || !series.length) return;
    const len = pathRef.current.getTotalLength();
    pathRef.current.style.strokeDasharray = String(len);
    pathRef.current.style.strokeDashoffset = String(len);
    pathRef.current.getBoundingClientRect();
    pathRef.current.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(.4,0,.2,1)';
    pathRef.current.style.strokeDashoffset = '0';
  }, [series]);

  if (!series.length) return (
    <div style={{ height: 130, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <span style={{ ...MONO, fontSize:11, color:'rgba(255,255,255,0.18)' }}>NO DATA · ENTER POSITIONS BELOW</span>
    </div>
  );

  const W = 600, H = 130;
  const vals = series.map(p => p.v);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.12 || hi * 0.05 || 1;
  const vlo = lo - pad, vhi = hi + pad;
  const px = i => (i / (series.length - 1)) * W;
  const py = v => H - ((v - vlo) / (vhi - vlo)) * H;
  const d = series.map((p, i) => `${i===0?'M':'L'}${px(i).toFixed(1)},${py(p.v).toFixed(1)}`).join(' ');
  const area = `M${px(0).toFixed(1)},${H} ${series.map((p,i)=>`L${px(i).toFixed(1)},${py(p.v).toFixed(1)}`).join(' ')} L${px(series.length-1).toFixed(1)},${H} Z`;
  const isUp = series[series.length-1].v >= series[0].v;
  const lineClr = isUp ? GRN : RED;
  const glowClr = isUp ? 'rgba(0,200,5,0.5)' : 'rgba(255,68,68,0.5)';

  const onMove = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const idx = Math.round(relX * (series.length - 1));
    const p = series[idx];
    setHover({ relX: px(idx)/W*100, cy: py(p.v)/H*100, v: p.v });
  };

  return (
    <div style={{ position:'relative', userSelect:'none' }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:H, overflow:'visible', display:'block' }} onMouseMove={onMove}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineClr} stopOpacity="0.18"/>
            <stop offset="100%" stopColor={lineClr} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <path d={area} fill="url(#areaGrad)"/>
        <path ref={pathRef} d={d} fill="none" stroke={lineClr} strokeWidth="2"
          style={{ filter:`drop-shadow(0 0 5px ${glowClr})` }}/>
        {hover && (
          <>
            <line x1={hover.relX*W/100} y1={0} x2={hover.relX*W/100} y2={H} stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="3,3"/>
            <circle cx={hover.relX*W/100} cy={hover.cy*H/100} r={5} fill={lineClr} stroke="#070a0c" strokeWidth="2"
              style={{ filter:`drop-shadow(0 0 8px ${lineClr})` }}/>
          </>
        )}
      </svg>
      {hover && (
        <div style={{ position:'absolute', top:-28, left:`${hover.relX}%`, transform:'translateX(-50%)',
          background:'rgba(7,10,12,0.92)', border:'1px solid rgba(255,255,255,0.14)',
          borderRadius:6, padding:'3px 9px', pointerEvents:'none',
          ...MONO, fontSize:12, color:lineClr, whiteSpace:'nowrap',
          boxShadow:`0 0 10px ${glowClr}` }}>
          {fmtVal(hover.v)}
        </div>
      )}
    </div>
  );
}

export default function PositionsTab({ acct, posMap, acctHoldings, setPos, addTicker, removeTicker, positionsLine, onSave }) {
  const [range, setRange]       = useState('1D');
  const [quotes, setQuotes]     = useState({});
  const [candles, setCandles]   = useState({});
  const [qLoading, setQLoading] = useState(false);
  const [cLoading, setCLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [hovRow, setHovRow]     = useState(null);

  const active = useMemo(() => acctHoldings.filter(t => parseFloat(posMap[t]?.shares) > 0), [acctHoldings, posMap]);

  const fetchQ = useCallback(async () => {
    if (!active.length) return;
    setQLoading(true);
    try { setQuotes(await getQuotes(active)); } catch {}
    setQLoading(false);
  }, [active.join(',')]);

  const fetchC = useCallback(async () => {
    if (!active.length) return;
    setCLoading(true);
    try { setCandles(await getCandles(active, range)); } catch { setCandles({}); }
    setCLoading(false);
  }, [active.join(','), range]);

  useEffect(() => { setQuotes({}); setCandles({}); fetchQ(); fetchC(); }, [acct.label]);
  useEffect(() => { setCandles({}); fetchC(); }, [range]);

  async function handleSave() {
    setSaving(true); setSaved(false);
    try { await onSave(); } catch {}
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const rows = acctHoldings.map(t => {
    const p = posMap[t] || {};
    const sh = parseFloat(p.shares) || 0;
    const cost = parseFloat(p.cost) || 0;
    const q = quotes[t];
    const price = q?.price > 0 ? q.price : (q?.prevClose || 0);
    const mktVal = sh * price;
    const pnlAmt = (price && cost) ? mktVal - sh*cost : null;
    const pnlPct = (price && cost) ? (price - cost)/cost*100 : null;
    const dayChg = q?.changePct != null ? sh*price*q.changePct/100 : null;
    const dayPct = q?.changePct ?? null;
    return { t, sh, cost, price, mktVal, pnlAmt, pnlPct, dayChg, dayPct };
  });

  const valued   = rows.filter(r => r.sh > 0 && r.price > 0);
  const totalVal = valued.reduce((s,r) => s+r.mktVal, 0);
  const totalBas = valued.reduce((s,r) => s+r.sh*r.cost, 0);
  const totalPnl = totalVal - totalBas;
  const totalPct = totalBas > 0 ? totalPnl/totalBas*100 : null;
  const dayTotal = valued.reduce((s,r) => s+(r.dayChg||0), 0);
  const dayPctPf = totalVal > 0 ? dayTotal/totalVal*100 : null;

  return (
    <div className="mt-6 space-y-3">
      <div className="rounded-2xl overflow-hidden"
        style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.08)', boxShadow:'0 0 40px rgba(0,0,0,0.4)' }}>
        <div className="px-5 pt-5 pb-2">
          <div className="value-reveal" style={{ fontFamily:"'Chakra Petch',sans-serif", fontSize:40, fontWeight:700, lineHeight:1, letterSpacing:'-0.01em', color:'#ffffff' }}>
            {totalVal > 0 ? fmtVal(totalVal) : <span style={{ fontSize:22, color:'rgba(255,255,255,0.25)' }}>NO POSITIONS</span>}
          </div>

          {dayPctPf != null && totalVal > 0 && (
            <div className="pnl-flash flex items-center gap-3 mt-2 flex-wrap">
              <span style={{ ...MONO, fontSize:14, color: dayTotal>=0 ? GRN : RED,
                textShadow: dayTotal>=0 ? '0 0 14px rgba(0,200,5,0.6)' : '0 0 14px rgba(255,68,68,0.6)' }}>
                {fmtPnl(dayTotal)} ({fmtPct(dayPctPf)}) today
              </span>
              {totalPct != null && (
                <span style={{ ...MONO, fontSize:12, color: totalPnl>=0 ? 'rgba(0,200,5,0.6)' : 'rgba(255,68,68,0.6)' }}>
                  {fmtPnl(totalPnl)} ({fmtPct(totalPct)}) total
                </span>
              )}
              <button onClick={fetchQ} disabled={qLoading} style={{ marginLeft:'auto', color:'rgba(255,255,255,0.25)' }}
                className="p-1 hover:text-white/50 transition-colors">
                <RefreshCw size={12} className={qLoading?'animate-spin':''} />
              </button>
            </div>
          )}

          <div className="flex gap-1.5 mt-4">
            {RANGES.map(r => (
              <button key={r} onClick={() => setRange(r)}
                style={{ ...MONO, fontSize:11, fontWeight:600, cursor:'pointer', border:'none',
                  background: range===r ? GRN : 'rgba(255,255,255,0.05)',
                  color: range===r ? '#000' : 'rgba(255,255,255,0.38)',
                  borderRadius:7, padding:'5px 11px',
                  boxShadow: range===r ? '0 0 14px rgba(0,200,5,0.55), 0 0 28px rgba(0,200,5,0.2)' : 'none',
                  transition:'all .2s ease', transform: range===r ? 'scale(1.05)' : 'scale(1)' }}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="px-2 pb-3 pt-2">
          {cLoading ? (
            <div style={{ height:130, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              <Loader2 size={14} className="animate-spin" style={{ color: GRN }} />
              <span style={{ ...MONO, fontSize:11, color:'rgba(255,255,255,0.25)' }}>loading chart…</span>
            </div>
          ) : (
            <EquityChart candles={candles} tickers={active} posMap={posMap} quotes={quotes} />
          )}
        </div>
      </div>

      <div>
        {active.length > 0 && (
          <div className="flex items-center justify-between mb-2 px-1">
            <span style={{ ...MONO, fontSize:10, color:'rgba(255,255,255,0.35)', letterSpacing:'0.12em' }}>STOCKS</span>
            {totalVal > 0 && <span style={{ ...MONO, fontSize:12, color:'rgba(255,255,255,0.5)' }}>{fmtVal(totalVal)}</span>}
          </div>
        )}

        <div className="space-y-1.5">
          {rows.filter(r => r.sh > 0).map((r, idx) => {
            const col = tcolor(r.t);
            return (
              <div key={r.t} className="holding-row rounded-xl px-4 py-3.5 flex items-center gap-3"
                style={{ background: hovRow===r.t ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.025)',
                  border: `1px solid ${hovRow===r.t ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.07)'}`,
                  transition:'all .15s ease', animation:`fadeUp .3s ease ${idx*.04}s both`,
                  boxShadow: hovRow===r.t ? `0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px ${col}15` : 'none' }}
                onMouseEnter={() => setHovRow(r.t)} onMouseLeave={() => setHovRow(null)}>
                <div style={{ width:42, height:42, borderRadius:21, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                  background:`${col}1a`, border:`1.5px solid ${col}44`,
                  fontFamily:"'Chakra Petch',sans-serif", fontSize:13, fontWeight:700, color:col,
                  boxShadow: hovRow===r.t ? `0 0 14px ${col}40` : `0 0 6px ${col}20`, transition:'box-shadow .15s ease' }}>
                  {r.t.slice(0,2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontFamily:"'Chakra Petch',sans-serif", fontSize:14, fontWeight:600, color:'#fff', letterSpacing:'.05em' }}>{r.t}</div>
                  <div style={{ ...MONO, fontSize:10, color:'rgba(255,255,255,0.35)', marginTop:1 }}>
                    {r.sh}sh{r.cost ? ` · $${fmt2(r.cost)} avg` : ''}{r.price > 0 ? ` · $${fmt2(r.price)}/sh` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div style={{ ...MONO, fontSize:14, fontWeight:600, color:'#fff' }}>{r.mktVal > 0 ? fmtVal(r.mktVal) : '—'}</div>
                  {r.pnlAmt != null && (
                    <div style={{ ...MONO, fontSize:11, marginTop:2, color: r.pnlAmt>=0 ? GRN : RED,
                      textShadow: r.pnlAmt>=0 ? '0 0 8px rgba(0,200,5,0.4)' : '0 0 8px rgba(255,68,68,0.4)' }}>
                      {fmtPnl(r.pnlAmt)} ({fmtPct(r.pnlPct)})
                    </div>
                  )}
                  {r.dayPct != null && (
                    <div style={{ ...MONO, fontSize:10, color: r.dayPct>=0 ? 'rgba(0,200,5,0.6)' : 'rgba(255,68,68,0.6)' }}>
                      {r.dayPct>=0?'+':''}{r.dayPct.toFixed(2)}% today
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {active.length === 0 && (
            <div className="py-10 text-center rounded-xl" style={{ border:'1px dashed rgba(255,255,255,0.08)' }}>
              <TrendingUp size={24} className="mx-auto mb-2" style={{ color:'rgba(0,200,5,0.25)' }} />
              <p style={{ ...MONO, fontSize:12, color:'rgba(255,255,255,0.25)' }}>Add positions below to see your portfolio</p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border:'1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={() => setEditOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 transition-colors"
          style={{ background: editOpen ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.015)' }}>
          <div className="flex items-center gap-2">
            <Briefcase size={13} style={{ color: GOLD }} />
            <span style={{ ...DISP, fontSize:12, letterSpacing:'.06em', color:'rgba(255,255,255,0.55)' }}>EDIT POSITIONS</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={e => { e.stopPropagation(); handleSave(); }} disabled={saving}
              style={{ ...MONO, fontSize:10, borderRadius:6, padding:'3px 10px', cursor:'pointer', border:'1px solid',
                background: saved ? 'rgba(0,200,5,0.12)' : 'rgba(255,255,255,0.05)',
                borderColor: saved ? GRN : 'rgba(255,255,255,0.12)',
                color: saved ? GRN : 'rgba(255,255,255,0.45)',
                boxShadow: saved ? '0 0 10px rgba(0,200,5,0.3)' : 'none' }}>
              {saved ? '✓ SAVED' : saving ? 'SAVING…' : 'SAVE'}
            </button>
            {editOpen ? <ChevronUp size={13} style={{ color:'rgba(255,255,255,0.35)' }} /> : <ChevronDown size={13} style={{ color:'rgba(255,255,255,0.35)' }} />}
          </div>
        </button>

        {editOpen && (
          <div className="p-4 space-y-2" style={{ borderTop:'1px solid rgba(255,255,255,0.06)' }}>
            {acctHoldings.map(t => {
              const p = posMap[t] || {};
              return (
                <div key={t} className="flex items-center gap-2">
                  <span style={{ ...DISP, fontSize:12, fontWeight:600, width:60, flexShrink:0, letterSpacing:'.08em', color: tcolor(t) }}>{t}</span>
                  <input value={p.shares||''} onChange={e => setPos(t,'shares',e.target.value.replace(/[^0-9.]/g,''))}
                    inputMode="decimal" placeholder="shares" style={{ ...MONO, fontSize:13 }}
                    className="flex-1 min-w-0 bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 outline-none focus:border-[#00C805]/60 transition-colors text-white"/>
                  <div className="relative flex-1 min-w-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm select-none" style={MONO}>$</span>
                    <input value={p.cost||''} onChange={e => setPos(t,'cost',e.target.value.replace(/[^0-9.]/g,''))}
                      inputMode="decimal" placeholder="avg cost" style={{ ...MONO, fontSize:13 }}
                      className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg pl-6 pr-2 py-2 outline-none focus:border-[#00C805]/60 transition-colors text-white"/>
                  </div>
                  <button onClick={() => removeTicker(t)}
                    className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-white/25 hover:text-[#FF4444] hover:bg-[#FF4444]/10 transition-colors">
                    <X size={14}/>
                  </button>
                </div>
              );
            })}
            <div className="flex gap-2 pt-1">
              <div className="relative flex-1">
                <Plus size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"/>
                <input value={newTicker} onChange={e => setNewTicker(e.target.value.toUpperCase())}
                  onKeyDown={e => { if(e.key==='Enter'){const t=newTicker.trim().toUpperCase();if(t){addTicker(t);setNewTicker('');}} }}
                  placeholder="add ticker" style={{ ...MONO, letterSpacing:'.1em', fontSize:13 }}
                  className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg pl-9 pr-3 py-2 uppercase outline-none focus:border-[#00C805]/60 transition-colors text-white"/>
              </div>
              <button onClick={() => { const t=newTicker.trim().toUpperCase(); if(t){addTicker(t);setNewTicker('');} }}
                disabled={!newTicker.trim()}
                style={{ ...DISP, background: newTicker.trim() ? GRN : 'rgba(0,200,5,0.2)', color:'#000',
                  boxShadow: newTicker.trim() ? '0 0 14px rgba(0,200,5,0.5)' : 'none' }}
                className="px-4 py-2 rounded-lg font-semibold text-sm transition-all hover:brightness-110 disabled:cursor-not-allowed">
                ADD
              </button>
            </div>
            <p style={{ ...MONO, fontSize:10, color:'rgba(255,255,255,0.22)', paddingTop:4 }}>
              Council sees: <span style={{ color:'rgba(255,255,255,0.5)' }}>{positionsLine||'no positions'}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
