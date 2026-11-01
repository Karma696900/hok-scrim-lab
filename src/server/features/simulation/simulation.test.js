// What the site keeps of the game simulation (the game runs on the bots server): what a finished game
// may say, the history of a signed-in player and the picture of the board.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { startTestServer } from "../../../testing/test-app.js";
import { parseGame } from "./simulation-domain.js";

const refuses = build => assert.throws(build, error => error.status === 400);

describe("what the page sends", () => {
  test("the end of a game is checked", () => {
    const game = {
      heroId: "131",
      side: "blue",
      lane: "Jungle",
      difficulty: "hard",
      grade: "S",
      score: 92,
      paused: false,
      won: true,
      duration: 1500
    };
    assert.deepEqual(parseGame(game, new Set(["131"])), game);
    refuses(() => parseGame({ ...game, grade: "Z" }, new Set(["131"])));
    refuses(() => parseGame({ ...game, score: 101 }, new Set(["131"])));
    refuses(() => parseGame(game, new Set(["132"])));
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});

describe(
  "the routes",
  { skip: app ? false : "MySQL is not reachable (docker compose up -d mysql)" },
  () => {
    test("only a signed-in player reads games, and only his own (the bots server writes them)", async () => {
      const visitor = app.browser();
      assert.equal((await visitor.get("/api/simulation/games")).status, 401);
      const ana = await app.signIn("SimAna");
      await app.store.addSimulationGame(ana.user.id, {
        heroId: (await app.store.readHeroes())[0].id,
        side: "blue",
        lane: "Clash Lane",
        difficulty: "normal",
        grade: "A",
        score: 84,
        paused: true,
        won: false,
        duration: 1320
      });
      const history = (await ana.browser.get("/api/simulation/games")).body.games;
      assert.equal(history.length, 1);
      assert.deepEqual([history[0].grade, history[0].paused, history[0].won], ["A", true, false]);
      const bob = await app.signIn("SimBob");
      assert.deepEqual((await bob.browser.get("/api/simulation/games")).body.games, []);
    });

    test("without the bots server, the games are closed and its addresses refuse everyone", async () => {
      const visitor = app.browser();
      const pool = await visitor.get("/api/simulation/pool");
      assert.equal(pool.status, 503);
      assert.equal(pool.body.code, "unavailable");
      const dana = await app.signIn("ClosedDana");
      const choice = { side: "blue", lane: "Jungle", difficulty: "normal" };
      assert.equal((await dana.browser.post("/api/simulation/ticket", choice)).status, 503);
      for (const path of ["/api/internal/api-keys/verify", "/api/internal/simulation/games"]) {
        const asked = await visitor.post(path, {}, { "x-bots-secret": "" });
        assert.equal(asked.status, 403, path);
      }
    });

    test("an administrator chooses the picture of the board among the maps of the training", async () => {
      const visitor = app.browser();
      assert.deepEqual((await visitor.get("/api/simulation/map")).body, { image: null });
      const admin = await app.signIn("SimAdmin", { admin: true });
      const map = await app.store.saveTrainingMap({
        name: "HoK S11",
        mime: "image/webp",
        data: Buffer.from("RIFF"),
        width: 1024,
        height: 1024,
        createdBy: admin.user.id
      });
      const player = await app.signIn("SimPlayer");
      assert.equal(
        (await player.browser.put("/api/simulation/map", { mapId: map.id })).status,
        403
      );
      const unknown = "00000000-0000-4000-8000-000000000000";
      assert.equal(
        (await admin.browser.put("/api/simulation/map", { mapId: unknown })).status,
        404
      );
      const chosen = await admin.browser.put("/api/simulation/map", { mapId: map.id });
      assert.equal(chosen.status, 200, chosen.text);
      assert.deepEqual((await visitor.get("/api/simulation/map")).body, {
        image: `/training-maps/${map.id}`
      });
      // a map deleted afterwards leaves the board drawn from the vector
      await app.store.deleteTrainingMap(map.id);
      assert.deepEqual((await visitor.get("/api/simulation/map")).body, { image: null });
      await admin.browser.put("/api/simulation/map", { mapId: null });
      assert.deepEqual((await visitor.get("/api/simulation/map")).body, { image: null });
    });
  }
);
