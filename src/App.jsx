import React, { useState, useEffect, useRef } from 'react';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ACCOUNTS } from './constants/agents.js';
import { MONO, DISP, CY } from './constants/styles.js';
import ArcReactor from './components/ArcReactor.jsx';
import Header from './components/Header.jsx';
import AccountSelector from './components/AccountSelector.jsx';
import TabNav from './components/TabNav.jsx';
import ChatTab from './components/ChatTab.jsx';
import CouncilTab from './components/CouncilTab.jsx';
import PositionsTab from './components/PositionsTab.jsx';
import DCATab from './components/DCATab.jsx';
import WatchdogTab from './components/WatchdogTab.jsx';
import AlphaTrackerTab from './components/AlphaTrackerTab.jsx';
import RoadmapTab from './components/RoadmapTab.jsx';

export default function App() {
  const [account, setAccount] = useState(() => localStorage.getItem('council_account') || 'edwin');
  const [tab,     setTab]     = useState('chat');
  const [apiDown, setApiDown] = useState(false);

  const [running,   setRunning]   = useState(false);
  const [wdRunning, setWdRunning] = useState(false);
  const [ticker,     setTicker]     = useState('');
  const [capital,    setCapital]    = useState('');
  const [active,     setActive]     = useState(null);
  const [agentState, setAgentState] = useState({});
  const [synthesis,  setSynthesis]  = useState({ status: 'idle', result: null });

  const [councilAccounts, setCouncilAccounts] = useState([account]);
  useEffect(() => { setCouncilAccounts([account]); }, [account]);

  const [positions, setPositions] = useState(() => {
    const defaults = {};
    Object.entries(ACCOUNTS).forEach(([k, a]) => {
      defaults[k] = {};
      a.holdings.forEach(t => (defaults[k][t] = { shares: '', cost: '' }));
    });
    try {
      const saved = localStorage.getItem('council_positions');
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.entries(ACCOUNTS).forEach(([k, a]) => {
          if (!parsed[k]) parsed[k] = defaults[k];
          else a.holdings.forEach(t => { if (!parsed[k][t]) parsed[k][t] = { shares: '', cost: '' }; });
        });
        return parsed;
      }
    } catch {}
    return defaults;
  });

  const posLoadedRef = useRef(false);
  const saveTimerRef = useRef(null);

  // Wait for Firebase Auth to restore session before loading positions from Firestore.
  // auth.currentUser is always null on mount — it resolves async.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      unsub(); // one-shot: unsubscribe after first auth state is known
      if (!user) { posLoadedRef.current = true; return; }
      getDoc(doc(db, 'users', user.uid, 'data', 'positions')).then(snap => {
        if (snap.exists() && snap.data().positions) {
          setPositions(prev => {
            const cloud = snap.data().positions;
            const merged = { ...prev };
            Object.entries(cloud).forEach(([k, v]) => { merged[k] = { ...(prev[k] || {}), ...v }; });
            return merged;
          });
        }
      }).catch(() => {}).finally(() => { posLoadedRef.current = true; });
    });
    return unsub;
  }, []);

  useEffect(() => {
    try { localStorage.setItem('council_positions', JSON.stringify(positions)); } catch {}
    if (!posLoadedRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      setDoc(doc(db, 'users', uid, 'data', 'positions'), { positions, updatedAt: Date.now() }).catch(() => {});
    }, 1500);
  }, [positions]);

  useEffect(() => { localStorage.setItem('council_account', account); }, [account]);

  async function savePositions() {
    try { localStorage.setItem('council_positions', JSON.stringify(positions)); } catch {}
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await setDoc(doc(db, 'users', uid, 'data', 'positions'), { positions, updatedAt: Date.now() });
  }

  const flagApiDown = () => setApiDown(true);

  function buildCombinedLine(selectedAccounts) {
    return selectedAccounts.map(k => {
      const a  = ACCOUNTS[k];
      const pm = positions[k] || {};
      const holdings = Object.keys(pm).length ? Object.keys(pm) : a.holdings;
      const line = holdings.map(t => { const p = pm[t] || {}; return p.shares ? `${t} ${p.shares}sh${p.cost ? ` @ $${p.cost} avg` : ''}` : t; }).join(', ');
      return selectedAccounts.length > 1 ? `${a.label}(${line})` : line;
    }).join(' | ');
  }

  const acct        = ACCOUNTS[account];
  const posMap      = positions[account] || {};
  const acctHoldings = Object.keys(posMap).length ? Object.keys(posMap) : acct.holdings;
  const positionsLine = acctHoldings
    .map(t => { const p = posMap[t] || {}; return p.shares ? `${t} ${p.shares}sh${p.cost ? ` @ $${p.cost} avg` : ''}` : t; })
    .join(', ');

  const setPos = (tkr, field, val) =>
    setPositions(prev => ({ ...prev, [account]: { ...prev[account], [tkr]: { ...(prev[account]?.[tkr] || { shares: '', cost: '' }), [field]: val } } }));
  const addTicker = t => {
    if (!t) return;
    setPositions(prev => ({ ...prev, [account]: { ...prev[account], [t]: prev[account]?.[t] || { shares: '', cost: '' } } }));
  };
  const removeTicker = t =>
    setPositions(prev => { const next = { ...prev[account] }; delete next[t]; return { ...prev, [account]: next }; });

  const shared = { account, acct, posMap, acctHoldings, positionsLine, flagApiDown, apiDown };

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: '#070a0c', color: '#e8eef0', minHeight: '100vh' }} className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-[0.4]" style={{ backgroundImage: 'linear-gradient(rgba(56,224,138,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(56,224,138,0.04) 1px, transparent 1px)', backgroundSize: '44px 44px', animation: 'gridmove 8s linear infinite' }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% -10%, rgba(245,196,81,0.10), transparent 55%)' }} />
      <div className="orb pointer-events-none absolute -top-20 -left-20 w-72 h-72 rounded-full" style={{ background: 'radial-gradient(circle, rgba(56,224,212,0.10), transparent 70%)', filter: 'blur(8px)' }} />
      <div className="orb pointer-events-none absolute top-1/3 -right-24 w-80 h-80 rounded-full" style={{ background: 'radial-gradient(circle, rgba(176,131,255,0.09), transparent 70%)', filter: 'blur(8px)', animationDelay: '3s' }} />
      <div className="crtline" />

      <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#070a0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', animation: 'bootFade 2s ease forwards', pointerEvents: 'none' }}>
        <ArcReactor size={96} />
        <div style={{ ...DISP, color: CY }} className="text-sm tracking-[0.42em] neon">THE COUNCIL</div>
        <div style={{ ...MONO, animation: 'bootText 1.3s steps(30) forwards' }} className="text-white/45 text-[10px] tracking-[0.22em] overflow-hidden whitespace-nowrap">CALIBRATING 6 AGENTS · LOADING PROTOCOLS · ONLINE</div>
      </div>

      <div className="pointer-events-none fixed inset-0 z-20">
        {[['top-3 left-3', 0], ['top-3 right-3', 1], ['bottom-3 left-3', 2], ['bottom-3 right-3', 3]].map(([pos, i]) => (
          <div key={i} className={`absolute ${pos} w-6 h-6`} style={{
            borderTop:    i < 2  ? `1.5px solid ${CY}` : 'none',
            borderBottom: i >= 2 ? `1.5px solid ${CY}` : 'none',
            borderLeft:   i % 2 === 0 ? `1.5px solid ${CY}` : 'none',
            borderRight:  i % 2 === 1 ? `1.5px solid ${CY}` : 'none',
            opacity: 0.4, filter: `drop-shadow(0 0 4px ${CY})`,
          }} />
        ))}
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-5 py-6 sm:py-8">
        <Header onSignOut={() => signOut(auth)} />

        <AccountSelector account={account} setAccount={setAccount} positions={positions} running={running} wdRunning={wdRunning} />

        <TabNav tab={tab} setTab={setTab} />

        <div style={{ display: tab === 'chat' ? undefined : 'none' }}>
          <ChatTab {...shared} />
        </div>
        {tab === 'council'   && (
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
        {tab === 'dca'       && <DCATab {...shared} />}
        {tab === 'watchdog'  && <WatchdogTab {...shared} wdRunning={wdRunning} setWdRunning={setWdRunning} />}
        {tab === 'alpha'     && <AlphaTrackerTab account={account} />}
        {tab === 'roadmap'   && <RoadmapTab />}

        <p className="mt-8 text-[10px] text-white/25 text-center leading-relaxed" style={MONO}>THE COUNCIL · LIVE AI AGENTS · NOT FINANCIAL ADVICE — YOU EXECUTE, YOU DECIDE</p>
      </div>
    </div>
  );
}
