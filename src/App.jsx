import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, addDoc, collection, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { ACCOUNTS } from './constants/agents.js';
import { getMarketState, getTimeToNextOpen } from './utils/marketState.js';
import { theme } from './utils/theme.js';
import ArcReactor from './components/ArcReactor.jsx';
import TopBar from './components/TopBar.jsx';
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
import ScoutTab from './components/ScoutTab.jsx';
import DebugTab from './components/DebugTab.jsx';
import { getQuotes } from './api.js';
import { sendNotification, getPermissionState } from './utils/notify.js';
import { writeDebug } from './utils/debugStore.js';
import {
  LayoutDashboard, Users, MessageSquare, Telescope, Eye, PieChart,
  TrendingUp, Map, FileText, Settings, Bug, ChevronRight, LogOut, Sun, Moon,
  MoreHorizontal,
} from 'lucide-react';

const isDebugMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';

const SIDEBAR_TABS = [
  { id: 'portfolio', Icon: LayoutDashboard, label: 'Portfolio'  },
  { id: 'council',   Icon: Users,           label: 'Council'    },
  { id: 'chat',      Icon: MessageSquare,   label: 'Chat'       },
  { id: 'scout',     Icon: Telescope,       label: 'Scout'      },
  { id: 'watchdog',  Icon: Eye,             label: 'Watchdog'   },
  { id: 'dca',       Icon: PieChart,        label: 'DCA'        },
  { id: 'alpha',     Icon: TrendingUp,      label: 'Alpha'      },
  { id: 'roadmap',   Icon: Map,             label: 'Roadmap'    },
  { id: 'changelog', Icon: FileText,        label: 'Changelog'  },
  { id: 'settings',  Icon: Settings,        label: 'Settings'   },
  ...(isDebugMode ? [{ id:'debug', Icon: Bug, label:'Debug' }] : []),
];

const MORE_ROWS = [
  ['watchdog','Watchdog'],['dca','DCA Allocator'],['alpha','Alpha Tracker'],
  ['roadmap','Roadmap'],['changelog','Changelog'],['settings','Settings'],
  ...(isDebugMode ? [['debug','Debug']] : []),
];

const PAGE_VARIANTS = {
  initial: { opacity: 0, y: 16, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0,  filter: 'blur(0px)', transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit:    { opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] } },
};

