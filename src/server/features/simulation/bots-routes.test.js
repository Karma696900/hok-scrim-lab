// The addresses shared with the bots server: the ticket of a live game for a signed-in player, and, behind the
// shared secret only, the check of an API key and the end of a game.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { startTestServer } from "../../../testing/test-app.js";

const SECRET = "a-shared-secret-that-is-long-enough-0123456789";
process.env.BOTS_URL = "https://bots.test";
process.env.BOTS_SHARED_SECRET = SECRET;
// the bots server's list of heroes, answered by a stub (no network in tests)
const asked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith("https://bots.test/")) {
    asked.push(String(url));
    return new Response(
      JSON.stringify({ heroes: [{ id: "105", name: "Hero", lanes: ["Jungle"] }] }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  }
  return realFetch(url, options);
};
const app = await startTestServer();
delete process.env.BOTS_URL;
delete process.env.BOTS_SHARED_SECRET;
after(async () => {
  globalThis.fetch = realFetch;
  await app?.close();
});

const bots = (secret = SECRET) => ({ "x-bots-secret": secret });
const GAME = {
  side: "red",
  lane: "Mid Lane",
  difficulty: "hard",
  grade: "S",
  score: 91,
  paused: false,
  won: true,
  duration: 1400
};

describe(
  "the bots server and the site",
  { skip: app ? false : "MySQL is not reachable (docker compose up -d mysql)" },
  () => {
    let heroId;
    before(async () => {
      heroId = (await app.store.readHeroes())[0].id;
    });

    test("a ticket needs a signed-in player and a valid choice, and points at the bots server", async () => {
      const choice = { side: "blue", lane: "Jungle", difficulty: "normal" };
      assert.equal((await app.browser().post("/api/simulation/ticket", choice)).status, 401);
      const ana = await app.signIn("TicketAna");
      assert.equal(
        (await ana.browser.post("/api/simulation/ticket", { ...choice, side: "green" })).status,
        400
      );
      const wrong = { ...choice, fixed: { "red:Mid Lane": "nobody" } };
      assert.equal((await ana.browser.post("/api/simulation/ticket", wrong)).status, 400);
      const twice = { ...choice, fixed: { "red:Mid Lane": heroId, "blue:Jungle": heroId } };
      assert.equal((await ana.browser.post("/api/simulation/ticket", twice)).status, 400);
      const fixed = { "red:Mid Lane": heroId, "blue:Jungle": "" };
      const answer = await ana.browser.post("/api/simulation/ticket", {
        ...choice,
        fixed,
        limit: 120
      });
      assert.equal(answer.status, 200, answer.text);
      const url = new URL(answer.body.url);
      assert.equal(`${url.protocol}//${url.host}${url.pathname}`, "wss://bots.test/v1/play");
      const payload = JSON.parse(
        Buffer.from(url.searchParams.get("ticket").split(".")[0], "base64url").toString("utf8")
      );
      assert.equal(payload.userId, ana.user.id);
      assert.deepEqual(payload.choice, {
        ...choice,
        fixed: [{ side: "red", lane: "Mid Lane", heroId }]
      });
      assert.equal(payload.limit, 120);
    });

    test("a ticket to watch ten bots keeps only the mode and the heroes chosen by hand", async () => {
      const ana = await app.signIn("WatchAna");
      const watch = { mode: "watch", side: "blue", fixed: { "red:Mid Lane": heroId } };
      const answer = await ana.browser.post("/api/simulation/ticket", watch);
      assert.equal(answer.status, 200, answer.text);
      const ticket = new URL(answer.body.url).searchParams.get("ticket");
      const payload = JSON.parse(Buffer.from(ticket.split(".")[0], "base64url").toString("utf8"));
      assert.deepEqual(payload.choice, {
        mode: "watch",
        fixed: [{ side: "red", lane: "Mid Lane", heroId }]
      });
      const spy = { mode: "spy", side: "blue", lane: "Jungle", difficulty: "normal" };
      assert.equal((await ana.browser.post("/api/simulation/ticket", spy)).status, 400);
      const wrong = { mode: "watch", fixed: { "red:Mid Lane": "nobody" } };
      assert.equal((await ana.browser.post("/api/simulation/ticket", wrong)).status, 400);
    });

    test("the heroes the bots can play come from the bots server", async () => {
      const answer = await app.browser().get("/api/simulation/pool");
      assert.equal(answer.status, 200, answer.text);
      assert.deepEqual(answer.body.heroes, [{ id: "105", name: "Hero", lanes: ["Jungle"] }]);
      assert.equal(asked.length, 1);
      await app.browser().get("/api/simulation/pool");
      assert.equal(asked.length, 1, "kept for a while");
    });

    test("the internal addresses refuse a missing or wrong secret", async () => {
      const visitor = app.browser();
      for (const path of ["/api/internal/api-keys/verify", "/api/internal/simulation/games"]) {
        assert.equal((await visitor.post(path, {})).status, 403, path);
        assert.equal((await visitor.post(path, {}, bots(`${SECRET}x`))).status, 403, path);
      }
    });

    test("a live key says whose it is and its scopes; a revoked or unknown one is 404", async () => {
      const bob = await app.signIn("KeyBob");
      const made = await bob.browser.post("/api/me/api-keys", {
        name: "bots",
        scopes: ["simulation"]
      });
      assert.equal(made.status, 200, made.text);
      const visitor = app.browser();
      const known = await visitor.post(
        "/api/internal/api-keys/verify",
        { key: made.body.secret },
        bots()
      );
      assert.equal(known.status, 200, known.text);
      assert.equal(known.body.userId, bob.user.id);
      assert.deepEqual(known.body.scopes, ["simulation"]);
      assert.equal(typeof known.body.keyId, "string");
      const unknown = await visitor.post(
        "/api/internal/api-keys/verify",
        { key: "hok_nothing_like_it" },
        bots()
      );
      assert.equal(unknown.status, 404);
      await bob.browser.delete(`/api/me/api-keys/${known.body.keyId}`);
      assert.equal(
        (await visitor.post("/api/internal/api-keys/verify", { key: made.body.secret }, bots()))
          .status,
        404
      );
    });

    test("the end of a game is kept for its player, and the page cannot send one itself", async () => {
      const cleo = await app.signIn("GameCleo");
      const visitor = app.browser();
      const kept = await visitor.post(
        "/api/internal/simulation/games",
        { userId: cleo.user.id, game: { ...GAME, heroId } },
        bots()
      );
      assert.equal(kept.status, 201, kept.text);
      const history = (await cleo.browser.get("/api/simulation/games")).body.games;
      assert.equal(history.length, 1);
      assert.deepEqual([history[0].heroId, history[0].grade, history[0].won], [heroId, "S", true]);
      const nobody = "00000000-0000-4000-8000-000000000000";
      assert.equal(
        (
          await visitor.post(
            "/api/internal/simulation/games",
            { userId: nobody, game: { ...GAME, heroId } },
            bots()
          )
        ).status,
        404
      );
      assert.equal(
        (
          await visitor.post(
            "/api/internal/simulation/games",
            { userId: cleo.user.id, game: { ...GAME, heroId, score: 900 } },
            bots()
          )
        ).status,
        400
      );
      assert.equal(
        (await cleo.browser.post("/api/simulation/games", { ...GAME, heroId })).status,
        404
      );
    });
  }
);
