// Stockage local (IndexedDB) : tout est d'abord enregistré sur le téléphone,
// puis envoyé au serveur dès que le réseau est disponible.
import { openDB, type IDBPDatabase } from 'idb';
import type { Hunt, HuntMethod, Observation } from './types';

type Schema = {
  hunts: { key: string; value: Hunt; indexes: { dirty: number } };
  observations: { key: string; value: Observation; indexes: { huntId: string; dirty: number } };
  meta: { key: string; value: unknown };
};

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

export function getDb() {
  dbPromise ??= openDB<Schema>('bee', 1, {
    upgrade(db) {
      const hunts = db.createObjectStore('hunts', { keyPath: 'id' });
      hunts.createIndex('dirty', 'dirty');
      const obs = db.createObjectStore('observations', { keyPath: 'id' });
      obs.createIndex('huntId', 'huntId');
      obs.createIndex('dirty', 'dirty');
      db.createObjectStore('meta');
    },
  });
  return dbPromise;
}

export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
}

// ---------- Petit bus d'évènements pour rafraîchir l'interface ----------
type Listener = () => void;
const listeners = new Set<Listener>();
export function onDataChange(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function emitChange() {
  listeners.forEach((l) => l());
}

let afterLocalWrite: () => void = () => {};
export function setAfterLocalWrite(fn: () => void) {
  afterLocalWrite = fn;
}

// ---------- Lecture ----------
// Les recherches créées avant l'ajout du choix de méthode n'ont pas de champ `method`.
const withMethod = (h: Hunt): Hunt => ({ ...h, method: h.method === 'chrono' ? 'chrono' : 'direction' });

export async function listHunts(): Promise<Hunt[]> {
  const all = await (await getDb()).getAll('hunts');
  return all.filter((h) => !h.deleted).map(withMethod).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getHunt(id: string): Promise<Hunt | undefined> {
  const h = await (await getDb()).get('hunts', id);
  return h && !h.deleted ? withMethod(h) : undefined;
}

export async function listObservations(huntId: string): Promise<Observation[]> {
  const all = await (await getDb()).getAllFromIndex('observations', 'huntId', huntId);
  return all.filter((o) => !o.deleted).sort((a, b) => a.observedAt - b.observedAt);
}

export async function countObservationsByHunt(): Promise<Map<string, number>> {
  const all = await (await getDb()).getAll('observations');
  const m = new Map<string, number>();
  for (const o of all) if (!o.deleted) m.set(o.huntId, (m.get(o.huntId) ?? 0) + 1);
  return m;
}

// ---------- Écriture locale ----------
export async function saveHunt(h: Hunt) {
  await (await getDb()).put('hunts', { ...h, updatedAt: Date.now(), dirty: 1 });
  emitChange();
  afterLocalWrite();
}

export async function saveObservation(o: Observation) {
  const db = await getDb();
  await db.put('observations', { ...o, updatedAt: Date.now(), dirty: 1 });
  // La recherche remonte en tête de liste.
  const h = await db.get('hunts', o.huntId);
  if (h) await db.put('hunts', { ...h, updatedAt: Date.now(), dirty: 1 });
  emitChange();
  afterLocalWrite();
}

export async function deleteObservation(o: Observation) {
  await saveObservation({ ...o, deleted: true });
}

export async function createHunt(name: string, method: HuntMethod): Promise<Hunt> {
  const now = Date.now();
  const h: Hunt = { id: newId(), name: name.trim() || 'Nouvelle recherche', method, createdAt: now, updatedAt: now, deleted: false, nest: null };
  await saveHunt(h);
  return h;
}

// ---------- Préférences ----------
const AUTHOR_KEY = 'bee.author';
export function getAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY) ?? '';
  } catch {
    return '';
  }
}
export function setAuthor(name: string) {
  try {
    localStorage.setItem(AUTHOR_KEY, name);
  } catch {
    /* ignoré */
  }
}
