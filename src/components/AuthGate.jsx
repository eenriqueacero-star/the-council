import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase.js';
import { MONO } from '../constants/styles.js';

export default function AuthGate({ children, user }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  if (user) return children;

  async function login(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch { setError('Access denied. Check your credentials.'); }
    setLoading(false);
  }

  const inp = { width: '100%', background: '#FFFFFF', border: '1px solid #EEEEEE', borderRadius: 10, padding: '13px 16px', fontSize: 15, color: '#000000', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };

  return (
    <div style={{ background: '#FFFFFF', color: '#000000', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 360, padding: '0 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, background: '#000000', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 20 }}>C</span>
          </div>
          <h1 style={{ fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em', margin: '0 0 6px' }}>The Council</h1>
          <p style={{ fontSize: 14, color: '#757575', margin: 0 }}>Sign in to access your dashboard</p>
        </div>
        <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" required autoComplete="email" style={inp}
            onFocus={e => (e.target.style.borderColor = '#000000')}
            onBlur={e => (e.target.style.borderColor = '#EEEEEE')} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" required autoComplete="current-password" style={inp}
            onFocus={e => (e.target.style.borderColor = '#000000')}
            onBlur={e => (e.target.style.borderColor = '#EEEEEE')} />
          {error && <p style={{ ...MONO, fontSize: 12, color: '#FF3B30', margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading}
            style={{ background: loading ? '#CCCCCC' : '#000000', color: '#FFFFFF', border: 'none', borderRadius: 10, padding: '14px', fontWeight: 600, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4 }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p style={{ ...MONO, fontSize: 11, color: '#CCCCCC', textAlign: 'center', marginTop: 16 }}>Add your account in Firebase Console → Authentication → Users</p>
      </div>
    </div>
  );
}
