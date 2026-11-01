// The description and the AI door of the public API, over HTTP on the real application: the OpenAPI document is
// read without a key, the MCP server takes one and sends every tool call back through the same gateway checks,
// and the example answers keep the fields of the real answers.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { createLimiters } from "../../platform/http/rate-limits.js";
import { startTestServer } from "../../../testing/test-app.js";
import { API_ENDPOINTS } from "./endpoints.js";
import { API_EXAMPLES } from "./endpoint-examples.js";

const app = await startTestServer();
const limited = await startTestServer({
  limiters: createLimiters({ enabled: true, overrides: { apiKey: { limit: 3 } } })
});
after(async () => {
  await app?.close();
  await limited?.close();
});
const skip = app && limited ? false : "MySQL is not reachable (docker compose up -d mysql)";

async function makeKey(server, name, body = { name: "ai" }) {
  const person = await server.signIn(name);
  const answer = await person.browser.post("/api/me/api-keys", body);
  assert.equal(answer.status, 200, answer.text);
  return { person, bearer: { authorization: `Bearer ${answer.body.secret}` } };
}

let next = 1;
const rpc = (server, bearer, method, params) =>
  server
    .browser()
    .post(
      "/api/v1/mcp",
      { jsonrpc: "2.0", id: next++, method, ...(params ? { params } : {}) },
      { ...bearer, accept: "application/json, text/event-stream" }
    );

describe("the OpenAPI document", { skip }, () => {
  test("is read without a key, from any site, and describes this server", async () => {
    const answer = await app.browser().get("/api/v1/openapi.json");
    assert.equal(answer.status, 200, answer.text);
    assert.equal(answer.body.openapi, "3.1.0");
    assert.equal(answer.body.servers[0].url, `${app.baseUrl}/api/v1`);
    assert.equal(answer.headers.get("access-control-allow-origin"), "*");
    assert.equal(Object.keys(answer.body.paths).length, API_ENDPOINTS.length + 1);
  });
});

describe("the MCP server", { skip }, () => {
  test("takes a key, like every address of the API", async () => {
    const answer = await app
      .browser()
      .post("/api/v1/mcp", { jsonrpc: "2.0", id: 1, method: "ping" });
    assert.equal(answer.status, 401);
    assert.match(answer.headers.get("www-authenticate") ?? "", /^Bearer/);
    const { bearer } = await makeKey(app, "McpGet");
    const get = await app.browser().get("/api/v1/mcp", bearer);
    assert.equal(get.status, 405, "no stream of events: POST only");
    assert.match(get.headers.get("allow") ?? "", /POST/);
  });

  test("initialize, then the tools the scopes of the key open, then a call that reads", async () => {
    const { bearer } = await makeKey(app, "McpUser", { name: "claude", scopes: ["game"] });
    const hello = await rpc(app, bearer, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" }
    });
    assert.equal(hello.status, 200, hello.text);
    assert.equal(hello.body.result.protocolVersion, "2025-06-18");
    const initialized = await app
      .browser()
      .post("/api/v1/mcp", { jsonrpc: "2.0", method: "notifications/initialized" }, bearer);
    assert.equal(initialized.status, 202);

    const tools = (await rpc(app, bearer, "tools/list")).body.result.tools.map(tool => tool.name);
    assert.ok(tools.includes("list_heroes") && tools.includes("get_tier_list"));
    assert.ok(!tools.includes("list_series"), "scrims was not given to this key");

    const heroes = await rpc(app, bearer, "tools/call", { name: "list_heroes", arguments: {} });
    assert.equal(heroes.body.result.isError, false);
    assert.ok(heroes.body.result.structuredContent.heroes.length > 0);
    const id = heroes.body.result.structuredContent.heroes[0].id;
    const hero = await rpc(app, bearer, "tools/call", { name: "get_hero", arguments: { id } });
    assert.equal(hero.body.result.structuredContent.hero.id, id);
    const missing = await rpc(app, bearer, "tools/call", {
      name: "get_hero",
      arguments: { id: "nobody" }
    });
    assert.equal(missing.body.result.isError, true);
    assert.match(missing.body.result.content[0].text, /^404/);

    const refused = await rpc(app, bearer, "tools/call", { name: "list_series", arguments: {} });
    assert.equal(refused.body.error.code, -32602);
  });

  test("every tool call counts against the rate of the key, like a call of the address", async () => {
    const { bearer } = await makeKey(limited, "McpLimited", { name: "busy", scopes: ["game"] });
    // the limit is 3: the message itself counts one, the read it sends back through the gateway one more
    const first = await rpc(limited, bearer, "tools/call", { name: "list_heroes" });
    assert.equal(first.body.result.isError, false);
    const second = await rpc(limited, bearer, "tools/call", { name: "list_heroes" });
    assert.equal(second.body.result.isError, true, "the fourth request of the minute is refused");
    assert.match(second.body.result.content[0].text, /^429/);
    assert.equal((await rpc(limited, bearer, "ping")).status, 429, "and the door is closed too");
  });
});

describe("the example answers", { skip }, () => {
  test("carry the top-level fields of the real answers", async () => {
    const { bearer } = await makeKey(app, "McpExamples");
    const heroId = (await app.browser().get("/api/v1/heroes", bearer)).body.heroes[0].id;
    for (const endpoint of API_ENDPOINTS) {
      if (endpoint.path.includes(":") && endpoint.path !== "/heroes/:id") {
        continue;
      }
      const path = endpoint.path.replace(":id", heroId);
      const answer = await app.browser().get(`/api/v1${path}`, bearer);
      assert.equal(answer.status, 200, `${path}: ${answer.text}`);
      assert.deepEqual(
        Object.keys(API_EXAMPLES[endpoint.path]).sort(),
        Object.keys(answer.body).sort(),
        endpoint.path
      );
    }
  });
});
