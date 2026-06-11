import React, { useState, useEffect } from 'react';
import {
  Briefcase, Check, X, Plus, Save, CloudUpload, RefreshCw, Loader2,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { MONO, DISP, SANS, CY } from '../constants/styles.js';
import { getQuotes, getCandles } from '../api.js';

const GOLD = '#c9a84c';
const RED  = '#c0392b';
const RANGES = ['1W', '1M', '3M', '1Y', 'All'];

function fmt(n)    { return isNaN(n) || n == null ? '—' : Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtPct(n) { if (isNaN(n) || n == null) return '—'; return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }
function fmtPnl(n) { if (isNaN(n) || n == null) return '—'; return (n >= 0 ? '+$' : '-$') + fmt(n); }
function fmtTime(d){ return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }
function fmtK(n)   {
  if (isNaN(n) || n == null) return '—';
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 10000)   return `$${(n / 1000).toFixed(0)}k`;
  if (n >= 1000)    return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}
function fmtX(ts, range) {
  const d = new Date(ts);
  if (range === '1Y' || range === 'All') return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtHoverDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function getMarketSession() {
  try {
    const et  = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dow = et.getDay(); // 0=Sun, 6=Sat
    const tod = et.getHours() * 60 + et.getMinutes();
    if (dow === 0 || dow === 6) return 'overnight';
    if (tod >= 570 && tod < 960)  return 'market';    // 9:30–16:00
    if (tod >= 240 && tod < 570)  return 'premarket'; // 04:00–9:30
    if (tod >= 960 && tod < 1200) return 'afterhours'; // 16:00–20:00
    return 'overnight';
  } catch { return 'market'; }
}

const SESSION_INFO = {
  premarket:  { label: 'PRE-MARKET',  emoji: '🌅', color: 'rgba(232,201,122,0.75)' },
  afterhours: { label: 'AFTER-HOURS', emoji: '🌆', color: 'rgba(125,184,232,0.70)' },
  overnight:  { label: 'OVERNIGHT',   emoji: '🌙☁️', color: 'rgba(125,184,232,0.55)' },
};

function useCounter(target, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) { setVal(0); return; }
    const start = performance.now();
    let raf;
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      setVal(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function computeEquityCurve(candles, posMap) {
  const spy = candles?.SPY;
  if (!spy?.t?.length) return [];
  const held = Object.entries(posMap).filter(([, p]) => parseFloat(p.shares) > 0);
  if (!held.length) return [];

  const lookups = {};
  for (const [tk] of held) {
    const d = candles[tk];
    if (d?.t?.length && d?.c?.length) {
      const sortedTs = [...d.t].sort((a, b) => a - b);
      const m = {};
      d.t.forEach((ts, i) => { m[ts] = d.c[i]; });
      lookups[tk] = { m, sortedTs };
    }
  }

  const pts = [];
  for (const ts of spy.t) {
    let pv = 0;
    for (const [tk, pd] of held) {
      const shares = parseFloat(pd.shares) || 0;
      if (!shares) continue;
      const lk = lookups[tk];
      if (!lk) continue;
      let close = lk.m[ts];
      if (close == null) {
        let lo = 0, hi = lk.sortedTs.length - 1, found = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (lk.sortedTs[mid] <= ts) { found = mid; lo = mid + 1; }
          else hi = mid - 1;
        }
        if (found >= 0) close = lk.m[lk.sortedTs[found]];
      }
      if (close != null) pv += shares * close;
    }
    if (pv > 0) pts.push({ t: ts * 1000, v: pv });
  }
  return pts;
}

function calcPathLen(pts) {
  if (!pts || pts.length < 2) return 1000;
  let sum = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i-1][0], dy = pts[i][1] - pts[i-1][1];
    sum += Math.sqrt(dx*dx + dy*dy);
  }
  return Math.ceil(sum) + 1;
}

