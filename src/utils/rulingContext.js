import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase.js';

const AGENT_SHORT = { technical: 'Tech', catalyst: 'Cat', risk: 'Risk', macro: 'Mac', bear: 'Bear', sizer: 'Siz' };

export async function loadTickerHistory(uid, ticker, currentPrice) {
  try {
    const q = query(
      collection(db, 'users', uid, 'rulings'),
      where('ticker', '==', ticker),
      orderBy('ts', 'desc')
    );
    const snap = await getDocs(q);
    if (snap.empty) return '';

    const docs = snap.docs.map(d => d.data());
    const recent = docs.slice(0, 5);
    const older  = docs.slice(5);

    const lines = recent.map(r => {
      const daysAgo = r.ts?.toDate ? Math.round((Date.now() - r.ts.toDate().getTime()) / 86400000) : null;
      const when    = daysAgo != null ? (daysAgo === 0 ? 'today' : `${daysAgo}d ago`) : (r.date || '');
      let movePct = '';
      if (r.priceAtCall && currentPrice) {
        const p = ((currentPrice - r.priceAtCall) / r.priceAtCall * 100).toFixed(1);
        movePct = ` Move: ${p >= 0 ? '+' : ''}${p}%.`;
      }
      const outcome = r.outcome ? ` [${r.outcome}]` : (r.priceAtCall && !r.outcome ? ' [open]' : '');
      const agLine  = r.agentStances
        ? Object.entries(r.agentStances)
            .map(([id, s]) => `${AGENT_SHORT[id] || id}: ${s.stance || '?'}`)
            .join(' · ')
        : '';
      return `• ${when} → ${r.verdict || '?'} (${r.conviction ?? '?'}/10) @ $${r.priceAtCall?.toFixed(2) ?? '?'}.${movePct}${outcome}${agLine ? `\n  ${agLine}` : ''}`;
    });

    let olderLine = '';
    if (older.length > 0) {
      const buys = older.filter(r => r.verdict === 'BUY').length;
      const watches = older.filter(r => r.verdict === 'WATCH').length;
      const graded = older.filter(r => r.priceAtCall && r.priceAt30d);
      const avg = graded.length
        ? (graded.reduce((s, r) => s + (r.priceAt30d - r.priceAtCall) / r.priceAtCall * 100, 0) / graded.length).toFixed(1)
        : null;
      olderLine = `\n${older.length} earlier call${older.length > 1 ? 's' : ''}: ${buys} BUY, ${watches} WATCH.${avg != null ? ` Avg 30d return: ${Number(avg) >= 0 ? '+' : ''}${avg}%.` : ''}`;
    }

    return `\nCOUNCIL HISTORY ON ${ticker} (${docs.length} prior call${docs.length > 1 ? 's' : ''}):\n${lines.join('\n')}${olderLine}\nReference this history to calibrate confidence — do not anchor to prior stance.`;
  } catch {
    return '';
  }
}
