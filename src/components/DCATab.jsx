import React, { useState } from 'react';
import { Coins, Loader2 } from 'lucide-react';
import { MONO, SANS } from '../constants/styles.js';
import { PROTOCOLS } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent } from '../api.js';

export default function DCATab({ acct, acctHoldings, positionsLine, flagApiDown }) {
  const [dcaAmount, setDcaAmount] = useState('');
  const [dca,       setDca]       = useState({ status: 'idle', result: null });

  async function allocateDCA() {
    if (dca.status === 'running') return;
    const amt = (dcaAmount.trim() ? Number(dcaAmount) : acct.dca) || 0;
    if (!amt) { setDca({ status: 'done', result: { allocations: [], summary: 'No DCA amount set. Enter an amount above.' } }); return; }
    setDca({ status: 'running', result: null });
    const sys = `You are the DCA ALLOCATOR. ${PROTOCOLS}\nThe investor makes a recurring DCA buy into the ${acct.label} account (current positions: ${positionsLine}). Available this round: $${amt}. Search recent price action and allocate toward the 1-2 best "buy the dip" setups. Concentrate, don't spread thin. NEVER add to a name tripping the sell protocol.\nRespond ONLY with JSON in a \`\`\`json block: {"allocations":[{"ticker":"X","amount":<dollars>,"pct":<0-100>,"reason":"<one line>"}],"summary":"<2 sentences>"}`;
    try {
      const txt = await callAgent(sys, `Allocate this round's $${amt} for ${acct.label}. Today is ${new Date().toDateString()}. Return ONLY the JSON.`, true);
      const p   = extractJSON(txt);
      setDca({ status: 'done', result: p || { allocations: [], summary: 'Could not parse allocation.' } });
    } catch {
      flagApiDown();
      setDca({ status: 'error', result: null });
    }
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Coins size={15} style={{ color: '#000000' }} />
        <span style={{ ...MONO, fontSize: 11, letterSpacing: '0.08em', color: '#757575', fontWeight: 600 }}>SMART DCA ALLOCATOR · {acct.label.toUpperCase()}</span>
      </div>
      <p style={{ fontSize: 13, color: '#757575', lineHeight: 1.5, marginTop: 4, marginBottom: 16 }}>
        Instead of spreading your DCA evenly, the allocator finds the 1–2 holdings that are the best “buy the dip” right now and concentrates the dollars there.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
          <Coins size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#AAAAAA' }} />
          <input value={dcaAmount} onChange={e => setDcaAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal" placeholder={`amount this round (default $${acct.dca || '—'})`}
            style={{ width: '100%', background: '#FFFFFF', border: '1px solid #EEEEEE', borderRadius: 8, padding: '11px 12px 11px 34px', fontSize: 14, color: '#000000', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            onFocus={e => (e.target.style.borderColor = '#000000')}
            onBlur={e => (e.target.style.borderColor = '#EEEEEE')} />
        </div>
        <button onClick={allocateDCA} disabled={dca.status === 'running'}
          style={{ background: dca.status === 'running' ? '#CCCCCC' : '#000000', color: '#FFFFFF', border: 'none', borderRadius: 8, padding: '11px 24px', fontWeight: 600, fontSize: 14, cursor: dca.status === 'running' ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
          {dca.status === 'running' ? <><Loader2 size={15} className="animate-spin" /> Allocating…</> : 'Allocate'}
        </button>
      </div>

      {dca.status === 'running' && (
        <div style={{ marginTop: 16, background: '#F7F7F7', border: '1px solid #EEEEEE', borderRadius: 12, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Loader2 size={16} className="animate-spin" style={{ color: '#757575' }} />
          <span style={{ fontSize: 14, color: '#757575' }}>Scanning {acctHoldings.length} holdings for the best dip…</span>
        </div>
      )}

      {dca.status === 'done' && dca.result && (
        <div className="fade-in" style={{ marginTop: 16 }}>
          {(dca.result.allocations || []).map((al, i) => (
            <div key={i} style={{ background: '#F7F7F7', border: '1px solid #EEEEEE', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
              <div style={{ textAlign: 'center', minWidth: 64 }}>
                <div style={{ ...MONO, fontSize: 22, fontWeight: 700, color: '#000000' }}>${al.amount}</div>
                <div style={{ ...MONO, fontSize: 9, color: '#AAAAAA' }}>{al.pct}%</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{al.ticker}</div>
                <div style={{ fontSize: 12, color: '#757575', marginTop: 2, lineHeight: 1.4 }}>{al.reason}</div>
              </div>
            </div>
          ))}
          {dca.result.summary && (
            <p style={{ fontSize: 13, color: '#555555', lineHeight: 1.5, marginTop: 10, paddingLeft: 12, borderLeft: '2px solid #EEEEEE' }}>{dca.result.summary}</p>
          )}
          <p style={{ ...MONO, fontSize: 10, color: '#AAAAAA', marginTop: 10 }}>You execute the buys — this is a suggestion, not an order.</p>
        </div>
      )}

      {dca.status === 'error' && (
        <div style={{ marginTop: 16, background: '#FFF5F5', border: '1px solid #FFD0CC', borderRadius: 12, padding: '16px', fontSize: 13, color: '#FF3B30' }}>API error — check connection and retry.</div>
      )}

      {dca.status === 'idle' && (
        <div style={{ marginTop: 32, textAlign: 'center', padding: '32px 20px', background: '#F7F7F7', border: '1px dashed #DDDDDD', borderRadius: 12 }}>
          <Coins size={26} style={{ color: '#CCCCCC', margin: '0 auto 10px' }} />
          <p style={{ fontSize: 14, color: '#757575' }}>Hit Allocate to route {acct.label}’s DCA into the best dip.</p>
        </div>
      )}
    </div>
  );
}
