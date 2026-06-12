import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, orderBy, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase.js';
import { getQuotes } from '../api.js';
import { AGENTS, STANCE_STYLE } from '../constants/agents.js';
import { MONO, DISP, FONT, ICE } from '../constants/styles.js';
import { Loader2, BarChart2 } from 'lucide-react';

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

function OutcomeBadge({ outcome }) {
  if (!outcome) return (
    <span style={{ ...MONO, fontSize: 9, color: ICE, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: ICE, animation: 'pulse 2s cubic-bezier(.4,0,.6,1) infinite' }} />
      OPEN
    </span>
  );
  if (outcome === 'target') return (
    <span style={{ ...MONO, fontSize: 9, fontWeight: 700, background: 'rgba(0,200,5,0.12)', color: '#00C805', padding: '2px 7px', borderRadius: 4 }}>TARGET ✓</span>
  );
  if (outcome === 'stop') return (
    <span style={{ ...MONO, fontSize: 9, fontWeight: 700, background: 'rgba(255,59,48,0.12)', color: '#FF3B30', padding: '2px 7px', borderRadius: 4 }}>STOP ✗</span>
  );
  return (
    <span style={{ ...MONO, fontSize: 9, fontWeight: 700, background: '#F0F0F0', color: '#AAAAAA', padding: '2px 7px', borderRadius: 4 }}>EXPIRED</span>
  );
}

