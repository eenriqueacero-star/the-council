import React, { useState, useEffect } from 'react';
import { Briefcase, Check, X, Plus, Save, CloudUpload, RefreshCw, Loader2 } from 'lucide-react';
import { MONO, DISP } from '../constants/styles.js';
import { getQuotes } from '../api.js';

const GREEN = '#7ee787';
const RED   = '#ff5d6c';
const YLW   = '#f5c451';

function fmt(n)    { return isNaN(n) || n == null ? '—' : Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtPct(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }
function fmtPnl(n) { return (n >= 0 ? '+$' : '-$') + fmt(n); }

export default function PositionsTab({ acct, posMap, acctHoldings, setPos, addTicker, removeTicker, positionsLine, onSave }) {
  const [newTicker, setNewTicker]   = useState('');
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [quotes, setQuotes]         = useState({});
  const [quotesLoading, setLoading] = useState(false);

  async function fetchQuotes() {
    const tickers = acctHoldings.filter(t => posMap[t]?.shares);
    if (!tickers.length) return;
    setLoading(true);
    try { setQuotes(await getQuotes(tickers)); } catch {}
    setLoading(false);
  }

  useEffect(() => {
    setQuotes({});
    fetchQuotes();
  }, [acct.label]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true); setSaved(false);
    try { await onSave(); } catch {}
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function handleAdd() {
    const t = newTicker.trim().toUpperCase();
    if (!t) return; addTicker(t); setNewTicker('');
  }

  const rows = acctHoldings.map(t => {
    const p      = posMap[t] || {};
    const shares = parseFloat(p.shares) || 0;
    const cost   = parseFloat(p.cost)   || 0;
    const q      = quotes[t];
    const price  = q?.price > 0 ? q.price : (q?.prevClose || 0);
    const mktVal = shares * price;
    const basis  = shares * cost;
    const pnlAmt = (price && cost) ? mktVal - basis : null;
    const pnlPct = (price && cost) ? ((price - cost) / cost) * 100 : null;
    return { ticker: t, shares, cost, price, mktVal, basis, pnlAmt, pnlPct, hasData: shares > 0 && price > 0 };
  });

  const valued   = rows.filter(r => r.hasData);
  const totalVal = valued.reduce((s, r) => s + r.mktVal, 0);
  const totalBas = valued.reduce((s, r) => s + r.basis, 0);
  const totalPnl = totalVal - totalBas;
  const totalPct = totalBas > 0 ? (totalPnl / totalBas) * 100 : null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Briefcase size={16} style={{ color: GREEN }} />
          <span style={{ ...DISP, letterSpacing: '0.04em' }} className="text-sm font-semibold">POSITIONS · {acct.label.toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchQuotes} disabled={quotesLoading}
            style={{ ...MONO, borderColor: 'rgba(255,255,255,0.12)', color: quotesLoading ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.5)' }}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] transition-colors hover:border-white/25 disabled:cursor-not-allowed">
            {quotesLoading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
            <span>QUOTES</span>
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ ...MONO, background: saved ? 'rgba(56,224,138,0.15)' : 'rgba(126,231,135,0.1)', border: `1px solid ${saved ? '#38e08a' : 'rgba(126,231,135,0.35)'}`, color: saved ? '#38e08a' : GREEN }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-all hover:brightness-110 disabled:opacity-50">
            {saved ? <Check size={12} /> : saving ? <CloudUpload size={12} className="animate-pulse" /> : <Save size={12} />}
            <span>{saved ? 'SAVED' : saving ? 'SAVING…' : 'SAVE'}</span>
          </button>
        </div>
      </div>
      <p className="text-[13px] text-white/55 leading-relaxed">Enter what {acct.label} actually holds. The PM and all six agents read these live — concentration calls, sizing, and the watchdog all reflect your real book.</p>

      {valued.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: 'TOTAL VALUE', value: `$${totalVal.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, color: 'white' },
            { label: 'TOTAL P&L',   value: fmtPnl(totalPnl), sub: totalPct !== null ? fmtPct(totalPct) : null, color: totalPnl >= 0 ? GREEN : RED },
            { label: 'HOLDINGS',    value: valued.length, color: 'white' },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={MONO} className="text-[9px] text-white/40 tracking-widest mb-1">{label}</div>
              <div style={{ ...DISP, color }} className="text-lg font-bold leading-none">{value}</div>
              {sub && <div style={{ ...MONO, color }} className="text-[10px] mt-0.5 opacity-80">{sub}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-2">
        <div className="hidden sm:grid items-center px-1 text-[10px] tracking-widest gap-2"
          style={{ ...MONO, color: 'rgba(255,255,255,0.35)', gridTemplateColumns: '4rem 1fr 1fr auto' }}>
          <span>TICKER</span><span>SHARES</span><span>AVG COST</span><span className="text-right">VALUE / P&L</span>
        </div>
        {rows.map(({ ticker: t, price, mktVal, pnlAmt, pnlPct, hasData }) => {
          const p       = posMap[t] || {};
          const bookPct = totalVal > 0 && mktVal > 0 ? (mktVal / totalVal) * 100 : 0;
          const isHeavy = bookPct > 25;
          return (
            <div key={t} className="lift bg-white/[0.025] border border-white/10 rounded-xl overflow-hidden">
              {bookPct > 0 && (
                <div className="h-0.5 w-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <div className="h-full transition-all duration-500"
                    style={{ width: `${Math.min(bookPct, 100)}%`, background: isHeavy ? YLW : GREEN }} />
                </div>
              )}
              <div className="p-2.5 flex items-center gap-2">
                <span style={DISP} className="w-16 font-semibold text-sm pl-1 shrink-0">{t}</span>
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
              {hasData && (
                <div className="px-3 pb-2.5 flex items-center gap-3 flex-wrap">
                  <span style={{ ...MONO, color: 'rgba(255,255,255,0.35)' }} className="text-[11px]">@ ${fmt(price)}</span>
                  <span style={{ ...MONO, color: 'rgba(255,255,255,0.75)' }} className="text-[11px] font-medium">${fmt(mktVal)}</span>
                  {pnlAmt !== null && (
                    <span style={{ ...MONO, color: pnlAmt >= 0 ? GREEN : RED }} className="text-[11px]">
                      {fmtPnl(pnlAmt)} ({fmtPct(pnlPct)})
                    </span>
                  )}
                  {bookPct > 0 && (
                    <span style={{ ...MONO, color: isHeavy ? YLW : 'rgba(255,255,255,0.3)' }} className="ml-auto text-[11px]">
                      {bookPct.toFixed(1)}% of book
                    </span>
                  )}
                </div>
              )}
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
          style={{ ...DISP, background: newTicker.trim() ? GREEN : 'rgba(126,231,135,0.25)', color: '#06140a' }}
          className="px-4 py-2.5 rounded-lg font-semibold text-sm transition-all hover:brightness-110 disabled:cursor-not-allowed">ADD</button>
      </div>

      <div className="mt-4 rounded-xl p-3 flex items-start gap-2.5" style={{ background: 'rgba(126,231,135,0.06)', border: '1px solid rgba(126,231,135,0.2)' }}>
        <Check size={15} style={{ color: GREEN }} className="mt-0.5 shrink-0" />
        <p className="text-[12px] text-white/65 leading-relaxed">The council now sees: <span className="text-white/85">{positionsLine || 'no positions yet'}</span></p>
      </div>
      <p style={MONO} className="mt-2 text-[10px] text-white/30">Changes auto-save locally. Hit SAVE to sync across all your devices.</p>
    </div>
  );
}
