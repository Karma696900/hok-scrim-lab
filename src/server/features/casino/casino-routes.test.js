// The roulette's API: anyone makes one without an account and gets its key; everyone reads it, never the key; only the
// key changes it; the server draws; two changes at once both land (spec 2026-11-07 casino).
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { createLimiters } from "../../platform/http/rate-limits.js";
import {
  BLANK_PDF,
  PIXEL_PNG,
  buildExportService,
  startTestServer
} from "../../../testing/test-app.js";

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

const ALL = ["clash", "jungle", "mid", "farm", "roam"];
const keyed = key => ({ "X-Casino-Key": key });

async function made() {
  const browser = app.browser();
  const response = await browser.post("/api/casino", {});
  assert.equal(response.status, 201, response.text);
  return { browser, ...response.body };
}

describe("the casino API", { skip }, () => {
  test("anyone creates a roulette without an account, with every hero of each lane by default", async () => {
    const browser = app.browser();
    const response = await browser.post("/api/casino", {});
    assert.equal(response.status, 201, response.text);
    assert.match(response.body.id, /^[A-Za-z0-9]{10}$/);
    assert.match(response.body.key, /^[A-Za-z0-9_-]{43}$/);
    // the sample roster puts hero n in lane (n - 1) % 5: h05, h10… are the roamers
    assert.ok(response.body.state.pools.roam.includes("h05"));
    assert.ok(!response.body.state.pools.roam.includes("h01"));
    assert.equal(response.body.state.version, 0);
    assert.equal(response.headers.getSetCookie().length, 0, "no cookie");
  });

  test("a spectator reads the state and never the key", async () => {
    const { id } = await made();
    const read = await app.browser().get(`/api/casino/${id}`);
    assert.equal(read.status, 200);
    assert.equal(read.body.id, id);
    assert.equal(read.body.key, undefined);
    assert.equal(read.body.keyHash, undefined);
    assert.doesNotMatch(read.text, /[0-9a-f]{64}/);
  });

  test("a change without the key or with a wrong one is refused and changes nothing", async () => {
    const { id } = await made();
    const spectator = app.browser();
    assert.equal((await spectator.post(`/api/casino/${id}/spin`, { lanes: ALL })).status, 403);
    assert.equal(
      (await spectator.post(`/api/casino/${id}/spin`, { lanes: ALL }, keyed("x".repeat(43))))
        .status,
      403
    );
    assert.equal((await spectator.put(`/api/casino/${id}/pools`, { pools: {} })).status, 403);
    assert.equal((await spectator.post(`/api/casino/${id}/ban`, { lane: "mid" })).status, 403);
    assert.equal((await spectator.delete(`/api/casino/${id}/ban/h01`)).status, 403);
    assert.equal((await spectator.get(`/api/casino/${id}`)).body.version, 0);
  });

  test("the creator spins, respins one lane and bans", async () => {
    const { browser, id, key } = await made();
    const spun = await browser.post(`/api/casino/${id}/spin`, { lanes: ALL }, keyed(key));
    assert.equal(spun.status, 200, spun.text);
    const first = spun.body.result;
    assert.equal(new Set(Object.values(first)).size, 5);
    assert.equal(spun.body.history[0].kind, "spin");

    const respun = await browser.post(`/api/casino/${id}/spin`, { lanes: ["mid"] }, keyed(key));
    assert.equal(respun.status, 200);
    for (const lane of ALL.filter(l => l !== "mid")) {
      assert.equal(respun.body.result[lane], first[lane]);
    }
    assert.equal(respun.body.history[0].kind, "respin");

    const farm = respun.body.result.farm;
    const banned = await browser.post(`/api/casino/${id}/ban`, { lane: "farm" }, keyed(key));
    assert.equal(banned.status, 200);
    assert.ok(banned.body.banned.includes(farm));
    assert.notEqual(banned.body.result.farm, farm);

    const back = await browser.delete(`/api/casino/${id}/ban/${farm}`, keyed(key));
    assert.equal(back.status, 200);
    assert.ok(!back.body.banned.includes(farm));

    const saved = await browser.put(
      `/api/casino/${id}/pools`,
      { pools: { mid: ["h03", "h08", "nope"] } },
      keyed(key)
    );
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.pools.mid, ["h03", "h08"]);
    assert.deepEqual(saved.body.pools.roam, []);
  });

  test("a bad request is refused with its reason", async () => {
    const { browser, id, key } = await made();
    const lanes = await browser.post(`/api/casino/${id}/spin`, { lanes: ["top"] }, keyed(key));
    assert.equal(lanes.status, 400);
    assert.equal(lanes.body.code, "invalid_lanes");
    const nothing = await browser.post(`/api/casino/${id}/ban`, { lane: "mid" }, keyed(key));
    assert.equal(nothing.status, 400);
    assert.equal(nothing.body.code, "nothing_to_ban");
  });

  test("since answers 304 when nothing changed", async () => {
    const { browser, id, key } = await made();
    assert.equal((await app.browser().get(`/api/casino/${id}?since=0`)).status, 304);
    await browser.post(`/api/casino/${id}/spin`, { lanes: ALL }, keyed(key));
    const changed = await app.browser().get(`/api/casino/${id}?since=0`);
    assert.equal(changed.status, 200);
    assert.equal(changed.body.version, 1);
  });

  test("an unknown id answers 404", async () => {
    assert.equal((await app.browser().get("/api/casino/zzzzzzzzzz")).status, 404);
    assert.equal((await app.browser().get("/api/casino/bad")).status, 404);
    assert.equal(
      (await app.browser().post("/api/casino/zzzzzzzzzz/spin", { lanes: ALL }, keyed("k"))).status,
      404
    );
  });

  test("two actions at once both land", async () => {
    const { browser, id, key } = await made();
    await browser.post(`/api/casino/${id}/spin`, { lanes: ALL }, keyed(key));
    const [spin, ban] = await Promise.all([
      browser.post(`/api/casino/${id}/spin`, { lanes: ["mid"] }, keyed(key)),
      browser.post(`/api/casino/${id}/ban`, { lane: "farm" }, keyed(key))
    ]);
    assert.equal(spin.status, 200, spin.text);
    assert.equal(ban.status, 200, ban.text);
    const final = (await app.browser().get(`/api/casino/${id}`)).body;
    assert.equal(final.version, 3);
    assert.equal(final.history.length, 3);
  });
});

