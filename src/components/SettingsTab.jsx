import React, { useState } from 'react';
import { Moon, Sun, Trash2 } from 'lucide-react';
import { theme } from '../utils/theme.js';
import { auth, db } from '../firebase.js';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

const FONT  = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };
const MFONT = { fontFamily: "ui-monospace, 'SF Mono', monospace" };

export default function SettingsTab({ dark, setDark }) {
  const T = theme(dark);
  const [purgeState, setPurgeState] = useState('idle'); // idle | confirm | running | done | error
  const [purgeCount, setPurgeCount] = useState(0);
  const [purgeMsg, setPurgeMsg] = useState('');

  const row = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px' };

  async function purgeAllRulings() {
    const uid = auth.currentUser?.uid;
    if (!uid) { setPurgeMsg('Not logged in.'); setPurgeState('error'); return; }
    setPurgeState('running');
    setPurgeMsg('');
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'rulings'));
      let deleted = 0;
      for (const d of snap.docs) {
        await deleteDoc(doc(db, 'users', uid, 'rulings', d.id));
        deleted++;
        setPurgeCount(deleted);
      }
      setPurgeCount(deleted);
      setPurgeMsg(`Deleted ${deleted} ruling${deleted !== 1 ? 's' : ''}. Clean slate.`);
      setPurgeState('done');
    } catch (e) {
      setPurgeMsg(e.message);
      setPurgeState('error');
    }
  }

  return (
    <div style={{ ...FONT, maxWidth: 480, margin: '0 auto', padding: '24px 16px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 24, letterSpacing: '-0.01em' }}>Settings</h2>

      <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <div style={row}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {dark ? <Moon size={18} style={{ color: T.text2 }} /> : <Sun size={18} style={{ color: T.text2 }} />}
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: T.text }}>Dark mode</div>
              <div style={{ fontSize: 13, color: T.text2, marginTop: 2 }}>Switch between light and dark appearance</div>
            </div>
          </div>
          <button onClick={() => setDark(d => !d)} style={{
            width: 50, height: 30, borderRadius: 15, border: 'none', cursor: 'pointer',
            background: dark ? '#000000' : '#E0E0E0', position: 'relative', flexShrink: 0,
            transition: 'background 0.2s ease',
          }} aria-label="Toggle dark mode">
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#FFFFFF', position: 'absolute', top: 3, left: dark ? 23 : 3, transition: 'left 0.2s ease', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div style={{ border: '1px solid rgba(255,59,48,0.3)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,59,48,0.15)', background: 'rgba(255,59,48,0.06)' }}>
          <span style={{ ...MFONT, fontSize: 11, color: '#FF3B30', letterSpacing: '0.08em' }}>DANGER ZONE</span>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: T.text, marginBottom: 4 }}>Purge all stored rulings</div>
          <div style={{ fontSize: 13, color: T.text2, marginBottom: 12 }}>Deletes every ruling saved in Firestore. Use this to wipe poisoned or hallucinated history. Cannot be undone.</div>
          {purgeState === 'idle' && (
            <button onClick={() => setPurgeState('confirm')} style={{ ...MFONT, background: 'none', border: '1px solid rgba(255,59,48,0.5)', color: '#FF3B30', borderRadius: 7, padding: '8px 16px', fontSize: 12, cursor: 'pointer' }}>
              <Trash2 size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />PURGE ALL RULINGS
            </button>
          )}
          {purgeState === 'confirm' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ ...MFONT, fontSize: 12, color: T.text2 }}>Are you sure?</span>
              <button onClick={purgeAllRulings} style={{ ...MFONT, background: '#FF3B30', border: 'none', color: '#fff', borderRadius: 7, padding: '8px 16px', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>YES, DELETE ALL</button>
              <button onClick={() => setPurgeState('idle')} style={{ ...MFONT, background: 'none', border: `1px solid ${T.border}`, color: T.text2, borderRadius: 7, padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            </div>
          )}
          {purgeState === 'running' && (
            <span style={{ ...MFONT, fontSize: 12, color: '#B45309' }}>Deleting… ({purgeCount} so far)</span>
          )}
          {purgeState === 'done' && (
            <span style={{ ...MFONT, fontSize: 12, color: '#00C805' }}>✓ {purgeMsg}</span>
          )}
          {purgeState === 'error' && (
            <span style={{ ...MFONT, fontSize: 12, color: '#FF3B30' }}>Error: {purgeMsg}</span>
          )}
        </div>
      </div>

      <p style={{ ...MFONT, fontSize: 11, color: T.text3, marginTop: 24, textAlign: 'center', letterSpacing: '0.06em' }}>
        THE COUNCIL · NOT FINANCIAL ADVICE
      </p>
    </div>
  );
}
