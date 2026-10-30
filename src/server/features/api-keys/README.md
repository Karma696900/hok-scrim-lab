# Api keys (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `api-key-routes.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `api-key-domain.js` | API keys, the pure part: how a key is made, read from a request and checked, and what a person may ask when they create one. |
| `api-key-routes.js` | Les adresses de l'API et leurs réponses. |
| `api-key-store.js` | Les requêtes à la base de données. |
| `endpoints.js` | The addresses of the public API (/api/v1), the one list the gateway matches a request against, the discovery answer is made from, and docs/API.md follows. |
| `gateway.js` |  |

## Tests

- Unitaires : `node --test src/server/features/api-keys`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
