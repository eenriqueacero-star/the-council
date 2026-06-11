import React, { useState } from 'react';
import { Radar, Loader2, AlertTriangle, Check, Eye, X, Play } from 'lucide-react';
import { MONO, DISP, SANS, CY, ICE } from '../constants/styles.js';
import { PROTOCOLS, WD_STYLE, DEMO_WD } from '../constants/agents.js';
import { extractJSON } from '../utils.js';
import { callAgent } from '../api.js';

export default function WatchdogTab({ acct, acctHoldings, flagApiDown, wdRunning, setWdRunning }) {
  const [wd, setWd]       = useState({});
  const [wdRan, setWdRan] = useState(false);

  const wdFlagged = Object.values(wd).filter(x => x.result?.status === 'SELL').length;
  const wdWatch   = Object.values(wd).filter(x => x.result?.status === 'WATCH').length;

  const iconMap = { HOLD: Check, WATCH: Eye, SELL: X };

  async function scanWatchdog() {
    if (wdRunning) return;
    setWdRunning(true); setWdRan(true);
    const init = {}; acctHoldings.forEach(h => (init[h] = { status: 'running' })); setWd(init);
    const sys = `You are the SELL-PROTOCOL WATCHDOG. ${PROTOCOLS}
Check ONE holding against the SELL PROTOCOL: a SELL signal requires red candles forming AND a confirmed weekly downtrend (lower highs / lower lows). Otherwise HOLD. Use WATCH if weakening but not yet confirmed. Search recent weekly price action.
Respond ONLY with JSON in a \`\`\`json block: {"status":"HOLD"|"WATCH"|"SELL","note":"<one-line weekly read>"}`;
    await Promise.all(acctHoldings.map(async h => {
      try {
        const txt = await callAgent(sys, `Holding: ${h}. Today is ${new Date().toDateString()}. Check it against the sell protocol. Return ONLY the JSON.`, true);
        const p = extractJSON(txt);
        setWd(prev => ({ ...prev, [h]: { status: 'done', result: p || { status: 'WATCH', note: 'Could not parse.' } } }));
      } catch {
        flagApiDown();
        setWd(prev => ({ ...prev, [h]: { status: 'error' } }));
      }
    }));
    setWdRunning(false);
  }

  function runWatchdogDemo() {
    setWdRan(true);
    const init = {}; acctHoldings.forEach(h => (init[h] = { status: 'running' })); setWd(init);
    DEMO_WD.filter(d => acctHoldings.includes(d.ticker)).forEach((d, i) =>
      setTimeout(() => setWd(prev => ({ ...prev, [d.ticker]: { status: 'done', result: { status: d.status, note: d.note } } })), 500 + i * 450));
  }

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-1">
        <Radar size={14} style={{ color: ICE }} />
        <span style={{ ...MONO, letterSpacing: '0.10em', color: 'rgba(226,221,213,0.70)', fontWeight: 600 }} className="text-[11px]">SELL-PROTOCOL WATCHDOG · {acct.label.toUpperCase()}</span>
      </div>
      <p style={{ ...SANS, color: 'rgba(226,221,213,0.52)' }} className="text-[13px] leading-relaxed mt-1">Scans every holding against your sell protocol — a SELL flag only fires on a confirmed weekly downtrend (lower highs/lower lows) with red candles, never on news or valuation alone.</p>

      <div className="mt-4 flex gap-2 items-center">
        <button onClick={scanWatchdog} disabled={wdRunning}
          style={{ ...MONO, letterSpacing: '0.10em', background: wdRunning ? `${ICE}33` : ICE, color: '#060c16', fontWeight: 600 }}
          className="glow-btn px-5 py-3 rounded-lg flex items-center justify-center gap-2 transition-all hover:brightness-110 whitespace-nowrap disabled:cursor-not-allowed text-[13px]">
          {wdRunning ? <><Loader2 size={15} className="animate-spin" /> SCANNING…</> : <><Radar size={14} /> SCAN ALL {acctHoldings.length} HOLDINGS</>}
        </button>
        <button onClick={runWatchdogDemo} disabled={wdRunning}
          style={{ ...MONO, borderColor: `${CY}28`, color: CY }}
          className="text-[11px] px-3 py-3 rounded-lg border transition-colors disabled:opacity-40 flex items-center gap-1.5">
          <Play size={10} /> DEMO
        </button>
      </div>

      {wdRan && (wdFlagged > 0 || wdWatch > 0) && !wdRunning && (
        <div className="mt-4 rounded-xl p-3 flex items-center gap-3"
          style={{ background: wdFlagged ? 'rgba(232,92,92,0.08)' : 'rgba(200,146,42,0.08)', border: `1px solid ${wdFlagged ? 'rgba(232,92,92,0.25)' : 'rgba(200,146,42,0.25)'}` }}>
          <AlertTriangle size={14} style={{ color: wdFlagged ? '#e85c5c' : CY }} />
          <span style={{ ...SANS, color: 'rgba(226,221,213,0.80)' }} className="text-[13px]">
            {wdFlagged > 0 ? `${wdFlagged} holding(s) tripping the sell protocol` : `${wdWatch} holding(s) weakening — watch closely`}
            {wdFlagged > 0 && wdWatch > 0 ? `, ${wdWatch} more on watch.` : '.'}
          </span>
        </div>
      )}

      {wdRan && (
        <div className="mt-4 grid sm:grid-cols-2 gap-2">
          {acctHoldings.map(h => {
            const st  = wd[h] || { status: 'idle' };
            const r   = st.result;
            const sty = r && WD_STYLE[r.status];
            const Icon = sty ? iconMap[r.status] : Loader2;
            return (
              <div key={h}
                style={{ animation: st.status === 'done' ? 'cardIn .4s ease both' : undefined, background: '#0e0f18', borderColor: sty ? `${sty.fg}33` : 'rgba(226,221,213,0.07)' }}
                className="lift border rounded-xl p-3.5 flex items-start gap-3">
                <div className="rounded-lg p-2 mt-0.5 shrink-0" style={{ background: sty ? sty.bg : 'rgba(226,221,213,0.04)' }}>
                  {st.status === 'running'
                    ? <Loader2 size={14} className="animate-spin" style={{ color: 'rgba(226,221,213,0.30)' }} />
                    : sty ? <Icon size={14} style={{ color: sty.fg }} /> : <Loader2 size={14} style={{ color: 'rgba(226,221,213,0.25)' }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span style={{ ...MONO, fontWeight: 700 }} className="text-[13px]">{h}</span>
                    {sty && <span style={{ ...MONO, background: sty.bg, color: sty.fg, letterSpacing: '0.08em' }} className="text-[9px] font-semibold px-2 py-0.5 rounded whitespace-nowrap">{sty.label}</span>}
                  </div>
                  {st.status === 'running' && <div style={{ ...MONO, color: 'rgba(226,221,213,0.28)' }} className="text-[11px] mt-1">checking weekly…</div>}
                  {st.status === 'error'   && <div style={{ ...MONO, color: '#e85c5c' }} className="text-[11px] mt-1">scan error</div>}
                  {r && <p style={{ ...SANS, color: 'rgba(226,221,213,0.60)' }} className="text-[12px] leading-snug mt-1">{r.note}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!wdRan && (
        <div className="mt-8 text-center py-10 border border-dashed rounded-xl" style={{ borderColor: 'rgba(226,221,213,0.08)' }}>
          <Radar size={28} className="mx-auto mb-3" style={{ color: ICE, opacity: 0.22 }} />
          <p style={{ ...SANS, color: 'rgba(226,221,213,0.42)' }} className="text-sm">Scan {acct.label}'s {acctHoldings.length} holdings against the sell protocol.</p>
        </div>
      )}
    </div>
  );
}
