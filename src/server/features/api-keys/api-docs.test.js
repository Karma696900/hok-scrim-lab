// The description of the public API, made from the one list of addresses (endpoints.js): the tool names an
// AI calls, the example answers, the OpenAPI document, and the MCP conversation. Pure: no database.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { API_SCOPES } from "../../../shared/access-rules.js";
import { API_ENDPOINTS, endpointOf } from "./endpoints.js";
import { API_EXAMPLES } from "./endpoint-examples.js";
import { buildOpenApi } from "./gateway-openapi.js";
import { MCP_PROTOCOL_VERSIONS, createMcpDispatcher, pathOf, toolsFor } from "./gateway-mcp.js";

describe("the list of addresses, as a description", () => {
  test("every address has a tool name an AI can call, unique and plain", () => {
    const names = API_ENDPOINTS.map(endpoint => endpoint.tool);
    assert.equal(new Set(names).size, names.length, "no tool name twice");
    for (const endpoint of API_ENDPOINTS) {
      assert.match(endpoint.tool, /^[a-z][a-z0-9_]{2,40}$/, endpoint.path);
      for (const parameter of endpoint.query ?? []) {
        assert.match(parameter.name, /^[a-zA-Z]{1,20}$/, endpoint.path);
        assert.ok(parameter.description.length > 3, `${endpoint.path} ${parameter.name}`);
      }
    }
  });

  test("who the key belongs to, and the public tier list, are addresses of the list", () => {
    assert.equal(endpointOf("/me").scope, "account");
    assert.equal(endpointOf("/tier-list").scope, "game");
    assert.equal(endpointOf("/tier-list").tool, "get_tier_list");
    assert.equal(endpointOf("/tier-lists").scope, "tier-lists", "your own lists stay apart");
    assert.equal(endpointOf("/openapi.json"), null, "the description is not a data address");
    assert.equal(endpointOf("/mcp"), null);
  });

  test("every address has an example answer, and no example is left without its address", () => {
    assert.deepEqual(
      Object.keys(API_EXAMPLES).sort(),
      API_ENDPOINTS.map(endpoint => endpoint.path).sort()
    );
    for (const [path, example] of Object.entries(API_EXAMPLES)) {
      assert.equal(typeof example, "object", path);
      assert.ok(!JSON.stringify(example).includes("hok_"), `${path}: no key in an example`);
    }
  });
});

describe("the OpenAPI document", () => {
  const document = buildOpenApi({ origin: "https://example.test" });

  test("OpenAPI 3.1, served from the site, read with a bearer key", () => {
    assert.equal(document.openapi, "3.1.0");
    assert.match(document.info.title, /HOK/);
    assert.deepEqual(document.servers, [{ url: "https://example.test/api/v1" }]);
    assert.deepEqual(document.components.securitySchemes.apiKey, {
      type: "http",
      scheme: "bearer",
      description: document.components.securitySchemes.apiKey.description
    });
  });

  test("one GET per address, nothing that writes, the scope as the role the key needs", () => {
    const paths = Object.keys(document.paths);
    assert.equal(paths.length, API_ENDPOINTS.length + 1, "the addresses and the discovery root");
    for (const endpoint of API_ENDPOINTS) {
      const path = endpoint.path.replace(/:(\w+)/g, "{$1}");
      const item = document.paths[path];
      assert.deepEqual(Object.keys(item), ["get"], path);
      assert.equal(item.get.operationId, endpoint.tool);
      assert.deepEqual(item.get.security, [{ apiKey: [endpoint.scope] }]);
      assert.deepEqual(
        item.get.responses["200"].content["application/json"].example,
        API_EXAMPLES[endpoint.path]
      );
      for (const status of ["401", "403", "404", "429"]) {
        assert.ok(item.get.responses[status], `${path} ${status}`);
      }
    }
  });

  test("the parameters: every :part of the address is required, the query ones are not", () => {
    const one = document.paths["/catalog/{family}/{id}"].get.parameters;
    assert.deepEqual(
      one.map(parameter => [parameter.name, parameter.in, parameter.required]),
      [
        ["family", "path", true],
        ["id", "path", true]
      ]
    );
    assert.deepEqual(one[0].schema.enum, ["items", "arcana", "spells", "stats", "tags"]);
    const series = document.paths["/series"].get.parameters;
    assert.ok(series.length > 2);
    assert.ok(series.every(parameter => parameter.in === "query" && !parameter.required));
  });
});

