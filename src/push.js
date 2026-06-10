import { db, auth } from './firebase.js';
import { doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';

// VAPID public key — pairs with VAPID_PRIVATE_KEY in Vercel env vars (public by design)
const VAPID_PUBLIC_KEY = 'BGvxW_tilgAmowmt1MY0s2ONNBdqLBkXwS6Ft6mypzuk7NSTamlgvfIVG9MX8H9HGoD3gMmZDO5AT9T2Y--YMUQ';

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('/sw.js'); } catch { return null; }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function subKey(endpoint) {
  let h = 5381;
  for (let i = 0; i < endpoint.length; i++) h = ((h << 5) + h + endpoint.charCodeAt(i)) >>> 0;
  return 'd' + h.toString(16);
}

function subsRef() {
  const uid = auth.currentUser?.uid;
  return uid ? doc(db, 'users', uid, 'data', 'push') : null;
}

export async function getPushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? 'on' : 'off';
  } catch { return 'off'; }
}

export async function enablePush() {
  const reg = await navigator.serviceWorker.register('/sw.js');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('permission-denied');
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
  const ref = subsRef();
  if (ref) {
    await setDoc(ref, {
      subs: { [subKey(sub.endpoint)]: { sub: sub.toJSON(), ua: navigator.userAgent.slice(0, 120), updatedAt: Date.now() } },
    }, { merge: true });
  }
  return sub;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const ref = subsRef();
  if (ref) await updateDoc(ref, { [`subs.${subKey(sub.endpoint)}`]: deleteField() }).catch(() => {});
  await sub.unsubscribe();
}

export async function notifyDevices(title, body, url = '/') {
  try {
    const ref = subsRef();
    if (!ref) return;
    const snap = await getDoc(ref);
    const subs = snap.exists() ? Object.values(snap.data().subs || {}).map(s => s.sub).filter(Boolean) : [];
    if (!subs.length) return;
    const token = await auth.currentUser.getIdToken();
    const res = await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ subs, title, body, url }),
    });
    const data = await res.json().catch(() => ({}));
    if (Array.isArray(data.stale) && data.stale.length) {
      const updates = {};
      data.stale.forEach(ep => { updates[`subs.${subKey(ep)}`] = deleteField(); });
      await updateDoc(ref, updates).catch(() => {});
    }
  } catch {}
}
