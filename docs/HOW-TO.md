# Comment modifier le site

Chaque recette dit **quel fichier toucher** et **quelle commande prouve que ça marche**. Avant de commencer : `docs/PAGE-ANATOMY.md` explique comment une page est découpée (un fichier = un rôle), et chaque dossier de `src/client/features/` et `src/server/features/` a un `README.md` qui liste ses fichiers.

Les commandes se lancent à la racine du projet. Les trois qui servent tout le temps :

| Commande | Ce qu'elle vérifie |
|---|---|
| `npm run lint` | le code est propre et formaté (ESLint + Prettier) ; `npx prettier --write <fichier>` reformate |
| `node --test <dossier ou fichier>` | les tests unitaires de ce dossier |
| `node src/testing/run-e2e.mjs <nom> <nom>…` | les scénarios dans un vrai navigateur (le nom est celui du fichier `<nom>.e2e.mjs`) |

## Changer un texte, ajouter un texte et ses 15 traductions

1. Écrire le texte en anglais dans le code : `t("My new text")` (côté navigateur) ou `message(…)` (côté serveur). Ce texte anglais **est** la clé.
2. `node scripts/i18n/sync.mjs` : donne un numéro à la nouvelle clé (`src/translations/keys.tsv`) et reconstruit les catalogues.
3. Ajouter les traductions : écrire un petit fichier JSON `{ "My new text": { "fr": "Mon nouveau texte", "es": "…" } }` puis `node scripts/i18n/add.mjs ce-fichier.json`, puis relancer le `sync`. Une langue qui manque retombe sur l'anglais.
4. Vérifier : `node --test src/shared/i18n.test.js` (toute clé du code est dans tous les catalogues, avec les mêmes `{variables}`).

Changer le texte **anglais** d'une phrase change sa clé : il faut alors retraduire (ou renommer la clé dans `keys.tsv` et dans les 15 fichiers de `src/translations/`).

## Changer une couleur

Les couleurs viennent de variables CSS nommées par rôle dans `src/client/styles/base/tokens.css` (une section par thème, clair et sombre). Changer la valeur de la variable change tous les endroits qui s'en servent. Vérifier : `node src/testing/run-e2e.mjs contrast` (le contraste de chaque texte reste conforme AA, dans les deux thèmes).

Une couleur écrite en dur dans une feuille de `styles/pages/` ne suit pas le thème : préférer une variable.

## Ajouter un bouton à une page

Exemple : un bouton « Dupliquer » sur la page d'une équipe.

1. **Le dessiner** : dans le fichier de HTML de la zone (`team-roster-panel.js`, `team-agenda-panel.js`…), ajouter `<button type="button" class="btn" data-action="team-copy">${t("Duplicate")}</button>`. Un bouton ne porte jamais de style en ligne (la politique de sécurité du site l'interdit) : on utilise une classe.
2. **Lui donner un effet** : dans le fichier d'actions de la page (`team-page-actions.js`), `onAction("team-copy", button => { … })`. Pour une page chargée à la demande, ajouter aussi le nom `"team-copy"` à la liste de `src/client/app/lazy-actions.js` : sans cela, le premier clic arrive avant que la page soit chargée.
3. **Le prouver** : ajouter une étape au scénario `teams.e2e.mjs` (cliquer, vérifier le résultat), puis `node src/testing/run-e2e.mjs teams`.
4. Si le HTML change, `UPDATE_SNAPSHOTS=1 node --test src/client/features/teams/team-view.test.js` réécrit les instantanés ; relire le changement dans `snapshots/` avant de le garder.

## Ajouter une page

1. **L'adresse** : une ligne dans `src/shared/routes.js` (nom de la vue, chemin, titre, indexable ou non). C'est ce fichier que lisent à la fois le serveur (titre, `robots`, plan du site) et le navigateur.
2. **La page** : un dossier `src/client/features/<nom>/` avec au minimum `<nom>-page.js` (qui assemble) et un fichier de HTML ; suivre `docs/PAGE-ANATOMY.md`.
3. **Le chargement** : si la page est lourde, la déclarer dans `src/client/app/lazy-pages.js` (chargée à la demande) et dans la table `src/client/app/lazy-views.js` (quelle vue ouvre quelle page) ; le test `src/shared/view-modules.test.js` vérifie que chaque vue a son module.
4. **Le dessin serveur** : une page publique est aussi dessinée par le serveur (`src/server/platform/http/page-handler.js`, `prerender.js`, `first-paint.js`) ; `node --test src/server/platform/http` et `node src/testing/run-e2e.mjs ssr first-paint` le contrôlent.
5. Un `README.md` dans le dossier (le test d'architecture l'exige).

## Ajouter une route d'API

1. **La route** : dans le fichier `<nom>-routes.js` de la tranche (`src/server/features/<nom>/`), `router.post("/…", wrap(async (request, response) => { const user = await identity.ensureUser(request, response); … }))` (`wrap` attrape les erreurs, `identity.ensureUser` dit qui appelle). La vérification des données est faite par le fichier `*-domain.js` de la tranche (pas dans la route).
2. **Qui a le droit** : `node --test src/server/route-access.test.js` appelle chaque route en visiteur, en compte, en contributeur et en administrateur, et échoue tant que la nouvelle route n'est pas classée dans `EXPECTED` de ce fichier (avec le motif). `node scripts/dev/route-matrix.mjs` affiche la matrice.
3. **Les requêtes** : dans `<nom>-store.js`, jamais de SQL dans une route.
4. **Le prouver** : un test `*.test.js` à côté du fichier, qui appelle la route par `startTestServer` (`src/testing/test-app.js`).

## Ajouter une colonne ou une table en base

1. Créer `src/server/platform/database/migrations/<numéro suivant>-<nom>.js` sur le modèle de la dernière (`export default { version, name, async up(connection) { … } }`). Une migration **ajoute** : elle ne supprime et ne renomme jamais.
2. `node --test src/server/platform/database/migrations/migrations.test.js` rejoue toutes les migrations sur une base vide.
3. Avant de l'appliquer sur les données du propriétaire : `scripts/database/backup-mysql.ps1` (sauvegarde), puis redémarrer le serveur (il applique les migrations au démarrage).

## Ajouter un test

- **Une règle de calcul ou de validation** : `<nom>.test.js` à côté du fichier, avec `node:test` (`describe`/`test`) et `node:assert/strict`.
- **Le HTML d'une page** : sur le modèle de `src/client/features/teams/team-view.test.js` (faux document dans `src/testing/fake-dom.js`, instantané dans `snapshots/`).
- **Un parcours dans le navigateur** : `<nom>.e2e.mjs` à côté de la page ; `node src/testing/run-e2e.mjs <nom>`. Les scripts d'un même dossier se lancent par lots de cinq au plus (la machine n'aime pas plus).

## Garder les fichiers lisibles

`src/architecture.test.js` échoue si un fichier dépasse 400 lignes, une fonction 120 lignes ou une feuille de style 600 lignes. `src/architecture-limits.json` liste les dépassements restants, à leur taille exacte : ils ne peuvent que baisser. Quand tu réduis un fichier listé, `node scripts/dev/architecture-limits.mjs` met le fichier à jour ; quand un fichier n'est plus un cas particulier, la ligne disparaît.
