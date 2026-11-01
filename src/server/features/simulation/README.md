# Game Simulation (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `simulation-routes.js`. La partie elle-même tourne sur le serveur des bots (dépôt privé `hok-bots`, `bots.hok-scrim-lab.com`) ; le site garde l'image du plateau et la fin des parties des joueurs connectés (historique de l'espace perso). La méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `simulation-routes.js` | Les adresses : `GET`/`PUT /api/simulation/map` (image du plateau), `GET`/`POST /api/simulation/games` (compte). |
| `simulation-domain.js` | Ce que peut dire la fin d'une partie. |
| `simulation-store.js` | Les requêtes à la table `simulation_games` (migration 041). |

## Tests

- `node --test src/server/features/simulation/simulation.test.js` (les routes ont besoin de MySQL : `docker compose up -d mysql`).
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
