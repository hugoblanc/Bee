import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
// @ts-expect-error module JS sans types
import { createPgStore } from './pg-store.mjs';
// @ts-expect-error module JS sans types
import { cleanPush } from './sync-core.mjs';

function pgliteStore() {
  const pg = new PGlite();
  return createPgStore({
    query: async (text: string, params?: unknown[]) => (await pg.query(text, params)).rows,
    transaction: (fn: (q: (t: string, p?: unknown[]) => Promise<unknown[]>) => Promise<void>) =>
      pg.transaction(async (tx) => fn(async (t, p) => (await tx.query(t, p)).rows)),
  });
}

const now = Date.now();
const hunt = (id: string, updatedAt: number, name = 'Test') => ({ id, name, createdAt: now - 1000, updatedAt, deleted: false, nest: null });
const obs = (id: string, huntId: string, updatedAt: number, bearing = 45) => ({
  id, huntId, lat: 45, lng: 3.9, bearing, mapBearing: bearing, compassBearing: null, roundTripSeconds: null, roundTrips: [],
  accuracy: 5, observedAt: now - 500, updatedAt, author: '', note: '', deleted: false,
});

describe('pg store', () => {
  it('stores, versions and returns changes since a revision', async () => {
    const s = pgliteStore();
    await s.push(cleanPush({ hunts: [hunt('hunt000001', now)], observations: [obs('obs0000001', 'hunt000001', now)] }));
    const all = await s.changesSince(0);
    expect(all.hunts).toHaveLength(1);
    expect(all.observations).toHaveLength(1);
    expect(all.rev).toBeGreaterThan(0);

    // Rien de nouveau depuis la dernière révision.
    expect((await s.changesSince(all.rev)).hunts).toHaveLength(0);

    // Mise à jour plus récente : acceptée et renvoyée.
    await s.push(cleanPush({ observations: [obs('obs0000001', 'hunt000001', now + 10, 90)] }));
    const next = await s.changesSince(all.rev);
    expect(next.observations).toHaveLength(1);
    expect(next.observations[0].bearing).toBe(90);

    // Mise à jour plus ancienne : ignorée (la dernière écriture gagne).
    await s.push(cleanPush({ observations: [obs('obs0000001', 'hunt000001', now - 100, 10)] }));
    const after = await s.changesSince(next.rev);
    expect(after.observations).toHaveLength(0);
    const final = await s.changesSince(0);
    expect(final.observations[0].bearing).toBe(90);
  });

  it('rejects invalid records and dedupes a batch', async () => {
    const s = pgliteStore();
    const push = cleanPush({ hunts: [{ id: 'x' }, hunt('hunt000002', now, 'a'), hunt('hunt000002', now + 5, 'b')] });
    expect(push.rejected).toBe(1);
    await s.push(push);
    const all = await s.changesSince(0);
    expect(all.hunts).toHaveLength(1);
    expect(all.hunts[0].name).toBe('b');
  });
});
