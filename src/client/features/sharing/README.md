# Sharing (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `sharing-actions.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `sharing-actions.js` | Ce qui se passe quand on clique, tape ou envoie un formulaire. |

## Tests

- Pas de test propre à ce dossier : il est couvert par les tests des pages qui l'utilisent (`npm test`).
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
