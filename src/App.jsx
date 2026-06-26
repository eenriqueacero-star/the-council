import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import DebugTab from './components/DebugTab.jsx';
import { ChevronRight, LogOut } from 'lucide-react';

const isDebugMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';

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
  ...(isDebugMode ? [{ id:'debug', label:'Debug 🔍' }] : []),
];

const MORE_ROWS = [
  ['dca','DCA Allocator'],['alpha','Alpha Tracker'],
  ['roadmap','Roadmap'],['changelog','Changelog'],
  ['settings','Settings'],
  ...(isDebugMode ? [['debug','Debug 🔍']] : []),
];

export default function App() {
  const [account,  setAccount]  = useState(() => localStorage.getItem('council_account') || 'edwin');
  const [tab,      setTab]      = useState('portfolio');
  const [apiDown,  setApiDown]  = useState(false);
  const [mktState, setMktState] = useState(() => getMarketState(new Date()));
  const [msToOpen, setMsToOpen] = useState(() => getTimeToNextOpen(new Date()));
  const [dayChange,setDayChange]= useState(0);
  const [dark, setDark] = useState(() => localStorage.getItem('council_dark') === 'true');
  useEffect(() => { localStorage.setItem('council_dark', String(dark)); }, [dark]);
  useEffect(() => { localStorage.setItem('council_account', account); }, [account]);

  const [debugLog,   setDebugLog]   = useState(null);
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
  const [saveStatus, setSaveStatus] = useState('idle');
  const [authReady,  setAuthReady]  = useState(false);

  const apiDownTimer = useRef(null);
  const flagApiDown = () => {
    setApiDown(true);
    clearTimeout(apiDownTimer.current);
    apiDownTimer.current = setTimeout(() => setApiDown(false), 90000);
  };

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      setMktState(getMarketState(now));
      setMsToOpen(getTimeToNextOpen(now));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const saveTimer    = useRef(null);
  const positionsRef = useRef(positions);
  const fsLoaded     = useRef(false);

  useEffect(() => {
    let snapUnsub = () => {};
    const authUnsub = onAuthStateChanged(auth, user => {
      snapUnsub();
      fsLoaded.current = false;
      setAuthReady(!!user);
      if (!user) return;
      const ref = doc(db, 'users', user.uid, 'data', 'positions');
      snapUnsub = onSnapshot(ref, snap => {
        fsLoaded.current = true;
        if (!snap.exists()) return;
        const data = snap.data().positions || {};
        setPositions(prev => {
          const merged = {};
          Object.keys(ACCOUNTS).forEach(k => {
            const cloud = data[k];
            merged[k] = (cloud && Object.keys(cloud).length > 0) ? cloud : (prev[k] || {});
          });
          positionsRef.current = merged;
          return merged;
        });
      }, err => {
        console.error('positions snapshot error:', err);
        fsLoaded.current = true;
      });
    });
    return () => { authUnsub(); snapUnsub(); };
  }, []);

  const savePositions = useCallback(() => {
    clearTimeout(saveTimer.current);
    setSaveStatus('saving');
    saveTimer.current = setTimeout(async () => {
      const user = auth.currentUser;
      const doSave = async (u) => {
        await setDoc(doc(db, 'users', u.uid, 'data', 'positions'), { positions: positionsRef.current }, { merge: true });
      };
      if (!user) {
        saveTimer.current = setTimeout(async () => {
          const u2 = auth.currentUser;
          if (!u2) { setSaveStatus('error'); return; }
          try { await doSave(u2); setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 2000); }
          catch (e) { setSaveStatus('error'); console.error('savePositions retry failed:', e); }
        }, 2000);
        return;
      }
      try { await doSave(user); setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 2000); }
      catch (e) { setSaveStatus('error'); console.error('savePositions failed:', e); }
    }, 600);
  }, []);

  const setPos = (tkr, field, val) => setPositions(prev => {
    const next = { ...prev, [account]: { ...prev[account], [tkr]: { ...(prev[account]?.[tkr] || {}), [field]: val } } };
    positionsRef.current = next;
    savePositions();
    return next;
  });
  const addTicker = t => { if (!t) return; setPositions(prev => {
    const next = { ...prev, [account]: { ...prev[account], [t]: prev[account]?.[t] || { shares:'', cost:'' } } };
    positionsRef.current = next;
    savePositions();
    return next;
  }); };
  const removeTicker = t => setPositions(prev => {
    const acctCopy = { ...prev[account] }; delete acctCopy[t];
    const next = { ...prev, [account]: acctCopy };
    positionsRef.current = next;
    savePositions();
    return next;
  });

  const acct          = ACCOUNTS[account];
  const posMap        = positions[account] || {};
  const acctHoldings  = Object.keys(posMap).length ? Object.keys(posMap) : (acct?.holdings || []);
  const positionsLine = acctHoldings.map(t => {
    const p = posMap[t] || {};
    const costNum = parseFloat(String(p.cost || '').replace(/[^0-9.]/g, ''));
    return p.shares ? `${t} ${p.shares}sh${costNum > 0 ? ` @ $${costNum.toFixed(2)} avg` : ''}` : t;
  }).join(', ');

  const shared  = { account, acct, posMap, acctHoldings, positionsLine, flagApiDown, apiDown, dark, saveStatus, authReady };
  const rootBg  = dark ? '#111111' : '#FFFFFF';
  const accounts = Object.entries(ACCOUNTS).map(([id, v]) => ({ id, label: v.label }));
  const padded   = { maxWidth:760, margin:'0 auto', padding:'16px' };

  return (
    <div style={{ ...FONT, background: rootBg, minHeight:'100vh', color: dark ? '#F2F2F7' : '#000', transition:'background 0.3s ease' }}>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex" style={{ flexDirection:'column', width:240, position:'fixed', left:0, top:0, bottom:0, background: dark ? '#1C1C1E' : '#FFFFFF', borderRight:`1px solid ${dark ? '#2C2C2E' : '#EEEEEE'}`, zIndex:10, padding:'24px 0' }}>
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
              marginBottom:2, display:'block', transition:'background .15s ease, color .15s ease',
            }}>{label}</button>
          ))}
        </nav>
        <div style={{ padding:'16px 12px', borderTop:`1px solid ${dark ? '#2C2C2E' : '#EEEEEE'}` }}>
          <div style={{ ...MFONT, fontSize:11, color:'#AAAAAA', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Account</div>
          {accounts.map(({ id, label }) => (
            <button key={id} onClick={() => setAccount(id)} disabled={running || wdRunning} style={{
              ...FONT, display:'block', width:'100%', textAlign:'left', padding:'7px 10px', borderRadius:6,
              border:'none', cursor:'pointer', fontSize:13, fontWeight: account===id ? 600 : 400,
              background: account===id ? (dark ? '#F2F2F7' : '#000') : 'transparent',
              color:      account===id ? (dark ? '#000' : '#fff') : '#757575',
              marginBottom:2, transition:'background .15s ease, color .15s ease',
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
        <div className="lg:hidden" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:`1px solid ${dark ? '#2C2C2E' : '#EEEEEE'}`, background: dark ? '#1C1C1E' : '#FFFFFF', position:'sticky', top:0, zIndex:40 }}>
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
                cursor:'pointer', transition:'all .15s ease',
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
                setDebugLog={isDebugMode ? setDebugLog : undefined}
              />
            </div>
          )}
          {tab === 'chat'      && <div style={padded}><ChatTab {...shared} /></div>}
          {tab === 'watchdog'  && <div style={padded}><WatchdogTab {...shared} wdRunning={wdRunning} setWdRunning={setWdRunning} /></div>}
          {tab === 'dca'       && <div style={padded}><DCATab {...shared} /></div>}
          {tab === 'alpha'     && <div style={padded}><AlphaTrackerTab account={account} dark={dark} /></div>}
          {tab === 'roadmap'   && <div style={padded}><RoadmapTab dark={dark} /></div>}
          {tab === 'changelog' && <div style={padded}><ChangelogTab dark={dark} /></div>}
          {tab === 'settings'  && <div style={padded}><SettingsTab dark={dark} setDark={setDark} /></div>}
          {tab === 'debug'     && isDebugMode && <DebugTab debugLog={debugLog} dark={dark} />}
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
