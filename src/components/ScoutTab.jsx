import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Telescope, Plus, X, ChevronDown, ChevronRight, Loader2, RefreshCw, Bell } from 'lucide-react';
import { MONO, DISP } from '../constants/styles.js';
import { DISCOVERY_POOL } from '../constants/agents.js';
import { auth, db } from '../firebase.js';
import {
  doc, collection, getDocs, setDoc, deleteDoc, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { scoutTicker } from '../utils/councilRunner.js';
import { sendNotification, requestPermission, getPermissionState } from '../utils/notify.js';
import { writeDebug } from '../utils/debugStore.js';
import { theme } from '../utils/theme.js';

const WATCHLIST_DEFAULTS = ['OKLO','LPTH','UNH','KKR','ACMR','NU','SERV','RXRX'];

const VERDICT_STYLE = {
  BUY:   { bg: 'rgba(0,200,5,0.15)',    fg: '#00C805', label: 'BUY'   },
  WATCH: { bg: 'rgba(245,158,11,0.15)', fg: '#B45309', label: 'WATCH' },
  SKIP:  { bg: 'rgba(255,59,48,0.12)',  fg: '#FF3B30', label: 'SKIP'  },
};

function VerdictBadge({ verdict }) {
  const s = VERDICT_STYLE[verdict] || VERDICT_STYLE.WATCH;
  return (
    <span style={{ ...MONO, background: s.bg, color: s.fg, fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 5 }}>
      {s.label}
    </span>
  );
}

function ConvictionBar({ value }) {
  const pct = ((value ?? 0) / 10) * 100;
  const color = value >= 7 ? '#00C805' : value >= 5 ? '#B45309' : '#FF3B30';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 48, height: 5, borderRadius: 3, background: 'rgba(128,128,128,0.2)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ ...MONO, fontSize: 10, color }}>{value ?? '?'}/10</span>
    </div>
  );
}

