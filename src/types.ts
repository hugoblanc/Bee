export interface Nest {
  lat: number;
  lng: number;
  foundAt: number;
  note: string;
  author: string;
  authorPhone?: string;
  authorEmail?: string;
}

/**
 * Méthode de recherche :
 * - direction : triangulation simple (directions de départ depuis plusieurs pots) ;
 * - chrono : triangulation + chronométrage des allers-retours d'un frelon marqué.
 */
export type HuntMethod = 'direction' | 'chrono';

export interface Hunt {
  id: string;
  name: string;
  method: HuntMethod;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  nest: Nest | null;
  /** 1 = modifié localement, pas encore envoyé au serveur. */
  dirty?: 0 | 1;
}

export interface Observation {
  id: string;
  huntId: string;
  /** Position du pot. */
  lat: number;
  lng: number;
  /** Précision GPS (m) au moment de la saisie, si connue. */
  accuracy: number | null;
  /** Cap retenu (nord géographique, degrés). */
  bearing: number;
  /** Cap saisi sur la carte (flèche). */
  mapBearing: number | null;
  /** Cap mesuré avec la boussole du téléphone. */
  compassBearing: number | null;
  /** Durée retenue (médiane des allers-retours chronométrés), en secondes. */
  roundTripSeconds: number | null;
  roundTrips: number[];
  observedAt: number;
  updatedAt: number;
  /** Prénom et nom de l'auteur (profil du téléphone). */
  author: string;
  authorPhone?: string;
  authorEmail?: string;
  note: string;
  deleted: boolean;
  dirty?: 0 | 1;
}
