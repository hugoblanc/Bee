import { useState } from 'preact/hooks';
import { getProfile, saveProfile, skipOnboarding } from '../profile';

/** Profil (au premier lancement ou depuis l'accueil). Rien n'est obligatoire. */
export function ProfilePage({ welcome, onDone }: { welcome: boolean; onDone: () => void }) {
  const [p, setP] = useState(getProfile());
  const set = (k: keyof typeof p) => (e: Event) => setP({ ...p, [k]: (e.currentTarget as HTMLInputElement).value });

  return (
    <div class="page">
      <header class="topbar">
        {!welcome && <a href="#/" class="back" aria-label="Retour">←</a>}
        <h1>{welcome ? '🐝 Bienvenue' : 'Mon profil'}</h1>
      </header>
      <p class="intro">
        {welcome ? 'Qui êtes-vous ? Vos observations seront signées automatiquement.' : 'Vos observations sont signées avec ces informations.'}
      </p>
      <form
        class="profile-form"
        onSubmit={(e) => {
          e.preventDefault();
          saveProfile(p);
          onDone();
        }}
      >
        <label>
          Prénom
          <input value={p.firstName} onInput={set('firstName')} autocomplete="given-name" maxLength={40} />
        </label>
        <label>
          Nom
          <input value={p.lastName} onInput={set('lastName')} autocomplete="family-name" maxLength={40} />
        </label>
        <label>
          Téléphone <span class="muted">(facultatif)</span>
          <input type="tel" value={p.phone} onInput={set('phone')} autocomplete="tel" maxLength={30} />
        </label>
        <label>
          E-mail <span class="muted">(facultatif)</span>
          <input type="email" value={p.email} onInput={set('email')} autocomplete="email" maxLength={120} />
        </label>
        <p class="notice">
          🔒 Ces informations restent <b>sur ce téléphone</b> : rien n'est envoyé sur internet.
        </p>
        <button class="btn primary big wide" type="submit">{welcome ? 'Continuer' : 'Enregistrer'}</button>
        {welcome && (
          <button type="button" class="btn ghost wide" onClick={() => { skipOnboarding(); onDone(); }}>
            Plus tard
          </button>
        )}
      </form>
    </div>
  );
}
