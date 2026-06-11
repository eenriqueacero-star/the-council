import React, { useState, useEffect } from 'react';
import {
  Briefcase, Check, X, Plus, RefreshCw, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { MONO, DISP, SANS } from '../constants/styles.js';
import { getQuotes, getCandles } from '../api.js';

const GOLD = '#c9a84c';
const RED  = '#c0392b';
const RANGES = ['1W', '1M', '3M', '1Y', 'All'];
const ACCT_KEYS = ['edwin', 'dad', 'bro'];
const ACCOUNT_COLORS = { edwin: '#c9a84c', dad: '#60a5fa', bro: '#a78bfa' };

// ─── Formatters ─────────────────────────────────────────────────────────────
function fmt(n)    { return isNaN(n) || n == null ? '—' : Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtPct(n) { if (isNaN(n) || n == null) return '—'; return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }
function fmtPnl(n) { if (isNaN(n) || n == null) return '—'; return (n >= 0 ? '+$' : '-$') + fmt(n); }
function fmtTime(d){ return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }
function fmtK(n) {
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

// ─── Market session ──────────────────────────────────────────────────────────
function getMarketSession() {
  try {
    const et  = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dow = et.getDay();
    const tod = et.getHours() * 60 + et.getMinutes();
    if (dow === 0 || dow === 6) return 'overnight';
    if (tod >= 570 && tod < 960)  return 'market';
    if (tod >= 240 && tod < 570)  return 'premarket';
    if (tod >= 960 && tod < 1200) return 'afterhours';
    return 'overnight';
  } catch { return 'market'; }
}
const SESSION_INFO = {
  premarket:  { label: 'PRE-MARKET',  emoji: '🌅',   color: 'rgba(232,201,122,0.75)' },
  afterhours: { label: 'AFTER-HOURS', emoji: '🌆',   color: 'rgba(125,184,232,0.70)' },
  overnight:  { label: 'OVERNIGHT',   emoji: '🌙☁️', color: 'rgba(125,184,232,0.55)' },
};

// ─── Counter animation ───────────────────────────────────────────────────────
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

// ─── Equity curve computation ────────────────────────────────────────────────
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

function computeCombinedCurve(curves) {
  const allTs = [...new Set(curves.flatMap(c => c.map(p => p.t)))].sort((a, b) => a - b);
  if (!allTs.length) return [];
  return allTs.map(t => {
    const total = curves.reduce((sum, curve) => {
      let val = 0;
      for (const pt of curve) {
        if (pt.t <= t) val = pt.v; else break;
      }
      return sum + val;
    }, 0);
    return { t, v: total };
  });
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

// ─── Single-account equity chart ─────────────────────────────────────────────
function EquityCurveChart({ data, range, loading, hoverIdx, onHover }) {
  const [animated, setAnimated] = useState(true);
  useEffect(() => {
    setAnimated(true);
    const t = setTimeout(() => setAnimated(false), 1500);
    return () => clearTimeout(t);
  }, []);

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
  const toX  = i => PL + (i / (data.length - 1)) * cW;
  const toY  = v => PT + cH - ((v - vMin) / vR) * cH;
  const pairs = data.map((d, i) => [toX(i), toY(d.v)]);
  const ptLine = pairs.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const pathLen = calcPathLen(pairs);
  const lineClr = data[data.length - 1].v >= data[0].v ? GOLD : RED;
  const areaD = `M${PL},${(PT + cH).toFixed(1)} L${pairs.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')} L${(PL + cW).toFixed(1)},${(PT + cH).toFixed(1)} Z`;
  const n = data.length;
  const xIdxs = n > 3 ? [0, Math.floor(n / 3), Math.floor(2 * n / 3), n - 1] : [0, n - 1];
  const yVals  = [vMin + vR * 0.12, vMin + vR * 0.5, vMin + vR * 0.88];
  const lineStyle = animated ? { strokeDasharray: pathLen, strokeDashoffset: pathLen, animation: 'drawIn 1.2s cubic-bezier(.4,0,.2,1) forwards' } : {};
  const hX = hoverIdx != null ? toX(hoverIdx) : null;
  const hY = hoverIdx != null ? toY(data[hoverIdx].v) : null;

  function handleMove(clientX, svgEl) {
    const rect = svgEl.getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width * W;
    onHover?.(Math.max(0, Math.min(n - 1, Math.round((relX - PL) / cW * (n - 1)))));
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none"
      style={{ overflow: 'visible', touchAction: 'none', cursor: 'crosshair' }}
      onMouseMove={e => handleMove(e.clientX, e.currentTarget)}
      onMouseLeave={() => onHover?.(null)}
      onTouchMove={e => { e.preventDefault(); handleMove(e.touches[0].clientX, e.currentTarget); }}
      onTouchEnd={() => onHover?.(null)}>
      <defs>
        <linearGradient id="ecGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={lineClr} stopOpacity="0.24" />
          <stop offset="100%" stopColor={lineClr} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={PL} y1={PT + cH * f} x2={W - PR} y2={PT + cH * f} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
      ))}
      {yVals.map((v, i) => (
        <text key={i} x={PL - 5} y={toY(v) + 3} textAnchor="end" fill="rgba(255,255,255,0.22)"
          style={{ fontSize: '9px', fontFamily: "'JetBrains Mono', monospace" }}>{fmtK(v)}</text>
      ))}
      <path d={areaD} fill="url(#ecGrad)" />
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
          <line x1={hX} y1={PT} x2={hX} y2={PT + cH} stroke="rgba(201,168,76,0.35)" strokeWidth="1" strokeDasharray="3,3" />
          <circle cx={hX} cy={hY} r="5.5" fill={lineClr} stroke="#080808" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}

// ─── Multi-account (combined) equity chart ───────────────────────────────────
function MultiEquityCurveChart({ series, range, loading, hoverIdx, onHover }) {
  const [animated, setAnimated] = useState(true);
  useEffect(() => {
    setAnimated(true);
    const t = setTimeout(() => setAnimated(false), 1500);
    return () => clearTimeout(t);
  }, []);

  if (loading) return <div className="skel" style={{ height: 170, borderRadius: 8 }} />;

  const hasData = series.some(s => s.data?.length >= 2);
  if (!hasData) return (
    <div style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center',
      ...MONO, color: 'rgba(255,255,255,0.18)', fontSize: 11 }}>
      No historical data · add shares to any account or try a wider range
    </div>
  );

  const W = 560, H = 170, PL = 56, PR = 8, PT = 8, PB = 26;
  const cW = W - PL - PR, cH = H - PT - PB;

  const allVals = series.flatMap(s => (s.data || []).map(d => d.v));
  const allTs   = [...new Set(series.flatMap(s => (s.data || []).map(d => d.t)))].sort((a, b) => a - b);

  if (!allTs.length || !allVals.length) return null;

  const minV = Math.min(...allVals), maxV = Math.max(...allVals);
  const pad  = (maxV - minV) * 0.12 || maxV * 0.06;
  const vMin = minV - pad, vMax = maxV + pad;
  const vR   = vMax - vMin;
  const tsMin = allTs[0], tsMax = allTs[allTs.length - 1];
  const toX   = ts => PL + ((ts - tsMin) / (tsMax - tsMin || 1)) * cW;
  const toY   = v  => PT + cH - ((v - vMin) / (vR || 1)) * cH;

  function handleMove(clientX, svgEl) {
    const rect   = svgEl.getBoundingClientRect();
    const relX   = (clientX - rect.left) / rect.width * W;
    const ratio  = Math.max(0, Math.min(1, (relX - PL) / cW));
    const tsTarget = tsMin + ratio * (tsMax - tsMin);
    let closest = 0;
    for (let i = 1; i < allTs.length; i++) {
      if (Math.abs(allTs[i] - tsTarget) < Math.abs(allTs[closest] - tsTarget)) closest = i;
    }
    onHover?.(closest);
  }

  const hoverTs = hoverIdx != null ? allTs[hoverIdx] : null;
  const n = allTs.length;
  const xIdxs = n > 3 ? [0, Math.floor(n/3), Math.floor(2*n/3), n-1] : [0, n-1];
  const yVals  = [vMin + vR * 0.12, vMin + vR * 0.5, vMin + vR * 0.88];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none"
      style={{ overflow: 'visible', touchAction: 'none', cursor: 'crosshair' }}
      onMouseMove={e => handleMove(e.clientX, e.currentTarget)}
      onMouseLeave={() => onHover?.(null)}
      onTouchMove={e => { e.preventDefault(); handleMove(e.touches[0].clientX, e.currentTarget); }}
      onTouchEnd={() => onHover?.(null)}>

      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={PL} y1={PT + cH * f} x2={W - PR} y2={PT + cH * f}
          stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
      ))}
      {yVals.map((v, i) => (
        <text key={i} x={PL - 5} y={toY(v) + 3} textAnchor="end" fill="rgba(255,255,255,0.22)"
          style={{ fontSize: '9px', fontFamily: "'JetBrains Mono', monospace" }}>{fmtK(v)}</text>
      ))}

      {series.map((s, si) => {
        if (!s.data?.length || s.data.length < 2) return null;
        const pairs   = s.data.map(d => [toX(d.t), toY(d.v)]);
        const ptLine  = pairs.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
        const pathLen = calcPathLen(pairs);
        const lineStyle = animated ? {
          strokeDasharray: pathLen, strokeDashoffset: pathLen,
          animation: `drawIn ${1.0 + si * 0.2}s cubic-bezier(.4,0,.2,1) forwards`,
        } : {};
        return (
          <polyline key={s.key} points={ptLine} fill="none" stroke={s.color} strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" style={lineStyle} />
        );
      })}

      {xIdxs.map((i, li) => allTs[i] ? (
        <text key={i} x={toX(allTs[i])} y={H - 4}
          textAnchor={li === 0 ? 'start' : li === xIdxs.length - 1 ? 'end' : 'middle'}
          fill="rgba(255,255,255,0.22)"
          style={{ fontSize: '9px', fontFamily: "'JetBrains Mono', monospace" }}>
          {fmtX(allTs[i], range)}
        </text>
      ) : null)}

      {hoverTs != null && (
        <>
          <line x1={toX(hoverTs)} y1={PT} x2={toX(hoverTs)} y2={PT + cH}
            stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="3,3" />
          {series.map(s => {
            if (!s.data?.length) return null;
            let closest = s.data[0];
            for (const p of s.data) {
              if (Math.abs(p.t - hoverTs) < Math.abs(closest.t - hoverTs)) closest = p;
            }
            return <circle key={s.key} cx={toX(closest.t)} cy={toY(closest.v)} r="4" fill={s.color} stroke="#080808" strokeWidth="2" />;
          })}
        </>
      )}
    </svg>
  );
}

