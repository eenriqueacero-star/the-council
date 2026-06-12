import React, { useState, useEffect, useCallback } from 'react';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { ACCOUNTS } from './constants/agents.js';
import { getMarketState, getTimeToNextOpen } from './utils/marketState.js';
import ArcReactor from './components/ArcReactor.jsx';
import MarketBanner from './components/MarketBanner.jsx';
import BottomNav from './components/BottomNav.jsx';
import PortfolioTab from './components/PortfolioTab.jsx';
import ChatTab from './components/ChatTab.jsx';
import CouncilTab from './components/CouncilTab.jsx';
import DCATab from './components/DCATab.jsx';
import WatchdogTab from './components/WatchdogTab.jsx';
import AlphaTrackerTab from './components/AlphaTrackerTab.jsx';
import RoadmapTab from './components/RoadmapTab.jsx';
import ChangelogTab from './components/ChangelogTab.jsx';
import SettingsTab from './components/SettingsTab.jsx';
import { ChevronRight, LogOut } from 'lucide-react';

const FONT  = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };
const MFONT = { fontFamily: "ui-monospace, 'SF Mono', monospace" };

const SIDEBAR_TABS = [
  { id:'portfolio', label:'Portfolio'  },
  { id:'council',   label:'Council'    },
  { id:'chat',      label:'Chat'       },
  { id:'watchdog',  label:'Watchdog'   },
  { id:'dca',       label:'DCA'        },
  { id:'alpha',     label:'Alpha'      },
  { id:'roadmap',   label:'Roadmap'    },
  { id:'changelog', label:'Changelog'  },
  { id:'settings',  label:'Settings'   },
];

const MORE_ROWS = [
  ['dca','DCA Allocator'],['alpha','Alpha Tracker'],
  ['roadmap','Roadmap'],['changelog','Changelog'],
  ['settings','Settings'],
];

