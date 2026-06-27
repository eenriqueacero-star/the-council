import React from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon, LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase.js';
import ArcReactor from './ArcReactor.jsx';
import { ACCOUNTS } from '../constants/agents.js';

const FONT = { fontFamily: 'var(--font-display)' };

export default function TopBar({ dark, setDark, account, setAccount, running }) {
  const accounts = Object.entries(ACCOUNTS).map(([id, v]) => ({ id, label: v.label }));
  return (
    <header className="glass hidden lg:flex" style={{
      position: 'fixed', top: 0, left: 72, right: 0, height: 56, zIndex: 40,
      alignItems: 'center', justifyContent: 'space-between',
      padding: '0 32px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      background: dark ? 'rgba(9,9,11,0.8)' : 'rgba(250,250,250,0.8)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ArcReactor size={22} />
        <span style={{ ...FONT, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: dark ? '#FAFAFA' : '#09090B' }}>
          THE COUNCIL
        </span>
      </div>

      {/* Account switcher */}
      <div style={{ display: 'flex', gap: 6 }}>
        {accounts.map(({ id, label }) => (
          <motion.button
            key={id}
            onClick={() => !running && setAccount(id)}
            whileTap={{ scale: 0.96 }}
            style={{
              ...FONT, fontSize: 12, fontWeight: account === id ? 600 : 400,
              padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
              border: `1px solid ${account === id ? (dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.20)') : (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)')}`,
              background: account === id ? (dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)') : 'transparent',
              color: account === id ? (dark ? '#FAFAFA' : '#09090B') : (dark ? '#A1A1AA' : '#71717A'),
            }}
          >{label}</motion.button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setDark(d => !d)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#A1A1AA' : '#71717A', display: 'flex', padding: 4 }}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => signOut(auth)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#52525B' : '#A1A1AA', display: 'flex', padding: 4 }}
        >
          <LogOut size={15} />
        </motion.button>
      </div>
    </header>
  );
}
