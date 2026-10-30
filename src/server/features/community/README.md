# Community (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `community-routes.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `agenda-store-agenda-extras.js` | agenda store, agenda extras: setRsvp, rsvpsFor, agendaOfUser, dueReminders. |
| `agenda-store.js` | Les requêtes à la base de données. |
| `community-domain.js` | Les règles métier, sans accès à la base. |
| `community-routes-admin-notifications.js` | community routes, admin notifications: registerAdminNotificationsRoutes. |
| `community-routes-me.js` | community routes, me: registerMeRoutes. |
| `community-routes-parts.js` | community routes, small helpers: presentDiscord. |
| `community-routes-players.js` | community routes, players: registerMeRoutes2. |
| `community-routes-requests-scrim-posts.js` | community routes, requests scrim posts: registerRequestsScrimPostsRoutes. |
| `community-routes-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `community-routes.js` | Les adresses de l'API et leurs réponses. |
| `community-store.js` | Les requêtes à la base de données. |
| `discord-link-store.js` | Les requêtes à la base de données. |
| `notifications-store.js` | Les requêtes à la base de données. |
| `players-store.js` | Les requêtes à la base de données. |
| `posts-store-announcements.js` | posts store, announcements: createPost, listPosts, openPostCount, closePost. |
| `posts-store.js` | Les requêtes à la base de données. |
| `requests-store-answer-request.js` | requests store, answer request: answerRequest, blockTeam, listReports, dismissReport. |
| `requests-store-create-request.js` | requests store, create request: createRequest, listRequests, getRequest, addMessage. |
| `requests-store.js` | Les requêtes à la base de données. |
| `store-helpers.js` |  |
| `team-discord-store.js` | Les requêtes à la base de données. |

## Tests

- Unitaires : `node --test src/server/features/community`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
