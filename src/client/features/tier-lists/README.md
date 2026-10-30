# Tier lists (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `tier-list-page.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `tier-list-actions.js` | Ce qui se passe quand on clique, tape ou envoie un formulaire. |
| `tier-list-events.js` | What a click, a drag and the keys do on a tier list. |
| `tier-list-markup.js` | The markup of a tier list: the heroes, the bands, the reserve, the shelf, the toolbar. |
| `tier-list-page.js` | The tier lists page: one module, downloaded when somebody opens it (app/lazy-pages.js); |
| `tier-list-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `tier-list-view.js` | The tier lists page. A stage opens it (the cover of the best-ranked hero, the title, the lanes and the lists of the person as cards), then the board (one full-w |

## Tests

- Navigateur : `node src/testing/run-e2e.mjs tier-lists`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
