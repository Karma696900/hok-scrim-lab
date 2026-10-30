# Combos (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `combo-routes.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `combo-domain.js` | The combos of a hero (guides written by the editors) and what a player has acquired of them. |
| `combo-routes-combos.js` | combo routes, combos: registerCombosRoutes. |
| `combo-routes-parts.js` | combo routes, small helpers: editorOnly, player, requireHero, skillIdsOf. |
| `combo-routes-training.js` | combo routes, training: registerTrainingRoutes. |
| `combo-routes.js` | Les adresses de l'API et leurs réponses. |
| `combo-store-daily-check.js` | combo store, daily check: dueReviews, combosToLearn, answerReview, comboExists. |
| `combo-store-parts.js` | combo store, small helpers: present, comboCounts, listCombos, createCombo, and 4 more. |
| `combo-store-player-has.js` | combo store, player has: comboProgress, setComboProgress. |
| `combo-store-team-asks.js` | combo store, team asks: listHeroGoals, createHeroGoal, deleteHeroGoal, heroGoalProgress. |
| `combo-store.js` | Les requêtes à la base de données. |

## Tests

- Unitaires : `node --test src/server/features/combos`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
