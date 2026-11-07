# Casino (serveur)

Ce dossier est une tranche du serveur : la roulette de compositions `/casino`, sans compte. Le fichier d'entrée est `casino-routes.js`. Le serveur tire les héros (tirage équitable, le même pour tout le monde) ; une roulette se modifie seulement avec sa clé (en-tête `X-Casino-Key`, seule son empreinte SHA-256 est gardée). Spec : `docs/superpowers/specs/2026-11-07-casino-composition-roulette-design.md`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `casino-domain.js` | Les règles : les pools par voie, ce qu'une demande peut demander, le tirage (sans doublon, sans banni, sans héros disparu du site), le bannissement, l'historique des 10 derniers tirages. |
| `casino-store.js` | Les requêtes à la base (table `casino_rolls`) : créer, lire, modifier si la version n'a pas bougé, effacer les roulettes inutilisées depuis 7 jours. |
| `casino-routes.js` | Les adresses de l'API et leurs réponses. |

## Tests

- Règles : `node --test src/server/features/casino/casino-domain.test.js`
- Base et routes : `node --test src/server/features/casino/casino-store.test.js src/server/features/casino/casino-routes.test.js` (MySQL de `docker compose`)
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
