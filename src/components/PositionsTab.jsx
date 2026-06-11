import React, { useState, useEffect } from 'react';
import {
  Check, X, Plus, Save, CloudUpload, RefreshCw, Loader2,
  ChevronDown, ChevronUp, ChevronRight,
} from 'lucide-react';
import { MONO, SANS, CY } from '../constants/styles.js';
import { getQuotes, getCandles } from '../api.js';

const GREEN  = '#00d395';
const RED    = '#ff4d4d';
const RANGES = ['1H', '1D', '1W', '1M', '1Y', 'All'];

function fmt(n)    { return isNaN(n) || n == null ? '—' : Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtPct(n) { if (isNaN(n) || n == null) return '—'; return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }
function fmtPnl(n) { if (isNaN(n) || n == null) return '—'; return (n >= 0 ? '+$' : '-$') + fmt(n); }
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

function EquityCurveChart({ portfolio, spy, range, loading }) {
  if (loading) {
    return <div className="skel" style={{ height: 110, borderRadius: 12, width: '100%' }} />;
  }
  if (!portfolio?.length || portfolio.length < 2) {
    return (
      <div className="flex items-center justify-center rounded-2xl" style={{ height: 110, background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ ...MONO, fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>No chart data for this range</span>
      </div>
    );
  }

  const W = 560, H = 120, PL = 36, PR = 8, PT = 8, PB = 24;
  const cW = W - PL - PR, cH = H - PT - PB;
  const allV = [...portfolio.map(d => d.v), ...spy.map(d => d.v)];
  const minV = Math.min(...allV), maxV = Math.max(...allV);
  const vR = maxV - minV || 1;
  const toX = i => PL + (i / (portfolio.length - 1)) * cW;
  const toY = v => PT + cH - ((v - minV) / vR) * cH;

  const portLine = portfolio.map((d, i) => `${toX(i).toFixed(1)},${toY(d.v).toFixed(1)}`).join(' ');
  const spyLine  = spy.length > 1 ? spy.map((d, i) => { const x = PL + (i / (spy.length - 1)) * cW; return `${x.toFixed(1)},${toY(d.v).toFixed(1)}`; }).join(' ') : null;
  const lastV = portfolio[portfolio.length - 1].v;
  const portColor = lastV >= 0 ? GREEN : RED;
  const areaD = `M ${PL},${PT + cH} L ${portfolio.map((d, i) => `${toX(i).toFixed(1)},${toY(d.v).toFixed(1)}`).join(' L ')} L ${PL + cW},${PT + cH} Z`;
  const lblIdx = portfolio.length > 4 ? [0, Math.floor(portfolio.length / 3), Math.floor(2 * portfolio.length / 3), portfolio.length - 1] : [0, portfolio.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="ecGrad2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={portColor} stopOpacity="0.28" />
          <stop offset="100%" stopColor={portColor} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {[minV, (minV + maxV) / 2, maxV].map((v, i) => (
        <line key={i} x1={PL} y1={toY(v)} x2={W - PR} y2={toY(v)} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
      ))}
      {0 >= minV && 0 <= maxV && (
        <line x1={PL} y1={toY(0)} x2={W - PR} y2={toY(0)} stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="3,4" />
      )}
      <path d={areaD} fill="url(#ecGrad2)" />
      {spyLine && <polyline points={spyLine} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" strokeDasharray="4,3" />}
      <polyline points={portLine} fill="none" stroke={portColor} strokeWidth="2" strokeLinejoin="round" />
      {lblIdx.map(i => portfolio[i] && (
        <text key={i} x={toX(i)} y={H - 3} textAnchor="middle" fill="rgba(255,255,255,0.22)" style={{ fontSize: '9px', fontFamily: "'JetBrains Mono', monospace" }}>
          {fmtX(portfolio[i].t, range)}
        </text>
      ))}
      {[minV, maxV].map((v, i) => (
        <text key={i} x={PL - 3} y={toY(v) + 3} textAnchor="end" fill="rgba(255,255,255,0.22)" style={{ fontSize: '9px', fontFamily: "'JetBrains Mono', monospace" }}>
          {v >= 0 ? '+' : ''}{v.toFixed(1)}%
        </text>
      ))}
    </svg>
  );
}

function PositionCard({ r, totalVal }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div onClick={() => setExpanded(v => !v)}
      style={{ background: '#111827', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', cursor: 'pointer', marginBottom: '8px', transition: 'border-color .15s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}>
      <div style={{ padding: '14px 16px' }}>
        {/* Top row: ticker + price */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <div>
            <span style={{ ...MONO, fontWeight: 700, fontSize: '15px', color: '#e2e8f0' }}>{r.ticker}</span>
            {r.shares > 0 && <span style={{ ...SANS, fontSize: '11px', color: 'rgba(255,255,255,0.30)', marginLeft: '6px' }}>{r.shares} sh</span>}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ ...MONO, fontWeight: 600, fontSize: '14px', color: '#e2e8f0' }}>{r.price ? `$${fmt(r.price)}` : '—'}</div>
            {r.dayPct != null && (
              <div style={{ ...MONO, fontSize: '11px', color: r.dayPct >= 0 ? GREEN : RED }}>{fmtPct(r.dayPct)}</div>
            )}
          </div>
        </div>

        {/* P&L row */}
        {r.pnlAmt != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
            <span style={{ ...MONO, fontSize: '12px', color: r.pnlAmt >= 0 ? GREEN : RED }}>{fmtPnl(r.pnlAmt)}</span>
            {r.pnlPct != null && <span style={{ ...MONO, fontSize: '11px', color: r.pnlPct >= 0 ? GREEN + 'bb' : RED + 'bb' }}>({fmtPct(r.pnlPct)})</span>}
            <span style={{ ...SANS, fontSize: '11px', color: 'rgba(255,255,255,0.28)' }}>unrealized</span>
          </div>
        )}

        {/* Portfolio weight */}
        {r.mktVal > 0 && totalVal > 0 && (
          <div style={{ marginTop: '4px', ...SANS, fontSize: '11px', color: 'rgba(255,255,255,0.28)' }}>
            ${fmt(r.mktVal)} · {((r.mktVal / totalVal) * 100).toFixed(1)}% of portfolio
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '12px 16px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {r.shares > 0 && (
              <div>
                <div style={{ ...SANS, fontSize: '10px', color: 'rgba(255,255,255,0.30)', marginBottom: '3px' }}>Shares</div>
                <div style={{ ...MONO, fontSize: '13px', color: '#e2e8f0' }}>{r.shares}</div>
              </div>
            )}
            {r.cost > 0 && (
              <div>
                <div style={{ ...SANS, fontSize: '10px', color: 'rgba(255,255,255,0.30)', marginBottom: '3px' }}>Avg Cost</div>
                <div style={{ ...MONO, fontSize: '13px', color: '#e2e8f0' }}>${fmt(r.cost)}</div>
              </div>
            )}
            {r.mktVal > 0 && (
              <div>
                <div style={{ ...SANS, fontSize: '10px', color: 'rgba(255,255,255,0.30)', marginBottom: '3px' }}>Market Value</div>
                <div style={{ ...MONO, fontSize: '13px', color: '#e2e8f0' }}>${fmt(r.mktVal)}</div>
              </div>
            )}
            {r.cost > 0 && (
              <div>
                <div style={{ ...SANS, fontSize: '10px', color: 'rgba(255,255,255,0.30)', marginBottom: '3px' }}>Break-even</div>
                <div style={{ ...MONO, fontSize: '13px', color: '#e2e8f0' }}>${fmt(r.cost)}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PositionsTab({ acct, posMap, acctHoldings, setPos, addTicker, removeTicker, positionsLine, onSave }) {
  const [range, setRange]           = useState('1D');
  const [quotes, setQuotes]         = useState({});
  const [candles, setCandles]       = useState({});
  const [qLoading, setQL]           = useState(false);
  const [cLoading, setCL]           = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [flash, setFlash]           = useState(false);
  const [editOpen, setEditOpen]     = useState(false);
  const [newTicker, setNewTicker]   = useState('');
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);

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

  const valued       = rows.filter(r => r.mktVal > 0);
  const totalVal     = valued.reduce((s, r) => s + r.mktVal, 0);
  const totalBasis   = valued.reduce((s, r) => s + r.basis, 0);
  const totalPnl     = totalVal - totalBasis;
  const totalPnlPct  = totalBasis > 0 ? (totalPnl / totalBasis) * 100 : null;
  const dayChgDollar = valued.reduce((s, r) => {
    if (r.dayPct == null || !r.price || !r.shares) return s;
    return s + r.shares * r.price * r.dayPct / (100 + r.dayPct);
  }, 0);
  const dayChgPct = totalVal > 0 ? (dayChgDollar / (totalVal - dayChgDollar)) * 100 : null;

  const { portfolio: ecPort, spy: ecSpy } = computeEquityCurve(candles, posMap);

  async function handleSave() {
    setSaving(true); setSaved(false);
    try {
      await Promise.race([onSave(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]);
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

  return (
    <div style={{ paddingTop: '16px' }}>

      {/* Hero card */}
      <div style={{ background: '#111827', borderRadius: '20px', padding: '20px 20px 16px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '16px' }}>
        {qLoading && !lastUpdated ? (
          <>
            <div className="skel" style={{ height: 36, width: '60%', marginBottom: 10 }} />
            <div className="skel" style={{ height: 18, width: '40%', marginBottom: 8 }} />
          </>
        ) : (
          <>
            <div style={{ ...SANS, fontSize: '30px', fontWeight: 700, letterSpacing: '-0.5px', color: '#e2e8f0', lineHeight: 1 }}>
              {valued.length > 0 ? `$${totalVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </div>
            {dayChgDollar !== 0 && (
              <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ ...SANS, fontSize: '14px', fontWeight: 600, color: dayChgDollar >= 0 ? GREEN : RED }}>
                  {dayChgDollar >= 0 ? '+' : ''}${Math.abs(dayChgDollar).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {dayChgPct != null && (
                  <span style={{ ...SANS, fontSize: '13px', color: dayChgDollar >= 0 ? GREEN + 'cc' : RED + 'cc' }}>
                    ({fmtPct(dayChgPct)}) today
                  </span>
                )}
              </div>
            )}
            {totalPnl !== 0 && (
              <div style={{ marginTop: '4px', ...SANS, fontSize: '12px', color: 'rgba(255,255,255,0.40)' }}>
                {fmtPnl(totalPnl)} unrealized {totalPnlPct != null && `(${fmtPct(totalPnlPct)})`}
              </div>
            )}
          </>
        )}
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...MONO, fontSize: '11px', color: 'rgba(255,255,255,0.28)' }}>
            {lastUpdated ? `as of ${fmtTime(lastUpdated)}` : 'loading…'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN }} className="blink" />
              <span style={{ ...SANS, fontSize: '11px', color: GREEN, fontWeight: 500 }}>Live</span>
            </div>
            <button onClick={() => doRefresh(heldTickers, range)} disabled={isLoading}
              style={{ color: 'rgba(255,255,255,0.30)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'color .15s' }}
              className="disabled:opacity-40">
              {isLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            </button>
          </div>
        </div>
      </div>

      {/* Range pills */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {RANGES.map(r => (
          <button key={r} onClick={() => setRange(r)}
            style={{
              ...MONO,
              fontSize: '11px', padding: '5px 12px', borderRadius: '999px', cursor: 'pointer',
              background: range === r ? GREEN + '18' : 'transparent',
              border: `1px solid ${range === r ? GREEN + '50' : 'rgba(255,255,255,0.10)'}`,
              color: range === r ? GREEN : 'rgba(255,255,255,0.40)',
              transition: 'all .15s',
            }}>
            {r}
          </button>
        ))}
      </div>

      {/* Equity curve */}
      <div style={{ background: '#111827', borderRadius: '16px', padding: '14px 16px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ ...MONO, fontSize: '10px', color: 'rgba(255,255,255,0.30)', letterSpacing: '0.06em' }}>EQUITY CURVE · {range}</span>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ ...MONO, fontSize: '9px', color: ecPort.length ? (ecPort[ecPort.length - 1]?.v >= 0 ? GREEN : RED) : 'rgba(255,255,255,0.25)' }}>PORTFOLIO</span>
            <span style={{ ...MONO, fontSize: '9px', color: 'rgba(255,255,255,0.22)' }}>-- SPY</span>
          </div>
        </div>
        <EquityCurveChart portfolio={ecPort} spy={ecSpy} range={range} loading={cLoading && !ecPort.length} />
      </div>

      {/* Position cards */}
      {rows.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ ...SANS, fontSize: '12px', color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>
              {valued.length} position{valued.length !== 1 ? 's' : ''}
            </span>
            {flash && <span style={{ ...MONO, fontSize: '10px', color: GREEN }}>● updated</span>}
          </div>
          {rows
            .sort((a, b) => b.mktVal - a.mktVal)
            .map(r => <PositionCard key={r.ticker} r={r} totalVal={totalVal} />)
          }
        </div>
      )}

      {/* Collapsible edit */}
      <div style={{ borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)', marginBottom: '8px' }}>
        <button onClick={() => setEditOpen(v => !v)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'rgba(255,255,255,0.02)', cursor: 'pointer', border: 'none', color: 'inherit', transition: 'background .15s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}>
          <span style={{ ...SANS, fontSize: '13px', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>Edit Positions</span>
          {editOpen
            ? <ChevronUp size={14} style={{ color: 'rgba(255,255,255,0.28)' }} />
            : <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.28)' }} />}
        </button>

        {editOpen && (
          <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', background: '#111827' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <p style={{ ...SANS, fontSize: '12px', color: 'rgba(255,255,255,0.45)', margin: 0 }}>
                Enter what {acct.label} holds. Agents read these live.
              </p>
              <button onClick={handleSave} disabled={saving}
                style={{ ...SANS, fontSize: '11px', fontWeight: 600, padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', flexShrink: 0, marginLeft: '12px', transition: 'all .15s',
                  background: saved ? GREEN + '20' : GREEN + '12',
                  border: `1px solid ${saved ? GREEN : GREEN + '40'}`,
                  color: saved ? GREEN : GREEN + 'cc',
                }}
                className="flex items-center gap-1.5 disabled:opacity-50">
                {saved ? <Check size={12} /> : saving ? <CloudUpload size={12} className="animate-pulse" /> : <Save size={12} />}
                {saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {acctHoldings.map(t => {
                const p = posMap[t] || {};
                const q = quotes[t] || {};
                const price = q.price > 0 ? q.price : 0;
                const mktVal = (parseFloat(p.shares) || 0) * price;
                const bookPct = totalVal > 0 && mktVal > 0 ? (mktVal / totalVal) * 100 : 0;
                return (
                  <div key={t} style={{ background: '#0d1424', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    {bookPct > 0 && (
                      <div style={{ height: '2px', background: 'rgba(255,255,255,0.04)' }}>
                        <div style={{ height: '100%', width: `${Math.min(bookPct, 100)}%`, background: bookPct > 25 ? CY : GREEN, transition: 'width .5s' }} />
                      </div>
                    )}
                    <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ ...MONO, fontWeight: 700, fontSize: '13px', width: '54px', flexShrink: 0 }}>{t}</span>
                      <input value={p.shares || ''} onChange={e => setPos(t, 'shares', e.target.value.replace(/[^0-9.]/g, ''))}
                        inputMode="decimal" placeholder="shares"
                        style={{ flex: 1, minWidth: 0, ...MONO, fontSize: '13px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '7px', padding: '7px 10px', color: '#e2e8f0', outline: 'none', transition: 'border-color .15s' }}
                        onFocus={e => e.target.style.borderColor = GREEN + '55'}
                        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
                      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', ...MONO, fontSize: '13px', color: 'rgba(255,255,255,0.30)' }}>$</span>
                        <input value={p.cost || ''} onChange={e => setPos(t, 'cost', e.target.value.replace(/[^0-9.]/g, ''))}
                          inputMode="decimal" placeholder="avg"
                          style={{ width: '100%', ...MONO, fontSize: '13px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '7px', paddingLeft: '22px', paddingRight: '8px', paddingTop: '7px', paddingBottom: '7px', color: '#e2e8f0', outline: 'none', transition: 'border-color .15s' }}
                          onFocus={e => e.target.style.borderColor = GREEN + '55'}
                          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
                      </div>
                      <button onClick={() => removeTicker(t)}
                        style={{ width: '28px', height: '28px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '7px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.28)', cursor: 'pointer', transition: 'color .15s, background .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.color = RED; e.currentTarget.style.background = RED + '15'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.28)'; e.currentTarget.style.background = 'transparent'; }}>
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Plus size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.28)' }} />
                <input value={newTicker} onChange={e => setNewTicker(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="add ticker (e.g. OKLO)"
                  style={{ width: '100%', ...MONO, fontSize: '13px', letterSpacing: '0.08em', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '9px', paddingLeft: '32px', paddingRight: '10px', paddingTop: '9px', paddingBottom: '9px', color: '#e2e8f0', outline: 'none', textTransform: 'uppercase', transition: 'border-color .15s' }}
                  onFocus={e => e.target.style.borderColor = GREEN + '55'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
              </div>
              <button onClick={handleAdd} disabled={!newTicker.trim()}
                style={{ ...SANS, fontWeight: 600, fontSize: '13px', padding: '9px 16px', borderRadius: '9px', cursor: 'pointer', transition: 'all .15s',
                  background: newTicker.trim() ? GREEN : GREEN + '28',
                  color: newTicker.trim() ? '#0a0e1a' : 'rgba(255,255,255,0.30)',
                }}
                className="disabled:cursor-not-allowed">ADD</button>
            </div>

            <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '10px', background: GREEN + '0a', border: `1px solid ${GREEN}28`, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <Check size={13} style={{ color: GREEN, marginTop: '1px', flexShrink: 0 }} />
              <p style={{ ...SANS, fontSize: '12px', color: 'rgba(255,255,255,0.60)', margin: 0 }}>
                Council sees: <span style={{ color: 'rgba(255,255,255,0.82)' }}>{positionsLine || 'no positions yet'}</span>
              </p>
            </div>
            <p style={{ ...MONO, fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '8px' }}>Auto-saves locally. Hit Save to sync across devices.</p>
          </div>
        )}
      </div>
    </div>
  );
}
