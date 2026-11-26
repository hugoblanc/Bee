// Synchronisation entre appareils (serveur + base de données).
// Désactivée pour la première version : tout reste sur le téléphone.
// Pour la réactiver (version 2), compiler avec VITE_SYNC=true et configurer
// la base (voir README).
export const SYNC_ENABLED = import.meta.env.VITE_SYNC === 'true';
