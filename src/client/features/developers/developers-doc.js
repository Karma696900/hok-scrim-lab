// The public documentation of the API (/developers), drawn from its OpenAPI description (GET /api/v1/openapi.json),
// which the server makes from its one list of addresses: the page cannot say something the API does not do. The
// texts of the addresses (summaries, parameters) are the ones of the description, in English like the API's own
// answers; the rest of the page is translated.
import { t } from "../../app/browser-i18n.js";
import { icon } from "../../../shared/icons.js";
import { aiSetupHtml, codeFigure, KEY_PLACEHOLDER } from "./api-ai-setup.js";
import { scopeLabel } from "./api-keys-parts.js";

/** The errors a program meets, with what each one means. */
const ERRORS = () => [
  [
    "400",
    "invalid_body",
    t("The situation sent to the one POST is not valid: the error says what is wrong.")
  ],
  ["401", "unauthorized", t("No key, or a key that is not valid, has expired or was revoked.")],
  ["403", "insufficient_scope", t("The key lacks the scope this address needs.")],
  ["404", "not_found", t("Unknown address, or something the owner of the key cannot see.")],
  ["405", "method_not_allowed", t("The API only reads: use GET.")],
  ["429", "rate_limited", t("Too many requests: wait for the seconds of Retry-After.")]
];

/** The operations of the description, grouped by the scope that opens them, in the order of the list. */
function byScope(description) {
  const groups = new Map();
  for (const [path, item] of Object.entries(description.paths)) {
    const method = item.get ? "GET" : "POST";
    const operation = item.get ?? item.post;
    const scope = operation?.security?.[0]?.apiKey?.[0];
    if (!scope) {
      continue;
    }
    if (!groups.has(scope)) {
      groups.set(scope, []);
    }
    groups.get(scope).push({ path, method, operation });
  }
  return groups;
}

function parametersHtml(esc, parameters = []) {
  if (!parameters.length) {
    return "";
  }
  return `<table class="dev-params"><thead><tr><th>${t("Parameter")}</th><th>${t("In")}</th><th>${t("Description")}</th></tr></thead><tbody>${parameters
    .map(
      parameter =>
        `<tr><td><code>${esc(parameter.name)}</code>${parameter.required ? ` <span class="pill pill--grey">${t("required")}</span>` : ""}</td><td>${esc(parameter.in === "path" ? t("address") : t("query"))}</td><td>${esc(parameter.description ?? "")}</td></tr>`
    )
    .join("")}</tbody></table>`;
}

/** An example (a request body or an answer), folded. */
const exampleHtml = (esc, title, example) =>
  example === undefined
    ? ""
    : `<details class="dev-example"><summary>${title}</summary><pre><code>${esc(JSON.stringify(example, null, 2))}</code></pre></details>`;

function operationHtml(esc, { path, method, operation }) {
  const example = operation.responses?.["200"]?.content?.["application/json"]?.example;
  const body = operation.requestBody?.content?.["application/json"]?.example;
  return `<article class="dev-op" id="op-${esc(operation.operationId)}">
      <header class="dev-op__head"><span class="dev-method">${method}</span><code class="dev-op__path">/api/v1${esc(path)}</code><span class="pill">${esc(scopeLabel(operation.security[0].apiKey[0]))}</span></header>
      <p>${esc(operation.summary)}</p>
      <p class="muted dev-op__tool">${t("Tool for an AI: {name}", { name: `<code>${esc(operation.operationId)}</code>` })}</p>
      ${parametersHtml(esc, operation.parameters)}
      ${exampleHtml(esc, t("Example request"), body)}
      ${exampleHtml(esc, t("Example answer"), example)}
    </article>`;
}

/** The whole page body, for the description `description` read from the site at `origin`. */
export function docHtml(esc, description, origin) {
  const groups = byScope(description);
  const curl = `curl -H "Authorization: Bearer ${KEY_PLACEHOLDER}" ${origin}/api/v1/heroes`;
  return `<div class="dev-steps">
      <a class="card dev-step" href="/me/api">${icon("key")}<b>${t("1. Make a key")}</b><span class="muted">${t("Sign in, open the API page and choose what the key can read.")}</span></a>
      <a class="card dev-step" href="#dev-auth">${icon("send")}<b>${t("2. Call an address")}</b><span class="muted">${t("Send the key in the Authorization header. Answers are JSON.")}</span></a>
      <a class="card dev-step" href="#dev-ai">${icon("spark")}<b>${t("3. Or ask an AI")}</b><span class="muted">${t("Connect Claude, ChatGPT or Cursor: they read the data for you.")}</span></a>
    </div>
    <section class="card dev-section" id="dev-auth"><h2>${t("Authentication")}</h2>
      <p>${t("Every address takes an API key, sent as a bearer token. A key only reads, and sees what its owner sees: the data of the game for everybody, your own scrims, tier lists and teams for you.")}</p>
      ${codeFigure(esc, t("Your first call"), curl)}
      <p class="muted">${t("The X-API-Key header works too. A key put in the address is ignored: addresses end up in logs.")}</p>
    </section>
    <section class="card dev-section" id="dev-limits"><h2>${t("Limits and errors")}</h2>
      <p>${t("Each key may make {count} requests a minute. Errors are JSON with a stable code:", { count: "120" })}</p>
      <table class="dev-params"><thead><tr><th>${t("Status")}</th><th>code</th><th>${t("Meaning")}</th></tr></thead><tbody>${ERRORS()
        .map(
          ([status, code, meaning]) =>
            `<tr><td>${status}</td><td><code>${code}</code></td><td>${esc(meaning)}</td></tr>`
        )
        .join("")}</tbody></table>
    </section>
    <section class="card dev-section" id="dev-ai"><h2>${t("Use with an AI")}</h2>
      <p>${t("The API is also an MCP server, at {address}: an assistant gets one tool per address its key can read.", { address: `<code>${esc(origin)}/api/v1/mcp</code>` })}</p>
      ${aiSetupHtml(esc, origin)}
    </section>
    <section class="dev-section dev-ref" id="dev-reference"><h2>${t("Addresses")}</h2>
      <p class="muted">${t("The full description, to import in a tool:")} <a class="link" href="/api/v1/openapi.json">/api/v1/openapi.json</a> (OpenAPI 3.1)</p>
      ${[...groups]
        .map(
          ([scope, operations]) =>
            `<section class="dev-scope" id="scope-${esc(scope)}"><h3>${esc(scopeLabel(scope))} <code>${esc(scope)}</code></h3>${operations.map(operation => operationHtml(esc, operation)).join("")}</section>`
        )
        .join("")}
    </section>`;
}
