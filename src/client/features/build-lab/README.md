# Build lab (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `build-lab-page.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `build-lab-actions.js` | What happens when a person clicks, changes, types or submits. |
| `build-lab-keep.js` | Choosing a hero, keeping a build, loading a kept build, copying the address. |
| `build-lab-markup.js` | The markup of the lab: the hero, the kept builds, the sheet, the dock, the catalog. |
| `build-lab-page.js` | The build lab: anybody (no account) picks a hero, a level, items, arcana and spells, and sees the stats the build gives, the details of each piece and whether it suits the hero according to the tags. |
| `build-lab-parts.js` | Small helpers of the build lab: the heroes, the address of a build, what is remembered. |
| `build-lab-shared.js` | A browser that keeps nothing (storage disabled): the builds are simply not kept. |
| `build-lab-tips.js` | What is said when a piece is looked at. |
| `build-lab-view.js` | How a build looks: pictures in slots, the details of a piece, and the stats it gives. |
| `saved.js` | The builds a person keeps from the build lab, in their own browser: no account, several per hero. |
| `workbench-actions.js` | A click and the search box. |
| `workbench-build.js` | The build being edited: the index of the catalog, setting the build, what can be added. |
| `workbench-cards.js` | The cards of the build: its slots, its arcana, the details of a piece. |
| `workbench-picker.js` | The pieces to add: the grid, the categories, the bar above. |
| `workbench.js` | What the build lab and the builds editor both draw and handle: the build itself (the items in their slots, the arcana by colour), the pieces to add it from and the details of a piece. |

## Tests

- Unitaires : `node --test src/client/features/build-lab`
- Navigateur : `node src/testing/run-e2e.mjs build-lab`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
