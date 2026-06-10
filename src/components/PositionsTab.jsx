import React, { useState, useEffect } from 'react';
import {
  Briefcase, Check, X, Plus, Save, CloudUpload, RefreshCw, Loader2,
  ChevronDown, ChevronUp, ArrowUp, ArrowDown,
} from 'lucide-react';
import { MONO, DISP } from '../constants/styles.js';
import { getQuotes, getCandles } from '../api.js';

const GREEN = '#7ee787';
const RED   = '#ff5d6c';
const YLW   = '#f5c451';
const TEAL  = '#38e0d4';

const PALETTE = [TEAL, GREEN, YLW, '#b083ff', '#ff8c5d', '#38a8e0', '#e0a838', '#8de038', '#d438e0', '#5d8cff'];
const RANGES  = ['1H', '1D', '1W', '1M', '1Y', 'All'];

function fmt(n)     { return isNaN(n) || n == null ? '—' : Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtPct(n)  { if (isNaN(n) || n == null) return '—'; return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }
function fmtPnl(n)  { if (isNaN(n) || n == null) return '—'; return (n >= 0 ? '+$' : '-$') + fmt(n); }
function fmtTime(d) { return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }
function fmtX(ts, range) {
  const d = new Date(ts);
  if (range === '1H' || range === '1D') return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (range === '1W' || range === '1M') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function computeEquityCurve(candles, posMap) {
  const spy = candles?.SPY;
  if (!spy?.t?.length) return { portfolio: [], spy: [] };
  const held = Object.entries(posMap).filter(([, p]) => parseFloat(p.shares) > 0);
  if (!held.length) return { portfolio: [], spy: [] };

  const lookups = {};
  for (const [tk] of held) {
    const d = candles[tk];
    if (d?.t?.length && d?.c?.length) {
      const m = {};
      d.t.forEach((ts, i) => { m[ts] = d.c[i]; });
      lookups[tk] = { m, ts: d.t };
    }
  }

  const portPts = [], spyPts = [];
  for (let i = 0; i < spy.t.length; i++) {
    const ts = spy.t[i];
    let pv = 0;
    for (const [tk, pd] of held) {
      const shares = parseFloat(pd.shares) || 0;
      if (!shares) continue;
      const lk = lookups[tk];
      if (!lk) continue;
      let close = lk.m[ts];
      if (close === undefined) {
        const prev = lk.ts.filter(t => t <= ts);
        if (prev.length) close = lk.m[prev[prev.length - 1]];
      }
      if (close != null) pv += shares * close;
    }
    portPts.push({ t: ts * 1000, v: pv });
    spyPts.push({ t: ts * 1000, v: spy.c[i] });
  }

  if (!portPts.length) return { portfolio: [], spy: [] };
  const p0 = portPts[0].v || 1, s0 = spyPts[0].v || 1;
  return {
    portfolio: portPts.map(d => ({ t: d.t, v: p0 > 0 ? ((d.v - p0) / p0) * 100 : 0 })),
    spy:       spyPts.map(d => ({ t: d.t, v: s0 > 0 ? ((d.v - s0) / s0) * 100 : 0 })),
  };
}

function EquityCurveChart({ portfolio, spy, range }) {
  if (!portfolio?.length || portfolio.length < 2) {
    return (
      <div className="flex items-center justify-center h-[130px] text-[11px]"
        style={{ ...MONO, color: 'rgba(255,255,255,0.2)' }}>
        No historical data for this range
      </div>
    );
  }

  const W = 560, H = 130, PL = 40, PR = 10, PT = 10, PB = 26;
  const cW = W - PL - PR, cH = H - PT - PB;

  const allV = [...portfolio.map(d => d.v), ...spy.map(d => d.v)];
  const minV = Math.min(...allV), maxV = Math.max(...allV);
  const vR = maxV - minV || 1;

  const toX = i => PL + (i / (portfolio.length - 1)) * cW;
  const toY = v => PT + cH - ((v - minV) / vR) * cH;

  const portLine = portfolio.map((d, i) => `${toX(i).toFixed(1)},${toY(d.v).toFixed(1)}`).join(' ');
  const spyLine  = spy.length > 1
    ? spy.map((d, i) => { const x = PL + (i / (spy.length - 1)) * cW; return `${x.toFixed(1)},${toY(d.v).toFixed(1)}`; }).join(' ')
    : null;

  const lastV = portfolio[portfolio.length - 1].v;
  const portColor = lastV >= 0 ? GREEN : RED;
  const showZero = 0 >= minV && 0 <= maxV;

  const areaD = `M ${PL.toFixed(1)},${(PT + cH).toFixed(1)} L ${portfolio.map((d, i) => `${toX(i).toFixed(1)},${toY(d.v).toFixed(1)}`).join(' L ')} L ${(PL + cW).toFixed(1)},${(PT + cH).toFixed(1)} Z`;

  const lblIdx = portfolio.length > 4
    ? [0, Math.floor(portfolio.length / 3), Math.floor(2 * portfolio.length / 3), portfolio.length - 1]
    : [0, portfolio.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="ecGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={portColor} stopOpacity="0.22" />
          <stop offset="100%" stopColor={portColor} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {[minV, (minV + maxV) / 2, maxV].map((v, i) => (
        <line key={i} x1={PL} y1={toY(v)} x2={W - PR} y2={toY(v)}
          stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}
      {showZero && (
        <line x1={PL} y1={toY(0)} x2={W - PR} y2={toY(0)}
          stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3,4" />
      )}
      <path d={areaD} fill="url(#ecGrad)" />
      {spyLine && (
        <polyline points={spyLine} fill="none"
          stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeDasharray="4,3" />
      )}
      <polyline points={portLine} fill="none" stroke={portColor} strokeWidth="2" strokeLinejoin="round" />
      {lblIdx.map(i => portfolio[i] && (
        <text key={i} x={toX(i)} y={H - 4} textAnchor="middle"
          fill="rgba(255,255,255,0.25)" style={{ fontSize: '9px', fontFamily: "'IBM Plex Mono', monospace" }}>
          {fmtX(portfolio[i].t, range)}
        </text>
      ))}
      {[minV, maxV].map((v, i) => (
        <text key={i} x={PL - 4} y={toY(v) + 3} textAnchor="end"
          fill="rgba(255,255,255,0.25)" style={{ fontSize: '9px', fontFamily: "'IBM Plex Mono', monospace" }}>
          {v >= 0 ? '+' : ''}{v.toFixed(1)}%
        </text>
      ))}
      <line x1={PL + 2} y1={PT + 7} x2={PL + 14} y2={PT + 7} stroke={portColor} strokeWidth="2" />
      <text x={PL + 18} y={PT + 10} fill="rgba(255,255,255,0.35)"
        style={{ fontSize: '9px', fontFamily: "'IBM Plex Mono', monospace" }}>PORTFOLIO</text>
      <line x1={PL + 80} y1={PT + 7} x2={PL + 92} y2={PT + 7}
        stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeDasharray="4,3" />
      <text x={PL + 96} y={PT + 10} fill="rgba(255,255,255,0.35)"
        style={{ fontSize: '9px', fontFamily: "'IBM Plex Mono', monospace" }}>SPY</text>
    </svg>
  );
}

function DonutChart({ rows, totalValue, highlighted, onSliceClick }) {
  const valued = rows.filter(r => r.mktVal > 0);
  if (!valued.length || totalValue <= 0) return null;

  const CX = 70, CY = 70, R = 58, RI = 34, SZ = 140;
  let cum = -90;

  const slices = valued.map((r, i) => {
    const pct = r.mktVal / totalValue;
    const start = cum;
    cum += pct * 360;
    return { ticker: r.ticker, pct, start, end: cum, color: PALETTE[i % PALETTE.length] };
  });

  function xy(angle, r) {
    const rad = angle * Math.PI / 180;
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }

  function arc(s, e, ro, ri) {
    if (e - s >= 359.9) {
      return `M ${CX} ${CY - ro} A ${ro} ${ro} 0 1 1 ${CX - 0.01} ${CY - ro} Z M ${CX} ${CY - ri} A ${ri} ${ri} 0 1 0 ${CX - 0.01} ${CY - ri} Z`;
    }
    const large = (e - s) > 180 ? 1 : 0;
    const p1 = xy(s, ro), p2 = xy(e, ro), p3 = xy(e, ri), p4 = xy(s, ri);
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${ro} ${ro} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} A ${ri} ${ri} 0 ${large} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)} Z`;
  }

  const hlRow = highlighted ? rows.find(r => r.ticker === highlighted) : null;

  return (
    <svg viewBox={`0 0 ${SZ} ${SZ}`} className="w-full max-w-[140px] mx-auto cursor-pointer">
      {slices.map(s => {
        const isHL = highlighted === s.ticker;
        return (
          <path key={s.ticker}
            d={arc(s.start, s.end, isHL ? R + 7 : R, RI)}
            fill={s.color}
            opacity={highlighted && !isHL ? 0.3 : 1}
            style={{ transition: 'opacity 0.2s' }}
            onClick={() => onSliceClick(s.ticker === highlighted ? null : s.ticker)} />
        );
      })}
      {hlRow ? (
        <>
          <text x={CX} y={CY - 4} textAnchor="middle" fill="white"
            style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{hlRow.ticker}</text>
          <text x={CX} y={CY + 10} textAnchor="middle" fill="rgba(255,255,255,0.5)"
            style={{ fontSize: '9px', fontFamily: "'IBM Plex Mono', monospace" }}>
            {(hlRow.mktVal / totalValue * 100).toFixed(1)}%
          </text>
        </>
      ) : (
        <text x={CX} y={CY + 4} textAnchor="middle" fill="rgba(255,255,255,0.25)"
          style={{ fontSize: '8px', fontFamily: "'IBM Plex Mono', monospace" }}>ALLOC</text>
      )}
    </svg>
  );
}

function ColHdr({ id, label, cls, sortCol, sortDir, onSort }) {
  const active = id === sortCol;
  return (
    <th onClick={() => onSort(id)}
      className={`${cls} px-2 py-2.5 cursor-pointer select-none whitespace-nowrap`}
      style={{ ...MONO, color: active ? TEAL : 'rgba(255,255,255,0.3)', fontSize: '9px', letterSpacing: '0.06em', fontWeight: 600 }}>
      <span className="flex items-center gap-0.5">
        {label}
        {active
          ? (sortDir === 'asc' ? <ArrowUp size={8} style={{ color: TEAL }} /> : <ArrowDown size={8} style={{ color: TEAL }} />)
          : <ArrowUp size={8} style={{ color: 'rgba(255,255,255,0.15)' }} />}
      </span>
    </th>
  );
}

export default function PositionsTab({ acct, posMap, acctHoldings, setPos, addTicker, removeTicker, positionsLine, onSave }) {
  const [range, setRange]             = useState('1D');
  const [quotes, setQuotes]           = useState({});
  const [candles, setCandles]         = useState({});
  const [qLoading, setQL]             = useState(false);
  const [cLoading, setCL]             = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [flash, setFlash]             = useState(false);
  const [sortCol, setSortCol]         = useState('value');
  const [sortDir, setSortDir]         = useState('desc');
  const [highlighted, setHighlighted] = useState(null);
  const [editOpen, setEditOpen]       = useState(false);
  const [newTicker, setNewTicker]     = useState('');
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);

  const heldTickers = acctHoldings.filter(t => parseFloat(posMap[t]?.shares) > 0);
  const heldKey     = heldTickers.join(',');

  async function doRefresh(tickers, r) {
    if (!tickers.length) return;
    setQL(true); setCL(true);
    try {
      const [q, c] = await Promise.all([getQuotes(tickers), getCandles(tickers, r)]);
      setQuotes(q);
      setCandles(c);
      setLastUpdated(new Date());
      setFlash(true);
      setTimeout(() => setFlash(false), 1200);
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
    const id = setInterval(() => doRefresh(tickers, range), 60000);
    return () => clearInterval(id);
  }, [acct.label, range, heldKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = acctHoldings.map((t, i) => {
    const p      = posMap[t] || {};
    const shares = parseFloat(p.shares) || 0;
    const cost   = parseFloat(p.cost)   || 0;
    const q      = quotes[t] || {};
    const price  = q.price > 0 ? q.price : (q.prevClose || 0);
    const dayPct = q.changePct ?? null;
    const mktVal = shares * price;
    const basis  = shares * cost;
    const pnlAmt = (price && cost) ? mktVal - basis : null;
    const pnlPct = (price && cost) ? ((price - cost) / cost) * 100 : null;
    return { ticker: t, shares, cost, price, mktVal, basis, pnlAmt, pnlPct, dayPct, color: PALETTE[i % PALETTE.length] };
  });

  const valued      = rows.filter(r => r.mktVal > 0);
  const totalVal    = valued.reduce((s, r) => s + r.mktVal, 0);
  const totalBasis  = valued.reduce((s, r) => s + r.basis, 0);
  const totalPnl    = totalVal - totalBasis;
  const totalPnlPct = totalBasis > 0 ? (totalPnl / totalBasis) * 100 : null;

  const dayChgDollar = valued.reduce((s, r) => {
    if (r.dayPct == null || !r.price || !r.shares) return s;
    return s + r.shares * r.price * r.dayPct / (100 + r.dayPct);
  }, 0);
  const dayChgPct = totalVal > 0 ? (dayChgDollar / (totalVal - dayChgDollar)) * 100 : null;

  function handleSort(col) {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }
  const getV = (r, col) => {
    switch (col) {
      case 'ticker': return r.ticker;
      case 'shares': return r.shares;
      case 'cost':   return r.cost;
      case 'price':  return r.price;
      case 'value':  return r.mktVal;
      case 'pnl$':   return r.pnlAmt ?? -Infinity;
      case 'pnl%':   return r.pnlPct ?? -Infinity;
      case 'day':    return r.dayPct ?? -Infinity;
      case 'be':     return r.cost ?? -Infinity;
      default:       return r.mktVal;
    }
  };
  const sorted = [...rows].sort((a, b) => {
    const va = getV(a, sortCol), vb = getV(b, sortCol);
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  const movers = [...rows]
    .filter(r => r.dayPct != null && r.shares > 0 && r.price > 0)
    .sort((a, b) => b.dayPct - a.dayPct);

  const { portfolio: ecPort, spy: ecSpy } = computeEquityCurve(candles, posMap);

  async function handleSave() {
    setSaving(true); setSaved(false);
    try {
      await Promise.race([
        onSave(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000)),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {}
    setSaving(false);
  }

  function handleAdd() {
    const t = newTicker.trim().toUpperCase();
    if (!t) return; addTicker(t); setNewTicker('');
  }

  const isLoading = qLoading || cLoading;
  const COLS = [
    { id: 'ticker', label: 'TICKER',     cls: 'text-left' },
    { id: 'shares', label: 'SHARES',     cls: 'text-right hidden sm:table-cell' },
    { id: 'cost',   label: 'AVG COST',   cls: 'text-right hidden sm:table-cell' },
    { id: 'price',  label: 'PRICE',      cls: 'text-right' },
    { id: 'value',  label: 'VALUE',      cls: 'text-right' },
    { id: 'pnl$',   label: 'P&L $',      cls: 'text-right hidden md:table-cell' },
    { id: 'pnl%',   label: 'P&L %',      cls: 'text-right' },
    { id: 'day',    label: 'DAY %',      cls: 'text-right' },
    { id: 'be',     label: 'BREAK-EVEN', cls: 'text-right hidden lg:table-cell' },
  ];

  return (
    <div className="mt-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Briefcase size={15} style={{ color: GREEN }} />
          <span style={{ ...DISP, letterSpacing: '0.04em' }} className="text-sm font-semibold">
            POSITIONS · {acct.label.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span style={{ ...MONO, color: flash ? GREEN : 'rgba(255,255,255,0.3)', transition: 'color 0.5s' }}
              className="text-[10px] flex items-center gap-1">
              {fmtTime(lastUpdated)}
              {flash && <span style={{ color: GREEN }}>●</span>}
            </span>
          )}
          <button onClick={() => doRefresh(heldTickers, range)} disabled={isLoading}
            style={{ ...MONO, borderColor: 'rgba(255,255,255,0.12)', color: isLoading ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.5)' }}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] hover:border-white/25 disabled:cursor-not-allowed transition-colors">
            {isLoading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
            <span>REFRESH</span>
          </button>
        </div>
      </div>

      {/* Range pills */}
      <div className="flex gap-1.5 flex-wrap">
        {RANGES.map(r => (
          <button key={r} onClick={() => setRange(r)}
            style={{
              ...MONO,
              background: range === r ? `${TEAL}20` : 'transparent',
              border: `1px solid ${range === r ? TEAL : 'rgba(255,255,255,0.12)'}`,
              color: range === r ? TEAL : 'rgba(255,255,255,0.4)',
            }}
            className="px-3 py-1 rounded-lg text-[11px] transition-all hover:border-white/25">
            {r}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {valued.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'TOTAL VALUE',     val: `$${totalVal.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,    sub: null,                                             col: 'white' },
            { label: 'COST BASIS',      val: `$${totalBasis.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,  sub: null,                                             col: 'rgba(255,255,255,0.55)' },
            { label: 'UNREALIZED P&L',  val: fmtPnl(totalPnl),    sub: totalPnlPct   != null ? fmtPct(totalPnlPct)   : null, col: totalPnl      >= 0 ? GREEN : RED },
            { label: 'DAY CHANGE',      val: fmtPnl(dayChgDollar), sub: dayChgPct    != null ? fmtPct(dayChgPct)     : null, col: dayChgDollar  >= 0 ? GREEN : RED },
          ].map(({ label, val, sub, col }) => (
            <div key={label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={MONO} className="text-[9px] text-white/40 tracking-widest mb-1">{label}</div>
              <div style={{ ...DISP, color: col }} className="text-base font-bold leading-none">{val}</div>
              {sub && <div style={{ ...MONO, color: col }} className="text-[10px] mt-1 opacity-80">{sub}</div>}
            </div>
          ))}
        </div>
      ) : (
        heldTickers.length === 0 && (
          <div className="rounded-xl p-4 text-center" style={{ ...MONO, color: 'rgba(255,255,255,0.3)', fontSize: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
            Open Edit Positions below to add shares and see your live dashboard.
          </div>
        )
      )}

      {/* Top movers */}
      {movers.length > 0 && (
        <div>
          <div style={MONO} className="text-[9px] text-white/35 tracking-widest mb-1.5">TODAY'S MOVERS</div>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {movers.map(r => {
              const dayChg$ = r.shares * r.price * r.dayPct / (100 + r.dayPct);
              return (
                <div key={r.ticker} className="shrink-0 rounded-xl px-3 py-2.5 min-w-[76px]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${r.dayPct >= 0 ? 'rgba(126,231,135,0.18)' : 'rgba(255,93,108,0.18)'}` }}>
                  <div style={DISP} className="text-[12px] font-semibold">{r.ticker}</div>
                  <div style={{ ...MONO, color: r.dayPct >= 0 ? GREEN : RED }} className="text-[10px] mt-0.5 font-medium">{fmtPct(r.dayPct)}</div>
                  <div style={{ ...MONO, color: 'rgba(255,255,255,0.35)' }} className="text-[9px]">{fmtPnl(dayChg$)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Positions table */}
      {rows.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {COLS.map(c => (
                    <ColHdr key={c.id} {...c} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const isHL = highlighted === r.ticker;
                  return (
                    <tr key={r.ticker}
                      onClick={() => setHighlighted(p => p === r.ticker ? null : r.ticker)}
                      className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                      style={{
                        background: isHL ? `${TEAL}0d` : i % 2 ? 'rgba(255,255,255,0.01)' : 'transparent',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                      }}>
                      <td className="px-2 py-2.5 text-left">
                        <span style={{ ...DISP, color: isHL ? TEAL : 'white' }} className="font-semibold text-[12px]">{r.ticker}</span>
                      </td>
                      <td className="px-2 py-2.5 text-right hidden sm:table-cell"
                        style={{ ...MONO, color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>{r.shares || '—'}</td>
                      <td className="px-2 py-2.5 text-right hidden sm:table-cell"
                        style={{ ...MONO, color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>{r.cost ? `$${fmt(r.cost)}` : '—'}</td>
                      <td className="px-2 py-2.5 text-right"
                        style={{ ...MONO, color: 'rgba(255,255,255,0.75)', fontSize: '11px' }}>{r.price ? `$${fmt(r.price)}` : '—'}</td>
                      <td className="px-2 py-2.5 text-right"
                        style={{ ...MONO, color: 'white', fontSize: '11px', fontWeight: 600 }}>{r.mktVal > 0 ? `$${fmt(r.mktVal)}` : '—'}</td>
                      <td className="px-2 py-2.5 text-right hidden md:table-cell"
                        style={{ ...MONO, color: r.pnlAmt != null ? (r.pnlAmt >= 0 ? GREEN : RED) : 'rgba(255,255,255,0.25)', fontSize: '11px' }}>
                        {r.pnlAmt != null ? fmtPnl(r.pnlAmt) : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-right"
                        style={{ ...MONO, color: r.pnlPct != null ? (r.pnlPct >= 0 ? GREEN : RED) : 'rgba(255,255,255,0.25)', fontSize: '11px' }}>
                        {r.pnlPct != null ? fmtPct(r.pnlPct) : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-right"
                        style={{ ...MONO, color: r.dayPct != null ? (r.dayPct >= 0 ? GREEN : RED) : 'rgba(255,255,255,0.25)', fontSize: '11px' }}>
                        {r.dayPct != null ? fmtPct(r.dayPct) : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-right hidden lg:table-cell"
                        style={{ ...MONO, color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>
                        {r.cost ? `$${fmt(r.cost)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Charts */}
      {valued.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={MONO} className="text-[9px] text-white/35 tracking-widest mb-2 flex items-center gap-2">
              EQUITY CURVE · {range}
              {cLoading && <Loader2 size={8} className="animate-spin" style={{ color: TEAL }} />}
            </div>
            <EquityCurveChart portfolio={ecPort} spy={ecSpy} range={range} />
          </div>
          <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={MONO} className="text-[9px] text-white/35 tracking-widest mb-2">ALLOCATION</div>
            <DonutChart rows={valued} totalValue={totalVal} highlighted={highlighted} onSliceClick={setHighlighted} />
            <div className="mt-2 space-y-1">
              {valued.slice(0, 7).map((r, i) => (
                <div key={r.ticker} className="flex items-center justify-between cursor-pointer"
                  onClick={() => setHighlighted(p => p === r.ticker ? null : r.ticker)}>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span style={{ ...MONO, color: highlighted === r.ticker ? TEAL : 'rgba(255,255,255,0.55)' }}
                      className="text-[10px]">{r.ticker}</span>
                  </div>
                  <span style={{ ...MONO, color: 'rgba(255,255,255,0.3)' }} className="text-[10px]">
                    {(r.mktVal / totalVal * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
              {valued.length > 7 && (
                <div style={{ ...MONO, color: 'rgba(255,255,255,0.2)' }} className="text-[9px] text-center">
                  +{valued.length - 7} more
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Collapsible edit */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
        <button onClick={() => setEditOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
          style={{ background: 'rgba(255,255,255,0.025)' }}>
          <div className="flex items-center gap-2">
            <Briefcase size={12} style={{ color: 'rgba(255,255,255,0.5)' }} />
            <span style={{ ...MONO, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em' }} className="text-[11px]">
              EDIT POSITIONS
            </span>
          </div>
          {editOpen
            ? <ChevronUp size={13} style={{ color: 'rgba(255,255,255,0.3)' }} />
            : <ChevronDown size={13} style={{ color: 'rgba(255,255,255,0.3)' }} />}
        </button>

        {editOpen && (
          <div className="p-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] text-white/50 leading-relaxed">
                Enter what {acct.label} actually holds. All six agents read these live.
              </p>
              <button onClick={handleSave} disabled={saving}
                style={{ ...MONO, background: saved ? 'rgba(56,224,138,0.15)' : 'rgba(126,231,135,0.1)', border: `1px solid ${saved ? '#38e08a' : 'rgba(126,231,135,0.35)'}`, color: saved ? '#38e08a' : GREEN }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-all hover:brightness-110 disabled:opacity-50 ml-4 shrink-0">
                {saved ? <Check size={12} /> : saving ? <CloudUpload size={12} className="animate-pulse" /> : <Save size={12} />}
                <span>{saved ? 'SAVED' : saving ? 'SAVING…' : 'SAVE'}</span>
              </button>
            </div>

            <div className="space-y-2">
              {acctHoldings.map(t => {
                const p = posMap[t] || {};
                const q = quotes[t] || {};
                const price = q.price > 0 ? q.price : 0;
                const mktVal = (parseFloat(p.shares) || 0) * price;
                const bookPct = totalVal > 0 && mktVal > 0 ? (mktVal / totalVal) * 100 : 0;
                const isHeavy = bookPct > 25;
                return (
                  <div key={t} className="bg-white/[0.025] border border-white/10 rounded-xl overflow-hidden">
                    {bookPct > 0 && (
                      <div className="h-0.5 w-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div className="h-full transition-all duration-500"
                          style={{ width: `${Math.min(bookPct, 100)}%`, background: isHeavy ? YLW : GREEN }} />
                      </div>
                    )}
                    <div className="p-2.5 flex items-center gap-2">
                      <span style={DISP} className="w-16 font-semibold text-sm pl-1 shrink-0">{t}</span>
                      <input value={p.shares || ''} onChange={e => setPos(t, 'shares', e.target.value.replace(/[^0-9.]/g, ''))}
                        inputMode="decimal" placeholder="shares" style={MONO}
                        className="flex-1 min-w-0 bg-white/[0.04] border border-white/12 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#7ee787]/60 transition-colors" />
                      <div className="relative flex-1 min-w-0">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 text-sm" style={MONO}>$</span>
                        <input value={p.cost || ''} onChange={e => setPos(t, 'cost', e.target.value.replace(/[^0-9.]/g, ''))}
                          inputMode="decimal" placeholder="avg" style={MONO}
                          className="w-full bg-white/[0.04] border border-white/12 rounded-lg pl-6 pr-2 py-2 text-sm outline-none focus:border-[#7ee787]/60 transition-colors" />
                      </div>
                      <button onClick={() => removeTicker(t)}
                        className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-white/35 hover:text-[#ff5d6c] hover:bg-[#ff5d6c]/10 transition-colors">
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <Plus size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input value={newTicker} onChange={e => setNewTicker(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="add ticker (e.g. OKLO)" style={{ ...MONO, letterSpacing: '0.1em' }}
                  className="w-full bg-white/[0.04] border border-white/15 rounded-lg pl-9 pr-3 py-2.5 text-sm uppercase outline-none focus:border-[#7ee787]/60 transition-colors" />
              </div>
              <button onClick={handleAdd} disabled={!newTicker.trim()}
                style={{ ...DISP, background: newTicker.trim() ? GREEN : 'rgba(126,231,135,0.25)', color: '#06140a' }}
                className="px-4 py-2.5 rounded-lg font-semibold text-sm transition-all hover:brightness-110 disabled:cursor-not-allowed">ADD</button>
            </div>

            <div className="mt-3 rounded-xl p-3 flex items-start gap-2.5"
              style={{ background: 'rgba(126,231,135,0.06)', border: '1px solid rgba(126,231,135,0.2)' }}>
              <Check size={14} style={{ color: GREEN }} className="mt-0.5 shrink-0" />
              <p className="text-[12px] text-white/65 leading-relaxed">
                Council sees: <span className="text-white/85">{positionsLine || 'no positions yet'}</span>
              </p>
            </div>
            <p style={MONO} className="mt-2 text-[10px] text-white/30">
              Auto-saves locally. Hit SAVE to sync across devices.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
