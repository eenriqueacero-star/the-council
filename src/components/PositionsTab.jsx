import React, { useState, useEffect } from 'react';
import { Briefcase, Check, X, Plus, Save, CloudUpload, RefreshCw, Loader2, ChevronDown, ChevronUp, ArrowUp, ArrowDown } from 'lucide-react';
import { MONO, DISP, SANS } from '../constants/styles.js';
import { getQuotes, getCandles } from '../api.js';

const GRN  = '#00C805';
const RED  = '#FF3B30';
const TEAL = '#0070F3';
const PALETTE = [TEAL, GRN, '#F59E0B', '#8B5CF6', '#FF6B35', '#38A8E0', '#E0A838', '#5D8CFF', '#D438E0', '#8DE038'];
const RANGES  = ['1H', '1D', '1W', '1M', '1Y', 'All'];

function fmt(n)    { return isNaN(n)||n==null?'—':Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtPct(n) { if(isNaN(n)||n==null)return '—'; return (n>=0?'+':'')+n.toFixed(2)+'%'; }
function fmtPnl(n) { if(isNaN(n)||n==null)return '—'; return (n>=0?'+$':'-$')+fmt(n); }
function fmtTime(d){ return d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}); }
function fmtX(ts,range){
  const d=new Date(ts);
  if(range==='1H'||range==='1D') return d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false});
  if(range==='1W'||range==='1M') return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  return d.toLocaleDateString('en-US',{month:'short',year:'2-digit'});
}

function computeEquityCurve(candles, posMap) {
  const spy = candles?.SPY;
  if (!spy?.t?.length) return { portfolio: [], spy: [] };
  const held = Object.entries(posMap).filter(([,p]) => parseFloat(p.shares) > 0);
  if (!held.length) return { portfolio: [], spy: [] };
  const lookups = {};
  for (const [tk] of held) {
    const d = candles[tk];
    if (d?.t?.length && d?.c?.length) {
      const m = {}; d.t.forEach((ts,i)=>{ m[ts]=d.c[i]; }); lookups[tk] = { m, ts: d.t };
    }
  }
  const portPts=[], spyPts=[];
  for (let i=0; i<spy.t.length; i++) {
    const ts=spy.t[i]; let pv=0;
    for (const [tk,pd] of held) {
      const shares=parseFloat(pd.shares)||0; if(!shares) continue;
      const lk=lookups[tk]; if(!lk) continue;
      let close=lk.m[ts];
      if(close===undefined){ const prev=lk.ts.filter(t=>t<=ts); if(prev.length) close=lk.m[prev[prev.length-1]]; }
      if(close!=null) pv+=shares*close;
    }
    portPts.push({t:ts*1000,v:pv}); spyPts.push({t:ts*1000,v:spy.c[i]});
  }
  if(!portPts.length) return { portfolio:[], spy:[] };
  const p0=portPts[0].v||1, s0=spyPts[0].v||1;
  return {
    portfolio: portPts.map(d=>({t:d.t,v:p0>0?((d.v-p0)/p0)*100:0})),
    spy:       spyPts.map(d=>({t:d.t,v:s0>0?((d.v-s0)/s0)*100:0})),
  };
}

