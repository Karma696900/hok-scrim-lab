# Contact (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `contact-routes.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `contact-routes.js` | Les adresses de l'API et leurs réponses. |
| `contact-store.js` | Les requêtes à la base de données. |

## Tests

- Pas de test propre à ce dossier : il est couvert par les tests des pages qui l'utilisent (`npm test`).
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
