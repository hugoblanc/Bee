# 🐝 Traque au frelon

PWA collaborative pour **localiser les nids de frelons asiatiques par triangulation**.

Le principe : on pose des pots sucrés, on note la **direction** dans laquelle les frelons repartent (ils rentrent en ligne droite au nid), et éventuellement la **durée d'un aller-retour** d'un frelon marqué. En croisant les directions de plusieurs pots, jour après jour, la zone probable du nid se resserre.

## Fonctionnalités

- **Recherches partagées, sans compte** : tout le monde voit et complète les mêmes recherches (pseudo libre, optionnel).
- **Saisie d'une observation**
  - position du pot : GPS ou marqueur 🍯 à déplacer ;
  - direction : **flèche sur la carte** (toucher la carte ou glisser la poignée) **et/ou boussole du téléphone**. Si les deux sont saisies, l'écart est affiché (✓ si < 20°) et la moyenne est retenue ;
  - **chrono aller-retour optionnel** : boutons *Départ / Retour*, plusieurs tours possibles (médiane retenue), ou saisie manuelle ;
  - date/heure modifiable, note libre.
- **Estimation** : carte de probabilité (🔥), position la plus probable ✕, rayon des zones à 50 % et 90 %, distance et direction depuis votre position.
- **Prochain pot conseillé** 🍯 : avancer vers la zone en se décalant sur le côté, pour mieux croiser les directions.
- **Suivi par jour** (J1, J2, …) avec une couleur par jour.
- **Nid trouvé** 🎯 : on place l'emplacement exact, et l'app affiche l'écart avec l'estimation.
- **Mode déconnecté** : tout est enregistré localement (IndexedDB) puis synchronisé quand le réseau revient. L'application et les tuiles de carte déjà vues restent disponibles hors ligne.
- Fonds de carte : Plan IGN, **photo aérienne IGN** (utile pour repérer l'arbre), OpenStreetMap.

## Le calcul

Voir `src/estimate.ts`. Pour chaque cellule d'une grille autour des pots, on calcule la vraisemblance que le nid s'y trouve :

| Élément | Modèle |
| --- | --- |
| Direction | loi de von Mises autour du cap mesuré ; ± 12° si carte et boussole concordent, ± 18° pour une seule mesure, ± 22° si elles divergent |
| Aller-retour | distance ≈ **100 m par minute d'aller-retour** (paramètre `metersPerMinute`, à calibrer localement), incertitude log-normale large |
| Observation fausse | 10 % de chance qu'une observation soit aberrante (frelon d'un autre nid, erreur) : elle ne peut pas fausser l'estimation à elle seule |
| A priori | le nid est rarement à plus de ~1 km des pots |

Les tests (`npm test`) vérifient la convergence sur des scénarios simulés : 2 directions croisées, chrono seul, 5 observations bruitées sur plusieurs jours, et une observation aberrante.

> La boussole donne un cap magnétique. La déclinaison en France (~ +1 à +3°) est négligée : c'est bien moins que la précision d'une boussole de téléphone.

## Développement

Il faut Node ≥ 22.13 (SQLite intégré à Node).

```bash
npm install
npm run dev        # API sur :8787 + Vite sur :5173 (proxy /api)
npm test           # tests de l'algorithme
npm run build      # compile la PWA dans dist/
npm start          # sert dist/ + l'API sur :8787 (PORT, DB_PATH configurables)
```

La boussole et la géolocalisation demandent du **HTTPS** sur téléphone (sauf `localhost`).

## Architecture

```
src/
  estimate.ts        calcul de la zone probable du nid (pur, testé)
  geo.ts             projection locale, caps, distances
  db.ts              stockage local IndexedDB
  sync.ts            synchronisation (envoi des modifs + récupération par révision)
  compass.ts         boussole (iOS webkitCompassHeading / Android deviceorientationabsolute)
  components/        interface Preact (liste, carte, formulaires, chrono, boussole)
server/index.mjs     serveur Node sans dépendance : API /api/sync + fichiers statiques, SQLite
```

**Synchronisation** : chaque enregistrement a un identifiant généré sur le téléphone et un `updatedAt`. Le serveur garde la version la plus récente et attribue un numéro de révision croissant. Chaque client envoie ce qu'il a modifié et récupère tout ce qui a changé depuis sa dernière révision. Les suppressions sont « douces » (`deleted: true`).

## Déploiement

```bash
docker build -t traque-frelon .
docker run -p 8787:8787 -v traque-data:/data traque-frelon
```

À placer derrière un reverse proxy HTTPS (Caddy, Traefik, l'offre d'un hébergeur…). Toute plateforme qui fait tourner un conteneur avec un volume persistant convient : Fly.io, Railway, Render, un petit VPS…

## Pistes pour la suite

- Modération : historique des modifications, restauration des éléments supprimés, limitation du débit.
- Calibration automatique de la vitesse (m/min) à partir des nids trouvés.
- Couleur de marquage par frelon, pour distinguer plusieurs nids depuis un même pot.
- Export / signalement vers les plateformes officielles.
