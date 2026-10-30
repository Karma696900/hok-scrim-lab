# Space (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `space-routes.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `space-domain.js` | The personal space of a person: the builds they keep on their account and the links with which they share their space (tier lists, builds, training sheet). |
| `space-routes.js` | Les adresses de l'API et leurs réponses. |
| `space-store-builds-kept.js` | space store, builds kept: listSpaceBuilds, addSpaceBuild, deleteSpaceBuild. |
| `space-store-links.js` | space store, links: listSpaceLinks, createSpaceLink, deleteSpaceLink, openSpaceLink. |
| `space-store-parts.js` | space store, small helpers: parse, presentBuild, presentLink, ownedTierLists, and 1 more. |
| `space-store.js` | Les requêtes à la base de données. |

## Tests

- Unitaires : `node --test src/server/features/space`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
