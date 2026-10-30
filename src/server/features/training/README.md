# Training (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `training-routes.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `training-domain.js` | Les règles métier, sans accès à la base. |
| `training-routes-notes.js` | training routes, notes: registerNotesRoutes. |
| `training-routes-parts.js` | training routes, small helpers: knownHeroIds, knownMapIds. |
| `training-routes-scenarios.js` | training routes, scenarios: registerScenariosRoutes. |
| `training-routes-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `training-routes.js` | Les adresses de l'API et leurs réponses. |
| `training-store-maps-administrators.js` | training store, maps administrators: saveTrainingMap, listTrainingMaps, getTrainingMapImage, deleteTrainingMap. |
| `training-store-notebook-private.js` | training store, notebook private: listTrainingNotes, createTrainingNote, updateTrainingNote, deleteTrainingNote. |
| `training-store-parts.js` | training store, small helpers: parse, presentNote, presentMap, presentScenario, and 8 more. |
| `training-store.js` | Les requêtes à la base de données. |

## Tests

- Unitaires : `node --test src/server/features/training`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
