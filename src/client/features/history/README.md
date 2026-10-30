# History (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `history-page.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `export.js` |  |
| `history-actions.js` | Ce qui se passe quand on clique, tape ou envoie un formulaire. |
| `history-page.js` | The history page and the export of a series: one module, downloaded when somebody opens one of them (app/lazy-pages.js); |
| `history-view.js` |  |

## Tests

- Navigateur : `node src/testing/run-e2e.mjs export history`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
