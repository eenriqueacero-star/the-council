import React, { useState, useEffect, useRef } from 'react';
import { Moon, Sun, Bell, BellOff, BellRing, ChevronRight, LogOut, Download, Trash2, Info, User, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, query, orderBy, limit } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { ACCOUNTS, AGENTS } from '../constants/agents.js';
import { theme } from '../utils/theme.js';
import { enablePush, disablePush, getPushState, pushSupported } from '../push.js';
import { toast } from '../utils/toast.js';

const FONT  = { fontFamily: "var(--font-display)" };
const MONO  = { fontFamily: "ui-monospace,'SF Mono',monospace" };

const THRESHOLDS = [3, 5, 7, 10];

function SectionHeader({ label }) {
  return (
    <div style={{ padding: '8px 16px 6px' }}>
      <span style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>{label}</span>
    </div>
  );
}

function RowDivider({ T }) {
  return <div style={{ height: 1, background: T.border, margin: '0 16px' }} />;
}

function Toggle({ value, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      aria-pressed={value}
      style={{
        width: 46, height: 26, borderRadius: 13, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: value ? '#3B82F6' : 'rgba(255,255,255,0.12)',
        position: 'relative', flexShrink: 0,
        transition: 'background 0.2s ease',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3, left: value ? 23 : 3,
        transition: 'left 0.2s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

function Row({ icon: Icon, iconColor, label, subtitle, rightEl, onClick, T }) {
  const content = (
    <div style={{
      display: 'flex', alignItems: 'center', padding: '14px 16px', gap: 14,
      cursor: onClick ? 'pointer' : 'default',
      background: 'transparent',
    }}>
      {Icon && (
        <div style={{ width: 32, height: 32, borderRadius: 8, background: iconColor ? `${iconColor}22` : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={16} style={{ color: iconColor || T.text3 }} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...FONT, fontSize: 14, fontWeight: 500, color: T.text }}>{label}</div>
        {subtitle && <div style={{ ...MONO, fontSize: 11, color: T.text3, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {rightEl}
      {onClick && !rightEl && <ChevronRight size={15} style={{ color: T.text3, flexShrink: 0 }} />}
    </div>
  );
  if (onClick) return <button onClick={onClick} style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', padding: 0 }}>{content}</button>;
  return content;
}

function Section({ children, T }) {
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
      {children}
    </div>
  );
}

// ── Export helpers ────────────────────────────────────────────────────────────
function positionsToCSV(positions) {
  const rows = [['Account', 'Ticker', 'Shares', 'Avg Cost']];
  for (const [acctId, holdings] of Object.entries(positions)) {
    const label = ACCOUNTS[acctId]?.label || acctId;
    for (const [ticker, p] of Object.entries(holdings || {})) {
      rows.push([label, ticker, p.shares || '', p.cost || '']);
    }
  }
  return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function downloadCSV(filename, content) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── DCA sub-component ─────────────────────────────────────────────────────────
function DCASection({ T }) {
  const [dca, setDca] = useState(() => {
    const out = {};
    for (const [id, acct] of Object.entries(ACCOUNTS)) out[id] = String(acct.dca || 0);
    return out;
  });
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'users', uid, 'data', 'settings')).then(snap => {
      if (snap.exists() && snap.data().dca) {
        setDca(prev => ({ ...prev, ...snap.data().dca }));
      }
    }).catch(() => {});
  }, []);

  async function saveDCA(next) {
    setSaved(false);
    clearTimeout(saveTimer.current);
    setDca(next);
    saveTimer.current = setTimeout(async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      await setDoc(doc(db, 'users', uid, 'data', 'settings'), { dca: next }, { merge: true }).catch(() => {});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 600);
  }

  return (
    <Section T={T}>
      <SectionHeader label="DCA SCHEDULE" />
      {Object.entries(ACCOUNTS).map(([id, acct], i) => (
        <React.Fragment key={id}>
          {i > 0 && <RowDivider T={T} />}
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ ...FONT, fontSize: 13, fontWeight: 500, color: T.text }}>{acct.label}</div>
              <div style={{ ...MONO, fontSize: 10, color: T.text3 }}>{acct.sub} · {acct.dcaNote}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ ...MONO, fontSize: 12, color: T.text3 }}>$</span>
              <input
                value={dca[id] || ''}
                onChange={e => saveDCA({ ...dca, [id]: e.target.value.replace(/[^0-9]/g, '') })}
                style={{
                  ...MONO, fontSize: 14, fontWeight: 600, color: T.text,
                  background: T.input, border: `1px solid ${T.inputBorder}`,
                  borderRadius: 8, padding: '6px 10px', width: 72, outline: 'none', textAlign: 'right',
                }}
              />
              <span style={{ ...MONO, fontSize: 10, color: T.text3 }}>/wk</span>
            </div>
          </div>
        </React.Fragment>
      ))}
      {saved && (
        <div style={{ ...MONO, fontSize: 10, color: '#22C55E', textAlign: 'center', padding: '4px 0 10px' }}>Saved ✓</div>
      )}
    </Section>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SettingsTab({ dark, setDark, alertSettings, setAlertSettings, onTriggerOnboarding }) {
  const T = theme(dark);
  const [pushOn, setPushOn] = useState('off');
  const [pushLoading, setPushLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const user = auth.currentUser;

  useEffect(() => {
    getPushState().then(setPushOn);
  }, []);

  async function togglePush(wantOn) {
    setPushLoading(true);
    try {
      if (wantOn) { await enablePush(); setPushOn('on'); toast.success('Notifications enabled'); }
      else         { await disablePush(); setPushOn('off'); toast.info('Notifications disabled'); }
    } catch (e) {
      const msg = e.message === 'permission-denied' ? 'Permission blocked — enable in browser settings' : 'Could not change notification state';
      toast.error(msg);
    } finally { setPushLoading(false); }
  }

  function exportPortfolio() {
    const uid = auth.currentUser?.uid;
    if (!uid) return toast.error('Not signed in');
    getDoc(doc(db, 'users', uid, 'data', 'positions')).then(snap => {
      if (!snap.exists()) return toast.error('No portfolio data found');
      const positions = snap.data().positions || {};
      downloadCSV(`council-portfolio-${new Date().toISOString().slice(0,10)}.csv`, positionsToCSV(positions));
      toast.success('Portfolio exported');
    }).catch(() => toast.error('Export failed — try again'));
  }

  async function clearFeed() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      const q = query(collection(db, 'users', uid, 'agent_feed'), orderBy('createdAt', 'desc'), limit(50));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      toast.success('Agent feed cleared');
    } catch { toast.error('Could not clear feed'); }
  }

  async function deleteAccount() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    // Sign out — actual Firestore data deletion would require a server-side cleanup
    await signOut(auth);
    setShowDeleteConfirm(false);
  }

  // Alert threshold state change (write back to parent)
  function setThreshold(t) { setAlertSettings(prev => ({ ...prev, globalThreshold: t })); }

  const pushUnsupported = typeof window !== 'undefined' && !pushSupported();
  const pushIcon = pushOn === 'on' ? BellRing : pushOn === 'off' ? Bell : BellOff;
  const pushColor = pushOn === 'on' ? '#22C55E' : pushOn === 'denied' ? '#EF4444' : T.text2;

  return (
    <div style={{ ...FONT, maxWidth: 480, margin: '0 auto', padding: '24px 16px 80px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 24, letterSpacing: '-0.01em' }}>Settings</h2>

      {/* ── Profile ── */}
      <Section T={T}>
        <SectionHeader label="PROFILE" />
        <Row icon={User} iconColor="#3B82F6" label={user?.displayName || 'Edwin'} subtitle={user?.email || ''} T={T} />
        <RowDivider T={T} />
        <Row icon={LogOut} iconColor="#EF4444" label="Sign Out" T={T} onClick={() => signOut(auth)} />
      </Section>

      {/* ── Appearance ── */}
      <Section T={T}>
        <SectionHeader label="APPEARANCE" />
        <Row
          icon={dark ? Moon : Sun}
          iconColor="#A855F7"
          label="Dark Mode"
          subtitle={dark ? 'On' : 'Off'}
          T={T}
          rightEl={<Toggle value={dark} onChange={setDark} />}
        />
      </Section>

      {/* ── DCA Settings ── */}
      <DCASection T={T} />

      {/* ── Notifications ── */}
      <Section T={T}>
        <SectionHeader label="NOTIFICATIONS" />
        <Row
          icon={pushIcon}
          iconColor={pushColor}
          label="Push Notifications"
          subtitle={pushUnsupported ? 'Install app to enable (Safari → Add to Home Screen)' : pushOn === 'on' ? 'On — alerts & council verdicts' : pushOn === 'denied' ? 'Blocked by browser' : 'Off'}
          T={T}
          rightEl={
            !pushUnsupported && pushOn !== 'denied'
              ? <Toggle value={pushOn === 'on'} onChange={togglePush} disabled={pushLoading} />
              : null
          }
        />
        <RowDivider T={T} />
        {/* Alert threshold */}
        <div style={{ padding: '12px 16px 14px' }}>
          <div style={{ ...FONT, fontSize: 14, fontWeight: 500, color: T.text, marginBottom: 10 }}>Price Alert Threshold</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {THRESHOLDS.map(t => (
              <button key={t} onClick={() => setThreshold(t)} style={{
                ...MONO, fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${alertSettings?.globalThreshold === t ? '#3B82F6' : T.border}`,
                background: alertSettings?.globalThreshold === t ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: alertSettings?.globalThreshold === t ? '#3B82F6' : T.text2,
              }}>{t}%</button>
            ))}
          </div>
          <div style={{ ...MONO, fontSize: 11, color: T.text3, marginTop: 10, lineHeight: 1.6 }}>
            Alerts fire when a holding moves ±threshold vs previous close. Once per stock per day.
          </div>
        </div>
      </Section>

      {/* ── Display ── */}
      <Section T={T}>
        <SectionHeader label="DISPLAY" />
        <Row
          icon={RefreshCcw}
          iconColor="#F59E0B"
          label="Replay Onboarding"
          subtitle="Walk through the intro again"
          T={T}
          onClick={onTriggerOnboarding}
        />
      </Section>

      {/* ── Data ── */}
      <Section T={T}>
        <SectionHeader label="DATA" />
        <Row icon={Download} iconColor="#22C55E" label="Export Portfolio (CSV)" subtitle="Holdings, shares, avg cost" T={T} onClick={exportPortfolio} />
        <RowDivider T={T} />
        <Row icon={Trash2} iconColor="#F59E0B" label="Clear Agent Feed" subtitle="Removes all feed items" T={T} onClick={clearFeed} />
        <RowDivider T={T} />
        <Row
          icon={Trash2} iconColor="#EF4444"
          label="Delete Account"
          subtitle="Signs you out — data is preserved in Firebase"
          T={T}
          onClick={() => setShowDeleteConfirm(true)}
        />
      </Section>

      {/* ── About ── */}
      <Section T={T}>
        <SectionHeader label="ABOUT" />
        <Row icon={Info} iconColor="#52525B" label="Version" subtitle="0.1.0 — the-council-89570" T={T} />
        <RowDivider T={T} />
        <div style={{ padding: '12px 16px' }}>
          <p style={{ ...MONO, fontSize: 11, color: T.text3, margin: 0, lineHeight: 1.6 }}>
            Built by Edwin · 6-agent AI investment council · Not financial advice<br />
            Stack: React 18 · Firebase · Groq API · Vercel · Three.js
          </p>
        </div>
      </Section>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ background: '#18181B', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: 24, maxWidth: 320, width: '100%' }}
            >
              <h3 style={{ ...FONT, fontSize: 16, fontWeight: 700, color: '#FAFAFA', margin: '0 0 8px' }}>Delete Account?</h3>
              <p style={{ ...FONT, fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 20px', lineHeight: 1.5 }}>
                This will sign you out. Your data remains in Firebase — contact Edwin to fully delete it.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowDeleteConfirm(false)} style={{ ...FONT, flex: 1, padding: '10px 0', borderRadius: 10, border: `1px solid ${T.border}`, background: 'none', color: T.text2, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button onClick={deleteAccount} style={{ ...FONT, flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#EF4444', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Sign Out</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
