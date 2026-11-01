# Tier list publique (navigateur)

Ce dossier est une page du site, côté navigateur : la tier list publique (`/tier-list`, et une adresse par voie : `/tier-list/clash`, `/jungle`, `/mid`, `/farm`, `/roam`). Le fichier d'entrée est `tier-list-public-page.js`. Le classement est calculé par le serveur (`src/server/features/tier-lists/public-tier-list.js`) ; l'outil pour faire sa propre tier list est dans `../tier-lists/`. La méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `tier-list-public-page.js` | La page : lit `/api/tier-list` une fois, garde la voie de l'adresse. |
| `tier-list-public-markup.js` | Le dessin : l'en-tête et les onglets des voies, un tableau par voie (un héros = un lien vers sa fiche, son nom en texte), la méthode. |
| `tier-list-public.e2e.mjs` | Le test dans un navigateur : le HTML servi sans JavaScript, les voies, l'ItemList. |

## Tests

- Navigateur : `node src/testing/run-e2e.mjs tier-list-public`
