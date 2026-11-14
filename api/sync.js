// Fonction serverless Vercel : même API que server/index.mjs, stockée dans
// Postgres (Neon). Variable attendue : DATABASE_URL (créée automatiquement
// par l'intégration Neon de Vercel).
import { Pool } from '@neondatabase/serverless';
import { createPgStore } from '../server/pg-store.mjs';
import { cleanPush } from '../server/sync-core.mjs';

let store = null;
function getStore() {
  if (store) return store;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw Object.assign(new Error('DATABASE_URL manquante : ajoutez une base Neon au projet Vercel'), { status: 503 });
  const pool = new Pool({ connectionString: url });
  store = createPgStore({
    query: async (text, params) => (await pool.query(text, params)).rows,
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await fn(async (text, params) => (await client.query(text, params)).rows);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  });
  return store;
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (req.method === 'GET') {
      const since = Number(req.query?.since ?? 0) || 0;
      return res.status(200).json(await getStore().changesSince(since));
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
      const push = cleanPush(body);
      const s = getStore();
      await s.push(push);
      const changes = await s.changesSince(push.since);
      return res.status(200).json({ accepted: push.hunts.length + push.observations.length, rejected: push.rejected, ...changes });
    }
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    const status = e.status ?? (e instanceof SyntaxError ? 400 : 500);
    if (status === 500) console.error(e);
    return res.status(status).json({ error: e.message });
  }
}
