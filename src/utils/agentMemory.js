import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase.js';

export async function loadAgentProfile(uid, agentId) {
  try {
    const ref = doc(db, 'users', uid, 'agentProfiles', agentId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data();
  } catch { return null; }
}

export async function loadAllAgentProfiles(uid, agentIds) {
  const results = await Promise.all(agentIds.map(id => loadAgentProfile(uid, id)));
  const out = {};
  agentIds.forEach((id, i) => { out[id] = results[i]; });
  return out;
}

export async function writeAgentLesson(uid, agentId, lesson) {
  try {
    const ref = doc(db, 'users', uid, 'agentProfiles', agentId);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? (snap.data().lessons || []) : [];
    const updated = [...existing, lesson].slice(-8); // keep last 8
    await setDoc(ref, { agentId, lessons: updated }, { merge: true });
  } catch {}
}

export async function updateAgentAccuracy(uid, agentId, wasCorrect) {
  try {
    const ref = doc(db, 'users', uid, 'agentProfiles', agentId);
    const snap = await getDoc(ref);
    const acc = snap.exists() ? (snap.data().accuracy || { correct: 0, total: 0 }) : { correct: 0, total: 0 };
    await setDoc(ref, {
      agentId,
      accuracy: { correct: acc.correct + (wasCorrect ? 1 : 0), total: acc.total + 1 }
    }, { merge: true });
  } catch {}
}

export async function refreshAgentResearch(uid, agentId, researchPrompt, callAgentFn) {
  try {
    const ref = doc(db, 'users', uid, 'agentProfiles', agentId);
    const content = await callAgentFn(
      `You are a market research analyst. ${researchPrompt} Be concise — max 4 sentences.`,
      `Current date: ${new Date().toDateString()}. Run the search and return the briefing.`,
      true, 200
    );
    await setDoc(ref, {
      agentId,
      lastResearch: { content, searchedAt: new Date().toISOString() }
    }, { merge: true });
    return content;
  } catch { return null; }
}

// Build the profile injection string for agent prompts
export function buildProfileContext(profile) {
  if (!profile) return '';
  const parts = [];
  if (profile.lastResearch?.content) {
    parts.push(`YOUR LATEST DOMAIN INTEL: ${profile.lastResearch.content}`);
  }
  if (profile.accuracy?.total > 0) {
    const rate = ((profile.accuracy.correct / profile.accuracy.total) * 100).toFixed(0);
    parts.push(`YOUR TRACK RECORD: ${profile.accuracy.correct}/${profile.accuracy.total} graded calls correct (${rate}%).`);
  }
  if (profile.lessons?.length > 0) {
    parts.push(`YOUR RECENT LESSONS:\n${profile.lessons.slice(-3).map(l => `• ${l}`).join('\n')}`);
  }
  return parts.length ? '\n\n' + parts.join('\n') : '';
}
