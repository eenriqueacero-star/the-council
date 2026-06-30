import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Bell, BellOff, Crown, Check } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { AGENTS, AXIOM_AVATAR } from '../constants/agents.js';
import SparkLogo from './SparkLogo.jsx';
import { enablePush, pushSupported } from '../push.js';

const FONT  = { fontFamily: "var(--font-display)" };
const MONO  = { fontFamily: "ui-monospace,'SF Mono',monospace" };

const ALL_AGENTS = [
  ...AGENTS,
  {
    id: 'axiom', name: 'AXIOM', avatar: AXIOM_AVATAR, emoji: '👑', color: '#F59E0B',
    role: 'Supreme Arbiter',
    onboardDesc: 'Synthesizes all 6 specialists into a single decisive ruling — BUY, WATCH, or SKIP. AXIOM has the final word on every trade.',
  },
];

const AGENT_DESC = {
  technical: 'Reads price action, weekly trend, RSI, MACD, and Bollinger Bands. Flags the technical setup so you never enter against the chart.',
  catalyst:  'Hunts upcoming earnings, product launches, and M&A within 60 days. No catalyst within the window = no entry.',
  risk:      'Guards against concentration risk, oversized positions, and portfolio-level drawdown. The portfolio\'s safety net.',
  macro:     'Tracks VIX, yield curve, Fed rates, and sector rotation. Ensures you\'re not swimming against the macro tide.',
  bear:      'Argues the other side — always. Stress-tests every thesis and surfaces what the bulls are ignoring.',
  sizer:     'Decides how much capital to deploy: full size, starter, or bench. Every ruling includes a dollar amount.',
};

const BTN_PRIMARY = {
  ...FONT, fontSize: 15, fontWeight: 600, padding: '14px 0',
  width: '100%', borderRadius: 12, border: 'none',
  background: '#3B82F6', color: '#fff', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
};

const BTN_GHOST = {
  ...FONT, fontSize: 13, fontWeight: 400, padding: '10px 0',
  width: '100%', borderRadius: 12, border: 'none',
  background: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
};

// ── Screen 1 ─────────────────────────────────────────────────────────────────
function WelcomeScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, textAlign: 'center' }}>
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1,   opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        style={{ filter: 'drop-shadow(0 0 32px rgba(59,130,246,0.5))' }}
      >
        <SparkLogo size={88} />
      </motion.div>
      <div>
        <h1 style={{ ...FONT, fontSize: 28, fontWeight: 800, color: '#FAFAFA', margin: '0 0 10px', letterSpacing: '-0.02em' }}>
          Welcome to The Council
        </h1>
        <p style={{ ...FONT, fontSize: 16, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.55 }}>
          Your AI-powered investment war room — 6 specialist agents deliberating every trade in real time.
        </p>
      </div>
    </div>
  );
}

