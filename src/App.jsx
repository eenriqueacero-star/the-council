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
import MarketOverlay from './components/MarketOverlay.jsx';
import AmbientBackground from './components/AmbientBackground.jsx';
import { motion, LayoutGroup } from 'framer-motion';
import gsap from 'gsap';
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
  const [account,  setAccount]  = useState(() => localStorage.getItem('council_account') || 'edwin');
  const [tab,      setTab]      = useState('portfolio');
  const [apiDown,  setApiDown]  = useState(false);
  const [mktState, setMktState] = useState(() => getMarketState(new Date()));
  const [msToOpen, setMsToOpen] = useState(() => getTimeToNextOpen(new Date()));
  const [dayChange,setDayChange]= useState(0);
  const [dark, setDark]             = useState(() => localStorage.getItem('council_dark') === 'true');
  const [mktOverride, setMktOverride] = useState(null); // null = live, string = test override
  const [pdOverride,  setPdOverride]  = useState(null); // null = computed, string = test override
  useEffect(() => { localStorage.setItem('council_dark', String(dark)); }, [dark]);
  useEffect(() => { localStorage.setItem('council_account', account); }, [account]);

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
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'

  const flagApiDown = () => setApiDown(true);

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      setMktState(getMarketState(now));
      setMsToOpen(getTimeToNextOpen(now));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const saveTimer     = useRef(null);
  const positionsRef  = useRef(positions); // always mirrors latest positions state
  const fsLoaded      = useRef(false);     // true after first snapshot fires

  useEffect(() => {
    let snapUnsub = () => {};
    const authUnsub = onAuthStateChanged(auth, user => {
      snapUnsub();
      fsLoaded.current = false;
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
          // Keep positionsRef in sync so pending saves use the latest merged state
          positionsRef.current = merged;
          return merged;
        });
      }, err => {
        console.error('positions snapshot error:', err);
        fsLoaded.current = true; // unblock saves even on error
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
        await setDoc(
          doc(db, 'users', u.uid, 'data', 'positions'),
          { positions: positionsRef.current },
          { merge: true }
        );
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

  // ── refs for boot animation ──────────────────────────────────────────────
  const sidebarRef  = useRef(null);
  const mainRef     = useRef(null);
  const [bell, setBell] = useState(false);
  const prevMktRef  = useRef(mktState);

  // Detect market open transition → ring the bell
  useEffect(() => {
    if (prevMktRef.current !== 'open' && mktState === 'open') setBell(true);
    prevMktRef.current = mktState;
  }, [mktState]);

  // 9-step boot GSAP timeline — uses gsap.from() so elements start visible and
  // GSAP only adds the starting offset; content is always readable if JS stalls.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      // 1. ambient canvas already painting
      // 2. sidebar slide in from left
      if (sidebarRef.current) {
        tl.from(sidebarRef.current, { x: -28, duration: 0.55 }, 0.05);
        // 3. brand wordmark
        const brand = sidebarRef.current.querySelector('.sidebar-brand');
        if (brand) tl.from(brand, { y: -8, opacity: 0, duration: 0.38 }, 0.18);
        // 4. nav buttons stagger
        const navBtns = sidebarRef.current.querySelectorAll('nav button');
        if (navBtns.length) tl.from(navBtns, { x: -8, opacity: 0, duration: 0.3, stagger: 0.025 }, 0.26);
        // 5. account area
        const acctArea = sidebarRef.current.querySelector('.sidebar-accounts');
        if (acctArea) tl.from(acctArea, { y: 6, opacity: 0, duration: 0.35 }, 0.48);
      }
      // 6. main content
      if (mainRef.current) {
        tl.from(mainRef.current, { y: 16, duration: 0.6 }, 0.22);
      }
      // 7. ambient glow fade in
      const glow = document.querySelector('.ambient-glow');
      if (glow) tl.from(glow, { opacity: 0, duration: 1.6 }, 0.05);
      // 8. bottom nav slide up
      const bnav = document.querySelector('.bottom-nav');
      if (bnav) tl.from(bnav, { y: 36, opacity: 0, duration: 0.5 }, 0.38);
      // 9. ArcReactor
      const arc = document.querySelector('.sidebar-brand svg');
      if (arc) tl.from(arc, { scale: 0, opacity: 0, duration: 0.4, ease: 'back.out(1.7)' }, 0.08);
    });
    return () => ctx.revert();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const acct         = ACCOUNTS[account];
  const posMap       = positions[account] || {};
  const acctHoldings = Object.keys(posMap).length ? Object.keys(posMap) : (acct?.holdings || []);
  const positionsLine = acctHoldings.map(t => {
    const p = posMap[t] || {};
    return p.shares ? `${t} ${p.shares}sh${p.cost ? ` @ $${p.cost} avg` : ''}` : t;
  }).join(', ');

  const shared = { account, acct, posMap, acctHoldings, positionsLine, flagApiDown, apiDown, dark, saveStatus };

  const isNight = effectiveMkt === 'overnight' || effectiveMkt === 'evening';

  const glowColor = (() => {
    if (effectiveMkt === 'open') {
      if (dayChange > 0) return 'rgba(0,200,5,0.18)';
      if (dayChange < 0) return 'rgba(255,59,48,0.18)';
      return 'transparent';
    }
    if (effectiveMkt === 'premarket')  return 'rgba(245,158,11,0.16)';
    if (effectiveMkt === 'afterhours') return 'rgba(124,58,237,0.20)';
    if (isNight)                       return 'rgba(88,28,135,0.28)';
    return 'rgba(107,114,128,0.08)';
  })();

  const portfolioDirection = pdOverride  || (dayChange > 0.01 ? 'up' : dayChange < -0.01 ? 'down' : 'flat');
  const effectiveMkt       = mktOverride || mktState;
  const effectiveMsToOpen  = mktOverride ? 0 : msToOpen;

  // In dark mode the ambient canvas provides the background; keep solid bg only in light mode
  const rootBg = dark ? 'transparent' : '#FFFFFF';

  const accounts = Object.entries(ACCOUNTS).map(([id, v]) => ({ id, label: v.label }));
  const padded   = { maxWidth:760, margin:'0 auto', padding:'16px' };

  return (
    <div style={{ ...FONT, background: rootBg, minHeight:'100vh', color: dark ? '#F2F2F7' : '#000', transition:'background 3s ease' }}>
      {dark && <AmbientBackground marketState={effectiveMkt} portfolioDirection={portfolioDirection} />}
      <div className="ambient-glow" style={{
        background: glowColor,
        ...(effectiveMkt === 'premarket'  && { top:'auto', bottom:'-150px', width:500, height:500 }),
        ...(isNight                       && { width:700, height:600, top:'-260px' }),
        ...(effectiveMkt === 'afterhours' && { width:500, height:550, top:'-220px' }),
      }} />
      <MarketOverlay state={effectiveMkt} dark={dark} />

      {/* Desktop sidebar */}
      <div ref={sidebarRef} className="hidden lg:flex" style={{ flexDirection:'column', width:240, position:'fixed', left:0, top:0, bottom:0, background: dark ? (isNight ? '#12101c' : '#1C1C1E') : '#FFFFFF', borderRight: `1px solid ${dark ? (isNight ? '#2a2040' : '#2C2C2E') : '#EEEEEE'}`, zIndex:10, padding:'24px 0', transition:'background 3s ease, border-color 3s ease' }}>
        <div className="sidebar-brand" style={{ padding:'0 20px 24px', display:'flex', alignItems:'center', gap:10 }}>
          <ArcReactor size={28} />
          <span style={{ fontSize:14, fontWeight:700, letterSpacing:'0.06em' }}>THE COUNCIL</span>
          {mktOverride && <span style={{ fontSize:9, background:'rgba(255,165,0,0.2)', color:'#f5a623', padding:'1px 5px', borderRadius:4, marginLeft:2, fontFamily:'monospace' }}>TEST</span>}
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
          <div className="sidebar-accounts">
          <div style={{ ...MFONT, fontSize:11, color:'#AAAAAA', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Account</div>
          <LayoutGroup id="sidebar-acct">
            {accounts.map(({ id, label }) => (
              <div key={id} style={{ position:'relative', marginBottom:2 }}>
                {account === id && (
                  <motion.div layoutId="sidebar-acct-bg"
                    style={{ position:'absolute', inset:0, borderRadius:6, background: dark ? '#F2F2F7' : '#000', zIndex:0 }}
                    transition={{ type:'spring', duration:0.38, bounce:0.12 }} />
                )}
                <button onClick={() => setAccount(id)} disabled={running || wdRunning} style={{
                  ...FONT, display:'block', width:'100%', textAlign:'left', padding:'7px 10px', borderRadius:6,
                  border:'none', cursor:'pointer', fontSize:13, fontWeight: account===id ? 600 : 400,
                  background:'transparent', position:'relative', zIndex:1,
                  color: account===id ? (dark ? '#000' : '#fff') : '#757575',
                }}>{label}</button>
              </div>
            ))}
          </LayoutGroup>
          <button onClick={() => signOut(auth)} style={{ ...FONT, marginTop:8, display:'flex', alignItems:'center', gap:6, color:'#AAAAAA', border:'none', background:'none', cursor:'pointer', fontSize:13, padding:'4px 2px' }}>
            <LogOut size={14} /> Sign out
          </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div ref={mainRef} className="lg:ml-[240px]" style={{ position:'relative', zIndex:1 }}>
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

        {effectiveMkt !== 'open' && (
          <div style={{ padding:'0 16px', maxWidth:760, margin:'0 auto' }}>
            <MarketBanner state={effectiveMkt} msToOpen={effectiveMsToOpen} />
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
              marketState={effectiveMkt} onDayChange={setDayChange}
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
            <div style={padded}><SettingsTab dark={dark} setDark={setDark}
              mktOverride={mktOverride} setMktOverride={setMktOverride}
              pdOverride={pdOverride} setPdOverride={setPdOverride}
              effectiveMkt={effectiveMkt} portfolioDirection={portfolioDirection}
              onTestBell={() => setBell(true)}
            /></div>
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

      {/* Market open bell */}
      {bell && dark && <MarketBell onDone={() => setBell(false)} />}
    </div>
  );
}

function MarketBell({ onDone }) {
  const overlayRef = useRef(null);
  const bellRef    = useRef(null);
  useEffect(() => {
    if (!overlayRef.current || !bellRef.current) return;
    const tl = gsap.timeline({ onComplete: onDone });
    tl.fromTo(overlayRef.current, { opacity: 0 },          { opacity: 1, duration: 0.3 })
      .fromTo(bellRef.current,    { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.7)' }, 0.1)
      .to(bellRef.current,        { className: '+=bell-ring', duration: 0.8 }, 0.55)
      .to(overlayRef.current,     { opacity: 0, duration: 0.6, ease: 'power2.in' }, 2.6);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={overlayRef} style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
      <div ref={bellRef} style={{ textAlign:'center', background:'rgba(5,10,14,0.9)', borderRadius:20, padding:'28px 44px', backdropFilter:'blur(16px)', border:'1px solid rgba(0,200,5,0.35)', boxShadow:'0 0 40px rgba(0,200,5,0.15)' }}>
        <div style={{ fontSize:56, lineHeight:1 }}>🔔</div>
        <div style={{ color:'#00C805', fontWeight:700, marginTop:10, letterSpacing:'0.12em', fontSize:13 }}>MARKET OPEN</div>
        <div style={{ color:'rgba(255,255,255,0.45)', fontSize:11, marginTop:4, ...MFONT }}>9:30 AM ET</div>
      </div>
    </div>
  );
}
