# Casino (navigateur)

Ce dossier est la page `/casino` (« Composition roulette », menu Jouer) et la page d'une roulette `/casino/<code>`, côté navigateur. Le fichier d'entrée est `casino-page.js`. Aucun compte : la roulette appartient au navigateur qui garde sa clé (`casino-key.js`), et le serveur tire les héros (`src/server/features/casino/`). Les spectateurs ouvrent le lien sans compte, en lecture seule, mis à jour toutes les 2 s. Spec : `docs/superpowers/specs/2026-11-07-casino-composition-roulette-design.md`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `casino-page.js` | La page : l'accueil (`/casino`) ou une roulette (`/casino/<code>`), son état, le direct. |
| `casino-markup.js` | Le balisage : l'accueil, une roulette (cinq voies, bannis, derniers tirages), la roulette disparue. |
| `casino-pools.js` | L'éditeur des pools du créateur : une colonne par voie, Tous / Aucun, recherche, Enregistrer. |
| `casino-actions.js` | Les clics : créer, tirer, relancer les voies cochées, bannir, remettre, enregistrer les pools, copier les liens. |
| `casino-key.js` | La clé du créateur : gardée dans ce navigateur (ou en mémoire), apportée par le lien de contrôle après `#`. |
| `casino-live.js` | Le direct : une demande toutes les 2 s (`?since=`), en pause quand l'onglet est caché, arrêt quand la roulette n'existe plus. |
| `casino-reels.js` | Les rouleaux : les voies tirées défilent ~1,5 s jusqu'au héros tiré ; rien ne bouge en mouvement réduit. |

## Tests

- Unitaires : `node --test src/client/features/casino`
- Navigateur : `node src/testing/run-e2e.mjs casino`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