function EquityCurveChart({ data, range, loading, hoverIdx, onHover }) {
  const [animated, setAnimated] = useState(true);
  useEffect(() => {
    setAnimated(true);
    const t = setTimeout(() => setAnimated(false), 1500);
    return () => clearTimeout(t);
  }, []); // remounted via key on range/account change — don't add deps

  if (loading) return <div className="skel" style={{ height: 160, borderRadius: 8 }} />;
  if (!data?.length || data.length < 2) return (
    <div style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center',
      ...MONO, color: 'rgba(255,255,255,0.18)', fontSize: 11 }}>
      No historical data · add shares or try a wider range
    </div>
  );

  const W = 560, H = 160, PL = 56, PR = 8, PT = 8, PB = 26;
  const cW = W - PL - PR, cH = H - PT - PB;

  const vals = data.map(d => d.v);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const pad  = (maxV - minV) * 0.12 || maxV * 0.06;
  const vMin = minV - pad, vMax = maxV + pad;
  const vR   = vMax - vMin;

  const toX = i => PL + (i / (data.length - 1)) * cW;
  const toY = v => PT + cH - ((v - vMin) / vR) * cH;

  const pairs  = data.map((d, i) => [toX(i), toY(d.v)]);
  const ptLine = pairs.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const pathLen = calcPathLen(pairs);
  const lineClr = data[data.length - 1].v >= data[0].v ? GOLD : RED;
  const areaD = `M${PL},${(PT + cH).toFixed(1)} L${pairs.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')} L${(PL + cW).toFixed(1)},${(PT + cH).toFixed(1)} Z`;

  const n = data.length;
  const xIdxs = n > 3 ? [0, Math.floor(n / 3), Math.floor(2 * n / 3), n - 1] : [0, n - 1];
  const yVals  = [vMin + vR * 0.12, vMin + vR * 0.5, vMin + vR * 0.88];

  const lineStyle = animated ? {
    strokeDasharray: pathLen,
    strokeDashoffset: pathLen,
    animation: 'drawIn 1.2s cubic-bezier(.4,0,.2,1) forwards',
  } : {};

  function handleMove(clientX, svgEl) {
    const rect = svgEl.getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width * W;
    onHover?.(Math.max(0, Math.min(n - 1, Math.round((relX - PL) / cW * (n - 1)))));
  }

  const hX = hoverIdx != null ? toX(hoverIdx) : null;
  const hY = hoverIdx != null ? toY(data[hoverIdx].v) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none"
      style={{ overflow: 'visible', touchAction: 'none', cursor: 'crosshair' }}
      onMouseMove={e => handleMove(e.clientX, e.currentTarget)}
      onMouseLeave={() => onHover?.(null)}
      onTouchMove={e => { e.preventDefault(); handleMove(e.touches[0].clientX, e.currentTarget); }}
      onTouchEnd={() => onHover?.(null)}
    >
      <defs>
        <linearGradient id="ecGold2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={lineClr} stopOpacity="0.24" />
          <stop offset="100%" stopColor={lineClr} stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={PL} y1={PT + cH * f} x2={W - PR} y2={PT + cH * f}
          stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
      ))}

      {yVals.map((v, i) => (
        <text key={i} x={PL - 5} y={toY(v) + 3} textAnchor="end"
          fill="rgba(255,255,255,0.22)"
          style={{ fontSize: '9px', fontFamily: "'JetBrains Mono', monospace" }}>
          {fmtK(v)}
        </text>
      ))}

      <path d={areaD} fill="url(#ecGold2)" />

      <polyline points={ptLine} fill="none" stroke={lineClr} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" style={lineStyle} />

      {xIdxs.map((i, li) => (
        <text key={i} x={toX(i)} y={H - 4}
          textAnchor={li === 0 ? 'start' : li === xIdxs.length - 1 ? 'end' : 'middle'}
          fill="rgba(255,255,255,0.22)"
          style={{ fontSize: '9px', fontFamily: "'JetBrains Mono', monospace" }}>
          {fmtX(data[i].t, range)}
        </text>
      ))}

      {hoverIdx != null && hX != null && hY != null && (
        <>
          <line x1={hX} y1={PT} x2={hX} y2={PT + cH}
            stroke="rgba(201,168,76,0.35)" strokeWidth="1" strokeDasharray="3,3" />
          <circle cx={hX} cy={hY} r="5.5" fill={lineClr} stroke="#080808" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}

function PositionCard({ row, delay }) {
  const [expanded, setExpanded] = useState(false);
  if (!row.shares && !row.mktVal) return null;

  return (
    <div className="gold-card" style={{ marginBottom: 8, cursor: 'pointer', animation: `staggerIn 0.3s ease both`, animationDelay: delay }}
      onClick={() => setExpanded(v => !v)}>
      {row.allocPct > 0 && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(201,168,76,0.06)' }}>
          <div style={{ height: '100%', width: `${Math.min(row.allocPct, 100)}%`, background: row.allocPct > 25 ? GOLD : 'rgba(201,168,76,0.4)', borderRadius: '0 0 2px 2px', transition: 'width 0.5s ease' }} />
        </div>
      )}

      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ ...MONO, fontWeight: 700, fontSize: 13, minWidth: 56, color: '#f0f0f0' }}>{row.ticker}</span>
        <span style={{ ...MONO, color: 'rgba(255,255,255,0.38)', fontSize: 11 }}>
          {row.price ? `$${fmt(row.price)}` : '—'}
        </span>
        <span style={{ ...MONO, fontSize: 11, color: row.dayPct != null ? (row.dayPct >= 0 ? GOLD : RED) : 'rgba(255,255,255,0.22)', marginLeft: 'auto' }}>
          {row.dayPct != null ? fmtPct(row.dayPct) : '—'}
        </span>
        <span style={{ ...MONO, fontSize: 12, fontWeight: 600, color: row.pnlAmt != null ? (row.pnlAmt >= 0 ? GOLD : RED) : 'rgba(255,255,255,0.28)', minWidth: 78, textAlign: 'right' }}>
          {row.pnlAmt != null ? fmtPnl(row.pnlAmt) : row.mktVal > 0 ? `$${fmt(row.mktVal)}` : '—'}
        </span>
        <ChevronDown size={12} style={{ color: 'rgba(255,255,255,0.25)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 14px', paddingTop: 12, borderTop: '1px solid rgba(201,168,76,0.08)' }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'SHARES',    val: row.shares || '—',                               col: '#f0f0f0' },
              { label: 'AVG COST',  val: row.cost   ? `$${fmt(row.cost)}`    : '—',       col: '#f0f0f0' },
              { label: 'MKT VALUE', val: row.mktVal > 0 ? `$${fmt(row.mktVal)}` : '—',   col: '#f0f0f0' },
              { label: 'P&L %',     val: fmtPct(row.pnlPct), col: row.pnlPct != null ? (row.pnlPct >= 0 ? GOLD : RED) : 'rgba(255,255,255,0.3)' },
            ].map(({ label, val, col }) => (
              <div key={label}>
                <div style={{ ...MONO, fontSize: 9, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
                <div style={{ ...MONO, fontSize: 12, color: col, fontWeight: 600 }}>{val}</div>
              </div>
            ))}
          </div>
          {row.cost > 0 && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(201,168,76,0.06)' }}>
              <span style={{ ...MONO, fontSize: 9, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.1em' }}>BREAK-EVEN  </span>
              <span style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.48)' }}>${fmt(row.cost)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PositionsTab({ acct, posMap, acctHoldings, setPos, addTicker, removeTicker, positionsLine, onSave }) {
  const [range, setRange]         = useState('1M');
  const [quotes, setQuotes]       = useState({});
  const [candles, setCandles]     = useState({});
  const [qLoading, setQL]         = useState(false);
  const [cLoading, setCL]         = useState(false);
  const [lastUpdated, setLU]      = useState(null);
  const [flash, setFlash]         = useState(false);
  const [editOpen, setEditOpen]   = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [hoverIdx,  setHoverIdx]  = useState(null);
  const [session,   setSession]   = useState(() => getMarketSession());

  // Recheck session every 30s (transitions between pre-market / market / etc.)
  useEffect(() => {
    const id = setInterval(() => setSession(getMarketSession()), 30000);
    return () => clearInterval(id);
  }, []);

  const heldTickers = acctHoldings.filter(t => parseFloat(posMap[t]?.shares) > 0);
  const heldKey     = heldTickers.join(',');

  async function doRefresh(tickers, r) {
    if (!tickers.length) return;
    setQL(true); setCL(true);
    try {
      const [q, c] = await Promise.all([getQuotes(tickers), getCandles(tickers, r)]);
      setQuotes(q); setCandles(c);
      setLU(new Date()); setFlash(true);
      setTimeout(() => setFlash(false), 1200);
    } catch {}
    setQL(false); setCL(false);
  }

  useEffect(() => {
    setQuotes({}); setCandles({}); setHoverIdx(null);
    const tickers = acctHoldings.filter(t => parseFloat(posMap[t]?.shares) > 0);
    doRefresh(tickers, range);
  }, [acct.label, range, heldKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tickers = acctHoldings.filter(t => parseFloat(posMap[t]?.shares) > 0);
    if (!tickers.length) return;
    const id = setInterval(() => doRefresh(tickers, range), 60000);
    return () => clearInterval(id);
  }, [acct.label, range, heldKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = acctHoldings.map(t => {
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
    return { ticker: t, shares, cost, price, mktVal, basis, pnlAmt, pnlPct, dayPct };
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

  const rowsWithAlloc = rows.map(r => ({
    ...r, allocPct: totalVal > 0 && r.mktVal > 0 ? (r.mktVal / totalVal) * 100 : 0,
  }));

  const ecData     = computeEquityCurve(candles, posMap);
  const displayVal = useCounter(totalVal, 900);

  // Hero hover logic — Robinhood-style scrubbing
  const hoverPt       = hoverIdx != null && ecData[hoverIdx] ? ecData[hoverIdx] : null;
  const isHovering    = hoverPt != null;
  const rangeStart    = ecData.length > 0 ? ecData[0].v : null;
  const heroDisplayVal = isHovering ? hoverPt.v : displayVal;
  const heroGainAmt    = isHovering && rangeStart != null ? hoverPt.v - rangeStart : totalPnl;
  const heroGainPct    = isHovering && rangeStart > 0
    ? (hoverPt.v - rangeStart) / rangeStart * 100
    : totalPnlPct;
  const heroGainLabel  = isHovering ? `from ${range} start` : 'all-time';
  const heroTopLabel   = isHovering
    ? fmtHoverDate(hoverPt.t)
    : `${acct.label.toUpperCase()} · PORTFOLIO VALUE`;

  async function handleSave() {
    setSaving(true); setSaved(false);
    try {
      await Promise.race([onSave(), new Promise((_, rej) => setTimeout(() => rej(new Error('to')), 10000))]);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch {}
    setSaving(false);
  }

  function handleAdd() {
    const t = newTicker.trim().toUpperCase();
    if (!t) return; addTicker(t); setNewTicker('');
  }

  function handleRangeChange(r) {
    setRange(r);
    setHoverIdx(null);
  }

  const isLoading = qLoading || cLoading;

  return (
    <div className="mt-6 space-y-4">

      {/* Hero card */}
      {valued.length > 0 ? (
        <div className="gold-card p-6" style={{ animation: 'cardIn .5s ease both' }}>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div style={{ ...MONO, fontSize: 9, letterSpacing: '0.14em', marginBottom: 10,
                color: isHovering ? 'rgba(255,255,255,0.38)' : 'rgba(201,168,76,0.48)',
                transition: 'color 0.15s' }}>
                {heroTopLabel}
              </div>
              <div style={{ ...DISP, fontSize: 44, fontWeight: 900, color: '#f0f0f0', lineHeight: 1, letterSpacing: '-0.02em' }}>
                ${Math.round(heroDisplayVal).toLocaleString('en-US')}
              </div>
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: (heroGainAmt ?? 0) >= 0 ? GOLD : RED }}>
                  {fmtPnl(heroGainAmt)} {heroGainLabel}
                </span>
                {heroGainPct != null && (
                  <span style={{ ...MONO, fontSize: 11, color: (heroGainAmt ?? 0) >= 0 ? GOLD : RED, opacity: 0.72 }}>
                    ({fmtPct(heroGainPct)})
                  </span>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...MONO, fontSize: 9, letterSpacing: '0.12em', marginBottom: 6,
                color: session !== 'market' && SESSION_INFO[session] ? SESSION_INFO[session].color : 'rgba(255,255,255,0.28)' }}>
                {session !== 'market' && SESSION_INFO[session] ? SESSION_INFO[session].label : 'TODAY'}
              </div>
              <div style={{ ...MONO, fontSize: 20, fontWeight: 700, color: dayChgDollar >= 0 ? GOLD : RED }}>
                {fmtPnl(dayChgDollar)}
              </div>
              {dayChgPct != null && (
                <div style={{ ...MONO, fontSize: 11, color: dayChgDollar >= 0 ? GOLD : RED, opacity: 0.68, marginTop: 4 }}>
                  {fmtPct(dayChgPct)}
                </div>
              )}
              {/* Session badge */}
              {session !== 'market' && SESSION_INFO[session] && (
                <div className="flex items-center gap-1.5 mt-3 justify-end">
                  <span style={{ fontSize: 13 }} role="img" aria-label={SESSION_INFO[session].label}>
                    {SESSION_INFO[session].emoji}
                  </span>
                  <span style={{ ...MONO, color: SESSION_INFO[session].color, fontSize: 9, letterSpacing: '0.10em' }}>
                    {SESSION_INFO[session].label}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2 mt-2 justify-end">
                {lastUpdated && (
                  <span style={{ ...MONO, color: flash ? GOLD : 'rgba(255,255,255,0.2)', transition: 'color 0.5s', fontSize: 9 }}>
                    {fmtTime(lastUpdated)}{flash && ' ●'}
                  </span>
                )}
                <button onClick={() => doRefresh(heldTickers, range)} disabled={isLoading}
                  style={{ ...MONO, borderColor: 'rgba(255,255,255,0.1)', color: isLoading ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.42)', fontSize: 9 }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg border transition-colors disabled:cursor-not-allowed">
                  {isLoading ? <Loader2 size={9} className="animate-spin" /> : <RefreshCw size={9} />}
                  <span>REFRESH</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : heldTickers.length === 0 && (
        <div className="gold-card p-5 text-center" style={{ animation: 'cardIn .5s ease both' }}>
          <div style={{ ...MONO, color: 'rgba(201,168,76,0.4)', fontSize: 11 }}>
            Open Edit Positions below to add shares and see your live dashboard.
          </div>
        </div>
      )}

      {/* Range pills */}
      <div className="flex gap-1.5 flex-wrap">
        {RANGES.map(r => (
          <button key={r} onClick={() => handleRangeChange(r)}
            style={{
              ...MONO, fontSize: 11, padding: '5px 13px', borderRadius: 20,
              background: range === r ? 'rgba(201,168,76,0.12)' : 'transparent',
              border: `1px solid ${range === r ? 'rgba(201,168,76,0.36)' : 'rgba(255,255,255,0.09)'}`,
              color: range === r ? GOLD : 'rgba(255,255,255,0.36)',
              cursor: 'pointer', transition: 'all 0.15s ease',
            }}>
            {r}
          </button>
        ))}
      </div>

      {/* Equity curve */}
      {valued.length > 0 && (
        <div className="gold-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <span style={{ ...MONO, fontSize: 9, color: 'rgba(201,168,76,0.48)', letterSpacing: '0.14em' }}>
              PORTFOLIO VALUE · {range}
            </span>
            {cLoading && <Loader2 size={9} className="animate-spin" style={{ color: GOLD }} />}
          </div>
          <EquityCurveChart
            key={range + acct.label + heldKey}
            data={ecData}
            range={range}
            loading={cLoading && !ecData.length}
            hoverIdx={hoverIdx}
            onHover={setHoverIdx}
          />
        </div>
      )}

      {/* Position card rows */}
      {rowsWithAlloc.length > 0 && (
        <div>
          <div style={{ ...MONO, fontSize: 9, color: 'rgba(201,168,76,0.4)', letterSpacing: '0.14em', marginBottom: 10 }}>
            POSITIONS · {valued.length} HELD · {acct.label.toUpperCase()}
          </div>
          {rowsWithAlloc.map((row, i) => (
            <PositionCard key={row.ticker} row={row} delay={`${i * 0.04}s`} />
          ))}
        </div>
      )}

      {/* Collapsible edit panel */}
      <div className="gold-card overflow-visible">
        <button onClick={() => setEditOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5 transition-colors rounded-xl"
          style={{ background: 'transparent' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(201,168,76,0.04)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <div className="flex items-center gap-2">
            <Briefcase size={12} style={{ color: 'rgba(255,255,255,0.38)' }} />
            <span style={{ ...MONO, color: 'rgba(255,255,255,0.52)', letterSpacing: '0.08em', fontSize: 11 }}>EDIT POSITIONS</span>
          </div>
          {editOpen
            ? <ChevronUp size={13} style={{ color: 'rgba(255,255,255,0.26)' }} />
            : <ChevronDown size={13} style={{ color: 'rgba(255,255,255,0.26)' }} />}
        </button>

        {editOpen && (
          <div className="px-4 pb-4 pt-3" style={{ borderTop: '1px solid rgba(201,168,76,0.08)' }}>
            <div className="flex items-center justify-between mb-3">
              <p style={{ ...SANS, color: 'rgba(255,255,255,0.42)', fontSize: 12 }} className="leading-relaxed">
                Enter what {acct.label} actually holds. All six agents read these live.
              </p>
              <button onClick={handleSave} disabled={saving}
                style={{ ...MONO, background: saved ? 'rgba(201,168,76,0.14)' : 'rgba(201,168,76,0.07)', border: `1px solid ${saved ? 'rgba(201,168,76,0.48)' : 'rgba(201,168,76,0.22)'}`, color: saved ? GOLD : 'rgba(201,168,76,0.58)', fontSize: 11 }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all hover:brightness-110 disabled:opacity-50 ml-4 shrink-0">
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
                  <div key={t} className="rounded-xl overflow-hidden" style={{ background: '#1a1a1a', border: '1px solid rgba(201,168,76,0.09)' }}>
                    {bookPct > 0 && (
                      <div style={{ height: 2, background: 'rgba(201,168,76,0.06)' }}>
                        <div style={{ height: '100%', width: `${Math.min(bookPct, 100)}%`, background: isHeavy ? GOLD : 'rgba(201,168,76,0.4)', transition: 'width 0.5s ease' }} />
                      </div>
                    )}
                    <div className="p-2.5 flex items-center gap-2">
                      <span style={{ ...MONO, fontWeight: 700, fontSize: 13, color: '#f0f0f0' }} className="w-14 pl-1 shrink-0">{t}</span>
                      <input value={p.shares || ''} onChange={e => setPos(t, 'shares', e.target.value.replace(/[^0-9.]/g, ''))}
                        inputMode="decimal" placeholder="shares"
                        style={{ ...MONO, background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)', color: '#f0f0f0', fontSize: 12 }}
                        className="flex-1 min-w-0 border rounded-lg px-2.5 py-2 outline-none transition-colors"
                        onFocus={e => e.target.style.borderColor = 'rgba(201,168,76,0.35)'}
                        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'} />
                      <div className="relative flex-1 min-w-0">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 text-sm" style={MONO}>$</span>
                        <input value={p.cost || ''} onChange={e => setPos(t, 'cost', e.target.value.replace(/[^0-9.]/g, ''))}
                          inputMode="decimal" placeholder="avg"
                          style={{ ...MONO, background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)', color: '#f0f0f0', fontSize: 12 }}
                          className="w-full border rounded-lg pl-6 pr-2 py-2 outline-none transition-colors"
                          onFocus={e => e.target.style.borderColor = 'rgba(201,168,76,0.35)'}
                          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'} />
                      </div>
                      <button onClick={() => removeTicker(t)}
                        className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg transition-colors"
                        style={{ color: 'rgba(255,255,255,0.26)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#c0392b'; e.currentTarget.style.background = 'rgba(192,57,43,0.08)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.26)'; e.currentTarget.style.background = 'transparent'; }}>
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <Plus size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.22)' }} />
                <input value={newTicker} onChange={e => setNewTicker(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="add ticker (e.g. OKLO)"
                  style={{ ...MONO, letterSpacing: '0.1em', background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)', color: '#f0f0f0', fontSize: 12 }}
                  className="w-full border rounded-lg pl-9 pr-3 py-2.5 uppercase outline-none transition-colors"
                  onFocus={e => e.target.style.borderColor = 'rgba(201,168,76,0.35)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'} />
              </div>
              <button onClick={handleAdd} disabled={!newTicker.trim()}
                style={{ ...MONO, background: newTicker.trim() ? GOLD : 'rgba(201,168,76,0.2)', color: '#0a0800', letterSpacing: '0.10em', fontWeight: 600, fontSize: 12 }}
                className="px-4 py-2.5 rounded-lg transition-all hover:brightness-110 disabled:cursor-not-allowed">ADD</button>
            </div>

            <div className="mt-3 rounded-xl p-3 flex items-start gap-2.5"
              style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.16)' }}>
              <Check size={13} style={{ color: GOLD }} className="mt-0.5 shrink-0" />
              <p style={{ ...SANS, color: 'rgba(255,255,255,0.58)', fontSize: 12 }} className="leading-relaxed">
                Council sees: <span style={{ color: 'rgba(255,255,255,0.82)' }}>{positionsLine || 'no positions yet'}</span>
              </p>
            </div>
            <p style={{ ...MONO, color: 'rgba(255,255,255,0.22)', fontSize: 10 }} className="mt-2">
              Auto-syncs to cloud. Same on all devices.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
