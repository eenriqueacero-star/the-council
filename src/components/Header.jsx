import React from 'react';
import { LogOut } from 'lucide-react';

export default function Header({ onSignOut }) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-white md:pl-[240px]"
      style={{ height: 52, borderBottom: '1px solid #EEEEEE', paddingLeft: 16, paddingRight: 16 }}
    >
      <span style={{ fontSize: 14, fontWeight: 700, color: '#000000', letterSpacing: '0.02em' }}>THE COUNCIL</span>
      <button
        onClick={onSignOut}
        title="Sign out"
        className="flex items-center justify-center rounded-full transition-colors hover:bg-gray-100"
        style={{ width: 36, height: 36, color: '#757575' }}
      >
        <LogOut size={16} />
      </button>
    </header>
  );
}
