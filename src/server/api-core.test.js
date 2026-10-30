// Functional behaviour that must survive the security work (ported from the phase-0 baseline
// tests).
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { CREATE_BODY, playFullDraft, startTestServer } from "../testing/test-app.js";

const app = await startTestServer();
after(async () => {
  await app?.close();
});

describe(
  "core API",
  { skip: app ? false : "MySQL is not reachable (docker compose up -d mysql)" },
  () => {
    test("health and roster endpoints respond", async () => {
      const health = await app.browser().get("/api/health");
      assert.deepEqual(health.body, { status: "ok", storage: "mysql" });
      const heroes = await app.browser().get("/api/heroes");
      assert.equal(heroes.body.heroes.length, 30);
      assert.equal(heroes.body.sourceUpdated, "20260925");
    });

    test("a local series can be created, read, listed and deleted by its owner", async () => {
      const me = app.browser();
      const created = await me.post("/api/series", CREATE_BODY);
      assert.equal(created.status, 200, created.text);
      assert.equal(created.body.teamA.name, "Alpha");
      assert.equal(created.body.winsRequired, 2);
      assert.equal(created.body.draftMode, "solo");
      assert.equal(created.body.viewer.role, "owner");
      assert.equal((await me.get(`/api/series/${created.body.id}`)).body.id, created.body.id);
      assert.ok(
        (await me.get("/api/series")).body.items.some(series => series.id === created.body.id)
      );
      assert.deepEqual((await me.delete(`/api/series/${created.body.id}`)).body, { deleted: true });
      assert.equal((await me.get(`/api/series/${created.body.id}`)).status, 404);
    });

    test("series creation rejects invalid formats and team names", async () => {
      const me = app.browser();
      const bestOf = await me.post("/api/series", { ...CREATE_BODY, bestOf: 0 });
      assert.equal(bestOf.status, 400);
      assert.match(bestOf.body.error, /Best-of/);
      const same = await me.post("/api/series", { ...CREATE_BODY, teamA: "Same", teamB: " same " });
      assert.equal(same.status, 400);
      assert.match(same.body.error, /different names/);
      const long = await me.post("/api/series", { ...CREATE_BODY, teamA: "x".repeat(41) });
      assert.equal(long.status, 400);
      assert.equal((await me.post("/api/series", { ...CREATE_BODY, teamA: "<b>" })).status, 400);
      assert.equal((await me.post("/api/series", { ...CREATE_BODY, teamA: 12 })).status, 400);
    });

    test("a full local game: ready check, 20 actions, wait, result", async () => {
      const me = app.browser();
      const { body: series } = await me.post("/api/series", { ...CREATE_BODY, bestOf: 1 });
      const base = `/api/series/${series.id}`;
      const game = await me.post(`${base}/game`, { blueTeam: "Alpha" });
      assert.equal(game.body.draft.started, false);
      assert.equal((await me.post(`${base}/game/action`, { heroId: "h01" })).status, 400);
      assert.equal((await me.post(`${base}/game/ready`)).body.currentGame.draft.started, true);
      await playFullDraft(me, series.id);
      const waiting = (await me.get(base)).body;
      assert.equal(waiting.currentGame.draft.phase, "waiting");
      assert.equal(waiting.currentGame.draft.picks.blue.length, 5);
      assert.equal(
        (await me.post(`${base}/game/complete`, { winner: "Alpha", durationSeconds: 1500 })).status,
        400
      );
      // The wait phase ends on the server clock: force the deadline into the past directly in the
      // database.
      await app.rewriteSeries(series.id, stored => {
        stored.currentGame.draft.deadline = Date.now() - 1;
      });
      assert.equal(
        (await me.post(`${base}/game/advance`)).body.currentGame.draft.phase,
        "complete"
      );
      const done = await me.post(`${base}/game/complete`, {
        winner: "Alpha",
        durationSeconds: 1500
      });
      assert.deepEqual(done.body.score, { teamA: 1, teamB: 0 });
      const final = (await me.get(base)).body;
      assert.equal(final.status, "complete");
      assert.equal(final.games[0].durationSeconds, 1500);
      const edited = await me.patch(`${base}/games/0`, { durationSeconds: 1600 });
      assert.equal(edited.body.games[0].durationSeconds, 1600);
      assert.equal((await me.patch(`${base}/games/0`, { durationSeconds: -5 })).status, 400);
      assert.equal((await me.patch(`${base}/games/9`, { durationSeconds: 5 })).status, 404);
    });

    test("a hero cannot be picked twice in one game", async () => {
      const me = app.browser();
      const { body: series } = await me.post("/api/series", {
        ...CREATE_BODY,
        bestOf: 1,
        teamA: "A1",
        teamB: "B1"
      });
      const base = `/api/series/${series.id}`;
      await me.post(`${base}/game`, { blueTeam: "A1" });
      await me.post(`${base}/game/ready`);
      assert.equal((await me.post(`${base}/game/action`, { heroId: "h01" })).status, 200);
      const again = await me.post(`${base}/game/action`, { heroId: "h01" });
      assert.equal(again.status, 400);
      assert.match(again.body.error, /unavailable/);
      assert.equal((await me.post(`${base}/game/action`, { heroId: "../etc" })).status, 400);
    });

    test("game timer start, pause and finish", async () => {
      const me = app.browser();
      const { body: series } = await me.post("/api/series", {
        ...CREATE_BODY,
        bestOf: 1,
        teamA: "A2",
        teamB: "B2"
      });
      const base = `/api/series/${series.id}`;
      await me.post(`${base}/game`, { blueTeam: "A2" });
      assert.equal((await me.post(`${base}/game/timer/start`)).status, 400);
      await me.post(`${base}/game/ready`);
      assert.equal((await me.post(`${base}/game/timer/start`)).body.status, "running");
      assert.equal((await me.post(`${base}/game/timer/pause`)).body.status, "paused");
      assert.equal((await me.post(`${base}/game/timer/finish`)).body.status, "finished");
      assert.equal((await me.post(`${base}/game/timer/explode`)).status, 404);
    });

    test("tier lists: create, update with version, list, delete", async () => {
      const me = app.browser();
      const created = await me.post("/api/tier-lists", {
        name: "Mine",
        tiers: [{ id: "t1", label: "S", heroes: ["h01"] }],
        unranked: ["h01", "h02"]
      });
      assert.equal(created.status, 200, created.text);
      assert.ok(
        !created.body.unranked.includes("h01"),
        "a hero appears once: first placement wins"
      );
      assert.ok(created.body.unranked.includes("h02"));
      assert.equal(created.body.version, 0);
      const updated = await me.put(`/api/tier-lists/${created.body.id}`, {
        ...created.body,
        name: "Renamed",
        expectedVersion: 0
      });
      assert.equal(updated.body.name, "Renamed");
      assert.equal(updated.body.version, 1);
      assert.equal(
        (
          await me.put(`/api/tier-lists/${created.body.id}`, {
            ...created.body,
            expectedVersion: 0
          })
        ).status,
        409
      );
      assert.ok(
        (await me.get("/api/tier-lists")).body.items.some(list => list.id === created.body.id)
      );
      assert.deepEqual((await me.delete(`/api/tier-lists/${created.body.id}`)).body, {
        deleted: true
      });
    });

    test("a client can no longer create a tier list under an id of its choosing", async () => {
      const me = app.browser();
      const response = await me.put("/api/tier-lists/11111111-1111-4111-8111-111111111111", {
        name: "x",
        tiers: [],
        unranked: []
      });
      assert.equal(response.status, 404);
    });

    test("series JSON can be exported and re-imported as a NEW series", async () => {
      const me = app.browser();
      const { body: series } = await me.post("/api/series", {
        ...CREATE_BODY,
        bestOf: 1,
        teamA: "Exp",
        teamB: "Imp"
      });
      const exported = (await me.get(`/api/series/${series.id}`)).body;
      const imported = await me.post("/api/series/import", exported);
      assert.equal(imported.status, 200, imported.text);
      assert.notEqual(imported.body.id, series.id, "the server generates the id");
      assert.equal(imported.body.teamA.name, "Exp");
    });

    test("unauthenticated users cannot create online series", async () => {
      const response = await app.browser().post("/api/online/series", { ...CREATE_BODY });
      assert.equal(response.status, 401);
      const guest = app.browser();
      await guest.post("/api/series", CREATE_BODY);
      assert.equal(
        (await guest.post("/api/online/series", CREATE_BODY)).status,
        401,
        "a guest identity is not enough for online play"
      );
    });

    test("auth status reports a signed-out visitor and a signed-in user", async () => {
      assert.equal((await app.browser().get("/api/auth/me")).body.user, null);
      const { browser, user } = await app.signIn("Zed");
      const me = (await browser.get("/api/auth/me")).body;
      assert.equal(me.user.id, user.id);
      assert.equal(me.user.isAdmin, false);
    });
  }
);
