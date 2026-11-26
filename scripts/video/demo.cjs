// Joue une démonstration scriptée de l'appli et capture les plans de la vidéo.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'frames');
const BASE = 'http://localhost:8787/?demo';
const shots = [];
let n = 0;

// ---- géographie de la démo ----
const R = 6371008.8, rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
function dest(p, brg, m) {
  const d = m / R, b = rad(brg), p1 = rad(p.lat), l1 = rad(p.lng);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: deg(p2), lng: deg(l2) };
}
function bearing(a, b) {
  const p1 = rad(a.lat), p2 = rad(b.lat), dl = rad(b.lng - a.lng);
  return (deg(Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl))) + 360) % 360;
}
const NEST = { lat: 45.0040, lng: 3.9030 };
const A = dest(NEST, 210, 480); // pot 1 (J1, GPS + boussole)
const B = dest(NEST, 120, 420); // pot 2 (J1, tout à la carte)
const C = dest(NEST, 255, 170); // pot 3 (J2)
const T = dest(NEST, 160, 380); // pot chrono

(async () => {
  const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost' } : undefined });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
    geolocation: { latitude: A.lat, longitude: A.lng, accuracy: 6 },
    permissions: ['geolocation', 'accelerometer', 'gyroscope', 'magnetometer'], locale: 'fr-FR',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  page.on('dialog', (d) => d.accept());

  const settle = async (ms = 1800) => {
    await page.waitForTimeout(400);
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(ms);
  };
  async function shot(title, sub, dur = 3.5) {
    const file = path.join(OUT, `s${String(++n).padStart(3, '0')}.png`);
    await page.screenshot({ path: file });
    shots.push({ file, title, sub, dur });
  }
  function card(title, sub, dur = 4) {
    shots.push({ card: true, title, sub, dur });
  }
  async function showTap(x, y) {
    await page.evaluate(([x, y]) => {
      const d = document.createElement('div');
      d.id = 'demo-tap';
      Object.assign(d.style, { position: 'fixed', left: x - 26 + 'px', top: y - 26 + 'px', width: '52px', height: '52px', borderRadius: '50%',
        border: '4px solid #fff', background: 'rgba(217,119,6,.45)', boxShadow: '0 0 0 3px rgba(0,0,0,.35)', zIndex: 99999, pointerEvents: 'none' });
      document.body.appendChild(d);
    }, [x, y]);
  }
  const hideTap = () => page.evaluate(() => document.getElementById('demo-tap')?.remove());
  async function tapSel(sel, title, sub, dur = 2.5) {
    const box = await page.locator(sel).first().boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    if (title) { await showTap(x, y); await shot(title, sub, dur); await hideTap(); }
    await page.locator(sel).first().click();
  }
  async function px(ll) {
    return page.evaluate(([lat, lng]) => {
      const m = window.__beeMap;
      const p = m.latLngToContainerPoint([lat, lng]);
      const r = m.getContainer().getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    }, [ll.lat, ll.lng]);
  }
  async function frame(points, maxZoom = 17) {
    await page.evaluate(([pts, z]) => window.__beeMap.fitBounds(pts, { padding: [50, 50], maxZoom: z }), [points.map((p) => [p.lat, p.lng]), maxZoom]);
    await settle(1200);
  }
  async function tapMap(ll, title, sub, dur = 2.8) {
    const p = await px(ll);
    if (title) { await showTap(p.x, p.y); await shot(title, sub, dur); await hideTap(); }
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
  }
  async function compassFrames(target, startOffset, title, sub) {
    const type = await page.evaluate(() => ('ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'));
    const steps = [startOffset, startOffset * 0.6, startOffset * 0.3, startOffset * 0.1, 0];
    for (let i = 0; i < steps.length; i++) {
      const h = (target + steps[i] + 360) % 360;
      await page.evaluate(([type, h]) => {
        for (let k = 0; k < 16; k++) {
          const ev = new Event(type);
          Object.assign(ev, { alpha: (360 - h) % 360, beta: 95, gamma: 1, absolute: true });
          window.dispatchEvent(ev);
        }
      }, [type, h]);
      await page.waitForTimeout(250);
      await shot(title, sub, i === steps.length - 1 ? 3 : 0.6);
    }
  }

  // ================= Intro =================
  card('Traque au frelon', 'Localiser les nids de frelons asiatiques\nà partir de vos pots appâts', 4);
  card('Le principe', 'Un frelon qui a trouvé du sucre rentre\nen ligne droite à son nid.\n\nOn note sa direction depuis plusieurs pots :\nles lignes se croisent… sur le nid.', 7);

  await page.goto(BASE);
  await settle(600);
  await page.fill('input[autocomplete=given-name]', 'Jean');
  await page.fill('input[autocomplete=family-name]', 'Martin');
  await shot('Premier lancement', 'Votre nom (téléphone et e-mail facultatifs).\nTout reste sur le téléphone, sans compte.', 4);
  await page.click('text=Continuer');
  await settle(300);
  await shot('Accueil', 'Vos recherches, et un guide\nqui explique les deux méthodes.', 3.5);

  // ================= Scénario 1 : triangulation simple =================
  await tapSel('text=＋ Nouvelle recherche');
  await settle(300);
  await shot('Deux méthodes au choix', '🧭 Triangulation simple : les directions seules\n⏱ Direction + chrono : avec un frelon marqué', 5);
  card('Scénario 1', '🧭 Triangulation simple\nPlusieurs pots, jour après jour', 3.5);
  await page.click('text=Triangulation simple');
  await page.fill('input', 'Rucher du moulin');
  await tapSel('text=Commencer la recherche', 'Créer la recherche', 'On lui donne un nom (facultatif).', 2.5);
  await page.waitForSelector('.leaflet-container');
  await page.evaluate(([lat, lng]) => window.__beeMap.setView([lat, lng], 16), [A.lat, A.lng]);
  await settle(2200);
  await shot('La carte', 'Vue aérienne par défaut : haies, bois, arbres.\nLe point bleu, c\'est vous.', 3.5);

  // --- Observation 1 : GPS + boussole + carte ---
  await tapSel('.fab-main', 'Ajouter une observation', 'Le gros bouton « ＋ Observation »,\ntoujours visible sur la carte.', 3);
  await settle(500);
  await tapSel('text=Le pot est ici (GPS)', 'Étape 1 — où est le pot ?', 'Placé à côté du pot : un appui sur le GPS.', 3);
  await settle(800);
  await shot('Étape 1 — où est le pot ?', 'Le pot 🍯 est placé à votre position.', 2.5);
  await page.click('text=Suivant →');
  await settle(400);
  const brgA = bearing(A, NEST) + 4;
  await tapSel('text=Viser avec la boussole', 'Étape 2 — la direction', 'Méthode 1 : la boussole du téléphone.', 3);
  await settle(500);
  if (await page.isVisible('.calib-anim')) {
    await shot('Première fois : le calibrage', 'Un « 8 » dans l\'air en tournant le poignet\npermet au téléphone de calibrer sa boussole.', 4);
    await page.click('text=Compris');
    await settle(300);
  }
  await compassFrames(brgA, 50, 'Viser avec la boussole', 'Téléphone tenu debout : on vise avec l\'arrière,\ndans la direction où le frelon est parti.');
  await tapSel('text=Valider ce cap', 'Viser avec la boussole', 'On valide le cap quand il est stable.', 2.5);
  await frame([A, dest(A, brgA, 300)]);
  await shot('Étape 2 — la direction', 'Le cap de la boussole s\'affiche en pointillés bleus.', 3);
  await tapMap(dest(A, brgA - 3, 260), 'Méthode 2 : toucher la carte', 'On touche la carte dans la direction du frelon\n(un arbre, une maison comme repère).', 3.5);
  await settle(300);
  await shot('Les deux se vérifient', 'Carte (orange) et boussole (bleu) d\'accord :\nla mesure est fiable.', 4);
  await page.click('text=Suivant →');
  await settle(300);
  await shot('Récapitulatif', 'Chaque ligne se touche pour corriger.', 3);
  await page.click('text=Enregistrer');
  await settle(2200);
  await shot('Une direction = une ligne', 'Le nid est quelque part sur cette ligne :\nla zone est encore large.', 4);

  // --- Observation 2 : tout à la main sur la carte ---
  card('Sans GPS ni boussole', 'Tout peut aussi se faire\nen touchant simplement la carte.', 3.5);
  await page.click('.fab-main');
  await settle(400);
  await frame([A, B, NEST], 16);
  await tapMap(B, 'Étape 1 — toucher la carte', 'On touche l\'endroit où est posé le 2ᵉ pot.', 3.5);
  await settle(300);
  await shot('Étape 1 — toucher la carte', 'Le pot 🍯 est placé.', 2.5);
  await page.click('text=Suivant →');
  await settle(300);
  const brgB = bearing(B, NEST) - 5;
  await frame([B, dest(B, brgB, 300)]);
  await tapMap(dest(B, brgB, 260), 'Étape 2 — toucher la direction', 'On touche la carte là où le frelon s\'envole.', 3.5);
  await settle(300);
  await shot('Étape 2 — toucher la direction', 'La flèche orange indique la direction.\nOn peut aussi glisser sa poignée.', 3.5);
  await page.click('text=Suivant →');
  await page.click('text=Enregistrer');
  await settle(2500);
  await shot('Deux lignes qui se croisent', 'Première zone probable ✕ :\ncercle rouge = 50 % de chances que le nid soit dedans.', 5);
  await shot('Le pot suivant', 'L\'appli propose où poser le prochain pot 🍯 :\nplus près, et décalé pour bien croiser.', 4.5);

  // --- Observation 3 : jour 2 ---
  card('Le lendemain', 'On rapproche le pot\net on recommence.', 3);
  await page.click('.fab-main');
  await settle(300);
  await frame([C, NEST, A], 17);
  await tapMap(C, null);
  await page.click('text=Suivant →');
  const brgC = bearing(C, NEST) + 3;
  await frame([C, dest(C, brgC, 200)], 17);
  await tapMap(dest(C, brgC, 170), null);
  await page.click('text=Suivant →');
  await settle(200);
  await page.click('.recap-row >> nth=3');
  const tomorrow = new Date(Date.now() + 86400000);
  const pad = (v) => String(v).padStart(2, '0');
  await page.fill('input[type=datetime-local]', `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T10:30`);
  await page.fill('textarea', '4 frelons, même direction');
  await page.click('text=Enregistrer');
  await settle(2500);
  await shot('Jour après jour, la zone se resserre', 'J1 en bleu, J2 en violet…\nIci, le nid est dans un rayon de quelques dizaines de mètres.', 5);
  // panneau : liste
  await page.evaluate(() => document.querySelector('.panel')?.scrollTo(0, 400));
  await page.waitForTimeout(300);
  await shot('L\'historique', 'Les observations, jour par jour.', 3.5);
  await tapSel('.obs-card', 'Voir une observation', 'On touche une observation\n(ou un pot sur la carte)…', 2.5);
  await settle(1200);
  await shot('La fiche', '…pour la voir en détail,\nla modifier ou la supprimer.', 4);
  await page.click('.detail .close');
  await settle(300);

  // --- Nid trouvé ---
  await page.evaluate(() => document.querySelector('.panel')?.scrollTo(0, 0));
  await tapSel('.nest-btn', 'Nid trouvé !', 'Quand on a repéré le nid…', 2.5);
  await settle(800);
  await page.evaluate(([lat, lng]) => window.__beeMap.setView([lat, lng], 18), [NEST.lat, NEST.lng]);
  await settle(1800);
  await tapMap(dest(NEST, 30, 8), 'Placer le nid', '…on touche son emplacement exact sur la photo aérienne.', 3.5);
  await page.click('text=Enregistrer le nid');
  await settle(2000);
  await page.evaluate(([lat, lng]) => window.__beeMap.setView([lat, lng], 16), [NEST.lat, NEST.lng]);
  await settle(2000);
  await shot('Nid localisé 🎯', 'L\'appli affiche l\'écart avec son estimation.\nNe pas s\'approcher : prévenir la mairie.', 5);

  // ================= Scénario 2 : chrono =================
  card('Scénario 2', '⏱ Direction + chrono\nUn frelon marqué, un chronomètre', 3.5);
  await page.goto(BASE + '#/nouveau');
  await settle(300);
  await page.click('text=Direction + chrono');
  await page.fill('input', 'Verger du haut');
  await page.click('text=Commencer la recherche');
  await page.waitForSelector('.leaflet-container');
  await ctx.setGeolocation({ latitude: T.lat, longitude: T.lng, accuracy: 5 });
  await page.evaluate(([lat, lng]) => window.__beeMap.setView([lat, lng], 16), [T.lat, T.lng]);
  await settle(2000);
  await page.click('.fab-main');
  await settle(300);
  await page.click('text=Le pot est ici (GPS)');
  await settle(600);
  await page.click('text=Suivant →');
  const brgT = bearing(T, NEST) + 2;
  await frame([T, dest(T, brgT, 250)]);
  await tapMap(dest(T, brgT, 220), 'Même début', 'Position du pot, puis direction de départ\n(boussole ou carte).', 3);
  await page.click('text=Suivant →');
  await settle(300);
  await shot('Étape 3 — le chrono', 'Pendant qu\'il mange, on marque le frelon\nd\'un point de peinture.', 4);
  await tapSel('text=Départ du frelon', 'Étape 3 — le chrono', '« Départ » quand le frelon marqué quitte le pot…', 3);
  await page.waitForTimeout(2300);
  await shot('Étape 3 — le chrono', '…le chronomètre tourne…', 2);
  await page.click('text=Annuler');
  await page.fill('.manual input[placeholder=min]', '3');
  await page.fill('.manual input[placeholder=s]', '50');
  await page.click('.manual button');
  await page.fill('.manual input[placeholder=min]', '4');
  await page.fill('.manual input[placeholder=s]', '10');
  await page.click('.manual button');
  await shot('Étape 3 — le chrono', '…« Retour » quand il revient au pot.\nPlusieurs tours : l\'appli garde la médiane.\nRepère : 1 min d\'aller-retour ≈ 100 m.', 5.5);
  await page.click('text=Suivant →');
  await page.click('text=Enregistrer');
  await settle(2500);
  await shot('Une seule station suffit', 'Direction + distance : la zone apparaît\ndès la première observation.', 5);

  // ================= Fin =================
  await page.goto(BASE + '#/guide');
  await settle(400);
  await shot('Le guide intégré', 'Matériel, méthodes pas à pas,\nconseils pour bien viser, sécurité.', 4);
  card('Partout, même sans réseau', 'Les données restent sur le téléphone.\nL\'appli et la carte déjà vue marchent hors ligne.\n\nAstuce : « Ajouter à l\'écran d\'accueil »\npour l\'avoir comme une vraie appli.', 6);
  card('Traque au frelon', 'bee-ten-silk.vercel.app\n\nVersion 1 — à tester sur le terrain !', 5);

  fs.writeFileSync(path.join(__dirname, 'shots.json'), JSON.stringify(shots, null, 1));
  console.log('shots:', shots.length, 'total seconds:', shots.reduce((a, s) => a + s.dur, 0).toFixed(1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
