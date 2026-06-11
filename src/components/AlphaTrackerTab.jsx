import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, orderBy, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase.js';
import { getQuotes } from '../api.js';
import { AGENTS, STANCE_STYLE } from '../constants/agents.js';
import { MONO, SANS } from '../constants/styles.js';
import { Loader2, BarChart2 } from 'lucide-react';

const GRN = '#00C805';
const RED = '#FF3B30';

function fmt(ts) {
  if (!ts) return '—';
  try { const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }); } catch { return '—'; }
}
function moveStr(from, to) { if (!from || !to) return null; return (to - from) / from * 100; }
function parsePrice(v) { if (!v) return NaN; return parseFloat(String(v).replace(/[^0-9.]/g, '')); }

function OutcomeBadge({ outcome }) {
  if (!outcome) return <span style={{ ...MONO, fontSize: 9, color: '#757575', display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#AAAAAA', display: 'inline-block' }} />OPEN</span>;
  if (outcome === 'target') return <span style={{ ...MONO, fontSize: 9, fontWeight: 700, background: 'rgba(0,200,5,0.1)', color: GRN, padding: '2px 7px', borderRadius: 4 }}>TARGET ✓</span>;
  if (outcome === 'stop')   return <span style={{ ...MONO, fontSize: 9, fontWeight: 700, background: 'rgba(255,59,48,0.1)', color: RED, padding: '2px 7px', borderRadius: 4 }}>STOP ✗</span>;
  return <span style={{ ...MONO, fontSize: 9, fontWeight: 700, background: '#F0F0F0', color: '#757575', padding: '2px 7px', borderRadius: 4 }}>EXPIRED</span>;
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
      const snap  = await getDocs(query(collection(db,'users',uid,'rulings'), orderBy('ts','desc')));
      const all   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const forAcct = all.filter(r => !r.account || r.account === account || r.account.split('+').includes(account));
      setRulings(forAcct);
      const tickers = [...new Set(forAcct.map(r => r.ticker).filter(Boolean))];
      if (tickers.length) getQuotes(tickers).then(q => setLiveQuotes(q)).catch(() => {});
      const cutoff = Date.now() - 30 * 86400 * 1000;
      const needs  = forAcct.filter(r => !r.outcomeCheckedAt && r.ts?.toDate && r.ts.toDate().getTime() < cutoff);
      if (needs.length) {
        setGrading(true);
        const gq = await getQuotes([...new Set(needs.map(r => r.ticker).filter(Boolean))]).catch(() => ({}));
        await Promise.allSettled(needs.map(r => {
          const q = gq[r.ticker]; const price = q?.price > 0 ? q.price : q?.prevClose;
          if (!price) return Promise.resolve();
          const tp = parsePrice(r.takeProfit), sl = parsePrice(r.stopLoss);
          let outcome = 'expired';
          if (!isNaN(tp) && price >= tp) outcome = 'target';
          else if (!isNaN(sl) && price <= sl) outcome = 'stop';
          return updateDoc(doc(db,'users',uid,'rulings',r.id), { outcomeCheckedAt: new Date().toISOString(), priceAt30d: price, outcome });
        }));
        setGrading(false);
        const snap2 = await getDocs(query(collection(db,'users',uid,'rulings'), orderBy('ts','desc')));
        const all2  = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
        setRulings(all2.filter(r => !r.account || r.account === account || r.account.split('+').includes(account)));
      }
    } catch (e) { console.error('AlphaTracker:', e); }
    finally { setLoading(false); }
  }

  const stats = useMemo(() => {
    const graded = rulings.filter(r => r.outcome);
    const targetHit = graded.filter(r => r.outcome === 'target').length;
    const stopped   = graded.filter(r => r.outcome === 'stop').length;
    const withReturn = graded.filter(r => r.priceAt30d && r.priceAtCall);
    const avgReturn  = withReturn.length ? withReturn.reduce((s,r) => s + (r.priceAt30d - r.priceAtCall) / r.priceAtCall * 100, 0) / withReturn.length : null;
    const agentAcc = {};
    AGENTS.forEach(a => {
      let correct = 0, total = 0;
      graded.forEach(r => {
        const st = r.agentStances?.[a.id]?.stance; if (!st) return;
        const bull = ['PASS','BUY'].includes(st), bear = ['FAIL','BEARISH'].includes(st);
        if (bull || bear) { total++; if (bull && r.outcome === 'target') correct++; if (bear && (r.outcome === 'stop' || r.outcome === 'expired')) correct++; }
      });
      agentAcc[a.id] = { correct, total, pct: total > 0 ? Math.round(correct / total * 100) : null };
    });
    return { total: rulings.length, buyCalls: rulings.filter(r => r.verdict === 'BUY').length, graded: graded.length, targetHit, stopped, avgReturn, agentAcc };
  }, [rulings]);

  if (loading) return (
    <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 8, color: '#757575' }}>
      <Loader2 size={14} className="animate-spin" /><span style={{ fontSize: 12 }}>Loading alpha tracker…</span>
    </div>
  );

  const card = { background: '#F7F7F7', border: '1px solid #EEEEEE', borderRadius: 12, padding: '14px 16px' };

  return (
    <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart2 size={15} style={{ color: '#000000' }} />
          <span style={{ ...MONO, fontSize: 11, letterSpacing: '0.08em', color: '#757575', fontWeight: 600 }}>ALPHA TRACKER · ALL-TIME</span>
        </div>
        {grading && <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#757575' }}><Loader2 size={11} className="animate-spin" /><span style={{ ...MONO, fontSize: 10 }}>GRADING…</span></div>}
      </div>

      {rulings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: '#F7F7F7', border: '1px dashed #DDDDDD', borderRadius: 12 }}>
          <BarChart2 size={26} style={{ color: '#CCCCCC', margin: '0 auto 10px' }} />
          <p style={{ fontSize: 14, color: '#757575', margin: '0 0 4px' }}>No rulings yet.</p>
          <p style={{ ...MONO, fontSize: 11, color: '#AAAAAA', margin: 0 }}>Run a council on any ticker to start building your track record.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }} className="sm:grid-cols-4">
            {[
              { label: 'TOTAL CALLS',    value: String(stats.total),                                               sub: `${stats.buyCalls} BUY · ${stats.total - stats.buyCalls} WATCH/PASS` },
              { label: 'TARGET HIT',     value: stats.graded ? `${Math.round(stats.targetHit/stats.graded*100)}%` : '—', sub: `${stats.targetHit} of ${stats.graded} graded`, color: GRN },
              { label: 'STOPPED OUT',    value: stats.graded ? `${Math.round(stats.stopped/stats.graded*100)}%`   : '—', sub: `${stats.stopped} losses`,                color: RED },
              { label: 'AVG 30D RETURN', value: stats.avgReturn != null ? `${stats.avgReturn >= 0 ? '+' : ''}${stats.avgReturn.toFixed(1)}%` : '—', sub: `${stats.graded} graded`, color: stats.avgReturn != null ? (stats.avgReturn >= 0 ? GRN : RED) : undefined },
            ].map((c,i) => (
              <div key={i} style={card}>
                <div style={{ ...MONO, fontSize: 9, color: '#AAAAAA', letterSpacing: '0.08em', marginBottom: 5 }}>{c.label}</div>
                <div style={{ ...MONO, fontSize: 22, fontWeight: 700, color: c.color || '#000000', lineHeight: 1 }}>{c.value}</div>
                <div style={{ ...MONO, fontSize: 10, color: '#AAAAAA', marginTop: 4 }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {stats.graded >= 5 && (
            <div style={card}>
              <div style={{ ...MONO, fontSize: 10, color: '#AAAAAA', letterSpacing: '0.08em', marginBottom: 14 }}>AGENT ACCURACY · ALL-TIME</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 10 }}>
                {AGENTS.map(a => {
                  const s = stats.agentAcc[a.id];
                  const barColor = s.pct == null ? '#EEEEEE' : s.pct >= 65 ? GRN : s.pct >= 45 ? '#F59E0B' : RED;
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ background: `${a.accent}15`, borderRadius: 7, padding: 7, flexShrink: 0 }}><a.icon size={11} style={{ color: a.accent }} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ ...MONO, fontSize: 10, color: '#757575' }}>{a.name.split(' ')[0]}</span>
                          <span style={{ ...MONO, fontSize: 10, fontWeight: 700, color: barColor }}>{s.pct != null ? `${s.pct}%` : '—'}</span>
                        </div>
                        <div style={{ height: 3, borderRadius: 2, overflow: 'hidden', background: '#EEEEEE' }}>
                          <div style={{ width: `${s.pct || 0}%`, background: barColor, height: '100%', transition: 'width .5s ease' }} />
                        </div>
                        <div style={{ ...MONO, fontSize: 9, color: '#CCCCCC', marginTop: 2 }}>{s.total} call{s.total !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ border: '1px solid #EEEEEE', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                <thead>
                  <tr style={{ background: '#F7F7F7', borderBottom: '1px solid #EEEEEE' }}>
                    {['DATE','TICKER','VERDICT','CONV','PRICE@CALL','30D / NOW','MOVE','OUTCOME'].map(h => (
                      <th key={h} style={{ ...MONO, fontSize: 9, color: '#AAAAAA', letterSpacing: '0.08em', padding: '8px 10px', textAlign: 'left', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rulings.map((r, i) => {
                    const vs = r.verdict ? STANCE_STYLE[r.verdict === 'PASS' ? 'PASS_FINAL' : r.verdict] : null;
                    const lq = liveQuotes[r.ticker];
                    const livePrice    = lq?.price > 0 ? lq.price : lq?.prevClose;
                    const displayPrice = r.outcome ? r.priceAt30d : livePrice;
                    const move = moveStr(r.priceAtCall, displayPrice);
                    return (
                      <tr key={r.id} style={{ borderBottom: i < rulings.length - 1 ? '1px solid #F0F0F0' : undefined, background: i % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                        <td style={{ ...MONO, fontSize: 11, color: '#AAAAAA', padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmt(r.ts)}</td>
                        <td style={{ ...MONO, fontSize: 12, fontWeight: 600, color: '#000000', padding: '8px 10px', letterSpacing: '0.06em' }}>{r.ticker}</td>
                        <td style={{ padding: '8px 10px' }}>{vs && <span style={{ ...MONO, background: vs.bg, color: vs.fg, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>{vs.label}</span>}</td>
                        <td style={{ ...MONO, fontSize: 11, color: '#757575', padding: '8px 10px' }}>{r.conviction ?? '—'}/10</td>
                        <td style={{ ...MONO, fontSize: 11, color: '#757575', padding: '8px 10px' }}>{r.priceAtCall ? `$${r.priceAtCall.toFixed(2)}` : '—'}</td>
                        <td style={{ ...MONO, fontSize: 11, color: '#757575', padding: '8px 10px' }}>{displayPrice ? `$${displayPrice.toFixed(2)}` : '—'}</td>
                        <td style={{ padding: '8px 10px' }}>
                          {move != null
                            ? <span style={{ ...MONO, fontSize: 11, fontWeight: 600, color: move >= 0 ? GRN : RED }}>{move >= 0 ? '+' : ''}{move.toFixed(1)}%</span>
                            : <span style={{ ...MONO, fontSize: 11, color: '#CCCCCC' }}>—</span>}
                        </td>
                        <td style={{ padding: '8px 10px' }}><OutcomeBadge outcome={r.outcome} /></td>
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
