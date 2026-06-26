import React, { useState } from 'react';
import { Copy, Check, AlertTriangle, CheckCircle, XCircle, Clock, Key } from 'lucide-react';
import { MONO } from '../constants/styles.js';
import { AGENTS } from '../constants/agents.js';
import { theme } from '../utils/theme.js';

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

function MetaRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
      <span style={{ ...MONO, fontSize: 9, color: '#666', minWidth: 80 }}>{label}</span>
      <span style={{ ...MONO, fontSize: 10, color: color || '#C0C0C0' }}>{value}</span>
    </div>
  );
}

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
    <Card
      title={`${ag.emoji} ${ag.name} · Round ${round}`}
      accent={accent}
      copyText={fullCopyText}
    >
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

export default function DebugTab({ debugLog, dark }) {
  const T = theme(dark);

  if (!debugLog) {
    return (
      <div style={{ padding: '48px 20px', textAlign: 'center' }}>
        <div style={{ ...MONO, fontSize: 12, color: '#555' }}>No debug data yet — run the council on the Council tab first.</div>
      </div>
    );
  }

  const { ticker, ts, liveDataBlock, agents, synthesis, anyUngrounded } = debugLog;

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
    <div style={{ background: '#0a0d10', minHeight: '100%', padding: '16px 0' }}>
      {/* Header */}
      <div style={{ padding: '0 16px', marginBottom: 16 }}>
        <div style={{ ...MONO, fontSize: 10, color: '#38e0d4', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Debug Panel</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ ...MONO, fontSize: 18, fontWeight: 700, color: '#fff' }}>{ticker}</span>
          <span style={{ ...MONO, fontSize: 10, color: '#555' }}>
            {ts ? new Date(ts).toLocaleString() : ''}
          </span>
        </div>
        {anyUngrounded && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, ...MONO, fontSize: 10, color: '#B45309' }}>
            <AlertTriangle size={10} /> Some agents were ungrounded this run
          </div>
        )}
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* Live Data Block */}
        <Card
          title="LIVE DATA BLOCK"
          accent="#38e0d4"
          copyText={liveDataBlock || '(empty)'}
        >
          <Pre text={liveDataBlock || '(empty — recon failed)'} maxLines={20} />
        </Card>

        {/* Per-agent cards */}
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

        {/* Synthesis */}
        {synthesis && (
          <Card title="AXIOM SYNTHESIS" accent="#F59E0B" copyText={synthCopyText}>
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
                <span style={{ ...MONO, fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>
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
    </div>
  );
}
