import React, { useState, useEffect, useRef } from 'react';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase.js';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { LogOut, Loader2 } from 'lucide-react';
import { ACCOUNTS } from './constants/agents.js';
import { MONO, SANS, CY } from './constants/styles.js';
import Sidebar from './components/Sidebar.jsx';
import BottomNav from './components/BottomNav.jsx';
import ChatTab from './components/ChatTab.jsx';
import CouncilTab from './components/CouncilTab.jsx';
import PositionsTab from './components/PositionsTab.jsx';
import DCATab from './components/DCATab.jsx';
import WatchdogTab from './components/WatchdogTab.jsx';
import AlphaTrackerTab from './components/AlphaTrackerTab.jsx';
import RoadmapTab from './components/RoadmapTab.jsx';

const MORE_TABS = ['dca', 'alpha', 'roadmap'];
const GOLD = '#c9a84c';
const ACCT_KEYS = ['edwin', 'dad', 'bro'];

function buildAccountDefaults(key) {
  const d = {};
  (ACCOUNTS[key]?.holdings || []).forEach(t => { d[t] = { shares: '', cost: '' }; });
  return d;
}

export default function App() {
  const [account,   setAccount]   = useState('edwin');
  const [tab,       setTab]       = useState('chat');
  const [apiDown,   setApiDown]   = useState(false);
  const [appLoaded, setAppLoaded] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const [running,    setRunning]    = useState(false);
  const [wdRunning,  setWdRunning]  = useState(false);
  const [ticker,     setTicker]     = useState('');
  const [capital,    setCapital]    = useState('');
  const [active,     setActive]     = useState(null);
  const [agentState, setAgentState] = useState({});
  const [synthesis,  setSynthesis]  = useState({ status: 'idle', result: null });

  const [councilAccounts, setCouncilAccounts] = useState(['edwin']);
  useEffect(() => {
    setCouncilAccounts(account === 'all' ? ACCT_KEYS : [account]);
  }, [account]);

  // Per-account positions: null = loading, object = loaded
  const [positions, setPositions] = useState({ edwin: null, dad: null, bro: null });

  const unsubRefs  = useRef({});
  const saveTimers = useRef({});
  const toastTimer = useRef(null);

  function showToast() {
    clearTimeout(toastTimer.current);
    setSavedToast(true);
    toastTimer.current = setTimeout(() => setSavedToast(false), 1500);
  }

  function scheduleWrite(key, data) {
    clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        await setDoc(doc(db, 'users', uid, 'portfolios', key), data);
        showToast();
      } catch {}
    }, 600);
  }

  // Auth: per-account real-time listeners + one-time migration from old combined doc
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async user => {
      Object.values(unsubRefs.current).forEach(fn => fn?.());
      unsubRefs.current = {};

      if (!user) {
        setPositions({
          edwin: buildAccountDefaults('edwin'),
          dad:   buildAccountDefaults('dad'),
          bro:   buildAccountDefaults('bro'),
        });
        setAppLoaded(true);
        return;
      }

      // Load last-used account preference
      try {
        const prefSnap = await getDoc(doc(db, 'users', user.uid, 'data', 'preferences'));
        if (prefSnap.exists() && prefSnap.data().account && ACCOUNTS[prefSnap.data().account]) {
          setAccount(prefSnap.data().account);
        }
      } catch {}

      // One-time migration: old single combined doc → separate per-account docs
      try {
        const checkSnap = await getDoc(doc(db, 'users', user.uid, 'portfolios', 'edwin'));
        if (!checkSnap.exists()) {
          const oldSnap = await getDoc(doc(db, 'users', user.uid, 'data', 'positions'));
          if (oldSnap.exists() && oldSnap.data()?.positions) {
            const oldPos = oldSnap.data().positions;
            await Promise.all(ACCT_KEYS.map(k =>
              oldPos[k] ? setDoc(doc(db, 'users', user.uid, 'portfolios', k), oldPos[k]) : Promise.resolve()
            ));
          }
        }
      } catch {}

      // Start three independent real-time listeners, one per account
      let loaded = 0;
      ACCT_KEYS.forEach(key => {
        unsubRefs.current[key] = onSnapshot(
          doc(db, 'users', user.uid, 'portfolios', key),
          snap => {
            const cloud   = snap.data() || {};
            const defaults = buildAccountDefaults(key);
            const merged  = { ...defaults, ...cloud };
            setPositions(prev => ({ ...prev, [key]: merged }));
            loaded++;
            if (loaded >= ACCT_KEYS.length) setAppLoaded(true);
          },
          () => {
            setPositions(prev => ({ ...prev, [key]: buildAccountDefaults(key) }));
            loaded++;
            if (loaded >= ACCT_KEYS.length) setAppLoaded(true);
          }
        );
      });
    });

    return () => {
      unsubAuth();
      Object.values(unsubRefs.current).forEach(fn => fn?.());
      Object.values(saveTimers.current).forEach(clearTimeout);
      clearTimeout(toastTimer.current);
    };
  }, []);

  // Persist last-used account preference
  const prefSavedRef = useRef(false);
  useEffect(() => {
    if (!appLoaded) return;
    if (!prefSavedRef.current) { prefSavedRef.current = true; return; }
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setDoc(doc(db, 'users', uid, 'data', 'preferences'), { account, updatedAt: Date.now() }).catch(() => {});
  }, [account, appLoaded]);

  // Edit functions — update state immediately, debounce the Firestore write
  function setPos(key, tkr, field, val) {
    setPositions(prev => {
      const updated = { ...prev[key], [tkr]: { ...(prev[key]?.[tkr] || { shares: '', cost: '' }), [field]: val } };
      scheduleWrite(key, updated);
      return { ...prev, [key]: updated };
    });
  }

  function addTicker(key, t) {
    if (!t) return;
    setPositions(prev => {
      if (prev[key]?.[t]) return prev;
      const updated = { ...prev[key], [t]: { shares: '', cost: '' } };
      scheduleWrite(key, updated);
      return { ...prev, [key]: updated };
    });
  }

  function removeTicker(key, t) {
    setPositions(prev => {
      const updated = { ...prev[key] };
      delete updated[t];
      scheduleWrite(key, updated);
      return { ...prev, [key]: updated };
    });
  }

  // Derived values for non-positions tabs
  const acct = ACCOUNTS[account] || ACCOUNTS.edwin;

  // For 'all': merged posMap (sums shares across accounts for same ticker)
  const posMap = (() => {
    if (account !== 'all') return positions[account] || {};
    const merged = {};
    ACCT_KEYS.forEach(k => {
      Object.entries(positions[k] || {}).forEach(([t, p]) => {
        if (!merged[t]) {
          merged[t] = { shares: p.shares || '', cost: p.cost || '' };
        } else {
          const s1 = parseFloat(merged[t].shares) || 0;
          const c1 = parseFloat(merged[t].cost) || 0;
          const s2 = parseFloat(p.shares) || 0;
          const c2 = parseFloat(p.cost) || 0;
          const total = s1 + s2;
          merged[t] = {
            shares: total > 0 ? String(total) : '',
            cost:   total > 0 ? String(Math.round((s1 * c1 + s2 * c2) / total * 100) / 100) : '',
          };
        }
      });
    });
    return merged;
  })();

  const acctHoldings = account === 'all'
    ? [...new Set(ACCT_KEYS.flatMap(k => Object.keys(positions[k] || {})))]
    : Object.keys(positions[account] || {});

  function buildCombinedLine(selectedAccounts) {
    return selectedAccounts
      .filter(k => ACCOUNTS[k] && k !== 'all')
      .map(k => {
        const a  = ACCOUNTS[k];
        const pm = positions[k] || {};
        const line = Object.entries(pm)
          .map(([t, p]) => p.shares ? `${t} ${p.shares}sh${p.cost ? ` @ $${p.cost} avg` : ''}` : t)
          .join(', ');
        return selectedAccounts.filter(k2 => k2 !== 'all').length > 1
          ? `${a.label}(${line})`
          : line;
      }).join(' | ');
  }

  const positionsLine = account === 'all'
    ? buildCombinedLine(ACCT_KEYS)
    : buildCombinedLine([account]);

  const flagApiDown = () => setApiDown(true);
  const shared = { account, acct, posMap, acctHoldings, positionsLine, flagApiDown, apiDown };
  const navTab  = MORE_TABS.includes(tab) ? 'more' : tab;

  if (!appLoaded) {
    return (
      <div style={{ background: '#080808', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <span style={{ ...MONO, letterSpacing: '0.22em', fontWeight: 700, color: GOLD, fontSize: 13 }}>THE COUNCIL</span>
        <Loader2 size={18} className="animate-spin" style={{ color: 'rgba(201,168,76,0.4)' }} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#080808', color: '#f0f0f0', minHeight: '100vh' }}>

      {/* Saved toast */}
      {savedToast && (
        <div style={{
          position: 'fixed', bottom: 88, right: 16, zIndex: 9999,
          background: 'rgba(12,10,4,0.97)', border: '1px solid rgba(201,168,76,0.28)',
          borderRadius: 8, padding: '7px 14px',
          ...MONO, fontSize: 11, color: GOLD, letterSpacing: '0.1em',
          animation: 'dealIn 0.2s ease both',
          boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
          pointerEvents: 'none',
        }}>
          SAVED ✓
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          tab={tab} setTab={setTab}
          account={account} setAccount={setAccount}
          accounts={ACCOUNTS}
          running={running} wdRunning={wdRunning}
          onSignOut={() => signOut(auth)}
        />
      </div>

      <div className="lg:ml-[220px]">
        {/* Mobile header */}
        <div className="lg:hidden sticky top-0 z-40"
          style={{ background: 'rgba(8,8,8,0.96)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(201,168,76,0.08)' }}>
          <div className="flex items-center justify-between px-4 py-3">
            <span style={{ ...MONO, letterSpacing: '0.2em', fontWeight: 700, color: GOLD, fontSize: 12 }}>THE COUNCIL</span>
            <div className="flex items-center gap-3">
              <span style={{ ...MONO, fontSize: 9, color: 'rgba(201,168,76,0.5)' }} className="flex items-center gap-1.5">
                <span className="blink inline-block w-1.5 h-1.5 rounded-full" style={{ background: GOLD, borderRadius: '50%' }} />
                LIVE
              </span>
              <button onClick={() => signOut(auth)}
                style={{ color: 'rgba(255,255,255,0.28)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
                <LogOut size={14} />
              </button>
            </div>
          </div>

          {/* Mobile account pills */}
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
            {Object.entries(ACCOUNTS).map(([key, a]) => (
              <button key={key} onClick={() => !(running || wdRunning) && setAccount(key)}
                style={{
                  ...SANS, fontSize: 11,
                  padding: '5px 14px', borderRadius: 20, whiteSpace: 'nowrap',
                  background: account === key ? 'rgba(201,168,76,0.12)' : 'transparent',
                  border: `1px solid ${account === key ? 'rgba(201,168,76,0.32)' : 'rgba(255,255,255,0.1)'}`,
                  color: account === key ? GOLD : 'rgba(255,255,255,0.4)',
                  fontWeight: account === key ? 600 : 400,
                  cursor: running || wdRunning ? 'not-allowed' : 'pointer',
                  opacity: (running || wdRunning) && account !== key ? 0.4 : 1,
                }}>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* More sub-nav (mobile) */}
        {MORE_TABS.includes(tab) && (
          <div className="lg:hidden flex gap-2 px-4 pt-4 overflow-x-auto no-scrollbar">
            {[{ id: 'dca', label: 'Smart DCA' }, { id: 'alpha', label: 'Alpha Tracker' }, { id: 'roadmap', label: 'Roadmap' }].map(({ id, label }) => (
              <button key={id} onClick={() => setTab(id)}
                style={{
                  ...SANS, fontSize: 11, padding: '5px 14px', borderRadius: 20, whiteSpace: 'nowrap',
                  background: tab === id ? 'rgba(201,168,76,0.12)' : 'transparent',
                  border: `1px solid ${tab === id ? 'rgba(201,168,76,0.32)' : 'rgba(255,255,255,0.1)'}`,
                  color: tab === id ? GOLD : 'rgba(255,255,255,0.4)',
                  fontWeight: tab === id ? 600 : 400,
                  cursor: 'pointer',
                }}>
                {label}
              </button>
            ))}
          </div>
        )}

        <main key={tab} className="max-w-5xl mx-auto px-4 sm:px-5 lg:px-8 py-6 pb-28 lg:pb-10"
          style={{ animation: 'tabFade 0.2s ease both' }}>
          <div style={{ display: tab === 'chat' ? undefined : 'none' }}>
            <ChatTab {...shared} />
          </div>
          {tab === 'council' && (
            <CouncilTab {...shared}
              running={running} setRunning={setRunning}
              ticker={ticker} setTicker={setTicker}
              capital={capital} setCapital={setCapital}
              active={active} setActive={setActive}
              agentState={agentState} setAgentState={setAgentState}
              synthesis={synthesis} setSynthesis={setSynthesis}
              councilAccounts={councilAccounts}
              setCouncilAccounts={setCouncilAccounts}
              councilPositionsLine={buildCombinedLine(councilAccounts)}
            />
          )}
          {tab === 'positions' && (
            <PositionsTab
              account={account}
              allAccounts={ACCOUNTS}
              positions={positions}
              setPos={setPos}
              addTicker={addTicker}
              removeTicker={removeTicker}
              positionsLine={positionsLine}
            />
          )}
          {tab === 'dca'      && <DCATab {...shared} />}
          {tab === 'watchdog' && <WatchdogTab {...shared} wdRunning={wdRunning} setWdRunning={setWdRunning} />}
          {tab === 'alpha'    && <AlphaTrackerTab account={account === 'all' ? 'edwin' : account} />}
          {tab === 'roadmap'  && <RoadmapTab />}
        </main>

        <p className="text-center pb-28 lg:pb-8" style={{ ...MONO, color: 'rgba(201,168,76,0.18)', fontSize: 9, letterSpacing: '0.1em' }}>
          THE COUNCIL · LIVE AI AGENTS · NOT FINANCIAL ADVICE — YOU EXECUTE, YOU DECIDE
        </p>
      </div>

      <div className="lg:hidden">
        <BottomNav tab={navTab} setTab={setTab} />
      </div>
    </div>
  );
}
