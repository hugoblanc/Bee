import { useEffect, useState } from 'preact/hooks';
import type { Hunt } from '../types';
import { listHunts, onDataChange, countObservationsByHunt, saveHunt } from '../db';
import { SyncBadge } from './SyncBadge';
import { SYNC_ENABLED } from '../config';
import { formatDay } from '../format';
import { displayName, getProfile } from '../profile';

export function HuntList() {
  const [hunts, setHunts] = useState<Hunt[] | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    const load = async () => {
      setHunts(await listHunts());
      setCounts(await countObservationsByHunt());
    };
    void load();
    return onDataChange(() => void load());
  }, []);

  const active = hunts?.filter((h) => !h.nest) ?? [];
  const found = hunts?.filter((h) => h.nest) ?? [];

  return (
    <div class="page">
      <header class="topbar home">
        <h1>🐝 Traque au frelon</h1>
        <SyncBadge />
        <a href="#/profil" class="profile-btn" aria-label="Mon profil" title={displayName() || 'Mon profil'}>
          {(getProfile().firstName[0] ?? '👤').toUpperCase()}
        </a>
      </header>
      <p class="intro">
        Localisez les nids de frelons asiatiques à partir de vos pots appâts : notez la direction de départ des frelons, et la zone du nid se resserre jour après jour.
      </p>

      <a class="btn primary big wide" href="#/nouveau">＋ Nouvelle recherche</a>
      <a class="guide-card" href="#/guide">
        <span>📖</span>
        <span>
          <b>Comment ça marche ?</b>
          <span class="muted small">Les deux méthodes expliquées pas à pas</span>
        </span>
      </a>

      {hunts === null ? (
        <p class="muted">Chargement…</p>
      ) : hunts.length === 0 ? (
        <p class="muted">Aucune recherche pour l'instant.</p>
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
              <span class="name">{h.nest ? '🎯 ' : h.method === 'chrono' ? '⏱ ' : '🧭 '}{h.name}</span>
              <span class="muted small">
                {counts.get(h.id) ?? 0} observation{(counts.get(h.id) ?? 0) > 1 ? 's' : ''} · mis à jour {formatDay(h.updatedAt)}
                {SYNC_ENABLED && h.dirty ? ' · ⏳' : ''}
              </span>
            </a>
            <button type="button" class="icon" aria-label="Archiver" title="Supprimer" onClick={() => {
              if (confirm(`Supprimer « ${h.name} » ?`)) void saveHunt({ ...h, deleted: true });
            }}>🗑</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
