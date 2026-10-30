# Tournaments (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `tournament-page.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `tournament-actions.js` | What happens when a person acts on the page: clicks, typing, keys, submit. |
| `tournament-drag.js` | Sliding a lane onto a hero (clicking a logo, then a hero, does the same without a pointer drag). |
| `tournament-editor.js` | The editor of a series: its fields, its body for the server, saving, picking a hero. |
| `tournament-game.js` | One game of the editor: the picks and bans, the lane of each pick, the hero picker, the matchups. |
| `tournament-lanes.js` | The lane each pick was played in: setting it, sliding it, and proposing the lanes the heroes usually play. |
| `tournament-list.js` | The list: figures on the stage, a table, a page of series, the summary by event. |
| `tournament-model.js` | The model of a series in the Tournaments page: the rules and the reliability labels, an empty game or series, a series as the server returns it turned into the shape the editor works on (and back),… |
| `tournament-page.js` | The Tournaments page (administrators): enter the real series that were played, as fast as possible. |
| `tournament-parts.js` | Small helpers of the page: the heroes, the names of the teams, the order of the slots. |

## Tests

- Navigateur : `node src/testing/run-e2e.mjs tournament-lanes tournament-suggest tournaments`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