function timeSince(isoStr) {
  if (!isoStr) return null;
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ScoutTab({ dark, posMap, acctHoldings, isDebugMode }) {
  const T = theme(dark);
  const uid = auth.currentUser?.uid;

  const [watchlist, setWatchlist]       = useState([]);
  const [newTicker, setNewTicker]       = useState('');
  const [scoutRunning, setScoutRunning] = useState(false);
  const [progress, setProgress]         = useState('');
  const [progressN, setProgressN]       = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [autoDiscover, setAutoDiscover] = useState(true);
  const [expandedTickers, setExpandedTickers] = useState({});
  const [notifPerm, setNotifPerm]       = useState(() => getPermissionState());
  const scoutDebugRef = useRef({});

  // Load watchlist from Firestore, pre-populate defaults if empty
  useEffect(() => {
    if (!uid) return;
    const colRef = collection(db, 'users', uid, 'watchlist');
    const unsub = onSnapshot(colRef, async snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (items.length === 0) {
        // Pre-populate defaults
        await Promise.all(WATCHLIST_DEFAULTS.map(ticker =>
          setDoc(doc(db, 'users', uid, 'watchlist', ticker), { ticker, addedAt: new Date().toISOString() })
        ));
      } else {
        setWatchlist(items.sort((a, b) => {
          // Sort by conviction desc if scouted, then alphabetically
          const ca = a.lastResult?.conviction ?? -1;
          const cb = b.lastResult?.conviction ?? -1;
          return cb - ca || a.ticker.localeCompare(b.ticker);
        }));
      }
    });
    return () => unsub();
  }, [uid]);

  async function addToWatchlist(ticker) {
    const t = ticker.trim().toUpperCase().replace(/[^A-Z0-9.]/g, '');
    if (!t || !uid) return;
    await setDoc(doc(db, 'users', uid, 'watchlist', t), { ticker: t, addedAt: new Date().toISOString() }, { merge: true });
    setNewTicker('');
  }

  async function removeFromWatchlist(ticker) {
    if (!uid) return;
    await deleteDoc(doc(db, 'users', uid, 'watchlist', ticker));
  }

  function pickDiscoveryTickers() {
    const holdings = new Set(acctHoldings.map(t => t.toUpperCase()));
    const wlSet = new Set(watchlist.map(w => w.ticker.toUpperCase()));
    const pool = DISCOVERY_POOL.filter(t => !holdings.has(t) && !wlSet.has(t));
    // Pick 5-8 random tickers
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(8, shuffled.length));
  }

  const runScout = useCallback(async () => {
    if (scoutRunning || !uid) return;
    setScoutRunning(true);
    scoutDebugRef.current = {};

    const wlTickers = watchlist.map(w => w.ticker);
    const discoveryTickers = autoDiscover ? pickDiscoveryTickers() : [];
    const allTickers = [...wlTickers, ...discoveryTickers];
    const total = allTickers.length;
    setProgressTotal(total);

    for (let i = 0; i < allTickers.length; i++) {
      const ticker = allTickers[i];
      const isDiscovery = !wlTickers.includes(ticker);
      setProgress(`Scouting ${ticker}… ${i + 1}/${total}`);
      setProgressN(i + 1);

      try {
        const result = await scoutTicker(ticker, {
          debugMode: !!isDebugMode,
          onProgress: setProgress,
        });

        if (isDebugMode && result.debugData) {
          scoutDebugRef.current[ticker] = result.debugData;
          writeDebug('SCOUT', `Scout run · ${Object.keys(scoutDebugRef.current).join(', ')}`, { type: 'scout', tickers: { ...scoutDebugRef.current } });
        }

        // Save result to Firestore (watchlist only — discovery saved to a temp subcollection)
        const fsRef = isDiscovery
          ? doc(db, 'users', uid, 'scoutDiscovery', ticker)
          : doc(db, 'users', uid, 'watchlist', ticker);

        await setDoc(fsRef, {
          ticker,
          lastScoutedAt: new Date().toISOString(),
          lastResult: {
            verdict: result.verdict,
            conviction: result.conviction,
            headline: result.headline,
            rationale: result.rationale,
            price: result.price,
            changePct: result.changePct,
            agents: result.agents,
            scoutedAt: new Date().toISOString(),
          },
          ...(isDiscovery ? { isDiscovery: true } : {}),
        }, { merge: true });

        // Fire notification for high-conviction BUY
        if (result.verdict === 'BUY' && (result.conviction ?? 0) >= 7) {
          const priceStr = result.price ? ` ($${result.price.toFixed(2)})` : '';
          sendNotification(
            `🟢 ${ticker} — BUY ${result.conviction}/10`,
            `${result.headline}${priceStr}`,
          );
        }
      } catch (err) {
        console.error(`[scout] ${ticker} failed:`, err?.message);
      }

      // 3-second delay between tickers to respect rate limits
      if (i < allTickers.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    setScoutRunning(false);
    setProgress('');
    setProgressN(0);
  }, [scoutRunning, uid, watchlist, autoDiscover, acctHoldings, isDebugMode]);

  async function enableNotifications() {
    const result = await requestPermission();
    setNotifPerm(result);
  }

  // Load discovery results from Firestore
  const [discoveryResults, setDiscoveryResults] = useState([]);
  useEffect(() => {
    if (!uid) return;
    const colRef = collection(db, 'users', uid, 'scoutDiscovery');
    const unsub = onSnapshot(colRef, snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDiscoveryResults(items.sort((a, b) => {
        const ca = a.lastResult?.conviction ?? -1;
        const cb = b.lastResult?.conviction ?? -1;
        return cb - ca;
      }));
    });
    return () => unsub();
  }, [uid]);

  function toggleExpand(ticker) {
    setExpandedTickers(prev => ({ ...prev, [ticker]: !prev[ticker] }));
  }

  function renderRow(item, isDiscovery = false) {
    const r = item.lastResult;
    const expanded = expandedTickers[item.ticker];
    const vs = r ? (VERDICT_STYLE[r.verdict] || VERDICT_STYLE.WATCH) : null;
    const rowBg = r?.verdict === 'BUY' && r.conviction >= 7 ? 'rgba(0,200,5,0.04)' : 'transparent';

    return (
      <div key={item.ticker} style={{ borderBottom: `1px solid ${T.border}` }}>
        <div
          onClick={() => r && toggleExpand(item.ticker)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: r ? 'pointer' : 'default', background: rowBg, transition: 'background .15s' }}
        >
          <div style={{ flex: '0 0 64px' }}>
            <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: T.text }}>{item.ticker}</span>
          </div>

          {r ? (
            <>
              <VerdictBadge verdict={r.verdict} />
              <ConvictionBar value={r.conviction} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: T.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.headline}</div>
              </div>
              {r.price && (
                <span style={{ ...MONO, fontSize: 11, color: T.text3, flexShrink: 0 }}>${r.price.toFixed(2)}</span>
              )}
              {r.changePct != null && (
                <span style={{ ...MONO, fontSize: 10, color: r.changePct >= 0 ? '#00C805' : '#FF3B30', flexShrink: 0 }}>
                  {r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%
                </span>
              )}
              <span style={{ ...MONO, fontSize: 10, color: T.text3, flexShrink: 0 }}>{timeSince(r.scoutedAt)}</span>
              {r && (expanded ? <ChevronDown size={14} style={{ color: T.text3, flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: T.text3, flexShrink: 0 }} />)}
            </>
          ) : (
            <span style={{ ...MONO, fontSize: 11, color: T.text3 }}>Not yet scouted</span>
          )}

          {!isDiscovery && (
            <button
              onClick={e => { e.stopPropagation(); removeFromWatchlist(item.ticker); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text3, padding: 4, flexShrink: 0 }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {expanded && r && (
          <div style={{ padding: '0 16px 14px 90px', background: rowBg }}>
            <p style={{ fontSize: 12, color: T.text2, lineHeight: 1.6, margin: '0 0 10px' }}>{r.rationale}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {r.agents && Object.entries(r.agents).map(([id, ag]) => (
                <span key={id} style={{ ...MONO, fontSize: 10, padding: '2px 7px', borderRadius: 4, background: T.bgCard, color: T.text2 }}>
                  {id.slice(0,3).toUpperCase()} {ag.stance} {ag.score != null ? `${ag.score}/10` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const FONT = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };
  const inp = { ...FONT, background: T.input, border: `1px solid ${T.inputBorder}`, borderRadius: 8, color: T.text, padding: '8px 12px', fontSize: 13, outline: 'none' };

  return (
    <div style={{ ...FONT, maxWidth: 760, margin: '0 auto', padding: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Telescope size={20} style={{ color: '#38e0d4' }} />
          <span style={{ ...DISP, fontSize: 18, fontWeight: 700, color: T.text }}>Scout Mode</span>
        </div>
        <button
          onClick={runScout}
          disabled={scoutRunning}
          style={{ ...MONO, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 10, border: 'none', background: scoutRunning ? T.btnDisabled : '#38e0d4', color: scoutRunning ? T.btnDisabledText : '#000', fontWeight: 700, fontSize: 12, cursor: scoutRunning ? 'not-allowed' : 'pointer', transition: 'all .15s' }}
        >
          {scoutRunning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {scoutRunning ? 'Scouting…' : 'Run Scout'}
        </button>
      </div>

      {/* Progress */}
      {scoutRunning && (
        <div style={{ marginBottom: 16, background: 'rgba(56,224,212,0.08)', border: '1px solid rgba(56,224,212,0.25)', borderRadius: 10, padding: '10px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Loader2 size={13} className="animate-spin" style={{ color: '#38e0d4', flexShrink: 0 }} />
            <span style={{ ...MONO, fontSize: 12, color: '#38e0d4' }}>{progress}</span>
          </div>
          {progressTotal > 0 && (
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(56,224,212,0.15)', overflow: 'hidden' }}>
              <div style={{ width: `${(progressN / progressTotal) * 100}%`, height: '100%', background: '#38e0d4', borderRadius: 2, transition: 'width .4s ease' }} />
            </div>
          )}
        </div>
      )}

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <div
            onClick={() => setAutoDiscover(v => !v)}
            style={{ width: 40, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: autoDiscover ? '#38e0d4' : (dark ? '#2C2C2E' : '#E0E0E0'), position: 'relative', transition: 'background .2s', flexShrink: 0 }}
          >
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: autoDiscover ? 19 : 3, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </div>
          <span style={{ fontSize: 13, color: T.text2 }}>Auto-discovery</span>
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Bell size={13} style={{ color: notifPerm === 'granted' ? '#38e0d4' : T.text3 }} />
          {notifPerm === 'granted' ? (
            <span style={{ ...MONO, fontSize: 11, color: '#38e0d4' }}>Notifications on</span>
          ) : notifPerm === 'denied' ? (
            <span style={{ ...MONO, fontSize: 11, color: '#FF3B30' }}>Notifications blocked</span>
          ) : (
            <button onClick={enableNotifications} style={{ ...MONO, fontSize: 11, color: '#38e0d4', background: 'none', border: '1px solid rgba(56,224,212,0.3)', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
              Enable notifications
            </button>
          )}
        </div>
      </div>

      {/* Add to watchlist */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          value={newTicker}
          onChange={e => setNewTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9.]/g, ''))}
          onKeyDown={e => e.key === 'Enter' && addToWatchlist(newTicker)}
          placeholder="Add ticker…"
          style={{ ...inp, flex: 1 }}
        />
        <button
          onClick={() => addToWatchlist(newTicker)}
          disabled={!newTicker.trim()}
          style={{ ...MONO, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: newTicker.trim() ? '#000' : T.btnDisabled, color: newTicker.trim() ? '#fff' : T.btnDisabledText, fontWeight: 600, fontSize: 12, cursor: newTicker.trim() ? 'pointer' : 'not-allowed' }}
        >
          <Plus size={13} /> Add
        </button>
      </div>

      {/* YOUR WATCHLIST section */}
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '10px 16px', background: T.bgCard, borderBottom: `1px solid ${T.border}` }}>
          <span style={{ ...MONO, fontSize: 10, color: T.text3, letterSpacing: '0.1em' }}>YOUR WATCHLIST</span>
        </div>
        {watchlist.length === 0 ? (
          <div style={{ padding: '20px 16px', textAlign: 'center', color: T.text3, fontSize: 13 }}>No tickers yet — add some above</div>
        ) : (
          watchlist.map(item => renderRow(item, false))
        )}
      </div>

      {/* DISCOVERED section */}
      {(autoDiscover || discoveryResults.length > 0) && (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', background: T.bgCard, borderBottom: `1px solid ${T.border}` }}>
            <span style={{ ...MONO, fontSize: 10, color: T.text3, letterSpacing: '0.1em' }}>DISCOVERED</span>
          </div>
          {discoveryResults.length === 0 ? (
            <div style={{ padding: '20px 16px', textAlign: 'center', color: T.text3, fontSize: 13 }}>
              {scoutRunning ? 'Scanning discovery pool…' : 'Run Scout to discover new opportunities'}
            </div>
          ) : (
            discoveryResults.map(item => renderRow(item, true))
          )}
        </div>
      )}

      <p style={{ ...MONO, fontSize: 10, color: T.text3, textAlign: 'center', marginTop: 24 }}>
        Scout runs automatically every weekday at 9 AM ET via Vercel Cron
      </p>
    </div>
  );
}
