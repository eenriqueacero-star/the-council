import { collection, query, orderBy, limit, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';

export async function loadChatMessages(uid, agentId, n = 10) {
  try {
    const q = query(
      collection(db, 'users', uid, 'agent_chats', agentId, 'messages'),
      orderBy('timestamp', 'desc'),
      limit(n),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
  } catch {
    return [];
  }
}

export async function saveChatMessage(uid, agentId, { role, content }) {
  try {
    await addDoc(collection(db, 'users', uid, 'agent_chats', agentId, 'messages'), {
      role, content, timestamp: serverTimestamp(),
    });
  } catch {}
}

/**
 * Builds the enhanced system prompt for a focused "Talk to {AGENT}" chat.
 * Grounds every answer in the agent's actual stored stances/feed/track record
 * so it can't fabricate a rationale it never held.
 */
export function buildAgentChatSystem(agent, ctx) {
  const { stances = [], feedItems = [], stats = null, globalOutlook = null, otherAgents = [], proposals = [] } = ctx;

  const stanceLines = stances.length
    ? stances.map(s => `- ${s.ticker}: ${s.stance} (${s.conviction}/10) — "${(s.reasoning || '').slice(0, 160)}"`).join('\n')
    : '(no current stances on record)';

  const feedLines = feedItems.length
    ? feedItems.slice(0, 5).map(f => `- [${f.severity}] ${f.headline}`).join('\n')
    : '(no recent feed activity)';

  const trackLine = stats
    ? `${stats.total_calls} calls tracked, ${(stats.win_rate * 100).toFixed(0)}% win rate, avg return ${stats.avg_return}%.`
    : 'No graded track record yet.';

  const outlookLine = globalOutlook
    ? `${globalOutlook.stance} (${globalOutlook.conviction}/10) — "${(globalOutlook.reasoning || '').slice(0, 160)}"`
    : 'No global outlook on record yet.';

  const otherLines = otherAgents.length
    ? otherAgents.map(o => `- ${o.name}: ${o.stance || 'no stance'} outlook`).join('\n')
    : '(no other agent context)';

  const proposalLines = proposals.length
    ? proposals.map(p => `- [${p.status}] ${p.title}`).join('\n')
    : '(no self-improvement proposals filed yet)';

  return `${agent.conversationalPrompt}

You are speaking directly to Edwin (the investor) in a 1:1 chat, grounded ONLY in your own real stored data below. Never invent a stance, reasoning, or event you don't actually hold on record — if asked about something you have no data on, say so honestly.

YOUR CURRENT STANCES:
${stanceLines}

YOUR GLOBAL MARKET OUTLOOK: ${outlookLine}

YOUR RECENT FEED ACTIVITY:
${feedLines}

YOUR TRACK RECORD: ${trackLine}

OTHER AGENTS' CURRENT OUTLOOKS (for council-memory context):
${otherLines}

YOUR SELF-IMPROVEMENT PROPOSALS:
${proposalLines}

Keep answers conversational, 2-5 sentences unless asked for detail. If asked "what would change your mind" or "what data would help you", reason concretely from your actual domain and current gaps.`;
}
