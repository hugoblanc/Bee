// Serveur minimal : sert la PWA compilée (dist/) et une API de synchronisation.
// Pas de comptes : les données sont ouvertes et partagées par tous.
//
// Synchronisation : chaque enregistrement porte un `updated_at` (horloge du
// client) ; le serveur garde la version la plus récente (last-write-wins) et
// lui attribue un numéro de révision croissant `rev`. Les clients demandent
// « tout ce qui a changé depuis la révision N ».

import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 8787);
const DB_PATH = process.env.DB_PATH ?? join(ROOT, 'data', 'bee.sqlite');
const MAX_BODY = 1_000_000;

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
  INSERT OR IGNORE INTO meta (key, value) VALUES ('rev', 0);
  CREATE TABLE IF NOT EXISTS hunts (
    id TEXT PRIMARY KEY,
    rev INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,
    hunt_id TEXT NOT NULL,
    rev INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS hunts_rev ON hunts (rev);
  CREATE INDEX IF NOT EXISTS observations_rev ON observations (rev);
`);

// ---------- Validation ----------
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const time = (v) => num(v, 1_600_000_000_000, Date.now() + 86_400_000);

function cleanHunt(h) {
  if (!h || !ID_RE.test(h.id ?? '')) return null;
  const updatedAt = time(h.updatedAt);
  const createdAt = time(h.createdAt);
  if (updatedAt === null || createdAt === null) return null;
  const nestLat = num(h.nest?.lat, -90, 90);
  const nestLng = num(h.nest?.lng, -180, 180);
  return {
    id: h.id,
    name: str(h.name, 120) || 'Recherche sans nom',
    createdAt,
    updatedAt,
    deleted: h.deleted === true,
    nest:
      nestLat !== null && nestLng !== null
        ? { lat: nestLat, lng: nestLng, foundAt: time(h.nest.foundAt) ?? updatedAt, note: str(h.nest.note, 500), author: str(h.nest.author, 60) }
        : null,
  };
}

function cleanObservation(o) {
  if (!o || !ID_RE.test(o.id ?? '') || !ID_RE.test(o.huntId ?? '')) return null;
  const lat = num(o.lat, -90, 90);
  const lng = num(o.lng, -180, 180);
  const bearing = num(o.bearing, 0, 360);
  const updatedAt = time(o.updatedAt);
  const observedAt = time(o.observedAt);
  if (lat === null || lng === null || bearing === null || updatedAt === null || observedAt === null) return null;
  return {
    id: o.id,
    huntId: o.huntId,
    lat,
    lng,
    bearing,
    mapBearing: num(o.mapBearing, 0, 360),
    compassBearing: num(o.compassBearing, 0, 360),
    roundTripSeconds: num(o.roundTripSeconds, 1, 7200),
    roundTrips: Array.isArray(o.roundTrips) ? o.roundTrips.map((t) => num(t, 1, 7200)).filter((t) => t !== null).slice(0, 50) : [],
    accuracy: num(o.accuracy, 0, 100000),
    observedAt,
    updatedAt,
    author: str(o.author, 60),
    note: str(o.note, 1000),
    deleted: o.deleted === true,
  };
}

// ---------- Sync ----------
const nextRev = db.prepare(`UPDATE meta SET value = value + 1 WHERE key = 'rev' RETURNING value`);
const getHunt = db.prepare('SELECT updated_at FROM hunts WHERE id = ?');
const putHunt = db.prepare('INSERT OR REPLACE INTO hunts (id, rev, updated_at, data) VALUES (?, ?, ?, ?)');
const getObs = db.prepare('SELECT updated_at FROM observations WHERE id = ?');
const putObs = db.prepare('INSERT OR REPLACE INTO observations (id, hunt_id, rev, updated_at, data) VALUES (?, ?, ?, ?, ?)');
const huntsSince = db.prepare('SELECT data FROM hunts WHERE rev > ? ORDER BY rev');
const obsSince = db.prepare('SELECT data FROM observations WHERE rev > ? ORDER BY rev');
const currentRev = db.prepare(`SELECT value FROM meta WHERE key = 'rev'`);

function applyPush(body) {
  let accepted = 0;
  let rejected = 0;
  db.exec('BEGIN');
  try {
    for (const raw of (Array.isArray(body.hunts) ? body.hunts : []).slice(0, 500)) {
      const h = cleanHunt(raw);
      if (!h) { rejected++; continue; }
      const existing = getHunt.get(h.id);
      if (existing && existing.updated_at > h.updatedAt) continue; // version serveur plus récente
      putHunt.run(h.id, nextRev.get().value, h.updatedAt, JSON.stringify(h));
      accepted++;
    }
    for (const raw of (Array.isArray(body.observations) ? body.observations : []).slice(0, 2000)) {
      const o = cleanObservation(raw);
      if (!o) { rejected++; continue; }
      const existing = getObs.get(o.id);
      if (existing && existing.updated_at > o.updatedAt) continue;
      putObs.run(o.id, o.huntId, nextRev.get().value, o.updatedAt, JSON.stringify(o));
      accepted++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { accepted, rejected };
}

function changesSince(since) {
  const rev = currentRev.get().value;
  return {
    rev,
    hunts: huntsSince.all(since).map((r) => JSON.parse(r.data)),
    observations: obsSince.all(since).map((r) => JSON.parse(r.data)),
  };
}

// ---------- HTTP ----------
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

async function serveStatic(req, res, pathname) {
  let rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  if (rel.includes('..')) rel = '';
  let file = join(DIST, rel || 'index.html');
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
  } catch {
    file = join(DIST, 'index.html'); // routage côté client
  }
  try {
    const data = await readFile(file);
    const ext = extname(file);
    const immutable = rel.startsWith('assets/');
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Build manquant : lancez `npm run build`.');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (url.pathname === '/api/sync') {
      if (req.method === 'GET') {
        const since = Number(url.searchParams.get('since') ?? 0) || 0;
        return sendJson(res, 200, changesSince(since));
      }
      if (req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}');
        const result = applyPush(body);
        const since = Number(body.since ?? 0) || 0;
        return sendJson(res, 200, { ...result, ...changesSince(since) });
      }
      return sendJson(res, 405, { error: 'method not allowed' });
    }
    if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true, rev: currentRev.get().value });
    if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'not found' });
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    const status = e.status ?? (e instanceof SyntaxError ? 400 : 500);
    if (status === 500) console.error(e);
    return sendJson(res, status, { error: e.message });
  }
});

server.listen(PORT, () => console.log(`Bee : http://localhost:${PORT} (base ${DB_PATH})`));
