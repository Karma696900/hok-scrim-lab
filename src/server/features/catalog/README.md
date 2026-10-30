# Catalog (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `catalog-routes.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `catalog-domain-hero.js` | Reading what an administrator writes for a spell, a hero profile (skills, base stats) and a recommended build. |
| `catalog-domain-stats.js` | Reading what an administrator writes for a stat (its unit and options), a value, a line of stats, a tag. |
| `catalog-domain.js` | Les règles métier, sans accès à la base. |
| `catalog-routes-admin.js` | catalog routes, admin: registerAdminRoutes. |
| `catalog-routes-arcana.js` | catalog routes, arcana: registerAdminRoutes3. |
| `catalog-routes-builds.js` | catalog routes, builds: registerBuildsRoutes. |
| `catalog-routes-catalog-admin.js` | catalog routes, catalog admin: registerCatalogAdminRoutes. |
| `catalog-routes-catalog.js` | catalog routes, catalog: registerCatalogRoutes. |
| `catalog-routes-heroes-profile.js` | catalog routes, heroes profile: requireHero, adminOnly, editorOnly, variantOf. |
| `catalog-routes-items.js` | catalog routes, items: registerAdminRoutes2. |
| `catalog-routes-parts.js` | catalog routes, small helpers: known. |
| `catalog-routes-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `catalog-routes.js` | Les adresses de l'API et leurs réponses. |
| `catalog-store-arcana.js` | catalog store, arcana: createArcana, updateArcana, deleteArcana. |
| `catalog-store-hero-profiles.js` | catalog store, hero profiles: getHeroProfile, saveHeroProfile, heroTags. |
| `catalog-store-items.js` | catalog store, items: createItem, updateItem, buildsUsing, deleteItem, and 1 more. |
| `catalog-store-parts.js` | catalog store, small helpers: parse, forget, tagsOf, setTags, and 11 more. |
| `catalog-store-recommended-builds.js` | catalog store, recommended builds: listBuildSets, listBuildSummaries, saveBuildSet, deleteBuildSet. |
| `catalog-store-spells.js` | catalog store, spells: createSpell, updateSpell, deleteSpell. |
| `catalog-store-stats.js` | catalog store, stats: createStat, usageData, checkStatChange, updateStat, and 2 more. |
| `catalog-store-tags.js` | catalog store, tags: createTag, updateTag, deleteTag. |
| `catalog-store.js` | Les requêtes à la base de données. |
| `conditions.js` |  |
| `fields.js` |  |
| `usage.js` |  |

## Tests

- Unitaires : `node --test src/server/features/catalog`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
