import { useEffect, useState } from 'preact/hooks';
import { onSyncState, syncNow, type SyncState } from '../sync';
import { SYNC_ENABLED } from '../config';

export function SyncBadge() {
  if (!SYNC_ENABLED) return null;
  return <SyncBadgeInner />;
}

function SyncBadgeInner() {
  const [s, setS] = useState<SyncState | null>(null);
  useEffect(() => onSyncState(setS), []);
  if (!s) return null;
  let label: string;
  let cls: string;
  if (!s.online) {
    label = s.pending ? `Hors ligne · ${s.pending} à envoyer` : 'Hors ligne';
    cls = 'offline';
  } else if (s.syncing) {
    label = 'Synchro…';
    cls = 'syncing';
  } else if (s.error) {
    label = s.pending ? `Erreur · ${s.pending} à envoyer` : 'Erreur de synchro';
    cls = 'error';
  } else if (s.pending) {
    label = `${s.pending} à envoyer`;
    cls = 'pending';
  } else {
    label = 'À jour';
    cls = 'ok';
  }
  return (
    <button type="button" class={`sync-badge ${cls}`} title={s.error ?? 'Synchroniser maintenant'} onClick={() => void syncNow()}>
      <span class="dot" /> {label}
    </button>
  );
}
