# Discord (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `discord-routes.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `discord-routes-parts.js` | discord routes, small helpers: managed, present. |
| `discord-routes.js` | Les adresses de l'API et leurs réponses. |
| `discord-service-commands.js` | discord service, commands: registerCommands. |
| `discord-service-parts.js` | discord service, small helpers: json, bot, authorizeUrl, exchange, and 4 more. |
| `discord-service-team-s.js` | discord service, team s: botInstallUrl, getGuild, listChannels, postMessage. |
| `discord-service.js` | Un service qui travaille en arrière-plan. |
| `reminders.js` |  |

## Tests

- Unitaires : `node --test src/server/features/discord`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
