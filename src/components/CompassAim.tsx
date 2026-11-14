import { useEffect, useState } from 'preact/hooks';
import { startCompass, compassSupported, type CompassReading } from '../compass';
import { cardinal } from '../geo';

interface Props {
  onValidate: (heading: number) => void;
  onClose: () => void;
}

/** Écran de visée : on pointe le haut du téléphone vers la direction prise par le frelon. */
export function CompassAim({ onValidate, onClose }: Props) {
  const [reading, setReading] = useState<CompassReading | null>(null);
  const [error, setError] = useState<string | null>(compassSupported() ? null : 'Boussole non disponible sur cet appareil.');

  useEffect(() => {
    if (!compassSupported()) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    startCompass((r) => {
      if (Number.isNaN(r.heading)) setError("Aucun cap reçu : boussole absente ou accès refusé (vérifiez les autorisations du navigateur). Utilisez la flèche sur la carte.");
      else setReading(r);
    })
      .then((s) => (cancelled ? s() : (stop = s)))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  const stable = reading && reading.jitter < 6;

  return (
    <div class="compass-overlay" role="dialog" aria-label="Viser avec la boussole">
      <p class="hint">
        Tenez le téléphone <b>à plat</b>, le <b>haut de l'écran pointé</b> vers la direction où le frelon est parti. Éloignez-vous des objets métalliques.
      </p>
      {error ? (
        <p class="error">{error}</p>
      ) : reading ? (
        <>
          <div class="compass-rose" style={{ transform: `rotate(${-reading.heading}deg)` }}>
            <span class="n">N</span>
            <span class="e">E</span>
            <span class="s">S</span>
            <span class="w">O</span>
          </div>
          <div class="compass-pointer">▲</div>
          <div class="compass-value">
            {Math.round(reading.heading)}° <small>{cardinal(reading.heading)}</small>
          </div>
          <p class={stable ? 'ok' : 'muted'}>{stable ? 'Cap stable' : 'Stabilisez le téléphone…'}</p>
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
