import L from 'leaflet';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Hunt } from '../types';
import { saveHunt, getAuthor, setAuthor } from '../db';
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
  const [author, setAuthorState] = useState(hunt.nest?.author ?? getAuthor());
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
    setAuthor(author.trim());
    await saveHunt({ ...hunt, nest: { lat: pos.lat, lng: pos.lng, foundAt: hunt.nest?.foundAt ?? Date.now(), note: note.trim(), author: author.trim() } });
    onDone();
  };

  return (
    <div class="form">
      <h2>🎯 Nid trouvé</h2>
      <p class="hint">Placez la cible sur l'emplacement exact du nid (glisser ou toucher la carte). La photo aérienne aide à repérer l'arbre.</p>
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
        Votre pseudo <span class="muted">(optionnel)</span>
        <input value={author} maxLength={60} onInput={(e) => setAuthorState(e.currentTarget.value)} />
      </label>
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
