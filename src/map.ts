import L from 'leaflet';
import type { ProbabilityGrid } from './estimate';

export function createMap(el: HTMLElement): L.Map {
  const map = L.map(el, { zoomControl: false, attributionControl: true }).setView([46.6, 2.4], 6);
  const ign = (layer: string, format: string, maxZoom: number) =>
    L.tileLayer(
      `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=${format}`,
      { maxZoom: 20, maxNativeZoom: maxZoom, attribution: '© IGN' },
    );
  const layers = {
    'Plan IGN': ign('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png', 19),
    'Photo aérienne': ign('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg', 19),
    OpenStreetMap: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      maxNativeZoom: 19,
      attribution: '© OpenStreetMap',
    }),
  };
  let saved = 'Plan IGN';
  try {
    saved = localStorage.getItem('bee.layer') ?? saved;
  } catch {
    /* ignoré */
  }
  (layers[saved as keyof typeof layers] ?? layers['Plan IGN']).addTo(map);
  L.control.layers(layers, undefined, { position: 'topright' }).addTo(map);
  L.control.scale({ imperial: false, position: 'topleft' }).addTo(map);
  map.on('baselayerchange', (e: L.LayersControlEvent) => {
    try {
      localStorage.setItem('bee.layer', e.name);
    } catch {
      /* ignoré */
    }
  });
  return map;
}

/** Couleurs des jours de recherche (J1, J2, …). */
export const DAY_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#ca8a04'];
export function dayColor(dayIndex: number) {
  return DAY_COLORS[dayIndex % DAY_COLORS.length];
}

export function dotIcon(color: string, label?: string, size = 22): L.DivIcon {
  return L.divIcon({
    className: 'bee-dot',
    html: `<span style="background:${color};width:${size}px;height:${size}px">${label ?? ''}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function arrowHeadIcon(color: string, bearing: number): L.DivIcon {
  return L.divIcon({
    className: 'bee-arrowhead',
    html: `<svg viewBox="0 0 20 20" width="20" height="20" style="transform:rotate(${bearing}deg)"><path d="M10 1 L18 18 L10 13 L2 18 Z" fill="${color}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

export const nestIcon = L.divIcon({
  className: 'bee-nest',
  html: '<span>🎯</span>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

/** Rend la grille de probabilité en image semi-transparente (jaune → rouge). */
export function gridToImage(grid: ProbabilityGrid): string {
  const canvas = document.createElement('canvas');
  canvas.width = grid.cols;
  canvas.height = grid.rows;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(grid.cols, grid.rows);
  for (let i = 0; i < grid.values.length; i++) {
    const t = Math.sqrt(grid.values[i] / grid.max); // racine : rend visibles les zones étendues
    if (t < 0.08) continue;
    // Dégradé jaune (255,220,0) → rouge (220,20,20)
    img.data[i * 4] = 255 - 35 * t;
    img.data[i * 4 + 1] = 220 - 200 * t;
    img.data[i * 4 + 2] = 20 * (1 - t);
    img.data[i * 4 + 3] = Math.round(40 + 170 * t);
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}
