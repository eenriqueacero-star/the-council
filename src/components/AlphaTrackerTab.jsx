import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, orderBy, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase.js';
import { getQuotes } from '../api.js';
import { AGENTS, STANCE_STYLE } from '../constants/agents.js';
import { MONO, SANS, CY, ICE } from '../constants/styles.js';
import { Loader2, BarChart2 } from 'lucide-react';

const GOLD = '#c9a84c';
const RED  = '#c0392b';

function fmt(ts) {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch { return '—'; }
}

function parsePrice(v) {
  if (!v) return NaN;
  return parseFloat(String(v).replace(/[^0-9.]/g, ''));
}

function OutcomeBadge({ outcome }) {
  if (!outcome) return (
    <span style={{ ...MONO, fontSize: 9, color: ICE, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: ICE, animation: 'blink 2s cubic-bezier(.4,0,.6,1) infinite' }} />
      OPEN
    </span>
  );
  if (outcome === 'target') return (
    <span style={{ ...MONO, fontSize: 9, fontWeight: 700, background: 'rgba(201,168,76,0.14)', color: GOLD, padding: '2px 7px', borderRadius: 4 }}>TARGET ✓</span>
  );
  if (outcome === 'stop') return (
    <span style={{ ...MONO, fontSize: 9, fontWeight: 700, background: 'rgba(192,57,43,0.14)', color: RED, padding: '2px 7px', borderRadius: 4 }}>STOP ✗</span>
  );
  return (
    <span style={{ ...MONO, fontSize: 9, fontWeight: 700, background: 'rgba(240,240,240,0.06)', color: 'rgba(240,240,240,0.35)', padding: '2px 7px', borderRadius: 4 }}>EXPIRED</span>
  );
}

