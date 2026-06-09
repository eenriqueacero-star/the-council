import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from './firebase.js';
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
import RoadmapTab from './components/RoadmapTab.jsx';

export default function App() {
  const [account, setAccount] = useState('edwin');
  const [tab,     setTab]     = useState('chat');
  const [apiDown, setApiDown] = useState(false);

  // Lifted so AccountSelector can disable during long ops
  const [running,   setRunning]   = useState(false);
  const [wdRunning, setWdRunning] = useState(false);

  // Council tab state (lifted so it survives tab switches)
  const [ticker,     setTicker]     = useState('');
  const [capital,    setCapital]    = useState('');
  const [active,     setActive]     = useState(null);
  const [agentState, setAgentState] = useState({});
  const [synthesis,  setSynthesis]  = useState({ status: 'idle', result: null });

  // Positions per account
  const [positions, setPositions] = useState(() => {
    const o = {};
    Object.entries(ACCOUNTS).forEach(([k, a]) => {
      o[k] = {};
      a.holdings.forEach(t => (o[k][t] = { shares: '', cost: '' }));
    });
    return o;
  });

  const flagApiDown = () => setApiDown(true);

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
      {/* Animated grid */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.4]" style={{ backgroundImage: 'linear-gradient(rgba(56,224,138,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(56,224,138,0.04) 1px, transparent 1px)', backgroundSize: '44px 44px', animation: 'gridmove 8s linear infinite' }} />
      {/* Radial glow */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% -10%, rgba(245,196,81,0.10), transparent 55%)' }} />
      {/* Floating orbs */}
      <div className="orb pointer-events-none absolute -top-20 -left-20 w-72 h-72 rounded-full" style={{ background: 'radial-gradient(circle, rgba(56,224,212,0.10), transparent 70%)', filter: 'blur(8px)' }} />
      <div className="orb pointer-events-none absolute top-1/3 -right-24 w-80 h-80 rounded-full" style={{ background: 'radial-gradient(circle, rgba(176,131,255,0.09), transparent 70%)', filter: 'blur(8px)', animationDelay: '3s' }} />
      {/* CRT scanline */}
      <div className="crtline" />

      {/* Boot sequence overlay */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#070a0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', animation: 'bootFade 2s ease forwards', pointerEvents: 'none' }}>
        <ArcReactor size={96} />
        <div style={{ ...DISP, color: CY }} className="text-sm tracking-[0.42em] neon">THE COUNCIL</div>
        <div style={{ ...MONO, animation: 'bootText 1.3s steps(30) forwards' }} className="text-white/45 text-[10px] tracking-[0.22em] overflow-hidden whitespace-nowrap">CALIBRATING 6 AGENTS · LOADING PROTOCOLS · ONLINE</div>
      </div>

      {/* HUD corner brackets */}
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

        {tab === 'chat'      && <ChatTab {...shared} />}
        {tab === 'council'   && (
          <CouncilTab {...shared}
            running={running} setRunning={setRunning}
            ticker={ticker} setTicker={setTicker}
            capital={capital} setCapital={setCapital}
            active={active} setActive={setActive}
            agentState={agentState} setAgentState={setAgentState}
            synthesis={synthesis} setSynthesis={setSynthesis}
          />
        )}
        {tab === 'positions' && (
          <PositionsTab {...shared}
            setPos={setPos} addTicker={addTicker} removeTicker={removeTicker}
          />
        )}
        {tab === 'dca'       && <DCATab {...shared} />}
        {tab === 'watchdog'  && <WatchdogTab {...shared} wdRunning={wdRunning} setWdRunning={setWdRunning} />}
        {tab === 'roadmap'   && <RoadmapTab />}

        <p className="mt-8 text-[10px] text-white/25 text-center leading-relaxed" style={MONO}>THE COUNCIL · LIVE AI AGENTS · NOT FINANCIAL ADVICE — YOU EXECUTE, YOU DECIDE</p>
      </div>
    </div>
  );
}
