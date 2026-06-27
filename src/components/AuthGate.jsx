import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase.js';
import CouncilLoader from './ui/CouncilLoader.jsx';

export default function AuthGate({ children, user }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  if (user) return children;

  async function login(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError('Access denied. Check your credentials.');
    }
    setLoading(false);
  }

  const inputStyle = {
    fontFamily: 'var(--font-mono)', width: '100%', display: 'block',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#FAFAFA', borderRadius: 12, padding: '13px 16px', fontSize: 14, outline: 'none',
    transition: 'border-color .15s ease',
  };

  return (
    <div style={{ fontFamily: 'var(--font-display)', background: '#09090B', color: '#FAFAFA', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
      {/* Ambient */}
      <div style={{ position: 'absolute', top: '-15%', left: '50%', transform: 'translateX(-50%)', width: 500, height: 400, background: 'radial-gradient(ellipse, rgba(59,130,246,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{ width: '100%', maxWidth: 360, padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}><CouncilLoader size="lg" /></div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.12em', color: '#FAFAFA' }}>THE COUNCIL</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.18em', marginTop: 6 }}>PRIVATE ACCESS</div>
        </div>

        <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required autoComplete="email"
            style={inputStyle}
            onFocus={e => { e.target.style.borderColor = 'rgba(59,130,246,0.5)'; }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required autoComplete="current-password"
            style={inputStyle}
            onFocus={e => { e.target.style.borderColor = 'rgba(59,130,246,0.5)'; }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }} />
          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#EF4444', margin: 0 }}>{error}</motion.p>
          )}
          <motion.button type="submit" disabled={loading} whileTap={{ scale: 0.97 }}
            style={{ fontFamily: 'var(--font-display)', background: loading ? 'rgba(59,130,246,0.3)' : '#3B82F6', color: '#fff', borderRadius: 12, border: 'none', padding: '14px', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.04em', transition: 'background .15s ease' }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </motion.button>
        </form>
        <p style={{ fontFamily: 'var(--font-mono)', marginTop: 20, fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>Add your account in Firebase → Authentication → Users</p>
      </motion.div>
    </div>
  );
}
