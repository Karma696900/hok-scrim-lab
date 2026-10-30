import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { banSlots } from "../../../shared/draft-model.js";
import {
  advanceDraft,
  applyDraftAction,
  createDraft,
  DRAFT_STEPS,
  markDraftReady,
  PICK_LANES,
  startDraftTimer
} from "./series-draft.js";

test("competitive draft has the exact 20-step ban and pick order", () => {
  assert.equal(DRAFT_STEPS.length, 20);
  assert.deepEqual(DRAFT_STEPS.slice(0, 4), [
    { team: "blue", action: "ban" },
    { team: "red", action: "ban" },
    { team: "blue", action: "ban" },
    { team: "red", action: "ban" }
  ]);

  const counts = DRAFT_STEPS.reduce(
    (result, step) => {
      result[step.action][step.team] += 1;
      return result;
    },
    { ban: { blue: 0, red: 0 }, pick: { blue: 0, red: 0 } }
  );

  assert.deepEqual(counts, { ban: { blue: 5, red: 5 }, pick: { blue: 5, red: 5 } });
});

test("picked and banned heroes cannot be selected again in the same game", () => {
  const draft = createDraft({ blueTeam: "A", redTeam: "B" });
  startDraftTimer(draft, 1000);
  applyDraftAction(draft, "banned", { now: 1001 });
  assert.throws(() => applyDraftAction(draft, "banned", { now: 1002 }), /unavailable/);

  applyDraftAction(draft, "picked", { now: 1002 });
  for (const heroId of ["red-ban-2", "blue-ban-2", "red-pick-1"]) {
    applyDraftAction(draft, heroId, { now: 1003 });
  }
  assert.throws(() => applyDraftAction(draft, "picked", { now: 1004 }), /unavailable/);
});

test("draft team usage is enforced only in Global Ban & Pick", () => {
  const draft = createDraft({ blueTeam: "A", redTeam: "B", gameMode: "global-ban-pick" });
  draft.stepIndex = 4;
  startDraftTimer(draft, 1000);
  assert.throws(
    () => applyDraftAction(draft, "hero-x", { now: 1001, teamAUsed: ["hero-x"] }),
    /earlier game/
  );

  const freeDraft = createDraft({ blueTeam: "A", redTeam: "B" });
  freeDraft.stepIndex = 4;
  startDraftTimer(freeDraft, 1000);
  assert.doesNotThrow(() =>
    applyDraftAction(freeDraft, "hero-x", { now: 1001, teamAUsed: ["hero-x"] })
  );
});

test("Global Ban & Pick locks every Flowborn form after a team picks any form", () => {
  const draft = createDraft({ blueTeam: "A", redTeam: "B", gameMode: "global-ban-pick" });
  draft.stepIndex = 4;
  startDraftTimer(draft, 1000);
  const flowbornIds = ["581", "582", "583", "584", "585"];

  assert.throws(
    () =>
      applyDraftAction(draft, "584", {
        now: 1001,
        teamAUsed: ["581"],
        flowbornIds
      }),
    /Flowborn once/
  );
  assert.doesNotThrow(() =>
    applyDraftAction(draft, "584", {
      now: 1001,
      teamBUsed: ["581"],
      flowbornIds
    })
  );
});

test("each action advances exactly once and the final waiting phase completes", () => {
  const draft = createDraft({ blueTeam: "A", redTeam: "B" });
  startDraftTimer(draft, 1000);

  for (let index = 0; index < DRAFT_STEPS.length; index += 1) {
    applyDraftAction(draft, `hero-${index}`, { now: 1001 + index });
    assert.equal(draft.stepIndex, index + 1);
    assert.equal(draft.actions.length, index + 1);
  }

  assert.equal(draft.phase, "waiting");
  assert.equal(draft.bans.blue.length, 5);
  assert.equal(draft.bans.red.length, 5);
  assert.equal(draft.picks.blue.length, 5);
  assert.equal(draft.picks.red.length, 5);
  advanceDraft(draft, draft.deadline);
  assert.equal(draft.phase, "complete");
});