// ─── Position card ────────────────────────────────────────────────────────────
function PositionCard({ row, delay, accentColor }) {
  const [expanded, setExpanded] = useState(false);
  if (!row.shares && !row.mktVal) return null;
  const clr = accentColor || (row.pnlAmt != null ? (row.pnlAmt >= 0 ? GOLD : RED) : GOLD);

  return (
    <div className="gold-card" style={{ marginBottom: 8, cursor: 'pointer', animation: `staggerIn 0.3s ease both`, animationDelay: delay,
      ...(accentColor ? { borderLeft: `2px solid ${accentColor}33` } : {}) }}
      onClick={() => setExpanded(v => !v)}>
      {row.allocPct > 0 && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(201,168,76,0.06)' }}>
          <div style={{ height: '100%', width: `${Math.min(row.allocPct, 100)}%`, background: row.allocPct > 25 ? clr : `${clr}66`, borderRadius: '0 0 2px 2px', transition: 'width 0.5s ease' }} />
        </div>
      )}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ ...MONO, fontWeight: 700, fontSize: 13, minWidth: 56, color: '#f0f0f0' }}>{row.ticker}</span>
        <span style={{ ...MONO, color: 'rgba(255,255,255,0.38)', fontSize: 11 }}>{row.price ? `$${fmt(row.price)}` : '—'}</span>
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
              { label: 'SHARES',    val: row.shares || '—',                              col: '#f0f0f0' },
              { label: 'AVG COST',  val: row.cost   ? `$${fmt(row.cost)}`    : '—',      col: '#f0f0f0' },
              { label: 'MKT VALUE', val: row.mktVal > 0 ? `$${fmt(row.mktVal)}` : '—',  col: '#f0f0f0' },
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function PositionsTab({ account, allAccounts, positions, setPos, addTicker, removeTicker, positionsLine }) {
  const isAll = account === 'all';
  const acct  = allAccounts[account] || allAccounts.edwin;

  const [range,     setRange]     = useState('1M');
  const [quotes,    setQuotes]    = useState({});
  const [candles,   setCandles]   = useState({});
  const [qLoading,  setQL]        = useState(false);
  const [cLoading,  setCL]        = useState(false);
  const [lastUpdated, setLU]      = useState(null);
  const [flash,     setFlash]     = useState(false);
  const [editOpen,  setEditOpen]  = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [newTickers,setNewTickers]= useState({ edwin: '', dad: '', bro: '' });
  const [hoverIdx,  setHoverIdx]  = useState(null);
  const [session,   setSession]   = useState(() => getMarketSession());

  useEffect(() => { const id = setInterval(() => setSession(getMarketSession()), 30000); return () => clearInterval(id); }, []);

  // Reset inputs on account switch
  useEffect(() => { setNewTicker(''); setNewTickers({ edwin: '', dad: '', bro: '' }); setHoverIdx(null); }, [account]);

  // Tickers to fetch: union across all held positions for both modes
  const heldTickers = isAll
    ? [...new Set(ACCT_KEYS.flatMap(k =>
        Object.entries(positions[k] || {}).filter(([, p]) => parseFloat(p.shares) > 0).map(([t]) => t)
      ))]
    : Object.entries(positions[account] || {}).filter(([, p]) => parseFloat(p.shares) > 0).map(([t]) => t);
  const heldKey = heldTickers.join(',');

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
    doRefresh(heldTickers, range);
  }, [account, range, heldKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!heldTickers.length) return;
    const id = setInterval(() => doRefresh(heldTickers, range), 60000);
    return () => clearInterval(id);
  }, [account, range, heldKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Single-account row + totals ──
  const posMap = isAll ? {} : (positions[account] || {});
  const rows = isAll ? [] : Object.entries(posMap).map(([t, p]) => {
    const shares = parseFloat(p.shares) || 0;
    const cost   = parseFloat(p.cost)   || 0;
    const q      = quotes[t] || {};
    const price  = q.price > 0 ? q.price : (q.prevClose || 0);
    const mktVal = shares * price;
    const basis  = shares * cost;
    const pnlAmt = (price && cost) ? mktVal - basis : null;
    const pnlPct = (price && cost) ? ((price - cost) / cost) * 100 : null;
    return { ticker: t, shares, cost, price, mktVal, basis, pnlAmt, pnlPct, dayPct: q.changePct ?? null };
  });
  const valued     = rows.filter(r => r.mktVal > 0);
  const totalVal   = valued.reduce((s, r) => s + r.mktVal, 0);
  const totalBasis = valued.reduce((s, r) => s + r.basis, 0);
  const totalPnl   = totalVal - totalBasis;
  const totalPnlPct = totalBasis > 0 ? (totalPnl / totalBasis) * 100 : null;
  const dayChgDollar = valued.reduce((s, r) => {
    if (r.dayPct == null || !r.price || !r.shares) return s;
    return s + r.shares * r.price * r.dayPct / (100 + r.dayPct);
  }, 0);
  const dayChgPct = totalVal > 0 ? (dayChgDollar / (totalVal - dayChgDollar)) * 100 : null;
  const rowsWithAlloc = rows.map(r => ({ ...r, allocPct: totalVal > 0 && r.mktVal > 0 ? (r.mktVal / totalVal) * 100 : 0 }));

  // ── All-accounts row + totals ──
  const accountGroups = isAll ? ACCT_KEYS.map(k => {
    const pm = positions[k] || {};
    const acctRows = Object.entries(pm).map(([t, p]) => {
      const shares = parseFloat(p.shares) || 0;
      const cost   = parseFloat(p.cost)   || 0;
      const q      = quotes[t] || {};
      const price  = q.price > 0 ? q.price : (q.prevClose || 0);
      const mktVal = shares * price;
      const basis  = shares * cost;
      const pnlAmt = (price && cost) ? mktVal - basis : null;
      const pnlPct = (price && cost) ? ((price - cost) / cost) * 100 : null;
      return { ticker: t, shares, cost, price, mktVal, basis, pnlAmt, pnlPct, dayPct: q.changePct ?? null };
    }).filter(r => r.mktVal > 0);
    const total = acctRows.reduce((s, r) => s + r.mktVal, 0);
    const basis = acctRows.reduce((s, r) => s + r.basis, 0);
    const dayChg = acctRows.reduce((s, r) => {
      if (r.dayPct == null || !r.price || !r.shares) return s;
      return s + r.shares * r.price * r.dayPct / (100 + r.dayPct);
    }, 0);
    return { key: k, label: allAccounts[k]?.label || k, color: ACCOUNT_COLORS[k], rows: acctRows, total, basis, dayChg };
  }) : [];

  const combinedTotal    = isAll ? accountGroups.reduce((s, g) => s + g.total, 0) : 0;
  const combinedDayChg   = isAll ? accountGroups.reduce((s, g) => s + g.dayChg, 0) : 0;
  const combinedBasis    = isAll ? accountGroups.reduce((s, g) => s + g.basis, 0) : 0;
  const combinedPnl      = combinedTotal - combinedBasis;
  const combinedDayChgPct = combinedTotal > 0 ? (combinedDayChg / (combinedTotal - combinedDayChg)) * 100 : null;

  // ── Equity curves ──
  const ecData = !isAll ? computeEquityCurve(candles, posMap) : null;
  const multiSeries = isAll ? ACCT_KEYS.map(k => ({
    key: k, label: allAccounts[k]?.label || k, color: ACCOUNT_COLORS[k],
    data: computeEquityCurve(candles, positions[k] || {}),
  })) : null;
  const combinedCurve = isAll ? computeCombinedCurve((multiSeries || []).map(s => s.data)) : null;

  // ── Display values + hover ──
  const displayVal   = useCounter(isAll ? combinedTotal : totalVal, 900);
  const hoverPt      = hoverIdx != null
    ? (isAll ? combinedCurve?.[hoverIdx] : ecData?.[hoverIdx]) ?? null
    : null;
  const isHovering   = hoverPt != null;
  const rangeStart   = isAll
    ? (combinedCurve?.length > 0 ? combinedCurve[0].v : null)
    : (ecData?.length > 0 ? ecData[0].v : null);
  const heroVal      = isHovering ? hoverPt.v : displayVal;
  const heroGainAmt  = isHovering && rangeStart != null ? hoverPt.v - rangeStart : (isAll ? combinedPnl : totalPnl);
  const heroGainPct  = isHovering && rangeStart > 0
    ? (hoverPt.v - rangeStart) / rangeStart * 100
    : (isAll ? (combinedBasis > 0 ? combinedPnl / combinedBasis * 100 : null) : totalPnlPct);
  const heroTopLabel = isHovering
    ? fmtHoverDate(hoverPt.t)
    : isAll ? 'ALL ACCOUNTS · COMBINED VALUE' : `${acct.label.toUpperCase()} · PORTFOLIO VALUE`;
  const heroGainLabel = isHovering ? `from ${range} start` : 'all-time';

  const heroHasValue = isAll ? combinedTotal > 0 : valued.length > 0;
  const isLoading = qLoading || cLoading;
  const curDayChg = isAll ? combinedDayChg : dayChgDollar;
  const curDayChgPct = isAll ? combinedDayChgPct : dayChgPct;

  function handleRangeChange(r) { setRange(r); setHoverIdx(null); }

  function handleAdd(key) {
    const t = (key ? newTickers[key] : newTicker).trim().toUpperCase();
    if (!t) return;
    addTicker(key || account, t);
    if (key) setNewTickers(prev => ({ ...prev, [key]: '' }));
    else setNewTicker('');
  }

  // ── Edit panel for a single account ──
  function EditSection({ acctKey }) {
    const pm = positions[acctKey] || {};
    const tickers = Object.keys(pm);
    const acctInfo = allAccounts[acctKey];
    const nt = isAll ? newTickers[acctKey] : newTicker;
    const setNt = v => isAll ? setNewTickers(prev => ({ ...prev, [acctKey]: v })) : setNewTicker(v);

    return (
      <div style={isAll ? { marginBottom: 20 } : {}}>
        {isAll && (
          <div className="flex items-center gap-2 mb-3">
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: ACCOUNT_COLORS[acctKey], flexShrink: 0 }} />
            <span style={{ ...MONO, fontSize: 10, color: ACCOUNT_COLORS[acctKey], letterSpacing: '0.12em', fontWeight: 600 }}>
              {acctInfo?.label?.toUpperCase()} · {acctInfo?.sub}
            </span>
          </div>
        )}

        <div className="space-y-2">
          {tickers.map(t => {
            const p = pm[t] || {};
            const q = quotes[t] || {};
            const price  = q.price > 0 ? q.price : 0;
            const mktVal = (parseFloat(p.shares) || 0) * price;
            const baseTotal = isAll
              ? accountGroups.find(g => g.key === acctKey)?.total || 0
              : totalVal;
            const bookPct = baseTotal > 0 && mktVal > 0 ? (mktVal / baseTotal) * 100 : 0;
            return (
              <div key={t} className="rounded-xl overflow-hidden" style={{ background: '#1a1a1a', border: '1px solid rgba(201,168,76,0.09)' }}>
                {bookPct > 0 && (
                  <div style={{ height: 2, background: 'rgba(201,168,76,0.06)' }}>
                    <div style={{ height: '100%', width: `${Math.min(bookPct, 100)}%`, background: bookPct > 25 ? ACCOUNT_COLORS[acctKey] : `${ACCOUNT_COLORS[acctKey]}88`, transition: 'width 0.5s ease' }} />
                  </div>
                )}
                <div className="p-2.5 flex items-center gap-2">
                  <span style={{ ...MONO, fontWeight: 700, fontSize: 13, color: '#f0f0f0' }} className="w-14 pl-1 shrink-0">{t}</span>
                  <input value={p.shares || ''} onChange={e => setPos(acctKey, t, 'shares', e.target.value.replace(/[^0-9.]/g, ''))}
                    inputMode="decimal" placeholder="shares"
                    style={{ ...MONO, background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)', color: '#f0f0f0', fontSize: 12 }}
                    className="flex-1 min-w-0 border rounded-lg px-2.5 py-2 outline-none transition-colors"
                    onFocus={e => e.target.style.borderColor = 'rgba(201,168,76,0.35)'}
                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'} />
                  <div className="relative flex-1 min-w-0">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 text-sm" style={MONO}>$</span>
                    <input value={p.cost || ''} onChange={e => setPos(acctKey, t, 'cost', e.target.value.replace(/[^0-9.]/g, ''))}
                      inputMode="decimal" placeholder="avg"
                      style={{ ...MONO, background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)', color: '#f0f0f0', fontSize: 12 }}
                      className="w-full border rounded-lg pl-6 pr-2 py-2 outline-none transition-colors"
                      onFocus={e => e.target.style.borderColor = 'rgba(201,168,76,0.35)'}
                      onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'} />
                  </div>
                  <button onClick={() => removeTicker(acctKey, t)}
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

        <div className="mt-2 flex gap-2">
          <div className="relative flex-1">
            <Plus size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.22)' }} />
            <input value={nt} onChange={e => setNt(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleAdd(isAll ? acctKey : null)}
              placeholder="add ticker"
              style={{ ...MONO, letterSpacing: '0.1em', background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)', color: '#f0f0f0', fontSize: 12 }}
              className="w-full border rounded-lg pl-9 pr-3 py-2.5 uppercase outline-none transition-colors"
              onFocus={e => e.target.style.borderColor = `${ACCOUNT_COLORS[acctKey]}88`}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'} />
          </div>
          <button onClick={() => handleAdd(isAll ? acctKey : null)} disabled={!nt.trim()}
            style={{ ...MONO, background: nt.trim() ? ACCOUNT_COLORS[acctKey] : `${ACCOUNT_COLORS[acctKey]}33`, color: '#0a0800', letterSpacing: '0.10em', fontWeight: 600, fontSize: 12 }}
            className="px-4 py-2.5 rounded-lg transition-all hover:brightness-110 disabled:cursor-not-allowed">ADD</button>
        </div>

        {isAll && <div style={{ height: 1, background: 'rgba(201,168,76,0.07)', marginTop: 16 }} />}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">

      {/* ── Hero card ── */}
      {heroHasValue ? (
        <div className="gold-card p-6" style={{ animation: 'cardIn .5s ease both' }}>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div style={{ ...MONO, fontSize: 9, letterSpacing: '0.14em', marginBottom: 10,
                color: isHovering ? 'rgba(255,255,255,0.38)' : 'rgba(201,168,76,0.48)', transition: 'color 0.15s' }}>
                {heroTopLabel}
              </div>
              <div style={{ ...DISP, fontSize: 44, fontWeight: 900, color: '#f0f0f0', lineHeight: 1, letterSpacing: '-0.02em' }}>
                ${Math.round(heroVal).toLocaleString('en-US')}
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

              {/* Per-account subtotals (All mode) */}
              {isAll && !isHovering && (
                <div className="flex flex-wrap gap-3 mt-3">
                  {accountGroups.filter(g => g.total > 0).map(g => (
                    <div key={g.key} className="flex items-center gap-1.5">
                      <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: g.color }} />
                      <span style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.42)' }}>{g.label}</span>
                      <span style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>{fmtK(g.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ ...MONO, fontSize: 9, letterSpacing: '0.12em', marginBottom: 6,
                color: session !== 'market' && SESSION_INFO[session] ? SESSION_INFO[session].color : 'rgba(255,255,255,0.28)' }}>
                {session !== 'market' && SESSION_INFO[session] ? SESSION_INFO[session].label : 'TODAY'}
              </div>
              <div style={{ ...MONO, fontSize: 20, fontWeight: 700, color: curDayChg >= 0 ? GOLD : RED }}>
                {fmtPnl(curDayChg)}
              </div>
              {curDayChgPct != null && (
                <div style={{ ...MONO, fontSize: 11, color: curDayChg >= 0 ? GOLD : RED, opacity: 0.68, marginTop: 4 }}>
                  {fmtPct(curDayChgPct)}
                </div>
              )}
              {session !== 'market' && SESSION_INFO[session] && (
                <div className="flex items-center gap-1.5 mt-3 justify-end">
                  <span style={{ fontSize: 13 }} role="img" aria-label={SESSION_INFO[session].label}>{SESSION_INFO[session].emoji}</span>
                  <span style={{ ...MONO, color: SESSION_INFO[session].color, fontSize: 9, letterSpacing: '0.10em' }}>{SESSION_INFO[session].label}</span>
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

      {/* ── Range pills ── */}
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

      {/* ── Chart ── */}
      {heroHasValue && (
        <div className="gold-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span style={{ ...MONO, fontSize: 9, color: 'rgba(201,168,76,0.48)', letterSpacing: '0.14em' }}>
              {isAll ? 'ALL ACCOUNTS' : acct.label.toUpperCase()} · {range}
            </span>
            <div className="flex items-center gap-3">
              {isAll && (
                <div className="flex items-center gap-2.5">
                  {multiSeries?.map(s => s.data.length >= 2 && (
                    <div key={s.key} className="flex items-center gap-1">
                      <span style={{ display: 'inline-block', width: 16, height: 2, background: s.color, borderRadius: 1 }} />
                      <span style={{ ...MONO, fontSize: 8, color: 'rgba(255,255,255,0.38)' }}>{s.label}</span>
                    </div>
                  ))}
                </div>
              )}
              {cLoading && <Loader2 size={9} className="animate-spin" style={{ color: GOLD }} />}
            </div>
          </div>
          {isAll ? (
            <MultiEquityCurveChart
              key={range + 'all' + heldKey}
              series={multiSeries || []}
              range={range}
              loading={cLoading && !heldKey}
              hoverIdx={hoverIdx}
              onHover={setHoverIdx}
            />
          ) : (
            <EquityCurveChart
              key={range + account + heldKey}
              data={ecData}
              range={range}
              loading={cLoading && !ecData?.length}
              hoverIdx={hoverIdx}
              onHover={setHoverIdx}
            />
          )}
        </div>
      )}

      {/* ── Positions (single account) ── */}
      {!isAll && rowsWithAlloc.length > 0 && (
        <div>
          <div style={{ ...MONO, fontSize: 9, color: 'rgba(201,168,76,0.4)', letterSpacing: '0.14em', marginBottom: 10 }}>
            POSITIONS · {valued.length} HELD · {acct.label.toUpperCase()}
          </div>
          {rowsWithAlloc.map((row, i) => (
            <PositionCard key={row.ticker} row={row} delay={`${i * 0.04}s`} />
          ))}
        </div>
      )}

      {/* ── Positions (all accounts, grouped) ── */}
      {isAll && accountGroups.some(g => g.rows.length > 0) && (
        <div>
          {accountGroups.map(g => g.rows.length > 0 && (
            <div key={g.key} style={{ marginBottom: 20 }}>
              <div className="flex items-center gap-2 mb-3">
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: g.color }} />
                <span style={{ ...MONO, fontSize: 9, color: g.color, letterSpacing: '0.14em' }}>
                  {g.label.toUpperCase()} · {g.rows.length} HELD · {fmtK(g.total)}
                </span>
              </div>
              {g.rows.map((row, i) => {
                const allocPct = g.total > 0 ? (row.mktVal / g.total) * 100 : 0;
                return <PositionCard key={row.ticker} row={{ ...row, allocPct }} delay={`${i * 0.04}s`} accentColor={g.color} />;
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Edit panel ── */}
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
            {!isAll && (
              <p style={{ ...SANS, color: 'rgba(255,255,255,0.42)', fontSize: 12, marginBottom: 12 }} className="leading-relaxed">
                Enter what {acct.label} actually holds. All six agents read these live.
              </p>
            )}

            {isAll
              ? ACCT_KEYS.map(k => <EditSection key={k} acctKey={k} />)
              : <EditSection acctKey={account} />
            }

            <div className="mt-3 rounded-xl p-3 flex items-start gap-2.5"
              style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.16)' }}>
              <Check size={13} style={{ color: GOLD }} className="mt-0.5 shrink-0" />
              <p style={{ ...SANS, color: 'rgba(255,255,255,0.58)', fontSize: 12 }} className="leading-relaxed">
                Council sees: <span style={{ color: 'rgba(255,255,255,0.82)' }}>{positionsLine || 'no positions yet'}</span>
              </p>
            </div>
            <p style={{ ...MONO, color: 'rgba(255,255,255,0.22)', fontSize: 10 }} className="mt-2">
              Auto-saves as you type · syncs to all devices instantly
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
