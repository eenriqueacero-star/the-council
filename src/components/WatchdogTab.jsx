import React, { useState } from 'react';
import { Radar, Loader2, AlertTriangle, Check, Eye, X, Play } from 'lucide-react';
import { MONO, DISP } from '../constants/styles.js';
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
        <Radar size={16} style={{ color: '#38e0d4' }} />
        <span style={{ ...DISP, letterSpacing: '0.04em' }} className="text-sm font-semibold">SELL-PROTOCOL WATCHDOG · {acct.label.toUpperCase()}</span>
      </div>
      <p className="text-[13px] text-white/55 leading-relaxed">Scans every holding against your sell protocol — a SELL flag only fires on a confirmed weekly downtrend (lower highs/lower lows) with red candles, never on news or valuation alone.</p>

      <div className="mt-4 flex gap-2 items-center">
        <button onClick={scanWatchdog} disabled={wdRunning}
          style={{ ...DISP, letterSpacing: '0.06em', background: wdRunning ? 'rgba(56,224,212,0.25)' : '#38e0d4', color: '#0a0a0a', animationName: wdRunning ? 'none' : undefined }}
          className="glow-btn px-5 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all hover:brightness-110 whitespace-nowrap disabled:cursor-not-allowed">
          {wdRunning ? <><Loader2 size={16} className="animate-spin" /> SCANNING…</> : <><Radar size={15} /> SCAN ALL {acctHoldings.length} HOLDINGS</>}
        </button>
        <button onClick={runWatchdogDemo} disabled={wdRunning} style={MONO}
          className="text-[11px] px-3 py-3 rounded-lg border border-[#f5c451]/40 text-[#f5c451] hover:bg-[#f5c451]/10 transition-colors disabled:opacity-40 flex items-center gap-1.5">
          <Play size={11} /> DEMO
        </button>
      </div>

      {wdRan && (wdFlagged > 0 || wdWatch > 0) && !wdRunning && (
        <div className="mt-4 rounded-lg p-3 flex items-center gap-3"
          style={{ background: wdFlagged ? 'rgba(255,93,108,0.1)' : 'rgba(245,196,81,0.1)', border: `1px solid ${wdFlagged ? 'rgba(255,93,108,0.3)' : 'rgba(245,196,81,0.3)'}` }}>
          <AlertTriangle size={16} style={{ color: wdFlagged ? '#ff5d6c' : '#f5c451' }} />
          <span className="text-[13px] text-white/80">
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
              <div key={h} style={{ animation: st.status === 'done' ? 'cardIn .4s ease both' : undefined, borderColor: sty ? `${sty.fg}40` : 'rgba(255,255,255,0.08)' }}
                className="hud lift relative bg-white/[0.025] border rounded-xl p-3.5 flex items-start gap-3">
                <div className="rounded-lg p-2 mt-0.5" style={{ background: sty ? sty.bg : 'rgba(255,255,255,0.05)' }}>
                  {st.status === 'running'
                    ? <Loader2 size={15} className="animate-spin text-white/40" />
                    : sty ? <Icon size={15} style={{ color: sty.fg }} /> : <Loader2 size={15} className="text-white/30" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span style={DISP} className="font-semibold">{h}</span>
                    {sty && <span style={{ ...MONO, background: sty.bg, color: sty.fg }} className="text-[9px] font-semibold px-2 py-0.5 rounded whitespace-nowrap">{sty.label}</span>}
                  </div>
                  {st.status === 'running' && <div style={MONO} className="text-[11px] text-white/35 mt-1">checking weekly…</div>}
                  {st.status === 'error'   && <div style={MONO} className="text-[11px] text-[#ff5d6c] mt-1">scan error</div>}
                  {r && <p className="text-[12px] text-white/60 leading-snug mt-1">{r.note}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!wdRan && (
        <div className="mt-8 text-center py-10 border border-dashed border-white/10 rounded-xl">
          <Radar size={30} className="mx-auto mb-3 opacity-30" style={{ color: '#38e0d4' }} />
          <p className="text-white/45 text-sm">Scan {acct.label}'s {acctHoldings.length} holdings against the sell protocol.</p>
        </div>
      )}
    </div>
  );
}
