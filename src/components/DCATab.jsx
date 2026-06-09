import React, { useState } from 'react';
import { Coins, Loader2, Play } from 'lucide-react';
import { MONO, DISP } from '../constants/styles.js';
import { PROTOCOLS, DEMO_DCA } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent } from '../api.js';

export default function DCATab({ acct, acctHoldings, positionsLine, flagApiDown }) {
  const [dcaAmount, setDcaAmount] = useState('');
  const [dca, setDca] = useState({ status: 'idle', result: null });

  async function allocateDCA() {
    if (dca.status === 'running') return;
    const amt = (dcaAmount.trim() ? Number(dcaAmount) : acct.dca) || 0;
    if (!amt) { setDca({ status: 'done', result: { allocations: [], summary: 'No DCA amount set for this account. Enter an amount above to allocate.' } }); return; }
    setDca({ status: 'running', result: null });
    const sys = `You are the DCA ALLOCATOR. ${PROTOCOLS}
The investor makes a recurring DCA buy into the ${acct.label} account (current positions: ${positionsLine}). Available this round: $${amt}. Search recent price action for these holdings and allocate the dollars toward the 1-2 best "buy the dip" setups — most oversold / closest to weekly support while still in an uptrend. Concentrate, don't spread thin. NEVER add to a name tripping the sell protocol (note it if so).
Respond ONLY with JSON in a \`\`\`json block: {"allocations":[{"ticker":"X","amount":<dollars>,"pct":<0-100>,"reason":"<one line>"}],"summary":"<2 sentences>"}`;
    try {
      const txt = await callAgent(sys, `Allocate this round's $${amt} for ${acct.label}. Today is ${new Date().toDateString()}. Return ONLY the JSON.`, true);
      const p = extractJSON(txt);
      setDca({ status: 'done', result: p || { allocations: [], summary: 'Could not parse allocation.' } });
    } catch {
      flagApiDown();
      setDca({ status: 'error', result: null });
    }
  }

  function runDCADemo() {
    setDcaAmount('60');
    setDca({ status: 'running', result: null });
    setTimeout(() => setDca({ status: 'done', result: DEMO_DCA }), 1400);
  }

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-1">
        <Coins size={16} style={{ color: '#f5c451' }} />
        <span style={{ ...DISP, letterSpacing: '0.04em' }} className="text-sm font-semibold">SMART DCA ALLOCATOR · {acct.label.toUpperCase()}</span>
      </div>
      <p className="text-[13px] text-white/55 leading-relaxed">Instead of spreading your DCA evenly, the allocator finds the 1–2 holdings that are the best "buy the dip" right now — most oversold but still in a weekly uptrend — and concentrates the dollars there. It skips anything tripping the sell protocol.</p>

      <div className="mt-4 flex gap-2 flex-wrap sm:flex-nowrap items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Coins size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={dcaAmount} onChange={e => setDcaAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal" placeholder={`amount this round (default $${acct.dca || '—'})`} style={MONO}
            className="w-full bg-white/[0.04] border border-white/15 rounded-lg pl-9 pr-3 py-3 text-sm outline-none focus:border-[#f5c451]/60 transition-colors" />
        </div>
        <button onClick={allocateDCA} disabled={dca.status === 'running'}
          style={{ ...DISP, letterSpacing: '0.06em', background: dca.status === 'running' ? 'rgba(245,196,81,0.25)' : '#f5c451', color: '#0a0a0a' }}
          className="glow-btn px-5 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all hover:brightness-110 whitespace-nowrap disabled:cursor-not-allowed">
          {dca.status === 'running' ? <><Loader2 size={16} className="animate-spin" /> ALLOCATING…</> : 'ALLOCATE'}
        </button>
        <button onClick={runDCADemo} disabled={dca.status === 'running'} style={MONO}
          className="text-[11px] px-3 py-3 rounded-lg border border-[#38e0d4]/40 text-[#38e0d4] hover:bg-[#38e0d4]/10 transition-colors disabled:opacity-40 flex items-center gap-1.5">
          <Play size={11} /> DEMO
        </button>
      </div>

      {dca.status === 'running' && (
        <div className="mt-5 bg-white/[0.025] border border-[#f5c451]/30 rounded-xl p-6 flex items-center gap-3 text-[#f5c451]" style={MONO}>
          <Loader2 size={18} className="animate-spin" /><span className="text-sm">Scanning {acctHoldings.length} holdings for the best dip…</span>
        </div>
      )}
      {dca.status === 'done' && dca.result && (
        <div style={{ animation: 'cardIn .5s ease both' }} className="mt-5">
          {(dca.result.allocations || []).map((al, i) => (
            <div key={i} className="lift mb-2 bg-white/[0.03] border border-white/10 rounded-xl p-4 flex items-center gap-4">
              <div className="text-center min-w-[64px]">
                <div style={DISP} className="text-xl font-bold text-[#f5c451]">${al.amount}</div>
                <div style={MONO} className="text-[9px] text-white/40">{al.pct}%</div>
              </div>
              <div className="flex-1">
                <div style={DISP} className="text-base font-semibold">{al.ticker}</div>
                <div className="text-[12px] text-white/60 leading-snug">{al.reason}</div>
              </div>
            </div>
          ))}
          {dca.result.summary && <p className="mt-3 text-[13px] text-white/70 leading-relaxed border-l-2 border-[#f5c451]/40 pl-3">{dca.result.summary}</p>}
          <p style={MONO} className="mt-3 text-[10px] text-white/30">You execute the buys — this is a suggestion, not an order.</p>
        </div>
      )}
      {dca.status === 'idle' && (
        <div className="mt-8 text-center py-10 border border-dashed border-white/10 rounded-xl">
          <Coins size={30} className="mx-auto mb-3 opacity-30" style={{ color: '#f5c451' }} />
          <p className="text-white/45 text-sm">Hit ALLOCATE to route {acct.label}'s DCA into the best dip.</p>
        </div>
      )}
    </div>
  );
}
