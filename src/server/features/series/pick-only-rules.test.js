// The two rules without bans, as defined by the owner:
// - Free For All: ten picks, 1 Blue, 2 Red, 2 Blue, 2 Red, 2 Blue, 1 Red. A hero can be taken once
// in a game: never the same hero on both sides.
// - Classic: the same, but the enemy heroes are not seen (online), so both sides may end up with
// the same heroes.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import {
  PICK_ONLY_ORDER as clientOrder,
  PICK_ONLY_STEPS as clientSteps,
  stepsOf as clientStepsOf
} from "../../../shared/draft-model.js";
import {
  PICK_ONLY_ORDER,
  PICK_ONLY_STEPS,
  applyDraftAction,
  createDraft,
  markDraftReady,
  stepsOf
} from "./series-draft.js";
import { createSeries, startNextGame } from "./series.js";
import { playFullDraft, sampleHeroes, startTestServer } from "../../../testing/test-app.js";

const heroes = sampleHeroes(40).map(hero => ({ ...hero, availableGlobal: true }));
const id = number => `h${String(number).padStart(2, "0")}`;
const OWNER_ORDER = ["blue", "red", "red", "blue", "blue", "red", "red", "blue", "blue", "red"]; // 1 Blue, 2 Red, 2 Blue, 2 Red, 2 Blue, 1 Red
const started = gameMode => {
  const draft = createDraft({ blueTeam: "A", redTeam: "B", gameMode, picksOnly: true });
  markDraftReady(draft, null, { localStart: true, now: 0 });
  return draft;
};
const pick = (draft, heroId, at) => applyDraftAction(draft, heroId, { now: at * 1000, heroes });

for (const mode of ["free-for-all", "classic"]) {
  describe(`${mode}: the pick order`, () => {
    test("ten picks, 1 Blue, 2 Red, 2 Blue, 2 Red, 2 Blue, 1 Red, and no ban at all", () => {
      assert.deepEqual(PICK_ONLY_ORDER, OWNER_ORDER);
      assert.deepEqual(
        PICK_ONLY_STEPS.map(step => step.team),
        OWNER_ORDER
      );
      assert.ok(
        PICK_ONLY_STEPS.every(step => step.action === "pick"),
        "no ban step"
      );
      assert.equal(PICK_ONLY_STEPS.filter(step => step.team === "blue").length, 5);
      assert.equal(PICK_ONLY_STEPS.filter(step => step.team === "red").length, 5);
      const series = createSeries({ teamA: "A", teamB: "B", bestOf: 3, gameMode: mode });
      startNextGame(series);
      assert.equal(series.currentGame.draft.picksOnly, true);
      assert.deepEqual(stepsOf(series.currentGame.draft), PICK_ONLY_STEPS);
    });

    test("the browser has the same order as the server", () => {
      assert.deepEqual(clientOrder, PICK_ONLY_ORDER);
      assert.deepEqual(clientSteps, PICK_ONLY_STEPS);
      assert.deepEqual(clientStepsOf({ picksOnly: true }), PICK_ONLY_STEPS);
    });

    test("a whole draft is played in that order and ends with five heroes each", () => {
      const draft = started(mode);
      const taken = { blue: 0, red: 0 };
      const lists = { blue: [], red: [] };
      OWNER_ORDER.forEach((team, index) => {
        assert.equal(draft.phase, "draft");
        assert.equal(
          stepsOf(draft)[draft.stepIndex].team,
          team,
          `step ${index + 1} belongs to ${team}`
        );
        // Free For All: all ten heroes differ. Classic: each side takes the same five.
        const heroId = mode === "classic" ? id(taken[team] + 1) : id(index + 1);
        pick(draft, heroId, index + 1);
        lists[team].push(heroId);
        taken[team] += 1;
      });
      assert.deepEqual(
        draft.actions.map(action => action.team),
        OWNER_ORDER
      );
      assert.ok(draft.actions.every(action => action.action === "pick"));
      assert.deepEqual(
        [
          draft.picks.blue.length,
          draft.picks.red.length,
          draft.bans.blue.length + draft.bans.red.length
        ],
        [5, 5, 0]
      );
      assert.deepEqual(draft.picks, lists);
      assert.equal(draft.phase, "waiting", "the draft is over after the tenth pick");
    });
  });
}

