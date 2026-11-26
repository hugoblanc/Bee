import { describe, it, expect } from 'vitest';
import { headingFromOrientation } from './heading';
import { angleDiff } from './geo';

const close = (a: number, b: number) => expect(Math.abs(angleDiff(a, b))).toBeLessThan(0.5);

describe('headingFromOrientation', () => {
  it('flat phone, top pointing north', () => {
    const h = headingFromOrientation(0, 0, 0);
    expect(h.mode).toBe('flat');
    close(h.heading, 0);
  });

  it('flat phone, alpha counter-clockwise: alpha 90 = top pointing west', () => {
    close(headingFromOrientation(90, 0, 0).heading, 270);
    close(headingFromOrientation(270, 5, -3).heading, 90);
  });

  it('upright phone aimed north, slightly tilted back: no 180° flip', () => {
    // Le bug observé : debout, penché de 10° vers l'arrière, l'ancien calcul donnait ~180°.
    for (const beta of [80, 90, 100, 110]) {
      const h = headingFromOrientation(0, beta, 0);
      expect(h.mode).toBe('upright');
      close(h.heading, 0);
    }
  });

  it('upright phone aimed east', () => {
    // Téléphone tourné de 90° dans le sens horaire vu du ciel : alpha = 270.
    close(headingFromOrientation(270, 95, 0).heading, 90);
  });

  it('landscape screen while flat adds the screen angle', () => {
    close(headingFromOrientation(0, 0, 0, 90).heading, 90);
  });
});
