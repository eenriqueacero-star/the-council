import React, { useState } from 'react';
import { Radar, Loader2, AlertTriangle, Check, Eye, X } from 'lucide-react';
import { MONO, SANS } from '../constants/styles.js';
import { PROTOCOLS, WD_STYLE } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent } from '../api.js';

export default function WatchdogTab({ acct, acctHoldings, flagApiDown, wdRunning, setWdRunning }) {
  const [wd,    setWd]    = useState({});
  const [wdRan, setWdRan] = useState(false);

  const wdFlagged = Object.values(wd).filter(x => x.result?.status === 'SELL').length;
  const wdWatch   = Object.values(wd).filter(x => x.result?.status === 'WATCH').length;
  const iconMap   = { HOLD: Check, WATCH: Eye, SELL: X };

  async function scanWatchdog() {
    if (wdRunning) return;
    setWdRunning(true); setWdRan(true);
    const init = {}; acctHoldings.forEach(h => (init[h] = { status: 'running' })); setWd(init);
    const sys = `You are the SELL-PROTOCOL WATCHDOG. ${PROTOCOLS}\nCheck ONE holding against the SELL PROTOCOL: a SELL signal requires red candles forming AND a confirmed weekly downtrend (lower highs / lower lows). Otherwise HOLD. Use WATCH if weakening but not yet confirmed. Search recent weekly price action.\nRespond ONLY with JSON in a \`\`\`json block: {"status":"HOLD"|"WATCH"|"SELL","note":"<one-line weekly read>"}`;
    await Promise.all(acctHoldings.map(async h => {
      try {
        const txt = await callAgent(sys, `Holding: ${h}. Today is ${new Date().toDateString()}. Check against sell protocol. Return ONLY the JSON.`, true);
        const p   = extractJSON(txt);
        setWd(prev => ({ ...prev, [h]: { status: 'done', result: p || { status: 'WATCH', note: 'Could not parse.' } } }));
      } catch {
        flagApiDown();
        setWd(prev => ({ ...prev, [h]: { status: 'error' } }));
      }
    }));
    setWdRunning(false);
  }

  const statusColor = { HOLD: '#00C805', WATCH: '#F59E0B', SELL: '#FF3B30' };
  const statusBg    = { HOLD: 'rgba(0,200,5,0.08)', WATCH: 'rgba(245,158,11,0.08)', SELL: 'rgba(255,59,48,0.08)' };

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Radar size={15} style={{ color: '#000000' }} />
        <span style={{ ...MONO, fontSize: 11, letterSpacing: '0.08em', color: '#757575', fontWeight: 600 }}>SELL-PROTOCOL WATCHDOG · {acct.label.toUpperCase()}</span>
      </div>
      <p style={{ fontSize: 13, color: '#757575', lineHeight: 1.5, marginTop: 4, marginBottom: 16 }}>
        Scans every holding against your sell protocol — a SELL flag only fires on a confirmed weekly downtrend (lower highs/lower lows) with red candles, never on news or valuation alone.
      </p>

      <button onClick={scanWatchdog} disabled={wdRunning}
        style={{ background: wdRunning ? '#CCCCCC' : '#000000', color: '#FFFFFF', border: 'none', borderRadius: 8, padding: '11px 24px', fontWeight: 600, fontSize: 14, cursor: wdRunning ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
        {wdRunning ? <><Loader2 size={15} className="animate-spin" /> Scanning…</> : <><Radar size={15} /> Scan All {acctHoldings.length} Holdings</>}
      </button>

      {wdRan && (wdFlagged > 0 || wdWatch > 0) && !wdRunning && (
        <div style={{ marginTop: 14, background: wdFlagged ? 'rgba(255,59,48,0.06)' : 'rgba(245,158,11,0.06)', border: `1px solid ${wdFlagged ? 'rgba(255,59,48,0.25)' : 'rgba(245,158,11,0.25)'}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} style={{ color: wdFlagged ? '#FF3B30' : '#F59E0B' }} />
          <span style={{ fontSize: 13, color: '#333333' }}>
            {wdFlagged > 0 ? `${wdFlagged} holding(s) tripping the sell protocol` : `${wdWatch} holding(s) weakening — watch closely`}
            {wdFlagged > 0 && wdWatch > 0 ? `, ${wdWatch} more on watch.` : '.'}
          </span>
        </div>
      )}

      {wdRan && (
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {acctHoldings.map(h => {
            const st  = wd[h] || { status: 'idle' };
            const r   = st.result;
            const col = r ? statusColor[r.status] : '#AAAAAA';
            const Icon = r ? iconMap[r.status] : Loader2;
            return (
              <div key={h} className="fade-in"
                style={{ background: r ? statusBg[r.status] : '#F7F7F7', border: `1px solid ${r ? col+'33' : '#EEEEEE'}`, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ background: r ? col+'20' : '#F0F0F0', borderRadius: 8, padding: 8, flexShrink: 0, marginTop: 1 }}>
                  {st.status === 'running'
                    ? <Loader2 size={13} className="animate-spin" style={{ color: '#AAAAAA' }} />
                    : <Icon size={13} style={{ color: col }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ ...MONO, fontWeight: 700, fontSize: 13 }}>{h}</span>
                    {r && <span style={{ ...MONO, background: col+'15', color: col, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>{r.status}</span>}
                  </div>
                  {st.status === 'running' && <div style={{ ...MONO, fontSize: 11, color: '#AAAAAA', marginTop: 4 }}>checking weekly…</div>}
                  {st.status === 'error'   && <div style={{ ...MONO, fontSize: 11, color: '#FF3B30', marginTop: 4 }}>scan error</div>}
                  {r && <p style={{ fontSize: 12, color: '#555555', lineHeight: 1.4, marginTop: 4 }}>{r.note}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!wdRan && (
        <div style={{ marginTop: 32, textAlign: 'center', padding: '32px 20px', background: '#F7F7F7', border: '1px dashed #DDDDDD', borderRadius: 12 }}>
          <Radar size={26} style={{ color: '#CCCCCC', margin: '0 auto 10px' }} />
          <p style={{ fontSize: 14, color: '#757575' }}>Scan {acct.label}’s {acctHoldings.length} holdings against the sell protocol.</p>
        </div>
      )}
    </div>
  );
}
