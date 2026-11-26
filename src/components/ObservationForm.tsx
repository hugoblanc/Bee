import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { HuntMethod, Observation } from '../types';
import { newId, saveObservation } from '../db';
import { authorFields } from '../profile';
import { bearingTo, destination, distance, angleDiff, circularMean, cardinal, formatDistance, type LatLng } from '../geo';
import { arrowHeadIcon, dotIcon } from '../map';
import { median, toLocalInput, formatDuration } from '../format';
import { distanceFromRoundTrip } from '../estimate';
import { Stopwatch } from './Stopwatch';
import { CompassAim } from './CompassAim';

interface Props {
  map: L.Map;
  huntId: string;
  method: HuntMethod;
  userPos: GeolocationPosition | null;
  editing?: Observation;
  onDone: (saved: boolean) => void;
}

const MAP_COLOR = '#f59e0b';
const COMPASS_COLOR = '#0ea5e9';

/** Combine la direction carte et la direction boussole. */
export function combineBearings(mapB: number | null, compassB: number | null) {
  if (mapB !== null && compassB !== null) {
    const gap = Math.abs(angleDiff(mapB, compassB));
    return { bearing: circularMean([mapB, compassB]), sigmaDeg: gap <= 20 ? 12 : 22, gap };
  }
  const b = mapB ?? compassB;
  return b === null ? null : { bearing: b, sigmaDeg: 18, gap: null };
}

type Step = 'position' | 'direction' | 'chrono' | 'finish';

