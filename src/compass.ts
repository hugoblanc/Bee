// Lecture de la boussole du téléphone.
// - iOS (Safari) : `webkitCompassHeading`, après autorisation explicite.
// - Android (Chrome) : évènement `deviceorientationabsolute`, cap = 360 - alpha.
// Le cap obtenu est magnétique ; en France la déclinaison est d'environ
// +1 à +3° (est), négligeable devant la précision d'une boussole de téléphone.
import { circularMean, normDeg } from './geo';

export type CompassReading = { heading: number; /** dispersion récente (°) */ jitter: number };

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
  const handler = (ev: Event) => {
    const e = ev as DOE;
    let heading: number | null = null;
    if (typeof e.webkitCompassHeading === 'number') heading = e.webkitCompassHeading;
    else if ((e.absolute || ev.type === 'deviceorientationabsolute') && e.alpha !== null) heading = 360 - e.alpha;
    if (heading === null) return;
    const screenAngle = screen.orientation?.angle ?? 0;
    heading = normDeg(heading + screenAngle);
    lastEvent = Date.now();
    recent.push(heading);
    if (recent.length > 15) recent.shift();
    const mean = circularMean(recent);
    const jitter = Math.max(...recent.map((h) => Math.abs(normDeg(h - mean + 180) - 180)));
    onReading({ heading: mean, jitter });
  };

  const evt = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(evt, handler);
  // Si aucun cap absolu n'arrive, le téléphone n'a probablement pas de magnétomètre.
  const check = setTimeout(() => {
    if (!lastEvent) onReading({ heading: NaN, jitter: NaN });
  }, 2500);
  return () => {
    clearTimeout(check);
    window.removeEventListener(evt, handler);
  };
}
