import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase.js';
import { MONO, DISP, CY } from '../constants/styles.js';
import ArcReactor from './ArcReactor.jsx';

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

  return (
    <div style={{ fontFamily: "'JetBrains Mono', monospace", background: '#080910', color: '#e2ddd5', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% -8%, rgba(200,146,42,0.07), transparent 52%)' }} />

      <div className="relative w-full max-w-sm px-5">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5"><ArcReactor size={52} /></div>
          <div style={{ ...DISP, color: CY, letterSpacing: '0.24em', fontWeight: 700 }} className="text-xl neon">THE COUNCIL</div>
          <div style={{ ...MONO, color: 'rgba(226,221,213,0.35)', letterSpacing: '0.18em' }} className="text-[10px] mt-2">AUTHENTICATION REQUIRED</div>
        </div>
        <form onSubmit={login} className="space-y-3">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="email" required autoComplete="email"
            style={{ ...MONO, background: 'rgba(226,221,213,0.03)', borderColor: 'rgba(226,221,213,0.10)', color: '#e2ddd5' }}
            className="w-full border rounded-xl px-4 py-3 text-sm outline-none transition-colors"
            onFocus={e => e.target.style.borderColor = `${CY}55`}
            onBlur={e => e.target.style.borderColor = 'rgba(226,221,213,0.10)'} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="password" required autoComplete="current-password"
            style={{ ...MONO, background: 'rgba(226,221,213,0.03)', borderColor: 'rgba(226,221,213,0.10)', color: '#e2ddd5' }}
            className="w-full border rounded-xl px-4 py-3 text-sm outline-none transition-colors"
            onFocus={e => e.target.style.borderColor = `${CY}55`}
            onBlur={e => e.target.style.borderColor = 'rgba(226,221,213,0.10)'} />
          {error && <p style={{ ...MONO, color: '#e85c5c' }} className="text-[12px]">{error}</p>}
          <button type="submit" disabled={loading}
            style={{ ...MONO, background: loading ? 'rgba(200,146,42,0.22)' : CY, color: '#0a0808', letterSpacing: '0.10em', fontWeight: 600 }}
            className="glow-btn w-full py-3 rounded-xl transition-all disabled:cursor-not-allowed text-[13px]">
            {loading ? 'AUTHENTICATING…' : 'ACCESS COUNCIL'}
          </button>
        </form>
        <p style={{ ...MONO, color: 'rgba(226,221,213,0.22)' }} className="mt-4 text-[10px] text-center">Add your account in Firebase Console → Authentication → Users</p>
      </div>
    </div>
  );
}
