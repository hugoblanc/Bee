import { render } from 'preact';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { App } from './app';
import { startSync } from './sync';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });
startSync();
render(<App />, document.getElementById('app')!);
