// Centralized debug store — any component can write, DebugTab reads.
// Not React state; survives tab switches without prop drilling.

const MAX_PER_SOURCE = 50;

const store = {
  entries: [],   // { id, source, title, ts, payload }
  listeners: [],
};

let _id = 0;

export const SOURCES = ['COUNCIL', 'SCOUT', 'ALERTS', 'CHAT', 'RECON'];

export function writeDebug(source, title, payload) {
  const entry = { id: _id++, source: source.toUpperCase(), title, ts: Date.now(), payload };
  // Keep newest at top; prune per source
  store.entries.unshift(entry);
  const sourceEntries = store.entries.filter(e => e.source === entry.source);
  if (sourceEntries.length > MAX_PER_SOURCE) {
    const oldest = sourceEntries[sourceEntries.length - 1];
    store.entries = store.entries.filter(e => e.id !== oldest.id);
  }
  store.listeners.forEach(fn => fn());
}

export function clearSource(source) {
  store.entries = store.entries.filter(e => e.source !== source.toUpperCase());
  store.listeners.forEach(fn => fn());
}

export function clearAll() {
  store.entries = [];
  store.listeners.forEach(fn => fn());
}

export function getEntries(source) {
  if (!source || source === 'ALL') return store.entries;
  return store.entries.filter(e => e.source === source.toUpperCase());
}

export function subscribe(fn) {
  store.listeners.push(fn);
  return () => { store.listeners = store.listeners.filter(l => l !== fn); };
}
