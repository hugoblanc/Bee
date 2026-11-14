// Stockage Postgres (Neon sur Vercel).
// `db` fournit : query(text, params) -> rows, et transaction(fn) où fn reçoit
// une fonction query. Les écritures sont sérialisées par un verrou
// consultatif : les révisions sont donc visibles dans l'ordre, et un client
// qui demande « depuis la révision N » ne rate jamais rien.

const SCHEMA = [
  `CREATE SEQUENCE IF NOT EXISTS bee_rev`,
  `CREATE TABLE IF NOT EXISTS bee_hunts (id TEXT PRIMARY KEY, rev BIGINT NOT NULL, updated_at BIGINT NOT NULL, data JSONB NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS bee_observations (id TEXT PRIMARY KEY, hunt_id TEXT NOT NULL, rev BIGINT NOT NULL, updated_at BIGINT NOT NULL, data JSONB NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS bee_hunts_rev ON bee_hunts (rev)`,
  `CREATE INDEX IF NOT EXISTS bee_observations_rev ON bee_observations (rev)`,
];

const UPSERT_HUNTS = `
  INSERT INTO bee_hunts (id, rev, updated_at, data)
  SELECT x->>'id', nextval('bee_rev'), (x->>'updatedAt')::bigint, x
  FROM jsonb_array_elements($1::jsonb) AS x
  ON CONFLICT (id) DO UPDATE SET rev = EXCLUDED.rev, updated_at = EXCLUDED.updated_at, data = EXCLUDED.data
  WHERE bee_hunts.updated_at <= EXCLUDED.updated_at`;

const UPSERT_OBS = `
  INSERT INTO bee_observations (id, hunt_id, rev, updated_at, data)
  SELECT x->>'id', x->>'huntId', nextval('bee_rev'), (x->>'updatedAt')::bigint, x
  FROM jsonb_array_elements($1::jsonb) AS x
  ON CONFLICT (id) DO UPDATE SET rev = EXCLUDED.rev, updated_at = EXCLUDED.updated_at, data = EXCLUDED.data
  WHERE bee_observations.updated_at <= EXCLUDED.updated_at`;

export function createPgStore(db) {
  let ready = null;
  const init = () =>
    (ready ??= (async () => {
      await db.transaction(async (q) => {
        await q('SELECT pg_advisory_xact_lock(7243)');
        for (const s of SCHEMA) await q(s);
      });
    })().catch((e) => {
      ready = null;
      throw e;
    }));

  return {
    async push({ hunts, observations }) {
      await init();
      if (!hunts.length && !observations.length) return;
      await db.transaction(async (q) => {
        await q('SELECT pg_advisory_xact_lock(7243)');
        if (hunts.length) await q(UPSERT_HUNTS, [JSON.stringify(hunts)]);
        if (observations.length) await q(UPSERT_OBS, [JSON.stringify(observations)]);
      });
    },
    async changesSince(since) {
      await init();
      // Une seule requête = un seul instantané cohérent. La révision renvoyée
      // est la plus grande effectivement lue : comme les écritures sont
      // sérialisées, aucune révision inférieure ne peut apparaître plus tard.
      const rows = await db.query(
        `SELECT 'h' AS kind, rev, data FROM bee_hunts WHERE rev > $1
         UNION ALL
         SELECT 'o' AS kind, rev, data FROM bee_observations WHERE rev > $1
         ORDER BY rev`,
        [since],
      );
      const parse = (x) => (typeof x.data === 'string' ? JSON.parse(x.data) : x.data);
      return {
        rev: rows.reduce((m, x) => Math.max(m, Number(x.rev)), since),
        hunts: rows.filter((x) => x.kind === 'h').map(parse),
        observations: rows.filter((x) => x.kind === 'o').map(parse),
      };
    },
  };
}