function EquityCurveChart({ portfolio, spy, range }) {
  if (!portfolio?.length || portfolio.length < 2) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:130, fontSize:11, color:'#AAAAAA' }}>No historical data for this range</div>
  );
  const W=560,H=130,PL=38,PR=10,PT=10,PB=26,cW=W-PL-PR,cH=H-PT-PB;
  const allV=[...portfolio.map(d=>d.v),...spy.map(d=>d.v)];
  const minV=Math.min(...allV),maxV=Math.max(...allV),vR=maxV-minV||1;
  const toX=i=>PL+(i/(portfolio.length-1))*cW;
  const toY=v=>PT+cH-((v-minV)/vR)*cH;
  const portLine=portfolio.map((d,i)=>`${toX(i).toFixed(1)},${toY(d.v).toFixed(1)}`).join(' ');
  const spyLine=spy.length>1?spy.map((d,i)=>{ const x=PL+(i/(spy.length-1))*cW; return `${x.toFixed(1)},${toY(d.v).toFixed(1)}`; }).join(' '):null;
  const lastV=portfolio[portfolio.length-1].v;
  const portColor=lastV>=0?GRN:RED;
  const showZero=0>=minV&&0<=maxV;
  const lblIdx=portfolio.length>4?[0,Math.floor(portfolio.length/3),Math.floor(2*portfolio.length/3),portfolio.length-1]:[0,portfolio.length-1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', overflow:'visible' }}>
      {[minV,(minV+maxV)/2,maxV].map((v,i)=>(
        <line key={i} x1={PL} y1={toY(v)} x2={W-PR} y2={toY(v)} stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
      ))}
      {showZero && <line x1={PL} y1={toY(0)} x2={W-PR} y2={toY(0)} stroke="rgba(0,0,0,0.12)" strokeWidth="1" strokeDasharray="3,4" />}
      {spyLine && <polyline points={spyLine} fill="none" stroke="#CCCCCC" strokeWidth="1.5" strokeDasharray="4,3" />}
      <polyline points={portLine} fill="none" stroke={portColor} strokeWidth="2" strokeLinejoin="round" />
      {lblIdx.map(i=>portfolio[i]&&(
        <text key={i} x={toX(i)} y={H-4} textAnchor="middle" fill="#AAAAAA" style={{ fontSize:'9px', fontFamily:'inherit' }}>{fmtX(portfolio[i].t,range)}</text>
      ))}
      {[minV,maxV].map((v,i)=>(
        <text key={i} x={PL-4} y={toY(v)+3} textAnchor="end" fill="#AAAAAA" style={{ fontSize:'9px', fontFamily:'inherit' }}>{v>=0?'+':''}{v.toFixed(1)}%</text>
      ))}
      <line x1={PL+2} y1={PT+7} x2={PL+14} y2={PT+7} stroke={portColor} strokeWidth="2" />
      <text x={PL+18} y={PT+10} fill="#757575" style={{ fontSize:'9px', fontFamily:'inherit' }}>PORTFOLIO</text>
      <line x1={PL+86} y1={PT+7} x2={PL+98} y2={PT+7} stroke="#CCCCCC" strokeWidth="1.5" strokeDasharray="4,3" />
      <text x={PL+102} y={PT+10} fill="#757575" style={{ fontSize:'9px', fontFamily:'inherit' }}>SPY</text>
    </svg>
  );
}

