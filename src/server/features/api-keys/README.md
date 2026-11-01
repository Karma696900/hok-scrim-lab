# Api keys (serveur)

Ce dossier est une tranche du serveur : ses routes, ses règles et ses requêtes à la base. Le fichier d'entrée est `api-key-routes.js`. La carte du dossier est ci-dessous ; la méthode de découpage (un fichier = un rôle) est expliquée dans `docs/PAGE-ANATOMY.md`, et les recettes pour modifier quelque chose dans `docs/HOW-TO.md`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `api-key-domain.js` | API keys, the pure part: how a key is made, read from a request and checked, and what a person may ask when they create one. |
| `api-key-routes.js` | Les adresses de l'API et leurs réponses. |
| `api-key-store.js` | Les requêtes à la base de données. |
| `endpoints.js` | The addresses of the public API (/api/v1): the one list the gateway matches a request against, and that the discovery answer, the OpenAPI document, the MCP tools and the /developers page are made from. Each one has its scope, its tool name (also the OpenAPI operationId) and its query parameters. |
| `endpoint-examples.js` / `.json` | An example answer per address (data, not code); `mcp.test.js` checks that it keeps the top-level fields of the real answer. |
| `gateway.js` | The door of /api/v1: CORS, GET only (POST for /mcp), the key, its rate limit, its scope, then the application's own router. |
| `gateway-openapi.js` | GET /api/v1/openapi.json: the OpenAPI 3.1 description, public, made from endpoints.js. |
| `gateway-mcp.js` | POST /api/v1/mcp: the MCP server (JSON-RPC: initialize, ping, tools/list, tools/call). A tool call goes back through the gateway as a GET with the same key. |

## Add a tool that is not a GET

`createApiGateway({ ..., mcpTools })` takes extra MCP tools, each
`{ name, scope, description, inputSchema, call(args, { scopes, request, response }) }`. A tool is listed and called only
for a key that has its `scope`; what `call` returns is the tool result (shown as JSON); an error it throws with a
`status` under 500 (400, 429…) becomes a tool result with `isError: true`. A tool with its own scope needs that scope
in `API_SCOPES` (src/shared/access-rules.js), with its label in the API page (client/features/developers/api-keys-parts.js).
The decisions of the bots are not here: they are the bots API of the private repository hok-bots
(bots.hok-scrim-lab.com), which asks the site whether a key holds the scope `simulation`.

## Tests

- Unitaires : `node --test src/server/features/api-keys/*.test.js`
- Taille : `node --test src/architecture.test.js` échoue si un fichier dépasse 400 lignes ou une fonction 120.
