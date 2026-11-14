// Synchronisation avec le serveur : envoi des modifications locales puis
// récupération de tout ce qui a changé depuis la dernière révision connue.
import { getDb, emitChange, setAfterLocalWrite } from './db';
import type { Hunt, Observation } from './types';

export type SyncState = { online: boolean; syncing: boolean; pending: number; lastSync: number | null; error: string | null };

let state: SyncState = { online: navigator.onLine, syncing: false, pending: 0, lastSync: null, error: null };
const listeners = new Set<(s: SyncState) => void>();
export function onSyncState(l: (s: SyncState) => void) {
  listeners.add(l);
  l(state);
  return () => listeners.delete(l);
}
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

async function countPending() {
  const db = await getDb();
  return (await db.countFromIndex('hunts', 'dirty', 1)) + (await db.countFromIndex('observations', 'dirty', 1));
}

const strip = <T extends { dirty?: 0 | 1 }>(r: T): T => {
  const { dirty: _d, ...rest } = r;
  return rest as T;
};

let running: Promise<void> | null = null;
let again = false;

export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = doSync().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

async function doSync() {
  const db = await getDb();
  setState({ pending: await countPending() });
  if (!navigator.onLine) {
    setState({ online: false });
    return;
  }
  setState({ syncing: true, error: null });
  try {
    const dirtyHunts = await db.getAllFromIndex('hunts', 'dirty', 1);
    const dirtyObs = await db.getAllFromIndex('observations', 'dirty', 1);
    const since = ((await db.get('meta', 'rev')) as number | undefined) ?? 0;

    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ since, hunts: dirtyHunts.map(strip), observations: dirtyObs.map(strip) }),
    });
    if (!res.ok) throw new Error(`Serveur : ${res.status}`);
    const data = (await res.json()) as { rev: number; hunts: Hunt[]; observations: Observation[] };

    const tx = db.transaction(['hunts', 'observations', 'meta'], 'readwrite');
    const hs = tx.objectStore('hunts');
    const os = tx.objectStore('observations');
    // Les envois réussis ne sont plus « à envoyer », sauf s'ils ont été modifiés entre-temps.
    for (const h of dirtyHunts) {
      const cur = await hs.get(h.id);
      if (cur && cur.updatedAt === h.updatedAt) await hs.put({ ...cur, dirty: 0 });
    }
    for (const o of dirtyObs) {
      const cur = await os.get(o.id);
      if (cur && cur.updatedAt === o.updatedAt) await os.put({ ...cur, dirty: 0 });
    }
    // Fusion des données distantes (la version la plus récente gagne).
    for (const h of data.hunts) {
      const cur = await hs.get(h.id);
      if (!cur || !(cur.dirty && cur.updatedAt > h.updatedAt)) await hs.put({ ...h, dirty: 0 });
    }
    for (const o of data.observations) {
      const cur = await os.get(o.id);
      if (!cur || !(cur.dirty && cur.updatedAt > o.updatedAt)) await os.put({ ...o, dirty: 0 });
    }
    await tx.objectStore('meta').put(data.rev, 'rev');
    await tx.done;

    setState({ online: true, syncing: false, lastSync: Date.now(), pending: await countPending() });
    if (data.hunts.length || data.observations.length || dirtyHunts.length || dirtyObs.length) emitChange();
  } catch (e) {
    setState({ syncing: false, error: e instanceof Error ? e.message : String(e), pending: await countPending() });
  }
}

export function startSync() {
  setAfterLocalWrite(() => void syncNow());
  window.addEventListener('online', () => {
    setState({ online: true });
    void syncNow();
  });
  window.addEventListener('offline', () => setState({ online: false }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 30_000);
  void syncNow();
}
