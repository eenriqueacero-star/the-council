import React, { useState } from 'react';
import { Coins, Loader2, Play } from 'lucide-react';
import { MONO, SANS, CY, ICE } from '../constants/styles.js';
import { PROTOCOLS, DEMO_DCA } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent } from '../api.js';

const GOLD = '#c9a84c';

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
        <Coins size={14} style={{ color: GOLD }} />
        <span style={{ ...MONO, letterSpacing: '0.10em', color: 'rgba(240,240,240,0.55)', fontWeight: 600, fontSize: 11 }}>SMART DCA ALLOCATOR · {acct.label.toUpperCase()}</span>
      </div>
      <p style={{ ...SANS, color: 'rgba(240,240,240,0.45)', fontSize: 13 }} className="leading-relaxed mt-1">Instead of spreading your DCA evenly, the allocator finds the 1–2 holdings that are the best "buy the dip" right now — most oversold but still in a weekly uptrend — and concentrates the dollars there. It skips anything tripping the sell protocol.</p>

      <div className="mt-4 flex gap-2 flex-wrap sm:flex-nowrap items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Coins size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(240,240,240,0.25)' }} />
          <input value={dcaAmount} onChange={e => setDcaAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal" placeholder={`amount this round (default $${acct.dca || '—'})`}
            style={{ ...MONO, background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', color: '#f0f0f0', fontSize: 13 }}
            className="w-full border rounded-lg pl-9 pr-3 py-3 outline-none transition-colors"
            onFocus={e => e.target.style.borderColor = 'rgba(201,168,76,0.38)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
        </div>
        <button onClick={allocateDCA} disabled={dca.status === 'running'}
          style={{ ...MONO, letterSpacing: '0.10em', background: dca.status === 'running' ? 'rgba(201,168,76,0.2)' : GOLD, color: '#0a0800', fontWeight: 600, fontSize: 13 }}
          className="glow-btn px-5 py-3 rounded-lg flex items-center justify-center gap-2 transition-all hover:brightness-110 whitespace-nowrap disabled:cursor-not-allowed">
          {dca.status === 'running' ? <><Loader2 size={15} className="animate-spin" /> ALLOCATING…</> : 'ALLOCATE'}
        </button>
        <button onClick={runDCADemo} disabled={dca.status === 'running'}
          style={{ ...MONO, borderColor: `rgba(125,184,232,0.25)`, color: ICE, fontSize: 11 }}
          className="px-3 py-3 rounded-lg border transition-colors disabled:opacity-40 flex items-center gap-1.5">
          <Play size={10} /> DEMO
        </button>
      </div>

      {dca.status === 'running' && (
        <div className="mt-5 rounded-xl p-6 flex items-center gap-3"
          style={{ background: '#111111', border: `1px solid rgba(201,168,76,0.18)`, ...MONO, color: GOLD }}>
          <Loader2 size={17} className="animate-spin" /><span style={{ fontSize: 14 }}>Scanning {acctHoldings.length} holdings for the best dip…</span>
        </div>
      )}
      {dca.status === 'done' && dca.result && (
        <div style={{ animation: 'cardIn .5s ease both' }} className="mt-5">
          {(dca.result.allocations || []).map((al, i) => (
            <div key={i} className="gold-card lift mb-2 p-4 flex items-center gap-4">
              <div className="text-center min-w-[64px]">
                <div style={{ ...MONO, color: GOLD, fontWeight: 700, fontSize: 22 }}>${al.amount}</div>
                <div style={{ ...MONO, color: 'rgba(240,240,240,0.32)', fontSize: 9 }}>{al.pct}%</div>
              </div>
              <div className="flex-1">
                <div style={{ ...MONO, fontWeight: 700, fontSize: 14 }}>{al.ticker}</div>
                <div style={{ ...SANS, color: 'rgba(240,240,240,0.55)', fontSize: 12 }} className="leading-snug mt-0.5">{al.reason}</div>
              </div>
            </div>
          ))}
          {dca.result.summary && (
            <p className="mt-3 pl-3 leading-relaxed"
              style={{ ...SANS, color: 'rgba(240,240,240,0.65)', fontSize: 13, borderLeft: `2px solid rgba(201,168,76,0.35)` }}>
              {dca.result.summary}
            </p>
          )}
          <p style={{ ...MONO, color: 'rgba(240,240,240,0.22)', fontSize: 10 }} className="mt-3">You execute the buys — this is a suggestion, not an order.</p>
        </div>
      )}
      {dca.status === 'idle' && (
        <div className="mt-8 text-center py-10 rounded-xl" style={{ border: '1px dashed rgba(201,168,76,0.12)' }}>
          <Coins size={28} className="mx-auto mb-3" style={{ color: GOLD, opacity: 0.22 }} />
          <p style={{ ...SANS, color: 'rgba(240,240,240,0.38)' }} className="text-sm">Hit ALLOCATE to route {acct.label}'s DCA into the best dip.</p>
        </div>
      )}
    </div>
  );
}
