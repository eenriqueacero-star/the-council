import React, { useState, useEffect, useRef } from 'react';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ACCOUNTS } from './constants/agents.js';
import { SANS, CY } from './constants/styles.js';
import Header from './components/Header.jsx';
import AccountSelector from './components/AccountSelector.jsx';
import BottomNav from './components/BottomNav.jsx';
import ChatTab from './components/ChatTab.jsx';
import CouncilTab from './components/CouncilTab.jsx';
import PositionsTab from './components/PositionsTab.jsx';
import DCATab from './components/DCATab.jsx';
import WatchdogTab from './components/WatchdogTab.jsx';
import AlphaTrackerTab from './components/AlphaTrackerTab.jsx';
import RoadmapTab from './components/RoadmapTab.jsx';

const MORE_TABS = ['dca', 'alpha', 'roadmap'];
const MORE_NAV = [
  { id: 'dca',     label: 'DCA Allocator' },
  { id: 'alpha',   label: 'Alpha Tracker' },
  { id: 'roadmap', label: 'Roadmap' },
];

export default function App() {
  const [account, setAccount] = useState(() => localStorage.getItem('council_account') || 'edwin');
  const [tab,     setTab]     = useState('positions');
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      unsub();
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

  const acct          = ACCOUNTS[account];
  const posMap        = positions[account] || {};
  const acctHoldings  = Object.keys(posMap).length ? Object.keys(posMap) : acct.holdings;
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

  const navTab = MORE_TABS.includes(tab) ? 'more' : tab;
  function handleNavChange(t) {
    if (t === 'more') {
      if (!MORE_TABS.includes(tab)) setTab('dca');
    } else {
      setTab(t);
    }
  }

  return (
    <div style={{ background: '#0a0e1a', color: '#e2e8f0', minHeight: '100vh', ...SANS }}>
      <div style={{ maxWidth: '430px', margin: '0 auto', position: 'relative', minHeight: '100vh' }}>
        <Header onSignOut={() => signOut(auth)} />
        <AccountSelector account={account} setAccount={setAccount} positions={positions} running={running} wdRunning={wdRunning} />

        {/* More sub-nav */}
        {MORE_TABS.includes(tab) && (
          <div className="flex gap-2 px-4 pt-3 pb-1">
            {MORE_NAV.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  ...SANS,
                  fontSize: '13px', fontWeight: 500,
                  padding: '5px 13px', borderRadius: '999px',
                  border: `1px solid ${tab === t.id ? CY + '44' : 'rgba(255,255,255,0.10)'}`,
                  background: tab === t.id ? CY + '18' : 'transparent',
                  color: tab === t.id ? CY : 'rgba(255,255,255,0.42)',
                  transition: 'all .15s', cursor: 'pointer',
                }}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="px-4" style={{ paddingBottom: '90px' }}>
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
        </div>

        <BottomNav tab={navTab} setTab={handleNavChange} />
      </div>
    </div>
  );
}