function DonutChart({ rows, totalValue, highlighted, onSliceClick }) {
  const valued=rows.filter(r=>r.mktVal>0);
  if(!valued.length||totalValue<=0) return null;
  const CX=70,CY=70,R=58,RI=34,SZ=140;
  let cum=-90;
  const slices=valued.map((r,i)=>{
    const pct=r.mktVal/totalValue; const start=cum; cum+=pct*360;
    return { ticker:r.ticker, pct, start, end:cum, color:PALETTE[i%PALETTE.length] };
  });
  function xy(angle,r){ const rad=angle*Math.PI/180; return { x:CX+r*Math.cos(rad), y:CY+r*Math.sin(rad) }; }
  function arc(s,e,ro,ri){
    if(e-s>=359.9) return `M ${CX} ${CY-ro} A ${ro} ${ro} 0 1 1 ${CX-0.01} ${CY-ro} Z M ${CX} ${CY-ri} A ${ri} ${ri} 0 1 0 ${CX-0.01} ${CY-ri} Z`;
    const large=(e-s)>180?1:0,p1=xy(s,ro),p2=xy(e,ro),p3=xy(e,ri),p4=xy(s,ri);
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${ro} ${ro} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} A ${ri} ${ri} 0 ${large} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)} Z`;
  }
  const hlRow=highlighted?rows.find(r=>r.ticker===highlighted):null;
  return (
    <svg viewBox={`0 0 ${SZ} ${SZ}`} style={{ width:'100%', maxWidth:140, display:'block', margin:'0 auto', cursor:'pointer' }}>
      {slices.map(s=>{
        const isHL=highlighted===s.ticker;
        return <path key={s.ticker} d={arc(s.start,s.end,isHL?R+7:R,RI)} fill={s.color} opacity={highlighted&&!isHL?0.3:1} style={{transition:'opacity 0.2s'}} onClick={()=>onSliceClick(s.ticker===highlighted?null:s.ticker)} />;
      })}
      {hlRow?(
        <>
          <text x={CX} y={CY-4} textAnchor="middle" fill="#000000" style={{ fontSize:'10px', fontFamily:'inherit', fontWeight:700 }}>{hlRow.ticker}</text>
          <text x={CX} y={CY+10} textAnchor="middle" fill="#757575" style={{ fontSize:'9px', fontFamily:'inherit' }}>{(hlRow.mktVal/totalValue*100).toFixed(1)}%</text>
        </>
      ):(
        <text x={CX} y={CY+4} textAnchor="middle" fill="#CCCCCC" style={{ fontSize:'8px', fontFamily:'inherit' }}>ALLOC</text>
      )}
    </svg>
  );
}

function ColHdr({ id, label, cls, sortCol, sortDir, onSort }) {
  const active=id===sortCol;
  return (
    <th onClick={()=>onSort(id)} className={cls} style={{ ...MONO, color:active?'#000000':'#AAAAAA', fontSize:9, letterSpacing:'0.06em', fontWeight:600, padding:'8px 8px', cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}>
      <span style={{ display:'flex', alignItems:'center', gap:3 }}>
        {label}
        {active?(sortDir==='asc'?<ArrowUp size={8} style={{color:'#000000'}}/>:<ArrowDown size={8} style={{color:'#000000'}}/> ):<ArrowUp size={8} style={{color:'#CCCCCC'}}/>}
      </span>
    </th>
  );
}

export default function PositionsTab({ acct, posMap, acctHoldings, setPos, addTicker, removeTicker, positionsLine, onSave }) {
  const [range,        setRange]        = useState('1D');
  const [quotes,       setQuotes]       = useState({});
  const [candles,      setCandles]      = useState({});
  const [qLoading,     setQL]           = useState(false);
  const [cLoading,     setCL]           = useState(false);
  const [lastUpdated,  setLastUpdated]  = useState(null);
  const [flash,        setFlash]        = useState(false);
  const [sortCol,      setSortCol]      = useState('value');
  const [sortDir,      setSortDir]      = useState('desc');
  const [highlighted,  setHighlighted]  = useState(null);
  const [editOpen,     setEditOpen]     = useState(false);
  const [newTicker,    setNewTicker]    = useState('');
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);

  const heldTickers = acctHoldings.filter(t => parseFloat(posMap[t]?.shares) > 0);
  const heldKey     = heldTickers.join(',');

  async function doRefresh(tickers, r) {
    if (!tickers.length) return;
    setQL(true); setCL(true);
    try {
      const [q,c] = await Promise.all([getQuotes(tickers), getCandles(tickers, r)]);
      setQuotes(q); setCandles(c); setLastUpdated(new Date());
      setFlash(true); setTimeout(()=>setFlash(false), 1200);
    } catch {}
    setQL(false); setCL(false);
  }

  useEffect(() => {
    setQuotes({}); setCandles({});
    const tickers = acctHoldings.filter(t => parseFloat(posMap[t]?.shares) > 0);
    doRefresh(tickers, range);
  }, [acct.label, range, heldKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tickers = acctHoldings.filter(t => parseFloat(posMap[t]?.shares) > 0);
    if (!tickers.length) return;
    const id = setInterval(()=>doRefresh(tickers, range), 60000);
    return ()=>clearInterval(id);
  }, [acct.label, range, heldKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = acctHoldings.map((t,i) => {
    const p=posMap[t]||{}, shares=parseFloat(p.shares)||0, cost=parseFloat(p.cost)||0;
    const q=quotes[t]||{}, price=q.price>0?q.price:(q.prevClose||0), dayPct=q.changePct??null;
    const mktVal=shares*price, basis=shares*cost;
    const pnlAmt=(price&&cost)?mktVal-basis:null, pnlPct=(price&&cost)?((price-cost)/cost)*100:null;
    return { ticker:t, shares, cost, price, mktVal, basis, pnlAmt, pnlPct, dayPct, color:PALETTE[i%PALETTE.length] };
  });

  const valued      = rows.filter(r=>r.mktVal>0);
  const totalVal    = valued.reduce((s,r)=>s+r.mktVal,0);
  const totalBasis  = valued.reduce((s,r)=>s+r.basis,0);
  const totalPnl    = totalVal-totalBasis;
  const totalPnlPct = totalBasis>0?(totalPnl/totalBasis)*100:null;
  const dayChgDollar= valued.reduce((s,r)=>{ if(r.dayPct==null||!r.price||!r.shares)return s; return s+r.shares*r.price*r.dayPct/(100+r.dayPct); },0);
  const dayChgPct   = totalVal>0?(dayChgDollar/(totalVal-dayChgDollar))*100:null;

  function handleSort(col) {
    if(col===sortCol) setSortDir(d=>d==='asc'?'desc':'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }
  const getV=(r,col)=>{ switch(col){ case 'ticker':return r.ticker; case 'shares':return r.shares; case 'cost':return r.cost; case 'price':return r.price; case 'value':return r.mktVal; case 'pnl$':return r.pnlAmt??-Infinity; case 'pnl%':return r.pnlPct??-Infinity; case 'day':return r.dayPct??-Infinity; default:return r.mktVal; } };
  const sorted=[...rows].sort((a,b)=>{ const va=getV(a,sortCol),vb=getV(b,sortCol); if(typeof va==='string')return sortDir==='asc'?va.localeCompare(vb):vb.localeCompare(va); return sortDir==='asc'?va-vb:vb-va; }).filter(r=>r.shares>0||r.price>0);
  const movers=[...rows].filter(r=>r.dayPct!=null&&r.shares>0&&r.price>0).sort((a,b)=>b.dayPct-a.dayPct);
  const { portfolio: ecPort, spy: ecSpy } = computeEquityCurve(candles, posMap);

  async function handleSave() {
    setSaving(true); setSaved(false);
    try { await Promise.race([onSave(), new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),10000))]); setSaved(true); setTimeout(()=>setSaved(false),2500); } catch {}
    setSaving(false);
  }

  function handleAdd() { const t=newTicker.trim().toUpperCase(); if(!t)return; addTicker(t); setNewTicker(''); }
  const isLoading=qLoading||cLoading;
  const COLS=[
    {id:'ticker',label:'TICKER',   cls:'text-left'},
    {id:'shares',label:'SHARES',   cls:'text-right hidden sm:table-cell'},
    {id:'cost',  label:'AVG COST', cls:'text-right hidden sm:table-cell'},
    {id:'price', label:'PRICE',    cls:'text-right'},
    {id:'value', label:'VALUE',    cls:'text-right'},
    {id:'pnl$',  label:'P&L $',   cls:'text-right hidden md:table-cell'},
    {id:'pnl%',  label:'P&L %',   cls:'text-right'},
    {id:'day',   label:'DAY %',   cls:'text-right'},
  ];

  const card = { background:'#F7F7F7', border:'1px solid #EEEEEE', borderRadius:12, padding:'12px 14px' };
  const inp  = (focus) => ({ background:'#FFFFFF', border:`1px solid ${focus?'#000000':'#EEEEEE'}`, borderRadius:8, color:'#000000', outline:'none', fontFamily:'inherit', fontSize:13 });

  return (
    <div style={{ marginTop:20, display:'flex', flexDirection:'column', gap:14 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Briefcase size={15} style={{ color:GRN }} />
          <span style={{ ...MONO, fontSize:11, letterSpacing:'0.08em', color:'#757575', fontWeight:600 }}>POSITIONS · {acct.label.toUpperCase()}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {lastUpdated && <span style={{ ...MONO, fontSize:10, color:flash?GRN:'#AAAAAA', transition:'color 0.5s' }}>{fmtTime(lastUpdated)}{flash&&<span style={{color:GRN}}> ●</span>}</span>}
          <button onClick={()=>doRefresh(heldTickers,range)} disabled={isLoading}
            style={{ ...MONO, background:'#F0F0F0', border:'none', borderRadius:6, padding:'5px 10px', fontSize:10, color:isLoading?'#CCCCCC':'#757575', cursor:isLoading?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:5 }}>
            {isLoading?<Loader2 size={10} className="animate-spin"/>:<RefreshCw size={10}/>} REFRESH
          </button>
        </div>
      </div>

      {/* Range pills */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {RANGES.map(r=>(
          <button key={r} onClick={()=>setRange(r)}
            style={{ ...MONO, background:range===r?'#000000':'#F0F0F0', color:range===r?'#FFFFFF':'#757575', border:'none', borderRadius:6, padding:'4px 12px', fontSize:11, cursor:'pointer' }}>
            {r}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {valued.length>0?(
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }} className="sm:grid-cols-4">
          {[
            {label:'TOTAL VALUE',    val:`$${totalVal.toLocaleString('en-US',{maximumFractionDigits:0})}`,  col:'#000000'},
            {label:'COST BASIS',     val:`$${totalBasis.toLocaleString('en-US',{maximumFractionDigits:0})}`,col:'#757575'},
            {label:'UNREALIZED P&L', val:fmtPnl(totalPnl),    sub:totalPnlPct!=null?fmtPct(totalPnlPct):null, col:totalPnl>=0?GRN:RED},
            {label:'DAY CHANGE',     val:fmtPnl(dayChgDollar), sub:dayChgPct!=null?fmtPct(dayChgPct):null,   col:dayChgDollar>=0?GRN:RED},
          ].map(({label,val,sub,col})=>(
            <div key={label} style={card}>
              <div style={{ ...MONO, fontSize:9, color:'#AAAAAA', letterSpacing:'0.08em', marginBottom:4 }}>{label}</div>
              <div style={{ ...MONO, fontSize:18, fontWeight:700, color:col, lineHeight:1 }}>{val}</div>
              {sub&&<div style={{ ...MONO, fontSize:10, color:col, marginTop:3, opacity:0.85 }}>{sub}</div>}
            </div>
          ))}
        </div>
      ):(
        heldTickers.length===0&&(
          <div style={{ ...card, textAlign:'center', padding:'20px 16px', color:'#AAAAAA', fontSize:12 }}>Open Edit Positions below to add shares and see your dashboard.</div>
        )
      )}

      {/* Movers */}
      {movers.length>0&&(
        <div>
          <div style={{ ...MONO, fontSize:9, color:'#AAAAAA', letterSpacing:'0.08em', marginBottom:6 }}>TODAY'S MOVERS</div>
          <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4, scrollbarWidth:'none' }}>
            {movers.map(r=>{
              const dayChg$=r.shares*r.price*r.dayPct/(100+r.dayPct);
              return (
                <div key={r.ticker} style={{ flexShrink:0, background:'#F7F7F7', border:`1px solid ${r.dayPct>=0?'rgba(0,200,5,0.2)':'rgba(255,59,48,0.2)'}`, borderRadius:10, padding:'10px 14px', minWidth:76 }}>
                  <div style={{ ...MONO, fontSize:12, fontWeight:600, color:'#000000' }}>{r.ticker}</div>
                  <div style={{ ...MONO, fontSize:10, fontWeight:500, color:r.dayPct>=0?GRN:RED, marginTop:2 }}>{fmtPct(r.dayPct)}</div>
                  <div style={{ ...MONO, fontSize:9, color:'#757575' }}>{fmtPnl(dayChg$)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table — only rows with shares */}
      {sorted.length>0&&(
        <div style={{ border:'1px solid #EEEEEE', borderRadius:12, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#F7F7F7', borderBottom:'1px solid #EEEEEE' }}>
                  {COLS.map(c=><ColHdr key={c.id} {...c} sortCol={sortCol} sortDir={sortDir} onSort={handleSort}/>)}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r,i)=>{
                  const isHL=highlighted===r.ticker;
                  return (
                    <tr key={r.ticker} onClick={()=>setHighlighted(p=>p===r.ticker?null:r.ticker)}
                      style={{ background:isHL?'rgba(0,112,243,0.04)':i%2?'#FAFAFA':'#FFFFFF', borderBottom:'1px solid #EEEEEE', cursor:'pointer' }}>
                      <td style={{ padding:'8px 8px', textAlign:'left' }}><span style={{ ...MONO, fontWeight:600, fontSize:13, color:isHL?TEAL:'#000000' }}>{r.ticker}</span></td>
                      <td style={{ ...MONO, padding:'8px 8px', textAlign:'right', fontSize:11, color:'#757575' }} className="hidden sm:table-cell">{r.shares||'—'}</td>
                      <td style={{ ...MONO, padding:'8px 8px', textAlign:'right', fontSize:11, color:'#757575' }} className="hidden sm:table-cell">{r.cost?`$${fmt(r.cost)}`:'—'}</td>
                      <td style={{ ...MONO, padding:'8px 8px', textAlign:'right', fontSize:11, color:'#333333' }}>{r.price?`$${fmt(r.price)}`:'—'}</td>
                      <td style={{ ...MONO, padding:'8px 8px', textAlign:'right', fontSize:11, fontWeight:600, color:'#000000' }}>{r.mktVal>0?`$${fmt(r.mktVal)}`:'—'}</td>
                      <td style={{ ...MONO, padding:'8px 8px', textAlign:'right', fontSize:11, color:r.pnlAmt!=null?(r.pnlAmt>=0?GRN:RED):'#CCCCCC' }} className="hidden md:table-cell">{r.pnlAmt!=null?fmtPnl(r.pnlAmt):'—'}</td>
                      <td style={{ ...MONO, padding:'8px 8px', textAlign:'right', fontSize:11, color:r.pnlPct!=null?(r.pnlPct>=0?GRN:RED):'#CCCCCC' }}>{r.pnlPct!=null?fmtPct(r.pnlPct):'—'}</td>
                      <td style={{ ...MONO, padding:'8px 8px', textAlign:'right', fontSize:11, color:r.dayPct!=null?(r.dayPct>=0?GRN:RED):'#CCCCCC' }}>{r.dayPct!=null?fmtPct(r.dayPct):'—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Charts */}
      {valued.length>0&&(
        <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:10 }} className="sm:grid-cols-3">
          <div style={{ ...card, gridColumn:'span 2' }}>
            <div style={{ ...MONO, fontSize:9, color:'#AAAAAA', letterSpacing:'0.08em', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
              EQUITY CURVE · {range}
              {cLoading&&<Loader2 size={8} className="animate-spin" style={{color:TEAL}}/>}
            </div>
            <EquityCurveChart portfolio={ecPort} spy={ecSpy} range={range} />
          </div>
          <div style={card}>
            <div style={{ ...MONO, fontSize:9, color:'#AAAAAA', letterSpacing:'0.08em', marginBottom:8 }}>ALLOCATION</div>
            <DonutChart rows={valued} totalValue={totalVal} highlighted={highlighted} onSliceClick={setHighlighted} />
            <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:4 }}>
              {valued.slice(0,7).map((r,i)=>(
                <div key={r.ticker} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }} onClick={()=>setHighlighted(p=>p===r.ticker?null:r.ticker)}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:PALETTE[i%PALETTE.length], flexShrink:0 }}/>
                    <span style={{ ...MONO, fontSize:10, color:highlighted===r.ticker?TEAL:'#757575' }}>{r.ticker}</span>
                  </div>
                  <span style={{ ...MONO, fontSize:10, color:'#AAAAAA' }}>{(r.mktVal/totalVal*100).toFixed(1)}%</span>
                </div>
              ))}
              {valued.length>7&&<div style={{ ...MONO, fontSize:9, color:'#AAAAAA', textAlign:'center' }}>+{valued.length-7} more</div>}
            </div>
          </div>
        </div>
      )}

      {/* Edit section */}
      <div style={{ border:'1px solid #EEEEEE', borderRadius:12, overflow:'hidden' }}>
        <button onClick={()=>setEditOpen(v=>!v)}
          style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'#FAFAFA', border:'none', cursor:'pointer', textAlign:'left' }}
          onMouseEnter={e=>(e.currentTarget.style.background='#F0F0F0')}
          onMouseLeave={e=>(e.currentTarget.style.background='#FAFAFA')}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Briefcase size={12} style={{ color:'#757575' }} />
            <span style={{ ...MONO, fontSize:11, color:'#757575', letterSpacing:'0.06em' }}>EDIT POSITIONS</span>
          </div>
          {editOpen?<ChevronUp size={13} style={{color:'#AAAAAA'}}/>:<ChevronDown size={13} style={{color:'#AAAAAA'}}/>}
        </button>

        {editOpen&&(
          <div style={{ padding:'14px 16px', borderTop:'1px solid #EEEEEE' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
              <p style={{ fontSize:12, color:'#757575', margin:0, lineHeight:1.5 }}>Enter what {acct.label} actually holds. All six agents read these live.</p>
              <button onClick={handleSave} disabled={saving}
                style={{ ...MONO, background:saved?GRN:'#000000', color:'#FFFFFF', border:'none', borderRadius:8, padding:'6px 14px', fontSize:11, fontWeight:600, cursor:saving?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:5, flexShrink:0, marginLeft:12 }}>
                {saved?<Check size={12}/>:saving?<CloudUpload size={12} className="animate-pulse"/>:<Save size={12}/>}
                {saved?'SAVED':saving?'SAVING…':'SAVE'}
              </button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {acctHoldings.map(t=>{
                const p=posMap[t]||{}, q=quotes[t]||{}, price=q.price>0?q.price:0;
                const mktVal=(parseFloat(p.shares)||0)*price, bookPct=totalVal>0&&mktVal>0?(mktVal/totalVal)*100:0;
                return (
                  <div key={t} style={{ border:'1px solid #EEEEEE', borderRadius:10, overflow:'hidden', background:'#FFFFFF' }}>
                    {bookPct>0&&(
                      <div style={{ height:2, background:'#F0F0F0' }}>
                        <div style={{ height:'100%', width:`${Math.min(bookPct,100)}%`, background:bookPct>25?'#F59E0B':GRN, transition:'width .4s ease' }}/>
                      </div>
                    )}
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px' }}>
                      <span style={{ ...MONO, width:52, fontWeight:600, fontSize:13, flexShrink:0 }}>{t}</span>
                      <input value={p.shares||''} onChange={e=>setPos(t,'shares',e.target.value.replace(/[^0-9.]/g,''))}
                        inputMode="decimal" placeholder="shares"
                        style={{ ...inp(false), flex:1, minWidth:0, padding:'7px 10px' }}
                        onFocus={e=>(e.target.style.borderColor='#000000')} onBlur={e=>(e.target.style.borderColor='#EEEEEE')} />
                      <div style={{ position:'relative', flex:1, minWidth:0 }}>
                        <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#AAAAAA', fontSize:13 }}>$</span>
                        <input value={p.cost||''} onChange={e=>setPos(t,'cost',e.target.value.replace(/[^0-9.]/g,''))}
                          inputMode="decimal" placeholder="avg"
                          style={{ ...inp(false), width:'100%', padding:'7px 10px 7px 22px', boxSizing:'border-box' }}
                          onFocus={e=>(e.target.style.borderColor='#000000')} onBlur={e=>(e.target.style.borderColor='#EEEEEE')} />
                      </div>
                      <button onClick={()=>removeTicker(t)}
                        style={{ width:30, height:30, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'transparent', border:'none', borderRadius:6, color:'#CCCCCC', cursor:'pointer' }}
                        onMouseEnter={e=>(e.currentTarget.style.color=RED)} onMouseLeave={e=>(e.currentTarget.style.color='#CCCCCC')}>
                        <X size={15}/>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop:10, display:'flex', gap:8 }}>
              <div style={{ position:'relative', flex:1 }}>
                <Plus size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#AAAAAA' }}/>
                <input value={newTicker} onChange={e=>setNewTicker(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&handleAdd()}
                  placeholder="add ticker (e.g. OKLO)"
                  style={{ ...inp(false), width:'100%', padding:'9px 10px 9px 30px', letterSpacing:'0.08em', textTransform:'uppercase', boxSizing:'border-box' }}
                  onFocus={e=>(e.target.style.borderColor='#000000')} onBlur={e=>(e.target.style.borderColor='#EEEEEE')} />
              </div>
              <button onClick={handleAdd} disabled={!newTicker.trim()}
                style={{ ...MONO, background:newTicker.trim()?'#000000':'#CCCCCC', color:'#FFFFFF', border:'none', borderRadius:8, padding:'0 18px', fontSize:13, fontWeight:600, cursor:newTicker.trim()?'pointer':'not-allowed' }}>ADD</button>
            </div>
            <div style={{ marginTop:10, background:'rgba(0,200,5,0.05)', border:'1px solid rgba(0,200,5,0.2)', borderRadius:8, padding:'10px 12px', display:'flex', alignItems:'flex-start', gap:8 }}>
              <Check size={13} style={{ color:GRN, marginTop:1, flexShrink:0 }}/>
              <p style={{ fontSize:12, color:'#555555', margin:0, lineHeight:1.5 }}>Council sees: <span style={{ color:'#000000' }}>{positionsLine||'no positions yet'}</span></p>
            </div>
            <p style={{ ...MONO, fontSize:10, color:'#AAAAAA', marginTop:6 }}>Auto-saves locally. Hit SAVE to sync across devices.</p>
          </div>
        )}
      </div>
    </div>
  );
}
