# Tournaments (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `popular-routes.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `competitive-import.js` |  |
| `popular-routes.js` | Les adresses de l'API et leurs réponses. |
| `popular.js` | What the tournament games say about the drafts and the heroes that are played most and that win most. |
| `tournament-domain-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `tournament-domain.js` | Les règles métier, sans accès à la base. |
| `tournament-game-parser.js` | Reading one game of a series: its picks, bans and lanes. |
| `tournament-routes-competitive-imports-main.js` | tournament routes, competitive imports main: registerCompetitiveImportsMainRoutes. |
| `tournament-routes-main.js` | tournament routes, main: registerMainRoutes. |
| `tournament-routes-parts.js` | tournament routes, small helpers: pageOf, account, heroIds, flowbornIds. |
| `tournament-routes-tournaments.js` | tournament routes, tournaments: registerTournamentsRoutes. |
| `tournament-routes.js` | Les adresses de l'API et leurs réponses. |
| `tournament-stats.js` | Statistics read from tournament series: pairings, the order of the picks, a hero in tournaments. |
| `tournament-store-competitive-imports.js` | tournament store, competitive imports: createCompetitiveImport, listCompetitiveImports, deleteCompetitiveImport, getHeroCompetitive. |
| `tournament-store-parse.js` | tournament store, parse: parse, forget, gameRow, presentGame, and 9 more. |
| `tournament-store-tournament-suggestions.js` | tournament store, tournament suggestions: tournamentSuggestions, competitiveGames, competitiveSummary, rememberCompetitive. |
| `tournament-store.js` | Les requêtes à la base de données. |
| `tournament-validation.js` |  |

## Tests

- Unitaires : `node --test src/server/features/tournaments`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
