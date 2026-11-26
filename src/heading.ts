// Calcul du cap visé à partir de l'orientation complète du téléphone
// (alpha, beta, gamma de DeviceOrientation, repère absolu : x = est,
// y = nord, z = vers le haut ; rotation R = Rz(alpha)·Rx(beta)·Ry(gamma)).
//
// On calcule la direction horizontale de deux axes du téléphone :
//  - le HAUT de l'écran (axe y), pertinent quand le téléphone est à plat ;
//  - l'ARRIÈRE du téléphone (axe -z, côté caméra), pertinent quand on le
//    tient debout pour viser, comme pour prendre une photo.
// On garde celui qui est le plus horizontal. Utiliser seulement le haut de
// l'écran (formule classique 360 - alpha) donne un cap inversé de 180°
// dès que le téléphone tenu debout penche un peu vers l'arrière.

import { normDeg, toDeg, toRad } from './geo';

export type AimMode = 'flat' | 'upright';

export interface AimHeading {
  heading: number;
  mode: AimMode;
}

export function headingFromOrientation(alpha: number, beta: number, gamma: number, screenAngle = 0): AimHeading {
  const a = toRad(alpha);
  const b = toRad(beta);
  const g = toRad(gamma);
  const ca = Math.cos(a), sa = Math.sin(a);
  const cb = Math.cos(b), sb = Math.sin(b);
  const cg = Math.cos(g), sg = Math.sin(g);

  // Haut de l'écran (axe y) dans le repère terrestre.
  const topE = -sa * cb;
  const topN = ca * cb;
  // Arrière du téléphone (axe -z) dans le repère terrestre.
  const backE = -ca * sg - sa * sb * cg;
  const backN = -sa * sg + ca * sb * cg;

  const topH = Math.hypot(topE, topN);
  const backH = Math.hypot(backE, backN);

  if (topH >= backH) {
    // À plat : on tient compte de l'orientation de l'écran (paysage).
    return { heading: normDeg(toDeg(Math.atan2(topE, topN)) + screenAngle), mode: 'flat' };
  }
  return { heading: normDeg(toDeg(Math.atan2(backE, backN))), mode: 'upright' };
}