describe("the MCP server (pure)", () => {
  test("a key sees one tool per address its scopes open, each one read-only", () => {
    const tools = toolsFor(["game"]);
    assert.deepEqual(
      tools.map(tool => tool.name),
      API_ENDPOINTS.filter(endpoint => endpoint.scope === "game").map(endpoint => endpoint.tool)
    );
    for (const tool of tools) {
      assert.equal(tool.inputSchema.type, "object");
      assert.equal(tool.annotations.readOnlyHint, true);
    }
    assert.equal(toolsFor(API_SCOPES).length, API_ENDPOINTS.length);
    const hero = toolsFor(["game"]).find(tool => tool.name === "get_hero");
    assert.deepEqual(hero.inputSchema.required, ["id"]);
  });

  test("the address of a call: its parts filled in and encoded, only the query it declares", () => {
    const endpoint = name => API_ENDPOINTS.find(entry => entry.tool === name);
    assert.equal(pathOf(endpoint("list_heroes"), {}), "/heroes");
    assert.equal(pathOf(endpoint("get_hero"), { id: "h 01" }), "/heroes/h%2001");
    assert.equal(
      pathOf(endpoint("get_catalog_entry"), { family: "items", id: 12 }),
      "/catalog/items/12"
    );
    assert.equal(
      pathOf(endpoint("list_tournaments"), { q: "KPL", page: 2, nonsense: "x" }),
      "/tournaments?q=KPL&page=2"
    );
    for (const [name, args] of [
      ["get_hero", {}],
      ["get_hero", { id: ".." }],
      ["get_hero", { id: "." }],
      ["get_hero", { id: "a/b" }],
      ["get_hero", { id: { nested: true } }],
      ["get_catalog_entry", { family: "heroes", id: 1 }],
      ["get_catalog_entry", { family: "items", id: "x" }]
    ]) {
      assert.throws(
        () => pathOf(endpoint(name), args),
        /argument/,
        `${name} ${JSON.stringify(args)}`
      );
    }
  });

  const reads = [];
  const dispatcher = createMcpDispatcher({
    read: async path => {
      reads.push(path);
      return path === "/heroes/nobody"
        ? { status: 404, body: { error: "Hero not found.", code: "not_found" } }
        : { status: 200, body: { path } };
    },
    extraTools: [
      {
        name: "extra_tool",
        scope: "simulation",
        description: "Later.",
        inputSchema: { type: "object", properties: {} },
        call: async () => ({ decided: true })
      }
    ]
  });
  const ask = (method, params, id = 1) =>
    dispatcher({ jsonrpc: "2.0", id, method, params }, { scopes: ["game"] });

  test("initialize: the version the client speaks when we speak it too, and what we offer", async () => {
    const answer = await ask("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "1" }
    });
    assert.equal(answer.jsonrpc, "2.0");
    assert.equal(answer.id, 1);
    assert.equal(answer.result.protocolVersion, "2025-03-26");
    assert.ok(answer.result.capabilities.tools);
    assert.match(answer.result.serverInfo.name, /hok/i);
    const unknown = await ask("initialize", { protocolVersion: "1999-01-01" });
    assert.equal(unknown.result.protocolVersion, MCP_PROTOCOL_VERSIONS[0]);
  });

  test("a notification gets no answer; ping answers an empty result", async () => {
    assert.equal(
      await dispatcher({ jsonrpc: "2.0", method: "notifications/initialized" }, { scopes: [] }),
      null
    );
    assert.deepEqual((await ask("ping")).result, {});
  });

  test("tools/list and tools/call follow the scopes of the key", async () => {
    const listed = (await ask("tools/list")).result.tools.map(tool => tool.name);
    assert.ok(listed.includes("list_heroes"));
    assert.ok(!listed.includes("list_series"), "scrims is not a scope of this key");
    assert.ok(!listed.includes("extra_tool"), "an extra tool needs its scope too");

    const called = await ask("tools/call", { name: "get_hero", arguments: { id: "h01" } });
    assert.equal(called.result.isError, false);
    assert.deepEqual(called.result.structuredContent, { path: "/heroes/h01" });
    assert.deepEqual(JSON.parse(called.result.content[0].text), { path: "/heroes/h01" });

    const missing = await ask("tools/call", { name: "get_hero", arguments: { id: "nobody" } });
    assert.equal(missing.result.isError, true, "a refusal of the API is a result the AI reads");
    assert.match(missing.result.content[0].text, /404.*Hero not found/);

    const before = reads.length;
    const refused = await ask("tools/call", { name: "list_series", arguments: {} });
    assert.equal(refused.error.code, -32602, "a tool the key does not open does not exist");
    assert.equal(reads.length, before, "nothing was read for it");
    const badArgs = await ask("tools/call", { name: "get_hero", arguments: { id: ".." } });
    assert.equal(badArgs.error.code, -32602);
  });

  test("an extra tool is listed and called once the key has its scope", async () => {
    const answer = await dispatcher(
      { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "extra_tool" } },
      { scopes: ["simulation"] }
    );
    assert.deepEqual(answer.result.structuredContent, { decided: true });
  });

  test("what is not JSON-RPC, or not a method we know, is told so", async () => {
    assert.equal((await dispatcher({ id: 1, method: "ping" }, { scopes: [] })).error.code, -32600);
    assert.equal((await dispatcher([], { scopes: [] })).error.code, -32600);
    assert.equal((await ask("resources/list")).error.code, -32601);
    assert.equal((await ask("tools/call", { name: 42 })).error.code, -32602);
  });
});
