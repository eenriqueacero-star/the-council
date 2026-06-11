import React, { useState } from 'react';
import { Coins, Loader2, Play } from 'lucide-react';
import { MONO, DISP, SANS, CY, ICE } from '../constants/styles.js';
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
        <Coins size={14} style={{ color: CY }} />
        <span style={{ ...MONO, letterSpacing: '0.10em', color: 'rgba(226,221,213,0.70)', fontWeight: 600 }} className="text-[11px]">SMART DCA ALLOCATOR · {acct.label.toUpperCase()}</span>
      </div>
      <p style={{ ...SANS, color: 'rgba(226,221,213,0.52)' }} className="text-[13px] leading-relaxed mt-1">Instead of spreading your DCA evenly, the allocator finds the 1–2 holdings that are the best "buy the dip" right now — most oversold but still in a weekly uptrend — and concentrates the dollars there. It skips anything tripping the sell protocol.</p>

      <div className="mt-4 flex gap-2 flex-wrap sm:flex-nowrap items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Coins size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(226,221,213,0.28)' }} />
          <input value={dcaAmount} onChange={e => setDcaAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal" placeholder={`amount this round (default $${acct.dca || '—'})`}
            style={{ ...MONO, background: 'rgba(226,221,213,0.03)', borderColor: 'rgba(255,255,255,0.08)', color: '#e2e8f0' }}
            className="w-full border rounded-lg pl-9 pr-3 py-3 text-sm outline-none transition-colors"
            onFocus={e => e.target.style.borderColor = `${CY}55`}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
        </div>
        <button onClick={allocateDCA} disabled={dca.status === 'running'}
          style={{ ...MONO, letterSpacing: '0.10em', background: dca.status === 'running' ? 'rgba(200,146,42,0.22)' : CY, color: '#0a0808', fontWeight: 600 }}
          className="glow-btn px-5 py-3 rounded-lg flex items-center justify-center gap-2 transition-all hover:brightness-110 whitespace-nowrap disabled:cursor-not-allowed text-[13px]">
          {dca.status === 'running' ? <><Loader2 size={15} className="animate-spin" /> ALLOCATING…</> : 'ALLOCATE'}
        </button>
        <button onClick={runDCADemo} disabled={dca.status === 'running'}
          style={{ ...MONO, borderColor: `${ICE}28`, color: ICE }}
          className="text-[11px] px-3 py-3 rounded-lg border transition-colors disabled:opacity-40 flex items-center gap-1.5">
          <Play size={10} /> DEMO
        </button>
      </div>

      {dca.status === 'running' && (
        <div className="mt-5 border rounded-xl p-6 flex items-center gap-3" style={{ background: '#111827', borderColor: `${CY}22`, ...MONO, color: CY }}>
          <Loader2 size={17} className="animate-spin" /><span className="text-sm">Scanning {acctHoldings.length} holdings for the best dip…</span>
        </div>
      )}
      {dca.status === 'done' && dca.result && (
        <div style={{ animation: 'cardIn .5s ease both' }} className="mt-5">
          {(dca.result.allocations || []).map((al, i) => (
            <div key={i} className="lift mb-2 border rounded-xl p-4 flex items-center gap-4" style={{ background: '#111827', borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className="text-center min-w-[64px]">
                <div style={{ ...MONO, color: CY, fontWeight: 700 }} className="text-2xl">${al.amount}</div>
                <div style={{ ...MONO, color: 'rgba(226,221,213,0.35)' }} className="text-[9px]">{al.pct}%</div>
              </div>
              <div className="flex-1">
                <div style={{ ...MONO, fontWeight: 700 }} className="text-[14px]">{al.ticker}</div>
                <div style={{ ...SANS, color: 'rgba(226,221,213,0.58)' }} className="text-[12px] leading-snug mt-0.5">{al.reason}</div>
              </div>
            </div>
          ))}
          {dca.result.summary && (
            <p className="mt-3 text-[13px] leading-relaxed pl-3" style={{ ...SANS, color: 'rgba(226,221,213,0.68)', borderLeft: `2px solid ${CY}40` }}>
              {dca.result.summary}
            </p>
          )}
          <p style={{ ...MONO, color: 'rgba(226,221,213,0.25)' }} className="mt-3 text-[10px]">You execute the buys — this is a suggestion, not an order.</p>
        </div>
      )}
      {dca.status === 'idle' && (
        <div className="mt-8 text-center py-10 border border-dashed rounded-xl" style={{ borderColor: 'rgba(226,221,213,0.08)' }}>
          <Coins size={28} className="mx-auto mb-3" style={{ color: CY, opacity: 0.22 }} />
          <p style={{ ...SANS, color: 'rgba(226,221,213,0.42)' }} className="text-sm">Hit ALLOCATE to route {acct.label}'s DCA into the best dip.</p>
        </div>
      )}
    </div>
  );
}