export default function AlphaTrackerTab({ account }) {
  const [rulings, setRulings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);
  const [liveQuotes, setLiveQuotes] = useState({});

  useEffect(() => { loadData(); }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    try {
      const snap = await getDocs(query(collection(db, 'users', uid, 'rulings'), orderBy('ts', 'desc')));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const forAcct = all.filter(r => !r.account || r.account === account || r.account.split('+').includes(account));
      setRulings(forAcct);

      const tickers = [...new Set(forAcct.map(r => r.ticker).filter(Boolean))];
      if (tickers.length) getQuotes(tickers).then(q => setLiveQuotes(q)).catch(() => {});

      const cutoff = Date.now() - 30 * 86400 * 1000;
      const needs = forAcct.filter(r => !r.outcomeCheckedAt && r.ts?.toDate && r.ts.toDate().getTime() < cutoff);
      if (needs.length) {
        setGrading(true);
        const gradeTickers = [...new Set(needs.map(r => r.ticker).filter(Boolean))];
        const gq = await getQuotes(gradeTickers).catch(() => ({}));
        await Promise.allSettled(needs.map(r => {
          const q = gq[r.ticker];
          const price = q?.price > 0 ? q.price : q?.prevClose;
          if (!price) return Promise.resolve();
          const tp = parsePrice(r.takeProfit);
          const sl = parsePrice(r.stopLoss);
          let outcome = 'expired';
          if (!isNaN(tp) && price >= tp) outcome = 'target';
          else if (!isNaN(sl) && price <= sl) outcome = 'stop';
          return updateDoc(doc(db, 'users', uid, 'rulings', r.id), { outcomeCheckedAt: new Date().toISOString(), priceAt30d: price, outcome });
        }));
        setGrading(false);
        const snap2 = await getDocs(query(collection(db, 'users', uid, 'rulings'), orderBy('ts', 'desc')));
        const all2 = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
        setRulings(all2.filter(r => !r.account || r.account === account || r.account.split('+').includes(account)));
      }
    } catch (e) {
      console.error('AlphaTracker:', e);
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const graded     = rulings.filter(r => r.outcome);
    const targetHit  = graded.filter(r => r.outcome === 'target').length;
    const stopped    = graded.filter(r => r.outcome === 'stop').length;
    const withReturn = graded.filter(r => r.priceAt30d && r.priceAtCall);
    const avgReturn  = withReturn.length
      ? withReturn.reduce((s, r) => s + (r.priceAt30d - r.priceAtCall) / r.priceAtCall * 100, 0) / withReturn.length
      : null;
    const agentAcc = {};
    AGENTS.forEach(a => {
      let correct = 0, total = 0;
      graded.forEach(r => {
        const st = r.agentStances?.[a.id]?.stance;
        if (!st) return;
        const bull = ['PASS', 'BUY'].includes(st);
        const bear = ['FAIL', 'BEARISH'].includes(st);
        if (bull || bear) {
          total++;
          if (bull && r.outcome === 'target') correct++;
          if (bear && (r.outcome === 'stop' || r.outcome === 'expired')) correct++;
        }
      });
      agentAcc[a.id] = { correct, total, pct: total > 0 ? Math.round(correct / total * 100) : null };
    });
    return { total: rulings.length, buyCalls: rulings.filter(r => r.verdict === 'BUY').length, graded: graded.length, targetHit, stopped, avgReturn, agentAcc };
  }, [rulings]);

  if (loading) return (
    <div className="mt-6 flex items-center gap-2" style={{ ...MONO, color: 'rgba(240,240,240,0.32)' }}>
      <Loader2 size={14} className="animate-spin" />
      <span style={{ fontSize: 12 }}>Loading alpha tracker…</span>
    </div>
  );

  return (
    <div className="mt-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 size={14} style={{ color: GOLD }} />
          <span style={{ ...MONO, letterSpacing: '0.10em', color: 'rgba(240,240,240,0.60)', fontWeight: 600, fontSize: 11 }}>ALPHA TRACKER · ALL-TIME</span>
        </div>
        {grading && (
          <div className="flex items-center gap-1.5" style={{ ...MONO, color: 'rgba(240,240,240,0.30)' }}>
            <Loader2 size={11} className="animate-spin" />
            <span style={{ fontSize: 10 }}>GRADING OLD CALLS…</span>
          </div>
        )}
      </div>

      {rulings.length === 0 ? (
        <div className="mt-8 text-center py-12 rounded-xl" style={{ border: '1px dashed rgba(201,168,76,0.12)' }}>
          <BarChart2 size={28} className="mx-auto mb-3" style={{ color: GOLD, opacity: 0.22 }} />
          <p style={{ ...SANS, color: 'rgba(240,240,240,0.38)' }} className="text-sm">No rulings yet.</p>
          <p style={{ ...MONO, color: 'rgba(240,240,240,0.22)', fontSize: 11 }} className="mt-1">Run a council on any ticker to start building your track record.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'TOTAL CALLS',   value: String(stats.total), sub: `${stats.buyCalls} BUY · ${stats.total - stats.buyCalls} WATCH/PASS` },
              { label: 'GRADED',        value: String(stats.graded), sub: `${stats.total - stats.graded} still open` },
              { label: 'TARGETS HIT',   value: stats.graded ? `${Math.round(stats.targetHit / stats.graded * 100)}%` : '—', sub: `${stats.targetHit} of ${stats.graded}` },
              { label: 'AVG RETURN',    value: stats.avgReturn != null ? `${stats.avgReturn >= 0 ? '+' : ''}${stats.avgReturn.toFixed(1)}%` : '—', col: stats.avgReturn != null ? (stats.avgReturn >= 0 ? GOLD : RED) : undefined },
            ].map(({ label, value, sub, col }) => (
              <div key={label} className="gold-card p-3">
                <div style={{ ...MONO, fontSize: 9, color: 'rgba(240,240,240,0.30)', letterSpacing: '0.1em', marginBottom: 6 }}>{label}</div>
                <div style={{ ...MONO, color: col || '#f0f0f0', fontWeight: 700, fontSize: 18 }}>{value}</div>
                {sub && <div style={{ ...MONO, color: 'rgba(240,240,240,0.35)', fontSize: 9 }} className="mt-1">{sub}</div>}
              </div>
            ))}
          </div>

          {stats.graded >= 5 && (
            <div className="gold-card p-4">
              <div style={{ ...MONO, fontSize: 9, color: 'rgba(240,240,240,0.35)', letterSpacing: '0.1em', marginBottom: 12 }}>AGENT ACCURACY (graded calls only)</div>
              <div className="space-y-2">
                {AGENTS.map(a => {
                  const acc = stats.agentAcc[a.id];
                  const pct = acc.pct;
                  return (
                    <div key={a.id} className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 w-28">
                        <a.icon size={10} style={{ color: a.accent }} />
                        <span style={{ ...MONO, color: 'rgba(240,240,240,0.55)', fontSize: 10 }}>{a.name.split(' ')[0]}</span>
                      </div>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        {pct != null && <div style={{ width: `${pct}%`, background: pct >= 60 ? GOLD : pct >= 40 ? 'rgba(201,168,76,0.5)' : RED, height: '100%', borderRadius: 999, transition: 'width 0.8s ease' }} />}
                      </div>
                      <span style={{ ...MONO, color: pct != null ? (pct >= 60 ? GOLD : pct >= 40 ? 'rgba(201,168,76,0.6)' : RED) : 'rgba(240,240,240,0.25)', fontSize: 10, minWidth: 36, textAlign: 'right' }}>
                        {pct != null ? `${pct}%` : (acc.total === 0 ? '—' : '?')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {rulings.map((r, i) => {
              const lq = liveQuotes[r.ticker];
              const livePrice = lq?.price > 0 ? lq.price : lq?.prevClose;
              const displayPrice = r.outcome ? r.priceAt30d : livePrice;
              const move = (r.priceAtCall && displayPrice) ? (displayPrice - r.priceAtCall) / r.priceAtCall * 100 : null;
              const vs = r.verdict ? STANCE_STYLE[r.verdict === 'PASS' ? 'PASS_FINAL' : r.verdict] : null;
              return (
                <div key={r.id || i} className="gold-card p-4" style={{ animation: 'cardIn .3s ease both', animationDelay: `${i * 0.02}s` }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <span style={{ ...MONO, fontWeight: 700, fontSize: 14 }}>{r.ticker}</span>
                      {vs && <span style={{ ...MONO, background: vs.bg, color: vs.fg, fontSize: 9 }} className="font-semibold px-2 py-0.5 rounded">{vs.label}</span>}
                      {typeof r.conviction === 'number' && <span style={{ ...MONO, color: 'rgba(240,240,240,0.35)', fontSize: 9 }}>{r.conviction}/10</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <OutcomeBadge outcome={r.outcome} />
                      <span style={{ ...MONO, color: 'rgba(240,240,240,0.30)', fontSize: 9 }}>{fmt(r.ts)}</span>
                    </div>
                  </div>
                  {r.summary && <p style={{ ...SANS, color: 'rgba(240,240,240,0.55)', fontSize: 12 }} className="mt-2 leading-snug">{r.summary}</p>}
                  {(r.priceAtCall || r.stopLoss || r.takeProfit) && (
                    <div className="mt-3 flex gap-4 flex-wrap">
                      {r.priceAtCall && <div><div style={{ ...MONO, color: 'rgba(240,240,240,0.28)', fontSize: 9 }}>AT CALL</div><div style={{ ...MONO, fontSize: 11 }}>${r.priceAtCall?.toFixed(2)}</div></div>}
                      {r.stopLoss    && <div><div style={{ ...MONO, color: 'rgba(240,240,240,0.28)', fontSize: 9 }}>STOP</div><div style={{ ...MONO, color: RED, fontSize: 11 }}>{r.stopLoss}</div></div>}
                      {r.takeProfit  && <div><div style={{ ...MONO, color: 'rgba(240,240,240,0.28)', fontSize: 9 }}>TARGET</div><div style={{ ...MONO, color: GOLD, fontSize: 11 }}>{r.takeProfit}</div></div>}
                      {move != null  && <div><div style={{ ...MONO, color: 'rgba(240,240,240,0.28)', fontSize: 9 }}>SINCE CALL</div><div style={{ ...MONO, color: move >= 0 ? GOLD : RED, fontSize: 11 }}>{move >= 0 ? '+' : ''}{move.toFixed(1)}%</div></div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
