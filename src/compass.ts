// Lecture de la boussole du téléphone.
//
// - Android (Chrome) : évènement `deviceorientationabsolute` ; alpha est
//   absolu (par rapport au nord magnétique).
// - iOS (Safari) : alpha est relatif ; `webkitCompassHeading` donne le cap.
//   On en déduit le décalage pour rendre alpha absolu, mesuré quand le
//   téléphone est à peu près à plat (là où la mesure iOS est fiable).
//
// Le cap visé est ensuite calculé par `headingFromOrientation`, qui gère le
// téléphone à plat (on vise avec le haut) comme tenu debout (on vise avec
// l'arrière, côté caméra).
//
// Le cap est magnétique ; en France la déclinaison est d'environ +1 à +3°
// (est), négligeable devant la précision d'une boussole de téléphone.
import { circularMean, normDeg } from './geo';
import { headingFromOrientation, type AimMode } from './heading';

export type CompassReading = {
  heading: number;
  /** Dispersion récente (°) : plus c'est grand, moins la mesure est stable. */
  jitter: number;
  mode: AimMode;
  /** Précision annoncée par iOS (°), si disponible. */
  accuracy: number | null;
};

type DOE = DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number };

export function compassSupported(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

export async function startCompass(onReading: (r: CompassReading) => void): Promise<() => void> {
  const DOEClass = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } })
    .DeviceOrientationEvent;
  if (DOEClass?.requestPermission) {
    // Obligatoire sur iOS. Sur certains navigateurs la réponse n'est pas
    // fiable : en cas de refus on écoute quand même, et l'absence de cap
    // au bout de quelques secondes sera signalée.
    try {
      await DOEClass.requestPermission();
    } catch {
      /* ignoré */
    }
  }

  const recent: number[] = [];
  let lastEvent = 0;
  let iosOffset: number | null = null;

  const handler = (ev: Event) => {
    const e = ev as DOE;
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    const screenAngle = screen.orientation?.angle ?? 0;
    let alpha = e.alpha;

    if (typeof e.webkitCompassHeading === 'number') {
      // iOS : recalage d'alpha sur le nord, quand le téléphone est assez à plat.
      if (Math.abs(e.beta) < 50 && Math.abs(e.gamma) < 50) {
        iosOffset = normDeg(360 - e.webkitCompassHeading - e.alpha);
      }
      if (iosOffset === null) {
        // Pas encore de recalage (téléphone tenu debout dès le départ).
        iosOffset = normDeg(360 - e.webkitCompassHeading - e.alpha);
      }
      alpha = normDeg(e.alpha + iosOffset);
    } else if (!(e.absolute || ev.type === 'deviceorientationabsolute')) {
      return; // alpha relatif sans moyen de le recaler : inutilisable
    }

    const { heading, mode } = headingFromOrientation(alpha, e.beta, e.gamma, screenAngle);
    lastEvent = Date.now();
    recent.push(heading);
    if (recent.length > 15) recent.shift();
    const mean = circularMean(recent);
    const jitter = Math.max(...recent.map((h) => Math.abs(normDeg(h - mean + 180) - 180)));
    const acc = typeof e.webkitCompassAccuracy === 'number' && e.webkitCompassAccuracy >= 0 ? e.webkitCompassAccuracy : null;
    onReading({ heading: mean, jitter, mode, accuracy: acc });
  };

  const evt = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(evt, handler);
  // Si aucun cap absolu n'arrive, le téléphone n'a probablement pas de magnétomètre.
  const check = setTimeout(() => {
    if (!lastEvent) onReading({ heading: NaN, jitter: NaN, mode: 'flat', accuracy: null });
  }, 2500);
  return () => {
    clearTimeout(check);
    window.removeEventListener(evt, handler);
  };
}
