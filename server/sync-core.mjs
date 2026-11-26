// Logique de synchronisation commune au serveur Node (SQLite) et à la
// fonction Vercel (Postgres) : validation des données reçues.

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const time = (v) => num(v, 1_600_000_000_000, Date.now() + 86_400_000);

export function cleanHunt(h) {
  if (!h || !ID_RE.test(h.id ?? '')) return null;
  const updatedAt = time(h.updatedAt);
  const createdAt = time(h.createdAt);
  if (updatedAt === null || createdAt === null) return null;
  const nestLat = num(h.nest?.lat, -90, 90);
  const nestLng = num(h.nest?.lng, -180, 180);
  return {
    id: h.id,
    name: str(h.name, 120) || 'Recherche sans nom',
    method: h.method === 'chrono' ? 'chrono' : 'direction',
    createdAt,
    updatedAt,
    deleted: h.deleted === true,
    nest:
      nestLat !== null && nestLng !== null
        ? { lat: nestLat, lng: nestLng, foundAt: time(h.nest.foundAt) ?? updatedAt, note: str(h.nest.note, 500), author: str(h.nest.author, 60) }
        : null,
  };
}

export function cleanObservation(o) {
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

/** Valide un envoi et ne garde, par identifiant, que la version la plus récente. */
export function cleanPush(body) {
  let rejected = 0;
  const dedupe = (list, clean, max) => {
    const m = new Map();
    for (const raw of (Array.isArray(list) ? list : []).slice(0, max)) {
      const r = clean(raw);
      if (!r) {
        rejected++;
        continue;
      }
      const prev = m.get(r.id);
      if (!prev || prev.updatedAt <= r.updatedAt) m.set(r.id, r);
    }
    return [...m.values()];
  };
  const hunts = dedupe(body?.hunts, cleanHunt, 500);
  const observations = dedupe(body?.observations, cleanObservation, 2000);
  return { hunts, observations, rejected, since: Number(body?.since ?? 0) || 0 };
}
