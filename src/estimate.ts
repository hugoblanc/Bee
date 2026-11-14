// Estimation probabiliste de la position du nid.
//
// Chaque observation (position du pot + cap de départ du frelon, et
// éventuellement la durée d'un aller-retour) définit une vraisemblance
// sur la position du nid. On évalue le produit de ces vraisemblances sur
// une grille autour des pots : on obtient une carte de probabilité dont on
// tire le point le plus probable et la taille de la zone de recherche.
//
// - Direction : loi de von Mises autour du cap mesuré (écart-type ~15°).
// - Aller-retour : distance ≈ durée × vitesse empirique (m/min), avec une
//   incertitude log-normale large (le frelon reste un temps variable au nid).
// - Robustesse : chaque observation a une probabilité d'être fausse (frelon
//   d'un autre nid, erreur de saisie) ; elle ne peut donc jamais « tuer »
//   à elle seule l'estimation.
// - A priori faible : le nid est rarement à plus de ~1 km des pots.

import { makeProjection, type LatLng, type XY, distance, bearingTo, angleDiff, toRad, toDeg } from './geo';

export interface ObservationInput {
  lat: number;
  lng: number;
  /** Cap de départ du frelon, degrés depuis le nord géographique. */
  bearing: number;
  /** Écart-type de la mesure de cap (degrés). */
  sigmaDeg?: number;
  /** Durée médiane d'un aller-retour du frelon marqué (secondes). */
  roundTripSeconds?: number | null;
}

export interface EstimateParams {
  bearingSigmaDeg: number;
  /** Mètres de distance au nid par minute d'aller-retour (à calibrer localement). */
  metersPerMinute: number;
  /** Écart-type de log(distance) quand on a un chrono. */
  distanceSigmaLog: number;
  /** Probabilité qu'une observation soit aberrante. */
  outlierProb: number;
  /** Distance max considérée autour d'un pot (m). */
  maxRangeM: number;
  /** Échelle de l'a priori de distance au pot le plus proche (m). */
  priorScaleM: number;
  /** Nombre de cellules sur le plus grand côté de la grille. */
  gridSize: number;
}

export const DEFAULT_PARAMS: EstimateParams = {
  bearingSigmaDeg: 15,
  metersPerMinute: 100,
  distanceSigmaLog: 0.45,
  outlierProb: 0.1,
  maxRangeM: 2500,
  priorScaleM: 1200,
  gridSize: 180,
};

export interface ProbabilityGrid {
  /** Coin nord-ouest et sud-est de la grille. */
  north: number;
  south: number;
  west: number;
  east: number;
  cols: number;
  rows: number;
  /** Probabilités normalisées, ligne 0 = nord. */
  values: Float32Array;
  max: number;
}

export type Confidence = 'faible' | 'moyenne' | 'bonne';

export interface Estimate {
  best: LatLng;
  mean: LatLng;
  /** Rayon du disque de même aire que la zone à 50 % / 90 % de probabilité. */
  radius50: number;
  radius90: number;
  confidence: Confidence;
  grid: ProbabilityGrid;
  /** Emplacement conseillé pour le prochain pot (null si la zone est déjà petite). */
  suggestion: LatLng | null;
  observationCount: number;
}

/** Distance estimée au nid à partir d'une durée d'aller-retour. */
export function distanceFromRoundTrip(seconds: number, metersPerMinute = DEFAULT_PARAMS.metersPerMinute): number {
  return (seconds / 60) * metersPerMinute;
}

/** I0(k)·e^-k (fonction de Bessel modifiée, version mise à l'échelle). */
function besselI0Scaled(k: number): number {
  const n = 400;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const t = (Math.PI * i) / n;
    const w = i === 0 || i === n ? 0.5 : 1;
    s += w * Math.exp(k * (Math.cos(t) - 1));
  }
  return s / n;
}

