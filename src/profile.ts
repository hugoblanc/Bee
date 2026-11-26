// Profil de l'utilisateur, gardé sur le téléphone (localStorage) : pas de
// compte, mais chaque observation est signée automatiquement avec.
export interface Profile {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

const KEY = 'bee.profile';
const SKIP_KEY = 'bee.profile.skipped';
const EMPTY: Profile = { firstName: '', lastName: '', phone: '', email: '' };

export function getProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Partial<Profile>) };
    // Ancienne version : seul un pseudo était enregistré.
    const legacy = localStorage.getItem('bee.author');
    if (legacy) return { ...EMPTY, firstName: legacy };
  } catch {
    /* ignoré */
  }
  return { ...EMPTY };
}

export function saveProfile(p: Profile) {
  const clean: Profile = {
    firstName: p.firstName.trim().slice(0, 40),
    lastName: p.lastName.trim().slice(0, 40),
    phone: p.phone.trim().slice(0, 30),
    email: p.email.trim().slice(0, 120),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    /* ignoré */
  }
}

export function displayName(p: Profile = getProfile()): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

/** Faut-il proposer l'écran de profil au démarrage ? */
export function needsOnboarding(): boolean {
  try {
    return !localStorage.getItem(KEY) && !localStorage.getItem('bee.author') && !localStorage.getItem(SKIP_KEY);
  } catch {
    return false;
  }
}

export function skipOnboarding() {
  try {
    localStorage.setItem(SKIP_KEY, '1');
  } catch {
    /* ignoré */
  }
}

/** Champs « auteur » à joindre à une observation ou à un nid. */
export function authorFields() {
  const p = getProfile();
  return { author: displayName(p), authorPhone: p.phone, authorEmail: p.email };
}