test("a ban that times out is skipped: the slot stays empty and the draft goes on", () => {
  const draft = createDraft({ blueTeam: "A", redTeam: "B" });
  startDraftTimer(draft, 1000);
  advanceDraft(draft, 31000);
  assert.equal(draft.stepIndex, 1, "the draft moved on to Red's ban");
  assert.deepEqual(draft.bans.blue, [], "nobody was banned");
  assert.deepEqual(
    draft.actions.map(action => [
      action.team,
      action.action,
      action.heroId,
      action.skipped,
      action.timedOut
    ]),
    [["blue", "ban", null, true, true]]
  );
  assert.equal(draft.deadline, 31000 + 30 * 1000, "the next step has a fresh deadline");
  assert.equal(
    advanceDraft(draft, 31000).stepIndex,
    1,
    "resolving the same expiry twice does nothing"
  );
  applyDraftAction(draft, "red-ban", { now: 32000 });
  applyDraftAction(draft, "blue-ban-2", { now: 33000 });
  assert.deepEqual(draft.bans.blue, ["blue-ban-2"]);
});

test("the skipped ban keeps its slot: the next ban of that side takes the next slot", () => {
  const draft = createDraft({ blueTeam: "A", redTeam: "B" });
  startDraftTimer(draft, 1000);
  advanceDraft(draft, 31000);
  applyDraftAction(draft, "r1", { now: 32000 });
  applyDraftAction(draft, "b2", { now: 33000 });
  assert.deepEqual(banSlots(draft, "blue"), [null, "b2", null, null, null]);
  assert.deepEqual(banSlots(draft, "red"), ["r1", null, null, null, null]);
});

test("a late click on an expired ban does not sneak in: the ban is skipped", () => {
  const draft = createDraft({ blueTeam: "A", redTeam: "B" });
  startDraftTimer(draft, 1000);
  applyDraftAction(draft, "too-late", { now: 31001 });
  assert.deepEqual(draft.bans.blue, []);
  assert.equal(draft.stepIndex, 1);
});

test("an expired pick auto-resolves once and resets its timer", () => {
  const draft = createDraft({ blueTeam: "A", redTeam: "B" });
  draft.stepIndex = 4;
  startDraftTimer(draft, 1000);
  advanceDraft(draft, 31000);
  assert.equal(draft.stepIndex, 5);
  assert.equal(draft.actions.length, 1);
  assert.equal(draft.actions[0].timedOut, true);
  assert.equal(draft.deadline, 61000);
});

test("picks keep fixed lane assignments while later lane priority swaps invisibly", () => {
  const draft = createDraft({ blueTeam: "A", redTeam: "B" });
  const heroes = [
    { id: "jungle-hero", lanes: ["Jungle"], availableGlobal: true },
    { id: "mid-hero", lanes: ["Mid Lane"], availableGlobal: true },
    { id: "clash-hero", lanes: ["Clash Lane"], availableGlobal: true }
  ];
  draft.stepIndex = 4;
  startDraftTimer(draft, 1000);
  applyDraftAction(draft, "jungle-hero", { now: 1001, heroes });
  assert.deepEqual(draft.pickLaneOrder.blue, [
    "Jungle",
    "Clash Lane",
    "Mid Lane",
    "Farm Lane",
    "Roamer"
  ]);
  assert.deepEqual(draft.pickAssignments.blue, [{ heroId: "jungle-hero", lane: "Jungle" }]);

  draft.stepIndex = 7;
  applyDraftAction(draft, "mid-hero", { now: 1002, heroes });
  assert.deepEqual(draft.pickLaneOrder.blue, [
    "Jungle",
    "Mid Lane",
    "Clash Lane",
    "Farm Lane",
    "Roamer"
  ]);
  assert.deepEqual(draft.pickAssignments.blue[1], { heroId: "mid-hero", lane: "Mid Lane" });
  assert.equal(PICK_LANES[0], "Clash Lane");
});

test("a manual pick is allowed even when its role is not a remaining lane", () => {
  const draft = createDraft({ blueTeam: "A", redTeam: "B" });
  draft.stepIndex = 4;
  startDraftTimer(draft, 1000);
  assert.doesNotThrow(() =>
    applyDraftAction(draft, "unassigned-hero", {
      now: 1001,
      heroes: [{ id: "unassigned-hero", lanes: [], availableGlobal: true }]
    })
  );
  assert.deepEqual(draft.picks.blue, ["unassigned-hero"]);
  assert.deepEqual(draft.pickLaneOrder.blue, PICK_LANES);
});