export default function AlphaTrackerTab({ account }) {
  const [rulings,    setRulings]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [grading,    setGrading]    = useState(false);
  const [liveQuotes, setLiveQuotes] = useState({});

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
      const needs  = forAcct.filter(r =>
        !r.outcomeCheckedAt && r.ts?.toDate && r.ts.toDate().getTime() < cutoff
      );

      if (needs.length) {
        setGrading(true);
        const gradeTickers = [...new Set(needs.map(r => r.ticker).filter(Boolean))];
        const gq = await getQuotes(gradeTickers).catch(() => ({}));

        await Promise.allSettled(needs.map(r => {
          const q     = gq[r.ticker];
          const price = q?.price > 0 ? q.price : q?.prevClose;
          if (!price) return Promise.resolve();
          const tp = parsePrice(r.takeProfit);
          const sl = parsePrice(r.stopLoss);
          let outcome = 'expired';
          if (!isNaN(tp) && price >= tp) outcome = 'target';
          else if (!isNaN(sl) && price <= sl) outcome = 'stop';
          return updateDoc(doc(db, 'users', uid, 'rulings', r.id), {
            outcomeCheckedAt: new Date().toISOString(),
            priceAt30d: price,
            outcome,
          });
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
        const st   = r.agentStances?.[a.id]?.stance;
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

    return {
      total: rulings.length,
      buyCalls: rulings.filter(r => r.verdict === 'BUY').length,
      graded: graded.length,
      targetHit,
      stopped,
      avgReturn,
      agentAcc,
    };
  }, [rulings]);

  if (loading) return (
    <div className="mt-6 flex items-center gap-2" style={{ ...MONO, color: '#AAAAAA' }}>
      <Loader2 size={14} className="animate-spin" />
      <span className="text-[12px]">Loading alpha tracker…</span>
    </div>
  );

  return (
    <div className="mt-2 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 size={14} style={{ color: '#000000' }} />
          <span style={{ ...MONO, letterSpacing: '0.10em', color: '#333333', fontWeight: 600 }} className="text-[11px]">ALPHA TRACKER · ALL-TIME</span>
        </div>
        {grading && (
          <div className="flex items-center gap-1.5" style={{ ...MONO, color: '#AAAAAA' }}>
            <Loader2 size={11} className="animate-spin" />
            <span className="text-[10px]">GRADING OLD CALLS…</span>
          </div>
        )}
      </div>

      {rulings.length === 0 ? (
        <div className="mt-8 text-center py-12 border border-dashed rounded-xl" style={{ borderColor: '#EEEEEE' }}>
          <BarChart2 size={28} className="mx-auto mb-3" style={{ color: '#000000', opacity: 0.12 }} />
          <p style={{ ...FONT, color: '#888888' }} className="text-sm">No rulings yet.</p>
          <p style={{ ...MONO, color: '#AAAAAA' }} className="text-[11px] mt-1">Run a council on any ticker to start building your track record.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'TOTAL CALLS',    value: String(stats.total), sub: `${stats.buyCalls} BUY · ${stats.total - stats.buyCalls} WATCH/PASS` },
              { label: 'TARGET HIT',     value: stats.graded ? `${Math.round(stats.targetHit / stats.graded * 100)}%` : '—', sub: `${stats.targetHit} of ${stats.graded} graded`, color: '#00C805' },
              { label: 'STOPPED OUT',    value: stats.graded ? `${Math.round(stats.stopped    / stats.graded * 100)}%` : '—', sub: `${stats.stopped} losses`,                        color: '#FF3B30' },
              { label: 'AVG 30D RETURN', value: stats.avgReturn != null ? `${stats.avgReturn >= 0 ? '+' : ''}${stats.avgReturn.toFixed(1)}%` : '—', sub: `${stats.graded} graded call${stats.graded !== 1 ? 's' : ''}`, color: stats.avgReturn != null ? (stats.avgReturn >= 0 ? '#00C805' : '#FF3B30') : undefined },
            ].map((c, i) => (
              <div key={i} className="rounded-xl p-4" style={{ background: '#F7F7F7', border: '1px solid #EEEEEE' }}>
                <div style={{ ...MONO, letterSpacing: '0.10em', color: '#757575' }} className="text-[9px] tracking-widest mb-1.5">{c.label}</div>
                <div style={{ ...MONO, color: c.color || '#000000', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{c.value}</div>
                <div style={{ ...MONO, color: '#AAAAAA' }} className="text-[10px] mt-1.5">{c.sub}</div>
              </div>
            ))}
          </div>

          {stats.graded >= 5 && (
            <div className="rounded-xl p-4" style={{ background: '#F7F7F7', border: '1px solid #EEEEEE' }}>
              <div style={{ ...MONO, letterSpacing: '0.10em', color: '#757575' }} className="text-[10px] tracking-widest mb-3">AGENT ACCURACY · ALL-TIME</div>
              <div className="grid sm:grid-cols-3 gap-3">
                {AGENTS.map(a => {
                  const s        = stats.agentAcc[a.id];
                  const barColor = s.pct == null ? '#EEEEEE'
                    : s.pct >= 65 ? '#00C805'
                    : s.pct >= 45 ? '#000000'
                    : '#FF3B30';
                  return (
                    <div key={a.id} className="flex items-center gap-2.5">
                      <div className="rounded-md p-1.5 shrink-0" style={{ background: `${a.accent}1a`, border: `1px solid ${a.accent}22` }}>
                        <a.icon size={11} style={{ color: a.accent }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span style={{ ...MONO, color: '#555555' }} className="text-[10px] truncate">{a.name.split(' ')[0]}</span>
                          <span style={{ ...MONO, color: barColor, fontSize: 10, fontWeight: 700 }}>
                            {s.pct != null ? `${s.pct}%` : '—'}
                          </span>
                        </div>
                        <div className="h-1 rounded-full overflow-hidden" style={{ background: '#EEEEEE' }}>
                          <div style={{ width: `${s.pct || 0}%`, background: barColor, transition: 'width .6s ease' }} className="h-full rounded-full" />
                        </div>
                        <div style={{ ...MONO, color: '#BBBBBB' }} className="text-[9px] mt-0.5">{s.total} call{s.total !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p style={{ ...MONO, color: '#CCCCCC' }} className="text-[9px] mt-3">Bull calls (PASS/BUY) scored on target · Bear calls (FAIL/BEARISH) scored on stop or expired.</p>
            </div>
          )}

          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #EEEEEE' }}>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 560 }}>
                <thead>
                  <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #EEEEEE' }}>
                    {['DATE', 'TICKER', 'VERDICT', 'CONV', 'PRICE@CALL', '30D / NOW', 'MOVE', 'OUTCOME'].map(h => (
                      <th key={h} style={{ ...MONO, letterSpacing: '0.08em', color: '#888888' }} className="px-3 py-2.5 text-left text-[9px] tracking-widest font-normal whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rulings.map((r, i) => {
                    const vs         = r.verdict ? STANCE_STYLE[r.verdict === 'PASS' ? 'PASS_FINAL' : r.verdict] : null;
                    const lq         = liveQuotes[r.ticker];
                    const livePrice  = lq?.price > 0 ? lq.price : lq?.prevClose;
                    const displayPrice = r.outcome ? r.priceAt30d : livePrice;
                    const move       = moveStr(r.priceAtCall, displayPrice);
                    return (
                      <tr key={r.id} style={{
                        borderBottom: i < rulings.length - 1 ? '1px solid #EEEEEE' : undefined,
                        background: i % 2 === 0 ? '#FAFAFA' : '#FFFFFF',
                      }}>
                        <td style={{ ...MONO, color: '#757575' }} className="px-3 py-2.5 text-[11px] whitespace-nowrap">{fmt(r.ts)}</td>
                        <td style={{ ...MONO, letterSpacing: '0.1em', color: '#1A1A1A', fontWeight: 600 }} className="px-3 py-2.5 text-[12px]">{r.ticker}</td>
                        <td className="px-3 py-2.5">
                          {vs && <span style={{ ...MONO, background: vs.bg, color: vs.fg, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>{vs.label}</span>}
                        </td>
                        <td style={{ ...MONO, color: '#666666' }} className="px-3 py-2.5 text-[11px]">{r.conviction ?? '—'}/10</td>
                        <td style={{ ...MONO, color: '#666666' }} className="px-3 py-2.5 text-[11px]">{r.priceAtCall ? `$${r.priceAtCall.toFixed(2)}` : '—'}</td>
                        <td style={{ ...MONO, color: '#666666' }} className="px-3 py-2.5 text-[11px]">{displayPrice ? `$${displayPrice.toFixed(2)}` : '—'}</td>
                        <td className="px-3 py-2.5">
                          {move != null
                            ? <span style={{ ...MONO, fontSize: 11, fontWeight: 600, color: move >= 0 ? '#00C805' : '#FF3B30' }}>{move >= 0 ? '+' : ''}{move.toFixed(1)}%</span>
                            : <span style={{ ...MONO, color: '#CCCCCC' }} className="text-[11px]">—</span>}
                        </td>
                        <td className="px-3 py-2.5"><OutcomeBadge outcome={r.outcome} /></td>
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
