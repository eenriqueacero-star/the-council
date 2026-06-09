import React, { useState } from 'react';
import { Briefcase, Check, X, Plus } from 'lucide-react';
import { MONO, DISP } from '../constants/styles.js';

export default function PositionsTab({ acct, posMap, acctHoldings, setPos, addTicker, removeTicker, positionsLine }) {
  const [newTicker, setNewTicker] = useState('');

  function handleAdd() {
    const t = newTicker.trim().toUpperCase();
    if (!t) return;
    addTicker(t);
    setNewTicker('');
  }

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-1">
        <Briefcase size={16} style={{ color: '#7ee787' }} />
        <span style={{ ...DISP, letterSpacing: '0.04em' }} className="text-sm font-semibold">POSITIONS · {acct.label.toUpperCase()}</span>
      </div>
      <p className="text-[13px] text-white/55 leading-relaxed">Enter what {acct.label} actually holds. The PM and all six agents read these live — concentration calls, sizing, and the watchdog all reflect your real book.</p>

      <div className="mt-4 space-y-2">
        <div className="hidden sm:flex items-center gap-2 px-1 text-[10px] tracking-widest" style={{ ...MONO, color: 'rgba(255,255,255,0.35)' }}>
          <span className="w-16">TICKER</span><span className="flex-1">SHARES</span><span className="flex-1">AVG COST</span><span className="w-8" />
        </div>
        {acctHoldings.map(t => {
          const p = posMap[t] || {};
          return (
            <div key={t} className="lift bg-white/[0.025] border border-white/10 rounded-xl p-2.5 flex items-center gap-2">
              <span style={DISP} className="w-16 font-semibold text-sm pl-1">{t}</span>
              <input value={p.shares || ''} onChange={e => setPos(t, 'shares', e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal" placeholder="shares" style={MONO}
                className="flex-1 min-w-0 bg-white/[0.04] border border-white/12 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#7ee787]/60 transition-colors" />
              <div className="relative flex-1 min-w-0">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 text-sm" style={MONO}>$</span>
                <input value={p.cost || ''} onChange={e => setPos(t, 'cost', e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal" placeholder="avg" style={MONO}
                  className="w-full bg-white/[0.04] border border-white/12 rounded-lg pl-6 pr-2 py-2 text-sm outline-none focus:border-[#7ee787]/60 transition-colors" />
              </div>
              <button onClick={() => removeTicker(t)} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-white/35 hover:text-[#ff5d6c] hover:bg-[#ff5d6c]/10 transition-colors">
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <Plus size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={newTicker} onChange={e => setNewTicker(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="add ticker (e.g. OKLO)" style={{ ...MONO, letterSpacing: '0.1em' }}
            className="w-full bg-white/[0.04] border border-white/15 rounded-lg pl-9 pr-3 py-2.5 text-sm uppercase outline-none focus:border-[#7ee787]/60 transition-colors" />
        </div>
        <button onClick={handleAdd} disabled={!newTicker.trim()}
          style={{ ...DISP, background: newTicker.trim() ? '#7ee787' : 'rgba(126,231,135,0.25)', color: '#06140a' }}
          className="px-4 py-2.5 rounded-lg font-semibold text-sm transition-all hover:brightness-110 disabled:cursor-not-allowed">ADD</button>
      </div>

      <div className="mt-4 rounded-xl p-3 flex items-start gap-2.5" style={{ background: 'rgba(126,231,135,0.06)', border: '1px solid rgba(126,231,135,0.2)' }}>
        <Check size={15} style={{ color: '#7ee787' }} className="mt-0.5 shrink-0" />
        <p className="text-[12px] text-white/65 leading-relaxed">The council now sees: <span className="text-white/85">{positionsLine || 'no positions yet'}</span></p>
      </div>
      <p style={MONO} className="mt-2 text-[10px] text-white/30">Positions are saved for this session. Phase D wires Firestore so they persist across devices.</p>
    </div>
  );
}
