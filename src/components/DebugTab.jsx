import React, { useState, useEffect, useCallback } from 'react';
import { Copy, Check, AlertTriangle, CheckCircle, XCircle, Clock, Key, Trash2 } from 'lucide-react';
import { MONO } from '../constants/styles.js';
import { AGENTS } from '../constants/agents.js';
import { theme } from '../utils/theme.js';
import { getEntries, subscribe, clearSource, clearAll, SOURCES } from '../utils/debugStore.js';

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button onClick={copy} style={{
      ...MONO, fontSize: 10, display: 'flex', alignItems: 'center', gap: 4,
      background: copied ? 'rgba(0,200,5,0.12)' : 'rgba(255,255,255,0.06)',
      color: copied ? '#00C805' : '#888',
      border: `1px solid ${copied ? 'rgba(0,200,5,0.3)' : 'rgba(255,255,255,0.1)'}`,
      borderRadius: 5, padding: '3px 8px', cursor: 'pointer', flexShrink: 0,
    }}>
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function Card({ title, accent = '#38e0d4', children, copyText }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid rgba(255,255,255,0.09)`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 10, marginBottom: 12, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <span style={{ ...MONO, fontSize: 10, color: accent, fontWeight: 700, letterSpacing: '0.08em' }}>{title}</span>
        {copyText && <CopyButton text={copyText} />}
      </div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  );
}

function Pre({ text, maxLines = 12 }) {
  const [expanded, setExpanded] = useState(false);
  const lines = (text || '').split('\n');
  const truncated = !expanded && lines.length > maxLines;
  const shown = truncated ? lines.slice(0, maxLines).join('\n') : text;
  return (
    <div>
      <pre style={{
        ...MONO, fontSize: 10, color: '#C0C0C0', lineHeight: 1.6, margin: 0,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '8px 10px',
        overflow: 'hidden',
      }}>{shown}</pre>
      {truncated && (
        <button onClick={() => setExpanded(true)} style={{
          ...MONO, fontSize: 9, color: '#38e0d4', background: 'none', border: 'none',
          cursor: 'pointer', padding: '4px 0', display: 'block',
        }}>
          + {lines.length - maxLines} more lines — expand
        </button>
      )}
    </div>
  );
}

// ─── Source accent colors ─────────────────────────────────────────────────────

const SOURCE_ACCENT = {
  COUNCIL: '#F59E0B',
  SCOUT:   '#38e0d4',
  ALERTS:  '#FF3B30',
  CHAT:    '#b083ff',
  RECON:   '#6366f1',
  ALL:     '#888',
};

// ─── Council-specific card ────────────────────────────────────────────────────

function AgentRoundCard({ ag, round, data }) {
  const accent = ag.accent || '#38e0d4';
  const parseOk = data.parseOk;
  const fullCopyText = [
    `=== ${ag.name} — Round ${round} ===`,
    `Parse: ${parseOk ? '✅' : '❌'}  Stance: ${data.parsed?.stance || '—'}  Score: ${data.parsed?.score ?? '—'}  Time: ${data.ms ?? '?'}ms  Key index: ${data.keyIndex ?? '?'}`,
    data.warning ? `Warning: ${data.warning}` : '',
    '',
    '--- PROMPT ---',
    data.prompt || '',
    '',
    '--- RAW RESPONSE ---',
    data.rawResponse || '',
  ].filter(l => l !== undefined).join('\n');

  return (
    <Card title={`${ag.name} · Round ${round}`} accent={accent} copyText={fullCopyText}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{
          ...MONO, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
          background: parseOk ? 'rgba(0,200,5,0.12)' : 'rgba(255,59,48,0.12)',
          color: parseOk ? '#00C805' : '#FF3B30',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          {parseOk ? <CheckCircle size={9} /> : <XCircle size={9} />}
          {parseOk ? 'Parse OK' : 'Parse FAIL'}
        </span>
        {data.parsed?.stance && (
          <span style={{ ...MONO, fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#ddd' }}>
            {data.parsed.stance} · {data.parsed.score ?? '?'}/10
          </span>
        )}
        {data.ms != null && (
          <span style={{ ...MONO, fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#aaa', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={8} /> {data.ms}ms
          </span>
        )}
        {data.keyIndex != null && (
          <span style={{ ...MONO, fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#aaa', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Key size={8} /> key[{data.keyIndex}]
          </span>
        )}
        {data.grounded === false && (
          <span style={{ ...MONO, fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: '#B45309', display: 'flex', alignItems: 'center', gap: 3 }}>
            <AlertTriangle size={8} /> ungrounded
          </span>
        )}
      </div>
      {data.warning && (
        <div style={{ ...MONO, fontSize: 9, color: '#B45309', marginBottom: 8, padding: '4px 8px', background: 'rgba(245,158,11,0.08)', borderRadius: 5 }}>
          ⚠ {data.warning}
        </div>
      )}
      <div style={{ ...MONO, fontSize: 9, color: '#666', marginBottom: 4, letterSpacing: '0.05em' }}>PROMPT</div>
      <Pre text={data.prompt} maxLines={8} />
      <div style={{ ...MONO, fontSize: 9, color: '#666', marginTop: 10, marginBottom: 4, letterSpacing: '0.05em' }}>RAW RESPONSE</div>
      <Pre text={data.rawResponse} maxLines={10} />
      {data.parsed && (
        <>
          <div style={{ ...MONO, fontSize: 9, color: '#666', marginTop: 10, marginBottom: 4, letterSpacing: '0.05em' }}>PARSED</div>
          <Pre text={JSON.stringify(data.parsed, null, 2)} maxLines={8} />
        </>
      )}
    </Card>
  );
}

// ─── Per-entry renderers ──────────────────────────────────────────────────────

function CouncilEntryCard({ entry }) {
  const d = entry.payload;
  const accent = SOURCE_ACCENT.COUNCIL;
  const { ticker, ts, liveDataBlock, reconRawResponse, agents, synthesis, anyUngrounded } = d;

  const synthCopyText = [
    '=== AXIOM SYNTHESIS ===',
    `Parse: ${synthesis?.parseOk ? '✅' : '❌'}  Time: ${synthesis?.ms ?? '?'}ms`,
    synthesis?.warning ? `Warning: ${synthesis.warning}` : '',
    '',
    '--- SYSTEM PROMPT ---',
    synthesis?.systemPrompt || '',
    '',
    '--- USER PROMPT ---',
    synthesis?.userPrompt || '',
    '',
    '--- RAW RESPONSE ---',
    synthesis?.rawResponse || '',
  ].filter(l => l !== undefined).join('\n');

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ padding: '0 0 8px 0', display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ ...MONO, fontSize: 15, fontWeight: 700, color: '#fff' }}>{ticker}</span>
        <span style={{ ...MONO, fontSize: 9, color: '#555' }}>{ts ? new Date(ts).toLocaleString() : ''}</span>
        {anyUngrounded && (
          <span style={{ ...MONO, fontSize: 9, color: '#B45309', display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={9} /> ungrounded agents
          </span>
        )}
      </div>
      <Card title="RECON · RAW FINNHUB RESPONSE (news + earnings)" accent="#6366f1" copyText={reconRawResponse || '(none)'}>
        <div style={{ ...MONO, fontSize: 9, color: '#555', marginBottom: 6 }}>rawNews: Finnhub company-news (last 5 days) · rawEarnings: Finnhub earnings calendar (next 90 days)</div>
        <Pre text={reconRawResponse || '(no recon response captured)'} maxLines={15} />
      </Card>
      <Card title="LIVE DATA BLOCK (assembled)" accent="#38e0d4" copyText={liveDataBlock || '(empty)'}>
        <div style={{ ...MONO, fontSize: 9, color: '#555', marginBottom: 6 }}>Final block injected into all agent prompts</div>
        <Pre text={liveDataBlock || '(empty — recon failed)'} maxLines={20} />
      </Card>
      {AGENTS.map(ag => {
        const agData = agents?.[ag.id];
        if (!agData) return null;
        return (
          <div key={ag.id}>
            {[1, 2, 3].map(round => {
              const rd = agData[`r${round}`];
              if (!rd) return null;
              return <AgentRoundCard key={round} ag={ag} round={round} data={rd} />;
            })}
          </div>
        );
      })}
      {synthesis && (
        <Card title="AXIOM SYNTHESIS" accent={accent} copyText={synthCopyText}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{
              ...MONO, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
              background: synthesis.parseOk ? 'rgba(0,200,5,0.12)' : 'rgba(255,59,48,0.12)',
              color: synthesis.parseOk ? '#00C805' : '#FF3B30',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {synthesis.parseOk ? <CheckCircle size={9} /> : <XCircle size={9} />}
              {synthesis.parseOk ? 'Parse OK' : 'Parse FAIL'}
            </span>
            {synthesis.ms != null && (
              <span style={{ ...MONO, fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#aaa', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Clock size={8} /> {synthesis.ms}ms
              </span>
            )}
            {synthesis.verdict && (
              <span style={{ ...MONO, fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: accent }}>
                {synthesis.verdict} · {synthesis.conviction}/10
              </span>
            )}
          </div>
          {synthesis.warning && (
            <div style={{ ...MONO, fontSize: 9, color: '#B45309', marginBottom: 8, padding: '4px 8px', background: 'rgba(245,158,11,0.08)', borderRadius: 5 }}>
              ⚠ {synthesis.warning}
            </div>
          )}
          <div style={{ ...MONO, fontSize: 9, color: '#666', marginBottom: 4, letterSpacing: '0.05em' }}>SYSTEM PROMPT</div>
          <Pre text={synthesis.systemPrompt} maxLines={6} />
          <div style={{ ...MONO, fontSize: 9, color: '#666', marginTop: 10, marginBottom: 4, letterSpacing: '0.05em' }}>USER PROMPT</div>
          <Pre text={synthesis.userPrompt} maxLines={8} />
          <div style={{ ...MONO, fontSize: 9, color: '#666', marginTop: 10, marginBottom: 4, letterSpacing: '0.05em' }}>RAW RESPONSE</div>
          <Pre text={synthesis.rawResponse} maxLines={10} />
          {synthesis.parsed && (
            <>
              <div style={{ ...MONO, fontSize: 9, color: '#666', marginTop: 10, marginBottom: 4, letterSpacing: '0.05em' }}>PARSED</div>
              <Pre text={JSON.stringify(synthesis.parsed, null, 2)} maxLines={8} />
            </>
          )}
        </Card>
      )}
    </div>
  );
}

function ScoutEntryCard({ entry }) {
  const d = entry.payload;
  const accent = SOURCE_ACCENT.SCOUT;
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ ...MONO, fontSize: 9, color: '#555', marginBottom: 8 }}>{new Date(entry.ts).toLocaleString()}</div>
      {d.tickers && Object.entries(d.tickers).map(([ticker, data]) => (
        <Card key={ticker} title={`SCOUT · ${ticker}`} accent={accent} copyText={JSON.stringify(data, null, 2)}>
          <div style={{ ...MONO, fontSize: 9, color: '#666', marginBottom: 4 }}>LIVE DATA BLOCK</div>
          <Pre text={data.liveDataBlock || '(none)'} maxLines={10} />
          {data.agents && Object.entries(data.agents).map(([id, ag]) => (
            <div key={id} style={{ marginTop: 8 }}>
              <div style={{ ...MONO, fontSize: 9, color: '#888', marginBottom: 3 }}>{id.toUpperCase()} · {ag.ms}ms · key[{ag.keyIndex}]</div>
              <Pre text={`Raw: ${ag.rawResponse || ag.error || '(none)'}\nParsed: ${JSON.stringify(ag.parsed)}`} maxLines={5} />
            </div>
          ))}
          {data.synthesis && (
            <>
              <div style={{ ...MONO, fontSize: 9, color: '#666', marginTop: 10, marginBottom: 4 }}>AXIOM SYNTHESIS</div>
              <Pre text={`Raw: ${data.synthesis.rawResponse || data.synthesis.error || '(none)'}\nParsed: ${JSON.stringify(data.synthesis.parsed)}`} maxLines={8} />
            </>
          )}
        </Card>
      ))}
    </div>
  );
}

function GenericEntryCard({ entry }) {
  const accent = SOURCE_ACCENT[entry.source] || '#888';
  const copyText = typeof entry.payload === 'string' ? entry.payload : JSON.stringify(entry.payload, null, 2);
  return (
    <Card title={entry.title} accent={accent} copyText={copyText}>
      <div style={{ ...MONO, fontSize: 9, color: '#555', marginBottom: 6 }}>{new Date(entry.ts).toLocaleString()}</div>
      <Pre text={copyText} maxLines={20} />
    </Card>
  );
}

function EntryCard({ entry }) {
  if (entry.source === 'COUNCIL') return <CouncilEntryCard entry={entry} />;
  if (entry.source === 'SCOUT')   return <ScoutEntryCard entry={entry} />;
  return <GenericEntryCard entry={entry} />;
}

// ─── Section tabs ─────────────────────────────────────────────────────────────

const TABS = ['ALL', ...SOURCES];

// ─── Main DebugTab ────────────────────────────────────────────────────────────

export default function DebugTab({ dark }) {
  const [activeTab, setActiveTab] = useState('ALL');
  const [, forceUpdate] = useState(0);

  useEffect(() => subscribe(() => forceUpdate(n => n + 1)), []);

  const entries = getEntries(activeTab);

  function handleClear() {
    if (activeTab === 'ALL') clearAll();
    else clearSource(activeTab);
  }

  const accent = SOURCE_ACCENT[activeTab] || '#38e0d4';

  return (
    <div style={{ background: '#0a0d10', minHeight: '100%', padding: '16px 0' }}>
      {/* Header */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <div style={{ ...MONO, fontSize: 10, color: '#38e0d4', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Debug Panel</div>
        <div style={{ ...MONO, fontSize: 9, color: '#444' }}>?debug=1 · {entries.length} entries</div>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px', marginBottom: 16, overflowX: 'auto' }}>
        {TABS.map(tab => {
          const isActive = tab === activeTab;
          const a = SOURCE_ACCENT[tab] || '#888';
          const count = getEntries(tab).length;
          return (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              ...MONO, fontSize: 9, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
              border: `1px solid ${isActive ? a : 'rgba(255,255,255,0.08)'}`,
              background: isActive ? `${a}18` : 'transparent',
              color: isActive ? a : '#555',
              cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              letterSpacing: '0.06em',
            }}>
              {tab}{count > 0 ? ` (${count})` : ''}
            </button>
          );
        })}

        <button onClick={handleClear} style={{
          ...MONO, fontSize: 9, padding: '4px 10px', borderRadius: 6,
          border: '1px solid rgba(255,59,48,0.3)',
          background: 'transparent', color: '#FF3B30',
          cursor: 'pointer', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          <Trash2 size={9} /> Clear {activeTab === 'ALL' ? 'All' : activeTab}
        </button>
      </div>

      {/* Entries */}
      <div style={{ padding: '0 16px' }}>
        {entries.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <div style={{ ...MONO, fontSize: 11, color: '#444' }}>No {activeTab === 'ALL' ? '' : activeTab + ' '}debug data yet.</div>
            <div style={{ ...MONO, fontSize: 9, color: '#333', marginTop: 6 }}>
              {activeTab === 'COUNCIL' && 'Run the council on the Council tab.'}
              {activeTab === 'SCOUT'   && 'Run a scout scan on the Scout tab.'}
              {activeTab === 'ALERTS'  && 'Enable Portfolio Alerts in Settings.'}
              {activeTab === 'CHAT'    && 'Send a message in the Chat tab.'}
              {activeTab === 'RECON'   && 'Any agent call will log recon data here.'}
              {activeTab === 'ALL'     && 'Interact with any feature to see debug output.'}
            </div>
          </div>
        ) : (
          entries.map(entry => (
            <div key={entry.id}>
              {activeTab === 'ALL' && (
                <div style={{ ...MONO, fontSize: 9, color: SOURCE_ACCENT[entry.source] || '#888', letterSpacing: '0.1em', marginBottom: 4, marginTop: 4 }}>
                  ▸ {entry.source}
                </div>
              )}
              <EntryCard entry={entry} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
