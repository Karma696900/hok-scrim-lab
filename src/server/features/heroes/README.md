# Heroes (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `admin-routes.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `admin-routes-hero-details.js` | admin routes, hero details: registerHeroDetailsRoutes. |
| `admin-routes-heroes.js` | admin routes, heroes: registerHeroesRoutes. |
| `admin-routes-parts.js` | admin routes, small helpers: requireHero. |
| `require-hero.js` | The hero an address names, or a 404 (also used by the catalog and the combos). |
| `admin-routes.js` | Les adresses de l'API et leurs réponses. |
| `camp-data.js` | Pure normalisers for the public JSON that HOK Camp (Global, lang_type=en) serves to its own hero pages. |
| `hero-domain.js` | Les règles métier, sans accès à la base. |
| `hero-routes-health-heroes.js` | hero routes, health heroes: registerHealthHeroesRoutes, registerHeroSheetRoutes. |
| `hero-routes-heroes-roster.js` | hero routes, heroes roster: registerHeroesRosterRoutes. |
| `hero-routes-parts.js` | hero routes, small helpers: minGames. |
| `hero-routes.js` | Les adresses de l'API et leurs réponses. |
| `hero-store-hero-sheets.js` | hero store, hero sheets: saveHeroDetails, getHeroDetails, heroDetailsStatus, listBackgroundVideos, and 4 more. |
| `hero-store-manual-hero.js` | hero store, manual hero: addHeroLane, removeHeroLane. |
| `hero-store-metadata-roster.js` | hero store, metadata roster: readMetadata, writeMetadata, readHeroes, saveHeroes. |
| `hero-store-other-names.js` | hero store, other names: listHeroAliases, addHeroAlias, removeHeroAlias. |
| `hero-store.js` | Les requêtes à la base de données. |
| `sync/details-sync-parts.js` | details sync, small helpers: execute, drain, isRunning, requestHero, and 2 more. |
| `sync/details-sync.js` |  |
| `sync/hero-sync.js` |  |
| `sync/roster-sync.js` |  |

## Tests

- Unitaires : `node --test src/server/features/heroes`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
