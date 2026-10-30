# Ratings (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `rating-editor-actions.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `rating-editor-actions.js` | rating editor, what happens on a click, a key or a submit: load, save, leave, onClick, and 4 more. |
| `rating-editor-markup.js` | rating editor, markup: avatar, row, reserveHeroes, reserveRow, and 8 more. |
| `rating-editor-parts.js` | rating editor, small helpers: rise, heroOf, nameOf, rankedIn, and 4 more. |
| `rating-editor-shared.js` | The official ratings (editors): one tier list per lane, from SS to D, drawn on the same board as the tier lists (domain/tier-labels.js). |
| `rating-editor.js` | The official ratings (editors): one tier list per lane, from SS to D, drawn on the same board as the tier lists (domain/tier-labels.js). |

## Tests

- Navigateur : `node src/testing/run-e2e.mjs ratings`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
