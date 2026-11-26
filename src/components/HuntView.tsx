import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Hunt, Observation } from '../types';
import { getHunt, listObservations, onDataChange, deleteObservation, saveHunt } from '../db';
import { estimateNest, distanceFromRoundTrip, type Estimate } from '../estimate';
import { createMap, dayColor, dotIcon, arrowHeadIcon, nestIcon, gridToImage } from '../map';
import { destination, distance, formatDistance, cardinal, bearingTo } from '../geo';
import { dayIndexer, dayKey, formatDay, formatTime, formatDuration } from '../format';
import { ObservationForm, combineBearings } from './ObservationForm';
import { NestForm } from './NestForm';
import { SyncBadge } from './SyncBadge';

type Mode = { kind: 'view' } | { kind: 'obs'; editing?: Observation } | { kind: 'nest' };

const CONFIDENCE_LABEL = { faible: 'Zone encore large', moyenne: 'Zone qui se resserre', bonne: 'Zone précise' };

export function HuntView({ id }: { id: string }) {
  const [hunt, setHunt] = useState<Hunt | null | undefined>(undefined);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: 'view' });
  const [map, setMap] = useState<L.Map | null>(null);
  const [userPos, setUserPos] = useState<GeolocationPosition | null>(null);
  const [showHeat, setShowHeat] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const mapEl = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  const refitPending = useRef(false);

  // ---------- Données ----------
  useEffect(() => {
    const load = async () => {
      setHunt((await getHunt(id)) ?? null);
      setObservations(await listObservations(id));
    };
    void load();
    return onDataChange(() => void load());
  }, [id]);

  const estimate: Estimate | null = useMemo(
    () =>
      estimateNest(
        observations.map((o) => ({
          lat: o.lat,
          lng: o.lng,
          bearing: o.bearing,
          sigmaDeg: combineBearings(o.mapBearing, o.compassBearing)?.sigmaDeg,
          roundTripSeconds: o.roundTripSeconds,
        })),
      ),
    [observations],
  );

  const dayOf = useMemo(() => dayIndexer(observations.map((o) => o.observedAt)), [observations]);

  // ---------- Carte ----------
  useEffect(() => {
    if (!mapEl.current) return;
    const m = createMap(mapEl.current);
    setMap(m);
    const watch = navigator.geolocation?.watchPosition(setUserPos, () => {}, { enableHighAccuracy: true, maximumAge: 10000 });
    return () => {
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      m.remove();
    };
  }, []);

  // La taille de la carte change quand le panneau s'ouvre ou se ferme.
  useEffect(() => {
    const t = setTimeout(() => map?.invalidateSize(), 220);
    return () => clearTimeout(t);
  }, [map, panelOpen, mode.kind]);

  // Cadrage initial.
  useEffect(() => {
    if (!map || fitted.current || hunt === undefined) return;
    const pts: L.LatLngExpression[] = observations.map((o) => [o.lat, o.lng]);
    if (hunt?.nest) pts.push([hunt.nest.lat, hunt.nest.lng]);
    if (estimate) pts.push([estimate.best.lat, estimate.best.lng]);
    if (pts.length) {
      map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 17 });
      fitted.current = true;
    } else if (userPos) {
      map.setView([userPos.coords.latitude, userPos.coords.longitude], 16);
      fitted.current = true;
    }
  }, [map, hunt, observations, estimate, userPos]);

  // Recadrage après l'enregistrement d'une observation, une fois les données rechargées.
  useEffect(() => {
    if (!map || !refitPending.current) return;
    refitPending.current = false;
    const pts: L.LatLngExpression[] = observations.map((o) => [o.lat, o.lng]);
    if (estimate) pts.push([estimate.best.lat, estimate.best.lng]);
    if (pts.length) setTimeout(() => map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 17 }), 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observations]);

  // Carte de probabilité.
  useEffect(() => {
    if (!map || !estimate || !showHeat) return;
    const g = estimate.grid;
    const overlay = L.imageOverlay(gridToImage(g), [[g.south, g.west], [g.north, g.east]], { opacity: 0.75, interactive: false, className: 'heat' }).addTo(map);
    return () => void overlay.remove();
  }, [map, estimate, showHeat]);

  // Observations : pots + directions.
  useEffect(() => {
    if (!map) return;
    const group = L.layerGroup().addTo(map);
    const editingId = mode.kind === 'obs' ? mode.editing?.id : undefined;
    for (const o of observations) {
      if (o.id === editingId) continue;
      const day = dayOf(o.observedAt);
      const color = dayColor(day);
      const d = o.roundTripSeconds ? distanceFromRoundTrip(o.roundTripSeconds) : null;
      const len = d ? d * 1.5 : 1200;
      const tip = destination(o, o.bearing, len);
      L.polyline([o, tip], { color, weight: 3, opacity: 0.85 }).addTo(group);
      L.marker(destination(o, o.bearing, Math.min(len, 60)), { icon: arrowHeadIcon(color, o.bearing), interactive: false }).addTo(group);
      if (d) L.circleMarker(destination(o, o.bearing, d), { radius: 5, color, fillColor: '#fff', fillOpacity: 1, weight: 3 }).addTo(group);
      L.marker(o, { icon: dotIcon(color, `J${day + 1}`, 26) })
        .bindPopup(
          `<b>J${day + 1}</b> · ${formatDay(o.observedAt)} ${formatTime(o.observedAt)}<br>` +
            `Cap ${Math.round(o.bearing)}° ${cardinal(o.bearing)}` +
            (o.roundTripSeconds ? `<br>Aller-retour ${formatDuration(o.roundTripSeconds)} (≈ ${formatDistance(d!)})` : '') +
            (o.author ? `<br>par ${escapeHtml(o.author)}` : '') +
            (o.note ? `<br><i>${escapeHtml(o.note)}</i>` : ''),
        )
        .addTo(group);
    }
    return () => void group.remove();
  }, [map, observations, dayOf, mode]);

  // Estimation, suggestion et nid.
  useEffect(() => {
    if (!map) return;
    const group = L.layerGroup().addTo(map);
    if (estimate && !hunt?.nest) {
      L.circle(estimate.best, { radius: estimate.radius50, color: '#dc2626', weight: 2, fill: false, dashArray: '4 4' }).addTo(group);
      L.marker(estimate.best, { icon: dotIcon('#dc2626', '✕', 22), zIndexOffset: 500 })
        .bindPopup(`<b>Position la plus probable</b><br>Zone à 50 % : rayon ≈ ${formatDistance(estimate.radius50)}`)
        .addTo(group);
      if (estimate.suggestion && mode.kind === 'view') {
        L.marker(estimate.suggestion, { icon: dotIcon('rgba(255,255,255,.85)', '🍯', 26), opacity: 0.9 })
          .bindPopup('<b>Prochain pot conseillé</b><br>Avancer vers la zone en se décalant sur le côté donne un meilleur croisement des directions.')
          .addTo(group);
        L.polyline([estimate.suggestion, estimate.best], { color: '#111827', weight: 1.5, dashArray: '2 6', interactive: false }).addTo(group);
      }
    }
    if (hunt?.nest && mode.kind !== 'nest') {
      L.marker(hunt.nest, { icon: nestIcon, zIndexOffset: 800 })
        .bindPopup(`<b>Nid trouvé</b> le ${formatDay(hunt.nest.foundAt)}${hunt.nest.author ? ` par ${escapeHtml(hunt.nest.author)}` : ''}${hunt.nest.note ? `<br><i>${escapeHtml(hunt.nest.note)}</i>` : ''}`)
        .addTo(group);
    }
    return () => void group.remove();
  }, [map, estimate, hunt, mode]);

  // Position de l'utilisateur.
  useEffect(() => {
    if (!map || !userPos) return;
    const p: L.LatLngExpression = [userPos.coords.latitude, userPos.coords.longitude];
    const acc = L.circle(p, { radius: userPos.coords.accuracy, color: '#3b82f6', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map);
    const dot = L.circleMarker(p, { radius: 7, color: '#fff', weight: 2, fillColor: '#3b82f6', fillOpacity: 1, interactive: false }).addTo(map);
    return () => {
      acc.remove();
      dot.remove();
    };
  }, [map, userPos]);

  if (hunt === null) {
    return (
      <div class="page">
        <p>Recherche introuvable (peut-être pas encore synchronisée).</p>
        <a href="#/">← Retour</a>
      </div>
    );
  }

  const days = groupByDay(observations);
  const userLatLng = userPos ? { lat: userPos.coords.latitude, lng: userPos.coords.longitude } : null;

  return (
    <div class="hunt">
      <header class="topbar">
        <a href="#/" class="back" aria-label="Retour">←</a>
        <h1 onClick={async () => {
          if (!hunt) return;
          const name = prompt('Nom de la recherche', hunt.name);
          if (name && name.trim()) await saveHunt({ ...hunt, name: name.trim() });
        }}>{hunt?.name ?? '…'}</h1>
        {hunt && <span class="method-chip" title="Méthode de recherche">{hunt.method === 'chrono' ? '⏱ Chrono' : '🧭 Directions'}</span>}
        <SyncBadge />
      </header>

      <div class="map-wrap">
        <div ref={mapEl} class="map" />
        {mode.kind === 'view' && map && (
          <div class="map-buttons">
            {userPos && (
              <button type="button" class="fab small" title="Ma position" onClick={() => map.setView([userPos.coords.latitude, userPos.coords.longitude], Math.max(map.getZoom(), 16))}>📍</button>
            )}
            {estimate && (
              <button type="button" class={`fab small ${showHeat ? 'on' : ''}`} title="Carte de probabilité" onClick={() => setShowHeat(!showHeat)}>🔥</button>
            )}
          </div>
        )}
      </div>

      <div class={`panel ${panelOpen || mode.kind !== 'view' ? 'open' : ''}`}>
        {mode.kind === 'view' && (
          <button type="button" class="panel-handle" aria-label="Afficher / masquer" onClick={() => setPanelOpen(!panelOpen)}>
            <span />
          </button>
        )}

        {map && mode.kind === 'obs' && (
          <ObservationForm map={map} huntId={id} method={hunt?.method ?? 'direction'} userPos={userPos} editing={mode.editing} onDone={(saved) => {
            // Après un enregistrement, on recadre pour voir la nouvelle zone estimée.
            if (saved) refitPending.current = true;
            setMode({ kind: 'view' });
          }} />
        )}
        {map && hunt && mode.kind === 'nest' && (
          <NestForm map={map} hunt={hunt} userPos={userPos} initial={estimate?.best ?? map.getCenter()} onDone={() => setMode({ kind: 'view' })} />
        )}

        {mode.kind === 'view' && (
          <div class="view">
            <Summary hunt={hunt} estimate={estimate} count={observations.length} userLatLng={userLatLng} />
            <div class="actions">
              <button type="button" class="btn primary big" onClick={() => setMode({ kind: 'obs' })}>＋ Observation</button>
              <button type="button" class="btn big" onClick={() => setMode({ kind: 'nest' })}>{hunt?.nest ? '🎯 Modifier le nid' : '🎯 Nid trouvé'}</button>
            </div>

            {days.map(([key, list]) => {
              const di = dayOf(list[0].observedAt);
              return (
                <div class="day" key={key}>
                  <h3>
                    <span class="day-badge" style={{ background: dayColor(di) }}>J{di + 1}</span> {formatDay(list[0].observedAt)}
                    <span class="muted"> · {list.length} observation{list.length > 1 ? 's' : ''}</span>
                  </h3>
                  <ul class="obs-list">
                    {list.map((o) => (
                      <li key={o.id}>
                        <button type="button" class="obs-main" onClick={() => map?.setView(o, Math.max(map.getZoom(), 17))}>
                          <span class="time">{formatTime(o.observedAt)}</span>
                          <span class="bearing">
                            <span class="mini-arrow" style={{ transform: `rotate(${o.bearing}deg)` }}>↑</span> {Math.round(o.bearing)}° {cardinal(o.bearing)}
                          </span>
                          {o.roundTripSeconds ? <span class="rt">⏱ {formatDuration(o.roundTripSeconds)} ≈ {formatDistance(distanceFromRoundTrip(o.roundTripSeconds))}</span> : null}
                          {o.compassBearing !== null && o.mapBearing !== null && <span class="tag" title="Carte et boussole">✓✓</span>}
                          {o.author && <span class="author">{o.author}</span>}
                          {o.dirty ? <span class="tag pending" title="Pas encore envoyée">⏳</span> : null}
                        </button>
                        <button type="button" class="icon" aria-label="Modifier" onClick={() => setMode({ kind: 'obs', editing: o })}>✎</button>
                        <button type="button" class="icon" aria-label="Supprimer" onClick={() => confirm('Supprimer cette observation ?') && deleteObservation(o)}>🗑</button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Summary({ hunt, estimate, count, userLatLng }: { hunt: Hunt | undefined; estimate: Estimate | null; count: number; userLatLng: { lat: number; lng: number } | null }) {
  if (hunt?.nest) {
    const err = estimate ? distance(estimate.best, hunt.nest) : null;
    return (
      <div class="summary found">
        <b>🎯 Nid trouvé</b> le {formatDay(hunt.nest.foundAt)}
        {hunt.nest.author && <> par {hunt.nest.author}</>}
        {err !== null && <div class="muted small">L'estimation était à {formatDistance(err)} du nid réel.</div>}
      </div>
    );
  }
  if (!estimate) {
    return (
      <div class="summary">
        <b>Première observation</b>
        {hunt?.method === 'chrono' ? (
          <p class="hint">Marquez un frelon sur le pot, notez sa direction de départ et chronométrez ses allers-retours. Une seule observation donne déjà une zone.</p>
        ) : (
          <p class="hint">Attendez un frelon sur le pot et notez la direction dans laquelle il repart. Recommencez depuis un 2ᵉ pot à 200–300 m sur le côté pour croiser les directions.</p>
        )}
        <a href="#/guide" class="small">📖 Revoir le guide</a>
      </div>
    );
  }
  return (
    <div class="summary">
      <div class="row space">
        <b>{CONFIDENCE_LABEL[estimate.confidence]}</b>
        <span class={`badge ${estimate.confidence}`}>{count} obs.</span>
      </div>
      <div class="small">
        Nid probablement dans un rayon de <b>{formatDistance(estimate.radius50)}</b> autour de ✕ (50 %), <b>{formatDistance(estimate.radius90)}</b> (90 %).
        {userLatLng && (
          <> ✕ est à <b>{formatDistance(distance(userLatLng, estimate.best))}</b> de vous, direction {cardinal(bearingTo(userLatLng, estimate.best))}.</>
        )}
      </div>
      {estimate.suggestion && <div class="hint">Conseil : placez le prochain pot vers 🍯 pour mieux croiser les directions.</div>}
    </div>
  );
}

function groupByDay(obs: Observation[]): [string, Observation[]][] {
  const m = new Map<string, Observation[]>();
  for (const o of obs) {
    const k = dayKey(o.observedAt);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(o);
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([k, l]) => [k, [...l].reverse()]);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
