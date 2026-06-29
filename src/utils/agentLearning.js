import { collection, query, where, getDocs, updateDoc, doc, setDoc, getDoc } from 'firebase/firestore';

const RESOLUTION_DAYS = 7;

export async function resolveObservations(db, userId, getCurrentPrice) {
  const obsRef = collection(db, 'users', userId, 'agent_observations');
  const q = query(obsRef, where('resolved', '==', false));
  const snap = await getDocs(q);

  for (const obsDoc of snap.docs) {
    const obs = obsDoc.data();
    const ageMs = Date.now() - obs.timestamp.toMillis();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays < RESOLUTION_DAYS) continue;

    const currentPrice = await getCurrentPrice(obs.ticker);
    if (!currentPrice) continue;

    const returnPct = ((currentPrice - obs.price_at_call) / obs.price_at_call) * 100;

    let resolution;
    if (obs.verdict === 'BUY' || obs.verdict === 'HOLD') {
      resolution = returnPct > 1 ? 'WIN' : returnPct < -1 ? 'LOSS' : 'NEUTRAL';
    } else if (obs.verdict === 'SELL' || obs.verdict === 'SKIP') {
      resolution = returnPct < -1 ? 'WIN' : returnPct > 1 ? 'LOSS' : 'NEUTRAL';
    } else {
      resolution = 'NEUTRAL';
    }

    await updateDoc(doc(obsRef, obsDoc.id), {
      resolved: true,
      resolution,
      price_at_resolution: currentPrice,
      return_pct: +returnPct.toFixed(2),
    });

    const statsId = `${obs.agentId}_${obs.ticker}`;
    const statsRef = doc(db, 'users', userId, 'agent_stats', statsId);
    const statsSnap = await getDoc(statsRef);

    if (statsSnap.exists()) {
      const stats = statsSnap.data();
      const newTotal = stats.total_calls + 1;
      const newWins = stats.wins + (resolution === 'WIN' ? 1 : 0);
      const newLosses = stats.losses + (resolution === 'LOSS' ? 1 : 0);
      const newNeutral = stats.neutral + (resolution === 'NEUTRAL' ? 1 : 0);
      const newStreak = resolution === 'WIN'
        ? (stats.streak > 0 ? stats.streak + 1 : 1)
        : resolution === 'LOSS'
          ? (stats.streak < 0 ? stats.streak - 1 : -1)
          : 0;

      await updateDoc(statsRef, {
        total_calls: newTotal,
        wins: newWins,
        losses: newLosses,
        neutral: newNeutral,
        win_rate: +(newWins / newTotal).toFixed(3),
        avg_return: +((stats.avg_return * stats.total_calls + returnPct) / newTotal).toFixed(2),
        last_call: obs.timestamp,
        streak: newStreak,
      });
    } else {
      await setDoc(statsRef, {
        agentId: obs.agentId,
        agentName: obs.agentName,
        ticker: obs.ticker,
        total_calls: 1,
        wins: resolution === 'WIN' ? 1 : 0,
        losses: resolution === 'LOSS' ? 1 : 0,
        neutral: resolution === 'NEUTRAL' ? 1 : 0,
        win_rate: resolution === 'WIN' ? 1.0 : 0.0,
        avg_return: +returnPct.toFixed(2),
        last_call: obs.timestamp,
        streak: resolution === 'WIN' ? 1 : resolution === 'LOSS' ? -1 : 0,
      });
    }
  }
}
