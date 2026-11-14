import { useEffect, useState } from 'preact/hooks';
import { formatDuration, median } from '../format';
import { distanceFromRoundTrip } from '../estimate';
import { formatDistance } from '../geo';

interface Props {
  laps: number[];
  onChange: (laps: number[]) => void;
}

/**
 * Chronomètre des allers-retours d'un frelon marqué :
 * « Départ » quand il quitte le pot, « Retour » quand il revient.
 * On garde la médiane des tours, plus robuste qu'une moyenne.
 */
export function Stopwatch({ laps, onChange }: Props) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [manualMin, setManualMin] = useState('');
  const [manualSec, setManualSec] = useState('');

  useEffect(() => {
    if (startedAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [startedAt]);

  const med = median(laps);

  const addManual = () => {
    const s = (Number(manualMin) || 0) * 60 + (Number(manualSec) || 0);
    if (s > 0) {
      onChange([...laps, s]);
      setManualMin('');
      setManualSec('');
    }
  };

  return (
    <div class="stopwatch">
      {startedAt === null ? (
        <button type="button" class="btn big" onClick={() => { setStartedAt(Date.now()); setNow(Date.now()); }}>
          ▶ Départ du frelon
        </button>
      ) : (
        <div class="row">
          <span class="chrono">{formatDuration((now - startedAt) / 1000)}</span>
          <button
            type="button"
            class="btn big primary"
            onClick={() => {
              onChange([...laps, Math.round((Date.now() - startedAt) / 1000)]);
              setStartedAt(null);
            }}
          >
            ⏹ Retour au pot
          </button>
          <button type="button" class="btn ghost" onClick={() => setStartedAt(null)}>Annuler</button>
        </div>
      )}

      <div class="row manual">
        <span class="muted">ou saisir :</span>
        <input inputMode="numeric" placeholder="min" value={manualMin} onInput={(e) => setManualMin(e.currentTarget.value)} />
        <span>:</span>
        <input inputMode="numeric" placeholder="s" value={manualSec} onInput={(e) => setManualSec(e.currentTarget.value)} />
        <button type="button" class="btn small" onClick={addManual} disabled={!manualMin && !manualSec}>Ajouter</button>
      </div>

      {laps.length > 0 && (
        <div class="laps">
          {laps.map((l, i) => (
            <span class="chip" key={i}>
              {formatDuration(l)}
              <button type="button" aria-label="Supprimer" onClick={() => onChange(laps.filter((_, j) => j !== i))}>×</button>
            </span>
          ))}
          {med !== null && (
            <p class="hint">
              Médiane <b>{formatDuration(med)}</b> → nid à environ <b>{formatDistance(distanceFromRoundTrip(med))}</b>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
