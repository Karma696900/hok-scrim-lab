// Tournaments: the lane each pick was played in (entered by an administrator after the five heroes
// of a side are chosen).
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { PICK_LANES } from "../series/series-draft.js";
import { parseTournamentSeries } from "./tournament-domain.js";
import { startTestServer } from "../../../testing/test-app.js";

const ids = Array.from({ length: 30 }, (_, index) => `h${String(index + 1).padStart(2, "0")}`);
const known = new Set(ids);
const side = start => ids.slice(start, start + 5);
const game = (overrides = {}) => ({
  blueTeam: "Alpha",
  redTeam: "Beta",
  winner: "Alpha",
  durationSeconds: 900,
  bans: { blue: [], red: [] },
  picks: { blue: side(0), red: side(5) },
  ...overrides
});
const series = (games = [game()]) => ({
  event: "KPL Autumn",
  stage: "Final",
  teamA: "Alpha",
  teamB: "Beta",
  bestOf: 3,
  playedOn: "2026-03-02",
  patch: "",
  sourceUrl: "https://example.test/vod",
  note: "",
  games
});
const parse = input => parseTournamentSeries(input, known);
const invalid = input =>
  assert.throws(
    () => parse(input),
    error => error.code === "invalid_body",
    JSON.stringify(input).slice(0, 90)
  );
const NONE = [null, null, null, null, null];

describe("the lanes of the picks (pure)", () => {
  test("a game without lanes still works: every pick is simply 'not said'", () => {
    const parsed = parse(series());
    assert.deepEqual(parsed.games[0].pickLanes, { blue: NONE, red: NONE });
  });

  test("each pick takes one of the five lanes, in the order of the picks", () => {
    const blue = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];
    const red = ["Roamer", null, "Mid Lane", null, "Clash Lane"]; // the first lanes can be given and the others left out
    const parsed = parse(series([game({ pickLanes: { blue, red } })]));
    assert.deepEqual(parsed.games[0].pickLanes, { blue, red });
  });

  test("a hero may be played in a lane its sheet does not list: any hero, any lane", () => {
    // nothing links the lanes of a hero to the lane it was given in a game
    const parsed = parse(
      series([
        game({
          pickLanes: {
            blue: ["Roamer", "Roamer".replace("Roamer", "Jungle"), null, null, null],
            red: NONE
          }
        })
      ])
    );
    assert.equal(parsed.games[0].pickLanes.blue[0], "Roamer");
  });

  test("a lane is given at most once per side, but both sides may use the same lanes", () => {
    invalid(
      series([game({ pickLanes: { blue: ["Jungle", "Jungle", null, null, null], red: NONE } })])
    );
    const both = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];
    assert.deepEqual(
      parse(series([game({ pickLanes: { blue: both, red: both } })])).games[0].pickLanes,
      { blue: both, red: both }
    );
  });

  test("an unknown lane, a list of the wrong size or the wrong type is refused", () => {
    invalid(series([game({ pickLanes: { blue: ["Top", null, null, null, null], red: NONE } })]));
    invalid(series([game({ pickLanes: { blue: ["Jungle"], red: NONE } })]));
    invalid(series([game({ pickLanes: { blue: "Jungle", red: NONE } })]));
    invalid(series([game({ pickLanes: { blue: [1, null, null, null, null], red: NONE } })]));
  });

  test("the five lanes are the ones of the draft", () => {
    assert.deepEqual(PICK_LANES, ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"]);
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("the lanes of the picks over the API", { skip }, () => {
  test("saved with the game, returned when it is read, changed by an edit, and absent from old games", async () => {
    const admin = await app.signIn("LaneAdmin", { admin: true });
    const lanes = {
      blue: ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"],
      red: ["Roamer", "Farm Lane", null, "Jungle", "Clash Lane"]
    };
    const created = await admin.browser.post(
      "/api/admin/tournaments",
      series([game({ pickLanes: lanes })])
    );
    assert.equal(created.status, 200, created.text);
    const id = created.body.id;
    const read = await admin.browser.get(`/api/admin/tournaments/${id}`);
    assert.deepEqual(read.body.games[0].pickLanes, lanes);
    assert.deepEqual(
      read.body.games[0].picks,
      { blue: side(0), red: side(5) },
      "the heroes are untouched"
    );

    const changed = { blue: ["Jungle", "Clash Lane", null, null, null], red: NONE };
    const edited = await admin.browser.put(
      `/api/admin/tournaments/${id}`,
      series([game({ pickLanes: changed })])
    );
    assert.equal(edited.status, 200, edited.text);
    assert.deepEqual(
      (await admin.browser.get(`/api/admin/tournaments/${id}`)).body.games[0].pickLanes,
      { blue: changed.blue, red: NONE }
    );

    const refused = await admin.browser.put(
      `/api/admin/tournaments/${id}`,
      series([game({ pickLanes: { blue: ["Jungle", "Jungle", null, null, null], red: NONE } })])
    );
    assert.equal(refused.status, 400);
    assert.deepEqual(
      (await admin.browser.get(`/api/admin/tournaments/${id}`)).body.games[0].pickLanes.blue,
      changed.blue,
      "a refused edit changes nothing"
    );

    // a game saved without lanes (the way it was before) reads back with none
    await app.store.pool.execute(
      "UPDATE competitive_games SET draft_json = ? WHERE series_id = ?",
      [JSON.stringify({ bans: { blue: [], red: [] }, picks: { blue: side(0), red: side(5) } }), id]
    );
    app.store.invalidateCompetitive?.();
    assert.deepEqual(
      (await admin.browser.get(`/api/admin/tournaments/${id}`)).body.games[0].pickLanes,
      { blue: NONE, red: NONE }
    );
  });

  test("only an administrator can send them", async () => {
    const player = await app.signIn("LanePlayer");
    assert.equal(
      (
        await player.browser.post(
          "/api/admin/tournaments",
          series([game({ pickLanes: { blue: NONE, red: NONE } })])
        )
      ).status,
      403
    );
  });
});
