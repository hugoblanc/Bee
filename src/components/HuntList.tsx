import { useEffect, useState } from 'preact/hooks';
import type { Hunt } from '../types';
import { listHunts, createHunt, onDataChange, countObservationsByHunt, saveHunt } from '../db';
import { SyncBadge } from './SyncBadge';
import { formatDay } from '../format';

export function HuntList() {
  const [hunts, setHunts] = useState<Hunt[] | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [name, setName] = useState('');

  useEffect(() => {
    const load = async () => {
      setHunts(await listHunts());
      setCounts(await countObservationsByHunt());
    };
    void load();
    return onDataChange(() => void load());
  }, []);

  const create = async (e: Event) => {
    e.preventDefault();
    const h = await createHunt(name || `Recherche du ${new Date().toLocaleDateString('fr-FR')}`);
    setName('');
    location.hash = `#/h/${h.id}`;
  };

  const active = hunts?.filter((h) => !h.nest) ?? [];
  const found = hunts?.filter((h) => h.nest) ?? [];

  return (
    <div class="page">
      <header class="topbar home">
        <h1>🐝 Traque au frelon</h1>
        <SyncBadge />
      </header>
      <p class="intro">
        Localisez les nids de frelons asiatiques par triangulation : notez la direction de départ des frelons depuis vos pots sucrés, jour après jour, et la zone du nid se resserre.
      </p>

      <form class="new-hunt" onSubmit={create}>
        <input value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="Nom (ex. Rucher du moulin)" maxLength={120} />
        <button class="btn primary" type="submit">＋ Nouvelle recherche</button>
      </form>

      {hunts === null ? (
        <p class="muted">Chargement…</p>
      ) : hunts.length === 0 ? (
        <p class="muted">Aucune recherche pour l'instant. Les recherches sont partagées : celles des autres apparaîtront ici après synchronisation.</p>
      ) : (
        <>
          <HuntSection title="En cours" hunts={active} counts={counts} />
          <HuntSection title="Nids trouvés" hunts={found} counts={counts} />
        </>
      )}
    </div>
  );
}

function HuntSection({ title, hunts, counts }: { title: string; hunts: Hunt[]; counts: Map<string, number> }) {
  if (!hunts.length) return null;
  return (
    <section>
      <h2>{title}</h2>
      <ul class="hunt-list">
        {hunts.map((h) => (
          <li key={h.id}>
            <a href={`#/h/${h.id}`}>
              <span class="name">{h.nest ? '🎯 ' : ''}{h.name}</span>
              <span class="muted small">
                {counts.get(h.id) ?? 0} observation{(counts.get(h.id) ?? 0) > 1 ? 's' : ''} · mis à jour {formatDay(h.updatedAt)}
                {h.dirty ? ' · ⏳' : ''}
              </span>
            </a>
            <button type="button" class="icon" aria-label="Archiver" title="Supprimer" onClick={() => {
              if (confirm(`Supprimer « ${h.name} » pour tout le monde ?`)) void saveHunt({ ...h, deleted: true });
            }}>🗑</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
