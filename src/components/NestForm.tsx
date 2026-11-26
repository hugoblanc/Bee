import L from 'leaflet';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Hunt } from '../types';
import { saveHunt } from '../db';
import { authorFields } from '../profile';
import { nestIcon } from '../map';
import type { LatLng } from '../geo';

interface Props {
  map: L.Map;
  hunt: Hunt;
  initial: LatLng;
  userPos: GeolocationPosition | null;
  onDone: () => void;
}

export function NestForm({ map, hunt, initial, userPos, onDone }: Props) {
  const [pos, setPos] = useState<LatLng>(hunt.nest ?? initial);
  const [note, setNote] = useState(hunt.nest?.note ?? '');
  const marker = useRef<L.Marker | null>(null);

  useEffect(() => {
    const m = L.marker(pos, { draggable: true, icon: nestIcon, zIndexOffset: 1000 }).addTo(map);
    m.on('drag', () => setPos(m.getLatLng()));
    const onClick = (e: L.LeafletMouseEvent) => setPos(e.latlng);
    map.on('click', onClick);
    marker.current = m;
    map.setView(pos, Math.max(map.getZoom(), 17));
    return () => {
      map.off('click', onClick);
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    marker.current?.setLatLng(pos);
  }, [pos]);

  const save = async () => {
    await saveHunt({ ...hunt, nest: { lat: pos.lat, lng: pos.lng, foundAt: hunt.nest?.foundAt ?? Date.now(), note: note.trim(), ...authorFields() } });
    onDone();
  };

  return (
    <div class="form">
      <h2>🎯 Nid trouvé</h2>
      <p class="hint">Touchez la carte à l'emplacement exact du nid.</p>
      {userPos && (
        <button type="button" class="btn" onClick={() => {
          const p = { lat: userPos.coords.latitude, lng: userPos.coords.longitude };
          setPos(p);
          map.setView(p, Math.max(map.getZoom(), 18));
        }}>
          📍 Je suis sous le nid
        </button>
      )}
      <label>
        Note <span class="muted">(optionnel)</span>
        <textarea rows={2} maxLength={500} value={note} onInput={(e) => setNote(e.currentTarget.value)} placeholder="Hauteur, type d'arbre, signalé à la mairie…" />
      </label>
      <div class="actions sticky">
        {hunt.nest && (
          <button type="button" class="btn danger ghost" onClick={async () => {
            if (confirm('Retirer le nid de la carte ?')) {
              await saveHunt({ ...hunt, nest: null });
              onDone();
            }
          }}>Retirer</button>
        )}
        <button type="button" class="btn ghost" onClick={onDone}>Annuler</button>
        <button type="button" class="btn primary" onClick={save}>Enregistrer le nid</button>
      </div>
    </div>
  );
}
