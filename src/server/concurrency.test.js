// Concurrency (row locks + versions) and server-side timer expiry.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { CREATE_BODY, startTestServer } from "../testing/test-app.js";

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

async function startedGame(browser, overrides = {}) {
  const { body: series } = await browser.post("/api/series", {
    ...CREATE_BODY,
    bestOf: 1,
    gameMode: "global-ban-pick",
    ...overrides
  });
  const base = `/api/series/${series.id}`;
  await browser.post(`${base}/game`, { blueTeam: "Alpha" });
  await browser.post(`${base}/game/ready`);
  return { id: series.id, base };
}

describe("concurrent mutations", { skip }, () => {
  test("simultaneous picks of the same hero: exactly one wins and nothing is lost", async () => {
    const me = app.browser();
    const { base } = await startedGame(me);
    const responses = await Promise.all(
      Array.from({ length: 12 }, () => me.post(`${base}/game/action`, { heroId: "h01" }))
    );
    assert.equal(responses.filter(response => response.status === 200).length, 1);
    assert.equal(responses.filter(response => response.status === 400).length, 11);
    const draft = (await me.get(base)).body.currentGame.draft;
    assert.equal(draft.actions.length, 1);
    assert.equal(draft.stepIndex, 1);
  });

  test("simultaneous distinct actions are serialised without lost updates", async () => {
    const me = app.browser();
    const { base } = await startedGame(me);
    const heroes = Array.from(
      { length: 12 },
      (_, index) => `h${String(index + 1).padStart(2, "0")}`
    );
    const responses = await Promise.all(
      heroes.map(heroId => me.post(`${base}/game/action`, { heroId }))
    );
    assert.ok(
      responses.every(response => response.status === 200),
      responses.map(response => response.status).join()
    );
    const draft = (await me.get(base)).body.currentGame.draft;
    assert.equal(draft.actions.length, 12);
    assert.equal(new Set(draft.actions.map(action => action.heroId)).size, 12);
    assert.equal(draft.stepIndex, 12);
  });

  test("a stale expectedVersion is refused with 409 and changes nothing", async () => {
    const me = app.browser();
    const { base } = await startedGame(me);
    const current = (await me.get(base)).body;
    const first = await me.post(`${base}/game/action`, {
      heroId: "h01",
      expectedVersion: current.version
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.version, current.version + 1);
    const stale = await me.post(`${base}/game/action`, {
      heroId: "h02",
      expectedVersion: current.version
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, "version_conflict");
    assert.equal((await me.get(base)).body.currentGame.draft.actions.length, 1);
  });

  test("two clients racing with the same expectedVersion: one wins, one gets 409", async () => {
    const me = app.browser();
    const { base } = await startedGame(me);
    const { version } = (await me.get(base)).body;
    const results = await Promise.all([
      me.post(`${base}/game/action`, { heroId: "h01", expectedVersion: version }),
      me.post(`${base}/game/action`, { heroId: "h02", expectedVersion: version })
    ]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  });

  test("tier list: concurrent edits on the same version cannot both succeed", async () => {
    const me = app.browser();
    const { body: list } = await me.post("/api/tier-lists", {
      name: "Race",
      tiers: [],
      unranked: ["h01"]
    });
    const results = await Promise.all(
      [1, 2, 3, 4].map(index =>
        me.put(`/api/tier-lists/${list.id}`, {
          name: `Edit ${index}`,
          tiers: [],
          unranked: ["h01"],
          expectedVersion: 0
        })
      )
    );
    assert.equal(results.filter(result => result.status === 200).length, 1);
    assert.equal(results.filter(result => result.status === 409).length, 3);
  });

  test("a read-only advance does not bump the version (no write amplification from polling)", async () => {
    const me = app.browser();
    const { base } = await startedGame(me);
    const before = (await me.get(base)).body.version;
    for (let index = 0; index < 3; index += 1) {
      assert.equal((await me.post(`${base}/game/advance`)).status, 200);
    }
    assert.equal((await me.get(base)).body.version, before);
  });
});

describe("server-side timer expiry", { skip }, () => {
  test("an expired pick is resolved by the server (auto-pick on the expected lane)", async () => {
    const me = app.browser();
    const { id, base } = await startedGame(me);
    await app.rewriteSeries(id, stored => {
      const draft = stored.currentGame.draft;
      draft.stepIndex = 4; // blue's first pick
      draft.deadline = Date.now() - 5000;
    });
    const response = await me.post(`${base}/game/advance`);
    assert.equal(response.status, 200);
    const draft = response.body.currentGame.draft;
    assert.equal(draft.picks.blue.length, 1);
    const action = draft.actions.at(-1);
    assert.equal(action.timedOut, true);
    assert.equal(action.autoPicked, true);
    assert.equal(draft.stepIndex, 5);
    assert.ok(draft.deadline > Date.now() - 1000, "the next step has a fresh server deadline");
  });

  test("a late manual pick cannot sneak in after expiry: the server auto-picks instead", async () => {
    const me = app.browser();
    const { id, base } = await startedGame(me);
    await app.rewriteSeries(id, stored => {
      stored.currentGame.draft.stepIndex = 4;
      stored.currentGame.draft.deadline = Date.now() - 1;
    });
    const response = await me.post(`${base}/game/action`, { heroId: "h30" });
    assert.equal(response.status, 200);
    const draft = response.body.currentGame.draft;
    assert.equal(draft.actions.at(-1).timedOut, true);
    assert.ok(!draft.picks.blue.includes("h30") || draft.actions.at(-1).heroId === "h30");
  });

  test("an expired ban is skipped by the server: empty slot, next step, fresh deadline", async () => {
    const me = app.browser();
    const { id, base } = await startedGame(me);
    await app.rewriteSeries(id, stored => {
      stored.currentGame.draft.deadline = Date.now() - 1;
    });
    const draft = (await me.post(`${base}/game/advance`)).body.currentGame.draft;
    assert.equal(draft.stepIndex, 1);
    assert.deepEqual(draft.bans.blue, []);
    assert.equal(draft.actions[0].skipped, true);
    assert.ok(draft.deadline > Date.now() - 1000);
    const next = (await me.post(`${base}/game/action`, { heroId: "h05" })).body.currentGame.draft;
    assert.deepEqual(next.bans.red, ["h05"]);
  });

  test("a skipped ban can be filled in later with the edit feature", async () => {
    const me = app.browser();
    const { id, base } = await startedGame(me);
    await app.rewriteSeries(id, stored => {
      stored.currentGame.draft.deadline = Date.now() - 1;
    });
    await me.post(`${base}/game/advance`);
    for (let index = 0; index < 19; index += 1) {
      await me.post(`${base}/game/action`, { heroId: `h${String(index + 1).padStart(2, "0")}` });
    }
    const draft = (await me.get(base)).body.currentGame.draft;
    assert.equal(draft.phase, "waiting");
    assert.equal(draft.bans.blue.length, 4);
    const edited = await me.patch(`${base}/game/draft`, {
      bans: { blue: ["h30", ...draft.bans.blue], red: draft.bans.red },
      picks: draft.picks
    });
    assert.equal(edited.status, 200, edited.text);
    assert.equal(edited.body.currentGame.draft.bans.blue[0], "h30");
  });

  test("responses carry the server time so clients can correct their clock", async () => {
    const before = Date.now();
    const body = (await app.browser().post("/api/series", CREATE_BODY)).body;
    assert.ok(body.serverTime >= before - 1000 && body.serverTime <= Date.now() + 1000);
  });
});
