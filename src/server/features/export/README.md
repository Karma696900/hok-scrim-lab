# Export (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `export-routes.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `export-routes.js` | Les adresses de l'API et leurs réponses. |
| `export-service-parts.js` | export service, small helpers: report, finish, exportSeries, exportFiltered, and 1 more. |
| `export-service.js` | Un service qui travaille en arrière-plan. |
| `export-validation.js` |  |
| `pdf-exporter.js` |  |
| `queue.js` |  |
| `report-template.js` | HTML template for the PDF export. |

## Tests

- Unitaires : `node --test src/server/features/export`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
