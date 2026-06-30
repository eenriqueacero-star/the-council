import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, X, ChevronDown, ChevronRight, FileText, Share2 } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { AGENTS, AXIOM_AVATAR } from '../constants/agents.js';
import { MONO, DISP } from '../constants/styles.js';
import { theme } from '../utils/theme.js';

const VERDICT = {
  HOLD: { fg: '#22C55E', bg: 'rgba(34,197,94,0.12)',   label: 'HOLD' },
  ADD:  { fg: '#3B82F6', bg: 'rgba(59,130,246,0.12)',  label: 'ADD'  },
  TRIM: { fg: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  label: 'TRIM' },
  EXIT: { fg: '#EF4444', bg: 'rgba(239,68,68,0.12)',   label: 'EXIT' },
};

const STANCE_COLOR = { bullish: '#22C55E', bearish: '#EF4444', neutral: '#71717A' };

// Build agent info map from constants (avatar + color by name)
const AG_MAP = {};
AGENTS.forEach(a => { AG_MAP[a.name] = { color: a.color, avatar: a.avatar }; });
AG_MAP['AXIOM'] = { color: '#F59E0B', avatar: AXIOM_AVATAR };

function VerdictBadge({ verdict, small }) {
  const v = VERDICT[verdict] || VERDICT.HOLD;
  return (
    <span style={{
      ...MONO,
      background: v.bg, color: v.fg,
      fontSize: small ? 9 : 10, fontWeight: 700,
      padding: small ? '2px 7px' : '3px 10px',
      borderRadius: 99, whiteSpace: 'nowrap',
    }}>{v.label}</span>
  );
}

function ConvictionBar({ value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 52, height: 4, borderRadius: 2, background: 'rgba(120,120,120,0.2)', overflow: 'hidden' }}>
        <div style={{ width: `${(value / 10) * 100}%`, height: '100%', background: color || '#3B82F6', borderRadius: 2 }} />
      </div>
      <span style={{ ...MONO, fontSize: 9, color: 'rgba(120,120,120,0.8)' }}>{value}/10</span>
    </div>
  );
}

function AgentTakeCard({ take, dark }) {
  const T = theme(dark);
  const info = AG_MAP[take.agent] || { color: '#52525B', avatar: null };
  const stanceColor = STANCE_COLOR[take.stance] || T.text3;
  const verdict = VERDICT[take.verdict] || VERDICT.HOLD;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '10px 12px',
      background: `${info.color}08`,
      border: `1px solid ${info.color}20`,
      borderLeft: `3px solid ${info.color}`,
      borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {info.avatar ? (
          <img src={info.avatar} alt={take.agent} style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 24, height: 24, borderRadius: 6, background: `${info.color}22`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ ...MONO, fontSize: 8, color: info.color, fontWeight: 700 }}>{take.agent.slice(0, 2)}</span>
          </div>
        )}
        <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: info.color }}>{take.agent}</span>
        <span style={{ ...MONO, fontSize: 10, color: stanceColor }}>{take.stance}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ConvictionBar value={take.conviction} color={info.color} />
          <VerdictBadge verdict={take.verdict} small />
        </div>
      </div>
      <p style={{ ...MONO, fontSize: 11, color: T.text2, margin: 0, lineHeight: 1.5 }}>{take.reasoning}</p>
    </div>
  );
}

