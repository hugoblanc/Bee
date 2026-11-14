import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Observation } from '../types';
import { newId, saveObservation, getAuthor, setAuthor } from '../db';
import { bearingTo, destination, distance, angleDiff, circularMean, cardinal, type LatLng } from '../geo';
import { arrowHeadIcon, dotIcon } from '../map';
import { median, toLocalInput } from '../format';
import { Stopwatch } from './Stopwatch';
import { CompassAim } from './CompassAim';

interface Props {
  map: L.Map;
  huntId: string;
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

export function ObservationForm({ map, huntId, userPos, editing, onDone }: Props) {
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
  const [author, setAuthorState] = useState(editing?.author ?? getAuthor());
  const [note, setNote] = useState(editing?.note ?? '');
  const [observedAt, setObservedAt] = useState(editing?.observedAt ?? Date.now());
  const [aiming, setAiming] = useState(false);
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
    setAuthor(author.trim());
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
      author: author.trim(),
      note: note.trim(),
      deleted: false,
    };
    await saveObservation(obs);
    onDone(true);
  };

  return (
    <div class="form">
      {aiming && (
        <CompassAim
          onClose={() => setAiming(false)}
          onValidate={(h) => {
            setCompassBearing(h);
            setAiming(false);
          }}
        />
      )}

      <h2>{editing ? "Modifier l'observation" : 'Nouvelle observation'}</h2>

      <section>
        <h3>1. Position du pot</h3>
        <div class="row">
          <button type="button" class="btn" onClick={useGps} disabled={locating}>
            {locating ? 'Localisation…' : '📍 Ma position GPS'}
          </button>
          <span class="muted small">{accuracy !== null ? `précision ± ${Math.round(accuracy)} m` : 'ou faites glisser 🍯 sur la carte'}</span>
        </div>
      </section>

      <section>
        <h3>2. Direction de départ du frelon</h3>
        <p class="hint">Touchez la carte vers où il est parti, ou faites glisser la poignée orange. Puis confirmez à la boussole.</p>
        <div class="bearing-grid">
          <div>
            <span class="swatch" style={{ background: MAP_COLOR }} /> Carte :{' '}
            <b>{mapBearing === null ? '—' : `${Math.round(mapBearing)}° ${cardinal(mapBearing)}`}</b>
          </div>
          <div>
            <span class="swatch dashed" style={{ borderColor: COMPASS_COLOR }} /> Boussole :{' '}
            <b>{compassBearing === null ? '—' : `${Math.round(compassBearing)}° ${cardinal(compassBearing)}`}</b>
            {compassBearing !== null && (
              <button type="button" class="link" onClick={() => setCompassBearing(null)}>effacer</button>
            )}
          </div>
        </div>
        <div class="row">
          <button type="button" class="btn" onClick={() => setAiming(true)}>🧭 Viser avec la boussole</button>
          {compassBearing !== null && mapBearing === null && (
            <button type="button" class="btn ghost" onClick={() => setMapBearing(compassBearing)}>Reporter sur la carte</button>
          )}
        </div>
        {combined && combined.gap !== null && (
          <p class={combined.gap <= 20 ? 'ok' : 'warn'}>
            {combined.gap <= 20
              ? `✓ Carte et boussole concordent (écart ${Math.round(combined.gap)}°).`
              : `⚠ Écart de ${Math.round(combined.gap)}° entre carte et boussole : vérifiez. La moyenne sera utilisée avec une précision réduite.`}
          </p>
        )}
        {combined && (
          <p class="small">
            Cap retenu : <b>{Math.round(combined.bearing)}° {cardinal(combined.bearing)}</b> (± {combined.sigmaDeg}°)
          </p>
        )}
      </section>

      <section>
        <h3>3. Chrono aller-retour <span class="muted">(optionnel)</span></h3>
        <p class="hint">Avec un frelon marqué : la durée d'un aller-retour donne une idée de la distance du nid.</p>
        <Stopwatch laps={laps} onChange={setLaps} />
      </section>

      <section>
        <h3>4. Détails</h3>
        <label>
          Date et heure
          <input type="datetime-local" value={toLocalInput(observedAt)} onInput={(e) => {
            const v = new Date(e.currentTarget.value).getTime();
            if (Number.isFinite(v)) setObservedAt(v);
          }} />
        </label>
        <label>
          Votre pseudo <span class="muted">(optionnel)</span>
          <input value={author} maxLength={60} onInput={(e) => setAuthorState(e.currentTarget.value)} placeholder="ex. Jean du rucher des Prés" />
        </label>
        <label>
          Note <span class="muted">(optionnel)</span>
          <textarea value={note} maxLength={1000} rows={2} onInput={(e) => setNote(e.currentTarget.value)} placeholder="Nombre de frelons, couleur de marquage, météo…" />
        </label>
      </section>

      <div class="actions sticky">
        <button type="button" class="btn ghost" onClick={() => onDone(false)}>Annuler</button>
        <button type="button" class="btn primary" disabled={!combined} onClick={save}>
          {combined ? 'Enregistrer' : 'Indiquez une direction'}
        </button>
      </div>
    </div>
  );
}
