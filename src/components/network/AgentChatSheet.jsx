import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Loader2 } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { AGENTS, AXIOM_AVATAR, AXIOM_CONVERSATIONAL, AGENT_LONG_ID, AGENT_SHORT_ID } from '../../constants/agents.js';
import { MONO, DISP } from '../../constants/styles.js';
import { theme } from '../../utils/theme.js';
import { callAgent } from '../../api.js';
import { loadChatMessages, saveChatMessage, buildAgentChatSystem } from '../../utils/agentChat.js';
import { loadProposals } from '../../utils/agentProposals.js';

// agentId here is always the SHORT cron id (rex/nova/sage/atlas/vega/zen) — the network's
// canonical agent identity. AGENTS[].id is the separate LONG id used by agent_stats.
export default function AgentChatSheet({ agentId, uid, dark, onClose }) {
  const T = theme(dark);
  const agent = AGENTS.find(a => a.id === AGENT_LONG_ID[agentId]) || null;
  const name = agent?.name || 'AXIOM';
  const color = agent?.color || '#F59E0B';
  const avatar = agent?.avatar || AXIOM_AVATAR;

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const systemRef = useRef('');
  const scrollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      const [history, memorySnap, feedSnap, statsSnap, proposals] = await Promise.all([
        loadChatMessages(uid, agentId, 10),
        getDocs(collection(db, 'users', uid, 'agent_memory')).catch(() => null),
        getDocs(collection(db, 'users', uid, 'agent_feed')).catch(() => null),
        getDocs(collection(db, 'users', uid, 'agent_stats')).catch(() => null),
        loadProposals(uid, agentId),
      ]);
      if (cancelled) return;

      const memoryDocs = {};
      memorySnap?.docs.forEach(d => { memoryDocs[d.id] = { id: d.id, ...d.data() }; });

      const stances = Object.entries(memoryDocs)
        .filter(([k, v]) => k.startsWith(`${agentId}__`) && v.ticker !== '_GLOBAL')
        .map(([, v]) => v);
      const globalOutlook = memoryDocs[`${agentId}___GLOBAL`] || null;

      const otherAgents = AGENTS.filter(a => AGENT_SHORT_ID[a.id] !== agentId).map(a => ({
        name: a.name, stance: memoryDocs[`${AGENT_SHORT_ID[a.id]}___GLOBAL`]?.stance || null,
      }));

      let feedItems = [];
      feedSnap?.docs.forEach(d => {
        const data = d.data();
        if (data.agentId === agentId) feedItems.push(data);
      });
      feedItems.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

      let totalCalls = 0, totalWins = 0, weightedReturn = 0;
      const longId = AGENT_LONG_ID[agentId];
      statsSnap?.docs.forEach(d => {
        const s = d.data();
        if (s.agentId !== longId) return;
        totalCalls += s.total_calls || 0;
        totalWins += s.wins || 0;
        weightedReturn += (s.avg_return || 0) * (s.total_calls || 0);
      });
      const stats = totalCalls > 0 ? {
        total_calls: totalCalls, win_rate: totalWins / totalCalls, avg_return: +(weightedReturn / totalCalls).toFixed(2),
      } : null;

      const baseAgent = agent || { conversationalPrompt: AXIOM_CONVERSATIONAL };
      systemRef.current = buildAgentChatSystem(baseAgent, { stances, feedItems, stats, globalOutlook, otherAgents, proposals });
      setMessages(history);
      setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [agentId, uid]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    saveChatMessage(uid, agentId, userMsg);

    try {
      const history = messages.slice(-8).map(m => `${m.role === 'user' ? 'Edwin' : name}: ${m.content}`).join('\n');
      const userContent = `${history ? history + '\n' : ''}Edwin: ${text}\n\nRespond as ${name}, in character, grounded in your real data above.`;
      const { text: reply } = await callAgent(systemRef.current, userContent, false, 400);
      const assistantMsg = { role: 'assistant', content: reply || "Couldn't form a response — try again." };
      setMessages(prev => [...prev, assistantMsg]);
      saveChatMessage(uid, agentId, assistantMsg);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <motion.div
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      style={{
        position: 'fixed', inset: 0, top: '15%', zIndex: 10001,
        background: dark ? '#0F0F12' : '#FFFFFF',
        borderRadius: '20px 20px 0 0',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border }} />
      </div>
      <div style={{ padding: '6px 18px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src={avatar} alt={name} style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'cover' }} />
        <div style={{ flex: 1 }}>
          <div style={{ ...DISP, fontSize: 14, fontWeight: 600, color }}>{name}</div>
          <div style={{ ...MONO, fontSize: 9, color: T.text3 }}>{loading ? 'loading context…' : 'grounded in real stored data'}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <X size={18} style={{ color: T.text3 }} />
        </button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && !loading && (
          <p style={{ ...MONO, fontSize: 11, color: T.text3, textAlign: 'center', marginTop: 20 }}>Ask {name} anything about their stances, reasoning, or track record.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '82%', background: m.role === 'user' ? T.accent + '22' : `${color}14`,
            border: `1px solid ${m.role === 'user' ? T.accent + '40' : color + '30'}`,
            borderRadius: 12, padding: '9px 13px',
          }}>
            <p style={{ fontSize: 13, color: T.text, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.content}</p>
          </div>
        ))}
        {sending && (
          <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, ...MONO, fontSize: 11, color: T.text3 }}>
            <Loader2 size={12} className="animate-spin" /> {name} is thinking…
          </div>
        )}
      </div>

      <div style={{ padding: '10px 14px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 8, paddingBottom: 'calc(14px + env(safe-area-inset-bottom, 0px))' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder={`Message ${name}…`}
          disabled={loading}
          style={{ ...MONO, flex: 1, background: T.input, border: `1px solid ${T.inputBorder}`, color: T.text, borderRadius: 10, outline: 'none', padding: '10px 14px', fontSize: 13 }}
        />
        <button onClick={send} disabled={sending || loading || !input.trim()}
          style={{ background: color, border: 'none', borderRadius: 10, width: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sending || !input.trim() ? 'not-allowed' : 'pointer', opacity: sending || !input.trim() ? 0.5 : 1 }}>
          <Send size={16} color="#000" />
        </button>
      </div>
    </motion.div>
  );
}
