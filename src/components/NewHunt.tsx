import { useState } from 'preact/hooks';
import type { HuntMethod } from '../types';
import { createHunt } from '../db';

/** Création d'une recherche : on choisit d'abord la méthode. */
export function NewHunt() {
  const [method, setMethod] = useState<HuntMethod | null>(null);
  const [name, setName] = useState('');

  const create = async () => {
    if (!method) return;
    const h = await createHunt(name || `Recherche du ${new Date().toLocaleDateString('fr-FR')}`, method);
    location.replace(`#/h/${h.id}`);
  };

  return (
    <div class="page">
      <header class="topbar">
        <a href="#/" class="back" aria-label="Retour">←</a>
        <h1>Nouvelle recherche</h1>
      </header>

      <h2 class="step-title">1. Comment allez-vous chercher ?</h2>
      <div class="method-cards">
        <button type="button" class={`method-card ${method === 'direction' ? 'selected' : ''}`} onClick={() => setMethod('direction')}>
          <span class="method-icon">🧭</span>
          <span class="method-name">Triangulation simple</span>
          <span class="method-desc">
            Notez la direction de départ des frelons depuis plusieurs pots, et rapprochez les pots jour après jour.
          </span>
          <span class="method-meta">Facile · aucun marquage · quelques jours</span>
        </button>
        <button type="button" class={`method-card ${method === 'chrono' ? 'selected' : ''}`} onClick={() => setMethod('chrono')}>
          <span class="method-icon">⏱</span>
          <span class="method-name">Direction + chrono</span>
          <span class="method-desc">
            Marquez un frelon et chronométrez ses allers-retours : la durée donne la distance du nid.
          </span>
          <span class="method-meta">Plus rapide · il faut marquer un frelon</span>
        </button>
      </div>
      <p class="center"><a href="#/guide">📖 Je ne sais pas laquelle choisir</a></p>

      {method && (
        <>
          <h2 class="step-title">2. Un nom (optionnel)</h2>
          <input value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="ex. Rucher du moulin" maxLength={120} />
          <button type="button" class="btn primary big wide start" onClick={create}>Commencer la recherche</button>
        </>
      )}
    </div>
  );
}
