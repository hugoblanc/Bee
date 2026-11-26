/** Guide : les deux méthodes, pas à pas. Lisible sur mobile comme sur ordinateur. */
export function Guide() {
  return (
    <div class="page guide">
      <header class="topbar">
        <a href={history.length > 1 ? 'javascript:history.back()' : '#/'} class="back" aria-label="Retour" onClick={(e) => {
          if (history.length > 1) {
            e.preventDefault();
            history.back();
          }
        }}>←</a>
        <h1>Guide</h1>
      </header>

      <article>
        <p class="lead">
          Un frelon asiatique qui a trouvé du sucre rentre <b>en ligne droite</b> à son nid. En notant la direction de son départ depuis
          plusieurs endroits, les lignes se croisent… sur le nid.
        </p>

        <h2>Le matériel</h2>
        <ul>
          <li>Un ou plusieurs <b>pots appâts</b> ouverts avec un liquide sucré (sirop, miel dilué, jus de fruit fermenté) : le frelon doit pouvoir repartir.</li>
          <li>Ce téléphone, avec la localisation activée.</li>
          <li>Pour la méthode chrono : de quoi <b>marquer</b> un frelon (petit point de peinture ou de correcteur sur le thorax pendant qu'il se nourrit) et un peu de patience.</li>
        </ul>

        <div class="guide-methods">
          <section>
            <h2>🧭 Triangulation simple</h2>
            <p class="muted">Facile, sans marquage. Compter quelques jours.</p>
            <ol>
              <li><b>Posez un pot</b> là où vous voyez des frelons (près du rucher).</li>
              <li>Quand un frelon repart, observez la direction qu'il prend une fois qu'il a pris de la hauteur, et <b>enregistrez une observation</b> : position du pot puis direction.</li>
              <li><b>Posez un 2ᵉ pot</b> à 200–300 m sur le côté de la première ligne et recommencez : le croisement des deux lignes donne une première zone.</li>
              <li>Les jours suivants, <b>avancez les pots</b> vers la zone ✕ indiquée par l'appli, en restant décalé sur le côté (l'appli propose un emplacement 🍯).</li>
              <li>La zone rétrécit à chaque observation. Quand elle fait quelques dizaines de mètres, cherchez le nid en hauteur dans les arbres.</li>
            </ol>
            <p class="tip">Plusieurs frelons qui partent dans la même direction = mesure fiable. Un frelon qui part ailleurs vient peut-être d'un autre nid : l'appli sait ignorer une observation isolée.</p>
          </section>

          <section>
            <h2>⏱ Direction + chrono</h2>
            <p class="muted">Plus rapide : une seule station donne déjà une zone.</p>
            <ol>
              <li>Pendant qu'un frelon se nourrit, <b>marquez-le</b> d'un point de couleur.</li>
              <li>Notez sa <b>direction</b> de départ, comme en triangulation simple.</li>
              <li>Lancez le <b>chrono au départ</b>, arrêtez-le à son <b>retour</b> au pot. Refaites-le 2 ou 3 fois : l'appli garde la médiane.</li>
              <li>Repère : <b>1 minute d'aller-retour ≈ 100 m</b> jusqu'au nid (le frelon reste aussi un moment au nid, c'est approximatif).</li>
              <li>Déplacez le pot dans la direction indiquée et recommencez : la durée doit diminuer à mesure que vous approchez.</li>
            </ol>
            <p class="tip">Vous pouvez aussi ajouter un chrono ponctuellement dans une recherche en triangulation simple.</p>
          </section>
        </div>

        <h2>Bien mesurer la direction</h2>
        <ul>
          <li><b>Sur la carte</b> : touchez la carte dans la direction de départ. Facile si vous avez un repère (arbre, maison, pylône).</li>
          <li><b>Avec la boussole</b> : téléphone <b>à plat</b>, visez avec le haut ; ou téléphone <b>debout</b> (comme pour une photo), visez avec l'arrière.</li>
          <li>Faire les deux, c'est l'idéal : l'appli vérifie qu'ils concordent (moins de 20° d'écart).</li>
          <li>Si la boussole semble fausse : faites quelques <b>« 8 » dans l'air</b> avec le téléphone pour la calibrer, et éloignez-vous des voitures, clôtures et objets métalliques.</li>
        </ul>

        <h2>Vos données</h2>
        <p>
          Tout est enregistré <b>sur ce téléphone</b>, sans compte et sans connexion nécessaire : l'appli fonctionne aussi en pleine
          campagne sans réseau (pensez à afficher la carte de la zone une fois avant de partir, pour qu'elle reste disponible).
        </p>

        <h2>⚠️ Sécurité</h2>
        <p>
          Ne vous approchez pas du nid et n'essayez pas de le détruire vous-même : les frelons asiatiques défendent leur nid violemment.
          Une fois le nid localisé, placez-le dans l'appli et <b>signalez-le à votre mairie</b> ou à un désinsectiseur.
        </p>

        <p class="center"><a href="#/nouveau" class="btn primary big">Commencer une recherche</a></p>
      </article>
    </div>
  );
}
