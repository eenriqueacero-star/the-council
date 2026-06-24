import React, { useState } from 'react';
import { Radar, Loader2, AlertTriangle, Check, Eye, X } from 'lucide-react';
import { theme } from '../utils/theme.js';
import { PROTOCOLS, WD_STYLE } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent } from '../api.js';

const MFONT = { fontFamily: "ui-monospace, 'SF Mono', monospace" };
const FONT  = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };

const ACCENT = '#38e0d4';

export default function WatchdogTab({ acct, acctHoldings, flagApiDown, wdRunning, setWdRunning, dark }) {
  const T = theme(dark);
  const [wd, setWd]       = useState({});
  const [wdRan, setWdRan] = useState(false);

  const wdFlagged = Object.values(wd).filter(x => x.result?.status === 'SELL').length;
  const wdWatch   = Object.values(wd).filter(x => x.result?.status === 'WATCH').length;
  const iconMap   = { HOLD: Check, WATCH: Eye, SELL: X };

  async function scanWatchdog() {
    if (wdRunning) return;
    setWdRunning(true); setWdRan(true);
    const init = {}; acctHoldings.forEach(h => (init[h] = { status: 'running' })); setWd(init);
    const sys = `You are the SELL-PROTOCOL WATCHDOG. ${PROTOCOLS}
Check ONE holding against the SELL PROTOCOL: a SELL signal requires red candles forming AND a confirmed weekly downtrend (lower highs / lower lows). Otherwise HOLD. Use WATCH if weakening but not yet confirmed. Search recent weekly price action.
Respond ONLY with JSON in a \`\`\`json block: {"status":"HOLD"|"WATCH"|"SELL","note":"<one-line weekly read>"}`;
    for (let i = 0; i < acctHoldings.length; i++) {
      const h = acctHoldings[i];
      let attempts = 0;
      while (attempts < 2) {
        try {
          // useSearch=false: base model is far more reliable on free Groq tier
          const { text: txt } = await callAgent(sys, `Holding: ${h}. Today is ${new Date().toDateString()}. Check it against the sell protocol. Return ONLY the JSON.`, false);
          const p = extractJSON(txt);
          setWd(prev => ({ ...prev, [h]: { status: 'done', result: p || { status: 'WATCH', note: 'Could not parse.' } } }));
          break;
        } catch (err) {
          attempts++;
          const isRateLimit = err?.message?.includes('429') || err?.message?.includes('ERR-429');
          if (isRateLimit && attempts < 2) {
            await new Promise(r => setTimeout(r, 35000)); // wait out rate limit
            continue;
          }
          flagApiDown();
          setWd(prev => ({ ...prev, [h]: { status: 'error' } }));
          break;
        }
      }
      if (i < acctHoldings.length - 1) await new Promise(r => setTimeout(r, 5000));
    }
    setWdRunning(false);
  }

  return (
    <div style={{ ...FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Radar size={16} style={{ color: ACCENT }} />
        <span style={{ ...MFONT, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: T.text }}>
          SELL-PROTOCOL WATCHDOG · {acct.label.toUpperCase()}
        </span>
      </div>
      <p style={{ fontSize: 13, color: T.text2, lineHeight: 1.55, marginBottom: 20 }}>
        Scans every holding against your sell protocol — a SELL flag only fires on a confirmed weekly downtrend (lower highs/lower lows) with red candles, never on news or valuation alone.
      </p>

      <button onClick={scanWatchdog} disabled={wdRunning}
        style={{
          ...MFONT, fontSize: 13, fontWeight: 600, letterSpacing: '0.06em',
          background: wdRunning ? T.bgHover : (dark ? '#F2F2F7' : '#000000'),
          color: wdRunning ? T.text2 : (dark ? '#000000' : '#FFFFFF'),
          border: 'none', borderRadius: 10, padding: '11px 22px',
          cursor: wdRunning ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          transition: 'all 0.15s ease',
        }}>
        {wdRunning
          ? <><Loader2 size={15} className="animate-spin" /> SCANNING…</>
          : <><Radar size={14} /> SCAN {acctHoldings.length} HOLDINGS</>}
      </button>

      {wdRan && (wdFlagged > 0 || wdWatch > 0) && !wdRunning && (
        <div style={{
          marginTop: 16, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
          background: wdFlagged ? 'rgba(255,59,48,0.07)' : 'rgba(245,158,11,0.07)',
          border: `1px solid ${wdFlagged ? 'rgba(255,59,48,0.2)' : 'rgba(245,158,11,0.2)'}`,
        }}>
          <AlertTriangle size={14} style={{ color: wdFlagged ? '#FF3B30' : '#F59E0B', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: T.text }}>
            {wdFlagged > 0 ? `${wdFlagged} holding(s) tripping the sell protocol` : `${wdWatch} holding(s) weakening — watch closely`}
            {wdFlagged > 0 && wdWatch > 0 ? `, ${wdWatch} more on watch.` : '.'}
          </span>
        </div>
      )}

      {wdRan && (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {acctHoldings.map(h => {
            const st  = wd[h] || { status: 'idle' };
            const r   = st.result;
            const sty = r && WD_STYLE[r.status];
            const Icon = sty ? iconMap[r.status] : Loader2;
            return (
              <div key={h}
                style={{
                  animation: st.status === 'done' ? 'cardIn .4s ease both' : undefined,
                  background: T.bgCard, border: `1px solid ${sty ? sty.fg + '33' : T.border}`,
                  borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                <div style={{ borderRadius: 8, padding: 7, background: sty ? sty.bg : T.bgHover, flexShrink: 0, marginTop: 1 }}>
                  {st.status === 'running'
                    ? <Loader2 size={13} className="animate-spin" style={{ color: T.text3 }} />
                    : sty ? <Icon size={13} style={{ color: sty.fg }} /> : <Loader2 size={13} style={{ color: T.text3 }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ ...MFONT, fontSize: 13, fontWeight: 700, color: T.text }}>{h}</span>
                    {sty && <span style={{ ...MFONT, fontSize: 9, fontWeight: 700, background: sty.bg, color: sty.fg, padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap', letterSpacing: '0.08em' }}>{sty.label}</span>}
                  </div>
                  {st.status === 'running' && <div style={{ fontSize: 11, color: T.text3, marginTop: 3 }}>checking weekly…</div>}
                  {st.status === 'error'   && <div style={{ fontSize: 11, color: '#FF3B30', marginTop: 3 }}>scan error</div>}
                  {r && <p style={{ fontSize: 12, color: T.text2, lineHeight: 1.4, marginTop: 4 }}>{r.note}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!wdRan && (
        <div style={{ marginTop: 32, textAlign: 'center', padding: '40px 16px', border: `1px dashed ${T.border}`, borderRadius: 12 }}>
          <Radar size={28} style={{ color: T.text3, margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, color: T.text2 }}>Scan {acct.label}'s {acctHoldings.length} holdings against the sell protocol.</p>
        </div>
      )}
    </div>
  );
}
