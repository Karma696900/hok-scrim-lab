# Reflex (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `reflex-routes.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `reflex-domain.js` | Reflex training, the rules: what a finished run may say, what a team can ask of its players, and how far each player is in the period that is running. |
| `reflex-routes-parts.js` | reflex routes, small helpers: assignedTo. |
| `reflex-routes-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `reflex-routes-teams.js` | reflex routes, teams: registerTeamsRoutes. |
| `reflex-routes-training-team.js` | reflex routes, training team: member, staffOnly, registerTeamsRoutes2. |
| `reflex-routes-training.js` | reflex routes, training: registerTrainingRoutes. |
| `reflex-routes.js` | Les adresses de l'API et leurs réponses. |
| `reflex-store-parts.js` | reflex store, small helpers: present. |
| `reflex-store-runs.js` | reflex store, runs: addReflexRun, reflexRunsSince, reflexExerciseStats, reflexSummary. |
| `reflex-store-staff-decided.js` | reflex store, staff decided: getTrainingSettings, saveTrainingSettings, rankingScores. |
| `reflex-store-team-asks.js` | reflex store, team asks: listTrainingGoals, createTrainingGoal, updateTrainingGoal, deleteTrainingGoal, and 1 more. |
| `reflex-store.js` | Les requêtes à la base de données. |

## Tests

- Unitaires : `node --test src/server/features/reflex`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
