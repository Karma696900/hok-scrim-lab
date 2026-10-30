# Teams (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `team-page.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `form.js` | The form of a team (create it, edit it): one column of labelled fields on the left, and on the right the banner the team will have, which follows what is typed (the mark and its colour come from th… |
| `team-admin-panels.js` | Discord and Settings tabs (the staff only). |
| `team-agenda-panel.js` | Agenda tab: the events of the team (or the windows it made public) and the form of an event. |
| `team-list-actions.js` | team list, what happens on a click, a key or a submit: actionsOf. |
| `team-list-list.js` | team list, list: filters, paintFigures, loadGrid, enrichMine, and 3 more. |
| `team-list-parts.js` | team list, small helpers: signedIn. |
| `team-list-pieces.js` | team list, pieces: teamCard, mineCard, invitationRow, chips, and 4 more. |
| `team-list.js` | The teams page. Wireframe: 1. the stage: a hero cover, the title, three big numbers (teams, members, open announcements), the actions; 2. the invitations that w |
| `team-load.js` | What the page of a team asks the server for once it knows who looks at it: the agenda for everybody, the rest only for the people who may see it. |
| `team-overview-panel.js` | Overview tab: the five lanes with who plays them, the next events, the facts and the staff. |
| `team-page-actions.js` | team page, what happens on a click, a key or a submit: onClick, onChange, onInput, formsOf, and 1 more. |
| `team-page-parts.js` | team page, small helpers: ctxOf, team, address, reload, and 5 more. |
| `team-page.js` | Community: the teams list, a team's page (overview, roster, agenda, series, training, Discord, settings) and everything its staff can do there. |
| `team-panels.js` | The tabs of the page of a team and the HTML around them. |
| `team-roster-panel.js` | Roster tab: one tall card per player and, for the staff, the invitations. |
| `team-series-panel.js` | Series tab: the series shared with the team, its record and the series that can be added. |
| `team-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `team-stage.js` | The top of the page of a team: the cover under the colour of the team, its name, the figures and the actions. |
| `team-view.js` | The page of a team. Wireframe: 1. the stage: the cover of a hero under the colour of the team, its mark (large), the name (64 px), the facts, the actions of the |
| `training-parts.js` | training, small helpers: address, options, goalForm, progressTable, and 7 more. |
| `training.js` | The training of a team: what its staff (the owner, the managers, the coaches) asks of the players each day or each week, and how far each player is in the period that is running. |

## Tests

- Unitaires : `node --test src/client/features/teams`
- Navigateur : `node src/testing/run-e2e.mjs discord-team series-teams teams`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
