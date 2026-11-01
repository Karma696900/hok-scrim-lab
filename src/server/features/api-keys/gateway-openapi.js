// The OpenAPI 3.1 description of the public API (GET /api/v1/openapi.json), made from endpoints.js and the
// example answers, so it can never say something the gateway does not do. It is public (no key is needed to
// read it): a custom GPT, a client generator or the /developers page read it before they have a key.
import { CATALOG_FAMILIES, API_ENDPOINTS } from "./endpoints.js";
import { API_EXAMPLES } from "./endpoint-examples.js";

const RATE_LIMIT = "120 requests a minute for each key";

const ERROR_SCHEMA = {
  type: "object",
  required: ["error", "code"],
  properties: {
    error: { type: "string", description: "What went wrong, in the language of the request." },
    code: { type: "string", description: "A stable code a program can test." },
    requestId: { type: "string" }
  }
};

const ERRORS = {
  400: ["BadRequest", "The body is not a valid situation: the error says what is wrong."],
  401: ["Unauthorized", "No key, or a key that is not valid, has expired or was revoked."],
  403: ["InsufficientScope", "The key lacks the scope this address needs."],
  404: ["NotFound", "Unknown address, or something the owner of the key cannot see."],
  429: ["RateLimited", `Over the limit (${RATE_LIMIT}): wait for Retry-After seconds.`]
};

/** The `{name}` form of an address of endpoints.js (`/heroes/:id` -> `/heroes/{id}`). */
export const openApiPath = path => path.replace(/:(\w+)/g, "{$1}");

/** The parameters of an address: each `:part` (required), then the query ones it reads. */
function parametersOf(endpoint) {
  const inPath = [...endpoint.path.matchAll(/:(\w+)/g)].map(([, name]) => ({
    name,
    in: "path",
    required: true,
    description:
      name === "family" ? "items, arcana, spells, stats or tags." : `The ${name} of the thing.`,
    schema: name === "family" ? { type: "string", enum: CATALOG_FAMILIES } : { type: "string" }
  }));
  const inQuery = (endpoint.query ?? []).map(parameter => ({
    name: parameter.name,
    in: "query",
    required: false,
    description: parameter.description,
    schema: { type: "string" }
  }));
  return [...inPath, ...inQuery];
}

function operationOf(endpoint) {
  return {
    operationId: endpoint.tool,
    summary: endpoint.summary,
    description: `${endpoint.summary}\n\nNeeds a key with the scope \`${endpoint.scope}\`.`,
    tags: [endpoint.scope],
    security: [{ apiKey: [endpoint.scope] }],
    ...(endpoint.path.includes(":") || endpoint.query?.length
      ? { parameters: parametersOf(endpoint) }
      : {}),
    responses: {
      200: {
        description: "The answer (shortened in this example: a list shows one entry).",
        content: { "application/json": { example: API_EXAMPLES[endpoint.path] } }
      },
      ...refsTo([401, 403, 404, 429])
    }
  };
}

const refsTo = statuses =>
  Object.fromEntries(
    statuses.map(status => [status, { $ref: `#/components/responses/${ERRORS[status][0]}` }])
  );

/** The whole document, for the site at `origin` (https://hok-scrim-lab.com). */
export function buildOpenApi({ origin }) {
  const paths = {
    "/": {
      get: {
        operationId: "discover",
        summary: "The addresses this key can read, with the scope each one needs.",
        tags: ["account"],
        security: [{ apiKey: [] }],
        responses: {
          200: { description: "The account, the key and its addresses." },
          401: { $ref: "#/components/responses/Unauthorized" },
          429: { $ref: "#/components/responses/RateLimited" }
        }
      }
    }
  };
  for (const endpoint of API_ENDPOINTS) {
    paths[openApiPath(endpoint.path)] = { get: operationOf(endpoint) };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "HOK API: Honor of Kings data by HOK Global Scrim Lab",
      version: "1",
      description: [
        "Read the data of Honor of Kings Global (heroes, items, arcana, spells, the public tier list, the",
        "tournaments) and your own data on HOK Global Scrim Lab (scrims, tier lists, teams, training) from",
        "your programs and your AI assistants. The API only reads.",
        "",
        "Send your key as `Authorization: Bearer hok_…` (make one at /me/api once signed in).",
        `Rate limit: ${RATE_LIMIT}. Errors are JSON: { error, code }.`,
        "Pictures of the catalogue are at /catalog-images/{imageId} on the site."
      ].join("\n")
    },
    servers: [{ url: `${origin}/api/v1` }],
    security: [{ apiKey: [] }],
    tags: [...new Set(API_ENDPOINTS.map(endpoint => endpoint.scope))].map(name => ({ name })),
    paths,
    components: {
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          description: "An API key of HOK Global Scrim Lab (hok_ followed by 43 characters)."
        }
      },
      schemas: { Error: ERROR_SCHEMA },
      responses: Object.fromEntries(
        Object.values(ERRORS).map(([name, description]) => [
          name,
          {
            description,
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
          }
        ])
      )
    }
  };
}