describe("the casino limits", { skip }, () => {
  test("a second roulette within the limit's hour is refused", async () => {
    const limited = await startTestServer({
      limiters: createLimiters({ overrides: { casinoCreate: { limit: 1 } } })
    });
    try {
      const browser = limited.browser();
      assert.equal((await browser.post("/api/casino", {})).status, 201);
      assert.equal((await browser.post("/api/casino", {})).status, 429);
    } finally {
      await limited.close();
    }
  });
});

describe("the basket's PDF", { skip }, () => {
  test("anyone downloads the kept compositions in one PDF, without an account", async () => {
    const pages = [];
    const exporter = {
      renderPng: async () => ({ png: PIXEL_PNG, blocked: [] }),
      render: async ({ html, assets }) => {
        pages.push({ html, assets });
        return { pdf: BLANK_PDF, blocked: [] };
      }
    };
    const server = await startTestServer({
      exportService: store => buildExportService(store, { exporter })
    });
    try {
      const full = { clash: "h01", jungle: "h02", mid: "h03", farm: "h04", roam: "h05" };
      const response = await server.browser().post("/api/casino/pdf", {
        compositions: [{ name: "Dive", result: full }, { result: { ...full, mid: "nope" } }]
      });
      assert.equal(response.status, 200, response.text);
      assert.match(response.headers.get("content-type"), /application\/pdf/);
      assert.match(
        response.headers.get("content-disposition"),
        /hok-compositions-\d{4}-\d{2}-\d{2}\.pdf/
      );
      assert.equal(response.headers.getSetCookie().length, 0, "no cookie");
      assert.equal(pages.length, 1);
      assert.match(pages[0].html, /Dive/);
      assert.match(pages[0].html, /Composition 2/);
      assert.ok(
        pages[0].assets.has("/icons/lane-roamer.png"),
        "the lane icons are served from memory"
      );
      assert.ok(pages[0].assets.has("/portraits/h01"), "the portraits too");
      const empty = await server.browser().post("/api/casino/pdf", { compositions: [] });
      assert.equal(empty.status, 400);
      assert.equal(empty.body.code, "invalid_basket");
    } finally {
      await server.close();
    }
  });
});
