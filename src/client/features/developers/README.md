# Developers (navigateur)

Ce dossier est une page (ou un groupe de pages) du site, côté navigateur. Le fichier d'entrée est `developers-page.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `developers-page.js` | The two pages of the API: the public documentation (/developers, indexed) and the API page of a signed-in person (/me/api, private). |
| `developers-doc.js` | The documentation, drawn from GET /api/v1/openapi.json (itself made from server/features/api-keys/endpoints.js): authentication, limits and errors, AI setup, every address with its parameters and an example answer. |
| `api-ai-setup.js` | How to connect Claude Code, Claude Desktop, Cursor (MCP) and ChatGPT (OpenAPI), with the address of the site filled in. |
| `api-keys.js` | The API keys of the signed-in person: make a key, copy it (it is shown once), see what each key did last, revoke it. |
| `api-keys-parts.js` | api keys, small helpers: scopeBoxes, secretBox, doc, list, and 3 more (the public-data scopes are ticked by default). |

Les styles sont dans `client/styles/pages/api.css`.

## Tests

- Navigateur : `node src/testing/run-e2e.mjs api`
- Serveur : `node --test src/server/features/api-keys/*.test.js`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
