# Home (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `home-page.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `home-actions.js` | Ce qui se passe quand on clique, tape ou envoie un formulaire. |
| `home-page.js` | The overview page: one module, downloaded when somebody opens it (app/lazy-pages.js); |
| `home-view.js` |  |

## Tests

- Unitaires : `node --test src/client/features/home`
- Navigateur : `node src/testing/run-e2e.mjs overview-layout`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
