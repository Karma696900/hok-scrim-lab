# Translations (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `translation-routes.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `providers/anthropic.js` |  |
| `providers/deepl.js` |  |
| `providers/each-language.js` |  |
| `providers/http.js` | What every translation provider shares: the error it can raise and how one request is sent. |
| `providers/libretranslate.js` |  |
| `providers/translation-providers.js` |  |
| `sources.js` |  |
| `translation-domain.js` | Les règles métier, sans accès à la base. |
| `translation-routes-parts.js` | translation routes, small helpers: hashOf, languageOf. |
| `translation-routes-translations.js` | translation routes, translations: registerTranslationsRoutes, registerTranslationEditsRoutes. |
| `translation-routes.js` | Les adresses de l'API et leurs réponses. |
| `translation-service-pause.js` | translation service, pause: pause, pauseForQuota, readQuota, wantedNow, and 4 more. |
| `translation-service-round.js` | translation service, round: round, sweep, enabled, changed, and 7 more. |
| `translation-service-shared.js` | Constantes et petites fonctions que plusieurs fichiers du dossier utilisent. |
| `translation-service.js` | Un service qui travaille en arrière-plan. |
| `translation-store-content-lock.js` | translation store, content lock: contentLock, contentSync, contentWork, contentSave, and 6 more. |
| `translation-store-content-set-manual.js` | translation store, content set manual: contentSetManual, contentReset, contentKeep, contentRetry, and 2 more. |
| `translation-store.js` | Les requêtes à la base de données. |

## Tests

- Unitaires : `node --test src/server/features/translations`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
