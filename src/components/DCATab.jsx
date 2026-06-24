import React, { useState } from 'react';
import { Coins, Loader2 } from 'lucide-react';
import { theme } from '../utils/theme.js';
import { PROTOCOLS } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent } from '../api.js';

const MFONT  = { fontFamily: "ui-monospace, 'SF Mono', monospace" };
const FONT   = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };
const ACCENT = '#f5c451';

export default function DCATab({ acct, acctHoldings, positionsLine, flagApiDown, dark }) {
  const T = theme(dark);
  const [dcaAmount, setDcaAmount] = useState('');
  const [dca, setDca] = useState({ status: 'idle', result: null });

  async function allocateDCA() {
    if (dca.status === 'running') return;
    const amt = (dcaAmount.trim() ? Number(dcaAmount) : acct.dca) || 0;
    if (!amt) { setDca({ status: 'done', result: { allocations: [], summary: 'No DCA amount set. Enter an amount above.' } }); return; }
    setDca({ status: 'running', result: null });
    const sys = `You are the DCA ALLOCATOR. ${PROTOCOLS}
The investor makes a recurring DCA buy into the ${acct.label} account (current positions: ${positionsLine}). Available this round: $${amt}. Search recent price action for these holdings and allocate the dollars toward the 1-2 best "buy the dip" setups — most oversold / closest to weekly support while still in an uptrend. Concentrate, don't spread thin. NEVER add to a name tripping the sell protocol (note it if so).
Respond ONLY with JSON in a \`\`\`json block: {"allocations":[{"ticker":"X","amount":<dollars>,"pct":<0-100>,"reason":"<one line>"}],"summary":"<2 sentences>"}`;
    try {
      const { text: txt } = await callAgent(sys, `Allocate this round's $${amt} for ${acct.label}. Today is ${new Date().toDateString()}. Return ONLY the JSON.`, true);
      const p = extractJSON(txt);
      setDca({ status: 'done', result: p || { allocations: [], summary: 'Could not parse allocation.' } });
    } catch {
      flagApiDown();
      setDca({ status: 'error', result: null });
    }
  }

  return (
    <div style={{ ...FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Coins size={16} style={{ color: ACCENT }} />
        <span style={{ ...MFONT, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: T.text }}>
          SMART DCA ALLOCATOR · {acct.label.toUpperCase()}
        </span>
      </div>
      <p style={{ fontSize: 13, color: T.text2, lineHeight: 1.55, marginBottom: 20 }}>
        Instead of spreading your DCA evenly, the allocator finds the 1–2 holdings that are the best "buy the dip" right now and concentrates the dollars there. It skips anything tripping the sell protocol.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
          <Coins size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.text3 }} />
          <input
            value={dcaAmount}
            onChange={e => setDcaAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder={`amount (default $${acct.dca || '—'})`}
            style={{
              ...MFONT, fontSize: 13,
              width: '100%', paddingLeft: 36, paddingRight: 12, paddingTop: 11, paddingBottom: 11,
              background: T.input, border: `1px solid ${T.inputBorder}`, borderRadius: 10,
              color: T.text, outline: 'none', boxSizing: 'border-box',
            }}
            onFocus={e => e.target.style.borderColor = T.inputFocus}
            onBlur={e => e.target.style.borderColor = T.inputBorder}
          />
        </div>
        <button onClick={allocateDCA} disabled={dca.status === 'running'}
          style={{
            ...MFONT, fontSize: 13, fontWeight: 600, letterSpacing: '0.06em',
            background: dca.status === 'running' ? T.bgHover : (dark ? '#F2F2F7' : '#000000'),
            color: dca.status === 'running' ? T.text2 : (dark ? '#000000' : '#FFFFFF'),
            border: 'none', borderRadius: 10, padding: '11px 22px',
            cursor: dca.status === 'running' ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
            transition: 'all 0.15s ease',
          }}>
          {dca.status === 'running' ? <><Loader2 size={15} className="animate-spin" /> ALLOCATING…</> : 'ALLOCATE'}
        </button>
      </div>

      {dca.status === 'running' && (
        <div style={{ marginTop: 20, border: `1px solid ${ACCENT}22`, borderRadius: 12, padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 10, background: T.bgCard, ...MFONT, color: ACCENT }}>
          <Loader2 size={16} className="animate-spin" />
          <span style={{ fontSize: 13 }}>Scanning {acctHoldings.length} holdings for the best dip…</span>
        </div>
      )}

      {dca.status === 'done' && dca.result && (
        <div style={{ marginTop: 20, animation: 'cardIn .5s ease both' }}>
          {(dca.result.allocations || []).map((al, i) => (
            <div key={i} style={{
              marginBottom: 8, background: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{ textAlign: 'center', minWidth: 64 }}>
                <div style={{ ...MFONT, fontSize: 20, fontWeight: 700, color: ACCENT }}>${al.amount}</div>
                <div style={{ ...MFONT, fontSize: 9, color: T.text3 }}>{al.pct}%</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{al.ticker}</div>
                <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.4, marginTop: 2 }}>{al.reason}</div>
              </div>
            </div>
          ))}
          {dca.result.summary && (
            <p style={{ fontSize: 13, color: T.text2, lineHeight: 1.55, marginTop: 12, paddingLeft: 12, borderLeft: `2px solid ${ACCENT}55` }}>
              {dca.result.summary}
            </p>
          )}
          <p style={{ ...MFONT, fontSize: 10, color: T.text3, marginTop: 12 }}>You execute the buys — this is a suggestion, not an order.</p>
        </div>
      )}

      {dca.status === 'idle' && (
        <div style={{ marginTop: 32, textAlign: 'center', padding: '40px 16px', border: `1px dashed ${T.border}`, borderRadius: 12 }}>
          <Coins size={28} style={{ color: T.text3, margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, color: T.text2 }}>Hit ALLOCATE to route {acct.label}'s DCA into the best dip.</p>
        </div>
      )}
    </div>
  );
}
