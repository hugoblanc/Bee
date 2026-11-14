import { describe, it, expect } from 'vitest';
import { estimateNest, distanceFromRoundTrip } from './estimate';
import { bearingTo, destination, distance, angleDiff, circularMean } from './geo';

const nest = { lat: 45.0, lng: 3.9 };

function stationAt(bearingFromNest: number, meters: number) {
  return destination(nest, bearingFromNest, meters);
}

function obsFrom(station: { lat: number; lng: number }, noiseDeg = 0, roundTripSeconds?: number) {
  return { ...station, bearing: bearingTo(station, nest) + noiseDeg, roundTripSeconds };
}

describe('geo', () => {
  it('angleDiff wraps around', () => {
    expect(angleDiff(10, 350)).toBeCloseTo(20);
    expect(angleDiff(350, 10)).toBeCloseTo(-20);
  });
  it('circularMean handles the north wrap', () => {
    expect(Math.abs(angleDiff(circularMean([350, 10]), 0))).toBeLessThan(1e-9);
  });
});

describe('estimateNest', () => {
  it('returns null without observations', () => {
    expect(estimateNest([])).toBeNull();
  });

  it('a single direction gives a wide zone along the line', () => {
    const s = stationAt(200, 600);
    const e = estimateNest([obsFrom(s)])!;
    expect(e.confidence).toBe('faible');
    // Le point le plus probable est dans la bonne direction.
    expect(Math.abs(angleDiff(bearingTo(s, e.best), bearingTo(s, nest)))).toBeLessThan(10);
    expect(e.suggestion).not.toBeNull();
  });

  it('two crossing directions locate the nest', () => {
    const e = estimateNest([obsFrom(stationAt(180, 500)), obsFrom(stationAt(270, 450))])!;
    expect(distance(e.best, nest)).toBeLessThan(60);
  });

  it('round-trip timing narrows a single direction', () => {
    const s = stationAt(120, 400);
    // 400 m ≈ 4 min d'aller-retour avec 100 m/min
    const withTime = estimateNest([obsFrom(s, 0, 240)])!;
    const without = estimateNest([obsFrom(s)])!;
    expect(withTime.radius50).toBeLessThan(without.radius50);
    expect(distance(withTime.best, nest)).toBeLessThan(120);
  });

  it('converges with iterative, noisy observations over several days', () => {
    const obs = [
      obsFrom(stationAt(30, 900), 8),
      obsFrom(stationAt(100, 800), -10),
      obsFrom(stationAt(60, 450), 5, 290),
      obsFrom(stationAt(140, 300), -6, 200),
      obsFrom(stationAt(20, 150), 4, 110),
    ];
    const e = estimateNest(obs)!;
    expect(distance(e.best, nest)).toBeLessThan(50);
    expect(e.confidence).not.toBe('faible');
  });

  it('is robust to one wrong observation (hornet from another nest)', () => {
    const obs = [
      obsFrom(stationAt(0, 400)),
      obsFrom(stationAt(90, 400)),
      obsFrom(stationAt(220, 400)),
      { ...stationAt(300, 400), bearing: 300 }, // pointe à l'opposé du nid
    ];
    const e = estimateNest(obs)!;
    expect(distance(e.best, nest)).toBeLessThan(60);
  });

  it('distanceFromRoundTrip uses meters per minute', () => {
    expect(distanceFromRoundTrip(180)).toBe(300);
    expect(distanceFromRoundTrip(60, 150)).toBe(150);
  });
});
