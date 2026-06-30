import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCheck, BellOff, X } from 'lucide-react';
import {
  collection, onSnapshot, query, orderBy, limit,
  writeBatch, doc, updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { AGENTS } from '../constants/agents.js';
import { MONO, DISP } from '../constants/styles.js';
import { theme } from '../utils/theme.js';

// keyed by lowercase agent name: 'rex' → { name, color, avatar }
const AGENT_INFO = {};
AGENTS.forEach(a => { AGENT_INFO[a.name.toLowerCase()] = { name: a.name, color: a.color, avatar: a.avatar }; });

const SEV = {
  alert:   { label: 'HIGH', color: '#EF4444' },
  warning: { label: 'MED',  color: '#F59E0B' },
  info:    { label: 'LOW',  color: null },
};

const AGENT_FILTERS = ['All', 'REX', 'NOVA', 'SAGE', 'ATLAS', 'VEGA', 'ZEN'];
const SEV_FILTERS   = [{ label: 'All', value: 'all' }, { label: 'High', value: 'alert' }, { label: 'Med', value: 'warning' }];

function relTime(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.max(0, Date.now() - date.getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fullTime(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function FeedCard({ item, dark, delay, onTap, onMarkRead }) {
  const T = theme(dark);
  const cardRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const markedRef = useRef(false);

  const info = AGENT_INFO[item.agentId?.toLowerCase()] || { name: (item.agentId || '?').toUpperCase(), color: '#52525B', avatar: null };
  const sev  = SEV[item.severity] || SEV.info;
  const tickers = item.tickers || (item.ticker ? [item.ticker] : []);
  const isLong = item.detail && item.detail.length > 120;

  // Mark as read when card scrolls into view
  useEffect(() => {
    if (item.read || markedRef.current) return;
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        markedRef.current = true;
        onMarkRead(item.id);
        obs.disconnect();
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [item.id, item.read, onMarkRead]);

  const leftBorderColor = item.severity === 'alert'
    ? '#EF4444'
    : item.severity === 'warning'
      ? '#F59E0B'
      : (info.color || T.border);

  return (
    <motion.div
      ref={cardRef}
      onClick={() => onTap(item)}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(delay * 0.05, 0.3), ease: [0.25, 0.46, 0.45, 0.94] }}
      whileTap={{ scale: 0.985 }}
      style={{
        background: T.bgCard,
        border: `1px solid ${item.severity === 'alert' ? '#EF444428' : T.border}`,
        borderLeft: `3px solid ${leftBorderColor}`,
        borderRadius: 12,
        padding: '14px 16px',
        cursor: 'pointer',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* Unread indicator dot */}
      {!item.read && (
        <div style={{
          position: 'absolute', top: 13, right: 13,
          width: 7, height: 7, borderRadius: '50%',
          background: info.color || '#3B82F6',
        }} />
      )}

      {/* Agent row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {info.avatar ? (
          <img src={info.avatar} alt={info.name} style={{ width: 26, height: 26, borderRadius: 7, objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 26, height: 26, borderRadius: 7, background: `${info.color}22`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ ...MONO, fontSize: 9, color: info.color, fontWeight: 700 }}>{info.name.slice(0, 2)}</span>
          </div>
        )}
        <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: info.color }}>{info.name}</span>
        {sev.color && (
          <span style={{ ...MONO, fontSize: 9, fontWeight: 700, color: sev.color, background: `${sev.color}18`, padding: '2px 6px', borderRadius: 4 }}>
            {sev.label}
          </span>
        )}
        <span style={{ ...MONO, fontSize: 10, color: T.text3, marginLeft: 'auto', paddingRight: item.read ? 0 : 14 }}>
          {relTime(item.timestamp)}
        </span>
      </div>

      {/* Headline */}
      <div style={{ ...DISP, fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.4, marginBottom: item.detail ? 6 : 0 }}>
        {item.headline}
      </div>

      {/* Detail */}
      {item.detail && (
        <div style={{ ...MONO, fontSize: 12, color: T.text2, lineHeight: 1.55 }}>
          {expanded || !isLong ? item.detail : `${item.detail.slice(0, 120)}…`}
          {isLong && (
            <button
              onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.accent, ...MONO, fontSize: 11, padding: '0 0 0 4px' }}
            >
              {expanded ? 'less' : 'more'}
            </button>
          )}
        </div>
      )}

      {/* Ticker chips */}
      {tickers.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {tickers.map(t => (
            <span key={t} style={{ ...MONO, fontSize: 10, fontWeight: 700, color: T.accent, background: `${T.accent}18`, padding: '3px 8px', borderRadius: 5 }}>
              {t}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function DetailSheet({ item, dark, onClose }) {
  const T = theme(dark);
  if (!item) return null;

  const info    = AGENT_INFO[item.agentId?.toLowerCase()] || { name: (item.agentId || '?').toUpperCase(), color: '#52525B', avatar: null };
  const sev     = SEV[item.severity] || SEV.info;
  const tickers = item.tickers || (item.ticker ? [item.ticker] : []);

  return (
    <motion.div
      key="feed-detail-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
    >
      <motion.div
        key="feed-detail-sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: dark ? '#18181b' : '#FFFFFF',
          borderRadius: '20px 20px 0 0',
          padding: '24px 24px calc(28px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '82vh', overflowY: 'auto',
        }}
      >
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: T.text3, margin: '0 auto 22px', opacity: 0.35 }} />

        {/* Agent header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          {info.avatar ? (
            <img src={info.avatar} alt={info.name} style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: 14, background: `${info.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ ...MONO, fontSize: 16, color: info.color, fontWeight: 700 }}>{info.name.slice(0, 2)}</span>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...MONO, fontSize: 14, fontWeight: 700, color: info.color, marginBottom: 6 }}>{info.name}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {sev.color && (
                <span style={{ ...MONO, fontSize: 9, fontWeight: 700, color: sev.color, background: `${sev.color}18`, padding: '2px 7px', borderRadius: 4 }}>
                  {sev.label}
                </span>
              )}
              <span style={{ ...MONO, fontSize: 10, color: T.text3 }}>{fullTime(item.timestamp)}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text3, padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <X size={20} />
          </button>
        </div>

        {/* Headline */}
        <div style={{ ...DISP, fontSize: 18, fontWeight: 700, color: T.text, lineHeight: 1.35, marginBottom: 14 }}>
          {item.headline}
        </div>

        {/* Detail */}
        {item.detail && (
          <p style={{ ...MONO, fontSize: 13, color: T.text2, lineHeight: 1.65, margin: '0 0 20px' }}>
            {item.detail}
          </p>
        )}

        {/* Ticker chips */}
        {tickers.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
            {tickers.map(t => (
              <span key={t} style={{ ...MONO, fontSize: 12, fontWeight: 700, color: T.accent, background: `${T.accent}18`, padding: '5px 12px', borderRadius: 8 }}>
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Dismiss */}
        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            background: T.bgCardHover, border: `1px solid ${T.border}`,
            color: T.text2, cursor: 'pointer', fontFamily: 'var(--font-display)',
            fontSize: 14, fontWeight: 500,
          }}
        >
          Dismiss
        </button>
      </motion.div>
    </motion.div>
  );
}

export default function AgentFeed({ dark }) {
  const T = theme(dark);
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [agentFilter, setAgentFilter] = useState('All');
  const [sevFilter, setSevFilter]   = useState('all');
  const [selected, setSelected]     = useState(null);
  const markedSet = useRef(new Set());

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const q = query(
      collection(db, 'users', uid, 'agent_feed'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(q,
      snap => { setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    );
    return unsub;
  }, [uid]);

  const markRead = useCallback(async (id) => {
    if (markedSet.current.has(id) || !uid) return;
    markedSet.current.add(id);
    try { await updateDoc(doc(db, 'users', uid, 'agent_feed', id), { read: true }); } catch { /* noop */ }
  }, [uid]);

  const markAllRead = async () => {
    if (!uid) return;
    const unread = items.filter(i => !i.read);
    if (!unread.length) return;
    const batch = writeBatch(db);
    unread.forEach(i => batch.update(doc(db, 'users', uid, 'agent_feed', i.id), { read: true }));
    try { await batch.commit(); } catch { /* noop */ }
  };

  const filtered = items.filter(item => {
    const name = (AGENT_INFO[item.agentId?.toLowerCase()]?.name || item.agentId?.toUpperCase() || '');
    if (agentFilter !== 'All' && name !== agentFilter) return false;
    if (sevFilter !== 'all' && item.severity !== sevFilter) return false;
    return true;
  });

  const unreadCount = items.filter(i => !i.read).length;

  return (
    <div style={{ marginTop: 44 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...MONO, fontSize: 11, color: T.text3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Agent Feed</span>
          {unreadCount > 0 && (
            <span style={{ ...MONO, fontSize: 10, fontWeight: 700, color: '#fff', background: '#EF4444', padding: '1px 6px', borderRadius: 10 }}>
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            style={{ ...MONO, fontSize: 11, color: T.text3, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, padding: 0 }}
          >
            <CheckCheck size={12} /> Mark all read
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        {AGENT_FILTERS.map(f => {
          const active = agentFilter === f;
          const aColor = AGENT_INFO[f.toLowerCase()]?.color;
          return (
            <button key={f} onClick={() => setAgentFilter(f)} style={{
              ...MONO, fontSize: 10, fontWeight: active ? 700 : 400,
              padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
              background: active ? `${aColor || '#3B82F6'}1a` : 'none',
              border: `1px solid ${active ? `${aColor || '#3B82F6'}55` : T.border}`,
              color: active ? (aColor || '#3B82F6') : T.text2,
            }}>{f}</button>
          );
        })}
        <div style={{ width: 1, height: 20, background: T.border, margin: '0 2px' }} />
        {SEV_FILTERS.map(f => {
          const active = sevFilter === f.value;
          return (
            <button key={f.value} onClick={() => setSevFilter(f.value)} style={{
              ...MONO, fontSize: 10, fontWeight: active ? 700 : 400,
              padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
              background: active ? `${'#3B82F6'}1a` : 'none',
              border: `1px solid ${active ? '#3B82F655' : T.border}`,
              color: active ? '#3B82F6' : T.text2,
            }}>{f.label}</button>
          );
        })}
      </div>

      {/* Feed list */}
      {loading ? (
        <div style={{ ...MONO, fontSize: 12, color: T.text3, textAlign: 'center', padding: '36px 0' }}>Loading feed…</div>
      ) : filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ textAlign: 'center', padding: '48px 20px', border: `1px dashed ${T.border}`, borderRadius: 16 }}>
          <BellOff size={26} style={{ margin: '0 auto 12px', opacity: 0.2, color: T.text3 }} />
          <p style={{ ...DISP, fontSize: 14, color: T.text3, margin: 0, lineHeight: 1.5 }}>
            {items.length === 0
              ? "Your agents haven't reported anything yet. Background scans run on schedule — check back soon."
              : 'No items match the selected filter.'}
          </p>
        </motion.div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((item, i) => (
            <FeedCard key={item.id} item={item} dark={dark} delay={i} onTap={setSelected} onMarkRead={markRead} />
          ))}
        </div>
      )}

      {/* Detail sheet */}
      <AnimatePresence>
        {selected && <DetailSheet item={selected} dark={dark} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}