export function ObservationForm({ map, huntId, method, userPos, editing, onDone }: Props) {
  const [station, setStation] = useState<LatLng>(() => {
    if (editing) return { lat: editing.lat, lng: editing.lng };
    if (userPos && userPos.coords.accuracy < 150) return { lat: userPos.coords.latitude, lng: userPos.coords.longitude };
    const c = map.getCenter();
    return { lat: c.lat, lng: c.lng };
  });
  const [accuracy, setAccuracy] = useState<number | null>(editing?.accuracy ?? (userPos && !editing ? userPos.coords.accuracy : null));
  const [mapBearing, setMapBearing] = useState<number | null>(editing?.mapBearing ?? null);
  const [compassBearing, setCompassBearing] = useState<number | null>(editing?.compassBearing ?? null);
  const [laps, setLaps] = useState<number[]>(editing?.roundTrips ?? []);
  const [note, setNote] = useState(editing?.note ?? '');
  const [observedAt, setObservedAt] = useState(editing?.observedAt ?? Date.now());
  const [aiming, setAiming] = useState(false);
  // En triangulation simple, le chrono est une option que l'on ajoute.
  const [withChrono, setWithChrono] = useState(method === 'chrono' || (editing?.roundTrips.length ?? 0) > 0);
  const [showDetails, setShowDetails] = useState(false);
  const steps: Step[] = withChrono ? ['position', 'direction', 'chrono', 'finish'] : ['position', 'direction', 'finish'];
  // En modification, on part du récapitulatif : on touche la ligne à changer.
  const [step, setStep] = useState<Step>(editing ? 'finish' : 'position');
  const stepIndex = steps.indexOf(step);
  const next = () => setStep(editing ? 'finish' : steps[Math.min(steps.length - 1, stepIndex + 1)]);
  const prev = () => {
    if (editing) return step === 'finish' ? onDone(false) : setStep('finish');
    return stepIndex === 0 ? onDone(false) : setStep(steps[stepIndex - 1]);
  };
  const [locating, setLocating] = useState(false);

  // Longueur de la flèche : environ un tiers de la hauteur visible de la carte.
  const arrowLen = useRef<number>(0);
  if (!arrowLen.current) {
    const b = map.getBounds();
    arrowLen.current = Math.max(80, distance({ lat: b.getSouth(), lng: b.getWest() }, { lat: b.getNorth(), lng: b.getWest() }) / 3);
  }

  const combined = combineBearings(mapBearing, compassBearing);
  const displayBearing = mapBearing ?? compassBearing;

  // ---------- Calques sur la carte ----------
  const layers = useRef<{ station: L.Marker; line: L.Polyline; head: L.Marker; handle: L.Marker; compass: L.Polyline } | null>(null);
  const stationRef = useRef(station);
  stationRef.current = station;
  const stepRef = useRef<Step>(step);
  stepRef.current = step;

  useEffect(() => {
    const stationMarker = L.marker(station, { draggable: true, icon: dotIcon('#111827', '🍯', 30), zIndexOffset: 1000 }).addTo(map);
    const line = L.polyline([], { color: MAP_COLOR, weight: 4 }).addTo(map);
    const head = L.marker(station, { icon: arrowHeadIcon(MAP_COLOR, 0), interactive: false }).addTo(map);
    const handle = L.marker(station, { draggable: true, icon: dotIcon(MAP_COLOR, '', 28), zIndexOffset: 900 }).addTo(map);
    const compass = L.polyline([], { color: COMPASS_COLOR, weight: 3, dashArray: '8 6' }).addTo(map);
    layers.current = { station: stationMarker, line, head, handle, compass };

    stationMarker.on('drag', () => {
      const p = stationMarker.getLatLng();
      setStation({ lat: p.lat, lng: p.lng });
      setAccuracy(null);
    });
    handle.on('drag', () => {
      const p = handle.getLatLng();
      const s = stationRef.current;
      arrowLen.current = Math.max(30, distance(s, p));
      setMapBearing(bearingTo(s, p));
    });
    const onClick = (e: L.LeafletMouseEvent) => {
      if (stepRef.current === 'position') {
        // Étape 1 : toucher la carte place le pot.
        setStation({ lat: e.latlng.lat, lng: e.latlng.lng });
        setAccuracy(null);
        return;
      }
      const s = stationRef.current;
      if (distance(s, e.latlng) < 5) return;
      arrowLen.current = Math.max(30, distance(s, e.latlng));
      setMapBearing(bearingTo(s, e.latlng));
    };
    map.on('click', onClick);
    if (!map.getBounds().contains(station)) map.setView(station, Math.max(map.getZoom(), 16));
    return () => {
      map.off('click', onClick);
      [stationMarker, line, head, handle, compass].forEach((l) => l.remove());
      layers.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    const l = layers.current;
    if (!l) return;
    l.station.setLatLng(station);
    const b = displayBearing ?? 0;
    const tip = destination(station, b, arrowLen.current);
    const showArrow = displayBearing !== null;
    l.line.setLatLngs(showArrow ? [station, tip] : []);
    l.head.setLatLng(tip).setIcon(arrowHeadIcon(MAP_COLOR, b)).setOpacity(showArrow ? 1 : 0);
    // Sans direction, la poignée est posée au nord pour inviter à la tourner.
    l.handle.setLatLng(showArrow ? destination(station, b, arrowLen.current * 1.08) : destination(station, 0, arrowLen.current));
    l.compass.setLatLngs(compassBearing !== null ? [station, destination(station, compassBearing, arrowLen.current * 1.25)] : []);
  }, [station, displayBearing, compassBearing]);

  const useGps = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const s = { lat: p.coords.latitude, lng: p.coords.longitude };
        setStation(s);
        setAccuracy(p.coords.accuracy);
        map.setView(s, Math.max(map.getZoom(), 17));
      },
      (e) => {
        setLocating(false);
        alert(`Position indisponible : ${e.message}`);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  };

  const roundTrip = useMemo(() => median(laps), [laps]);

  const save = async () => {
    if (!combined) return;
    const now = Date.now();
    const obs: Observation = {
      id: editing?.id ?? newId(),
      huntId,
      lat: station.lat,
      lng: station.lng,
      accuracy,
      bearing: Math.round(combined.bearing * 10) / 10,
      mapBearing: mapBearing === null ? null : Math.round(mapBearing * 10) / 10,
      compassBearing: compassBearing === null ? null : Math.round(compassBearing * 10) / 10,
      roundTripSeconds: roundTrip,
      roundTrips: laps,
      observedAt,
      updatedAt: now,
      // Une observation modifiée garde son auteur d'origine.
      ...(editing ? { author: editing.author, authorPhone: editing.authorPhone, authorEmail: editing.authorEmail } : authorFields()),
      note: note.trim(),
      deleted: false,
    };
    await saveObservation(obs);
    onDone(true);
  };

  const canNext = step !== 'direction' || combined !== null;
  const goEdit = (st: Step) => {
    if (st === 'chrono') setWithChrono(true);
    setStep(st);
  };

  return (
    <div class="form wizard">
      {aiming && (
        <CompassAim
          onClose={() => setAiming(false)}
          onValidate={(h) => {
            setCompassBearing(h);
            setAiming(false);
          }}
        />
      )}

      {!editing && (
        <div class="wizard-head">
          <div class="dots">
            {steps.map((s2, i) => (
              <span key={s2} class={i <= stepIndex ? 'on' : ''} />
            ))}
          </div>
        </div>
      )}

      {step === 'position' && (
        <section>
          <h2>📍 Où est le pot ?</h2>
          <button type="button" class="btn big wide" onClick={useGps} disabled={locating}>
            {locating ? 'Localisation…' : 'Le pot est ici (GPS)'}
          </button>
          <p class="muted small center">
            {accuracy !== null ? `Précision ± ${Math.round(accuracy)} m` : 'ou touchez la carte'}
          </p>
        </section>
      )}

      {step === 'direction' && (
        <section>
          <h2>🧭 Vers où part le frelon ?</h2>
          <p class="hint">Touchez la carte dans sa direction.</p>
          <button type="button" class="btn big wide" onClick={() => setAiming(true)}>
            {compassBearing === null ? 'Viser avec la boussole' : `Boussole : ${Math.round(compassBearing)}° ${cardinal(compassBearing)} · refaire`}
          </button>
          {combined && combined.gap !== null && (
            <p class={combined.gap <= 20 ? 'ok' : 'warn'}>
              {combined.gap <= 20 ? `✓ Carte et boussole d'accord (${Math.round(combined.gap)}°)` : `⚠ Carte et boussole : ${Math.round(combined.gap)}° d'écart`}
            </p>
          )}
          {compassBearing !== null && mapBearing === null && (
            <button type="button" class="link" onClick={() => setMapBearing(compassBearing)}>Reporter la boussole sur la carte</button>
          )}
          {method === 'direction' && !withChrono && !editing && (
            <button type="button" class="link" onClick={() => setWithChrono(true)}>＋ Ajouter un chrono</button>
          )}
        </section>
      )}

      {step === 'chrono' && (
        <section>
          <h2>⏱ Chrono aller-retour</h2>
          <Stopwatch laps={laps} onChange={setLaps} />
        </section>
      )}

      {step === 'finish' && (
        <section>
          <h2>{editing ? "Modifier l'observation" : 'Récapitulatif'}</h2>
          <div class="recap">
            <button type="button" class="recap-row" onClick={() => goEdit('position')}>
              <span>📍</span>
              <span>Pot {accuracy !== null ? `(GPS ± ${Math.round(accuracy)} m)` : '(sur la carte)'}</span>
              <span class="chev">✎</span>
            </button>
            <button type="button" class="recap-row" onClick={() => goEdit('direction')}>
              <span>🧭</span>
              <span>{combined ? <><b>{Math.round(combined.bearing)}° {cardinal(combined.bearing)}</b> <small class="muted">± {combined.sigmaDeg}°</small></> : 'Direction à indiquer'}</span>
              <span class="chev">✎</span>
            </button>
            <button type="button" class="recap-row" onClick={() => goEdit('chrono')}>
              <span>⏱</span>
              <span>
                {roundTrip !== null ? <><b>{formatDuration(roundTrip)}</b> <small class="muted">≈ {formatDistance(distanceFromRoundTrip(roundTrip))}</small></> : <span class="muted">Pas de chrono</span>}
              </span>
              <span class="chev">✎</span>
            </button>
            <button type="button" class="recap-row" onClick={() => setShowDetails(!showDetails)}>
              <span>📝</span>
              <span>{note ? note : <span class="muted">Note, date</span>}</span>
              <span class="chev">{showDetails ? '▴' : '✎'}</span>
            </button>
          </div>
          {showDetails && (
            <>
              <label>
                Note
                <textarea value={note} maxLength={1000} rows={2} onInput={(e) => setNote(e.currentTarget.value)} placeholder="Nombre de frelons, marquage, météo…" />
              </label>
              <label>
                Date et heure
                <input type="datetime-local" value={toLocalInput(observedAt)} onInput={(e) => {
                  const v = new Date(e.currentTarget.value).getTime();
                  if (Number.isFinite(v)) setObservedAt(v);
                }} />
              </label>
            </>
          )}
        </section>
      )}

      <div class="actions sticky">
        <button type="button" class="btn ghost" onClick={prev}>
          {editing ? (step === 'finish' ? 'Annuler' : '← Retour') : stepIndex === 0 ? 'Annuler' : '← Retour'}
        </button>
        {step === 'finish' ? (
          <button type="button" class="btn primary" disabled={!combined} onClick={save}>Enregistrer</button>
        ) : (
          <button type="button" class="btn primary" disabled={!canNext} onClick={next}>
            {step === 'direction' && !combined ? 'Indiquez une direction' : editing ? 'OK' : 'Suivant →'}
          </button>
        )}
      </div>
    </div>
  );
}