describe("Free For All: never the same hero on both sides", () => {
  test("a hero taken by one side is refused to the other, whichever side picked it first", () => {
    const draft = started("free-for-all");
    pick(draft, id(1), 1); // blue
    assert.throws(() => pick(draft, id(1), 2), /unavailable/, "red cannot take blue's hero");
    pick(draft, id(2), 3); // red
    pick(draft, id(3), 4); // red
    assert.throws(() => pick(draft, id(2), 5), /unavailable/, "blue cannot take red's hero");
    assert.throws(() => pick(draft, id(3), 5), /unavailable/);
    assert.throws(() => pick(draft, id(1), 5), /unavailable/, "nor its own hero twice");
    pick(draft, id(4), 6); // blue
    assert.deepEqual(
      [draft.picks.blue, draft.picks.red],
      [
        [id(1), id(4)],
        [id(2), id(3)]
      ]
    );
    const everyone = [...draft.picks.blue, ...draft.picks.red];
    assert.equal(new Set(everyone).size, everyone.length, "no hero appears twice");
  });

  test("a refused pick changes nothing: same turn, same clock, nothing recorded", () => {
    const draft = started("free-for-all");
    pick(draft, id(1), 1);
    const before = JSON.stringify(draft);
    assert.throws(() => pick(draft, id(1), 2), /unavailable/);
    assert.equal(JSON.stringify(draft), before);
  });
});

describe("Classic: both sides may end up with the same heroes", () => {
  test("the same hero can be taken by each side, but not twice by one side", () => {
    const draft = started("classic");
    pick(draft, id(1), 1); // blue
    pick(draft, id(1), 2); // red takes the same hero
    pick(draft, id(2), 3); // red
    pick(draft, id(2), 4); // blue takes red's second hero
    pick(draft, id(3), 5); // blue
    assert.throws(() => pick(draft, id(1), 6), /unavailable/, "red already has it");
    pick(draft, id(3), 6); // red
    assert.deepEqual(draft.picks.blue, [id(1), id(2), id(3)]);
    assert.deepEqual(draft.picks.red, [id(1), id(2), id(3)]);
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("the same rules over the API", { skip }, () => {
  const startGame = async mode => {
    const me = app.browser();
    const { body: series } = await me.post("/api/series", {
      teamA: "Alpha",
      teamB: "Bravo",
      bestOf: 1,
      gameMode: mode
    });
    const base = `/api/series/${series.id}`;
    await me.post(`${base}/game`, { blueTeam: "Alpha" });
    await me.post(`${base}/game/ready`);
    return { me, base, id: series.id };
  };

  test("Free For All: the second side cannot take the first side's hero", async () => {
    const { me, base } = await startGame("free-for-all");
    assert.equal((await me.post(`${base}/game/action`, { heroId: id(1) })).status, 200); // blue
    const refused = await me.post(`${base}/game/action`, { heroId: id(1) }); // red, same hero
    assert.equal(refused.status, 400, refused.text);
    assert.equal(
      (await me.get(base)).body.currentGame.draft.stepIndex,
      1,
      "it is still red's turn"
    );
    assert.equal((await me.post(`${base}/game/action`, { heroId: id(2) })).status, 200);
  });

  test("Classic: the second side can take the same hero", async () => {
    const { me, base } = await startGame("classic");
    assert.equal((await me.post(`${base}/game/action`, { heroId: id(1) })).status, 200);
    const same = await me.post(`${base}/game/action`, { heroId: id(1) });
    assert.equal(same.status, 200, same.text);
  });

  for (const mode of ["free-for-all", "classic"]) {
    test(`${mode}: ten actions in the defined order, then the draft is over`, async () => {
      const { me, base, id: seriesId } = await startGame(mode);
      await playFullDraft(me, seriesId);
      const draft = (await me.get(base)).body.currentGame.draft;
      assert.deepEqual(
        draft.actions.map(action => action.team),
        OWNER_ORDER
      );
      assert.equal(draft.actions.length, 10);
      assert.equal(draft.phase, "waiting");
      assert.equal(draft.bans.blue.length + draft.bans.red.length, 0);
    });
  }
});
