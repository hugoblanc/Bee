import { render } from 'preact';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { App } from './app';
import { startSync } from './sync';
import { SYNC_ENABLED } from './config';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });
// Demande au navigateur de ne pas effacer les données (observations, carte en cache)
// quand l'espace manque : tout est stocké sur le téléphone.
void navigator.storage?.persist?.().catch(() => {});
if (SYNC_ENABLED) startSync();
render(<App />, document.getElementById('app')!);
