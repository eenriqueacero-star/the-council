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

function buildDefaults() {
  const d = {};
  Object.entries(ACCOUNTS).forEach(([k, a]) => {
    d[k] = {};
    a.holdings.forEach(t => (d[k][t] = { shares: '', cost: '' }));
  });
  return d;
}

export default function App() {
  const [account,   setAccount]   = useState('edwin');
  const [tab,       setTab]       = useState('chat');
  const [apiDown,   setApiDown]   = useState(false);
  const [appLoaded, setAppLoaded] = useState(false); // true once Firestore data is in

  const [running,    setRunning]    = useState(false);
  const [wdRunning,  setWdRunning]  = useState(false);
  const [ticker,     setTicker]     = useState('');
  const [capital,    setCapital]    = useState('');
  const [active,     setActive]     = useState(null);
  const [agentState, setAgentState] = useState({});
  const [synthesis,  setSynthesis]  = useState({ status: 'idle', result: null });

  const [councilAccounts, setCouncilAccounts] = useState([account]);
  useEffect(() => { setCouncilAccounts([account]); }, [account]);

  // null = loading from cloud, object = ready
  const [positions, setPositions] = useState(null);

  // Tracks whether the latest positions change was user-initiated (not a cloud update)
  const userChangeRef = useRef(false);
  const saveTimerRef  = useRef(null);
  const posUnsubRef   = useRef(null); // real-time listener cleanup

  // Subscribe to Firestore on auth — positions update in real-time across all devices
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async user => {
      // Tear down any previous positions listener
      if (posUnsubRef.current) { posUnsubRef.current(); posUnsubRef.current = null; }

      if (!user) {
        setPositions(buildDefaults());
        setAppLoaded(true);
        return;
      }

      // Load preferences once (account selection)
      try {
        const prefSnap = await getDoc(doc(db, 'users', user.uid, 'data', 'preferences'));
        if (prefSnap.exists() && prefSnap.data().account) {
          setAccount(prefSnap.data().account);
        }
      } catch {}

      // Real-time positions listener — fires immediately with current data,
      // then again whenever any device writes a new value
      posUnsubRef.current = onSnapshot(
        doc(db, 'users', user.uid, 'data', 'positions'),
        snap => {
          if (snap.exists() && snap.data().positions) {
            const cloud    = snap.data().positions;
            const defaults = buildDefaults();
            const merged   = { ...defaults };
            Object.entries(cloud).forEach(([k, v]) => {
              merged[k] = { ...(defaults[k] || {}), ...v };
            });
            // userChangeRef stays false — this is a cloud push, not a user edit
            setPositions(merged);
          } else {
            setPositions(buildDefaults());
          }
          setAppLoaded(true);
        },
        () => { setPositions(buildDefaults()); setAppLoaded(true); }
      );
    });

    return () => {
      unsubAuth();
      if (posUnsubRef.current) posUnsubRef.current();
    };
  }, []);

  // Debounced save of positions to Firestore (user changes only)
  useEffect(() => {
    if (!positions || !userChangeRef.current) return;
    userChangeRef.current = false;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      setDoc(doc(db, 'users', uid, 'data', 'positions'), { positions, updatedAt: Date.now() }).catch(() => {});
    }, 1500);
  }, [positions]);

  // Save account preference to Firestore whenever it changes (after initial load)
  const prefSavedRef = useRef(false);
  useEffect(() => {
    if (!appLoaded) return;
    if (!prefSavedRef.current) { prefSavedRef.current = true; return; } // skip first fire (initial load)
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setDoc(doc(db, 'users', uid, 'data', 'preferences'), { account, updatedAt: Date.now() }).catch(() => {});
  }, [account, appLoaded]);

  async function savePositions() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await setDoc(doc(db, 'users', uid, 'data', 'positions'), { positions, updatedAt: Date.now() });
  }

  const flagApiDown = () => setApiDown(true);

  function buildCombinedLine(selectedAccounts) {
    return selectedAccounts.map(k => {
      const a       = ACCOUNTS[k];
      const pm      = (positions || {})[k] || {};
      const holdings = Object.keys(pm).length ? Object.keys(pm) : a.holdings;
      const line     = holdings.map(t => { const p = pm[t] || {}; return p.shares ? `${t} ${p.shares}sh${p.cost ? ` @ $${p.cost} avg` : ''}` : t; }).join(', ');
      return selectedAccounts.length > 1 ? `${a.label}(${line})` : line;
    }).join(' | ');
  }

  const acct          = ACCOUNTS[account];
  const posMap        = (positions || {})[account] || {};
  const acctHoldings  = Object.keys(posMap).length ? Object.keys(posMap) : acct.holdings;
  const positionsLine = acctHoldings
    .map(t => { const p = posMap[t] || {}; return p.shares ? `${t} ${p.shares}sh${p.cost ? ` @ $${p.cost} avg` : ''}` : t; })
    .join(', ');

  function setPos(tkr, field, val) {
    userChangeRef.current = true;
    setPositions(prev => ({ ...prev, [account]: { ...prev[account], [tkr]: { ...(prev[account]?.[tkr] || { shares: '', cost: '' }), [field]: val } } }));
  }
  function addTicker(t) {
    if (!t) return;
    userChangeRef.current = true;
    setPositions(prev => ({ ...prev, [account]: { ...prev[account], [t]: prev[account]?.[t] || { shares: '', cost: '' } } }));
  }
  function removeTicker(t) {
    userChangeRef.current = true;
    setPositions(prev => { const next = { ...prev[account] }; delete next[t]; return { ...prev, [account]: next }; });
  }

  const shared = { account, acct, posMap, acctHoldings, positionsLine, flagApiDown, apiDown };

  const navTab = MORE_TABS.includes(tab) ? 'more' : tab;

  // Loading gate — wait for Firestore before rendering the app
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

      {/* Main content */}
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

        {/* More sub-nav (mobile, when DCA/Alpha/Roadmap is active) */}
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

        {/* Tab content */}
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
            <PositionsTab {...shared}
              setPos={setPos} addTicker={addTicker} removeTicker={removeTicker} onSave={savePositions}
            />
          )}
          {tab === 'dca'      && <DCATab {...shared} />}
          {tab === 'watchdog' && <WatchdogTab {...shared} wdRunning={wdRunning} setWdRunning={setWdRunning} />}
          {tab === 'alpha'    && <AlphaTrackerTab account={account} />}
          {tab === 'roadmap'  && <RoadmapTab />}
        </main>

        <p className="text-center pb-28 lg:pb-8" style={{ ...MONO, color: 'rgba(201,168,76,0.18)', fontSize: 9, letterSpacing: '0.1em' }}>
          THE COUNCIL · LIVE AI AGENTS · NOT FINANCIAL ADVICE — YOU EXECUTE, YOU DECIDE
        </p>
      </div>

      {/* Mobile bottom nav */}
      <div className="lg:hidden">
        <BottomNav tab={navTab} setTab={setTab} />
      </div>
    </div>
  );
}