export default function App() {
  const [account,  setAccount]  = useState(() => localStorage.getItem('council_account') || 'edwin');
  const [tab,      setTab]      = useState('portfolio');
  const [apiDown,  setApiDown]  = useState(false);
  const [mktState, setMktState] = useState(() => getMarketState(new Date()));
  const [msToOpen, setMsToOpen] = useState(() => getTimeToNextOpen(new Date()));
  const [dark, setDark] = useState(() => localStorage.getItem('council_dark') !== 'false');
  const [tooltipId, setTooltipId] = useState(null);

  useEffect(() => { localStorage.setItem('council_dark', String(dark)); }, [dark]);
  useEffect(() => { localStorage.setItem('council_account', account); }, [account]);

  const T = theme(dark);

  const [alertSettings, setAlertSettings] = useState({ globalThreshold: 5, perStock: {} });
  const alertFiredToday = useRef({});
  const lastAlertDate   = useRef(new Date().toDateString());
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
      }, err => { console.error('positions snapshot error:', err); fsLoaded.current = true; });
    });
    return () => { authUnsub(); snapUnsub(); };
  }, []);

  const savePositions = useCallback(() => {
    clearTimeout(saveTimer.current);
    setSaveStatus('saving');
    saveTimer.current = setTimeout(async () => {
      const user = auth.currentUser;
      const doSave = async u => {
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

  const checkAlerts = useCallback(async () => {
    const today = new Date().toDateString();
    if (lastAlertDate.current !== today) { alertFiredToday.current = {}; lastAlertDate.current = today; }
    if (getPermissionState() !== 'granted') return;
    const uid = auth.currentUser?.uid;
    const positionsNow = positionsRef.current;
    const tickers = Object.keys(positionsNow[account] || {}).filter(t => t && t.trim());
    if (!tickers.length) return;
    let quotes;
    try { quotes = await getQuotes(tickers); } catch { return; }
    for (const ticker of tickers) {
      const q = quotes[ticker];
      if (!q || q.changePct == null) continue;
      const threshold = alertSettings.perStock[ticker] ?? alertSettings.globalThreshold;
      const absChg = Math.abs(q.changePct);
      if (absChg < threshold) continue;
      const firedKey = `${ticker}_${today}`;
      if (alertFiredToday.current[firedKey]) continue;
      alertFiredToday.current[firedKey] = true;
      const dir = q.changePct >= 0 ? '📈' : '📉';
      const sign = q.changePct >= 0 ? '+' : '';
      const priceStr = q.price ? ` ($${q.price.toFixed(2)})` : '';
      sendNotification(
        `${dir} ${ticker} is ${q.changePct >= 0 ? 'up' : 'down'} ${sign}${q.changePct.toFixed(1)}% today${priceStr}`,
        `Threshold: ${threshold}%`,
      );
      if (uid) {
        try { await addDoc(collection(db, 'users', uid, 'alertHistory'), { ticker, changePct: q.changePct, price: q.price || null, direction: q.changePct >= 0 ? 'up' : 'down', threshold, firedAt: new Date().toISOString() }); } catch {}
      }
    }
    if (isDebugMode) writeDebug('ALERTS', `Alert check · ${tickers.join(', ')}`, { tickers, quotes, threshold: alertSettings.globalThreshold, fired: { ...alertFiredToday.current } });
  }, [account, alertSettings]);

  useEffect(() => {
    checkAlerts();
    const id = setInterval(checkAlerts, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [checkAlerts]);

  const acct          = ACCOUNTS[account];
  const posMap        = positions[account] || {};
  const acctHoldings  = Object.keys(posMap).length ? Object.keys(posMap) : (acct?.holdings || []);
  const positionsLine = acctHoldings.map(t => {
    const p = posMap[t] || {};
    const costNum = parseFloat(String(p.cost || '').replace(/[^0-9.]/g, ''));
    return p.shares ? `${t} ${p.shares}sh${costNum > 0 ? ` @ $${costNum.toFixed(2)} avg` : ''}` : t;
  }).join(', ');

  const shared = { account, acct, posMap, acctHoldings, positionsLine, flagApiDown, apiDown, dark, saveStatus, authReady };
  const padded = { maxWidth: 760, margin: '0 auto', padding: 'var(--space-page)' };

  function renderTab() {
    if (tab === 'portfolio') return (
      <PortfolioTab {...shared}
        positions={positions} setPos={setPos} addTicker={addTicker} removeTicker={removeTicker}
        marketState={mktState} onTabChange={setTab}
      />
    );
    if (tab === 'council') return (
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
    );
    if (tab === 'chat')      return <div style={padded}><ChatTab {...shared} posMap={posMap} /></div>;
    if (tab === 'scout')     return <ScoutTab dark={dark} posMap={posMap} acctHoldings={acctHoldings} isDebugMode={isDebugMode} />;
    if (tab === 'watchdog')  return <div style={padded}><WatchdogTab {...shared} wdRunning={wdRunning} setWdRunning={setWdRunning} /></div>;
    if (tab === 'dca')       return <div style={padded}><DCATab {...shared} /></div>;
    if (tab === 'alpha')     return <div style={padded}><AlphaTrackerTab account={account} dark={dark} /></div>;
    if (tab === 'roadmap')   return <div style={padded}><RoadmapTab dark={dark} /></div>;
    if (tab === 'changelog') return <div style={padded}><ChangelogTab dark={dark} /></div>;
    if (tab === 'settings')  return <div style={padded}><SettingsTab dark={dark} setDark={setDark} alertSettings={alertSettings} setAlertSettings={setAlertSettings} /></div>;
    if (tab === 'debug' && isDebugMode) return <DebugTab dark={dark} />;
    if (tab === 'more') return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: 'var(--space-page)' }}>
        {MORE_ROWS.map(([t, label]) => (
          <motion.button key={t} onClick={() => setTab(t)} whileTap={{ scale: 0.98 }} style={{
            fontFamily: 'var(--font-display)', width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', padding: '16px 0', background: 'none', border: 'none',
            borderBottom: `1px solid ${T.border}`, cursor: 'pointer', fontSize: 15, fontWeight: 500,
            color: T.text,
          }}>
            {label} <ChevronRight size={16} style={{ color: T.text3 }} />
          </motion.button>
        ))}
      </div>
    );
    return null;
  }

  return (
    <div style={{ fontFamily: 'var(--font-display)', background: T.bg, minHeight: '100vh', color: T.text, transition: 'background 0.4s ease, color 0.4s ease' }}>

      {/* Desktop side rail — icon only, 72px */}
      <aside className="hidden lg:flex" style={{
        flexDirection: 'column', width: 72, position: 'fixed', left: 0, top: 0, bottom: 0,
        background: dark ? '#09090B' : '#FAFAFA',
        borderRight: `1px solid ${T.border}`,
        zIndex: 50, alignItems: 'center', paddingTop: 16, paddingBottom: 16,
      }}>
        <div style={{ marginBottom: 24 }}><ArcReactor size={26} /></div>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: '100%' }}>
          {SIDEBAR_TABS.map(({ id, Icon, label }) => {
            const active = tab === id;
            return (
              <div key={id} style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}
                onMouseEnter={() => setTooltipId(id)} onMouseLeave={() => setTooltipId(null)}>
                <motion.button
                  onClick={() => setTab(id)}
                  whileTap={{ scale: 0.9 }}
                  style={{
                    position: 'relative', width: 44, height: 44, borderRadius: 12, border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
                    color: active ? '#3B82F6' : T.text3,
                    transition: 'background 0.2s, color 0.2s',
                  }}
                >
                  {active && (
                    <motion.div layoutId="rail-pill" style={{
                      position: 'absolute', inset: 0, borderRadius: 12,
                      background: 'rgba(59,130,246,0.15)',
                    }} transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
                  )}
                  <Icon size={20} strokeWidth={active ? 2.2 : 1.7} style={{ position: 'relative', zIndex: 1 }} />
                </motion.button>
                {tooltipId === id && (
                  <div style={{
                    position: 'absolute', left: 56, top: '50%', transform: 'translateY(-50%)',
                    background: dark ? '#27272A' : '#09090B', color: '#FAFAFA',
                    fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 8,
                    whiteSpace: 'nowrap', zIndex: 100, pointerEvents: 'none',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  }}>{label}</div>
                )}
              </div>
            );
          })}
        </nav>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setDark(d => !d)} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.border}`, background: 'transparent', cursor: 'pointer', color: T.text3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => signOut(auth)} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.border}`, background: 'transparent', cursor: 'pointer', color: T.text3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LogOut size={15} />
          </motion.button>
        </div>
      </aside>

      {/* Top bar (desktop) */}
      <TopBar dark={dark} setDark={setDark} account={account} setAccount={setAccount} running={running || wdRunning} />

      {/* Main content */}
      <div className="lg:ml-[72px]" style={{ position: 'relative', zIndex: 1 }}>
        {/* Mobile header */}
        <div className="lg:hidden" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', position: 'sticky', top: 0, zIndex: 40,
          background: dark ? 'rgba(9,9,11,0.92)' : 'rgba(250,250,250,0.92)',
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${T.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArcReactor size={20} />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: T.text }}>THE COUNCIL</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {Object.entries(ACCOUNTS).map(([id, v]) => (
              <motion.button key={id} onClick={() => !(running || wdRunning) && setAccount(id)} whileTap={{ scale: 0.95 }} style={{
                fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: account === id ? 600 : 400,
                padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
                border: `1px solid ${account === id ? T.borderActive : T.border}`,
                background: account === id ? T.accent : 'transparent',
                color: account === id ? '#fff' : T.text2,
              }}>{v.label}</motion.button>
            ))}
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => setDark(d => !d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text3, display: 'flex', alignItems: 'center', padding: 4 }}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </motion.button>
          </div>
        </div>

        {/* Desktop top bar offset */}
        <div className="hidden lg:block" style={{ height: 56 }} />

        {mktState !== 'open' && (
          <div style={{ padding: '0 var(--space-page)', maxWidth: 760, margin: '0 auto' }}>
            <MarketBanner state={mktState} msToOpen={msToOpen} />
          </div>
        )}

        {apiDown && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)',
            borderRadius: 10, padding: '10px 16px', margin: '12px var(--space-page) 0',
            fontSize: 13, color: '#EF4444', maxWidth: 760, marginLeft: 'auto', marginRight: 'auto',
          }}>
            API connection issue. Council responses may be delayed.
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            variants={PAGE_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ paddingBottom: 96 }}
          >
            {renderTab()}
          </motion.div>
        </AnimatePresence>
      </div>

      <BottomNav tab={tab} setTab={setTab} dark={dark} />
    </div>
  );
}
