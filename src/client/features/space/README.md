# Space (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `space-page.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `space-columns.js` | space page, columns same: partHead, itemsHtml, explainHtml, tierListsPart, and 5 more. |
| `space-link-page.js` | space page, small helpers: heroOf, heroName, portrait, showShared. |
| `space-owner-actions.js` | space page (owner), what happens on a click, a key or a submit: onSubmit, onClick. |
| `space-owner-markup.js` | space page (owner), page owner: stage, linkRow, shareBand, paint. |
| `space-owner-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `space-owner.js` | space page, page owner: show. |
| `space-page-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `space-page.js` | The personal space, and the page that a link to it opens. |

## Tests

- Navigateur : `node src/testing/run-e2e.mjs space`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