test("pick timeout auto-selects only an available hero on the expected lane", () => {
  const draft = createDraft({ blueTeam: "A", redTeam: "B" });
  draft.stepIndex = 4;
  startDraftTimer(draft, 1000);
  const heroes = [
    { id: "clash-available", lanes: ["Clash Lane"], availableGlobal: true },
    { id: "clash-unavailable", lanes: ["Clash Lane"], availableGlobal: false },
    { id: "jungle-available", lanes: ["Jungle"], availableGlobal: true }
  ];

  advanceDraft(draft, 31000, { heroes, random: () => 0 });
  assert.deepEqual(draft.picks.blue, ["clash-available"]);
  assert.deepEqual(draft.pickAssignments.blue, [{ heroId: "clash-available", lane: "Clash Lane" }]);
  assert.equal(draft.actions[0].autoPicked, true);
});

test("online draft clock starts only after both sides confirm readiness", () => {
  const draft = createDraft({ blueTeam: "A", redTeam: "B" });
  assert.equal(draft.deadline, null);
  markDraftReady(draft, "blue", { now: 1000 });
  assert.equal(draft.started, false);
  assert.equal(draft.deadline, null);
  assert.equal(draft.ready.blue, true);
  assert.equal(draft.ready.red, false);

  markDraftReady(draft, "red", { now: 2000 });
  assert.equal(draft.started, true);
  assert.equal(draft.deadline, 32000);
});

test("a local start confirms both sides and starts one shared clock", () => {
  const draft = createDraft({ blueTeam: "A", redTeam: "B" });
  markDraftReady(draft, null, { now: 500, localStart: true });
  assert.deepEqual(draft.ready, { blue: true, red: true });
  assert.equal(draft.started, true);
  assert.equal(draft.deadline, 30500);
});

describe("Free For All: picks only", () => {
  test("a picks-only draft has the ten picks in the usual order and no ban", async () => {
    const { PICK_ONLY_STEPS, stepsOf } = await import("./series-draft.js");
    assert.equal(PICK_ONLY_STEPS.length, 10);
    assert.deepEqual(
      PICK_ONLY_STEPS.map(step => step.team),
      ["blue", "red", "red", "blue", "blue", "red", "red", "blue", "blue", "red"]
    );
    assert.ok(PICK_ONLY_STEPS.every(step => step.action === "pick"));
    assert.equal(stepsOf({}).length, 20, "a draft saved before this rule keeps its 20 actions");
    assert.equal(stepsOf({ picksOnly: true }).length, 10);
  });

  test("it plays through ten picks, then waits; the clock and the auto-pick work as before", () => {
    const heroes = Array.from({ length: 30 }, (_, index) => ({
      id: `h${index}`,
      lanes: [PICK_LANES[index % 5]],
      availableGlobal: true
    }));
    const draft = createDraft({ blueTeam: "A", redTeam: "B", picksOnly: true });
    assert.equal(draft.picksOnly, true);
    markDraftReady(draft, null, { localStart: true, now: 0 });
    let now = 0;
    for (let index = 0; index < 4; index += 1) {
      applyDraftAction(draft, `h${index}`, { now: (now += 1000), heroes });
    }
    assert.deepEqual(
      [draft.picks.blue.length, draft.picks.red.length, draft.bans.blue.length],
      [2, 2, 0],
      "the first four actions are picks"
    );
    now += 31_000; // the clock runs out: the auto-pick takes a hero
    advanceDraft(draft, now, { heroes, random: () => 0 });
    assert.equal(draft.actions.at(-1).autoPicked, true);
    for (let index = 10; index < 15; index += 1) {
      if (draft.phase !== "draft") {
        break;
      }
      applyDraftAction(draft, `h${index}`, { now: (now += 1000), heroes });
    }
    assert.equal(draft.phase, "waiting");
    assert.deepEqual(
      [
        draft.picks.blue.length,
        draft.picks.red.length,
        draft.bans.blue.length + draft.bans.red.length
      ],
      [5, 5, 0]
    );
    assert.equal(draft.actions.length, 10);
  });

  test("the drafts of a Free For All series are picks only, those of Global Ban & Pick keep their bans", async () => {
    const { createSeries, startNextGame } = await import("./series.js");
    const free = createSeries({ teamA: "A", teamB: "B", bestOf: 3, gameMode: "free-for-all" });
    startNextGame(free);
    assert.equal(free.currentGame.draft.picksOnly, true);
    const global = createSeries({ teamA: "A", teamB: "B", bestOf: 3, gameMode: "global-ban-pick" });
    startNextGame(global);
    assert.equal(global.currentGame.draft.picksOnly, undefined);
  });
});
