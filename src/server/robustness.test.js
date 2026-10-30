// Robustness: hostile input never produces a 5xx, never pollutes prototypes, and every id-addressed
// route refuses strangers. Deterministic (seeded) so failures are reproducible.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { CREATE_BODY, startTestServer } from "../testing/test-app.js";

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

function random(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const JUNK = [
  null,
  [],
  "text",
  12,
  -1,
  1e308,
  true,
  {},
  [[], {}],
  { __proto__: null },
  JSON.parse('{"__proto__":{"polluted":1}}'),
  JSON.parse('{"constructor":{"prototype":{"polluted":2}}}'),
  { teamA: { toString: 1 }, teamB: [], bestOf: "3", gameMode: {} },
  { name: "x".repeat(100_000) },
  { heroId: { $ne: 1 } },
  { expectedVersion: "1" },
  { expectedVersion: -5 },
  { tiers: "x", unranked: 5 },
  { tiers: [null, 1, "a", [], {}], unranked: [null] },
  { lane: ["Mid Lane"] },
  { winner: 5, durationSeconds: "x" },
  { durationSeconds: 1e99 },
  { games: [{}], teamA: {}, teamB: {} },
  { meta: 5, heroes: 5 },
  { csv: 5 },
  { token: {} },
  { role: "owner", expiresInDays: "5", maxUses: 1.5 },
  { teamA: "\u0000\u0001", teamB: "‮" },
  { name: "𝕳𝖊𝖗𝖔".repeat(50) }
];

async function raw(browser, method, path, { body, headers = {} } = {}) {
  const cookie = [...browser.jar].map(([key, value]) => `${key}=${value}`).join("; ");
  const response = await fetch(`${app.baseUrl}${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...headers },
    body,
    redirect: "manual"
  });
  return {
    status: response.status,
    type: response.headers.get("content-type") ?? "",
    text: await response.text()
  };
}

describe("hostile input never causes a server error", { skip }, () => {
  test("every JSON write endpoint survives junk bodies", async () => {
    const owner = app.browser();
    const series = (await owner.post("/api/series", CREATE_BODY)).body;
    const list = (await owner.post("/api/tier-lists", { name: "T", tiers: [], unranked: [] })).body;
    await owner.post(`/api/series/${series.id}/game`, { blueTeam: "Alpha" });
    const admin = await app.signIn("FuzzAdmin", { admin: true });
    const base = `/api/series/${series.id}`;
    const endpoints = [
      ["POST", "/api/series"],
      ["POST", "/api/online/series"],
      ["POST", "/api/series/import"],
      ["POST", "/api/tier-lists"],
      ["PUT", `/api/tier-lists/${list.id}`],
      ["POST", `/api/tier-lists/${list.id}/invites`],
      ["POST", `${base}/invites`],
      ["POST", "/api/invites/accept"],
      ["POST", `${base}/game`],
      ["POST", `${base}/game/ready`],
      ["POST", `${base}/game/action`],
      ["POST", `${base}/game/advance`],
      ["POST", `${base}/game/timer/start`],
      ["POST", `${base}/game/timer/finish`],
      ["POST", `${base}/game/complete`],
      ["PATCH", `${base}/games/0`],
      ["POST", "/api/export/pdf"]
    ];
    const adminEndpoints = [
      ["POST", "/api/admin/competitive-imports"],
      ["POST", "/api/admin/heroes/h01/lanes"]
    ];
    const failures = [];
    for (const [browser, list2] of [
      [owner, endpoints],
      [admin.browser, adminEndpoints],
      [app.browser(), endpoints.slice(0, 5)]
    ]) {
      for (const [method, path] of list2) {
        for (const junk of JUNK) {
          const response = await raw(browser, method, path, {
            body: JSON.stringify(junk),
            headers: { "content-type": "application/json" }
          });
          if (response.status >= 500) {
            failures.push(
              `${method} ${path} ${JSON.stringify(junk)?.slice(0, 60)} -> ${response.status}`
            );
          }
          if (response.status >= 400 && !response.type.includes("json")) {
            failures.push(`${method} ${path} -> non-JSON error ${response.status}`);
          }
        }
      }
    }
    assert.deepEqual(failures, []);
    assert.equal({}.polluted, undefined, "no prototype pollution");
    assert.equal(Object.prototype.polluted, undefined);
  });

  test("malformed transport: bad JSON, wrong content type, deep nesting, empty body, huge body", async () => {
    const owner = app.browser();
    await owner.post("/api/series", CREATE_BODY);
    const cases = [
      { body: "{", headers: { "content-type": "application/json" }, label: "truncated json" },
      {
        body: "not json at all",
        headers: { "content-type": "application/json" },
        label: "garbage"
      },
      {
        body: JSON.stringify(CREATE_BODY),
        headers: { "content-type": "text/plain" },
        label: "wrong content type"
      },
      {
        body: JSON.stringify(CREATE_BODY),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        label: "form content type"
      },
      {
        body: '{"a":'.repeat(5000) + "{}" + "}".repeat(5000),
        headers: { "content-type": "application/json" },
        label: "deep nesting"
      },
      { body: "", headers: { "content-type": "application/json" }, label: "empty body" },
      { body: undefined, headers: {}, label: "no body, no content type" },
      { body: "﻿{}", headers: { "content-type": "application/json" }, label: "BOM" },
      {
        body: "x".repeat(3_000_000),
        headers: { "content-type": "application/json" },
        label: "3 MB"
      }
    ];
    for (const { body, headers, label } of cases) {
      const response = await raw(owner, "POST", "/api/series", { body, headers });
      assert.ok(response.status < 500, `${label}: ${response.status}`);
      if (response.status >= 400) {
        assert.match(response.type, /json/, label);
      }
    }
  });

  test("random queries on every list endpoint never fail the server", async () => {
    const owner = app.browser();
    await owner.post("/api/series", CREATE_BODY);
    const next = random(42);
    const words = [
      "status",
      "mode",
      "draftMode",
      "q",
      "from",
      "to",
      "sort",
      "view",
      "page",
      "pageSize",
      "lane",
      "minGames",
      "order",
      "hero",
      "unknown"
    ];
    const values = [
      "",
      "active",
      "complete",
      "-1",
      "0",
      "999999999999",
      "NaN",
      "null",
      "[]",
      "%00",
      "%25",
      "%ff",
      "../../etc/passwd",
      "2026-02-30",
      "2026-09-01",
      "x".repeat(300),
      "'; DROP TABLE series;--",
      "1 OR 1=1",
      "Mid%20Lane",
      "<script>"
    ];
    const paths = [
      "/api/series",
      "/api/tier-lists",
      "/api/stats/overview",
      "/api/stats/heroes",
      "/api/heroes/h01/scrims",
      "/api/overview",
      "/api/heroes"
    ];
    for (let index = 0; index < 300; index += 1) {
      const parameters = Array.from(
        { length: 1 + Math.floor(next() * 4) },
        () =>
          `${words[Math.floor(next() * words.length)]}=${values[Math.floor(next() * values.length)]}`
      ).join("&");
      const path = `${paths[Math.floor(next() * paths.length)]}?${parameters}`;
      const response = await raw(owner, "GET", path);
      assert.ok(response.status < 500, `${path} -> ${response.status}`);
    }
    const tables = (await app.store.pool.query("SHOW TABLES"))[0].map(row => Object.values(row)[0]);
    assert.ok(tables.includes("series"), "the injection attempts dropped nothing");
    assert.equal((await owner.get("/api/health")).status, 200, "the server is still healthy");
  });

  test("path parameters: odd ids, encodings and traversal never reach a 5xx", async () => {
    const owner = app.browser();
    for (const id of [
      "",
      "%00",
      "..%2F..%2Fetc%2Fpasswd",
      "a".repeat(5000),
      "%E0%A4%A",
      "😀",
      "00000000-0000-0000-0000-000000000000",
      "' OR '1'='1"
    ]) {
      for (const path of [
        `/api/series/${id}`,
        `/api/tier-lists/${id}`,
        `/api/heroes/${id}`,
        `/api/series/${id}/sharing`,
        `/api/online/${id}/join`
      ]) {
        for (const method of ["GET", "POST", "DELETE", "PUT", "PATCH"]) {
          const response = await raw(owner, method, path, {
            body: method === "GET" || method === "DELETE" ? undefined : "{}",
            headers: { "content-type": "application/json" }
          });
          assert.ok(response.status < 500, `${method} ${path.slice(0, 50)} -> ${response.status}`);
        }
      }
    }
  });
});

describe("id-addressed routes refuse strangers", { skip }, () => {
  test("every route of someone else's series and tier list answers 404/403, never success", async () => {
    const owner = app.browser();
    const series = (await owner.post("/api/series", CREATE_BODY)).body;
    const list = (await owner.post("/api/tier-lists", { name: "Private", tiers: [], unranked: [] }))
      .body;
    await owner.post(`/api/series/${series.id}/game`, { blueTeam: "Alpha" });
    const seriesBase = `/api/series/${series.id}`;
    const routes = [
      ["GET", seriesBase],
      ["DELETE", seriesBase],
      ["PATCH", `${seriesBase}/games/0`],
      ["POST", `${seriesBase}/game`],
      ["POST", `${seriesBase}/game/ready`],
      ["POST", `${seriesBase}/game/action`],
      ["POST", `${seriesBase}/game/advance`],
      ["POST", `${seriesBase}/game/timer/start`],
      ["POST", `${seriesBase}/game/timer/pause`],
      ["POST", `${seriesBase}/game/timer/finish`],
      ["POST", `${seriesBase}/game/complete`],
      ["GET", `${seriesBase}/sharing`],
      ["POST", `${seriesBase}/invites`],
      ["DELETE", `${seriesBase}/invites/aaaaaaaaaaaa`],
      ["DELETE", `${seriesBase}/members/me`],
      ["GET", `/api/tier-lists/${list.id}`],
      ["PUT", `/api/tier-lists/${list.id}`],
      ["DELETE", `/api/tier-lists/${list.id}`],
      ["GET", `/api/tier-lists/${list.id}/sharing`],
      ["POST", `/api/tier-lists/${list.id}/invites`]
    ];
    const strangers = [app.browser(), (await app.signIn("Stranger")).browser];
    for (const stranger of strangers) {
      for (const [method, path] of routes) {
        const response = await raw(stranger, method, path, {
          body:
            method === "GET" || method === "DELETE"
              ? undefined
              : JSON.stringify({
                  heroId: "h01",
                  winner: "Alpha",
                  durationSeconds: 5,
                  name: "x",
                  tiers: [],
                  unranked: []
                }),
          headers: { "content-type": "application/json" }
        });
        assert.ok(
          [400, 401, 403, 404].includes(response.status),
          `${method} ${path} -> ${response.status}`
        );
        assert.notEqual(response.status, 200);
      }
    }
    const stillMine = (await owner.get(seriesBase)).body;
    assert.equal(stillMine.teamA.name, "Alpha");
    assert.equal(
      stillMine.currentGame.draft.actions.length,
      0,
      "no stranger request changed the draft"
    );
    assert.equal((await owner.get(`/api/tier-lists/${list.id}`)).body.name, "Private");
  });

  test("admin routes refuse everyone who is not an administrator", async () => {
    const adminRoutes = [
      ["GET", "/api/admin/competitive-imports"],
      ["POST", "/api/admin/competitive-imports"],
      ["DELETE", "/api/admin/competitive-imports/00000000-0000-4000-8000-000000000000"],
      ["POST", "/api/admin/heroes/h01/lanes"],
      ["DELETE", "/api/admin/heroes/h01/lanes/Jungle"],
      ["POST", "/api/roster/sync"]
    ];
    for (const browser of [app.browser(), (await app.signIn("NotAdmin")).browser]) {
      for (const [method, path] of adminRoutes) {
        const response = await raw(browser, method, path, {
          body: method === "POST" ? "{}" : undefined,
          headers: { "content-type": "application/json" }
        });
        assert.ok([401, 403].includes(response.status), `${method} ${path} -> ${response.status}`);
      }
    }
  });
});
