# Media (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `image-proxy-parts.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `image-proxy-parts.js` | image proxy, small helpers: keyOf, slot, remember, noteFailure, and 3 more. |
| `image-proxy.js` |  |
| `portrait-cache.js` |  |

## Tests

- Unitaires : `node --test src/server/features/media`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
