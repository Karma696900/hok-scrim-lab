# Series (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `series.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `policy.js` |  |
| `presenters.js` |  |
| `scrim-stats.js` | Statistics computed ONLY from the viewer's own scrims ("Your scrims"). |
| `series-draft.js` |  |
| `series-file.js` |  |
| `series-routes-game.js` | series routes, game: registerGameRoutes. |
| `series-routes-main.js` | series routes, main: registerMainRoutes. |
| `series-routes-parts.js` | series routes, small helpers: viewerId, present, mutation. |
| `series-routes-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `series-routes-teams-series.js` | series routes, teams series: seriesList, draftEdit, registerMainRoutes2, registerGameRoutes2. |
| `series-routes-teams.js` | series routes, teams: registerTeamsRoutes. |
| `series-routes.js` | Les adresses de l'API et leurs réponses. |
| `series-store-parts.js` | series store, small helpers: listSeries, countVisibleSeries, countOwnScrims, listOwnScrims, and 1 more. |
| `series-store-shared.js` | One series, looked up by its id (the viewer is the first `?`). |
| `series-store-teams-series.js` | series store, teams series: teamsOfSeries, shareSeriesWithTeam, unshareSeriesFromTeam, listTeamSeries, and 5 more. |
| `series-store.js` | Les requêtes à la base de données. |
| `series-summary.js` |  |
| `series-validation.js` |  |
| `series.js` |  |

## Tests

- Unitaires : `node --test src/server/features/series`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
