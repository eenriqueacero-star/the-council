import { collection, query, where, orderBy, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase.js';

export async function loadProposals(uid, agentId) {
  try {
    const q = query(
      collection(db, 'users', uid, 'agent_proposals'),
      where('agentId', '==', agentId),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

export async function setProposalStatus(uid, proposalId, status, note = '') {
  try {
    await updateDoc(doc(db, 'users', uid, 'agent_proposals', proposalId), {
      status, reviewNote: note, reviewedAt: new Date().toISOString(), acknowledged: false,
    });
    return true;
  } catch {
    return false;
  }
}
