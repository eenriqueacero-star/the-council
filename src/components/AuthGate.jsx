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
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: '#070a0c', color: '#e8eef0', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-[0.4]" style={{ backgroundImage: 'linear-gradient(rgba(56,224,138,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(56,224,138,0.04) 1px, transparent 1px)', backgroundSize: '44px 44px', animation: 'gridmove 8s linear infinite' }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% -10%, rgba(245,196,81,0.10), transparent 55%)' }} />
      <div className="crtline" />

      <div className="relative w-full max-w-sm px-5">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4"><ArcReactor size={56} /></div>
          <div style={{ ...DISP, color: CY, letterSpacing: '0.08em' }} className="text-2xl font-bold neon">THE COUNCIL</div>
          <div style={{ ...MONO, color: CY }} className="text-[11px] opacity-60 tracking-[0.2em] mt-1">AUTHENTICATION REQUIRED</div>
        </div>
        <form onSubmit={login} className="space-y-3">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email" required autoComplete="email" style={MONO}
            className="w-full bg-white/[0.04] border border-white/15 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#3fe0ff]/60 transition-colors" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="password" required autoComplete="current-password" style={MONO}
            className="w-full bg-white/[0.04] border border-white/15 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#3fe0ff]/60 transition-colors" />
          {error && <p style={{ ...MONO, color: '#ff5d6c' }} className="text-[12px]">{error}</p>}
          <button type="submit" disabled={loading}
            style={{ ...DISP, background: loading ? 'rgba(63,224,255,0.25)' : CY, color: '#04121a', letterSpacing: '0.06em' }}
            className="glow-btn w-full py-3 rounded-xl font-semibold transition-all disabled:cursor-not-allowed">
            {loading ? 'AUTHENTICATING…' : 'ACCESS COUNCIL'}
          </button>
        </form>
        <p style={MONO} className="mt-4 text-[10px] text-white/25 text-center">Add your account in Firebase Console → Authentication → Users</p>
      </div>
    </div>
  );
}
