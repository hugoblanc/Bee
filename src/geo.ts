// Outils géométriques : projection locale en mètres, caps, distances.
// À l'échelle d'une recherche de nid (quelques km), une projection
// équirectangulaire autour d'un point de référence est largement suffisante.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface XY {
  x: number; // mètres vers l'est
  y: number; // mètres vers le nord
}

const R = 6371008.8; // rayon terrestre moyen (m)
const DEG = Math.PI / 180;

export function toRad(d: number): number {
  return d * DEG;
}

export function toDeg(r: number): number {
  return r / DEG;
}

/** Normalise un angle en degrés dans [0, 360). */
export function normDeg(d: number): number {
  return ((d % 360) + 360) % 360;
}

/** Différence angulaire signée a - b dans [-180, 180). */
export function angleDiff(a: number, b: number): number {
  return normDeg(a - b + 180) - 180;
}

/** Moyenne circulaire de caps (degrés), éventuellement pondérée. */
export function circularMean(angles: number[], weights?: number[]): number {
  let s = 0;
  let c = 0;
  angles.forEach((a, i) => {
    const w = weights ? weights[i] : 1;
    s += w * Math.sin(toRad(a));
    c += w * Math.cos(toRad(a));
  });
  return normDeg(toDeg(Math.atan2(s, c)));
}

export function makeProjection(ref: LatLng) {
  const cosLat = Math.cos(toRad(ref.lat));
  return {
    toXY(p: LatLng): XY {
      return {
        x: toRad(p.lng - ref.lng) * R * cosLat,
        y: toRad(p.lat - ref.lat) * R,
      };
    },
    toLatLng(p: XY): LatLng {
      return {
        lat: ref.lat + toDeg(p.y / R),
        lng: ref.lng + toDeg(p.x / (R * cosLat)),
      };
    },
  };
}

/** Cap (0 = nord, 90 = est) de a vers b, en degrés. */
export function bearingTo(a: LatLng, b: LatLng): number {
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dl = toRad(b.lng - a.lng);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return normDeg(toDeg(Math.atan2(y, x)));
}

/** Distance en mètres (haversine). */
export function distance(a: LatLng, b: LatLng): number {
  const dp = toRad(b.lat - a.lat);
  const dl = toRad(b.lng - a.lng);
  const h =
    Math.sin(dp / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point atteint en partant de `from` avec un cap et une distance (m). */
export function destination(from: LatLng, bearingDeg: number, meters: number): LatLng {
  const d = meters / R;
  const b = toRad(bearingDeg);
  const p1 = toRad(from.lat);
  const l1 = toRad(from.lng);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 =
    l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: toDeg(p2), lng: toDeg(l2) };
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 5) * 5} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
export function cardinal(deg: number): string {
  return CARDINALS[Math.round(normDeg(deg) / 22.5) % 16];
}
