import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, MessageCircle, Lightbulb, Check, XCircle, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { AGENTS, AXIOM_AVATAR, AGENT_SHORT_ID } from '../../constants/agents.js';
import { MONO, DISP } from '../../constants/styles.js';
import { theme } from '../../utils/theme.js';
import { severityColor, verdictColor, stanceColor } from '../../utils/networkGraph.js';
import { loadProposals, setProposalStatus } from '../../utils/agentProposals.js';
import { toast } from '../../utils/toast.js';

function Sheet({ dark, onClose, children }) {
  const T = theme(dark);
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        style={{ width: '100%', maxHeight: '85vh', background: dark ? '#0F0F12' : '#FFFFFF', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border }} />
        </div>
        <button onClick={onClose} style={{ position: 'absolute', top: 10, right: 14, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <X size={18} style={{ color: T.text3 }} />
        </button>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 24px', WebkitOverflowScrolling: 'touch' }}>
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

function ConvictionBar({ value = 5, color }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', width: 70 }}>
      <div style={{ width: `${(value / 10) * 100}%`, height: '100%', background: color, borderRadius: 3 }} />
    </div>
  );
}

function ProposalsSection({ uid, agentId, dark, T }) {
  const [proposals, setProposals] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [copiedFor, setCopiedFor] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadProposals(uid, agentId).then(p => { if (!cancelled) setProposals(p); });
    return () => { cancelled = true; };
  }, [uid, agentId]);

  async function review(proposalId, status) {
    const ok = await setProposalStatus(uid, proposalId, status);
    if (ok) {
      setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, status } : p));
      toast?.success?.(status === 'approved' ? 'Proposal approved' : 'Proposal rejected');
    }
  }

  function copySpec(text) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedFor(text.slice(0, 20));
      setTimeout(() => setCopiedFor(null), 1500);
    }).catch(() => {});
  }

  if (proposals === null) return <p style={{ ...MONO, fontSize: 11, color: T.text3 }}>Loading proposals…</p>;
  if (!proposals.length) return <p style={{ ...MONO, fontSize: 11, color: T.text3 }}>No self-improvement proposals filed yet — generated automatically every 7 days after a scan.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {proposals.map(doc => (doc.proposals || []).map((p, i) => {
        const key = `${doc.id}_${i}`;
        const isOpen = expandedId === key;
        const statusColor = doc.status === 'approved' ? '#22C55E' : doc.status === 'rejected' ? '#EF4444' : '#F59E0B';
        return (
          <div key={key} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, opacity: doc.status === 'rejected' ? 0.55 : 1 }}>
            <div onClick={() => setExpandedId(isOpen ? null : key)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              {doc.status === 'approved' ? <Check size={14} color="#22C55E" /> : doc.status === 'rejected' ? <XCircle size={14} color="#EF4444" /> : <Lightbulb size={14} color="#F59E0B" />}
              <p style={{ fontSize: 12, fontWeight: 600, color: T.text, margin: 0, flex: 1, textDecoration: doc.status === 'rejected' ? 'line-through' : 'none' }}>{p.title}</p>
              {isOpen ? <ChevronUp size={14} color={T.text3} /> : <ChevronDown size={14} color={T.text3} />}
            </div>
            <span style={{ ...MONO, fontSize: 9, color: statusColor, marginLeft: 22 }}>{doc.status.toUpperCase()}</span>
            {isOpen && (
              <div style={{ marginTop: 10, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div><span style={{ ...MONO, fontSize: 9, color: T.text3 }}>WHY</span><p style={{ fontSize: 12, color: T.text2, margin: '2px 0 0', lineHeight: 1.5 }}>{p.why}</p></div>
                <div><span style={{ ...MONO, fontSize: 9, color: T.text3 }}>HOW</span><p style={{ fontSize: 12, color: T.text2, margin: '2px 0 0', lineHeight: 1.5 }}>{p.how}</p></div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ ...MONO, fontSize: 9, color: T.text3 }}>CODE SPEC</span>
                    <button onClick={() => copySpec(p.codeSpec || '')} style={{ ...MONO, fontSize: 9, color: T.accent, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Copy size={10} /> {copiedFor === (p.codeSpec || '').slice(0, 20) ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <pre style={{ ...MONO, fontSize: 10, color: T.text2, background: dark ? '#000' : '#f4f4f5', border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{p.codeSpec}</pre>
                </div>
                {p.impact && <p style={{ ...MONO, fontSize: 10, color: '#F59E0B', margin: 0 }}>Impact: {p.impact}</p>}
                {doc.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button onClick={() => review(doc.id, 'approved')} style={{ ...MONO, fontSize: 11, background: 'rgba(34,197,94,0.15)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>Approve</button>
                    <button onClick={() => review(doc.id, 'rejected')} style={{ ...MONO, fontSize: 11, background: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>Reject</button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }))}
    </div>
  );
}

export default function NodeInfoPanel({ node, uid, dark, onClose, onOpenChat }) {
  const T = theme(dark);
  const [extra, setExtra] = useState(null);
  const [showProposals, setShowProposals] = useState(false);

  useEffect(() => {
    setExtra(null);
    setShowProposals(false);
    if (!node || !uid) return;
    let cancelled = false;

    async function load() {
      if (node.type === 'agent') {
        try {
          // agent_observations (Layer 0 win/loss track) is keyed by the LONG agent id
          // (technical/catalyst/...); agent_feed (cron) is keyed by the SHORT id (rex/nova/...).
          const obsQ = query(collection(db, 'users', uid, 'agent_observations'), where('agentId', '==', node.metadata.longId || node.refId), where('resolved', '==', true));
          const feedQ = query(collection(db, 'users', uid, 'agent_feed'), where('agentId', '==', node.refId), orderBy('createdAt', 'desc'), limit(5));
          const [obsSnap, feedSnap] = await Promise.all([getDocs(obsQ).catch(() => null), getDocs(feedQ).catch(() => null)]);
          const obs = (obsSnap?.docs || []).map(d => d.data())
            .sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0))
            .slice(0, 5);
          const feed = (feedSnap?.docs || []).map(d => ({ id: d.id, ...d.data() }));
          if (!cancelled) setExtra({ lastCalls: obs, feed });
        } catch { if (!cancelled) setExtra({ lastCalls: [], feed: [] }); }
      } else if (node.type === 'holding') {
        try {
          const feedQ = query(collection(db, 'users', uid, 'agent_feed'), orderBy('createdAt', 'desc'), limit(40));
          const reportsQ = query(collection(db, 'users', uid, 'council_reports'), orderBy('createdAt', 'desc'), limit(5));
          const [feedSnap, reportsSnap] = await Promise.all([getDocs(feedQ).catch(() => null), getDocs(reportsQ).catch(() => null)]);
          const feed = (feedSnap?.docs || []).map(d => ({ id: d.id, ...d.data() }))
            .filter(f => f.ticker === node.refId || f.tickers?.includes(node.refId)).slice(0, 5);
          let latestVerdict = null;
          for (const d of (reportsSnap?.docs || [])) {
            const r = d.data();
            if (r.results?.[node.refId]) { latestVerdict = { ...r.results[node.refId], date: r.createdAt }; break; }
          }
          if (!cancelled) setExtra({ feed, latestVerdict });
        } catch { if (!cancelled) setExtra({ feed: [], latestVerdict: null }); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [node?.id, uid]);

  if (!node) return null;

  // ---- Agent node ----
  if (node.type === 'agent') {
    const m = node.metadata;
    const isAxiom = m.agentId === 'axiom';
    return (
      <Sheet dark={dark} onClose={onClose}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 14 }}>
          <img src={m.avatar} alt={m.name} style={{ width: 44, height: 44, borderRadius: 12, objectFit: 'cover' }} />
          <div>
            <div style={{ ...DISP, fontSize: 16, fontWeight: 700, color: node.color }}>{m.name}</div>
            <div style={{ ...MONO, fontSize: 10, color: T.text3 }}>{m.role}</div>
          </div>
        </div>

        {!isAxiom && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
            <div>
              <div style={{ ...MONO, fontSize: 9, color: T.text3 }}>WIN RATE</div>
              <div style={{ ...DISP, fontSize: 18, color: m.winRate == null ? T.text3 : m.winRate > 0.6 ? '#22C55E' : m.winRate < 0.4 ? '#EF4444' : T.text }}>
                {m.winRate == null ? '—' : `${(m.winRate * 100).toFixed(0)}%`}
              </div>
            </div>
            <div>
              <div style={{ ...MONO, fontSize: 9, color: T.text3 }}>CALLS TRACKED</div>
              <div style={{ ...DISP, fontSize: 18, color: T.text }}>{m.totalCalls}</div>
            </div>
            {m.globalOutlook && (
              <div>
                <div style={{ ...MONO, fontSize: 9, color: T.text3 }}>GLOBAL OUTLOOK</div>
                <div style={{ ...DISP, fontSize: 14, color: stanceColor(m.globalOutlook), textTransform: 'uppercase' }}>{m.globalOutlook}</div>
              </div>
            )}
          </div>
        )}

        {extra?.lastCalls?.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ ...MONO, fontSize: 10, color: T.text3, marginBottom: 6 }}>LAST 5 CALLS</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {extra.lastCalls.map((c, i) => (
                <span key={i} style={{ ...MONO, fontSize: 10, padding: '3px 8px', borderRadius: 6, background: c.resolution === 'WIN' ? 'rgba(34,197,94,0.15)' : c.resolution === 'LOSS' ? 'rgba(239,68,68,0.15)' : 'rgba(120,120,120,0.15)', color: c.resolution === 'WIN' ? '#22C55E' : c.resolution === 'LOSS' ? '#EF4444' : T.text3 }}>
                  {c.ticker} {c.resolution}
                </span>
              ))}
            </div>
          </div>
        )}

        {m.stances?.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ ...MONO, fontSize: 10, color: T.text3, marginBottom: 6 }}>CURRENT STANCES</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {m.stances.map(s => (
                <div key={s.ticker} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                  <span style={{ ...MONO, fontSize: 11, color: T.text }}>{s.ticker}</span>
                  <span style={{ ...MONO, fontSize: 10, color: stanceColor(s.stance), textTransform: 'uppercase' }}>{s.stance}</span>
                  <ConvictionBar value={s.conviction} color={stanceColor(s.stance)} />
                </div>
              ))}
            </div>
          </div>
        )}

        {extra?.feed?.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ ...MONO, fontSize: 10, color: T.text3, marginBottom: 6 }}>RECENT FEED</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {extra.feed.map(f => (
                <p key={f.id} style={{ fontSize: 12, color: T.text2, margin: 0, lineHeight: 1.4 }}>
                  <span style={{ color: severityColor(f.severity) }}>●</span> {f.headline}
                </p>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={() => onOpenChat(m.agentId)} style={{ ...MONO, fontSize: 12, fontWeight: 600, background: node.color, color: '#000', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' }}>
            <MessageCircle size={14} /> Talk to {m.name}
          </button>
          {!isAxiom && (
            <button onClick={() => setShowProposals(v => !v)} style={{ ...MONO, fontSize: 12, background: 'none', border: `1px solid ${T.border}`, color: T.text2, borderRadius: 8, padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Lightbulb size={14} /> Proposals{m.pendingProposals > 0 ? ` (${m.pendingProposals})` : ''}
            </button>
          )}
        </div>

        {showProposals && <div style={{ marginTop: 16 }}><ProposalsSection uid={uid} agentId={m.agentId} dark={dark} T={T} /></div>}
      </Sheet>
    );
  }

  // ---- Holding node ----
  if (node.type === 'holding') {
    const m = node.metadata;
    return (
      <Sheet dark={dark} onClose={onClose}>
        <div style={{ marginTop: 8, marginBottom: 14 }}>
          <div style={{ ...DISP, fontSize: 20, fontWeight: 700, color: T.text }}>{m.ticker}</div>
          <div style={{ ...MONO, fontSize: 13, color: T.text2 }}>
            {m.price != null ? `$${m.price.toFixed(2)}` : 'price unavailable'}
            {m.dayChange != null && <span style={{ color: m.dayChange >= 0 ? '#22C55E' : '#EF4444', marginLeft: 8 }}>{m.dayChange >= 0 ? '+' : ''}{m.dayChange.toFixed(2)}%</span>}
          </div>
          <div style={{ ...MONO, fontSize: 11, color: node.color, marginTop: 4 }}>{m.consensusStance} CONSENSUS ({m.stances.filter(s=>s.stance==='bullish').length}/{m.stances.length} bullish)</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ ...MONO, fontSize: 10, color: T.text3, marginBottom: 6 }}>AGENT STANCES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {AGENTS.map(ag => {
              const s = m.stances.find(x => x.agentId === AGENT_SHORT_ID[ag.id]);
              return (
                <div key={ag.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={ag.avatar} style={{ width: 18, height: 18, borderRadius: 4 }} alt={ag.name} />
                  <span style={{ ...MONO, fontSize: 11, color: T.text, width: 46 }}>{ag.name}</span>
                  <span style={{ ...MONO, fontSize: 10, color: s ? stanceColor(s.stance) : T.text3, textTransform: 'uppercase', flex: 1 }}>{s ? s.stance : 'no data'}</span>
                  {s && <ConvictionBar value={s.conviction} color={stanceColor(s.stance)} />}
                </div>
              );
            })}
          </div>
        </div>

        {extra?.latestVerdict && (
          <div style={{ marginBottom: 14, padding: 12, background: `${verdictColor(extra.latestVerdict.finalVerdict)}12`, border: `1px solid ${verdictColor(extra.latestVerdict.finalVerdict)}30`, borderRadius: 10 }}>
            <div style={{ ...MONO, fontSize: 10, color: verdictColor(extra.latestVerdict.finalVerdict), fontWeight: 700, marginBottom: 4 }}>LATEST COUNCIL VERDICT: {extra.latestVerdict.finalVerdict}</div>
            <p style={{ fontSize: 12, color: T.text2, margin: 0, lineHeight: 1.5 }}>{extra.latestVerdict.summary}</p>
          </div>
        )}

        {extra?.feed?.length > 0 && (
          <div>
            <div style={{ ...MONO, fontSize: 10, color: T.text3, marginBottom: 6 }}>RECENT EVENTS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {extra.feed.map(f => (
                <p key={f.id} style={{ fontSize: 12, color: T.text2, margin: 0, lineHeight: 1.4 }}>
                  <span style={{ color: severityColor(f.severity) }}>●</span> {f.headline}
                </p>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    );
  }

  // ---- Event node ----
  if (node.type === 'event') {
    const m = node.metadata;
    return (
      <Sheet dark={dark} onClose={onClose}>
        <div style={{ marginTop: 8, marginBottom: 10 }}>
          <span style={{ ...MONO, fontSize: 10, fontWeight: 700, color: severityColor(m.severity), background: `${severityColor(m.severity)}18`, padding: '3px 9px', borderRadius: 6 }}>{(m.severity || 'info').toUpperCase()}</span>
        </div>
        <p style={{ ...DISP, fontSize: 15, fontWeight: 600, color: T.text, margin: '0 0 8px' }}>{m.headline}</p>
        <p style={{ fontSize: 13, color: T.text2, lineHeight: 1.6, margin: '0 0 14px' }}>{m.detail}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {(m.tickers || (m.ticker ? [m.ticker] : [])).map(t => (
            <span key={t} style={{ ...MONO, fontSize: 10, padding: '3px 9px', borderRadius: 6, background: T.bgCard, border: `1px solid ${T.border}`, color: T.text2 }}>{t}</span>
          ))}
        </div>
        <div style={{ ...MONO, fontSize: 10, color: T.text3 }}>
          {m.agentId?.toUpperCase()} · {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
        </div>
      </Sheet>
    );
  }

  // ---- Insight node ----
  if (node.type === 'insight') {
    const m = node.metadata;
    return (
      <Sheet dark={dark} onClose={onClose}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 12 }}>
          <img src={AXIOM_AVATAR} alt="AXIOM" style={{ width: 36, height: 36, borderRadius: 8 }} />
          <div>
            <div style={{ ...DISP, fontSize: 15, fontWeight: 700, color: verdictColor(m.verdict) }}>{m.verdict} · {m.ticker}</div>
            <div style={{ ...MONO, fontSize: 10, color: T.text3 }}>{m.portfolioLabel} · conviction {m.conviction}/10</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: T.text2, lineHeight: 1.6, margin: '0 0 12px' }}>{m.summary}</p>
        {m.dissent && (
          <div style={{ padding: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, marginBottom: 12 }}>
            <span style={{ ...MONO, fontSize: 9, color: '#EF4444' }}>DISSENT</span>
            <p style={{ fontSize: 12, color: T.text2, margin: '4px 0 0' }}>{m.dissent}</p>
          </div>
        )}
        {m.agentTakes?.length > 0 && (
          <div>
            <div style={{ ...MONO, fontSize: 10, color: T.text3, marginBottom: 6 }}>ALL 6 AGENT TAKES</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {m.agentTakes.map((t, i) => (
                <div key={i} style={{ padding: '8px 10px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: T.text }}>{t.agent}</span>
                    <span style={{ ...MONO, fontSize: 10, color: verdictColor(t.verdict) }}>{t.verdict}</span>
                  </div>
                  <p style={{ fontSize: 11, color: T.text2, margin: 0, lineHeight: 1.4 }}>{t.reasoning}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    );
  }

  // ---- Connection (edge) ----
  if (node.type === 'connection') {
    const e = node.edge;
    const srcLabel = node.source?.label, tgtLabel = node.target?.label;
    return (
      <Sheet dark={dark} onClose={onClose}>
        <div style={{ marginTop: 8, marginBottom: 12 }}>
          <div style={{ ...DISP, fontSize: 15, fontWeight: 700, color: T.text }}>{srcLabel} ↔ {tgtLabel}</div>
          <div style={{ ...MONO, fontSize: 10, color: T.text3, marginTop: 2 }}>{e.kind.replace('-', ' ').toUpperCase()}</div>
        </div>
        {e.kind === 'stance' && e.metadata && (
          <div>
            <p style={{ fontSize: 13, color: T.text2, margin: '0 0 6px' }}><strong style={{ color: stanceColor(e.metadata.stance) }}>{e.metadata.stance?.toUpperCase()}</strong> · conviction {e.metadata.conviction}/10</p>
            <p style={{ fontSize: 12, color: T.text2, lineHeight: 1.5, margin: 0 }}>{e.metadata.reasoning}</p>
          </div>
        )}
        {e.kind === 'agent-agent' && e.metadata && (
          <div>
            <p style={{ fontSize: 12, color: T.text2, margin: '0 0 6px' }}>Both analyzed: {e.metadata.tickers.join(', ')}</p>
            <p style={{ ...MONO, fontSize: 11, color: e.metadata.disagreements > 0 ? '#EF4444' : '#22C55E' }}>
              {e.metadata.disagreements > 0 ? `Disagree on ${e.metadata.disagreements} name${e.metadata.disagreements > 1 ? 's' : ''}` : 'Fully aligned'}
            </p>
          </div>
        )}
        {e.kind === 'detected' && <p style={{ fontSize: 12, color: T.text2 }}>{srcLabel} detected this event.</p>}
        {e.kind === 'about' && <p style={{ fontSize: 12, color: T.text2 }}>This event concerns {tgtLabel}.</p>}
        {e.kind === 'insight' && <p style={{ fontSize: 12, color: T.text2 }}>Council verdict covering {tgtLabel}.</p>}
        {e.kind === 'hub' && <p style={{ fontSize: 12, color: T.text2 }}>AXIOM synthesizes {tgtLabel}'s input on every ruling.</p>}
        {e.kind === 'verdict' && <p style={{ fontSize: 12, color: T.text2 }}>AXIOM's synthesized verdict.</p>}
      </Sheet>
    );
  }

  return null;
}
