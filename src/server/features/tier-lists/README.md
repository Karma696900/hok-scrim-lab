# Tier lists (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `official-routes.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `official-routes.js` | Les adresses de l'API et leurs réponses. |
| `official-store.js` | Les requêtes à la base de données. |
| `official.js` | The official ratings: one list per lane with six fixed tiers, from SS (the best) to D. |
| `public-tier-list.js` | The public tier list of each lane: tournaments first (six equal bands between the worst and the best score), the editors next, the others not ranked yet. |
| `public-tier-list-service.js` | The public tier list as the site shows it, read from the database and kept with the tournament aggregations; the tier of a hero, the tiers the editors see. |
| `tier-list-domain.js` | Les règles métier, sans accès à la base. |
| `tier-list-routes.js` | Les adresses de l'API et leurs réponses. |
| `tier-list-store.js` | Les requêtes à la base de données. |

## Tests

- Unitaires : `node --test src/server/features/tier-lists`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