// ── Screen 2 ─────────────────────────────────────────────────────────────────
function AgentsScreen({ agentIndex, onAgentChange }) {
  const ag = ALL_AGENTS[agentIndex];
  const desc = AGENT_DESC[ag.id] || ag.onboardDesc || '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%' }}>
      <div>
        <h2 style={{ ...FONT, fontSize: 22, fontWeight: 700, color: '#FAFAFA', margin: '0 0 6px', textAlign: 'center', letterSpacing: '-0.01em' }}>Meet the Agents</h2>
        <p style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', margin: 0 }}>
          {agentIndex + 1} / {ALL_AGENTS.length}
        </p>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={agentIndex}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.25 }}
          style={{
            width: '100%',
            background: `${ag.color}14`,
            border: `1px solid ${ag.color}30`,
            borderTop: `3px solid ${ag.color}`,
            borderRadius: 16,
            padding: '20px 20px',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src={ag.avatar} alt={ag.name} style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover', border: `2px solid ${ag.color}50` }} />
            <div>
              <div style={{ ...FONT, fontSize: 20, fontWeight: 800, color: ag.color }}>{ag.name}</div>
              <div style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{ag.role}</div>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 28 }}>{ag.emoji}</span>
          </div>
          <p style={{ ...FONT, fontSize: 14, color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.6 }}>{desc}</p>
        </motion.div>
      </AnimatePresence>

      {/* Dot navigation */}
      <div style={{ display: 'flex', gap: 5 }}>
        {ALL_AGENTS.map((_, i) => (
          <button
            key={i}
            onClick={() => onAgentChange(i)}
            style={{
              width: i === agentIndex ? 18 : 6, height: 6, borderRadius: 3,
              background: i === agentIndex ? ALL_AGENTS[i].color : 'rgba(255,255,255,0.15)',
              border: 'none', cursor: 'pointer', padding: 0,
              transition: 'all 0.3s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Screen 3 ─────────────────────────────────────────────────────────────────
function PortfolioScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, textAlign: 'center', width: '100%' }}>
      <div style={{ fontSize: 52 }}>📊</div>
      <div>
        <h2 style={{ ...FONT, fontSize: 22, fontWeight: 700, color: '#FAFAFA', margin: '0 0 10px', letterSpacing: '-0.01em' }}>Your Portfolio</h2>
        <p style={{ ...FONT, fontSize: 15, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.6 }}>
          Add your holdings so the agents know exactly what you own. They'll use your positions to size every recommendation to your actual portfolio.
        </p>
      </div>
      <div style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 16px', lineHeight: 1.7, textAlign: 'left', width: '100%' }}>
        <div>· Ticker symbol + shares + average cost</div>
        <div>· Supports Edwin · Dad · Bro accounts</div>
        <div>· Synced to the cloud — available everywhere</div>
        <div>· You can always update these later in Settings</div>
      </div>
    </div>
  );
}

// ── Screen 4 ─────────────────────────────────────────────────────────────────
function NotificationsScreen({ pushState, onRequest }) {
  const supported = typeof window !== 'undefined' && pushSupported();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, textAlign: 'center', width: '100%' }}>
      <motion.div
        animate={{ rotate: pushState === 'granted' ? 0 : [0, -8, 8, -5, 5, 0] }}
        transition={{ repeat: Infinity, repeatDelay: 3, duration: 0.5 }}
      >
        {pushState === 'granted' ? (
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(34,197,94,0.15)', border: '1px solid #22C55E40', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={32} color="#22C55E" />
          </div>
        ) : pushState === 'denied' ? (
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(239,68,68,0.15)', border: '1px solid #EF444440', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BellOff size={32} color="#EF4444" />
          </div>
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(59,130,246,0.15)', border: '1px solid #3B82F640', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bell size={32} color="#3B82F6" />
          </div>
        )}
      </motion.div>
      <div>
        <h2 style={{ ...FONT, fontSize: 22, fontWeight: 700, color: '#FAFAFA', margin: '0 0 10px', letterSpacing: '-0.01em' }}>
          {pushState === 'granted' ? 'Notifications On' : 'Stay in the Loop'}
        </h2>
        <p style={{ ...FONT, fontSize: 15, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.6 }}>
          {pushState === 'granted'
            ? "You'll get alerts when agents detect something that needs your attention."
            : !supported
            ? "Install the app to your home screen (Share → Add to Home Screen in Safari) to enable push notifications."
            : "Get alerts on your device when REX spots a trend break, NOVA finds a catalyst, or AXIOM delivers a verdict."}
        </p>
      </div>
      {!supported && (
        <div style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 16px' }}>
          Safari → Share → Add to Home Screen
        </div>
      )}
      {pushState === 'denied' && (
        <div style={{ ...MONO, fontSize: 11, color: '#F59E0B', background: 'rgba(245,158,11,0.1)', borderRadius: 10, padding: '10px 16px' }}>
          Browser blocked notifications. Enable in Settings → Notifications to turn on later.
        </div>
      )}
    </div>
  );
}

