import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, orderBy, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase.js';
import { getQuotes } from '../api.js';
import { AGENTS, STANCE_STYLE } from '../constants/agents.js';
import { writeAgentLesson, updateAgentAccuracy } from '../utils/agentMemory.js';
import { theme } from '../utils/theme.js';
import { Loader2, BarChart2, Trash2, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const MFONT = { fontFamily: "ui-monospace, 'SF Mono', monospace" };
const FONT  = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };

function fmt(ts) {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch { return '—'; }
}

function moveStr(from, to) {
  if (!from || !to) return null;
  return (to - from) / from * 100;
}

function parsePrice(v) {
  if (!v) return NaN;
  return parseFloat(String(v).replace(/[^0-9.]/g, ''));
}

function pctStr(v, decimals = 1) {
  if (v == null || isNaN(v)) return null;
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`;
}

// Compute my_return / spy_return / alpha from a ruling object
function computeReturns(r, exitPrice, spyExitPrice) {
  const entryPrice = parsePrice(r.enteredPrice) || r.priceAtCall;
  const myReturn = entryPrice && exitPrice ? (exitPrice - entryPrice) / entryPrice * 100 : null;
  const spyReturn = spyExitPrice && r.spyEntryPrice ? (spyExitPrice - r.spyEntryPrice) / r.spyEntryPrice * 100 : null;
  const alpha = myReturn != null && spyReturn != null ? myReturn - spyReturn : null;
  return { myReturn, spyReturn, alpha, spyExitPrice: spyExitPrice || null };
}

function StatusBadge({ status }) {
  if (status === 'entered') return (
    <span style={{ ...MFONT, fontSize: 9, fontWeight: 700, background: 'rgba(56,224,212,0.12)', color: '#38e0d4', padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>ENTERED</span>
  );
  if (status === 'watching') return (
    <span style={{ ...MFONT, fontSize: 9, fontWeight: 700, background: 'rgba(176,131,255,0.12)', color: '#b083ff', padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>WATCHING</span>
  );
  return null;
}

function OutcomeBadge({ outcome, T }) {
  if (!outcome) return (
    <span style={{ ...MFONT, fontSize: 9, color: T.text3, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: T.text3, animation: 'pulse 2s cubic-bezier(.4,0,.6,1) infinite' }} />
      OPEN
    </span>
  );
  if (outcome === 'target' || outcome === 'win') return (
    <span style={{ ...MFONT, fontSize: 9, fontWeight: 700, background: 'rgba(0,200,5,0.12)', color: '#00C805', padding: '2px 7px', borderRadius: 4 }}>
      {outcome === 'win' ? 'WIN ✓' : 'TARGET ✓'}
    </span>
  );
  if (outcome === 'stop' || outcome === 'loss') return (
    <span style={{ ...MFONT, fontSize: 9, fontWeight: 700, background: 'rgba(255,59,48,0.12)', color: '#FF3B30', padding: '2px 7px', borderRadius: 4 }}>
      {outcome === 'loss' ? 'LOSS ✗' : 'STOP ✗'}
    </span>
  );
  return (
    <span style={{ ...MFONT, fontSize: 9, fontWeight: 700, background: T.bgHover, color: T.text2, padding: '2px 7px', borderRadius: 4 }}>EXPIRED</span>
  );
}

// Alpha cell: shows My Return / SPY / Alpha for graded entered trades
function AlphaCell({ r, T }) {
  if (r.status !== 'entered' || !r.outcome) {
    return <span style={{ ...MFONT, color: T.text3, fontSize: 11 }}>—</span>;
  }
  // Trade has been closed/graded but no spyEntryPrice was captured
  if (r.spyEntryPrice == null) {
    return (
      <span style={{ ...MFONT, fontSize: 9, color: T.text3, display: 'block', lineHeight: 1.6 }}>
        SPY N/A
      </span>
    );
  }
  if (r.alpha == null) {
    return <span style={{ ...MFONT, color: T.text3, fontSize: 11 }}>—</span>;
  }
  const myColor  = r.myReturn  >= 0 ? '#00C805' : '#FF3B30';
  const spyColor = r.spyReturn >= 0 ? '#00C805' : '#FF3B30';
  const aColor   = r.alpha     >= 0 ? '#00C805' : '#FF3B30';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ ...MFONT, fontSize: 9, color: myColor,  fontWeight: 600 }}>Me {pctStr(r.myReturn)}</span>
      <span style={{ ...MFONT, fontSize: 9, color: spyColor }}                >SPY {pctStr(r.spyReturn)}</span>
      <span style={{ ...MFONT, fontSize: 9, color: aColor,   fontWeight: 700 }}>α {pctStr(r.alpha)}</span>
    </div>
  );
}

export default function AlphaTrackerTab({ account, dark }) {
  const T = theme(dark);
  const [rulings,    setRulings]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [grading,    setGrading]    = useState(false);
  const [liveQuotes, setLiveQuotes] = useState({});
  const [deletePending, setDeletePending] = useState(new Set());

  useEffect(() => { loadData(); }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }

    try {
      const snap = await getDocs(query(
        collection(db, 'users', uid, 'rulings'),
        orderBy('ts', 'desc')
      ));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const forAcct = all.filter(r =>
        !r.account || r.account === account || r.account.split('+').includes(account)
      );
      setRulings(forAcct);

      const tickers = [...new Set(forAcct.map(r => r.ticker).filter(Boolean))];
      if (tickers.length) {
        getQuotes(tickers).then(q => setLiveQuotes(q)).catch(() => {});
      }

      const cutoff = Date.now() - 30 * 86400 * 1000;
      const needs = forAcct.filter(r =>
        r.status === 'entered' &&
        !r.outcomeCheckedAt && r.ts?.toDate && r.ts.toDate().getTime() < cutoff
      );

      if (needs.length) {
        setGrading(true);
        const gradeTickers = [...new Set(needs.map(r => r.ticker).filter(Boolean))];

        // Fetch ticker prices + SPY price in parallel
        const [gq, spyRes] = await Promise.all([
          getQuotes(gradeTickers).catch(() => ({})),
          getQuotes(['SPY']).catch(() => ({})),
        ]);
        const spyQ = spyRes['SPY'];
        const spyExitPrice = spyQ?.price > 0 ? spyQ.price : spyQ?.prevClose || null;

        if (Object.keys(gq).length === 0) {
          setGrading(false);
          return;
        }

        await Promise.allSettled(needs.map(async r => {
          const q     = gq[r.ticker];
          const price = q?.price > 0 ? q.price : q?.prevClose;
          if (!price) return;
          const tp = parsePrice(r.takeProfit);
          const sl = parsePrice(r.stopLoss);
          let outcome = 'expired';
          if (!isNaN(tp) && price >= tp) outcome = 'target';
          else if (!isNaN(sl) && price <= sl) outcome = 'stop';

          const { myReturn, spyReturn, alpha } = computeReturns(r, price, spyExitPrice);

          await updateDoc(doc(db, 'users', uid, 'rulings', r.id), {
            outcomeCheckedAt: new Date().toISOString(),
            priceAt30d: price,
            outcome,
            ...(spyExitPrice != null ? { spyExitPrice } : {}),
            ...(myReturn  != null ? { myReturn }  : {}),
            ...(spyReturn != null ? { spyReturn } : {}),
            ...(alpha     != null ? { alpha }     : {}),
          });

          if (r.agentStances) {
            Object.entries(r.agentStances).forEach(([agentId, stanceObj]) => {
              const stance = stanceObj?.stance;
              if (!stance) return;
              const agentWasBullish = stance !== 'PASS' && stance !== 'FAIL' && stance !== 'BEARISH';
              const outcomeWasGood  = outcome === 'target';
              const wasCorrect = agentWasBullish === outcomeWasGood;
              const priceStr = r.priceAtCall != null ? `$${r.priceAtCall.toFixed(2)}` : 'unknown price';
              const lesson = wasCorrect
                ? `Called ${stance} on ${r.ticker} @ ${priceStr} — hit ${outcome}. Good read.`
                : `Called ${stance} on ${r.ticker} @ ${priceStr} — outcome: ${outcome}. Review your thesis.`;
              writeAgentLesson(uid, agentId, lesson);
              updateAgentAccuracy(uid, agentId, wasCorrect);
            });
          }
        }));

        setGrading(false);

        const snap2 = await getDocs(query(
          collection(db, 'users', uid, 'rulings'),
          orderBy('ts', 'desc')
        ));
        const all2 = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
        setRulings(all2.filter(r =>
          !r.account || r.account === account || r.account.split('+').includes(account)
        ));
      }
    } catch (e) {
      console.error('AlphaTracker:', e);
    } finally {
      setLoading(false);
    }
  }

  async function deleteRuling(id) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await deleteDoc(doc(db, 'users', uid, 'rulings', id));
      setRulings(prev => prev.filter(r => r.id !== id));
      setDeletePending(prev => { const n = new Set(prev); n.delete(id); return n; });
    } catch (e) {
      console.error('Delete ruling failed:', e);
    }
  }

  async function closeRuling(id, outcome) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const ruling = rulings.find(r => r.id === id);
    try {
      // Fetch current ticker + SPY prices to compute returns at close time
      const tickersToFetch = [ruling?.ticker, 'SPY'].filter(Boolean);
      const prices = await getQuotes(tickersToFetch).catch(() => ({}));
      const lq = ruling?.ticker ? prices[ruling.ticker] : null;
      const exitPrice = lq?.price > 0 ? lq.price : lq?.prevClose || null;
      const spyLq = prices['SPY'];
      const spyExitPrice = spyLq?.price > 0 ? spyLq.price : spyLq?.prevClose || null;

      const { myReturn, spyReturn, alpha } = ruling ? computeReturns(ruling, exitPrice, spyExitPrice) : {};

      const updates = {
        outcome,
        outcomeCheckedAt: new Date().toISOString(),
        ...(exitPrice     != null ? { priceAt30d: exitPrice } : {}),
        ...(spyExitPrice  != null ? { spyExitPrice } : {}),
        ...(myReturn      != null ? { myReturn }     : {}),
        ...(spyReturn     != null ? { spyReturn }    : {}),
        ...(alpha         != null ? { alpha }         : {}),
      };
      await updateDoc(doc(db, 'users', uid, 'rulings', id), updates);
      setRulings(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    } catch (e) {
      console.error('Close ruling failed:', e);
    }
  }

  async function markEntered(id) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await updateDoc(doc(db, 'users', uid, 'rulings', id), { status: 'entered' });
      setRulings(prev => prev.map(r => r.id === id ? { ...r, status: 'entered' } : r));
    } catch (e) {
      console.error('Mark entered failed:', e);
    }
  }

  const stats = useMemo(() => {
    const entered  = rulings.filter(r => r.status === 'entered');
    const watching = rulings.filter(r => r.status === 'watching');
    const graded     = entered.filter(r => r.outcome);
    const targetHit  = graded.filter(r => r.outcome === 'target' || r.outcome === 'win').length;
    const stopped    = graded.filter(r => r.outcome === 'stop'   || r.outcome === 'loss').length;
    const withReturn = graded.filter(r => r.priceAt30d && r.priceAtCall);
    const avgReturn  = withReturn.length
      ? withReturn.reduce((s, r) => s + (r.priceAt30d - r.priceAtCall) / r.priceAtCall * 100, 0) / withReturn.length
      : null;

    // SPY benchmarking — only graded entered trades with full alpha data
    const withAlpha  = graded.filter(r => r.alpha != null);
    const totalAlpha = withAlpha.length ? withAlpha.reduce((s, r) => s + r.alpha, 0) : null;
    const avgAlpha   = withAlpha.length ? totalAlpha / withAlpha.length : null;
    const beatSpy    = withAlpha.filter(r => r.myReturn > r.spyReturn).length;
    const winVsSpy   = withAlpha.length ? Math.round(beatSpy / withAlpha.length * 100) : null;

    const agentAcc = {};
    AGENTS.forEach(a => {
      let correct = 0, total = 0;
      graded.forEach(r => {
        const st   = r.agentStances?.[a.id]?.stance;
        if (!st) return;
        const bull = ['PASS', 'BUY'].includes(st);
        const bear = ['FAIL', 'BEARISH'].includes(st);
        if (bull || bear) {
          total++;
          if (bull && (r.outcome === 'target' || r.outcome === 'win')) correct++;
          if (bear && (r.outcome === 'stop' || r.outcome === 'expired' || r.outcome === 'loss')) correct++;
        }
      });
      agentAcc[a.id] = { correct, total, pct: total > 0 ? Math.round(correct / total * 100) : null };
    });

    return {
      total: rulings.length,
      enteredCount: entered.length,
      watchingCount: watching.length,
      buyCalls: entered.filter(r => r.verdict === 'BUY').length,
      graded: graded.length,
      targetHit,
      stopped,
      avgReturn,
      agentAcc,
      // SPY benchmark
      withAlphaCount: withAlpha.length,
      totalAlpha,
      avgAlpha,
      beatSpy,
      winVsSpy,
    };
  }, [rulings]);

  if (loading) return (
    <div style={{ ...MFONT, color: T.text2, display: 'flex', alignItems: 'center', gap: 8, marginTop: 24 }}>
      <Loader2 size={14} className="animate-spin" />
      <span style={{ fontSize: 12 }}>Loading alpha tracker…</span>
    </div>
  );

  const btnBase = { ...MFONT, fontSize: 9, fontWeight: 700, borderRadius: 4, border: 'none', cursor: 'pointer', padding: '2px 7px' };

  // Alpha summary panel colors
  const alphaPositive = stats.totalAlpha != null && stats.totalAlpha >= 0;
  const alphaBorderColor = stats.withAlphaCount === 0 ? 'transparent'
    : alphaPositive ? 'rgba(0,200,5,0.25)' : 'rgba(255,59,48,0.25)';
  const alphaBgColor = stats.withAlphaCount === 0 ? T.bgCard
    : alphaPositive ? 'rgba(0,200,5,0.05)' : 'rgba(255,59,48,0.05)';
  const alphaTextColor = stats.withAlphaCount === 0 ? T.text
    : alphaPositive ? '#00C805' : '#FF3B30';

  return (
    <div style={{ ...FONT, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart2 size={14} style={{ color: T.text }} />
          <span style={{ ...MFONT, fontSize: 11, letterSpacing: '0.10em', color: T.text, fontWeight: 600 }}>ALPHA TRACKER · ALL-TIME</span>
        </div>
        {grading && (
          <div style={{ ...MFONT, color: T.text2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Loader2 size={11} className="animate-spin" />
            <span style={{ fontSize: 10 }}>GRADING OLD CALLS…</span>
          </div>
        )}
      </div>

      {rulings.length === 0 ? (
        <div style={{ marginTop: 32, textAlign: 'center', padding: '48px 16px', border: `1px dashed ${T.border}`, borderRadius: 12 }}>
          <BarChart2 size={28} style={{ color: T.text3, margin: '0 auto 12px' }} />
          <p style={{ ...FONT, color: T.text2, fontSize: 14 }}>No tracked trades yet.</p>
          <p style={{ ...MFONT, color: T.text3, fontSize: 11, marginTop: 4 }}>Convene the council on any ticker, then click <strong style={{ color: T.text2 }}>Track This Trade</strong> on the AXIOM ruling.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {[
              { label: 'TRACKED',        value: String(stats.total), sub: `${stats.enteredCount} entered · ${stats.watchingCount} watching`, color: undefined },
              { label: 'WIN RATE',        value: stats.graded ? `${Math.round(stats.targetHit / stats.graded * 100)}%` : '—', sub: `${stats.targetHit} of ${stats.graded} entered`, color: '#00C805' },
              { label: 'STOPPED OUT',    value: stats.graded ? `${Math.round(stats.stopped    / stats.graded * 100)}%` : '—', sub: `${stats.stopped} losses`, color: '#FF3B30' },
              { label: 'AVG 30D RETURN', value: stats.avgReturn != null ? `${stats.avgReturn >= 0 ? '+' : ''}${stats.avgReturn.toFixed(1)}%` : '—', sub: `entered trades only`, color: stats.avgReturn != null ? (stats.avgReturn >= 0 ? '#00C805' : '#FF3B30') : undefined },
            ].map((c, i) => (
              <div key={i} style={{ borderRadius: 12, padding: 16, background: T.bgCard, border: `1px solid ${T.border}` }}>
                <div style={{ ...MFONT, fontSize: 9, letterSpacing: '0.10em', color: T.text2, marginBottom: 6 }}>{c.label}</div>
                <div style={{ ...MFONT, color: c.color || T.text, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{c.value}</div>
                <div style={{ ...MFONT, color: T.text3, fontSize: 10, marginTop: 6 }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* SPY Benchmarking Panel */}
          <div style={{ borderRadius: 12, padding: 16, background: alphaBgColor, border: `1px solid ${alphaBorderColor || T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              {stats.withAlphaCount === 0
                ? <Minus size={13} style={{ color: T.text3 }} />
                : alphaPositive
                  ? <TrendingUp size={13} style={{ color: '#00C805' }} />
                  : <TrendingDown size={13} style={{ color: '#FF3B30' }} />}
              <span style={{ ...MFONT, fontSize: 10, letterSpacing: '0.10em', color: T.text2, fontWeight: 600 }}>ALPHA vs SPY BENCHMARK</span>
              {stats.withAlphaCount > 0 && (
                <span style={{ ...MFONT, fontSize: 9, color: T.text3, marginLeft: 'auto' }}>{stats.withAlphaCount} trade{stats.withAlphaCount !== 1 ? 's' : ''} benchmarked</span>
              )}
            </div>
            {stats.withAlphaCount === 0 ? (
              <p style={{ ...MFONT, fontSize: 11, color: T.text3, margin: 0 }}>
                No benchmarked trades yet. Close or auto-grade an Entered trade to see alpha vs SPY.
                New entered trades automatically capture SPY price at entry.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                {[
                  {
                    label: 'TOTAL ALPHA',
                    value: pctStr(stats.totalAlpha, 1) || '—',
                    sub: 'sum across all trades',
                    color: alphaTextColor,
                  },
                  {
                    label: 'AVG ALPHA / TRADE',
                    value: pctStr(stats.avgAlpha, 1) || '—',
                    sub: 'vs SPY over same period',
                    color: stats.avgAlpha != null ? (stats.avgAlpha >= 0 ? '#00C805' : '#FF3B30') : T.text,
                  },
                  {
                    label: 'BEAT SPY RATE',
                    value: stats.winVsSpy != null ? `${stats.winVsSpy}%` : '—',
                    sub: `${stats.beatSpy} of ${stats.withAlphaCount} trades`,
                    color: stats.winVsSpy != null ? (stats.winVsSpy >= 50 ? '#00C805' : '#FF3B30') : T.text,
                  },
                ].map((c, i) => (
                  <div key={i}>
                    <div style={{ ...MFONT, fontSize: 9, letterSpacing: '0.10em', color: T.text2, marginBottom: 4 }}>{c.label}</div>
                    <div style={{ ...MFONT, color: c.color, fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{c.value}</div>
                    <div style={{ ...MFONT, color: T.text3, fontSize: 9, marginTop: 4 }}>{c.sub}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {stats.graded >= 5 && (
            <div style={{ borderRadius: 12, padding: 16, background: T.bgCard, border: `1px solid ${T.border}` }}>
              <div style={{ ...MFONT, fontSize: 10, letterSpacing: '0.10em', color: T.text2, marginBottom: 12 }}>AGENT ACCURACY · ENTERED TRADES ONLY</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {AGENTS.map(a => {
                  const s        = stats.agentAcc[a.id];
                  const barColor = s.pct == null ? T.border
                    : s.pct >= 65 ? '#00C805'
                    : s.pct >= 45 ? T.text
                    : '#FF3B30';
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ borderRadius: 6, padding: 6, flexShrink: 0, background: `${a.accent}1a`, border: `1px solid ${a.accent}22` }}>
                        <a.icon size={11} style={{ color: a.accent }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 4 }}>
                          <span style={{ ...MFONT, color: T.text2, fontSize: 10 }}>{a.emoji} {a.name}</span>
                          <span style={{ ...MFONT, color: barColor, fontSize: 10, fontWeight: 700 }}>
                            {s.pct != null ? `${s.pct}%` : '—'}
                          </span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, overflow: 'hidden', background: T.border }}>
                          <div style={{ width: `${s.pct || 0}%`, background: barColor, height: '100%', borderRadius: 2, transition: 'width .6s ease' }} />
                        </div>
                        <div style={{ ...MFONT, color: T.text3, fontSize: 9, marginTop: 2 }}>{s.total} call{s.total !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p style={{ ...MFONT, color: T.text3, fontSize: 9, marginTop: 12 }}>Bull calls (PASS/BUY) scored on target/win · Bear calls (FAIL/BEARISH) scored on stop/loss/expired. Entered trades only.</p>
            </div>
          )}

          <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${T.border}` }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead>
                  <tr style={{ background: T.bgCard, borderBottom: `1px solid ${T.border}` }}>
                    {['DATE', 'TICKER', 'VERDICT', 'STATUS', 'CONV', 'PRICE@CALL', '30D / NOW', 'MOVE', 'vs SPY', 'OUTCOME', ''].map(h => (
                      <th key={h} style={{ ...MFONT, fontSize: 9, letterSpacing: '0.08em', color: T.text2, padding: '10px 12px', textAlign: 'left', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rulings.map((r, i) => {
                    const vs         = r.verdict ? STANCE_STYLE[r.verdict === 'SKIP' ? 'SKIP' : r.verdict === 'PASS' ? 'PASS_FINAL' : r.verdict] : null;
                    const lq         = liveQuotes[r.ticker];
                    const livePrice  = lq?.price > 0 ? lq.price : lq?.prevClose;
                    const displayPrice = r.outcome ? r.priceAt30d : livePrice;
                    const move       = moveStr(r.priceAtCall, displayPrice);
                    const isPending  = deletePending.has(r.id);
                    const isEntered  = r.status === 'entered';
                    const isWatching = r.status === 'watching';
                    const isOpen     = !r.outcome;

                    return (
                      <tr key={r.id} style={{
                        borderBottom: i < rulings.length - 1 ? `1px solid ${T.border}` : undefined,
                        background: i % 2 === 0 ? T.bgCard : T.bg,
                      }}>
                        <td style={{ ...MFONT, color: T.text2, fontSize: 11, padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmt(r.ts)}</td>
                        <td style={{ ...MFONT, letterSpacing: '0.1em', color: T.text, fontSize: 12, fontWeight: 600, padding: '10px 12px' }}>{r.ticker}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {vs && <span style={{ ...MFONT, background: vs.bg, color: vs.fg, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>{vs.label}</span>}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <StatusBadge status={r.status} />
                        </td>
                        <td style={{ ...MFONT, color: T.text2, fontSize: 11, padding: '10px 12px' }}>{r.conviction ?? '—'}/10</td>
                        <td style={{ ...MFONT, color: T.text2, fontSize: 11, padding: '10px 12px' }}>{r.priceAtCall ? `$${r.priceAtCall.toFixed(2)}` : '—'}</td>
                        <td style={{ ...MFONT, color: T.text2, fontSize: 11, padding: '10px 12px' }}>{displayPrice ? `$${displayPrice.toFixed(2)}` : '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {move != null
                            ? <span style={{ ...MFONT, fontSize: 11, fontWeight: 600, color: move >= 0 ? '#00C805' : '#FF3B30' }}>{move >= 0 ? '+' : ''}{move.toFixed(1)}%</span>
                            : <span style={{ ...MFONT, color: T.text3, fontSize: 11 }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                          <AlphaCell r={r} T={T} />
                        </td>
                        <td style={{ padding: '10px 12px' }}><OutcomeBadge outcome={r.outcome} T={T} /></td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                            {isEntered && isOpen && !isPending && (
                              <>
                                <button
                                  onClick={() => closeRuling(r.id, 'win')}
                                  title="Mark as Win"
                                  style={{ ...btnBase, background: 'rgba(0,200,5,0.12)', color: '#00C805' }}
                                >WIN</button>
                                <button
                                  onClick={() => closeRuling(r.id, 'loss')}
                                  title="Mark as Loss"
                                  style={{ ...btnBase, background: 'rgba(255,59,48,0.12)', color: '#FF3B30' }}
                                >LOSS</button>
                              </>
                            )}
                            {isWatching && !isPending && (
                              <button
                                onClick={() => markEntered(r.id)}
                                title="Reclassify as Entered"
                                style={{ ...btnBase, background: 'rgba(56,224,212,0.1)', color: '#38e0d4' }}
                              >→ ENT</button>
                            )}
                            {!isPending ? (
                              <button
                                onClick={() => setDeletePending(prev => new Set([...prev, r.id]))}
                                title="Delete entry"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text3, padding: '2px 4px', display: 'flex', alignItems: 'center' }}
                              >
                                <Trash2 size={12} />
                              </button>
                            ) : (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <button
                                  onClick={() => deleteRuling(r.id)}
                                  style={{ ...btnBase, background: 'rgba(255,59,48,0.15)', color: '#FF3B30' }}
                                >DEL</button>
                                <button
                                  onClick={() => setDeletePending(prev => { const n = new Set(prev); n.delete(r.id); return n; })}
                                  style={{ ...btnBase, background: T.bgHover, color: T.text2 }}
                                >×</button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
