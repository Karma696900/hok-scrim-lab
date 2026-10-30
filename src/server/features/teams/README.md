# Teams (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `team-routes.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `team-domain.js` | Les règles métier, sans accès à la base. |
| `team-routes-agenda-team.js` | team routes, agenda team: registerTeamsRoutes2. |
| `team-routes-parts.js` | team routes, small helpers: managed, answer, scheduler. |
| `team-routes-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `team-routes-teams-invitations.js` | team routes, teams invitations: registerTeamsInvitationsRoutes. |
| `team-routes-teams-me.js` | team routes, teams me: registerTeamsMeRoutes. |
| `team-routes-teams.js` | team routes, teams: registerTeamsRoutes. |
| `team-routes.js` | Les adresses de l'API et leurs réponses. |
| `team-store-agenda.js` | team store, agenda: listEvents, createEvent, updateEvent, deleteEvent, and 2 more. |
| `team-store-parse.js` | team store, parse: parse, present, person, escapeLike, and 7 more. |
| `team-store-save-team-logo.js` | team store, save team logo: saveTeamLogo, removeTeamLogo, getTeamLogo, deleteTeam, and 6 more. |
| `team-store.js` | Les requêtes à la base de données. |

## Tests

- Unitaires : `node --test src/server/features/teams`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