// ── Screen 5 ─────────────────────────────────────────────────────────────────
function ReadyScreen() {
  const RADIUS = 100;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, textAlign: 'center' }}>
      {/* Mini council: agents in a circle + AXIOM center */}
      <div style={{ position: 'relative', width: 260, height: 260 }}>
        {AGENTS.map((ag, i) => {
          const angle = (i / AGENTS.length) * Math.PI * 2 - Math.PI / 2;
          const x = 130 + RADIUS * Math.cos(angle) - 22;
          const y = 130 + RADIUS * Math.sin(angle) - 22;
          return (
            <motion.img
              key={ag.id}
              src={ag.avatar}
              alt={ag.name}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.08, duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
              style={{
                position: 'absolute', left: x, top: y,
                width: 44, height: 44, borderRadius: 12, objectFit: 'cover',
                border: `2px solid ${ag.color}`,
                boxShadow: `0 0 12px ${ag.color}60`,
              }}
            />
          );
        })}
        {/* AXIOM center */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
          style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}
        >
          <div style={{ position: 'relative' }}>
            <Crown size={14} style={{ position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)', color: '#F59E0B', filter: 'drop-shadow(0 0 4px #F59E0B)' }} />
            <img src={AXIOM_AVATAR} alt="AXIOM" style={{ width: 54, height: 54, borderRadius: 14, objectFit: 'cover', border: '2px solid #F59E0B', boxShadow: '0 0 20px rgba(245,158,11,0.5)' }} />
          </div>
        </motion.div>
      </div>

      <div>
        <h2 style={{ ...FONT, fontSize: 22, fontWeight: 700, color: '#FAFAFA', margin: '0 0 10px', letterSpacing: '-0.01em' }}>Your Council Is Assembled</h2>
        <p style={{ ...FONT, fontSize: 15, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.6 }}>
          6 specialists + AXIOM are already scanning your holdings in the background. Head to the Council tab to convene on any ticker.
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const SCREENS = 5;

export default function OnboardingFlow({ onComplete, onSetupPortfolio }) {
  const [screen,     setScreen]     = useState(0);
  const [direction,  setDirection]  = useState(1);
  const [agentIndex, setAgentIndex] = useState(0);
  const [pushState,  setPushState]  = useState('idle');

  // Auto-advance agent carousel on screen 1
  useEffect(() => {
    if (screen !== 1) return;
    const id = setInterval(() => setAgentIndex(i => (i + 1) % ALL_AGENTS.length), 3000);
    return () => clearInterval(id);
  }, [screen]);

  function advance() {
    if (screen >= SCREENS - 1) { complete(); return; }
    setDirection(1);
    setScreen(s => s + 1);
  }

  function goBack() {
    setDirection(-1);
    setScreen(s => s - 1);
  }

  async function complete() {
    const uid = auth.currentUser?.uid;
    if (uid) {
      await setDoc(doc(db, 'users', uid, 'data', 'preferences'), { hasSeenOnboarding: true }, { merge: true }).catch(() => {});
    }
    onComplete?.();
  }

  async function requestPush() {
    setPushState('requesting');
    try {
      await enablePush();
      setPushState('granted');
      setTimeout(advance, 1200);
    } catch {
      setPushState('denied');
    }
  }

  const slideVariants = {
    enter:  d => ({ opacity: 0, x: d > 0 ? 50 : -50 }),
    center: { opacity: 1, x: 0 },
    exit:   d => ({ opacity: 0, x: d > 0 ? -50 : 50 }),
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: '#09090B',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Content */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '32px 32px 0', overflow: 'hidden',
        maxWidth: 480, margin: '0 auto', width: '100%',
      }}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={screen}
            custom={direction}
            variants={slideVariants}
            initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ width: '100%' }}
          >
            {screen === 0 && <WelcomeScreen />}
            {screen === 1 && <AgentsScreen agentIndex={agentIndex} onAgentChange={setAgentIndex} />}
            {screen === 2 && <PortfolioScreen />}
            {screen === 3 && <NotificationsScreen pushState={pushState} onRequest={requestPush} />}
            {screen === 4 && <ReadyScreen />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '20px 0 12px' }}>
        {Array.from({ length: SCREENS }, (_, i) => (
          <div key={i} style={{
            width: i === screen ? 20 : 6, height: 6, borderRadius: 3,
            background: i === screen ? '#3B82F6' : 'rgba(255,255,255,0.15)',
            transition: 'all 0.3s ease',
          }} />
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ padding: '0 32px 48px', maxWidth: 480, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {screen === 3 ? (
          <>
            {pushState !== 'granted' && (
              <button
                onClick={requestPush}
                disabled={pushState === 'requesting'}
                style={{ ...BTN_PRIMARY, opacity: pushState === 'requesting' ? 0.7 : 1 }}
              >
                {pushState === 'requesting' ? 'Requesting…' : pushState === 'denied' ? 'Blocked — enable in browser settings' : <><Bell size={16} /> Enable Notifications</>}
              </button>
            )}
            <button onClick={advance} style={BTN_GHOST}>Maybe Later</button>
          </>
        ) : screen === 2 ? (
          <>
            <button onClick={() => { onSetupPortfolio?.(); complete(); }} style={BTN_PRIMARY}>Set Up Portfolio</button>
            <button onClick={advance} style={BTN_GHOST}>Skip for Now</button>
          </>
        ) : screen === SCREENS - 1 ? (
          <button onClick={complete} style={BTN_PRIMARY}>Enter The Council <ChevronRight size={16} /></button>
        ) : (
          <button onClick={advance} style={BTN_PRIMARY}>
            {screen === 0 ? 'Get Started' : 'Continue'} <ChevronRight size={16} />
          </button>
        )}
        {screen > 0 && (
          <button onClick={goBack} style={BTN_GHOST}>← Back</button>
        )}
      </div>
    </div>
  );
}
