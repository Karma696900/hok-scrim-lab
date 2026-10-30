# Scrims (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `scrims-page.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `board-details.js` | What the games said: the details of a series, game by game. |
| `board-markup.js` | The markup of the series board: the frame, the band, the stage, the roster, the lobby. |
| `board.js` |  |
| `import.js` |  |
| `new-series.js` |  |
| `rows.js` |  |
| `scene.js` | The stage that opens the pages of the scrims family (Scrims, History): two real hero covers, one under the blue veil and one under the red one, cut by a diagonal, then the title, the big numbers an… |
| `scrim-actions-parts.js` | scrim actions, small helpers: showForm, showMode. |
| `scrim-actions.js` | Ce qui se passe quand on clique, tape ou envoie un formulaire. |
| `scrim-draft.js` |  |
| `scrim-list.js` |  |
| `scrim-summary.js` | What a series says about itself, beside its games: who leads (a ring), how long its games last and the heroes that came back the most. |
| `scrims-page.js` | The scrims pages (the list of series, the board of a series, its draft room): one module, downloaded when somebody opens one of them or presses one of their buttons (app/lazy-pages.js); |
| `teams.js` | Sharing a series with a team: the creator who leads a team (owner, manager or coach) puts the series on it, and the members of the team then read it (read only). |

## Tests

- Pas de test propre à ce dossier : il est couvert par les tests des pages qui l'utilisent (`npm test`).
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