export function estimateNest(
  observations: ObservationInput[],
  params: Partial<EstimateParams> = {},
): Estimate | null {
  const p = { ...DEFAULT_PARAMS, ...params };
  const obs = observations.filter((o) => Number.isFinite(o.lat) && Number.isFinite(o.lng) && Number.isFinite(o.bearing));
  if (obs.length === 0) return null;

  const ref = { lat: obs.reduce((a, o) => a + o.lat, 0) / obs.length, lng: obs.reduce((a, o) => a + o.lng, 0) / obs.length };
  const proj = makeProjection(ref);

  interface Prepared {
    s: XY;
    bearingRad: number;
    kappa: number;
    vmNorm: number; // 1 / (2π I0e(k))
    logD: number | null;
  }
  const kappaCache = new Map<number, number>();
  const prepared: Prepared[] = obs.map((o) => {
    const sigma = Math.max(3, o.sigmaDeg ?? p.bearingSigmaDeg);
    const kappa = 1 / toRad(sigma) ** 2;
    let i0 = kappaCache.get(kappa);
    if (i0 === undefined) {
      i0 = besselI0Scaled(kappa);
      kappaCache.set(kappa, i0);
    }
    const d = o.roundTripSeconds && o.roundTripSeconds > 0 ? distanceFromRoundTrip(o.roundTripSeconds, p.metersPerMinute) : null;
    return {
      s: proj.toXY(o),
      bearingRad: toRad(o.bearing),
      kappa,
      vmNorm: 1 / (2 * Math.PI * i0),
      logD: d ? Math.log(Math.max(d, 10)) : null,
    };
  });

  // Étendue de la grille : chaque pot ± sa portée plausible.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const o of prepared) {
    const range = o.logD !== null ? Math.min(p.maxRangeM, Math.exp(o.logD) * 3 + 100) : p.maxRangeM;
    minX = Math.min(minX, o.s.x - range);
    maxX = Math.max(maxX, o.s.x + range);
    minY = Math.min(minY, o.s.y - range);
    maxY = Math.max(maxY, o.s.y + range);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  const cell = span / p.gridSize;
  const cols = Math.max(1, Math.round((maxX - minX) / cell));
  const rows = Math.max(1, Math.round((maxY - minY) / cell));

  const eps = p.outlierProb;
  const uniformAngle = 1 / (2 * Math.PI);
  const uniformLogD = 1 / 4; // uniforme sur ~4 unités de log-distance
  const dNorm = 1 / (p.distanceSigmaLog * Math.sqrt(2 * Math.PI));

  const logL = new Float64Array(cols * rows);
  let maxLog = -Infinity;
  for (let r = 0; r < rows; r++) {
    const y = maxY - (r + 0.5) * cell;
    for (let c = 0; c < cols; c++) {
      const x = minX + (c + 0.5) * cell;
      let ll = 0;
      let dMin = Infinity;
      for (const o of prepared) {
        const dx = x - o.s.x;
        const dy = y - o.s.y;
        const d = Math.hypot(dx, dy);
        dMin = Math.min(dMin, d);
        // Densité de l'angle observé si le nid est dans cette cellule.
        let pa: number;
        if (d < cell * 0.5) pa = uniformAngle;
        else {
          const theta = Math.atan2(dx, dy); // cap : 0 = nord, sens horaire
          pa = o.vmNorm * Math.exp(o.kappa * (Math.cos(theta - o.bearingRad) - 1));
        }
        let pd = 1;
        let ud = 1;
        if (o.logD !== null) {
          const z = (Math.log(Math.max(d, 5)) - o.logD) / p.distanceSigmaLog;
          pd = dNorm * Math.exp(-0.5 * z * z);
          ud = uniformLogD;
        }
        ll += Math.log((1 - eps) * pa * pd + eps * uniformAngle * ud);
      }
      ll += -0.5 * (dMin / p.priorScaleM) ** 2;
      logL[r * cols + c] = ll;
      if (ll > maxLog) maxLog = ll;
    }
  }

  // Normalisation.
  const values = new Float32Array(cols * rows);
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    const v = Math.exp(logL[i] - maxLog);
    values[i] = v;
    total += v;
  }
  let bestIdx = 0;
  let max = 0;
  let mx = 0, my = 0;
  for (let i = 0; i < values.length; i++) {
    values[i] /= total;
    if (values[i] > max) {
      max = values[i];
      bestIdx = i;
    }
    const r = Math.floor(i / cols);
    const c = i % cols;
    mx += values[i] * (minX + (c + 0.5) * cell);
    my += values[i] * (maxY - (r + 0.5) * cell);
  }

  // Zones de plus haute densité.
  const sorted = Array.from(values).sort((a, b) => b - a);
  let acc = 0;
  let n50 = 0, n90 = 0;
  for (let i = 0; i < sorted.length; i++) {
    acc += sorted[i];
    if (n50 === 0 && acc >= 0.5) n50 = i + 1;
    if (acc >= 0.9) {
      n90 = i + 1;
      break;
    }
  }
  if (n90 === 0) n90 = sorted.length;
  const radius50 = Math.sqrt((n50 * cell * cell) / Math.PI);
  const radius90 = Math.sqrt((n90 * cell * cell) / Math.PI);

  const bestXY = { x: minX + ((bestIdx % cols) + 0.5) * cell, y: maxY - (Math.floor(bestIdx / cols) + 0.5) * cell };
  const best = proj.toLatLng(bestXY);
  const mean = proj.toLatLng({ x: mx, y: my });
  const nw = proj.toLatLng({ x: minX, y: maxY });
  const se = proj.toLatLng({ x: minX + cols * cell, y: maxY - rows * cell });

  const confidence: Confidence = radius50 < 60 ? 'bonne' : radius50 < 250 ? 'moyenne' : 'faible';

  return {
    best,
    mean,
    radius50,
    radius90,
    confidence,
    grid: { north: nw.lat, west: nw.lng, south: se.lat, east: se.lng, cols, rows, values, max },
    suggestion: confidence === 'bonne' ? null : suggestNextBait(obs, best),
    observationCount: obs.length,
  };
}

/**
 * Propose l'emplacement du prochain pot : on avance vers la zone estimée
 * depuis le dernier pot, en se décalant latéralement pour que la nouvelle
 * direction croise les précédentes avec un bon angle.
 */
export function suggestNextBait(obs: ObservationInput[], best: LatLng): LatLng | null {
  const last = obs[obs.length - 1];
  const D = distance(last, best);
  if (D < 30) return null;
  const proj = makeProjection(last);
  const b = proj.toXY(best);
  const ux = b.x / D;
  const uy = b.y / D;
  const along = 0.5;
  const side = 0.35;
  const candidates = [1, -1].map((sgn) =>
    proj.toLatLng({ x: b.x * along + sgn * -uy * D * side, y: b.y * along + sgn * ux * D * side }),
  );
  // On garde le côté dont la future direction est la plus différente des caps déjà mesurés.
  const score = (c: LatLng) => {
    const newBearing = bearingTo(c, best);
    return Math.min(
      ...obs.map((o) => {
        const d = Math.abs(angleDiff(newBearing, o.bearing)) % 180;
        return Math.min(d, 180 - d);
      }),
    );
  };
  return score(candidates[0]) >= score(candidates[1]) ? candidates[0] : candidates[1];
}

/** Pour les tests et l'affichage : cap en degrés entre deux points en mètres. */
export function bearingXY(from: XY, to: XY): number {
  return (toDeg(Math.atan2(to.x - from.x, to.y - from.y)) + 360) % 360;
}