function TickerRow({ ticker, result, dark, expanded, onToggle }) {
  const T = theme(dark);
  const verdict = VERDICT[result.finalVerdict] || VERDICT.HOLD;
  return (
    <div>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '10px 0', textAlign: 'left',
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: T.text, minWidth: 52 }}>{ticker}</span>
        <VerdictBadge verdict={result.finalVerdict} />
        <span style={{ ...MONO, fontSize: 10, color: T.text3, flex: 1, textAlign: 'left' }}>
          {result.confidence}/10 confidence
        </span>
        {expanded
          ? <ChevronDown size={14} style={{ color: T.text3, flexShrink: 0 }} />
          : <ChevronRight size={14} style={{ color: T.text3, flexShrink: 0 }} />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ paddingBottom: 16, paddingTop: 4 }}>
              {/* AXIOM summary */}
              <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <img src={AXIOM_AVATAR} alt="AXIOM" style={{ width: 20, height: 20, borderRadius: 5, objectFit: 'cover' }} />
                  <span style={{ ...MONO, fontSize: 10, fontWeight: 700, color: '#F59E0B' }}>AXIOM · FINAL VERDICT</span>
                  <VerdictBadge verdict={result.finalVerdict} small />
                </div>
                <p style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.8)', margin: 0, lineHeight: 1.55 }}>{result.summary}</p>
                {result.dissent && (
                  <p style={{ ...MONO, fontSize: 10, color: '#F59E0B99', margin: '6px 0 0', lineHeight: 1.4 }}>Dissent: {result.dissent}</p>
                )}
              </div>

              {/* Agent takes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(result.agentTakes || []).map((take, i) => (
                  <AgentTakeCard key={i} take={take} dark={dark} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReportDetailSheet({ report, dark, onClose }) {
  const T = theme(dark);
  const [expandedTicker, setExpandedTicker] = useState(null);
  const [shareFeedback, setShareFeedback] = useState(null);

  async function handleShare() {
    const result = await shareReport(report);
    if (result === 'copied') {
      setShareFeedback('Copied!');
      setTimeout(() => setShareFeedback(null), 2000);
    }
  }

  const dateStr = report.createdAt?.toDate
    ? report.createdAt.toDate().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : 'Date unknown';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        style={{
          width: '100%', maxHeight: '92vh',
          background: dark ? '#0F0F12' : '#FFFFFF',
          borderRadius: '20px 20px 0 0',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border }} />
        </div>

        {/* Header */}
        <div style={{ padding: '8px 20px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <img src={AXIOM_AVATAR} alt="AXIOM" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Crown size={13} style={{ color: '#F59E0B' }} />
              <span style={{ ...DISP, fontSize: 13, fontWeight: 600, color: T.text }}>Weekly Council · {report.portfolioLabel}</span>
            </div>
            <span style={{ ...MONO, fontSize: 10, color: T.text3 }}>{dateStr}</span>
          </div>
          <button onClick={handleShare} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, position: 'relative' }}>
            {shareFeedback
              ? <span style={{ ...MONO, fontSize: 10, color: '#22C55E' }}>{shareFeedback}</span>
              : <Share2 size={16} style={{ color: T.text3 }} />}
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={18} style={{ color: T.text3 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', WebkitOverflowScrolling: 'touch' }}>
          {/* Overall summary */}
          <div style={{ padding: '10px 14px', background: `${T.accent}0f`, border: `1px solid ${T.accent}25`, borderRadius: 10, marginBottom: 20 }}>
            <p style={{ ...MONO, fontSize: 12, color: T.text2, margin: 0, lineHeight: 1.6 }}>{report.overallSummary}</p>
          </div>

          {/* Holdings */}
          <div>
            {(report.holdings || Object.keys(report.results || {})).map(ticker => {
              const result = report.results?.[ticker];
              if (!result) return null;
              return (
                <TickerRow
                  key={ticker}
                  ticker={ticker}
                  result={result}
                  dark={dark}
                  expanded={expandedTicker === ticker}
                  onToggle={() => setExpandedTicker(prev => prev === ticker ? null : ticker)}
                />
              );
            })}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function buildShareText(report) {
  const date = report.createdAt?.toDate
    ? report.createdAt.toDate().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'This week';
  const lines = [`📊 Weekly Council Report — ${date}`];
  for (const [ticker, result] of Object.entries(report.results || {})) {
    lines.push(`${ticker}: ${result.finalVerdict} (${result.confidence}/10 confidence)`);
  }
  if (report.overallSummary) {
    lines.push('', report.overallSummary);
  }
  lines.push('', '— The Council');
  return lines.join('\n');
}

async function shareReport(report) {
  const text = buildShareText(report);
  if (navigator.share) {
    try { await navigator.share({ title: 'The Council — Weekly Report', text }); return; } catch {}
  }
  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'error';
  }
}

function reportDateStr(ts) {
  if (!ts) return 'Unknown';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function verdictSummary(results) {
  const vc = { HOLD: 0, ADD: 0, TRIM: 0, EXIT: 0 };
  for (const r of Object.values(results || {})) vc[r.finalVerdict] = (vc[r.finalVerdict] || 0) + 1;
  return Object.entries(vc).filter(([, n]) => n > 0).map(([k, n]) => ({ k, n, ...VERDICT[k] }));
}

export default function CouncilReports({ dark }) {
  const T = theme(dark);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    const q = query(
      collection(db, 'users', uid, 'council_reports'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const unsub = onSnapshot(q, snap => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
      {[1, 2, 3].map(i => (
        <div key={i} className="skeleton-shimmer" style={{ height: 80, borderRadius: 12 }} />
      ))}
    </div>
  );

  if (!reports.length) return (
    <div style={{ padding: '40px 20px', textAlign: 'center', border: `1px dashed ${T.border}`, borderRadius: 16, marginTop: 16 }}>
      <FileText size={28} style={{ margin: '0 auto 12px', opacity: 0.2, color: T.text3, display: 'block' }} />
      <p style={{ color: T.text3, fontSize: 14, margin: 0 }}>No weekly council reports yet.</p>
      <p style={{ ...MONO, color: T.text3, fontSize: 11, marginTop: 4, opacity: 0.6 }}>Reports are generated every Monday at 8am ET.</p>
    </div>
  );

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        {reports.map((report, idx) => {
          const vcList = verdictSummary(report.results);
          return (
            <motion.div
              key={report.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: idx * 0.04 }}
              onClick={() => setSelected(report)}
              style={{
                background: T.bgCard,
                border: `1px solid ${T.border}`,
                borderLeft: `3px solid #F59E0B`,
                borderRadius: 12,
                padding: '14px 16px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={AXIOM_AVATAR} alt="AXIOM" style={{ width: 26, height: 26, borderRadius: 7, objectFit: 'cover' }} />
                  <div>
                    <div style={{ ...MONO, fontSize: 11, fontWeight: 700, color: '#F59E0B' }}>
                      {report.portfolioLabel || 'Portfolio'}
                    </div>
                    <div style={{ ...MONO, fontSize: 10, color: T.text3 }}>{reportDateStr(report.createdAt)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {vcList.map(({ k, n, fg, bg }) => (
                    <span key={k} style={{ ...MONO, fontSize: 9, fontWeight: 700, color: fg, background: bg, padding: '2px 6px', borderRadius: 99 }}>
                      {n} {k}
                    </span>
                  ))}
                </div>
              </div>
              <p style={{ ...MONO, fontSize: 11, color: T.text2, margin: 0, lineHeight: 1.5 }}>
                {report.overallSummary?.slice(0, 120)}{report.overallSummary?.length > 120 ? '…' : ''}
              </p>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {selected && (
          <ReportDetailSheet report={selected} dark={dark} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
