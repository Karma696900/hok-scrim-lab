# Gamedata (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `gamedata-page.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `gamedata-page-actions.js` | gamedata page, what happens on a click, a key or a submit: onClick, onInput. |
| `gamedata-page-markup.js` | gamedata page, markup: tile, group, filters, resultHead, and 12 more. |
| `gamedata-page-parts.js` | gamedata page, small helpers: kindOf, all, nameOf, matches, and 4 more. |
| `gamedata-page-shared.js` | The three pages of the data of the game: /items, /arcana and /spells. |
| `gamedata-page.js` | The three pages of the data of the game: /items, /arcana and /spells. |

## Tests

- Navigateur : `node src/testing/run-e2e.mjs gamedata`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
