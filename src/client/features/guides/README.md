# Guides (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `combos-actions.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `combos-actions.js` | combos, what happens on a click, a key or a submit: open, save, remove, reorder, and 2 more. |
| `checks-markup.js` | The rules of a guides editor, one line each (builds and combos). |
| `combos-markup.js` | combos, markup: checksHtml, stepsHtml, formHtml, skillsHtml, and 1 more. |
| `combos-parts.js` | combos, small helpers: address, checks, canSave, move. |
| `combos.js` | The combos editor of the guides page: the combos of the chosen hero, as many as the editors want, in the order they chose. |
| `guide-actions.js` | What happens when a person clicks or types on the page. |
| `guide-editor.js` | The guides editor: what the page of each hero shows besides the game's own data, the recommended builds (two at most) and the combos (as many as wanted). |
| `guide-list.js` | The list of heroes on the left, and what is on the right when no hero is chosen. |
| `guide-open.js` | Opening a hero and a build, saving, removing, changing the section. |
| `guide-paint.js` | Writing the guide page into the document. |
| `guide-parts.js` | What the guide page asks about the heroes and the builds: counts, checks, whether a build can be saved. |
| `guide-shared.js` | The guides editor: what the page of each hero shows besides the game's own data, the recommended builds (two at most) and the combos (as many as wanted). |
| `guide-sheet.js` | The hero that is open: its head, its builds, its notes. |
| `guide-stage.js` | The stage of the guide page: what is written, and how far it is. |

## Tests

- Navigateur : `node src/testing/run-e2e.mjs combos guides`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
