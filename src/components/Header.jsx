import React from 'react';
import { LogOut } from 'lucide-react';

export default function Header({ onSignOut }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottom: '1px solid #EEEEEE', marginBottom: 4 }}>
      <div>
        <h1 style={{ fontWeight: 700, fontSize: 20, letterSpacing: '-0.02em', color: '#000000', margin: 0 }}>The Council</h1>
        <p style={{ fontSize: 12, color: '#AAAAAA', margin: '2px 0 0' }}>AI Investment Intelligence</p>
      </div>
      <button onClick={onSignOut} title="Sign out"
        style={{ color: '#AAAAAA', background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onMouseEnter={e => (e.currentTarget.style.color = '#000000')}
        onMouseLeave={e => (e.currentTarget.style.color = '#AAAAAA')}>
        <LogOut size={16} />
      </button>
    </div>
  );
}