export default function App() {
  const [account,  setAccount]  = useState('edwin');
  const [tab,      setTab]      = useState('portfolio');
  const [apiDown,  setApiDown]  = useState(false);
  const [mktState, setMktState] = useState(() => getMarketState(new Date()));
  const [msToOpen, setMsToOpen] = useState(() => getTimeToNextOpen(new Date()));
  const [dayChange,setDayChange]= useState(0);
  const [dark, setDark] = useState(() => localStorage.getItem('council_dark') === 'true');
  useEffect(() => { localStorage.setItem('council_dark', String(dark)); }, [dark]);

  const [running,    setRunning]    = useState(false);
  const [wdRunning,  setWdRunning]  = useState(false);
  const [ticker,     setTicker]     = useState('');
  const [capital,    setCapital]    = useState('');
  const [active,     setActive]     = useState(null);
  const [agentState, setAgentState] = useState({});
  const [synthesis,  setSynthesis]  = useState({ status:'idle', result:null });

  const [positions, setPositions] = useState(() => {
    const o = {};
    Object.keys(ACCOUNTS).forEach(k => { o[k] = {}; });
    return o;
  });

  const flagApiDown = () => setApiDown(true);

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      setMktState(getMarketState(now));
      setMsToOpen(getTimeToNextOpen(now));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let snapUnsub = () => {};
    const authUnsub = onAuthStateChanged(auth, user => {
      snapUnsub();
      if (!user) return;
      const ref = doc(db, 'users', user.uid, 'data', 'positions');
      snapUnsub = onSnapshot(ref, snap => {
        if (!snap.exists()) return;
        const data = snap.data().positions || {};
        setPositions(prev => {
          const merged = {};
          Object.keys(ACCOUNTS).forEach(k => {
            const cloud = data[k];
            merged[k] = (cloud && Object.keys(cloud).length > 0) ? cloud : (prev[k] || {});
          });
          return merged;
        });
      });
    });
    return () => { authUnsub(); snapUnsub(); };
  }, []);

  const savePositions = useCallback(async pos => {
    const user = auth.currentUser;
    if (!user) return;
    try { await setDoc(doc(db,'users',user.uid,'data','positions'), { positions: pos }, { merge:true }); } catch {}
  }, []);

  const setPos = (tkr, field, val) => setPositions(prev => {
    const next = { ...prev, [account]: { ...prev[account], [tkr]: { ...(prev[account]?.[tkr] || {}), [field]: val } } };
    savePositions(next); return next;
  });
  const addTicker = t => { if (!t) return; setPositions(prev => {
    const next = { ...prev, [account]: { ...prev[account], [t]: prev[account]?.[t] || { shares:'', cost:'' } } };
    savePositions(next); return next;
  }); };
  const removeTicker = t => setPositions(prev => {
    const acctCopy = { ...prev[account] }; delete acctCopy[t];
    const next = { ...prev, [account]: acctCopy };
    savePositions(next); return next;
  });

  const acct         = ACCOUNTS[account];
  const posMap       = positions[account] || {};
  const acctHoldings = Object.keys(posMap).length ? Object.keys(posMap) : (acct?.holdings || []);
  const positionsLine = acctHoldings.map(t => {
    const p = posMap[t] || {};
    return p.shares ? `${t} ${p.shares}sh${p.cost ? ` @ $${p.cost} avg` : ''}` : t;
  }).join(', ');

  const shared = { account, acct, posMap, acctHoldings, positionsLine, flagApiDown, apiDown, dark };

  const glowColor = (() => {
    if (mktState === 'open') {
      if (dayChange > 0) return 'rgba(0,200,5,0.15)';
      if (dayChange < 0) return 'rgba(255,59,48,0.15)';
      return 'transparent';
    }
    if (mktState === 'premarket')  return 'rgba(245,158,11,0.12)';
    if (mktState === 'afterhours') return 'rgba(139,92,246,0.12)';
    if (mktState === 'evening' || mktState === 'overnight') return 'rgba(109,40,217,0.10)';
    return 'rgba(107,114,128,0.08)';
  })();

  const accounts = Object.entries(ACCOUNTS).map(([id, v]) => ({ id, label: v.label }));
  const padded   = { maxWidth:760, margin:'0 auto', padding:'16px' };

  return (
    <div style={{ ...FONT, background: dark ? '#111111' : '#FFFFFF', minHeight:'100vh', color: dark ? '#F2F2F7' : '#000' }}>
      <div className="ambient-glow" style={{ background: glowColor }} />

      {/* Desktop sidebar */}
      <div className="hidden lg:flex" style={{ flexDirection:'column', width:240, position:'fixed', left:0, top:0, bottom:0, background: dark ? '#1C1C1E' : '#FFFFFF', borderRight: `1px solid ${dark ? '#2C2C2E' : '#EEEEEE'}`, zIndex:10, padding:'24px 0' }}>
        <div style={{ padding:'0 20px 24px', display:'flex', alignItems:'center', gap:10 }}>
          <ArcReactor size={28} />
          <span style={{ fontSize:14, fontWeight:700, letterSpacing:'0.06em' }}>THE COUNCIL</span>
        </div>
        <nav style={{ flex:1, padding:'0 12px', overflowY:'auto' }}>
          {SIDEBAR_TABS.map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)} style={{
              ...FONT, width:'100%', textAlign:'left', padding:'9px 12px', borderRadius:8,
              border:'none', cursor:'pointer', fontSize:14, fontWeight: tab===id ? 600 : 400,
              color: tab===id ? (dark ? '#F2F2F7' : '#000') : '#757575',
              background: tab===id ? (dark ? '#2C2C2E' : '#F0F0F0') : 'transparent',
              marginBottom:2, display:'block',
              transition: 'background .15s ease, color .15s ease',
            }}>{label}</button>
          ))}
        </nav>
        <div style={{ padding:'16px 12px', borderTop: `1px solid ${dark ? '#2C2C2E' : '#EEEEEE'}` }}>
          <div style={{ ...MFONT, fontSize:11, color:'#AAAAAA', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Account</div>
          {accounts.map(({ id, label }) => (
            <button key={id} onClick={() => setAccount(id)} disabled={running || wdRunning} style={{
              ...FONT, display:'block', width:'100%', textAlign:'left', padding:'7px 10px', borderRadius:6,
              border:'none', cursor:'pointer', fontSize:13, fontWeight: account===id ? 600 : 400,
              background: account===id ? (dark ? '#F2F2F7' : '#000') : 'transparent',
              color:      account===id ? (dark ? '#000' : '#fff') : '#757575',
              marginBottom:2, transition: 'background .15s ease, color .15s ease',
            }}>{label}</button>
          ))}
          <button onClick={() => signOut(auth)} style={{ ...FONT, marginTop:8, display:'flex', alignItems:'center', gap:6, color:'#AAAAAA', border:'none', background:'none', cursor:'pointer', fontSize:13, padding:'4px 2px' }}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:ml-[240px]" style={{ position:'relative', zIndex:1 }}>
        {/* Mobile header */}
        <div className="lg:hidden" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom: `1px solid ${dark ? '#2C2C2E' : '#EEEEEE'}`, background: dark ? '#1C1C1E' : '#FFFFFF', position:'sticky', top:0, zIndex:40 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <ArcReactor size={22} />
            <span style={{ fontSize:14, fontWeight:700, letterSpacing:'0.04em' }}>THE COUNCIL</span>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            {accounts.map(({ id, label }) => (
              <button key={id} onClick={() => setAccount(id)} disabled={running || wdRunning} style={{
                ...FONT, fontSize:12, fontWeight: account===id ? 600 : 400,
                padding:'4px 10px', borderRadius:20,
                border:`1px solid ${account===id ? (dark ? '#F2F2F7' : '#000') : (dark ? '#2C2C2E' : '#EEEEEE')}`,
                background: account===id ? (dark ? '#F2F2F7' : '#000') : (dark ? '#1C1C1E' : '#fff'),
                color:      account===id ? (dark ? '#000' : '#fff') : '#757575',
                cursor:'pointer', transition: 'all .15s ease',
              }}>{label}</button>
            ))}
          </div>
        </div>

        {mktState !== 'open' && (
          <div style={{ padding:'0 16px', maxWidth:760, margin:'0 auto' }}>
            <MarketBanner state={mktState} msToOpen={msToOpen} />
          </div>
        )}

        {apiDown && (
          <div style={{ background:'rgba(255,59,48,0.06)', border:'1px solid rgba(255,59,48,0.2)', borderRadius:8, padding:'10px 16px', margin:'12px 16px 0', fontSize:13, color:'#FF3B30', maxWidth:760, marginLeft:'auto', marginRight:'auto' }}>
            API connection issue. Council responses may be delayed.
          </div>
        )}

        {/* Tab content — key forces remount + slide-up on every tab switch */}
        <div key={tab} className="slide-up lg:pb-8" style={{ paddingBottom:96 }}>
          {tab === 'portfolio' && (
            <PortfolioTab {...shared}
              positions={positions}
              setPos={setPos} addTicker={addTicker} removeTicker={removeTicker}
              marketState={mktState} onDayChange={setDayChange}
            />
          )}
          {tab === 'council' && (
            <div style={padded}>
              <CouncilTab {...shared}
                running={running} setRunning={setRunning}
                ticker={ticker} setTicker={setTicker}
                capital={capital} setCapital={setCapital}
                active={active} setActive={setActive}
                agentState={agentState} setAgentState={setAgentState}
                synthesis={synthesis} setSynthesis={setSynthesis}
              />
            </div>
          )}
          {tab === 'chat' && (
            <div style={padded}><ChatTab {...shared} /></div>
          )}
          {tab === 'watchdog' && (
            <div style={padded}><WatchdogTab {...shared} wdRunning={wdRunning} setWdRunning={setWdRunning} /></div>
          )}
          {tab === 'dca' && (
            <div style={padded}><DCATab {...shared} /></div>
          )}
          {tab === 'alpha' && (
            <div style={padded}><AlphaTrackerTab account={account} dark={dark} /></div>
          )}
          {tab === 'roadmap' && (
            <div style={padded}><RoadmapTab dark={dark} /></div>
          )}
          {tab === 'changelog' && (
            <div style={padded}><ChangelogTab dark={dark} /></div>
          )}
          {tab === 'settings' && (
            <div style={padded}><SettingsTab dark={dark} setDark={setDark} /></div>
          )}
          {tab === 'more' && (
            <div style={{ maxWidth:480, margin:'0 auto', padding:'16px' }}>
              {MORE_ROWS.map(([t, label]) => (
                <button key={t} onClick={() => setTab(t)} style={{
                  ...FONT, width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'16px 0', background:'none', border:'none', borderBottom:`1px solid ${dark ? '#2C2C2E' : '#EEEEEE'}`,
                  cursor:'pointer', textAlign:'left', fontSize:15, fontWeight:500, color: dark ? '#F2F2F7' : '#000',
                }}>
                  {label} <ChevronRight size={16} style={{ color:'#AAAAAA' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav tab={tab} setTab={setTab} dark={dark} />
    </div>
  );
}
