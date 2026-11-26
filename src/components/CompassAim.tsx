import { useEffect, useState } from 'preact/hooks';
import { startCompass, compassSupported, type CompassReading } from '../compass';
import { cardinal, normDeg } from '../geo';

interface Props {
  onValidate: (heading: number) => void;
  onClose: () => void;
}

const LABELS: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
const PX_PER_DEG = 3.5;

/** Bandeau de cap qui défile : le repère central montre où l'on vise. */
function HeadingTape({ heading }: { heading: number }) {
  const ticks = [];
  const start = Math.floor((heading - 70) / 5) * 5;
  for (let d = start; d <= heading + 70; d += 5) {
    const deg = normDeg(d);
    const x = (d - heading) * PX_PER_DEG;
    const label = LABELS[deg];
    ticks.push(
      <div class={`tick ${deg % 45 === 0 ? 'major' : deg % 15 === 0 ? 'mid' : ''}`} style={{ transform: `translateX(${x}px)` }} key={d}>
        {label ? <span class={label === 'N' ? 'north' : ''}>{label}</span> : deg % 15 === 0 ? <small>{deg}</small> : null}
      </div>,
    );
  }
  return (
    <div class="tape" aria-hidden="true">
      <div class="tape-inner">{ticks}</div>
      <div class="tape-marker" />
    </div>
  );
}

/** Écran de visée : on pointe le téléphone vers la direction prise par le frelon. */
export function CompassAim({ onValidate, onClose }: Props) {
  const [reading, setReading] = useState<CompassReading | null>(null);
  const [error, setError] = useState<string | null>(compassSupported() ? null : 'Boussole non disponible sur cet appareil.');

  useEffect(() => {
    if (!compassSupported()) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    startCompass((r) => {
      if (Number.isNaN(r.heading)) setError('Aucun cap reçu : boussole absente ou accès refusé (vérifiez les autorisations du navigateur). Utilisez la flèche sur la carte.');
      else setReading(r);
    })
      .then((s) => (cancelled ? s() : (stop = s)))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  const unstable = reading && reading.jitter >= 6;
  const needsCalibration = reading && ((reading.accuracy !== null && reading.accuracy > 20) || reading.jitter > 15);

  return (
    <div class="compass-overlay" role="dialog" aria-label="Viser avec la boussole">
      {error ? (
        <p class="error">{error}</p>
      ) : reading ? (
        <>
          <p class="aim-mode">
            {reading.mode === 'upright' ? (
              <>📷 Téléphone <b>debout</b> : visez avec l'<b>arrière</b> du téléphone, comme pour une photo.</>
            ) : (
              <>📱 Téléphone <b>à plat</b> : visez avec le <b>haut</b> du téléphone.</>
            )}
          </p>
          <div class="aim-arrow">▲</div>
          <HeadingTape heading={reading.heading} />
          <div class="compass-value">
            {Math.round(reading.heading)}° <small>{cardinal(reading.heading)}</small>
          </div>
          <p class={unstable ? 'muted' : 'ok'}>{unstable ? 'Stabilisez le téléphone…' : 'Cap stable'}</p>
          {needsCalibration && (
            <p class="warn">Boussole imprécise : décrivez quelques « 8 » dans l'air avec le téléphone, loin des objets métalliques et des voitures.</p>
          )}
          <p class="hint">Vérifiez une fois avec un repère connu : visez le nord, l'écran doit afficher N.</p>
        </>
      ) : (
        <p class="muted">Lecture de la boussole…</p>
      )}
      <div class="row">
        <button type="button" class="btn ghost" onClick={onClose}>Annuler</button>
        <button type="button" class="btn primary big" disabled={!reading} onClick={() => reading && onValidate(reading.heading)}>
          Valider ce cap
        </button>
      </div>
    </div>
  );
}
